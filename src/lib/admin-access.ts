import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_ACCESS_COOKIE = "admin-access-session";
export const ADMIN_ACCESS_SECONDS = 60 * 60 * 24 * 7;

function accessSecret() {
  const secret = process.env.ADMIN_ACCESS_TOKEN;
  return secret && /^[a-f0-9]{128}$/.test(secret) ? secret : null;
}

export function validAdminAccessToken(token: string) {
  const secret = accessSecret();
  return Boolean(secret && /^[a-f0-9]{128}$/.test(token) &&
    timingSafeEqual(Buffer.from(token), Buffer.from(secret)));
}

export function createAdminAccessSession(id: string, now = Date.now()) {
  const secret = accessSecret();
  if (!secret) throw new Error("Admin access link is not configured");
  const payload = `${id}.${Math.floor(now / 1000) + ADMIN_ACCESS_SECONDS}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

export function adminAccessSessionId(session: string | undefined, now = Date.now()) {
  const secret = accessSecret();
  if (!secret || !session) return null;
  const parts = session.split(".");
  if (parts.length !== 3) return null;
  const [id, expiry, signature] = parts;
  if (!/^[a-f0-9-]{36}$/i.test(id) || !/^\d+$/.test(expiry) ||
    Number(expiry) <= Math.floor(now / 1000) || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const expected = createHmac("sha256", secret).update(`${id}.${expiry}`).digest("hex");
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? id : null;
}
