import { beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());
const getSessionMock = vi.hoisted(() => vi.fn());
const createSupabaseClientMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: createSupabaseClientMock,
}));
vi.mock("@/lib/env", () => ({
  SUPABASE_URL: () => "https://project.supabase.co",
  SUPABASE_ANON_KEY: () => "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: () => "service-role-key",
}));

import { createClient, getSessionUser } from "./server";

describe("server Supabase client authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    createSupabaseClientMock.mockReturnValue({});
  });

  it("uses the service-role client only after a verified Better Auth session", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "verified-user", email: "learner@connect.ust.hk" },
    });

    await expect(getSessionUser()).resolves.toEqual({
      id: "verified-user",
      email: "learner@connect.ust.hk",
    });
    await createClient();

    expect(createSupabaseClientMock).toHaveBeenLastCalledWith(
      "https://project.supabase.co",
      "service-role-key",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  });

  it("never exposes service-role data access to an unauthenticated request", async () => {
    getSessionMock.mockResolvedValue(null);

    await expect(getSessionUser()).resolves.toBeNull();
    await createClient();

    expect(createSupabaseClientMock).toHaveBeenLastCalledWith(
      "https://project.supabase.co",
      "anon-key",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  });
});
