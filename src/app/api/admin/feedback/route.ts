import { NextRequest, NextResponse } from "next/server";
import { adminUser, serviceClient } from "@/lib/supabase";
import { scheduleSchema } from "@/lib/feedback";
import { loadFeedbackResults } from "@/lib/feedback-results-server";

export async function GET(request: NextRequest) {
  if (!await adminUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (request.nextUrl.searchParams.get("view") === "schedules") {
      const { data, error } = await serviceClient().from("feedback_forms").select("key,opens_at,closes_at,enabled");
      if (error) throw new Error("Unable to load schedules.");
      return NextResponse.json({ forms: data }, { headers: { "Cache-Control": "no-store" } });
    }
    const results = await loadFeedbackResults();
    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Feedback results are unavailable. Apply migration 020 if needed." }, { status: 503 }); }
}

export async function PUT(request: NextRequest) {
  if (!await adminUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid schedule." }, { status: 400 }); }
  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid schedule." }, { status: 400 });
  const { key, ...changes } = parsed.data;
  const { error } = await serviceClient().from("feedback_forms").update(changes).eq("key", key);
  if (error) return NextResponse.json({ error: "Unable to save the schedule." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
