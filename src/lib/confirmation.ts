import { createHmac, timingSafeEqual } from "crypto";
export function signConfirmation(reference: string, status: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "development-only";
  return createHmac("sha256", secret).update(`${reference}:${status}`).digest("hex");
}
export function verifyConfirmation(reference: string, status: string, signature: string) {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = Buffer.from(signConfirmation(reference, status), "hex");
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
