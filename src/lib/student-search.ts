export type StudentSearchResult = {
  id: string;
  source: "outsiders" | "batch14";
  reference: string;
  full_name: string;
  email: string;
  phone: string | null;
  payment_transaction_id: string | null;
  payment_status: string;
  qr_status: string;
  registration_status: string | null;
  created_at: string;
};

type RegistrationRow = Omit<StudentSearchResult, "source" | "registration_status"> & {
  registration_status?: string | null;
  source_data?: Record<string, unknown> | null;
};

export function asSearchResult(row: RegistrationRow, source: StudentSearchResult["source"]): StudentSearchResult {
  const sheetTransaction = source === "batch14" && row.source_data
    ? Object.entries(row.source_data).find(([key]) => key.trim().toLowerCase() === "transaction id")?.[1]
    : null;
  return {
    id: row.id, source, reference: row.reference, full_name: row.full_name,
    email: row.email, phone: row.phone, payment_transaction_id: row.payment_transaction_id ||
      (typeof sheetTransaction === "string" ? sheetTransaction : null),
    payment_status: row.payment_status, qr_status: row.qr_status,
    registration_status: row.registration_status ?? null, created_at: row.created_at
  };
}

export function matchesStudentSearch(row: StudentSearchResult, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return false;
  const values = [row.full_name, row.payment_transaction_id, row.phone, row.email];
  if (values.some(value => value?.toLocaleLowerCase().includes(needle))) return true;
  const digits = needle.replace(/\D/g, "");
  return digits.length >= 3 && digits === needle &&
    Boolean(row.phone?.replace(/\D/g, "").includes(digits));
}
