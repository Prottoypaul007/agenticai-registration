import { NextRequest, NextResponse } from "next/server";
import { adminUser, getSettings, serviceClient } from "@/lib/supabase";
import { syncBatch14Registrations } from "@/lib/batch14-sync";
import { buildRegistrationCsv, type ExportGroup } from "@/lib/registration-export";
import { buildRegistrationDocx, type WordDay, type WordSheet } from "@/lib/registration-docx";

async function allRows(table: "registrations" | "batch14_registrations") {
  const client = serviceClient();
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from(table).select("*")
      .order("created_at", { ascending: false }).range(offset, offset + 999);
    if (error) throw new Error(`Unable to read ${table}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

export async function GET(request: NextRequest) {
  const admin = await adminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const group = (request.nextUrl.searchParams.get("group") || "all") as ExportGroup;
  const format = request.nextUrl.searchParams.get("format") || "csv";
  const day = request.nextUrl.searchParams.get("day");
  const sheet = request.nextUrl.searchParams.get("sheet");
  if (!["all", "outsiders", "batch14"].includes(group))
    return NextResponse.json({ error: "Choose a valid registration group." }, { status: 400 });
  if (!["csv", "docx"].includes(format))
    return NextResponse.json({ error: "Choose CSV or Word format." }, { status: 400 });
  if (format === "docx" && (!["1", "2"].includes(day || "") || !["attendance", "honorarium"].includes(sheet || "")))
    return NextResponse.json({ error: "Choose a workshop day and sheet type." }, { status: 400 });

  try {
    if (group !== "outsiders") await syncBatch14Registrations(admin.id);
    const [outsiders, batch14] = await Promise.all([
      group === "batch14" ? Promise.resolve([]) : allRows("registrations"),
      group === "outsiders" ? Promise.resolve([]) : allRows("batch14_registrations")
    ]);
    if (format === "docx") {
      const settings = await getSettings();
      const docx = await buildRegistrationDocx(outsiders, batch14, group, settings.venue, Number(day) as WordDay, sheet as WordSheet);
      return new NextResponse(new Uint8Array(docx), { headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="agentic-workshop-day${day}-${sheet}-${group}.docx"`,
        "Cache-Control": "no-store"
      } });
    }
    const csv = buildRegistrationCsv(outsiders, batch14);
    return new NextResponse(csv, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agentic-workshop-${group}-registrations.csv"`,
      "Cache-Control": "no-store"
    } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unable to export registrations.";
    return NextResponse.json({ error: detail }, { status: 503 });
  }
}
