import { NextRequest, NextResponse } from "next/server";
import { scrapeJobUrl } from "@/lib/scraper";
import {
  extractJobInfo,
  scoreMatch,
  generateEmailBody,
  generateMotivationLetter,
  UserProfile,
  calculateCost,
  TokenUsage,
} from "@/lib/anthropic";
import { generateLetterPDF } from "@/lib/pdf-generator";
import { requireUser } from "@/lib/supabase/server";
import {
  getCVForLanguage,
  downloadCVBuffer,
  getProfile,
} from "@/lib/storage";
import { ProcessJobRequest, ProcessJobResult } from "@/types";
import { getDefaultEmailTemplate } from "@/lib/defaults";
import { PDFParse } from "pdf-parse";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

async function extractCVText(buffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text.slice(0, 4000);
  } catch {
    return "";
  }
}

async function translateCVText(text: string, targetLanguage: string): Promise<{ text: string; usage: TokenUsage }> {
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `Translate this CV content into ${targetLanguage}. Keep names, company names, and dates as-is. Return plain text only.\n\n${text}`,
    }],
  });
  const usage = calculateCost("claude-haiku-4-5-20251001", msg.usage.input_tokens, msg.usage.output_tokens);
  return {
    text: (msg.content[0] as { type: string; text: string }).text.trim(),
    usage,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    const body = await req.json();
    const { jobUrl, rawJobText, hobbies } = body;

    if (!jobUrl && !rawJobText) {
      return NextResponse.json({ error: "Provide a jobUrl or rawJobText." }, { status: 400 });
    }

    // Step 1: Get job description
    let jobDescription = rawJobText ?? "";
    if (jobUrl && !rawJobText) {
      try {
        jobDescription = await scrapeJobUrl(jobUrl);
      } catch (scrapeErr) {
        return NextResponse.json(
          { error: `Scrape failed: ${scrapeErr instanceof Error ? scrapeErr.message : String(scrapeErr)}` },
          { status: 422 }
        );
      }
    }

    // Step 2: Extract info + score (parallel)
    const [infoResult, profile] = await Promise.all([
      extractJobInfo(jobDescription),
      getProfile(supabase, user.id),
    ]);

    const userProfile: UserProfile = {
      name: profile?.name || user.email?.split("@")[0] || "Applicant",
      email: profile?.email || user.email || "",
      phone: profile?.phone,
      address: profile?.address,
      hobbies: hobbies || profile?.hobbies,
    };
    const { jobTitle, company, recruiterEmail, recruiterPhone, contactName, language, usage: infoUsage } = infoResult;

    // Step 3: Resolve CV
    const cv = await getCVForLanguage(supabase, user.id, language);

    // Build CV text for AI prompts
    let cvText: string | undefined;
    let cvBase64: string | undefined;
    let translationUsage: TokenUsage | undefined;

    if (cv) {
      const cvBuffer = await downloadCVBuffer(supabase, cv.storagePath);
      cvBase64 = cvBuffer.toString("base64");
      const rawText = await extractCVText(cvBuffer);
      // Translate if the CV language doesn't match the job language
      if (cv.language !== language && rawText) {
        const transRes = await translateCVText(rawText, language === "nl" ? "Dutch" : "English");
        cvText = transRes.text;
        translationUsage = transRes.usage;
      } else {
        cvText = rawText;
      }
    }

    // Step 4: Generate email + letter + score (parallel, all have cvText now)
    const [emailResult, letterResult, scoreResult] = await Promise.all([
      generateEmailBody({ jobTitle, company, contactName, language, masterTemplate: profile?.masterEmailTemplate ?? getDefaultEmailTemplate(userProfile), userProfile }),
      generateMotivationLetter({ jobTitle, company, contactName, jobDescription, language, cvText, masterTemplate: profile?.masterLetterTemplate, userProfile }),
      scoreMatch(jobDescription, cvText),
    ]);

    const emailBody = emailResult.emailBody;
    const letterText = letterResult.letterText;
    const matchScore = scoreResult.score;

    // Sum usage and cost
    const totalInput =
      (infoUsage?.inputTokens ?? 0) +
      (translationUsage?.inputTokens ?? 0) +
      (emailResult.usage?.inputTokens ?? 0) +
      (letterResult.usage?.inputTokens ?? 0) +
      (scoreResult.usage?.inputTokens ?? 0);

    const totalOutput =
      (infoUsage?.outputTokens ?? 0) +
      (translationUsage?.outputTokens ?? 0) +
      (emailResult.usage?.outputTokens ?? 0) +
      (letterResult.usage?.outputTokens ?? 0) +
      (scoreResult.usage?.outputTokens ?? 0);

    const totalCost =
      (infoUsage?.costUsd ?? 0) +
      (translationUsage?.costUsd ?? 0) +
      (emailResult.usage?.costUsd ?? 0) +
      (letterResult.usage?.costUsd ?? 0) +
      (scoreResult.usage?.costUsd ?? 0);

    // Step 5: Generate PDF
    const safeName = userProfile.name.replace(/_/g, " ");
    const cleanJobTitle = jobTitle.replace(/_/g, " ");
    const cleanCompany = company.replace(/_/g, " ");
    const letterFilename = language === "en"
      ? `${safeName} ${cleanJobTitle} Motivational letter.pdf`
      : `${safeName} ${cleanCompany} Motivatiebrief.pdf`;

    const letterBytes = await generateLetterPDF({ letterText, company, filename: letterFilename });
    const letterBase64 = Buffer.from(letterBytes).toString("base64");

    const result: ProcessJobResult = {
      jobTitle,
      company,
      jobUrl: jobUrl ?? undefined,
      recruiterEmail,
      recruiterPhone,
      contactName,
      language,
      matchScore,
      emailBody,
      jobDescription,
      letterBase64,
      letterFilename,
      letterText,
      tokensUsed: totalInput + totalOutput,
      costUsd: totalCost,
      // Pass through CV base64 for the send step
      ...(cvBase64 && { cvBase64 }),
    } as ProcessJobResult & { cvBase64?: string };

    return NextResponse.json(result);
  } catch (err) {
    console.error("process-job error:", err);
    return NextResponse.json({ error: "Internal server error: " + String(err) }, { status: 500 });
  }
}
