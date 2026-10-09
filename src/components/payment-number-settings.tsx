"use client";
import { Input } from "@/components/ui/field";
import type { EventSettings } from "@/lib/validation";

export function PaymentNumberSettings({ settings, onChange }: { settings: EventSettings; onChange: (settings: EventSettings) => void }) {
  return <div className="grid gap-5 sm:grid-cols-2">
    <label className="text-sm text-slate-300">Rocket account number
      <Input className="mt-2" type="tel" placeholder="12-digit Rocket account number" value={settings.rocket_number ?? ""} onChange={e => onChange({ ...settings, rocket_number: e.target.value || null })}/>
    </label>
    <label className="text-sm text-slate-300">Nagad number
      <Input className="mt-2" type="tel" placeholder="Confirm before entering" value={settings.nagad_number ?? ""} onChange={e => onChange({ ...settings, nagad_number: e.target.value || null })}/>
      <span className="mt-2 block text-xs text-slate-500">Nagad is unavailable to participants while this is blank.</span>
    </label>
  </div>;
}
