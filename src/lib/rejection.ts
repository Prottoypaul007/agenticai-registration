export const rejectionReasons = {
  transaction_mismatch: "Payment transaction ID could not be matched",
  criteria_not_met: "Workshop participation criteria were not met",
  incomplete_information: "Registration information could not be confirmed",
  other: "Other reason"
} as const;

export type RejectionReason = keyof typeof rejectionReasons;

export function rejectionExplanation(reason: RejectionReason, detail: string | null) {
  const base = reason === "transaction_mismatch"
    ? "We could not match the payment transaction ID you provided with the payment record. If you believe this is a mistake, please contact the workshop organizers with your payment receipt."
    : reason === "criteria_not_met"
      ? "Based on the information provided, the workshop participation criteria were not met."
      : reason === "incomplete_information"
        ? "We could not confirm some of the information required for this registration."
        : "";
  return [base, detail?.trim()].filter(Boolean).join(" ") || "We could not confirm this registration.";
}
