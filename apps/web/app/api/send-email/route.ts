import { NextRequest, NextResponse } from "next/server";
import { sendApplicationEmail } from "@/lib/gmail";
import { requireUser } from "@/lib/supabase/server";
import { updateApplication, getCVForLanguage, downloadCVBuffer, getProfile } from "@/lib/storage";
import { generateFollowUpEmail, UserProfile } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser(req);
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
      contactName,
      isFollowUp,
    } = body;

    if (!to || !jobTitle || !company || !emailBody) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    
    if (!letterBase64) {
      return NextResponse.json({ error: "Missing letterBase64 for application." }, { status: 400 });
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
      isFollowUp,
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

      // Auto-generate the follow-up draft in the background so it's ready when needed.
      // Only do this for initial application sends, not for follow-up sends.
      if (!isFollowUp) {
        const emailSentDate = new Date().toISOString();
        const userProfile: UserProfile = {
          name: senderName,
          email: senderEmail,
          phone: profile?.phone,
          address: profile?.address,
          hobbies: profile?.hobbies,
        };
        generateFollowUpEmail({
          jobTitle,
          company,
          contactName: contactName || undefined,
          language: (language ?? "nl") as "nl" | "en",
          emailSentDate,
          userProfile,
        })
          .then(({ emailBody }) =>
            updateApplication(supabase, user.id, applicationId, {
              followUpEmailBody: emailBody,
            })
          )
          .catch((err) =>
            console.warn("[send-email] Background follow-up draft generation failed:", err)
          );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("send-email error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
