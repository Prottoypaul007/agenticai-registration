import type { Metadata } from "next";
import "./globals.css";
import { EVENT_TITLE } from "@/lib/utils";
import { EVENT_VENUE } from "@/lib/venue";

export const metadata: Metadata = {
  title: `${EVENT_TITLE} | IIT, University of Dhaka`,
  description: `Two days of exploring next-generation software architecture, intelligent AI agents, and real-world deployment. October 17–18, 2026 at ${EVENT_VENUE}.`,
  openGraph: { title: EVENT_TITLE, description: `October 17–18, 2026 · ${EVENT_VENUE}`, type: "website" }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
