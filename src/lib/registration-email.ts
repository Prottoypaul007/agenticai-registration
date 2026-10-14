import QRCode from "qrcode";
import { EVENT_VENUE, EVENT_MAPS_URL } from "@/lib/venue";
import { createTicket } from "@/lib/checkin";
import { serviceClient } from "@/lib/supabase";
import { EVENT_DATES, EVENT_TITLE } from "@/lib/utils";
import { sendGmailMessage } from "@/lib/gmail";
import { rejectionExplanation, type RejectionReason } from "@/lib/rejection";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendRegistrationEmail(reference: string): Promise<boolean> {
  const client = serviceClient();
  const { data: participant, error } = await client.from("registrations")
    .select("reference,full_name,email,institution,attendance,confirmation_email_status,qr_status,qr_reviewed_by")
    .eq("reference", reference).single();
  if (error || !participant) throw new Error("Registration not found for confirmation email");
  if (participant.qr_status !== "sending" || !participant.qr_reviewed_by)
    throw new Error("QR delivery requires an admin payment review");

  try {
    const ticket = createTicket({ reference: participant.reference, name: participant.full_name,
      institution: participant.institution, attendance: participant.attendance });
    const png = (await QRCode.toDataURL(JSON.stringify(ticket), { width: 420, margin: 2, errorCorrectionLevel: "M" })).split(",")[1];
    const name = escapeHtml(participant.full_name);
    const html = `<div style="max-width:580px;margin:auto;font-family:Arial,sans-serif;color:#13233a;line-height:1.6">
      <h1 style="font-size:24px">${escapeHtml(EVENT_TITLE)}</h1>
      <p>Hello ${name}, your workshop registration has been confirmed.</p>
      <p><strong>Reference:</strong> ${escapeHtml(reference)}<br><strong>Dates:</strong> ${escapeHtml(EVENT_DATES)}<br>
      <strong>Venue:</strong> ${escapeHtml(EVENT_VENUE)}<br><a href="${escapeHtml(EVENT_MAPS_URL)}">View on Google Maps</a><br><strong>Attendance:</strong> ${escapeHtml(participant.attendance)}<br>
      <strong>Institution:</strong> ${escapeHtml(participant.institution)}</p>
      <p>The organizers have reviewed your payment details. This QR code is used only to record your workshop attendance.</p>
      <p>Bring this QR code on your workshop day. An admin will scan it to record your attendance. Keep this email private.</p>
      <img src="cid:workshop-checkin-qr" width="280" height="280" alt="Workshop check-in QR code" style="display:block;max-width:100%;height:auto" />
      <p style="font-size:12px;color:#64748b">If the image is hidden by your email app, open the attached QR image. This mailbox is not monitored.</p></div>`;
    await sendGmailMessage({ to: participant.email, subject: `${EVENT_TITLE} QR ticket ${reference}`,
      html, text: `Hello ${participant.full_name}, your registration for ${EVENT_TITLE} has been confirmed. Reference: ${reference}. Dates: ${EVENT_DATES}. Venue: ${EVENT_VENUE}. Google Maps: ${EVENT_MAPS_URL}. Attendance: ${participant.attendance}. Bring the attached QR code on your workshop day. It is used only to record attendance. This mailbox is not monitored.`,
      qrPngBase64: png, reference });
    const { error: updateError } = await client.from("registrations")
      .update({ registration_status: "confirmed", confirmation_email_status: "sent", confirmation_email_sent_at: new Date().toISOString(),
        qr_status: "sent", qr_sent_at: new Date().toISOString(), qr_sent_by: participant.qr_reviewed_by })
      .eq("reference", reference).eq("qr_status", "sending");
    if (updateError) throw updateError;
    return true;
  } catch (error) {
    console.error("Registration email failed", reference, error);
    await client.from("registrations").update({ confirmation_email_status: "failed", qr_status: "failed" })
      .eq("reference", reference).eq("qr_status", "sending");
    return false;
  }
}

export async function sendBatch14Email(reference: string): Promise<boolean> {
  const client = serviceClient();
  const { data: participant, error } = await client.from("batch14_registrations")
    .select("reference,full_name,email,institution,attendance,qr_status,qr_reviewed_by")
    .eq("reference", reference).single();
  if (error || !participant || participant.qr_status !== "sending" || !participant.qr_reviewed_by)
    throw new Error("Batch 14 QR delivery requires an admin action");
  try {
    const ticket = createTicket({ reference: participant.reference, name: participant.full_name,
      institution: participant.institution, attendance: participant.attendance });
    const png = (await QRCode.toDataURL(JSON.stringify(ticket), { width: 420, margin: 2, errorCorrectionLevel: "M" })).split(",")[1];
    await sendGmailMessage({ to: participant.email, reference,
      subject: `${EVENT_TITLE} QR ticket ${reference}`,
      html: `<div style="max-width:580px;margin:auto;font-family:Arial,sans-serif;color:#13233a;line-height:1.6"><h1>${escapeHtml(EVENT_TITLE)}</h1><p>Hello ${escapeHtml(participant.full_name)}, your Batch 14 workshop place is confirmed.</p><p><strong>Reference:</strong> ${escapeHtml(reference)}<br><strong>Dates:</strong> ${escapeHtml(EVENT_DATES)}<br><strong>Venue:</strong> ${escapeHtml(EVENT_VENUE)}<br><a href="${escapeHtml(EVENT_MAPS_URL)}">View on Google Maps</a><br><strong>Attendance:</strong> ${escapeHtml(participant.attendance)}</p><p>Bring this QR code on your workshop day. An admin will scan it to record your attendance. Keep this email private.</p><img src="cid:workshop-checkin-qr" width="280" height="280" alt="Workshop check-in QR code"/><p style="font-size:12px;color:#64748b">If the image is hidden, open the attached QR image. This mailbox is not monitored.</p></div>`,
      text: `Hello ${participant.full_name}, your Batch 14 place at ${EVENT_TITLE} is confirmed. Reference: ${reference}. Dates: ${EVENT_DATES}. Venue: ${EVENT_VENUE}. Google Maps: ${EVENT_MAPS_URL}. Attendance: ${participant.attendance}. Bring the attached QR code for check-in. This mailbox is not monitored.`,
      qrPngBase64: png });
    const { error: updateError } = await client.from("batch14_registrations")
      .update({ qr_status: "sent", qr_sent_at: new Date().toISOString(), qr_sent_by: participant.qr_reviewed_by })
      .eq("reference", reference).eq("qr_status", "sending");
    if (updateError) throw updateError;
    return true;
  } catch (sendError) {
    console.error("Batch 14 QR email failed", reference, sendError);
    await client.from("batch14_registrations").update({ qr_status: "failed" })
      .eq("reference", reference).eq("qr_status", "sending");
    return false;
  }
}

export async function sendRejectionEmail(reference: string): Promise<boolean> {
  const client = serviceClient();
  const { data: participant, error } = await client.from("registrations")
    .select("reference,full_name,email,registration_status,rejection_reason_code,rejection_reason_detail,rejection_email_status")
    .eq("reference", reference).single();
  if (error || !participant || participant.registration_status !== "rejected" || !participant.rejection_reason_code)
    throw new Error("Rejected registration not found");
  if (participant.rejection_email_status === "sent") return true;
  const explanation = rejectionExplanation(participant.rejection_reason_code as RejectionReason, participant.rejection_reason_detail);
  try {
    await sendGmailMessage({ to: participant.email, reference,
      subject: `${EVENT_TITLE} registration update ${reference}`,
      html: `<div style="max-width:580px;margin:auto;font-family:Arial,sans-serif;color:#13233a;line-height:1.6"><h1 style="font-size:24px">Registration update</h1><p>Hello ${escapeHtml(participant.full_name)},</p><p>Thank you for your interest in ${escapeHtml(EVENT_TITLE)}. After reviewing your registration (${escapeHtml(reference)}), we are sorry that we cannot confirm your place.</p><p>${escapeHtml(explanation)}</p><p>Thank you for your understanding.</p><p style="font-size:12px;color:#64748b">This mailbox is not monitored.</p></div>`,
      text: `Hello ${participant.full_name}, thank you for your interest in ${EVENT_TITLE}. After reviewing registration ${reference}, we are sorry that we cannot confirm your place. ${explanation} Thank you for your understanding. This mailbox is not monitored.` });
    const { error: updateError } = await client.from("registrations")
      .update({ rejection_email_status: "sent", rejection_email_sent_at: new Date().toISOString() })
      .eq("reference", reference);
    if (updateError) throw updateError;
    return true;
  } catch (sendError) {
    console.error("Rejection email failed", reference, sendError);
    await client.from("registrations").update({ rejection_email_status: "failed" }).eq("reference", reference);
    return false;
  }
}
