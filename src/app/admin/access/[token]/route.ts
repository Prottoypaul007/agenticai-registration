import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { configured } from "@/lib/utils";
import { ADMIN_ACCESS_COOKIE, ADMIN_ACCESS_SECONDS, createAdminAccessSession, validAdminAccessToken } from "@/lib/admin-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
  if (!validAdminAccessToken(token)) return new NextResponse("Not found", { status: 404, headers });
  if (!configured()) return new NextResponse("Supabase setup required", { status: 503, headers });

  // Keep database audit fields and RPC checks tied to an existing allowlisted identity.
  let query = serviceClient().from("admins").select("user_id");
  if (process.env.ADMIN_ACCESS_USER_ID) query = query.eq("user_id", process.env.ADMIN_ACCESS_USER_ID);
  const { data, error } = await query.order("user_id").limit(1).maybeSingle();
  if (error || !data) return new NextResponse("An allowlisted admin account is required", { status: 503, headers });

  const response = NextResponse.redirect(new URL("/admin", request.url), { status: 303, headers });
  response.cookies.set(ADMIN_ACCESS_COOKIE, createAdminAccessSession(data.user_id), {
    httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: ADMIN_ACCESS_SECONDS
  });
  return response;
}
