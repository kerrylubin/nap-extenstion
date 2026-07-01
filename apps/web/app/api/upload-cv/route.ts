import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { uploadCVFile, deleteCVRecord, getUserCVs, updateProfile, getProfile, setCVPrimary } from "@/lib/storage";

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const [cvs, profile] = await Promise.all([
      getUserCVs(supabase, user.id),
      getProfile(supabase, user.id),
    ]);
    return NextResponse.json({ cvs, profile });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const language = (formData.get("language") as string | null) ?? "nl";
    const isPrimary = formData.get("isPrimary") === "true";

    if (!file || file.type !== "application/pdf") {
      return NextResponse.json({ error: "A PDF file is required." }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5 MB)." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sanitizedFilename = file.name.replace(/_/g, " ");
    const cv = await uploadCVFile(supabase, user.id, buffer, sanitizedFilename, language, isPrimary);
    return NextResponse.json(cv, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : (typeof err === "object" && err !== null && "message" in err ? (err as {message: string}).message : String(err));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    const { cvId } = await req.json();
    if (!cvId) return NextResponse.json({ error: "cvId required" }, { status: 400 });
    await deleteCVRecord(supabase, user.id, cvId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    const body = await req.json();

    // CV primary switch
    if (body.setPrimaryId) {
      await setCVPrimary(supabase, user.id, body.setPrimaryId);
      return NextResponse.json({ ok: true });
    }

    const profile = await updateProfile(supabase, user.id, {
      name: body.name,
      phone: body.phone,
      address: body.address,
      hobbies: body.hobbies,
      masterEmailTemplate: body.masterEmailTemplate,
      masterLetterTemplate: body.masterLetterTemplate,
      onboardingComplete: body.onboardingComplete,
    });
    return NextResponse.json(profile);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
