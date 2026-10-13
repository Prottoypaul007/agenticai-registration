import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredMailboxAttachments } from "@/lib/mailbox-attachment-cleanup";

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ cleaned: await cleanupExpiredMailboxAttachments() }); }
  catch (error) {
    console.error("Mailbox attachment cleanup failed", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 503 });
  }
}
