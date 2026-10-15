"use client";

import { useId, useRef } from "react";
import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const schedules = {
  "DAY 01": {
    date: "Saturday, October 17, 2026",
    rows: [
      ["9:00 AM – 9:15 AM", "Opening Ceremony"],
      ["9:15 AM – 11:15 AM", "Session 1: Foundations of LLMs and Agentic Systems"],
      ["11:15 AM – 11:30 AM", "Break"],
      ["11:30 AM – 1:30 PM", "Session 2: Software Engineering with Coding Agents"],
      ["1:30 PM – 2:15 PM", "Break"],
      ["2:15 PM – 4:15 PM", "Session 3: AI Agent & Advanced Agentic Systems"],
    ],
  },
  "DAY 02": {
    date: "Sunday, October 18, 2026",
    rows: [
      ["9:00 AM – 11:00 AM", "Session 1: Agentic Application Development"],
      ["11:00 AM – 11:30 AM", "Break"],
      ["11:30 AM – 1:30 PM", "Session 2: Project Demonstrations and Q&A"],
      ["1:30 PM – 2:15 PM", "Break"],
      ["2:15 PM – 3:15 PM", "Closing Ceremony"],
    ],
  },
};

export function WorkshopSchedule({ day }: { day: keyof typeof schedules }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const schedule = schedules[day];

  return <>
    <Button type="button" variant="outline" size="sm" aria-haspopup="dialog" aria-label={`See Schedule for ${day}`} onClick={() => dialog.current?.showModal()}>
      <CalendarDays size={16} aria-hidden="true"/> See Schedule
    </Button>
    <dialog ref={dialog} aria-labelledby={titleId} className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-3xl border border-white/15 bg-[#0a1726] p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/80 backdrop:backdrop-blur-sm" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="section-kicker">{day}</p>
            <h2 id={titleId} className="mt-3 text-2xl font-semibold tracking-tight">Workshop Schedule</h2>
            <p className="mt-2 text-sm text-slate-300">{schedule.date}</p>
            <p className="mt-2 text-xs text-slate-400">All times are in Bangladesh time (UTC+6).</p>
          </div>
          <Button type="button" variant="ghost" size="sm" aria-label="Close schedule" onClick={() => dialog.current?.close()}><X size={20}/></Button>
        </div>
        <table className="mt-7 w-full text-left text-sm">
          <thead><tr className="border-b border-white/15 text-cyan-200"><th scope="col" className="pb-3 pr-4 font-semibold">Time</th><th scope="col" className="pb-3 font-semibold">Activity</th></tr></thead>
          <tbody>{schedule.rows.map(([time, activity]) => <tr key={time} className="border-b border-white/10 last:border-0"><td className="py-4 pr-4 text-slate-300">{time}</td><td className="py-4 font-medium">{activity}</td></tr>)}</tbody>
        </table>
      </div>
    </dialog>
  </>;
}
