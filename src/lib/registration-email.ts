import QRCode from "qrcode";
import { createTicket } from "@/lib/checkin";
import { serviceClient } from "@/lib/supabase";
import { EVENT_DATES, EVENT_TITLE } from "@/lib/utils";
import { sendGmailMessage } from "@/lib/gmail";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendRegistrationEmail(reference: string): Promise<boolean> {
  const client = serviceClient();
  const { data: participant, error } = await client.from("registrations")
    .select("reference,full_name,email,institution,attendance,confirmation_email_status")
    .eq("reference", reference).single();
  if (error || !participant) throw new Error("Registration not found for confirmation email");
  if (participant.confirmation_email_status === "sent") return true;

  try {
    const ticket = createTicket({ reference: participant.reference, name: participant.full_name,
      institution: participant.institution, attendance: participant.attendance });
    const png = (await QRCode.toDataURL(JSON.stringify(ticket), { width: 420, margin: 2, errorCorrectionLevel: "M" })).split(",")[1];
    const name = escapeHtml(participant.full_name);
    const html = `<div style="max-width:580px;margin:auto;font-family:Arial,sans-serif;color:#13233a;line-height:1.6">
      <h1 style="font-size:24px">${escapeHtml(EVENT_TITLE)}</h1>
      <p>Hello ${name}, we received your workshop registration.</p>
      <p><strong>Reference:</strong> ${escapeHtml(reference)}<br><strong>Dates:</strong> ${escapeHtml(EVENT_DATES)}<br>
      <strong>Attendance:</strong> ${escapeHtml(participant.attendance)}<br>
      <strong>Institution:</strong> ${escapeHtml(participant.institution)}</p>
      <p>Payment is reviewed separately by the organizers. This QR code is used only to record your workshop attendance.</p>
      <p>Bring this QR code on your workshop day. An admin will scan it to record your attendance. Keep this email private.</p>
      <img src="cid:workshop-checkin-qr" width="280" height="280" alt="Workshop check-in QR code" style="display:block;max-width:100%;height:auto" />
      <p style="font-size:12px;color:#64748b">If the image is hidden by your email app, open the attached QR image. This mailbox is not monitored.</p></div>`;
    await sendGmailMessage({ to: participant.email, subject: `${EVENT_TITLE} registration ${reference}`,
      html, text: `Hello ${participant.full_name}, we received your registration for ${EVENT_TITLE}. Reference: ${reference}. Dates: ${EVENT_DATES}. Attendance: ${participant.attendance}. Bring the attached QR code on your workshop day. It is used only to record attendance. Payment is reviewed separately by the organizers. This mailbox is not monitored.`,
      qrPngBase64: png, reference });
    const { error: updateError } = await client.from("registrations")
      .update({ confirmation_email_status: "sent", confirmation_email_sent_at: new Date().toISOString() })
      .eq("reference", reference);
    if (updateError) throw updateError;
    return true;
  } catch (error) {
    console.error("Registration email failed", reference, error);
    await client.from("registrations").update({ confirmation_email_status: "failed" }).eq("reference", reference);
    return false;
  }
}
