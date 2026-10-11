import { NextRequest, NextResponse } from "next/server";
import { adminUser } from "@/lib/supabase";
import { sendRegistrationEmail } from "@/lib/registration-email";

export async function POST(request: NextRequest) {
  if (!await adminUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { reference?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body.reference || !/^AGNT-[A-F0-9]{12}$/.test(body.reference))
    return NextResponse.json({ error: "Invalid registration reference" }, { status: 400 });
  try {
    const sent = await sendRegistrationEmail(body.reference);
    return NextResponse.json({ sent }, { status: sent ? 200 : 503 });
  } catch { return NextResponse.json({ error: "Registration not found or email migration missing" }, { status: 404 }); }
}
