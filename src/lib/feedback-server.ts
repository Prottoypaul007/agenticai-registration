import { serviceClient } from "@/lib/supabase";
import { formKeys, type FormSchedule } from "@/lib/feedback";

export async function feedbackSchedules(): Promise<FormSchedule[]> {
  const { data, error } = await serviceClient().from("feedback_forms")
    .select("key,opens_at,closes_at,enabled");
  if (error) throw new Error("Feedback forms are temporarily unavailable.");
  return formKeys.map(key => data?.find(row => row.key === key)).filter((row): row is FormSchedule => Boolean(row));
}
