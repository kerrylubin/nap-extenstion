import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    try {
      const res = await fetch(url, {
        method: "HEAD",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      });
      
      return NextResponse.json({ isOnline: res.ok || res.status < 400 });
    } catch (fetchErr) {
      return NextResponse.json({ isOnline: false });
    }
  } catch (err) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
