import { NextResponse } from "next/server";
import { adminUser, serviceClient } from "@/lib/supabase";

const columns = ["reference","full_name","email","phone","institution","department","academic_year","student_id","traditional_development","ai_tools_basics","built_software_project","programming_languages","programming_level","python_familiarity","api_experience","ai_familiarity","agent_experience","attendance","bringing_laptop","development_environment","learning_expectations","payment_amount_bdt","payment_method","payment_destination","payment_transaction_id","payment_status","bank_name","bank_account_holder_name","bank_account_number","bank_branch","completion_status","refund_status","refund_reference","registration_status","created_at"] as const;
function csvCell(value: unknown) {
  const raw = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  const safe = /^[\s]*[=+@\-]/.test(raw) || /^[\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
export async function GET() {
  if (!await adminUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = serviceClient();
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("registrations").select("*").order("created_at", { ascending: false }).range(offset, offset + 999);
    if (error) return NextResponse.json({ error: "Unable to export participants" }, { status: 500 });
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const csv = "\uFEFF" + [columns.join(","), ...rows.map(row => columns.map(key => csvCell(row[key])).join(","))].join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="agentic-workshop-registrations.csv"', "Cache-Control": "no-store" } });
}
