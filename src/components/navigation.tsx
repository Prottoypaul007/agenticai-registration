"use client";
import { useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowUpRight, Orbit } from "lucide-react";
import { Button } from "@/components/ui/button";
const links = [["Home", "#home"], ["About", "#about"], ["Workshops", "#workshops"], ["Prerequisites", "#prerequisites"], ["Register", "#register"]];
export function Navigation() {
  const [open, setOpen] = useState(false);
  return <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07111e]/90 backdrop-blur-xl">
    <div className="site-container flex h-18 items-center justify-between">
      <Link href="/#home" className="flex items-center gap-3 font-bold tracking-tight"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-cyan-300"><Orbit size={20}/></span><span>AGENTIC<span className="text-cyan-400">/</span>AI <span className="hidden text-slate-400 sm:inline">WORKSHOP</span></span></Link>
      <nav aria-label="Main navigation" className="hidden items-center gap-7 md:flex">{links.slice(0, 4).map(([label, href]) => <a key={href} href={href} className="text-sm text-slate-300 transition hover:text-cyan-300">{label}</a>)}</nav>
      <div className="hidden md:block"><Button asChild size="sm"><a href="#register">Register Now <ArrowUpRight size={16}/></a></Button></div>
      <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)} className="flex h-11 w-11 items-center justify-center rounded-lg text-white md:hidden">{open ? <X/> : <Menu/>}</button>
    </div>
    {open && <nav aria-label="Mobile navigation" className="site-container flex flex-col gap-1 border-t border-white/10 py-3 md:hidden">{links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-slate-200 hover:bg-white/10">{label}</a>)}</nav>}
  </header>;
}
