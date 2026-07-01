import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  try {
    await exchangeCodeForToken(code);
    return NextResponse.redirect(new URL("/?gmail=connected", req.url));
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
