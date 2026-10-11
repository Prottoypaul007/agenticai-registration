import { describe, expect, it } from "vitest";
import { parseBatch14Sheet } from "./batch14-sheet";

describe("Batch 14 Google Form rows", () => {
  const headers = ["Timestamp", "Full Name", "Email Address", "Contact Number", "Department ",
    "Academic Year / Semester", "Preferred Payment Method", "Transaction ID", "Bank name", "Branch Name", "Bank Account Number"];
  it("maps the real Form headers and defaults to both workshop days", () => {
    expect(parseBatch14Sheet([headers, ["2026-10-11", "Student One", "ONE@EXAMPLE.COM", "01700000000", "IIT", "4th", "bKash", "abc123", "Bank", "Dhaka", "123"]]))
      .toMatchObject([{ source_row: 2, full_name: "Student One", email: "one@example.com", attendance: "Both Days",
        payment_method: "bKash", payment_transaction_id: "abc123", bank_name: "Bank" }]);
  });
  it("rejects missing identity instead of silently losing a seat", () => {
    expect(() => parseBatch14Sheet([headers, ["2026-10-11", "", "bad", "", "", "", "", ""]])).toThrow("Row 2");
  });
});
