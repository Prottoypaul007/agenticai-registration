"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { paymentAmount, registrationSchema, type EventSettings, type RegistrationInput } from "@/lib/validation";

const languages = ["Python", "JavaScript / TypeScript", "Java", "C / C++", "Other", "None"] as const;
const paidModels = ["GPT / ChatGPT", "Claude", "Gemini", "Grok", "DeepSeek", "Perplexity", "Other"] as const;
const steps = ["Your details", "Prerequisite questions", "Participation & payment"];
const stepFields: (keyof RegistrationInput)[][] = [
  ["full_name", "email", "phone", "institution", "department", "academic_year", "student_id"],
  ["traditional_development", "ai_tools_basics", "built_software_project", "programming_languages", "programming_level", "python_familiarity", "api_experience", "ai_familiarity", "agent_experience", "paid_llm_subscription", "paid_llm_models", "paid_llm_other_model"],
  ["attendance", "bringing_laptop", "development_environment", "local_model_laptop", "learning_expectations", "payment_method", "payment_transaction_id", "bank_name", "bank_account_holder_name", "bank_account_number", "bank_branch", "declaration_accepted", "privacy_accepted"]
];

export function RegistrationForm({ settings }: { settings: EventSettings }) {
  const [step, setStep] = useState(0);
  const [attemptedSteps, setAttemptedSteps] = useState([false, false, false]);
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { register, handleSubmit, watch, setValue, setError, trigger, formState: { errors, touchedFields } } = useForm<RegistrationInput>({
    resolver: zodResolver(registrationSchema), mode: "onTouched",
    defaultValues: {
      full_name: "", email: "", phone: "", institution: "", department: "", academic_year: "", student_id: "",
      programming_languages: [], paid_llm_models: [], paid_llm_other_model: "", attendance: "Both Days", learning_expectations: "", payment_method: settings.bkash_merchant_number ? "bkash" : settings.rocket_number ? "rocket" : "nagad", payment_transaction_id: "",
      bank_name: "", bank_account_holder_name: "", bank_account_number: "", bank_branch: "",
      declaration_accepted: false as never, privacy_accepted: false as never
    }
  });
  const selected = watch("programming_languages") || [];
  const subscription = watch("paid_llm_subscription");
  const selectedPaidModels = watch("paid_llm_models") || [];
  const attendance = settings.allow_single_day ? watch("attendance") : "Both Days";
  const amount = paymentAmount(attendance || "Both Days");
  const method = watch("payment_method") || "bkash";
  const paymentNumbers = { bkash: settings.bkash_merchant_number, rocket: settings.rocket_number, nagad: settings.nagad_number };
  const paymentNumber = paymentNumbers[method];
  const error = (name: keyof RegistrationInput) => (attemptedSteps[step] || touchedFields[name]) && errors[name]?.message && <p role="alert" className="mt-1.5 text-xs text-rose-300">{String(errors[name]?.message)}</p>;
  const label = (name: keyof RegistrationInput, text: string, required: boolean, children: React.ReactNode) => <label className="block"><span className="mb-2 block text-sm font-medium text-slate-200">{text} {required && <span className="text-cyan-400">*</span>}</span>{children}{error(name)}</label>;
  const yesNo = (name: keyof RegistrationInput, title: string) => label(name, title, true, <Select defaultValue="" {...register(name)}><option value="" disabled>Select an answer</option><option>Yes</option><option>No</option></Select>);
  const next = async () => {
    setAttemptedSteps(previous => previous.map((attempted, index) => index === step ? true : attempted));
    const valid = await trigger(stepFields[step]);
    if (step === 0 && settings.require_iit_student_id && /\biit\b|institute of information technology/i.test(watch("institution") || "") && !watch("student_id")?.trim()) {
      setError("student_id", { message: "Student ID is required for IIT students" }); return;
    }
    if (valid) { setStep(step + 1); setServerError(""); document.getElementById("register")?.scrollIntoView({ behavior: "smooth" }); }
  };
  const submit = handleSubmit(async values => {
    if (submitting || !paymentNumber) return;
    setSubmitting(true); setServerError("");
    try {
      const response = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, attendance: settings.allow_single_day ? values.attendance : "Both Days" }) });
      const result = await response.json();
      if (!response.ok) { setServerError(result.error || "Submission failed. Please try again."); return; }
      router.push(`/registration-success?ref=${encodeURIComponent(result.reference)}&status=${encodeURIComponent(result.status)}&proof=${encodeURIComponent(result.proof)}`);
    } catch { setServerError("Network error. Please check your connection and try again."); }
    finally { setSubmitting(false); }
  }, () => { setAttemptedSteps(previous => previous.map((attempted, index) => index === step ? true : attempted)); setServerError("Please check the highlighted fields."); });

  return <div className="panel mx-auto max-w-4xl overflow-hidden rounded-3xl">
    <div className="border-b border-white/10 px-6 py-7 md:px-10"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold tracking-widest text-cyan-300 uppercase">Registration</p><h3 className="mt-1 text-xl font-semibold">{steps[step]}</h3></div><span className="font-mono text-sm text-slate-400">0{step + 1} / 03</span></div><div className="mt-6 grid grid-cols-3 gap-2" aria-label={`Step ${step + 1} of 3`}>{steps.map((s, i) => <div key={s} className="h-1.5 rounded-full" style={{ background: i <= step ? "#55d9e6" : "#26384e" }}/>)}</div><div className="mt-3 flex justify-between gap-2 text-[11px] text-slate-500">{steps.map(s => <span key={s}>{s}</span>)}</div></div>
    <form onSubmit={submit} noValidate className="px-6 py-8 md:px-10 md:py-10">
      {step === 0 && <div className="grid gap-6 sm:grid-cols-2">
        {label("full_name", "Full name", true, <Input autoComplete="name" placeholder="Your full name" {...register("full_name")}/>)}
        {label("email", "Email address", true, <Input type="email" autoComplete="email" placeholder="you@example.com" {...register("email")}/>)}
        {label("phone", "Contact number", true, <Input type="tel" autoComplete="tel" placeholder="+880 1XXXXXXXXX" {...register("phone")}/>)}
        {label("institution", "Institution / University", true, <Input placeholder="Your institution" {...register("institution")}/>)}
        {label("department", "Department / Discipline", true, <Input placeholder="Your department" {...register("department")}/>)}
        {label("academic_year", "Academic year / Semester", true, <Input placeholder="e.g. 3rd year, 2nd semester" {...register("academic_year")}/>)}
        <div className="sm:col-span-2">{label("student_id", `Student ID / Roll number${settings.require_iit_student_id ? " (required for IIT students)" : ""}`, false, <Input placeholder="Optional" {...register("student_id")}/>)}</div>
      </div>}
      {step === 1 && <div className="grid gap-6 sm:grid-cols-2">
        <p className="sm:col-span-2 text-sm leading-6 text-slate-400">These questions help us understand your starting point. You do not need prior experience building agentic AI systems.</p>
        {yesNo("traditional_development", "Do you know traditional software development concepts?")}
        {yesNo("ai_tools_basics", "Do you have basic knowledge of AI tools?")}
        {yesNo("built_software_project", "Have you built a software project before?")}
        {yesNo("api_experience", "Have you worked with APIs before?")}
        <fieldset className="sm:col-span-2"><legend className="mb-3 text-sm font-medium text-slate-200">Programming languages <span className="text-cyan-400">*</span></legend><div className="flex flex-wrap gap-2">{languages.map(lang => <label key={lang} className={`cursor-pointer rounded-xl border px-4 py-2.5 text-sm transition ${selected.includes(lang) ? "border-cyan-400 bg-cyan-400/12 text-cyan-200" : "border-white/15 text-slate-300 hover:border-white/30"}`}><input type="checkbox" className="sr-only" checked={selected.includes(lang)} onChange={() => { const next: RegistrationInput["programming_languages"] = selected.includes(lang) ? selected.filter(x => x !== lang) : lang === "None" ? ["None"] : [...selected.filter(x => x !== "None"), lang]; setValue("programming_languages", next, { shouldValidate: true }); }}/>{lang}</label>)}</div>{error("programming_languages")}</fieldset>
        {label("programming_level", "Programming proficiency", true, <Select defaultValue="" {...register("programming_level")}><option value="" disabled>Select your level</option>{["Beginner","Intermediate","Advanced"].map(v=><option key={v}>{v}</option>)}</Select>)}
        {label("python_familiarity", "Python familiarity", true, <Select defaultValue="" {...register("python_familiarity")}><option value="" disabled>Select your level</option>{["No experience","Basic","Intermediate","Advanced"].map(v=><option key={v}>{v}</option>)}</Select>)}
        {label("ai_familiarity", "AI / LLM familiarity", true, <Select defaultValue="" {...register("ai_familiarity")}><option value="" disabled>Select your level</option>{["None","Basic","Intermediate","Advanced"].map(v=><option key={v}>{v}</option>)}</Select>)}
        {yesNo("agent_experience", "Have you worked with AI agents before?")}
        {label("paid_llm_subscription", "Do you have a paid LLM subscription?", true, <Select defaultValue="" {...register("paid_llm_subscription", { onChange: e => { if (e.target.value === "No") { setValue("paid_llm_models", [], { shouldValidate: true }); setValue("paid_llm_other_model", "", { shouldValidate: true }); } } })}><option value="" disabled>Select an answer</option><option>Yes</option><option>No</option></Select>)}
        {subscription === "Yes" && <fieldset className="sm:col-span-2"><legend className="mb-3 text-sm font-medium text-slate-200">Which paid LLM models or services do you use? <span className="text-cyan-400">*</span></legend><div className="flex flex-wrap gap-2">{paidModels.map(model => <label key={model} className={`cursor-pointer rounded-xl border px-4 py-2.5 text-sm transition ${selectedPaidModels.includes(model) ? "border-cyan-400 bg-cyan-400/12 text-cyan-200" : "border-white/15 text-slate-300 hover:border-white/30"}`}><input type="checkbox" className="sr-only" checked={selectedPaidModels.includes(model)} onChange={() => { const next: RegistrationInput["paid_llm_models"] = selectedPaidModels.includes(model) ? selectedPaidModels.filter(x => x !== model) : [...selectedPaidModels, model]; setValue("paid_llm_models", next, { shouldValidate: true }); if (model === "Other" && !next.includes("Other")) setValue("paid_llm_other_model", "", { shouldValidate: true }); }}/>{model}</label>)}</div>{error("paid_llm_models")}</fieldset>}
        {subscription === "Yes" && selectedPaidModels.includes("Other") && <div className="sm:col-span-2">{label("paid_llm_other_model", "Other model or service", true, <Input placeholder="Enter the model or service" {...register("paid_llm_other_model")}/>)}</div>}
      </div>}
      {step === 2 && <div className="grid gap-6 sm:grid-cols-2">
        {settings.allow_single_day && label("attendance", "Preferred attendance", true, <Select {...register("attendance")}><option>Both Days</option><option>Day 1 Only</option><option>Day 2 Only</option></Select>)}
        {yesNo("bringing_laptop", "Will you bring a laptop?")}
        {label("development_environment", "Is a development environment installed?", true, <Select defaultValue="" {...register("development_environment")}><option value="" disabled>Select an option</option><option>Yes</option><option>No</option><option>Not Sure</option></Select>)}
        {label("local_model_laptop", "Do you have a laptop capable of running a local open-source AI model?", true, <Select defaultValue="" {...register("local_model_laptop")}><option value="" disabled>Select an answer</option><option>Yes</option><option>No</option><option value="Not Sure">Not sure</option></Select>)}
        <div className="sm:col-span-2">{label("learning_expectations", "What do you expect to learn?", false, <Textarea rows={3} placeholder="Tell us what you're hoping to explore..." {...register("learning_expectations")}/>)}</div>
        <div className="sm:col-span-2 rounded-2xl border border-cyan-400/25 bg-cyan-400/7 p-6"><div className="flex items-center gap-2 text-cyan-200"><Wallet size={19}/><h4 className="font-semibold">Payment</h4></div><p className="mt-3 text-sm leading-6 text-slate-300">Each workshop day costs ৳1,000. Pay <strong className="text-white">৳{amount.toLocaleString("en-US")}</strong> for your selected attendance using one of the available methods, then enter the transaction ID from your receipt.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-200">Payment method<Select className="mt-2" {...register("payment_method")}><option value="bkash" disabled={!settings.bkash_merchant_number}>bKash</option><option value="rocket" disabled={!settings.rocket_number}>Rocket</option><option value="nagad" disabled={!settings.nagad_number}>Nagad</option></Select></label><div className="rounded-xl bg-[#0c1d2e] px-4 py-3 text-sm"><span className="block text-slate-400">{method === "bkash" ? "bKash" : method === "rocket" ? "Rocket" : "Nagad"} number</span><strong className="mt-1 block font-mono text-lg text-cyan-200">{paymentNumber || "Not available"}</strong></div></div><p className="mt-3 text-xs leading-5 text-slate-400">Keep your payment receipt. Your transaction details will be reviewed before the payment is recorded as verified.</p></div>
        <div className="sm:col-span-2">{label("payment_transaction_id", "Payment transaction ID", true, <Input autoComplete="off" placeholder="From your payment receipt" {...register("payment_transaction_id")}/>)}</div>
        <div className="sm:col-span-2 border-t border-white/10 pt-6"><h4 className="text-lg font-semibold">Bank account for your refund</h4><p className="mt-2 text-sm leading-6 text-slate-400">The amount you pay will be refunded to your own bank account after completing the workshop. The account holder name must match the full name in this form.</p></div>
        {label("bank_name", "Bank name", true, <Input placeholder="Your bank" {...register("bank_name")}/>)}
        {label("bank_account_holder_name", "Account holder name", true, <Input placeholder="Must match your full name" {...register("bank_account_holder_name")}/>)}
        {label("bank_account_number", "Bank account number", true, <Input inputMode="numeric" autoComplete="off" placeholder="Your bank account number" {...register("bank_account_number")}/>)}
        {label("bank_branch", "Branch", false, <Input placeholder="Optional" {...register("bank_branch")}/>)}
        <div className="sm:col-span-2 space-y-4 border-t border-white/10 pt-6"><label className="flex items-start gap-3 text-sm leading-6 text-slate-300"><input type="checkbox" className="mt-1 h-4 w-4 accent-cyan-400" {...register("declaration_accepted")}/><span>I confirm my details and payment transaction ID are accurate, the bank account is in my name, and I have reviewed the workshop prerequisites and refund condition. <span className="text-cyan-400">*</span>{error("declaration_accepted")}</span></label><label className="flex items-start gap-3 text-sm leading-6 text-slate-300"><input type="checkbox" className="mt-1 h-4 w-4 accent-cyan-400" {...register("privacy_accepted")}/><span>I acknowledge that the event team will use my registration, payment transaction ID, and bank details to verify payment and arrange the refund after completion. <span className="text-cyan-400">*</span>{error("privacy_accepted")}</span></label></div>
      </div>}
      {serverError && <div role="alert" className="mt-6 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{serverError}</div>}
      <div className="mt-9 flex items-center justify-between gap-3 border-t border-white/10 pt-7"><div>{step > 0 && <Button type="button" variant="ghost" onClick={() => { setStep(step - 1); setServerError(""); }}><ArrowLeft size={17}/> Back</Button>}</div>{step < 2 ? <Button type="button" onClick={next}>Continue <ArrowRight size={17}/></Button> : <Button type="submit" disabled={submitting || !paymentNumber}>{submitting ? <Loader2 size={17} className="animate-spin"/> : <CheckCircle2 size={17}/>} {submitting ? "Submitting..." : "Submit Registration"}</Button>}</div>
    </form><div className="flex items-center justify-center gap-2 border-t border-white/10 bg-white/2 px-6 py-4 text-xs text-slate-500"><ShieldCheck size={15}/> Payment and bank details are visible only to authorized workshop administrators.</div>
  </div>;
}
