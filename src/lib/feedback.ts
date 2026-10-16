import { z } from "zod";

export const formKeys = ["pre-workshop", "workshop-1", "workshop-2"] as const;
export type FormKey = (typeof formKeys)[number];
export const formDetails: Record<FormKey, { title: string; date: string; description: string }> = {
  "pre-workshop": { title: "Pre-Workshop Background Survey", date: "Before the workshops", description: "Tell us about your academic background and experience with AI tools." },
  "workshop-1": { title: "Workshop on Agentic Architecture: Next-Gen Software Development", date: "17 October 2026", description: "Share your experience of the first workshop." },
  "workshop-2": { title: "Workshop on Agentic Systems in Action: Build, Evaluate, and Showcase", date: "18 October 2026", description: "Share your experience of the second workshop." }
};
export const disciplineOptions = ["Software Engineering", "Computer Science", "Computer Science and Engineering", "Other Engineering Discipline", "Other", "Prefer not to say"] as const;
export const creditOptions = ["Below 10 credits", "10–19 credits", "20–29 credits", "30 credits or more", "Not sure"] as const;
export const frequencyOptions = ["Never", "Rarely", "Sometimes", "Frequently", "Daily"] as const;
export const toolOptions = ["ChatGPT", "Claude", "Gemini", "GitHub Copilot", "Cursor", "Other AI tools", "I have not used any AI tools"] as const;
export const activityOptions = ["Learning or understanding programming concepts", "Code generation", "Debugging", "Software testing", "Documentation", "Software architecture or design", "Research and problem-solving", "Other", "I have not used AI tools"] as const;
export const courseOptions = ["Yes", "Currently enrolled", "No", "Not sure"] as const;
export const pacingOptions = ["Too slow", "Appropriate", "Too fast"] as const;
export const ratingOptions = [1, 2, 3, 4, 5] as const;
export const privacyNotice = "This survey is anonymous. We do not ask for your name, email, student ID, or registration information. Please do not include personal information in written responses.";

const multiple = <T extends readonly [string, ...string[]]>(options: T, none: string) =>
  z.array(z.enum(options)).min(1, "Choose at least one option.").max(options.length)
    .refine(values => new Set(values).size === values.length, "Choose each option only once.")
    .refine(values => !values.includes(none as T[number]) || values.length === 1, "The 'I have not used' option cannot be combined with other answers.");
export const backgroundSchema = z.strictObject({
  academic_discipline: z.enum(disciplineOptions),
  software_credits: z.enum(creditOptions),
  ai_use_frequency: z.enum(frequencyOptions),
  ai_tools: multiple(toolOptions, "I have not used any AI tools"),
  ai_activities: multiple(activityOptions, "I have not used AI tools"),
  ai_coursework: z.enum(courseOptions),
  agentic_coursework: z.enum(courseOptions),
  agentic_familiarity: z.number().int().min(1).max(5)
});
const anonymousComment = z.string().trim().max(1000, "Keep your response under 1,000 characters.")
  .refine(value => !/(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?88)?01\d{9}|https?:\/\/\S+)/i.test(value),
    "Please remove email addresses, phone numbers, and links from written responses.")
  .refine(value => !/<[^>]*>/.test(value), "Please use plain text without HTML tags.");
export const workshopSchema = z.strictObject({
  overall_quality: z.number().int().min(1).max(5),
  clarity: z.number().int().min(1).max(5),
  relevance: z.number().int().min(1).max(5),
  examples: z.number().int().min(1).max(5),
  confidence: z.number().int().min(1).max(5),
  pacing: z.enum(pacingOptions),
  most_valuable: anonymousComment,
  improvements: anonymousComment
});
export type BackgroundAnswers = z.infer<typeof backgroundSchema>;
export type WorkshopAnswers = z.infer<typeof workshopSchema>;

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
