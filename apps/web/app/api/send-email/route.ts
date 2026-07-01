import { NextRequest, NextResponse } from "next/server";
import { sendApplicationEmail } from "@/lib/gmail";
import { requireUser } from "@/lib/supabase/server";
import { updateApplication, getCVForLanguage, downloadCVBuffer, getProfile } from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    const body = await req.json();
    const {
      applicationId,
      to,
      jobTitle,
      company,
      emailBody,
      letterBase64,
      letterFilename,
      language,
      cvBase64: incomingCvBase64,
      recruiterPhone,
    } = body;

    if (!to || !jobTitle || !company || !emailBody || !letterBase64) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const profile = await getProfile(supabase, user.id);
    const senderName = profile?.name || user.email?.split("@")[0] || "Applicant";
    const senderEmail = profile?.email || user.email || "";

    // Resolve CV: use the one passed in, or fetch from Supabase if not provided
    let cvBase64 = incomingCvBase64 as string | undefined;
    let cvFilename = `${senderName} CV.pdf`;

    if (!cvBase64) {
      const cv = await getCVForLanguage(supabase, user.id, language ?? "nl");
      if (cv) {
        const buf = await downloadCVBuffer(supabase, cv.storagePath);
        cvBase64 = buf.toString("base64");
        cvFilename = cv.filename;
      }
    }

    const cleanLetterFilename = letterFilename.replace(/_/g, " ");
    const cleanCvFilename = cvFilename.replace(/_/g, " ");

    await sendApplicationEmail({
      to,
      jobTitle,
      company,
      emailBody,
      letterBase64,
      letterFilename: cleanLetterFilename,
      language,
      cvBase64,
      cvFilename: cleanCvFilename,
      senderName,
      senderEmail,
    });


    if (applicationId) {
      const fup = new Date();
      fup.setDate(fup.getDate() + 5);
      await updateApplication(supabase, user.id, applicationId, {
        status: "sent",
        emailSentDate: new Date().toISOString(),
        followUpDate: fup.toISOString(),
        recruiterEmail: to,
        recruiterPhone: recruiterPhone || undefined,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("send-email error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
