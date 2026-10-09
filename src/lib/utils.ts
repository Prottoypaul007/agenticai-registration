import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export const EVENT_TITLE = "Agentic Systems in Action: From Inception to Production (and Beyond)";
export const EVENT_DATES = "October 17–18, 2026";

export function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("https://") &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("YOUR_PROJECT_REF") &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes("YOUR_") &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY.includes("YOUR_"));
}
