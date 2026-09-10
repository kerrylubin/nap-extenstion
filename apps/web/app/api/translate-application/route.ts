import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { updateApplication } from "@/lib/storage";
import { generateLetterPDF } from "@/lib/pdf-generator";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser(req);
    const { applicationId, targetLanguage, jobTitle, company, emailBody, letterText } = await req.json();

    if (!targetLanguage || (targetLanguage !== "nl" && targetLanguage !== "en")) {
      return NextResponse.json({ error: "Invalid targetLanguage. Must be 'nl' or 'en'." }, { status: 400 });
    }

    const langName = targetLanguage === "nl" ? "Dutch" : "English";

    // Translate Email Body if present
    let translatedEmailBody = emailBody ?? "";
    if (emailBody && emailBody.trim()) {
      const emailMsg = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        temperature: 0.3,
        messages: [{
          role: "user",
          content: `Translate this job application email body into ${langName}.
Keep all names, company names, contact details, email addresses, phone numbers, and structural sign-offs intact.
Output plain text only — no markdown, no quotes, no subject line.

Email text:
${emailBody}`,
        }],
      });
      translatedEmailBody = (emailMsg.content[0] as { type: string; text: string }).text.trim();
    }

    // Translate Motivation Letter Text if present
    let translatedLetterText = letterText ?? "";
    if (letterText && letterText.trim()) {
      const letterMsg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 900,
        temperature: 0.3,
        messages: [{
          role: "user",
          content: `Translate this formal job motivation letter into ${langName}.
Keep the exact same structural layout, paragraph organization, candidate name, address, contact details, and dates.
Translate standard phrases appropriately for a formal ${langName} cover letter (e.g. "Betreft:" -> "Re:", "Met vriendelijke groet," -> "Kind regards," or vice versa).
Output plain text only — no markdown (no **, no ---, no #).

Motivation letter:
${letterText}`,
        }],
      });
      translatedLetterText = (letterMsg.content[0] as { type: string; text: string }).text.trim();
    }

    // Generate new PDF
    let letterBase64: string | undefined;
    let letterFilename: string | undefined;

    if (translatedLetterText) {
      const safeCompany = (company || "Company").replace(/_/g, " ");
      const safeJobTitle = (jobTitle || "Job").replace(/_/g, " ");
      letterFilename = targetLanguage === "en"
        ? `${safeJobTitle} Motivational letter.pdf`
        : `${safeCompany} Motivatiebrief.pdf`;

      const letterBytes = await generateLetterPDF({ letterText: translatedLetterText, company: safeCompany, filename: letterFilename });
      letterBase64 = Buffer.from(letterBytes).toString("base64");
    }

    // Update DB if applicationId is provided
    let updatedApp = null;
    if (applicationId) {
      updatedApp = await updateApplication(supabase, user.id, applicationId, {
        language: targetLanguage,
        emailBody: translatedEmailBody,
        letterText: translatedLetterText,
        ...(letterBase64 && { letterBase64 }),
        ...(letterFilename && { letterPath: letterFilename }),
      });
    }

    return NextResponse.json({
      success: true,
      language: targetLanguage,
      emailBody: translatedEmailBody,
      letterText: translatedLetterText,
      letterBase64,
      letterFilename,
      updatedApp,
    });
  } catch (err) {
    console.error("translate-application error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
