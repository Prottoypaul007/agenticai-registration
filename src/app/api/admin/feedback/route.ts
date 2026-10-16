import { NextRequest, NextResponse } from "next/server";
import { adminUser, serviceClient } from "@/lib/supabase";
import { scheduleSchema } from "@/lib/feedback";
import { summarizeFeedback } from "@/lib/feedback-results";

async function rows(table: "background_survey_responses" | "workshop_feedback_responses", fields: string) {
  const result: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await serviceClient().from(table).select(fields).range(offset, offset + 999);
    if (error) throw new Error("Unable to read anonymous results.");
    result.push(...((data || []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < 1000) return result;
  }
}

export async function GET(request: NextRequest) {
  if (!await adminUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (request.nextUrl.searchParams.get("view") === "schedules") {
      const { data, error } = await serviceClient().from("feedback_forms").select("key,opens_at,closes_at,enabled");
      if (error) throw new Error("Unable to load schedules.");
      return NextResponse.json({ forms: data }, { headers: { "Cache-Control": "no-store" } });
    }
    const [{ data: forms, error }, background, workshops] = await Promise.all([
      serviceClient().from("feedback_forms").select("key,opens_at,closes_at,enabled"),
      rows("background_survey_responses", "academic_discipline,software_credits,ai_use_frequency,ai_tools,ai_activities,ai_coursework,agentic_coursework,agentic_familiarity"),
      rows("workshop_feedback_responses", "form_key,overall_quality,clarity,relevance,examples,confidence,pacing,most_valuable,improvements")
    ]);
    if (error) throw new Error("Unable to load forms.");
    const results = summarizeFeedback(background, workshops.filter(row => row.form_key === "workshop-1"),
      workshops.filter(row => row.form_key === "workshop-2"));
    return NextResponse.json({ forms, results }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Feedback results are unavailable. Apply migration 018 if needed." }, { status: 503 }); }
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
