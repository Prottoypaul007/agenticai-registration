import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { configured } from "@/lib/utils";
import { defaultSettings, type EventSettings } from "@/lib/validation";
import { ADMIN_ACCESS_COOKIE, adminAccessSessionId } from "@/lib/admin-access";

export function serviceClient() {
  if (!configured()) throw new Error("Supabase is not configured");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function authClient() {
  if (!configured()) return null;
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(items: { name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }[]) {
        try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* Server Components cannot set cookies; route handlers can. */ }
      }
    }
  });
}

export async function adminUser() {
  if (!configured()) return null;
  const cookieStore = await cookies();
  const accessId = adminAccessSessionId(cookieStore.get(ADMIN_ACCESS_COOKIE)?.value);
  if (accessId) {
    const { data, error } = await serviceClient().from("admins").select("user_id").eq("user_id", accessId).maybeSingle();
    if (!error && data) return { id: accessId, email: "Teacher (access link)" };
  }
  const client = await authClient();
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await serviceClient().from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return error || !data ? null : user;
}

export async function getSettings(): Promise<EventSettings> {
  if (!configured()) return defaultSettings;
  const { data, error } = await serviceClient().from("event_settings").select("registration_opens_at,registration_closes_at,capacity,outsider_registration_enabled,approval_required,allow_single_day,event_time,venue,require_iit_student_id,bkash_merchant_number,rocket_number,nagad_number").eq("id", 1).single();
  if (error || !data) throw new Error("Unable to load event settings");
  return data as EventSettings;
}

export function registrationState(s: EventSettings, now = new Date()) {
  if (!s.outsider_registration_enabled) return "batch14_first";
  if (s.registration_opens_at && now < new Date(s.registration_opens_at)) return "upcoming";
  if (s.registration_closes_at && now > new Date(s.registration_closes_at)) return "closed";
  return "open";
}
