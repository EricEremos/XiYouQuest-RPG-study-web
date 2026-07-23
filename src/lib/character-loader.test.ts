import { describe, expect, it, vi } from "vitest";
import { loadSelectedCharacter } from "@/lib/character-loader";

function singleResult(data: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    upsert: vi.fn(async () => ({ error: null })),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    single: vi.fn(async () => ({ data, error: null })),
  };
  return query;
}

describe("loadSelectedCharacter", () => {
  it("uses the default character when an existing user has no selected companion row", async () => {
    const selectedQuery = singleResult(null);
    const defaultQuery = singleResult({
      id: "default-wukong",
      name: "Sun Wukong (孙悟空)",
      personality_prompt: "Bold and encouraging",
      voice_id: "wukong-voice",
      image_url: null,
      character_expressions: [],
    });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "user_characters") return selectedQuery;
        if (table === "characters") return defaultQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const result = await loadSelectedCharacter(
      supabase as never,
      "existing-profile-without-user-character",
    );

    expect(result).toEqual({
      id: "default-wukong",
      name: "Sun Wukong (孙悟空)",
      personalityPrompt: "Bold and encouraging",
      voiceId: "wukong-voice",
      expressions: {
        neutral: "/img/main character/son wukong/오공 명함.webp",
      },
    });
    expect(selectedQuery.order).toHaveBeenCalledWith("unlocked_at", {
      ascending: false,
    });
    expect(selectedQuery.limit).toHaveBeenCalledWith(1);
    expect(selectedQuery.upsert).toHaveBeenCalledWith(
      {
        user_id: "existing-profile-without-user-character",
        character_id: "default-wukong",
        is_selected: true,
      },
      { onConflict: "user_id,character_id" },
    );
  });
});
