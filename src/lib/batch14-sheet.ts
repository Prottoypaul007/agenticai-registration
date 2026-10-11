import { createSign } from "node:crypto";

export type Batch14Row = {
  source_row: number;
  full_name: string;
  email: string;
  phone: string;
  institution: string;
  attendance: "Both Days" | "Day 1 Only" | "Day 2 Only";
  payment_method: string;
  payment_transaction_id: string;
  bank_name: string;
  bank_branch: string;
  bank_account_number: string;
  source_data: Record<string, string>;
};

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const matches = (header: string, aliases: string[]) => aliases.some(alias => normalized(header) === alias);

function column(headers: string[], aliases: string[]) {
  return headers.findIndex(header => matches(header, aliases));
}

function attendanceValue(value: string, row: number): Batch14Row["attendance"] {
  const text = normalized(value);
  if (!text || ["both days", "both", "2 days", "two days", "17 and 18 october", "17 18 october"].includes(text)) return "Both Days";
  if (["day 1", "day 1 only", "17 october", "october 17", "17th october"].includes(text)) return "Day 1 Only";
  if (["day 2", "day 2 only", "18 october", "october 18", "18th october"].includes(text)) return "Day 2 Only";
  throw new Error(`Row ${row}: attendance must be Both Days, Day 1 Only, or Day 2 Only.`);
}

export function parseBatch14Sheet(values: unknown): Batch14Row[] {
  if (!Array.isArray(values) || !Array.isArray(values[0])) throw new Error("The sheet needs a header row.");
  const headers = values[0].map(String);
  const nameColumn = column(headers, ["name", "full name", "participant name", "student name", "your full name"]);
  const emailColumn = column(headers, ["email", "email address", "e mail", "your email address"]);
  const phoneColumn = column(headers, ["phone", "phone number", "mobile", "mobile number", "contact number"]);
  const institutionColumn = column(headers, ["institution", "university", "organization"]);
  const attendanceColumn = column(headers, ["attendance", "preferred attendance", "days attending", "workshop days"]);
  const methodColumn = column(headers, ["preferred payment method", "payment method"]);
  const transactionColumn = column(headers, ["transaction id", "payment transaction id", "trx id"]);
  const bankColumn = column(headers, ["bank name"]);
  const branchColumn = column(headers, ["branch name", "bank branch"]);
  const accountColumn = column(headers, ["bank account number", "account number"]);
  if (nameColumn < 0 || emailColumn < 0) throw new Error("Sheet headers must include Name (or Full Name) and Email (or Email Address).");
  if (values.length > 501) throw new Error("The sheet has more than 500 responses; contact the organizer to import it in batches.");
  return values.slice(1).flatMap((item, index) => {
    if (!Array.isArray(item)) return [];
    const cells = item.map(value => String(value ?? "").trim());
    if (cells.every(value => !value)) return [];
    const row = index + 2;
    const full_name = cells[nameColumn] || "";
    const email = (cells[emailColumn] || "").toLowerCase();
    if (!full_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Row ${row}: enter a name and valid email in the Google Form response.`);
    return [{ source_row: row, full_name, email,
      phone: phoneColumn < 0 ? "" : cells[phoneColumn] || "",
      institution: institutionColumn < 0 ? "University of Dhaka, IIT" : cells[institutionColumn] || "University of Dhaka, IIT",
      attendance: attendanceColumn < 0 ? "Both Days" as const : attendanceValue(cells[attendanceColumn] || "", row),
      payment_method: methodColumn < 0 ? "" : cells[methodColumn] || "",
      payment_transaction_id: transactionColumn < 0 ? "" : cells[transactionColumn] || "",
      bank_name: bankColumn < 0 ? "" : cells[bankColumn] || "",
      bank_branch: branchColumn < 0 ? "" : cells[branchColumn] || "",
      bank_account_number: accountColumn < 0 ? "" : cells[accountColumn] || "",
      source_data: Object.fromEntries(headers.map((header, i) => [header, (cells[i] || "").slice(0, 1000)])) }];
  });
}

export async function readBatch14Sheet(): Promise<Batch14Row[]> {
  const clientEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const sheetId = Number(process.env.GOOGLE_SHEETS_GID);
  if (!clientEmail || !privateKey || !spreadsheetId || !Number.isInteger(sheetId) || sheetId <= 0)
    throw new Error("Configure the Google Sheets service account, spreadsheet ID, and tab GID.");
  async function requestToken(timeSeconds: number) {
    const now = Math.floor(timeSeconds);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = base64url(JSON.stringify({ iss: clientEmail, scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token", iat: now - 30, exp: now + 3300 }));
    const payload = `${header}.${claim}`;
    const signer = createSign("RSA-SHA256"); signer.update(payload); signer.end();
    const assertion = `${payload}.${signer.sign(privateKey!).toString("base64url")}`;
    return fetch("https://oauth2.googleapis.com/token", { method: "POST", cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  }
  let tokenResponse = await requestToken(Date.now() / 1000);
  if (!tokenResponse.ok && tokenResponse.status === 400) {
    const googleTime = Date.parse(tokenResponse.headers.get("date") || "");
    if (Number.isFinite(googleTime) && Math.abs(googleTime - Date.now()) > 60_000 &&
        Math.abs(googleTime - Date.now()) < 86_400_000) {
      tokenResponse = await requestToken(googleTime / 1000);
    }
  }
  if (!tokenResponse.ok) throw new Error("Google service account authentication failed. Check its email and private key.");
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) throw new Error("Google did not return a Sheets access token.");
  const metadataResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(sheetId,title))`,
    { cache: "no-store", signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!metadataResponse.ok) throw new Error("Could not open the private Google Sheet. Share it with the service account email.");
  const metadata = await metadataResponse.json() as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
  const title = metadata.sheets?.find(sheet => sheet.properties?.sheetId === sheetId)?.properties?.title;
  if (!title) throw new Error("The Google Form response tab was not found. Check GOOGLE_SHEETS_GID.");
  const range = `'${title.replace(/'/g, "''")}'!A:AZ`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
  const sheetResponse = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!sheetResponse.ok) throw new Error("Could not read the private Google Sheet. Share it with the service account and check the tab name.");
  const sheet = await sheetResponse.json() as { values?: unknown };
  return parseBatch14Sheet(sheet.values);
}
