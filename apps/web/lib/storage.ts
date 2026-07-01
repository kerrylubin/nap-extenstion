import type { SupabaseClient } from "@supabase/supabase-js";
import { JobApplication, CV, Profile, ApplicationStatus } from "@/types";

// ─────────────────────────────────────────────
// Mapping helpers (Postgres snake_case ↔ TS camelCase)
// ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toApplication(row: Record<string, any>): JobApplication {
  const FOLLOWUP_MARKER = "\n\n[FOLLOWUP_DRAFT]:\n";
  let notes = row.notes ?? undefined;
  let followUpEmailBody: string | undefined;
  if (notes && notes.includes(FOLLOWUP_MARKER)) {
    const idx = notes.indexOf(FOLLOWUP_MARKER);
    followUpEmailBody = notes.slice(idx + FOLLOWUP_MARKER.length) || undefined;
    notes = notes.slice(0, idx) || undefined;
  }

  return {
    id: row.id,
    jobTitle: row.job_title ?? "",
    company: row.company ?? "",
    jobUrl: row.job_url ?? undefined,
    jobDescription: row.job_description ?? undefined,
    recruiterEmail: row.recruiter_email ?? undefined,
    recruiterPhone: row.recruiter_phone ?? undefined,
    contactName: row.contact_name ?? undefined,
    language: row.language ?? "nl",
    matchScore: row.match_score ?? undefined,
    status: (row.status ?? "liked") as ApplicationStatus,
    emailBody: row.email_body ?? undefined,
    letterPath: row.letter_path ? row.letter_path.replace(/_/g, " ") : undefined,
    letterBase64: row.letter_base64 ?? undefined,
    letterText: row.letter_text ?? undefined,
    emailSentDate: row.email_sent_date ?? undefined,
    interviewDate: row.interview_date ?? undefined,
    followUpDate: row.follow_up_date ?? undefined,
    notes,
    followUpEmailBody,
    tokensUsed: row.tokens_used ?? 0,
    costUsd: row.cost_usd ? parseFloat(row.cost_usd) : 0.0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toApplicationRow(app: Partial<JobApplication>, userId?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = {};
  if (userId) row.user_id = userId;
  if (app.jobTitle !== undefined) row.job_title = app.jobTitle;
  if (app.company !== undefined) row.company = app.company;
  if (app.jobUrl !== undefined) row.job_url = app.jobUrl;
  if (app.jobDescription !== undefined) row.job_description = app.jobDescription;
  if (app.recruiterEmail !== undefined) row.recruiter_email = app.recruiterEmail;
  if (app.recruiterPhone !== undefined) row.recruiter_phone = app.recruiterPhone;
  if (app.contactName !== undefined) row.contact_name = app.contactName;
  if (app.language !== undefined) row.language = app.language;
  if (app.matchScore !== undefined) row.match_score = app.matchScore;
  if (app.status !== undefined) row.status = app.status;
  if (app.emailBody !== undefined) row.email_body = app.emailBody;
  if (app.letterPath !== undefined) row.letter_path = app.letterPath;
  if (app.letterBase64 !== undefined) row.letter_base64 = app.letterBase64;
  if (app.letterText !== undefined) row.letter_text = app.letterText;
  if (app.emailSentDate !== undefined) row.email_sent_date = app.emailSentDate;
  if (app.interviewDate !== undefined) row.interview_date = app.interviewDate;
  if (app.followUpDate !== undefined) row.follow_up_date = app.followUpDate;
  if (app.notes !== undefined || app.followUpEmailBody !== undefined) {
    // Pack followUpEmailBody into the notes column using a delimiter
    const FOLLOWUP_MARKER = "\n\n[FOLLOWUP_DRAFT]:\n";
    const baseNotes = app.notes ?? "";
    const draft = app.followUpEmailBody;
    if (draft !== undefined) {
      row.notes = draft ? `${baseNotes}${FOLLOWUP_MARKER}${draft}` : baseNotes || null;
    } else if (app.notes !== undefined) {
      row.notes = app.notes;
    }
  }
  if (app.tokensUsed !== undefined) row.tokens_used = app.tokensUsed;
  if (app.costUsd !== undefined) row.cost_usd = app.costUsd;
  return row;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCV(row: Record<string, any>): CV {
  return {
    id: row.id,
    userId: row.user_id,
    language: row.language,
    filename: row.filename ? row.filename.replace(/_/g, " ") : "",
    storagePath: row.storage_path,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toProfile(row: Record<string, any>): Profile {
  let address = row.address ?? undefined;
  let hobbies = row.hobbies ?? undefined;

  const MARKER = "\n\n[HOBBIES]:\n";
  if (address && address.includes(MARKER)) {
    const idx = address.indexOf(MARKER);
    hobbies = address.slice(idx + MARKER.length) || undefined;
    address = address.slice(0, idx) || undefined;
  }

  return {
    id: row.id,
    email: row.email ?? "",
    name: row.name ?? "",
    avatarUrl: row.avatar_url ?? undefined,
    phone: row.phone ?? undefined,
    address,
    hobbies,
    masterEmailTemplate: row.master_email_template ?? undefined,
    masterLetterTemplate: row.master_letter_template ?? undefined,
    onboardingComplete: row.onboarding_complete ?? false,
    updatedAt: row.updated_at,
  };
}

// ─────────────────────────────────────────────
// Applications
// ─────────────────────────────────────────────

export async function readApplications(
  supabase: SupabaseClient,
  userId: string
): Promise<JobApplication[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toApplication);
}

export async function addApplication(
  supabase: SupabaseClient,
  userId: string,
  app: Partial<JobApplication>
): Promise<JobApplication> {
  // Ensure profile row exists to satisfy foreign key constraints
  await getProfile(supabase, userId);

  const row = toApplicationRow(app, userId);
  const { data, error } = await supabase
    .from("applications")
    .insert(row)
    .select()
    .single();
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      console.warn("Usage columns missing in database or schema cache. Retrying insert without usage columns...");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fallbackRow: Record<string, any> = { ...row };
      delete fallbackRow.tokens_used;
      delete fallbackRow.cost_usd;
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("applications")
        .insert(fallbackRow)
        .select()
        .single();
      if (fallbackError) throw fallbackError;
      return toApplication(fallbackData);
    }
    throw error;
  }
  return toApplication(data);
}

export async function updateApplication(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  updates: Partial<JobApplication>
): Promise<JobApplication | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = { ...toApplicationRow(updates), updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from("applications")
    .update(row)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      console.warn("Usage columns missing in database or schema cache. Retrying update without usage columns...");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fallbackRow: Record<string, any> = { ...row };
      delete fallbackRow.tokens_used;
      delete fallbackRow.cost_usd;
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("applications")
        .update(fallbackRow)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (fallbackError) return null;
      return toApplication(fallbackData);
    }
    return null;
  }
  return toApplication(data);
}

export async function deleteApplication(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<boolean> {
  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  return !error;
}

// ─────────────────────────────────────────────
// CVs
// ─────────────────────────────────────────────

export async function getUserCVs(
  supabase: SupabaseClient,
  userId: string
): Promise<CV[]> {
  const { data, error } = await supabase
    .from("cvs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toCV);
}

export async function getCVForLanguage(
  supabase: SupabaseClient,
  userId: string,
  language: string
): Promise<CV | null> {
  // Exact language match first
  const { data: exact } = await supabase
    .from("cvs")
    .select("*")
    .eq("user_id", userId)
    .eq("language", language)
    .single();
  if (exact) return toCV(exact);

  // Fall back to English CV for English jobs
  if (language === "en") return null;

  // Fall back to primary CV
  const { data: primary } = await supabase
    .from("cvs")
    .select("*")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .single();
  if (primary) return toCV(primary);

  // Last resort: any CV
  const { data: any } = await supabase
    .from("cvs")
    .select("*")
    .eq("user_id", userId)
    .limit(1)
    .single();
  return any ? toCV(any) : null;
}

export async function downloadCVBuffer(
  supabase: SupabaseClient,
  storagePath: string
): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from("cvs")
    .download(storagePath);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

export async function uploadCVFile(
  supabase: SupabaseClient,
  userId: string,
  fileBuffer: Buffer,
  filename: string,
  language: string,
  isPrimary: boolean
): Promise<CV> {
  // Ensure profile row exists to satisfy foreign key constraints
  await getProfile(supabase, userId);

  const cleanFilename = filename.replace(/_/g, " ");
  const storagePath = `${userId}/${language}_${Date.now()}_${cleanFilename}`;

  const { error: uploadError } = await supabase.storage
    .from("cvs")
    .upload(storagePath, fileBuffer, { contentType: "application/pdf" });
  if (uploadError) throw uploadError;

  // If marking as primary, unset existing primary
  if (isPrimary) {
    await supabase
      .from("cvs")
      .update({ is_primary: false })
      .eq("user_id", userId);
  }

  const { data, error } = await supabase
    .from("cvs")
    .insert({ user_id: userId, language, filename: cleanFilename, storage_path: storagePath, is_primary: isPrimary })
    .select()
    .single();
  if (error) throw error;
  return toCV(data);
}

export async function setCVPrimary(
  supabase: SupabaseClient,
  userId: string,
  cvId: string
): Promise<void> {
  await supabase.from("cvs").update({ is_primary: false }).eq("user_id", userId);
  await supabase.from("cvs").update({ is_primary: true }).eq("id", cvId).eq("user_id", userId);
}

export async function deleteCVRecord(
  supabase: SupabaseClient,
  userId: string,
  cvId: string
): Promise<void> {
  const { data: cv } = await supabase
    .from("cvs")
    .select("storage_path")
    .eq("id", cvId)
    .eq("user_id", userId)
    .single();
  if (cv) {
    await supabase.storage.from("cvs").remove([cv.storage_path]);
    await supabase.from("cvs").delete().eq("id", cvId).eq("user_id", userId);
  }
}

// ─────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────

export async function getProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) {
    console.warn(`[getProfile] Profile not found for ${userId}, error:`, error.message);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.id === userId) {
        const { data: inserted, error: insertError } = await supabase
          .from("profiles")
          .insert({
            id: userId,
            email: user.email,
            name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Applicant",
            avatar_url: user.user_metadata?.avatar_url,
          })
          .select()
          .single();
        if (insertError) {
          console.error("[getProfile] Failed to auto-create profile row:", insertError);
        } else if (inserted) {
          console.log("[getProfile] Successfully auto-created profile row:", inserted);
          return toProfile(inserted);
        }
      } else {
        console.warn("[getProfile] Auth user does not match target userId:", { authUser: user?.id, targetUserId: userId });
      }
    } catch (e) {
      console.error("[getProfile] Auto-create profile row failed with exception:", e);
    }
    return null;
  }
  return toProfile(data);
}

export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  updates: Partial<Pick<Profile, "name" | "phone" | "address" | "hobbies" | "masterEmailTemplate" | "masterLetterTemplate" | "onboardingComplete">>
): Promise<Profile> {
  // Ensure profile row exists and get current values for merging
  const current = await getProfile(supabase, userId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.phone !== undefined) row.phone = updates.phone;
  if (updates.masterEmailTemplate !== undefined) row.master_email_template = updates.masterEmailTemplate;
  if (updates.masterLetterTemplate !== undefined) row.master_letter_template = updates.masterLetterTemplate;
  if (updates.onboardingComplete !== undefined) row.onboarding_complete = updates.onboardingComplete;

  // Combine address and hobbies into the address column
  if (updates.address !== undefined || updates.hobbies !== undefined) {
    const finalAddress = updates.address !== undefined ? updates.address : (current?.address ?? "");
    const finalHobbies = updates.hobbies !== undefined ? updates.hobbies : (current?.hobbies ?? "");
    if (finalHobbies && finalHobbies.trim()) {
      row.address = `${finalAddress}\n\n[HOBBIES]:\n${finalHobbies}`;
    } else {
      row.address = finalAddress;
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(row)
    .eq("id", userId)
    .select()
    .single();
  if (error) throw error;
  return toProfile(data);
}
