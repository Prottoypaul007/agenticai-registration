import { describe, expect, it } from "vitest";
import { asSearchResult, matchesStudentSearch } from "./student-search";

const outsider = asSearchResult({
  id: "outside-1", reference: "OUT-1", full_name: "Prottoy Paul", email: "Prottoy@example.com",
  phone: "+880 1700-123456", payment_transaction_id: "BKA-123", payment_status: "verified",
  qr_status: "sent", registration_status: "confirmed", created_at: "2026-10-01T00:00:00Z"
}, "outsiders");

describe("student search", () => {
  it("matches name, transaction ID, contact number, and email without case sensitivity", () => {
    for (const query of ["prottoy", "bka-123", "1700123456", "EXAMPLE.COM"])
      expect(matchesStudentSearch(outsider, query)).toBe(true);
    expect(matchesStudentSearch(outsider, "someone else")).toBe(false);
  });

  it("finds a Batch 14 payment conflict by its original Sheet transaction ID", () => {
    const batch14 = asSearchResult({
      ...outsider, id: "batch-1", reference: "B14-1", payment_transaction_id: null,
      source_data: { "Transaction ID": "NAGAD-999" }
    }, "batch14");
    expect(batch14.payment_transaction_id).toBe("NAGAD-999");
    expect(matchesStudentSearch(batch14, "nagad-999")).toBe(true);
  });
});
