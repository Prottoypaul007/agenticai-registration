import { NextRequest, NextResponse } from "next/server";
import { adminUser, serviceClient } from "@/lib/supabase";
import { sendRegistrationEmail, sendRejectionEmail } from "@/lib/registration-email";
import { rejectionReasons, type RejectionReason } from "@/lib/rejection";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const admin = await adminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { id?: unknown; action?: unknown; reason?: unknown; detail?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (typeof body.id !== "string" || !uuid.test(body.id) ||
      !["send_qr", "reject", "retry_rejection_email"].includes(String(body.action)))
    return NextResponse.json({ error: "Invalid review action" }, { status: 400 });

  const client = serviceClient();
  if (body.action === "retry_rejection_email") {
    const { data, error } = await client.from("registrations")
      .select("reference,registration_status").eq("id", body.id).single();
    if (error || !data || data.registration_status !== "rejected")
      return NextResponse.json({ error: "Rejected registration not found" }, { status: 404 });
    let sent = false;
    try { sent = await sendRejectionEmail(data.reference); } catch { return NextResponse.json({ error: "This rejected registration has no recorded cancellation reason." }, { status: 409 }); }
    return NextResponse.json({ status: "rejected", emailSent: sent }, { status: sent ? 200 : 503 });
  }

  if (body.action === "reject") {
    const reason = body.reason;
    const detail = typeof body.detail === "string" ? body.detail.trim() : "";
    if (typeof reason !== "string" || !(reason in rejectionReasons) || detail.length > 500 ||
        (reason === "other" && !detail))
      return NextResponse.json({ error: "Select a cancellation reason. Add a short explanation for Other." }, { status: 400 });
    const { data, error } = await client.rpc("admin_reject_registration", {
      p_id: body.id, p_admin_id: admin.id, p_reason_code: reason as RejectionReason, p_reason_detail: detail || null
    });
    if (error) return NextResponse.json({ error: "Unable to cancel registration. Apply migration 007." }, { status: 500 });
    if (data?.error) return NextResponse.json({ error: data.error === "invalid_transition" ? "Only registrations still awaiting payment review can be cancelled here." : "Unable to cancel this registration." }, { status: data.error === "not_found" ? 404 : 409 });
    let emailSent = false;
    try { emailSent = await sendRejectionEmail(data.reference); }
    catch (sendError) { console.error("Cancellation email could not be prepared", data.reference, sendError); }
    return NextResponse.json({ status: "rejected", emailSent });
  }

  const { data, error } = await client.rpc("admin_prepare_qr", { p_id: body.id, p_admin_id: admin.id });
  if (error) return NextResponse.json({ error: "Unable to prepare QR delivery. Apply migration 007." }, { status: 500 });
  if (data?.error) {
    const messages: Record<string, string> = {
      already_sent: "A QR ticket was already sent for this registration.",
      in_progress: "QR delivery is already in progress. Try again after five minutes if it fails.",
      rejected: "This registration was cancelled.",
      invalid_payment_status: "This registration cannot be approved for payment review."
    };
    return NextResponse.json({ error: messages[data.error] || "Unable to review this registration." }, { status: data.error === "not_found" ? 404 : 409 });
  }
  try {
    const emailSent = await sendRegistrationEmail(data.reference);
    return NextResponse.json({ status: emailSent ? "sent" : "failed", emailSent }, { status: emailSent ? 200 : 503 });
  } catch (sendError) {
    console.error("QR delivery could not be completed", data.reference, sendError);
    await client.from("registrations").update({ qr_status: "failed", confirmation_email_status: "failed" })
      .eq("reference", data.reference).eq("qr_status", "sending");
    return NextResponse.json({ error: "Payment was reviewed, but the QR email failed. Retry from Delivery failed." }, { status: 503 });
  }
}
