export type ExportGroup = "all" | "outsiders" | "batch14";

// Keep the former outsider export columns, then add fields specific to Batch 14.
const columns = ["registration_group", "reference", "full_name", "email", "phone", "institution", "department", "academic_year", "student_id", "traditional_development", "ai_tools_basics", "built_software_project", "programming_languages", "programming_level", "python_familiarity", "api_experience", "ai_familiarity", "agent_experience", "paid_llm_subscription", "paid_llm_models", "paid_llm_other_model", "attendance", "bringing_laptop", "development_environment", "local_model_laptop", "learning_expectations", "payment_amount_bdt", "payment_method", "payment_destination", "payment_transaction_id", "payment_status", "bank_name", "bank_account_holder_name", "bank_account_number", "bank_branch", "completion_status", "refund_status", "refund_reference", "registration_status", "qr_status", "qr_reviewed_at", "qr_reviewed_by", "qr_sent_at", "qr_sent_by", "rejection_reason_code", "rejection_reason_detail", "rejected_at", "rejected_by", "rejection_email_status", "rejection_email_sent_at", "confirmation_email_status", "confirmation_email_sent_at", "day1_checked_in_at", "day2_checked_in_at", "created_at", "source_row", "import_issue", "source_data"];

function csvCell(value: unknown) {
  const raw = Array.isArray(value) ? value.join("; ") :
    value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  // Spreadsheet programs can interpret untrusted cell values as formulas.
  const safe = /^[\s]*[=+@\-]/.test(raw) || /^[\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildRegistrationCsv(outsiders: Record<string, unknown>[], batch14: Record<string, unknown>[]) {
  const formColumns = [...new Set(batch14.flatMap(row =>
    row.source_data && typeof row.source_data === "object" && !Array.isArray(row.source_data)
      ? Object.keys(row.source_data) : []))];
  const headers = [...columns, ...formColumns.map(key => `Google Form: ${key}`)];
  const rows: Record<string, unknown>[] = [
    ...outsiders.map(row => ({ ...row, registration_group: "Outsider" })),
    ...batch14.map(row => ({ ...row, registration_group: "Batch 14" }))
  ];
  rows.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  const lines = rows.map(row => {
    const form = row.source_data && typeof row.source_data === "object" && !Array.isArray(row.source_data)
      ? row.source_data as Record<string, unknown> : {};
    return [...columns.map(key => csvCell(row[key])), ...formColumns.map(key => csvCell(form[key]))].join(",");
  });
  return "\uFEFF" + [headers.map(csvCell).join(","), ...lines].join("\r\n");
}
