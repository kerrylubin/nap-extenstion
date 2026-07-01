import { NextResponse } from "next/server";
import { checkGmailConnection } from "@/lib/gmail";

export async function GET() {
  const connected = await checkGmailConnection();
  return NextResponse.json({ connected });
}
