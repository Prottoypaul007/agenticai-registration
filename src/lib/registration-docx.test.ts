import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { unicodeToBijoy } from "@abdalgolabs/ansi-unicode-converter";
import { buildRegistrationDocx } from "./registration-docx";

const venue = "Institute of Information Technology (IIT), University of Dhaka";
const outside = {
  full_name: "Outside Student", institution: "University of Dhaka", department: "Computer Science",
  email: "outside@example.com", phone: "01700000000", attendance: "Both Days",
  bank_name: "Example Bank", bank_branch: "Dhaka", bank_account_number: "001234567890",
  qr_status: "sent", registration_status: "confirmed"
};
const batch = {
  full_name: "Batch Student", institution: "University of Dhaka, IIT", email: "batch@example.com",
  source_data: { "Department ": "Software Engineering" }, attendance: "Both Days", qr_status: "sent"
};

async function documentXml(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes);
  return { xml: await zip.file("word/document.xml")!.async("string"), zip };
}

describe("editable Bengali Word registration sheets", () => {
  it("creates each daily sheet with department, logos, and embedded SutonnyMJ", async () => {
    for (const day of [1, 2] as const) for (const sheet of ["attendance", "honorarium"] as const) {
      const bytes = await buildRegistrationDocx([outside], [batch], "all", venue, day, sheet);
      const { xml, zip } = await documentXml(bytes);
      expect(bytes.subarray(0, 2).toString()).toBe("PK");
      expect(xml).toContain(day === 1 ? "Workshop on Agentic Architecture" : "Workshop on Agentic Systems in Action");
      expect(xml).toContain(unicodeToBijoy("বিভাগ"));
      expect(xml).toContain("Computer Science");
      expect(xml).toContain("Software Engineering");
      expect(xml).toContain("Outside Student");
      expect(xml).toContain("Batch Student");
      expect(xml).toMatch(/<w:pgSz[^>]*w:w="16838"[^>]*w:h="11906"[^>]*w:orient="landscape"/);
      expect(xml).toContain(unicodeToBijoy("স্বাক্ষর"));
      expect((xml.match(/<w:tc>/g) || []).length).toBeGreaterThanOrEqual((sheet === "attendance" ? 7 : 11) * 3);
      expect(zip.file("word/fontTable.xml")).not.toBeNull();
      expect(zip.file(/word\/fonts\/.*\.odttf$/).length).toBeGreaterThan(0);
      expect(zip.file(/word\/media\//).length).toBe(3);
      if (sheet === "honorarium") {
        expect(xml).toContain("Example Bank");
        expect(xml).toContain("001234567890");
      }
    }
  });

  it("includes only QR-sent participants for the selected day and group", async () => {
    const pending = { ...outside, full_name: "Pending Student", qr_status: "pending_review" };
    const rejected = { ...outside, full_name: "Rejected Student", registration_status: "rejected" };
    const secondDay = { ...outside, full_name: "Second Day Student", attendance: "Day 2 Only" };
    const { xml } = await documentXml(await buildRegistrationDocx([outside, pending, rejected, secondDay], [batch], "outsiders", venue, 1, "attendance"));
    expect(xml).toContain("Outside Student");
    expect(xml).not.toContain("Pending Student");
    expect(xml).not.toContain("Rejected Student");
    expect(xml).not.toContain("Second Day Student");
    expect(xml).not.toContain("Batch Student");
  });
});
