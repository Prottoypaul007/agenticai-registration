import { serviceClient } from "@/lib/supabase";
import { summarizeFeedback } from "@/lib/feedback-results";

async function rows(table: "workshop_feedback_v2" | "workshop_feedback_responses", fields: string) {
  const result: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await serviceClient().from(table).select(fields).range(offset, offset + 999);
    if (error) throw new Error("Unable to read anonymous results.");
    result.push(...((data || []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < 1000) return result;
  }
}

export async function loadFeedbackResults() {
  const [workshops, historical] = await Promise.all([
    rows("workshop_feedback_v2", "form_key,response_version,learning_helpfulness,outcome_confidence,focus_area,future_workshops,improvements,course_support,academic_year,course_suggestions"),
    rows("workshop_feedback_responses", "form_key")
  ]);
  return summarizeFeedback(workshops.filter(row => row.form_key === "workshop-1"),
    workshops.filter(row => row.form_key === "workshop-2"), historical);
}
