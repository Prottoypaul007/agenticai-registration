import { NextRequest, NextResponse } from "next/server";
import { adminUser, serviceClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const admin = await adminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const day = Number(request.nextUrl.searchParams.get("day"));
  const page = Math.max(0, Math.min(10000, Number(request.nextUrl.searchParams.get("page")) || 0));
  if (day !== 1 && day !== 2) return NextResponse.json({ error: "Choose Day 1 or Day 2" }, { status: 400 });
  const { data, count, error } = await serviceClient().rpc("admin_present_participants",
    { p_admin_id: admin.id, p_day: day }, { count: "exact" }).range(page * 25, page * 25 + 24);
  if (error) return NextResponse.json({ error: "Unable to load attendance. Apply migration 008." }, { status: 500 });
  return NextResponse.json({ participants: data, count, page });
}
