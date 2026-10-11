import { describe, expect, it } from "vitest";
import { buildRegistrationCsv } from "./registration-export";

describe("registration CSV", () => {
  it("combines both registration groups and exposes Google Form answers", () => {
    const csv = buildRegistrationCsv(
      [{ reference: "AGNT-1", full_name: "Outside student", created_at: "2026-10-10T00:00:00Z" }],
      [{ reference: "B14-1", full_name: "Batch student", created_at: "2026-10-11T00:00:00Z",
        source_row: 2, source_data: { "Academic Year / Semester": "4th year", "Transaction ID": "ABC123" } }]
    );
    expect(csv).toContain('"registration_group"');
    expect(csv).toContain('"Google Form: Academic Year / Semester"');
    expect(csv).toContain('"Google Form: Transaction ID"');
    expect(csv).toContain('"Batch 14","B14-1"');
    expect(csv).toContain('"Outsider","AGNT-1"');
    expect(csv.indexOf('"B14-1"')).toBeLessThan(csv.indexOf('"AGNT-1"'));
  });

  it("keeps spreadsheet formulas in participant answers as text", () => {
    const csv = buildRegistrationCsv(
      [{ full_name: '=HYPERLINK("bad")' }],
      [{ source_data: { Notes: " +2+2" } }]
    );
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"\' +2+2"');
  });
});
