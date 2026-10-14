import { z } from "zod";
import { EVENT_VENUE } from "@/lib/venue";

const required = (label: string, max = 120) => z.string().trim().min(1, `${label} is required`).max(max);
export const registrationSchema = z.object({
  full_name: required("Full name"),
  email: z.string().trim().email("Enter a valid email address").max(254).transform(v => v.toLowerCase()),
  phone: z.string().trim().regex(/^\+?[0-9][0-9\s()-]{6,18}$/, "Enter a valid contact number"),
  institution: required("Institution"),
  department: required("Department"),
  academic_year: required("Academic year", 80),
  student_id: z.string().trim().max(80).optional().default(""),
  programming_languages: z.array(z.enum(["Python", "JavaScript / TypeScript", "Java", "C / C++", "Other", "None"])).min(1, "Select at least one option"),
  programming_level: z.enum(["Beginner", "Intermediate", "Advanced"]),
  python_familiarity: z.enum(["No experience", "Basic", "Intermediate", "Advanced"]),
  api_experience: z.enum(["Yes", "No"]),
  ai_familiarity: z.enum(["None", "Basic", "Intermediate", "Advanced"]),
  agent_experience: z.enum(["Yes", "No"]),
  paid_llm_subscription: z.enum(["Yes", "No"], { error: "Select an answer" }),
  paid_llm_models: z.array(z.enum(["GPT / ChatGPT", "Claude", "Gemini", "Grok", "DeepSeek", "Perplexity", "Other"])),
  paid_llm_other_model: z.string().trim().max(120).optional().default(""),
  local_model_laptop: z.enum(["Yes", "No", "Not Sure"], { error: "Select an answer" }),
  traditional_development: z.enum(["Yes", "No"]),
  ai_tools_basics: z.enum(["Yes", "No"]),
  built_software_project: z.enum(["Yes", "No"]),
  attendance: z.enum(["Both Days", "Day 1 Only", "Day 2 Only"]),
  bringing_laptop: z.enum(["Yes", "No"], { error: "Select an answer" }),
  development_environment: z.enum(["Yes", "No", "Not Sure"], { error: "Select an answer" }),
  learning_expectations: z.string().trim().max(2000).optional().default(""),
  payment_method: z.enum(["bkash", "rocket", "nagad"]),
  payment_transaction_id: z.string().trim().min(5, "Enter your payment transaction ID").max(50).regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers, or hyphens only").transform(v => v.toUpperCase()),
  bank_name: required("Bank name"),
  bank_account_holder_name: required("Account holder name"),
  bank_account_number: z.string().trim().regex(/^[0-9]{6,30}$/, "Enter a valid bank account number"),
  bank_branch: z.string().trim().max(120).optional().default(""),
  declaration_accepted: z.literal(true, { error: "Please accept the declaration" }),
  privacy_accepted: z.literal(true, { error: "Please acknowledge the privacy notice" })
}).superRefine((data, ctx) => {
  if (data.programming_languages.includes("None") && data.programming_languages.length > 1)
    ctx.addIssue({ code: "custom", path: ["programming_languages"], message: "None cannot be combined with another language" });
  if (data.paid_llm_subscription === "Yes" && data.paid_llm_models.length === 0)
    ctx.addIssue({ code: "custom", path: ["paid_llm_models"], message: "Select at least one model or service" });
  if (data.paid_llm_subscription === "No" && (data.paid_llm_models.length > 0 || data.paid_llm_other_model))
    ctx.addIssue({ code: "custom", path: ["paid_llm_models"], message: "Clear model choices when you do not have a paid subscription" });
  if (data.paid_llm_subscription === "Yes" && data.paid_llm_models.includes("Other") && !data.paid_llm_other_model)
    ctx.addIssue({ code: "custom", path: ["paid_llm_other_model"], message: "Enter the other model or service" });
  if (!data.paid_llm_models.includes("Other") && data.paid_llm_other_model)
    ctx.addIssue({ code: "custom", path: ["paid_llm_other_model"], message: "Select Other to enter a model or service" });
  const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  if (normalizeName(data.full_name) !== normalizeName(data.bank_account_holder_name))
    ctx.addIssue({ code: "custom", path: ["bank_account_holder_name"], message: "The bank account must be in your name, matching the full name above" });
});

export function paymentAmount(attendance: RegistrationInput["attendance"]) {
  return attendance === "Both Days" ? 2000 : 1000;
}

export type RegistrationInput = z.input<typeof registrationSchema>;
export type Registration = z.output<typeof registrationSchema>;
export const settingsSchema = z.object({
  registration_opens_at: z.iso.datetime({ offset: true }).nullable(),
  registration_closes_at: z.iso.datetime({ offset: true }).nullable(),
  capacity: z.number().int().positive().nullable(),
  outsider_registration_enabled: z.boolean(),
  approval_required: z.boolean(),
  allow_single_day: z.boolean(),
  event_time: z.string().trim().max(120),
  venue: z.string().trim().min(1).max(200),
  require_iit_student_id: z.boolean(),
  bkash_merchant_number: z.string().trim().regex(/^01[0-9]{9}$/, "Enter an 11-digit bKash number").nullable(),
  rocket_number: z.string().trim().regex(/^01[0-9]{10}$/, "Enter a 12-digit Rocket account number").nullable(),
  nagad_number: z.string().trim().regex(/^01[0-9]{9}$/, "Enter an 11-digit Nagad number").nullable()
}).refine(v => !v.registration_opens_at || !v.registration_closes_at || new Date(v.registration_opens_at) < new Date(v.registration_closes_at), {
  message: "Closing time must be after opening time", path: ["registration_closes_at"]
});
export type EventSettings = z.infer<typeof settingsSchema>;
export const defaultSettings: EventSettings = {
  registration_opens_at: null, registration_closes_at: null, capacity: null, outsider_registration_enabled: false,
  approval_required: true, allow_single_day: true, event_time: "To Be Announced",
  venue: EVENT_VENUE, require_iit_student_id: false,
  bkash_merchant_number: null, rocket_number: null, nagad_number: null
};
