import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildRegistrationPdf } from "./registration-pdf";

const venue = "Institute of Information Technology (IIT), University of Dhaka";

describe("separate Bengali daily registration sheets", () => {
  it("creates the four daily downloads with their own pagination", async () => {
    const outsiders = Array.from({ length: 8 }, (_, index) => ({
      full_name: index === 0 ? "প্রত্যয় Paul" : `Participant ${index}`,
      email: `participant${index}@example.com`, phone: "01700000000",
      institution: "University of Dhaka", attendance: "Both Days",
      bank_name: "Example Bank", bank_branch: "Dhaka", bank_account_number: "001234567890",
      registration_status: "confirmed", qr_status: "sent"
    }));
    const batch14 = [{ full_name: "Batch Student", attendance: "Both Days", qr_status: "sent" }];
    for (const day of [1, 2] as const) {
      for (const sheet of ["attendance", "honorarium"] as const) {
        const pdf = await buildRegistrationPdf(outsiders, batch14, "all", venue, day, sheet);
        expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
        expect((await PDFDocument.load(pdf)).getPageCount()).toBe(sheet === "attendance" ? 2 : 3);
      }
    }
  }, 20000);

  it("excludes pending, rejected, and other-day registrations", async () => {
    const confirmed = Array.from({ length: 7 }, (_, index) => ({ full_name: `Person ${index}`, qr_status: "sent", registration_status: "confirmed", attendance: "Day 1 Only" }));
    const excluded: Record<string, unknown>[] = Array.from({ length: 8 }, (_, index) => ({ full_name: `Pending ${index}`, qr_status: "pending_review" }));
    excluded.push({ full_name: "Rejected", qr_status: "sent", registration_status: "rejected" });
    const first = await buildRegistrationPdf([...confirmed, ...excluded], [], "outsiders", venue, 1, "honorarium");
    const second = await buildRegistrationPdf([...confirmed, ...excluded], [], "outsiders", venue, 2, "honorarium");
    expect((await PDFDocument.load(first)).getPageCount()).toBe(2);
    expect((await PDFDocument.load(second)).getPageCount()).toBe(1);
  });
});
