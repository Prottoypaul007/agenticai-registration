import { NextRequest, NextResponse } from "next/server";
import { registrationSchema } from "@/lib/validation";
import { configured } from "@/lib/utils";
import { serviceClient } from "@/lib/supabase";
import { signConfirmation } from "@/lib/confirmation";

export async function POST(request: NextRequest) {
  if (!configured()) return NextResponse.json({ error: "Registration is awaiting Supabase setup." }, { status: 503 });
  if (Number(request.headers.get("content-length") || 0) > 16000)
    return NextResponse.json({ error: "Submission is too large." }, { status: 413 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please check the form fields.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  const { data, error } = await serviceClient().rpc("submit_registration", {
    p_payload: parsed.data
  });
  if (error || data?.error) {
    const code = error?.message || data?.error || "";
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
