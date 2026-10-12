import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ACCESS_COOKIE, createAdminAccessSession } from "./admin-access";

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), maybeSingle: vi.fn(), getUser: vi.fn(), configured: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/utils", () => ({ configured: mocks.configured }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }) }) }));
import { adminUser } from "./supabase";

const id = "12345678-1234-1234-1234-123456789abc";

describe("shared dashboard and API authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ADMIN_ACCESS_TOKEN", "a".repeat(128));
    mocks.configured.mockReturnValue(true);
    mocks.cookies.mockResolvedValue({ get: (name: string) => name === ADMIN_ACCESS_COOKIE ? { value: createAdminAccessSession(id) } : undefined });
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.maybeSingle.mockResolvedValue({ data: { user_id: id }, error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("grants link sessions admin access without a Supabase password session", async () => {
    expect(await adminUser()).toEqual({ id, email: "Teacher (access link)" });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("rejects link sessions when the identity is removed from the allowlist", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await adminUser()).toBe(null);
  });

  it("preserves existing password-based admin access", async () => {
    mocks.cookies.mockResolvedValue({ get: () => undefined });
    const user = { id, email: "admin@example.com" };
    mocks.getUser.mockResolvedValue({ data: { user } });
    expect(await adminUser()).toEqual(user);
  });

  it("denies forged sessions and unauthenticated requests", async () => {
    mocks.cookies.mockResolvedValue({ get: () => ({ value: "forged" }) });
    expect(await adminUser()).toBe(null);
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });
});
