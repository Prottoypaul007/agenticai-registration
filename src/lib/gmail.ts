import { randomBytes } from "node:crypto";

type Message = { to: string; subject: string; html: string; text: string; qrPngBase64?: string; reference?: string };

export class GmailDeliveryUncertainError extends Error {
  constructor() { super("Gmail delivery could not be confirmed. Check the sender mailbox before retrying."); }
}

const emailAddress = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const base64Lines = (value: string) => value.match(/.{1,76}/g)?.join("\r\n") || "";
const encodeBody = (value: string) => base64Lines(Buffer.from(value, "utf8").toString("base64"));

export function buildGmailMessage(message: Message, sender: string) {
  if (!emailAddress.test(sender) || !emailAddress.test(message.to) ||
      (message.qrPngBase64 && !/^(?:AGNT|B14)-[A-F0-9]{12}$/.test(message.reference || "")))
    throw new Error("Invalid email address or registration reference");
  const alternative = `alternative-${randomBytes(12).toString("hex")}`;
  const alternativeParts = [
    `--${alternative}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", encodeBody(message.text),
    `--${alternative}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", encodeBody(message.html),
    `--${alternative}--`
  ];
  const commonHeaders = [`From: Workshop <${sender}>`, `To: ${message.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(message.subject, "utf8").toString("base64")}?=`, "MIME-Version: 1.0"];
  if (!message.qrPngBase64) {
    return Buffer.from([...commonHeaders, `Content-Type: multipart/alternative; boundary="${alternative}"`, "",
      ...alternativeParts, ""].join("\r\n"), "utf8").toString("base64url");
  }
  const mixed = `mixed-${randomBytes(12).toString("hex")}`;
  const related = `related-${randomBytes(12).toString("hex")}`;
  const filename = `workshop-${message.reference}.png`;
  const lines = [
    ...commonHeaders, `Content-Type: multipart/mixed; boundary="${mixed}"`, "",
    `--${mixed}`, `Content-Type: multipart/related; boundary="${related}"`, "",
    `--${related}`, `Content-Type: multipart/alternative; boundary="${alternative}"`, "",
    ...alternativeParts,
    `--${related}`, `Content-Type: image/png; name="${filename}"`, "Content-Transfer-Encoding: base64",
    "Content-ID: <workshop-checkin-qr>", `Content-Disposition: inline; filename="${filename}"`, "", base64Lines(message.qrPngBase64),
    `--${related}--`,
    `--${mixed}`, `Content-Type: image/png; name="${filename}"`, "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${filename}"`, "", base64Lines(message.qrPngBase64),
    `--${mixed}--`, ""
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export async function sendGmailMessage(message: Message) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const sender = process.env.GMAIL_SENDER_EMAIL;
  if (!clientId || !clientSecret || !refreshToken || !sender) throw new Error("Gmail API is not configured");
  const raw = buildGmailMessage(message, sender);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" })
  });
  if (!tokenResponse.ok) throw new Error(`Google OAuth token refresh failed (${tokenResponse.status})`);
  const token: { access_token?: string } = await tokenResponse.json();
  if (!token.access_token) throw new Error("Google OAuth did not return an access token");
  let sendResponse: Response;
  try {
    sendResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST", signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw })
    });
  } catch { throw new GmailDeliveryUncertainError(); }
  if (sendResponse.status >= 500) throw new GmailDeliveryUncertainError();
  if (!sendResponse.ok) throw new Error(`Gmail API send failed (${sendResponse.status})`);
}
