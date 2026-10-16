import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildRegistrationPdf } from "./registration-pdf";

const venue = "Institute of Information Technology (IIT), University of Dhaka";

describe("Bengali daily registration sheets", () => {
  it("creates attendance and honorarium sheets for both days with QR-sent participants", async () => {
    const outsiders = Array.from({ length: 8 }, (_, index) => ({
      full_name: index === 0 ? "প্রত্যয় Paul" : `Participant ${index}`,
      email: `participant${index}@example.com`, phone: "01700000000",
      institution: "University of Dhaka", attendance: "Both Days",
      bank_name: "Example Bank", bank_branch: "Dhaka", bank_account_number: "001234567890",
      registration_status: "confirmed", qr_status: "sent"
    }));
    const batch14 = [{ full_name: "Batch Student", attendance: "Both Days", qr_status: "sent" }];
    const pdf = await buildRegistrationPdf(outsiders, batch14, "all", venue);
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
    // Nine attendees need two attendance and two honorarium pages per day.
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(8);
  }, 15000);

  it("excludes pending and rejected registrations and follows the selected day", async () => {
    const confirmed = Array.from({ length: 7 }, (_, index) => ({ full_name: `Person ${index}`, qr_status: "sent", registration_status: "confirmed", attendance: "Day 1 Only" }));
    const excluded: Record<string, unknown>[] = Array.from({ length: 8 }, (_, index) => ({ full_name: `Pending ${index}`, qr_status: "pending_review" }));
    excluded.push({ full_name: "Rejected", qr_status: "sent", registration_status: "rejected" });
    const pdf = await buildRegistrationPdf([...confirmed, ...excluded], [], "outsiders", venue);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(5);
  });

  it("creates four empty daily sheets when no QR has been sent", async () => {
    const pdf = await buildRegistrationPdf([{ full_name: "Pending", qr_status: "pending_review" }], [], "outsiders", venue);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(4);
  });
});
