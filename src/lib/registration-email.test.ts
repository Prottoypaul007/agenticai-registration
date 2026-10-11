import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ single: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ serviceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }) }) }));
vi.mock("@/lib/gmail", () => ({ sendGmailMessage: mocks.send }));
import { sendRegistrationEmail } from "./registration-email";

describe("QR email approval gate", () => {
  it("does not create or send a QR while a registration awaits admin review", async () => {
    mocks.single.mockResolvedValue({ data: {
      reference: "AGNT-ABCDEF123456", full_name: "Test Participant", email: "test@example.com",
      institution: "IIT", attendance: "Both Days", qr_status: "pending_review", qr_reviewed_by: null,
      confirmation_email_status: "pending"
    }, error: null });
    await expect(sendRegistrationEmail("AGNT-ABCDEF123456")).rejects.toThrow("requires an admin payment review");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
