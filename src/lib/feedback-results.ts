import { academicYearOptions, courseSupportOptions, focusAreaOptions, futureWorkshopOptions,
  helpfulnessOptions, outcomeConfidenceOptions, type FormKey } from "@/lib/feedback";

type Row = Record<string, unknown>;
const distribution = (rows: Row[], field: string, options: readonly string[]) =>
  options.map(option => ({ label: option, count: rows.filter(row => row[field] === option).length }));

function workshop(rows: Row[], form: FormKey) {
  const supporting = rows.filter(row => row.course_support === "Yes");
  const specific = rows.filter(row => row.response_version === 2);
  return {
    total: rows.length,
    helpfulness: distribution(rows, "learning_helpfulness", helpfulnessOptions),
    specificAnswers: specific.length,
    confidence: distribution(specific, "outcome_confidence", outcomeConfidenceOptions),
    focusAreas: distribution(specific, "focus_area", focusAreaOptions[form]),
    futureWorkshops: distribution(rows, "future_workshops", futureWorkshopOptions),
    improvements: rows.map(row => String(row.improvements || "")).filter(Boolean),
    course: {
      support: distribution(rows, "course_support", courseSupportOptions),
      supportPercent: rows.length ? Math.round(supporting.length / rows.length * 100) : 0,
      academicYears: distribution(supporting, "academic_year", academicYearOptions),
      suggestions: rows.map(row => String(row.course_suggestions || "")).filter(Boolean)
    }
  };
}

export function summarizeFeedback(workshop1: Row[], workshop2: Row[], historical: Row[] = []) {
  return {
    "workshop-1": workshop(workshop1, "workshop-1"),
    "workshop-2": workshop(workshop2, "workshop-2"),
    historical: {
      "workshop-1": historical.filter(row => row.form_key === "workshop-1").length,
      "workshop-2": historical.filter(row => row.form_key === "workshop-2").length
    }
  };
}
