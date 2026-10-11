import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
vi.mock("@/lib/utils", () => ({ configured: () => true }));
vi.mock("@/lib/supabase", () => ({ serviceClient: () => ({ rpc }) }));
import { POST } from "./route";

const payload = {
  full_name: "Test Participant", email: "TEST@example.com", phone: "+8801712345678",
  institution: "IIT", department: "CSE", academic_year: "3rd year", student_id: "",
  programming_languages: ["Python"], programming_level: "Intermediate", python_familiarity: "Basic",
  api_experience: "Yes", ai_familiarity: "Basic", agent_experience: "No", attendance: "Both Days",
  traditional_development: "Yes", ai_tools_basics: "Yes", built_software_project: "No",
  paid_llm_subscription: "Yes", paid_llm_models: ["Claude", "Gemini"], paid_llm_other_model: "", local_model_laptop: "Yes",
  bringing_laptop: "Yes", development_environment: "Not Sure", learning_expectations: "",
  payment_method: "bkash", payment_transaction_id: "ABC12345", bank_name: "Example Bank", bank_account_holder_name: "Test Participant",
  bank_account_number: "1234567890", bank_branch: "",
  declaration_accepted: true, privacy_accepted: true
};
describe("public registration route", () => {
  beforeEach(() => rpc.mockReset());
  it("returns a conflict when the atomic database function detects a duplicate", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "duplicate_registration" } });
    const response = await POST(new NextRequest("http://localhost/api/register", { method: "POST", body: JSON.stringify(payload) }));
    expect(response.status).toBe(409);
    expect(rpc).toHaveBeenCalledWith("submit_registration", expect.objectContaining({ p_payload: expect.objectContaining({ email: "test@example.com", paid_llm_models: ["Claude", "Gemini"], local_model_laptop: "Yes" }) }));
  });
  it("rejects an already-used payment transaction ID", async () => {
    rpc.mockResolvedValue({ data: { error: "duplicate_transaction" }, error: null });
    const response = await POST(new NextRequest("http://localhost/api/register", { method: "POST", body: JSON.stringify(payload) }));
    expect(response.status).toBe(409);
  });
  it("stores a registration for review without issuing a QR or sending email", async () => {
    rpc.mockResolvedValue({ data: { reference: "AGNT-ABCDEF123456", status: "pending" }, error: null });
    const response = await POST(new NextRequest("http://localhost/api/register", { method: "POST", body: JSON.stringify(payload) }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ reference: "AGNT-ABCDEF123456", status: "pending" });
  });
});
