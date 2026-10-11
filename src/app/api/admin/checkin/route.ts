import { NextRequest, NextResponse } from "next/server";
import { parseTicket } from "@/lib/checkin";
import { adminUser, serviceClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const admin = await adminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { ticket?: unknown; day?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const ticket = parseTicket(body.ticket);
  if (!ticket || (body.day !== 1 && body.day !== 2))
    return NextResponse.json({ error: "Invalid workshop QR code" }, { status: 400 });
  const { data, error } = await serviceClient().rpc("admin_check_in", {
    p_reference: ticket.reference, p_day: body.day, p_admin_id: admin.id
  });
  if (error) return NextResponse.json({ error: "Unable to record check-in. Apply migration 006 and try again." }, { status: 500 });
  const messages: Record<string, [string, number]> = {
    wrong_day: ["Check-in is only open on the selected workshop day in Bangladesh time.", 409],
    not_found: ["Registration not found.", 404],
    rejected_registration: ["This registration was rejected and cannot be checked in.", 409],
    wrong_attendance: ["This participant is not registered for this day.", 409],
    unauthorized: ["Admin access required.", 401]
  };
  if (data?.error) {
    const [message, status] = messages[data.error] || ["Check-in could not be completed.", 409];
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json(data);
}
