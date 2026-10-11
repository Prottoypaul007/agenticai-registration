import { NextRequest, NextResponse } from "next/server";
import { adminUser, serviceClient } from "@/lib/supabase";
import { syncBatch14Registrations } from "@/lib/batch14-sync";
import { sendBatch14Email } from "@/lib/registration-email";

export async function GET(request: NextRequest) {
  if (!await adminUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const page = Math.max(0, Math.min(10000, Number(request.nextUrl.searchParams.get("page")) || 0));
  const status = request.nextUrl.searchParams.get("status");
  let query = serviceClient().from("batch14_registrations").select("*", { count: "exact" })
    .order("created_at", { ascending: false }).range(page * 25, page * 25 + 24);
  if (status && ["pending_review", "sending", "sent", "failed"].includes(status)) query = query.eq("qr_status", status);
  if (status === "payment_conflict") query = query.eq("import_issue", "duplicate_transaction");
  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: "Unable to load Batch 14 registrations. Apply migration 008." }, { status: 500 });
  return NextResponse.json({ registrations: data, count, page,
    configured: Boolean(process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY &&
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID && process.env.GOOGLE_SHEETS_GID) });
}

export async function POST(request: NextRequest) {
  const admin = await adminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { action?: unknown; id?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (body.action === "sync") {
    try {
      return NextResponse.json(await syncBatch14Registrations(admin.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      return NextResponse.json({ error: message.includes("changed identity") ? "A Google Sheet row changed identity after import. Restore the original response row order." :
        message.includes("duplicate transaction") ? "The sheet contains a transaction ID already used by another registration. Correct it and sync again." :
        message || "Unable to read the Google Sheet." }, { status: 409 });
    }
  }
  if (body.action !== "send_qr" || typeof body.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id))
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const client = serviceClient();
  const { data, error } = await client.rpc("admin_prepare_batch14_qr", { p_id: body.id, p_admin_id: admin.id });
  if (error) return NextResponse.json({ error: "Unable to prepare QR email. Apply migration 008." }, { status: 500 });
  if (data?.error) return NextResponse.json({ error: data.error === "already_sent" ? "QR already sent." :
    data.error === "in_progress" ? "QR delivery is in progress. Retry after five minutes." :
    data.error === "missing_payment_details" ? "This sheet row has no payment method or transaction ID to verify." : "Registration not found." }, { status: 409 });
  try {
    const emailSent = await sendBatch14Email(data.reference);
    return NextResponse.json({ status: emailSent ? "sent" : "failed", emailSent }, { status: emailSent ? 200 : 503 });
  } catch (sendError) {
    console.error("Batch 14 QR delivery could not be completed", data.reference, sendError);
    await client.from("batch14_registrations").update({ qr_status: "failed" })
      .eq("reference", data.reference).eq("qr_status", "sending");
    return NextResponse.json({ error: "QR email failed. Retry from the Delivery failed filter." }, { status: 503 });
  }
}
