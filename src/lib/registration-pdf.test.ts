import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildRegistrationPdf } from "./registration-pdf";

describe("registration PDF roster", () => {
  it("includes every registration across multiple pages with mixed English and Bengali names", async () => {
    const outsiders = Array.from({ length: 25 }, (_, index) => ({
      reference: `AGNT-${String(index).padStart(12, "0")}`,
      full_name: index === 0 ? "প্রত্যয় Paul" : `Participant ${index}`,
      email: `participant${index}@example.com`, phone: "01700000000", department: "Software Engineering",
      registration_status: "confirmed", qr_status: "sent", created_at: `2026-10-13T${String(index % 24).padStart(2, "0")}:00:00Z`
    }));
    const pdf = await buildRegistrationPdf(outsiders, [{ reference: "B14-ABCDEF123456", full_name: "Batch Student" }], "all");
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(3);
  });

  it("generates an empty roster page", async () => {
    const pdf = await buildRegistrationPdf([], [], "outsiders");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });
});
