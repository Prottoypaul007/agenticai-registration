import { z } from "zod";

export const formKeys = ["workshop-1", "workshop-2"] as const;
export type FormKey = (typeof formKeys)[number];
export const formDetails: Record<FormKey, { title: string; date: string; focus: string }> = {
  "workshop-1": {
    title: "Workshop on Agentic Architecture: Next-Gen Software Development",
    date: "17 October 2026",
    focus: "Foundations, AI agents, and agentic software architecture."
  },
  "workshop-2": {
    title: "Workshop on Agentic Systems in Action: Build, Evaluate, and Showcase",
    date: "18 October 2026",
    focus: "Building agentic applications, integrating tools, evaluating behavior, and showcasing solutions."
  }
};

export const helpfulnessOptions = ["Extremely helpful", "Very helpful", "Moderately helpful", "Slightly helpful", "Not helpful"] as const;
export const outcomeConfidenceOptions = ["Very confident", "Somewhat confident", "Not yet confident"] as const;
export const focusAreaOptions = {
  "workshop-1": ["Agent roles and planning", "Agentic architecture and workflows", "Tool use and orchestration", "Evaluation and reliability", "Everything was clear"],
  "workshop-2": ["Building the agent workflow", "Connecting tools and APIs", "Testing and evaluating behavior", "Deploying and showcasing", "I did not need more practice"]
} as const;
export const futureWorkshopOptions = ["Yes", "Maybe", "No"] as const;
export const courseSupportOptions = ["Yes", "No", "Not sure"] as const;
export const academicYearOptions = ["1st Year", "2nd Year", "3rd Year", "4th Year"] as const;
export const privacyNotice = "Your feedback is anonymous. No personal information is required. Please avoid including personal details in your written suggestions.";

const suggestion = z.string().trim().max(500, "Keep your suggestion under 500 characters.")
  .refine(value => !/(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?88)?01\d{9}|https?:\/\/\S+)/i.test(value),
    "Please remove email addresses, phone numbers, and links from written suggestions.")
  .refine(value => !/<[^>]*>/.test(value), "Please use plain text without HTML tags.");

export const workshopSchema = z.strictObject({
  learning_helpfulness: z.enum(helpfulnessOptions),
  outcome_confidence: z.enum(outcomeConfidenceOptions),
  focus_area: z.enum([...focusAreaOptions["workshop-1"], ...focusAreaOptions["workshop-2"]]),
  future_workshops: z.enum(futureWorkshopOptions),
  improvements: suggestion.default(""),
  course_support: z.enum(courseSupportOptions),
  academic_year: z.enum(academicYearOptions).nullable().default(null),
  course_suggestions: suggestion.default("")
}).superRefine((value, context) => {
  if (value.course_support === "Yes" && !value.academic_year)
    context.addIssue({ code: "custom", path: ["academic_year"], message: "Choose an academic year." });
  if (value.course_support !== "Yes" && value.academic_year)
    context.addIssue({ code: "custom", path: ["academic_year"], message: "Academic year is only needed when you select Yes." });
});
export type WorkshopAnswers = z.infer<typeof workshopSchema>;

export const workshopSchemaFor = (form: FormKey) => workshopSchema.superRefine((value, context) => {
  if (!(focusAreaOptions[form] as readonly string[]).includes(value.focus_area))
    context.addIssue({ code: "custom", path: ["focus_area"], message: "Choose an option for this workshop." });
});

export const submissionSchemaFor = (form: FormKey) => z.strictObject({
  request_id: z.uuid(),
  answers: workshopSchemaFor(form)
});

export type FormSchedule = { key: FormKey; opens_at: string; closes_at: string | null; enabled: boolean };
export function availability(form: FormSchedule, now = new Date()): "upcoming" | "open" | "closed" {
  if (!form.enabled) return "closed";
  if (now < new Date(form.opens_at)) return "upcoming";
  if (form.closes_at && now >= new Date(form.closes_at)) return "closed";
  return "open";
}
export function openingDate(form: FormSchedule) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "long", year: "numeric" }).format(new Date(form.opens_at));
}
export const scheduleSchema = z.strictObject({
  key: z.enum(formKeys), opens_at: z.iso.datetime({ offset: true }),
  closes_at: z.iso.datetime({ offset: true }).nullable(), enabled: z.boolean()
}).refine(value => !value.closes_at || new Date(value.closes_at) > new Date(value.opens_at),
  { message: "Closing time must be after opening time.", path: ["closes_at"] });
