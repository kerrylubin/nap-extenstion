import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import {
  readApplications,
  addApplication,
  updateApplication,
  deleteApplication,
} from "@/lib/storage";

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const apps = await readApplications(supabase, user.id);
    return NextResponse.json(apps);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    const body = await req.json();

    // If saving a liked link with a generic title, retrieve the real title from the URL
    if (body.jobUrl && (!body.jobTitle || body.jobTitle === "Job Posting")) {
      try {
        const { getJobTitleFromUrl } = await import("@/lib/scraper");
        body.jobTitle = await getJobTitleFromUrl(body.jobUrl);
      } catch (e) {
        console.warn("Failed to extract title from URL:", body.jobUrl, e);
      }
    }

    const app = await addApplication(supabase, user.id, body);
    return NextResponse.json(app, { status: 201 });
  } catch (err) {
    console.error("POST /api/applications error:", err);
    const msg = err instanceof Error ? err.message : (typeof err === "object" && err !== null && "message" in err ? String((err as Record<string, unknown>).message) : String(err));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    const { id, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const updated = await updateApplication(supabase, user.id, id, updates);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/applications error:", err);
    const msg = err instanceof Error ? err.message : (typeof err === "object" && err !== null && "message" in err ? String((err as Record<string, unknown>).message) : String(err));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const ok = await deleteApplication(supabase, user.id, id);
    return NextResponse.json({ success: ok });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
