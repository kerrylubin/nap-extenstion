import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { requireUser } from "@/lib/supabase/server";
import { getCVForLanguage, downloadCVBuffer } from "@/lib/storage";
import Anthropic from "@anthropic-ai/sdk";
import { calculateCost } from "@/lib/anthropic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function GET() {
  try {
    const { supabase, user } = await requireUser();

    const cv = await getCVForLanguage(supabase, user.id, "nl") ??
               await getCVForLanguage(supabase, user.id, "en");

    if (!cv) {
      return NextResponse.json({ suggestions: [], hasCv: false });
    }

    const buffer = await downloadCVBuffer(supabase, cv.storagePath);
    let cvText = "";
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      cvText = result.text.slice(0, 3000);
      await parser.destroy();
    } catch {
      return NextResponse.json({ suggestions: [] });
    }

    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `Based on this CV, return 6 short job search keywords or job titles that this person should search for on a job board. Return ONLY a JSON array of strings, no markdown, no explanation.

CV:
${cvText}`,
      }],
    });

    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const clean = text.replace(/```json|```/g, "").trim();
    const suggestions = JSON.parse(clean);

    const usage = calculateCost("claude-haiku-4-5-20251001", msg.usage.input_tokens, msg.usage.output_tokens);
    const suggestionUsage = {
      tokensUsed: usage.inputTokens + usage.outputTokens,
      costUsd: usage.costUsd,
    };

    return NextResponse.json({
      suggestions: Array.isArray(suggestions) ? suggestions.slice(0, 6) : [],
      hasCv: true,
      usage: suggestionUsage,
    });
  } catch {
    return NextResponse.json({ suggestions: [], hasCv: false });
  }
}
