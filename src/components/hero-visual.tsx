"use client";
import { motion } from "framer-motion";
import { Bot, Braces, CloudUpload, DatabaseZap, Workflow } from "lucide-react";
const nodes = [
  { Icon: Braces, label: "IDEA", x: "7%", y: "48%" },
  { Icon: Workflow, label: "DESIGN", x: "31%", y: "20%" },
  { Icon: Bot, label: "AGENT", x: "52%", y: "48%" },
  { Icon: DatabaseZap, label: "INTEGRATE", x: "73%", y: "21%" },
  { Icon: CloudUpload, label: "DEPLOY", x: "73%", y: "70%" }
];
export function HeroVisual() {
  return <div aria-hidden="true" className="relative mx-auto h-[280px] w-full max-w-[550px] overflow-hidden sm:h-[360px] md:h-[450px]">
    <div className="absolute inset-0 rounded-full glow"/>
    <svg viewBox="0 0 550 450" className="absolute inset-0 h-full w-full overflow-visible opacity-70" fill="none"><path d="M80 245 L176 104 L287 242 L408 107 L462 340 L287 242" stroke="#3a8ba8" strokeWidth="1.5" strokeDasharray="5 6"/><path d="M176 104 L408 107 M80 245 L462 340" stroke="#25536b" strokeWidth="1"/></svg>
    {nodes.map(({ Icon, label, x, y }, i) => <motion.div key={label} style={{ left: x, top: y }} initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1, y: [0, -7, 0] }} transition={{ delay: i * .12, duration: 4 + i * .35, repeat: Infinity, repeatType: "reverse" }} className="absolute flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl border border-cyan-300/30 bg-[#10263d]/95 text-cyan-300 shadow-[0_0_35px_rgba(24,203,225,.14)] backdrop-blur sm:h-18 sm:w-18 md:h-22 md:w-22"><Icon className="h-5 w-5 md:h-6 md:w-6"/><span className="font-mono text-[8px] tracking-wider md:text-[9px]">{label}</span></motion.div>)}
    <div className="absolute right-[12%] bottom-[3%] rounded-full border border-cyan-400/20 bg-[#0d2336] px-4 py-2 font-mono text-xs text-cyan-200">from concept → production</div>
  </div>;
}
