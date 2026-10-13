import { NextRequest, NextResponse } from "next/server";
import { adminUser, serviceClient } from "@/lib/supabase";
import { asSearchResult, matchesStudentSearch, type StudentSearchResult } from "@/lib/student-search";

export async function GET(request: NextRequest) {
  if (!await adminUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (query.length < 2 || query.length > 100)
    return NextResponse.json({ error: "Enter at least 2 characters (up to 100)." }, { status: 400 });

  const client = serviceClient();
  const rows: StudentSearchResult[] = [];
  for (const source of ["outsiders", "batch14"] as const) {
    const table = source === "outsiders" ? "registrations" : "batch14_registrations";
    const columns = "id,reference,full_name,email,phone,payment_transaction_id,payment_status,qr_status,created_at" +
      (source === "outsiders" ? ",registration_status" : ",source_data");
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from(table).select(columns).order("created_at", { ascending: false }).range(offset, offset + 499);
      if (error) return NextResponse.json({ error: "Unable to search registrations." }, { status: 500 });
      for (const row of data || []) rows.push(asSearchResult(row as unknown as Parameters<typeof asSearchResult>[0], source));
      if (!data || data.length < 500) break;
    }
  }
  const matches = rows.filter(row => matchesStudentSearch(row, query))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return NextResponse.json({ results: matches.slice(0, 50), count: matches.length });
}
