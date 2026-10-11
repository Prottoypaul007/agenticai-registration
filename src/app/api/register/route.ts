import { NextRequest, NextResponse } from "next/server";
import { registrationSchema } from "@/lib/validation";
import { configured } from "@/lib/utils";
import { getSettings, serviceClient } from "@/lib/supabase";
import { signConfirmation } from "@/lib/confirmation";
import { syncBatch14Registrations } from "@/lib/batch14-sync";

export async function POST(request: NextRequest) {
  if (!configured()) return NextResponse.json({ error: "Registration is awaiting Supabase setup." }, { status: 503 });
  if (Number(request.headers.get("content-length") || 0) > 16000)
    return NextResponse.json({ error: "Submission is too large." }, { status: 413 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please check the form fields.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const settings = await getSettings();
    if (!settings.outsider_registration_enabled) return NextResponse.json({
      code: "batch14_first",
      error: "Outside registration is paused while Batch 14 places are reserved. Please refresh the page for the current registration status."
    }, { status: 403 });
  } catch { return NextResponse.json({ error: "Unable to check registration availability. Please try again later." }, { status: 503 }); }
  try { await syncBatch14Registrations(); }
  catch (syncError) {
    if (syncError instanceof Error && syncError.message.includes("registration_full"))
      return NextResponse.json({ error: "All workshop places are currently reserved or registered." }, { status: 403 });
    console.error("Batch 14 sheet sync failed before outside registration", syncError);
    const reason = syncError instanceof Error ? syncError.message : "";
    const code = reason.startsWith("Configure the Google Sheets") ? "batch14_sheet_not_configured"
      : reason.includes("authentication failed") ? "batch14_sheet_auth_failed"
      : reason.includes("private Google Sheet") || reason.includes("response tab was not found") ? "batch14_sheet_access_failed"
      : "batch14_sheet_sync_failed";
    return NextResponse.json({ code, error: "Registration is temporarily unavailable while Batch 14 places are checked. Please try again later." }, { status: 503 });
  }
  const { data, error } = await serviceClient().rpc("submit_registration", {
    p_payload: parsed.data
  });
  if (error || data?.error) {
    const code = error?.message || data?.error || "";
    if (code.includes("registration_closed")) {
      try {
        const settings = await getSettings();
        if (!settings.outsider_registration_enabled) return NextResponse.json({
          code: "batch14_first",
          error: "Outside registration is paused while Batch 14 places are reserved. Please refresh the page for the current registration status."
        }, { status: 403 });
      } catch { /* Keep the general closed message if settings cannot be read. */ }
    }
    const known: Record<string, [string, number]> = {
      duplicate_registration: ["This email address is already registered.", 409],
      registration_closed: ["Registration is currently closed.", 403],
      registration_full: ["Registration has reached capacity.", 403],
      invalid_attendance: ["Please select both days for this workshop.", 400],
      student_id_required: ["Student ID is required for IIT students.", 400],
      payment_unavailable: ["The selected payment method is unavailable. Please choose another method.", 503],
      duplicate_transaction: ["This payment transaction ID has already been submitted for this method.", 409],
      bank_name_mismatch: ["The bank account holder name must match your full name.", 400]
    };
    const match = Object.entries(known).find(([key]) => code.includes(key));
    return NextResponse.json({ error: match?.[1][0] || "Unable to submit registration. Please try again." }, { status: match?.[1][1] || 500 });
  }
  // The QR is issued only after an admin reviews the payment transaction.
  return NextResponse.json({ reference: data.reference, status: data.status, proof: signConfirmation(data.reference, data.status) }, { status: 201 });
}
