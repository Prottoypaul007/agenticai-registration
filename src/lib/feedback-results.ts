import {
  activityOptions, courseOptions, creditOptions, disciplineOptions, frequencyOptions,
  pacingOptions, ratingOptions, toolOptions
} from "@/lib/feedback";

type Row = Record<string, unknown>;
const distribution = (rows: Row[], field: string, options: readonly (string | number)[], array = false) =>
  options.map(option => ({ label: String(option), count: rows.filter(row => array
    ? Array.isArray(row[field]) && row[field].includes(option) : row[field] === option).length }));
const ratings = ["overall_quality", "clarity", "relevance", "examples", "confidence"] as const;

export function summarizeFeedback(background: Row[], workshop1: Row[], workshop2: Row[]) {
  const workshop = (rows: Row[]) => ({
    total: rows.length,
    ratings: Object.fromEntries(ratings.map(field => [field, {
      average: rows.length ? Number((rows.reduce((sum, row) => sum + Number(row[field] || 0), 0) / rows.length).toFixed(2)) : null,
      distribution: distribution(rows, field, ratingOptions)
    }])),
    pacing: distribution(rows, "pacing", pacingOptions),
    comments: {
      most_valuable: rows.map(row => String(row.most_valuable || "")).filter(Boolean),
      improvements: rows.map(row => String(row.improvements || "")).filter(Boolean)
    }
  });
  return {
    background: {
      total: background.length,
      academic_discipline: distribution(background, "academic_discipline", disciplineOptions),
      software_credits: distribution(background, "software_credits", creditOptions),
      ai_use_frequency: distribution(background, "ai_use_frequency", frequencyOptions),
      ai_tools: distribution(background, "ai_tools", toolOptions, true),
      ai_activities: distribution(background, "ai_activities", activityOptions, true),
      ai_coursework: distribution(background, "ai_coursework", courseOptions),
      agentic_coursework: distribution(background, "agentic_coursework", courseOptions),
      agentic_familiarity: distribution(background, "agentic_familiarity", ratingOptions)
    },
    "workshop-1": workshop(workshop1),
    "workshop-2": workshop(workshop2)
  };
}
