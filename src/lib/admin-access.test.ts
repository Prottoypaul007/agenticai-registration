import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ACCESS_SECONDS, adminAccessSessionId, createAdminAccessSession, validAdminAccessToken } from "./admin-access";

const id = "12345678-1234-1234-1234-123456789abc";
const now = 1_800_000_000_000;

describe("teacher admin access", () => {
  beforeEach(() => vi.stubEnv("ADMIN_ACCESS_TOKEN", "a".repeat(128)));
  afterEach(() => vi.unstubAllEnvs());

  it("accepts only the configured secret and disables access without configuration", () => {
    expect(validAdminAccessToken("a".repeat(128))).toBe(true);
    expect(validAdminAccessToken("b".repeat(128))).toBe(false);
    expect(validAdminAccessToken("short")).toBe(false);
    expect(validAdminAccessToken("é".repeat(128))).toBe(false);
    vi.stubEnv("ADMIN_ACCESS_TOKEN", "");
    expect(validAdminAccessToken("a".repeat(128))).toBe(false);
    expect(adminAccessSessionId("invalid-session", now)).toBe(null);
  });

  it("checks session integrity and expires after seven days", () => {
    const session = createAdminAccessSession(id, now);
    expect(adminAccessSessionId(session, now)).toBe(id);
    expect(adminAccessSessionId(session, now + ADMIN_ACCESS_SECONDS * 1000)).toBe(null);
    expect(adminAccessSessionId(session.replace(id, "b".repeat(36)), now)).toBe(null);
    expect(adminAccessSessionId(session + "extra", now)).toBe(null);
    expect(adminAccessSessionId("broken", now)).toBe(null);
    expect(adminAccessSessionId(undefined, now)).toBe(null);
  });

  it("revokes existing sessions when the access token changes", () => {
    const session = createAdminAccessSession(id, now);
    vi.stubEnv("ADMIN_ACCESS_TOKEN", "b".repeat(128));
    expect(adminAccessSessionId(session, now)).toBe(null);
  });
});

