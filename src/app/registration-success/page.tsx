import Link from "next/link";
import { CheckCircle2, ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { EVENT_DATES, EVENT_TITLE } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { verifyConfirmation } from "@/lib/confirmation";
import { serviceClient } from "@/lib/supabase";
import { createTicket } from "@/lib/checkin";
import QRCode from "qrcode";

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ ref?: string; status?: string; proof?: string }> }) {
  const { ref, status, proof } = await searchParams;
  const validRef = ref && /^AGNT-[A-F0-9]{12}$/.test(ref) && ["confirmed", "pending"].includes(status || "") && verifyConfirmation(ref, status!, proof || "") ? ref : null;
  let qrImage: string | null = null;
  let emailStatus: string | null = null;
  if (validRef) {
    try {
      const { data } = await serviceClient().from("registrations")
        .select("reference,full_name,institution,attendance,confirmation_email_status").eq("reference", validRef).single();
      if (data) {
        emailStatus = data.confirmation_email_status;
        qrImage = await QRCode.toDataURL(JSON.stringify(createTicket({ reference: data.reference, name: data.full_name,
          institution: data.institution, attendance: data.attendance })), { width: 420, margin: 2 });
      }
    } catch { /* A missing email migration or signing secret must not hide a completed registration. */ }
  }
  return <main className="site-container flex min-h-screen items-center justify-center py-16">
    <div className="panel w-full max-w-2xl rounded-3xl p-8 text-center md:p-12">
      <span className="mx-auto flex h-18 w-18 items-center justify-center rounded-2xl bg-cyan-400/12 text-cyan-300"><CheckCircle2 size={35}/></span>
      <p className="section-kicker mt-8">{validRef ? "Registration received" : "Workshop registration"}</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">{validRef ? "Registration Submitted Successfully!" : "Registration details unavailable"}</h1>
      <p className="mt-5 leading-7 text-slate-300">{validRef ? `Thank you for registering for ${EVENT_TITLE}.` : "This confirmation link is missing or invalid."}</p>
      <div className="mt-8 grid gap-3 rounded-2xl border border-white/10 bg-white/3 p-6 text-left sm:grid-cols-2">
        <span className="flex items-center gap-2 text-sm text-slate-300"><CalendarDays size={17} className="text-cyan-400"/>{EVENT_DATES}</span>
        <span className="flex items-center gap-2 text-sm text-slate-300"><MapPin size={17} className="text-cyan-400"/>Institute of Information Technology (IIT)</span>
      </div>
      {validRef && <div className="mt-6">
        <p className="text-sm text-slate-400">Your registration reference</p>
        <p className="mt-1 font-mono text-xl font-bold tracking-wider text-cyan-300">{validRef}</p>
        <p className="mt-4 text-sm text-slate-300">Your registration and payment transaction details have been submitted. Please keep your payment receipt.</p>
        <p className="mt-3 text-sm text-slate-300">{emailStatus === "sent" ? "We sent your QR ticket to your email address." : "Your email ticket is pending. Save the QR below; an admin can retry email delivery."}</p>
        {qrImage && <div className="mx-auto mt-5 w-fit rounded-2xl bg-white p-4"><img src={qrImage} alt="Your workshop check-in QR code" width={280} height={280}/><a className="mt-2 block text-sm font-medium text-slate-900 underline" href={qrImage} download={`workshop-${validRef}.png`}>Download QR ticket</a></div>}
        <p className="mt-3 text-xs leading-5 text-slate-400">The amount paid will be refunded to the bank account in your name after workshop completion.</p>
      </div>}
      <Button asChild variant="outline" className="mt-9"><Link href="/"><ArrowLeft size={17}/> Back to workshop</Link></Button>
    </div>
  </main>;
}
