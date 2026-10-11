import { NextRequest, NextResponse } from "next/server";
import { adminUser, serviceClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  if (!await adminUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const page = Math.max(0, Math.min(10000, Number(params.get("page")) || 0));
  const pageSize = 25;
  let query = serviceClient().from("registrations").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
  const search = params.get("search")?.trim().slice(0, 100);
  if (search) query = query.ilike("full_name", `%${search.replace(/[%_\\]/g, "\\$&")}%`);
  const institution = params.get("institution")?.trim().slice(0, 120);
  if (institution) query = query.ilike("institution", `%${institution.replace(/[%_\\]/g, "\\$&")}%`);
  const level = params.get("level");
  if (level && ["Beginner", "Intermediate", "Advanced"].includes(level)) query = query.eq("programming_level", level);
  const attendance = params.get("attendance");
  if (attendance && ["Both Days", "Day 1 Only", "Day 2 Only"].includes(attendance)) query = query.eq("attendance", attendance);
  const qrStatus = params.get("qr_status");
  if (qrStatus && ["pending_review", "sending", "sent", "failed", "rejected"].includes(qrStatus)) query = query.eq("qr_status", qrStatus);
  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: "Unable to load participants" }, { status: 500 });
  return NextResponse.json({ participants: data, count, page, pageSize });
}

export async function PATCH(request: NextRequest) {
  if (!await adminUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { id?: string; action?: string; refund_reference?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const actions = ["complete", "mark_refunded"];
  if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id) || !actions.includes(body.action || ""))
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  if (body.action === "mark_refunded" && (!body.refund_reference?.trim() || body.refund_reference.length > 120))
    return NextResponse.json({ error: "Enter the bank transfer reference" }, { status: 400 });
  const { data, error } = await serviceClient().rpc("admin_registration_action", {
    p_id: body.id, p_action: body.action, p_ref: body.refund_reference?.trim() || null
  });
  if (error) return NextResponse.json({ error: "Unable to update participant" }, { status: 500 });
  if (data?.error) return NextResponse.json({ error: data.error === "payment_not_verified" ? "Verify the bKash payment before approval." : data.error === "paid_registration_requires_manual_resolution" ? "Resolve a verified payment before rejecting this registration." : "This action is not available for the participant's current status." }, { status: data.error === "not_found" ? 404 : 409 });
  return NextResponse.json({ ok: true });
}
