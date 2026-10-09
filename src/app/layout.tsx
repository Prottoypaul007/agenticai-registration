import type { Metadata } from "next";
import "./globals.css";
import { EVENT_TITLE } from "@/lib/utils";

export const metadata: Metadata = {
  title: `${EVENT_TITLE} | IIT`,
  description: "Two days of exploring next-generation software architecture, intelligent AI agents, and real-world deployment. October 17–18, 2026 at IIT.",
  openGraph: { title: EVENT_TITLE, description: "October 17–18, 2026 · Institute of Information Technology (IIT)", type: "website" }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
