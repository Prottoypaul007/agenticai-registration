import { NextResponse } from "next/server";
import { adminUser, serviceClient } from "@/lib/supabase";
export async function GET() {
  if (!await adminUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await serviceClient().rpc("admin_registration_stats");
  if (error) return NextResponse.json({ error: "Unable to load statistics" }, { status: 500 });
  return NextResponse.json(data);
}
