import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGmailMessage, GmailDeliveryUncertainError, sendGmailMessage } from "./gmail";

const message = { to: "participant@example.com", subject: "Workshop registration AGNT-ABCDEF123456",
  html: '<p>Ticket <img src="cid:workshop-checkin-qr"></p>', text: "Ticket attached",
  qrPngBase64: Buffer.from("test-image").toString("base64"), reference: "AGNT-ABCDEF123456" };
const savedEnv = { ...process.env };
const savedFetch = globalThis.fetch;

beforeEach(() => {
  process.env.GMAIL_SENDER_EMAIL = "no-reply@example.com";
  process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret";
  process.env.GOOGLE_OAUTH_REFRESH_TOKEN = "refresh-token";
});
afterEach(() => { process.env = { ...savedEnv }; globalThis.fetch = savedFetch; });

describe("Gmail registration delivery", () => {
  it("builds a MIME message with an inline and downloadable QR", () => {
    const mime = Buffer.from(buildGmailMessage(message, "no-reply@example.com"), "base64url").toString("utf8");
    expect(mime).toContain("From: Workshop <no-reply@example.com>");
    expect(mime).toContain("To: participant@example.com");
    expect(mime).toContain("Content-ID: <workshop-checkin-qr>");
    expect(mime).toContain('Content-Disposition: attachment; filename="workshop-AGNT-ABCDEF123456.png"');
    expect(mime).toContain(message.qrPngBase64);
  });
  it("builds a cancellation message without any QR attachment", () => {
    const { qrPngBase64: _qr, ...notice } = message;
    const mime = Buffer.from(buildGmailMessage(notice, "no-reply@example.com"), "base64url").toString("utf8");
    expect(mime).toContain("multipart/alternative");
    expect(mime).not.toContain("workshop-checkin-qr");
    expect(mime).not.toContain("Content-Disposition: attachment");
  });
  it("builds a custom admin message without a registration reference", () => {
    const mime = Buffer.from(buildGmailMessage({
      to: "participant@example.com", subject: "Schedule update", html: "<p>See you soon.</p>", text: "See you soon."
    }, "no-reply@example.com"), "base64url").toString("utf8");
    expect(mime).toContain("To: participant@example.com");
    expect(mime).not.toContain("Content-Disposition: attachment");
  });
  it("builds a Batch 14 QR message with its own reference", () => {
    const batch = { ...message, reference: "B14-ABCDEF123456" };
    const mime = Buffer.from(buildGmailMessage(batch, "no-reply@example.com"), "base64url").toString("utf8");
    expect(mime).toContain('workshop-B14-ABCDEF123456.png');
  });
  it("refreshes OAuth and sends the encoded message through Gmail API", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "access-token" }) })
      .mockResolvedValueOnce({ ok: true });
    globalThis.fetch = fetchMock;
    await sendGmailMessage(message);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/token");
    expect(fetchMock.mock.calls[1][0]).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer access-token");
  });
  it("never sends if OAuth refresh fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    globalThis.fetch = fetchMock;
    await expect(sendGmailMessage(message)).rejects.toThrow("Google OAuth token refresh failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("treats an ambiguous Gmail server failure as uncertain delivery", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "access-token" }) })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(sendGmailMessage(message)).rejects.toBeInstanceOf(GmailDeliveryUncertainError);
  });
});
