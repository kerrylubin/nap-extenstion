import { NextRequest, NextResponse } from "next/server";
import { generateMotivationLetter, UserProfile, calculateCost, TokenUsage } from "@/lib/anthropic";
import { generateLetterPDF } from "@/lib/pdf-generator";
import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/storage";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    const { jobTitle, company, contactName, jobDescription, language, prompt, currentLetter, applicationId, hobbies } = await req.json();

    const profile = await getProfile(supabase, user.id);
    const userProfile: UserProfile = {
      name: profile?.name || user.email?.split("@")[0] || "Applicant",
      email: profile?.email || user.email || "",
      phone: profile?.phone,
      address: profile?.address,
      hobbies: hobbies || profile?.hobbies,
    };

    let letterText: string;
    let runUsage: TokenUsage;

    if (prompt && currentLetter) {
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 900,
        messages: [{
          role: "user",
          content: `Here is a motivation letter:\n\n${currentLetter}\n\nUser instruction: ${prompt}\n\nRewrite the letter applying this instruction. Keep the same structure and length. Return plain text only — no markdown, no **, no ---.`,
        }],
      });
      letterText = (msg.content[0] as { type: string; text: string }).text.trim();
      runUsage = calculateCost("claude-sonnet-4-6", msg.usage.input_tokens, msg.usage.output_tokens);
    } else {
      const result = await generateMotivationLetter({
        jobTitle,
        company,
        contactName,
        jobDescription,
        language,
        userProfile,
        masterTemplate: profile?.masterLetterTemplate,
      });
      letterText = result.letterText;
      runUsage = result.usage ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    }

    const safeName = userProfile.name.replace(/_/g, " ");
    const cleanJobTitle = jobTitle.replace(/_/g, " ");
    const cleanCompany = company.replace(/_/g, " ");
    const letterFilename = language === "en"
      ? `${safeName} ${cleanJobTitle} Motivational letter.pdf`
      : `${safeName} ${cleanCompany} Motivatiebrief.pdf`;

    const letterBytes = await generateLetterPDF({ letterText, company, filename: letterFilename });
    const letterBase64 = Buffer.from(letterBytes).toString("base64");

    // Dynamic cost accumulation if app ID is provided
    let tokensUsed = runUsage.inputTokens + runUsage.outputTokens;
    let costUsd = runUsage.costUsd;

    if (applicationId) {
      try {
        const { data: appData, error: fetchError } = await supabase
          .from("applications")
          .select("tokens_used, cost_usd")
          .eq("id", applicationId)
          .eq("user_id", user.id)
          .single();
        
        if (appData && !fetchError) {
          const newTokens = (appData.tokens_used ?? 0) + tokensUsed;
          const newCost = parseFloat(appData.cost_usd ?? "0") + costUsd;
          const { error: updateError } = await supabase
            .from("applications")
            .update({ tokens_used: newTokens, cost_usd: newCost })
            .eq("id", applicationId)
            .eq("user_id", user.id);
          
          if (!updateError) {
            tokensUsed = newTokens;
            costUsd = newCost;
          }
        }
      } catch (e) {
        console.error("[regenerate-letter] Failed to update application usage in DB:", e);
      }
    }

    return NextResponse.json({ letterText, letterBase64, letterFilename, tokensUsed, costUsd });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
