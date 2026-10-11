import { NextResponse } from "next/server";
import { adminUser, serviceClient } from "@/lib/supabase";
export async function GET() {
  if (!await adminUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = serviceClient();
  const [regular, batch14, combined] = await Promise.all([
    client.rpc("admin_registration_stats"), client.rpc("admin_batch14_stats"), client.rpc("public_registration_count")
  ]);
  if (regular.error || batch14.error || combined.error)
    return NextResponse.json({ error: "Unable to load statistics. Apply migration 008." }, { status: 500 });
  return NextResponse.json({ ...regular.data, batch14: batch14.data, active_total: combined.data });
}
