import { describe, expect, it, vi } from "vitest";
import { loadSelectedCharacter } from "@/lib/character-loader";

function queryResult({
  data,
  error = null,
}: {
  data: unknown;
  error?: unknown;
}) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    upsert: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error })),
    single: vi.fn(async () => ({ data, error })),
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data, error }).then(resolve, reject),
  };
  return query;
}

const wukong = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Sun Wukong (孙悟空)",
  personality_prompt: "Bold and encouraging",
  voice_id: "wukong-voice",
  image_url: null,
  character_expressions: [],
};

const sanzang = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "Tang Sanzang (三藏)",
  personality_prompt: "Patient and thoughtful",
  voice_id: "sanzang-voice",
  image_url: null,
  character_expressions: [],
};

describe("loadSelectedCharacter", () => {
  it("returns the newest selected companion without mutating the database", async () => {
    const selectedQuery = queryResult({
      data: { characters: sanzang },
    });
    const supabase = {
      from: vi.fn(() => selectedQuery),
    };

    const result = await loadSelectedCharacter(
      supabase as never,
      "profile-with-selection",
    );

    expect(result).toEqual({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Tang Sanzang (三藏)",
      personalityPrompt: "Patient and thoughtful",
      voiceId: "sanzang-voice",
      expressions: {
        neutral: "/img/main character/sam jang/삼장 명함.webp",
      },
    });
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(selectedQuery.upsert).not.toHaveBeenCalled();
  });

  it("uses the visible default without repairing state in a read helper", async () => {
    const selectedQuery = queryResult({ data: null });
    const defaultQuery = queryResult({ data: [wukong] });

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
      id: "44444444-4444-4444-8444-444444444444",
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
    expect(selectedQuery.upsert).not.toHaveBeenCalled();
    expect(defaultQuery.upsert).not.toHaveBeenCalled();
  });

  it("does not write a default row when the selected-character read fails", async () => {
    const selectedQuery = queryResult({
      data: null,
      error: { message: "temporary selected-character read failure" },
    });
    const supabase = {
      from: vi.fn(() => selectedQuery),
    };

    const result = await loadSelectedCharacter(
      supabase as never,
      "profile-during-read-outage",
    );

    expect(result).toEqual({
      id: undefined,
      name: "Sun Wukong (孙悟空)",
      personalityPrompt:
        "You are a friendly and encouraging study companion.",
      voiceId: "",
      expressions: {
        neutral: "/img/main character/son wukong/오공 명함.webp",
      },
    });
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(selectedQuery.upsert).not.toHaveBeenCalled();
  });

  it("does not write when the default-character lookup fails", async () => {
    const selectedQuery = queryResult({ data: null });
    const defaultQuery = queryResult({
      data: null,
      error: { message: "temporary default-character read failure" },
    });
    const supabase = {
      from: vi
        .fn()
        .mockReturnValueOnce(selectedQuery)
        .mockReturnValueOnce(defaultQuery),
    };

    const result = await loadSelectedCharacter(
      supabase as never,
      "profile-during-default-read-outage",
    );

    expect(result.name).toBe("Sun Wukong (孙悟空)");
    expect(selectedQuery.upsert).not.toHaveBeenCalled();
    expect(defaultQuery.upsert).not.toHaveBeenCalled();
  });

  it("prefers Sun Wukong when more than one character is marked as default", async () => {
    const selectedQuery = queryResult({ data: null });
    const defaultQuery = queryResult({
      data: [
        {
          ...sanzang,
          id: "66666666-6666-4666-8666-666666666666",
        },
        wukong,
      ],
    });
    const supabase = {
      from: vi
        .fn()
        .mockReturnValueOnce(selectedQuery)
        .mockReturnValueOnce(defaultQuery),
    };

    const result = await loadSelectedCharacter(
      supabase as never,
      "profile-with-several-defaults",
    );

    expect(result.id).toBe("44444444-4444-4444-8444-444444444444");
    expect(supabase.from).toHaveBeenCalledTimes(2);
    expect(selectedQuery.upsert).not.toHaveBeenCalled();
    expect(defaultQuery.upsert).not.toHaveBeenCalled();
  });
});
