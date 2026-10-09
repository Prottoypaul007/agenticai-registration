import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const styles = cva("inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:pointer-events-none disabled:opacity-50", {
  variants: {
    variant: { default: "bg-cyan-400 text-slate-950 hover:bg-cyan-300", outline: "border border-white/20 bg-white/5 text-white hover:bg-white/10", ghost: "text-slate-300 hover:bg-white/10 hover:text-white", danger: "bg-rose-500 text-white hover:bg-rose-400" },
    size: { default: "h-11 px-5 text-sm", lg: "h-13 px-7 text-base", sm: "h-9 px-3 text-sm" }
  }, defaultVariants: { variant: "default", size: "default" }
});
export function Button({ className, variant, size, asChild = false, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof styles> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(styles({ variant, size }), className)} {...props} />;
}
