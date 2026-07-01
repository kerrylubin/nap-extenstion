import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/storage";
import { generateFollowUpEmail, UserProfile } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    const { jobTitle, company, contactName, language, emailSentDate } = await req.json();

    if (!jobTitle || !company) {
      return NextResponse.json({ error: "jobTitle and company are required." }, { status: 400 });
    }

    const profile = await getProfile(supabase, user.id);
    const userProfile: UserProfile = {
      name: profile?.name || user.email?.split("@")[0] || "Applicant",
      email: profile?.email || user.email || "",
      phone: profile?.phone,
      address: profile?.address,
      hobbies: profile?.hobbies,
    };

    const result = await generateFollowUpEmail({
      jobTitle,
      company,
      contactName,
      language: language ?? "nl",
      emailSentDate,
      userProfile,
    });

    return NextResponse.json({ emailBody: result.emailBody, usage: result.usage });
  } catch (err) {
    console.error("generate-followup error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
