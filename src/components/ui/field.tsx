import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const fieldClass = "w-full min-w-0 rounded-xl border border-white/15 bg-[#101d30] px-4 py-3 text-base text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 sm:text-sm";
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input className={cn(fieldClass, className)} {...props} />; }
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) { return <select className={cn(fieldClass, className)} {...props} />; }
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldClass, className)} {...props} />;
});
