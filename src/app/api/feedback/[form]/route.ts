import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { formKeys, submissionSchema, type FormKey } from "@/lib/feedback";

export async function POST(request: NextRequest, context: { params: Promise<{ form: string }> }) {
  const { form } = await context.params;
  if (!formKeys.includes(form as FormKey)) return NextResponse.json({ error: "Unknown form." }, { status: 404 });
  if (Number(request.headers.get("content-length") || 0) > 8000)
    return NextResponse.json({ error: "This response is too large." }, { status: 413 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Please send a valid response." }, { status: 400 }); }
  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please check all required answers and try again." }, { status: 400 });
  try {
    const { data, error } = await serviceClient().rpc("submit_workshop_feedback_v2", {
      p_form: form, p_answers: parsed.data.answers, p_request_id: parsed.data.request_id
    });
    if (error) return NextResponse.json({ error: "Feedback is temporarily unavailable. Please try again later." }, { status: 503 });
    if (data === "unavailable") return NextResponse.json({ error: "Feedback collection is not open for this form." }, { status: 403 });
    if (data !== "saved" && data !== "already_saved") return NextResponse.json({ error: "This form is unavailable." }, { status: 404 });
    return NextResponse.json({ ok: true }, { status: data === "saved" ? 201 : 200, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Feedback is temporarily unavailable. Please try again later." }, { status: 503 }); }
}
