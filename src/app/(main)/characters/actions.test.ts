import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSessionUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

describe("selectCharacter", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.getSessionUser.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.getSessionUser.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "student@connect.ust.hk",
    });
  });

  it("uses the atomic database selection function and revalidates the affected pages", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    mocks.createClient.mockResolvedValue({ rpc });

    const { selectCharacter } = await import("./actions");
    const result = await selectCharacter(
      "22222222-2222-4222-8222-222222222222",
    );

    expect(rpc).toHaveBeenCalledWith("select_user_character", {
      target_character_id: "22222222-2222-4222-8222-222222222222",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/characters");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(result).toEqual({ success: true });
  });

  it("returns a stable error and does not revalidate when the atomic selection fails", async () => {
    const rpc = vi.fn(async () => ({
      error: { message: "Character is not unlocked" },
    }));
    mocks.createClient.mockResolvedValue({ rpc });

    const { selectCharacter } = await import("./actions");
    const result = await selectCharacter(
      "22222222-2222-4222-8222-222222222222",
    );

    expect(result).toEqual({
      error: "Unable to select this character. Please try again.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
