import { NextRequest, NextResponse } from "next/server";
import { adminUser, getSettings, serviceClient } from "@/lib/supabase";
import { settingsSchema } from "@/lib/validation";

export async function GET() {
  if (!await adminUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getSettings());
}
export async function PUT(request: NextRequest) {
  if (!await adminUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid settings" }, { status: 400 });
  const { error } = await serviceClient().from("event_settings").update(parsed.data).eq("id", 1);
  if (error) return NextResponse.json({ error: "Unable to save settings" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
