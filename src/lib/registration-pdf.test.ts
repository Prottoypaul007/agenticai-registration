import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildRegistrationPdf } from "./registration-pdf";

describe("payment signature PDF", () => {
  it("includes QR-sent participants across multiple pages with mixed English and Bengali names", async () => {
    const outsiders = Array.from({ length: 25 }, (_, index) => ({
      reference: `AGNT-${String(index).padStart(12, "0")}`,
      full_name: index === 0 ? "প্রত্যয় Paul" : `Participant ${index}`,
      email: `participant${index}@example.com`, phone: "01700000000",
      bank_name: "Example Bank", bank_branch: "Dhaka", bank_account_number: "001234567890",
      registration_status: "confirmed", qr_status: "sent", created_at: `2026-10-13T${String(index % 24).padStart(2, "0")}:00:00Z`
    }));
    const pdf = await buildRegistrationPdf(outsiders, [{ reference: "B14-ABCDEF123456", full_name: "Batch Student", qr_status: "sent" }], "all");
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(4);
  }, 15000);

  it("does not include pending or rejected registrations in the signature sheet", async () => {
    const confirmed = Array.from({ length: 7 }, (_, index) => ({ full_name: `Person ${index}`, qr_status: "sent", registration_status: "confirmed" }));
    const excluded: Record<string, unknown>[] = Array.from({ length: 8 }, (_, index) => ({ full_name: `Pending ${index}`, qr_status: "pending_review" }));
    excluded.push({ full_name: "Rejected", qr_status: "sent", registration_status: "rejected" });
    const pdf = await buildRegistrationPdf([...confirmed, ...excluded], [], "outsiders");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it("generates an empty signature sheet when no QR has been sent", async () => {
    const pdf = await buildRegistrationPdf([{ full_name: "Pending", qr_status: "pending_review" }], [], "outsiders");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });
});
