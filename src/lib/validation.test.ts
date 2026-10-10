import { describe, expect, it } from "vitest";
import { paymentAmount, registrationSchema, settingsSchema } from "./validation";

const valid = {
  full_name: "Test Participant", email: "  TEST@EXAMPLE.COM  ", phone: "+880 1712345678",
  institution: "IIT", department: "CSE", academic_year: "3rd year", student_id: "",
  programming_languages: ["Python"], programming_level: "Intermediate", python_familiarity: "Basic",
  api_experience: "Yes", ai_familiarity: "Basic", agent_experience: "No", attendance: "Both Days",
  traditional_development: "Yes", ai_tools_basics: "Yes", built_software_project: "No",
  paid_llm_subscription: "No", paid_llm_models: [], paid_llm_other_model: "", local_model_laptop: "Not Sure",
  bringing_laptop: "Yes", development_environment: "Not Sure", learning_expectations: "Build an agent",
  payment_method: "bkash", payment_transaction_id: " ab12cd34 ", bank_name: "Example Bank", bank_account_holder_name: "Test Participant",
  bank_account_number: "1234567890", bank_branch: "Dhaka",
  declaration_accepted: true, privacy_accepted: true
};
describe("registration validation", () => {
  it("normalizes email and accepts a complete submission", () => {
    expect(registrationSchema.parse(valid).email).toBe("test@example.com");
    expect(registrationSchema.parse(valid).payment_transaction_id).toBe("AB12CD34");
  });
  it("rejects missing consent, invalid phone, and contradictory language choices", () => {
    expect(registrationSchema.safeParse({ ...valid, privacy_accepted: false }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...valid, phone: "abc" }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...valid, programming_languages: ["None", "Python"] }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...valid, bank_account_holder_name: "Someone Else" }).success).toBe(false);
  });
  it("charges one day per selected session", () => {
    expect(paymentAmount("Day 1 Only")).toBe(1000);
    expect(paymentAmount("Day 2 Only")).toBe(1000);
    expect(paymentAmount("Both Days")).toBe(2000);
  });
  it("requires model choices for paid subscriptions and a name for Other", () => {
    expect(registrationSchema.safeParse({ ...valid, paid_llm_subscription: "Yes" }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...valid, paid_llm_subscription: "Yes", paid_llm_models: ["Claude", "Gemini"] }).success).toBe(true);
    expect(registrationSchema.safeParse({ ...valid, paid_llm_subscription: "Yes", paid_llm_models: ["Other"] }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...valid, paid_llm_subscription: "Yes", paid_llm_models: ["Other"], paid_llm_other_model: "Qwen" }).success).toBe(true);
    expect(registrationSchema.safeParse({ ...valid, paid_llm_models: ["Claude"] }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...valid, local_model_laptop: undefined }).success).toBe(false);
  });
  it("accepts Rocket payments and keeps an unconfirmed Nagad number out of settings", () => {
    expect(registrationSchema.safeParse({ ...valid, payment_method: "rocket" }).success).toBe(true);
    const settings = {
      registration_opens_at: null, registration_closes_at: null, capacity: null,
      approval_required: false, allow_single_day: true, event_time: "To Be Announced",
      venue: "Institute of Information Technology (IIT)", require_iit_student_id: false,
      bkash_merchant_number: "01817889286", rocket_number: "018178892865", nagad_number: "0180000000000"
    };
    expect(settingsSchema.safeParse(settings).success).toBe(false);
    expect(settingsSchema.safeParse({ ...settings, nagad_number: null }).success).toBe(true);
  });
});
