import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ACCESS_COOKIE, adminAccessSessionId } from "@/lib/admin-access";

const mocks = vi.hoisted(() => ({ serviceClient: vi.fn(), configured: vi.fn(), maybeSingle: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ serviceClient: mocks.serviceClient }));
vi.mock("@/lib/utils", () => ({ configured: mocks.configured }));
import { GET } from "./route";

const token = "a".repeat(128);
const id = "12345678-1234-1234-1234-123456789abc";
const open = (value = token) => GET(new NextRequest(`https://example.com/admin/access/${value}`), { params: Promise.resolve({ token: value }) });

describe("teacher access link route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ADMIN_ACCESS_TOKEN", token);
    vi.stubEnv("ADMIN_ACCESS_USER_ID", "");
    mocks.configured.mockReturnValue(true);
    mocks.maybeSingle.mockResolvedValue({ data: { user_id: id }, error: null });
    const query = { select: vi.fn().mockReturnThis(), eq: mocks.eq, order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: mocks.maybeSingle };
    mocks.eq.mockReturnValue(query);
    mocks.serviceClient.mockReturnValue({ from: vi.fn(() => query) });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects invalid links before accessing the database", async () => {
    expect((await open("b".repeat(128))).status).toBe(404);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });

  it("redirects to admin with a signed private session", async () => {
    const response = await open();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://example.com/admin");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const session = response.cookies.get(ADMIN_ACCESS_COOKIE)!;
    expect(adminAccessSessionId(session.value)).toBe(id);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(session.value).not.toContain(token);
  });

  it("does not grant access without a configured database or allowlisted account", async () => {
    mocks.configured.mockReturnValue(false);
    expect((await open()).status).toBe(503);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
    mocks.configured.mockReturnValue(true);
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await open();
    expect(response.status).toBe(503);
    expect(response.cookies.get(ADMIN_ACCESS_COOKIE)).toBeUndefined();
  });

  it("uses the selected allowlisted identity when configured", async () => {
    vi.stubEnv("ADMIN_ACCESS_USER_ID", id);
    await open();
    expect(mocks.eq).toHaveBeenCalledWith("user_id", id);
  });
});
