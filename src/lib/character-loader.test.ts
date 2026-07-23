import { describe, expect, it, vi } from "vitest";
import { loadSelectedCharacter } from "@/lib/character-loader";

function queryResult({
  data,
  error = null,
  upsertError = null,
}: {
  data: unknown;
  error?: unknown;
  upsertError?: unknown;
}) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    upsert: vi.fn(async () => ({ error: upsertError })),
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
  id: "default-wukong",
  name: "Sun Wukong (孙悟空)",
  personality_prompt: "Bold and encouraging",
  voice_id: "wukong-voice",
  image_url: null,
  character_expressions: [],
};

const sanzang = {
  id: "selected-sanzang",
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
      id: "selected-sanzang",
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

  it("uses the default character when an existing user has no selected companion row", async () => {
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

  it("re-reads the selected companion when a concurrent repair wins the write race", async () => {
    const initialSelectedQuery = queryResult({ data: null });
    const defaultQuery = queryResult({ data: [wukong] });
    const writeQuery = queryResult({
      data: null,
      upsertError: { code: "23505", message: "unique constraint" },
    });
    const retrySelectedQuery = queryResult({
      data: { characters: sanzang },
    });
    const supabase = {
      from: vi
        .fn()
        .mockReturnValueOnce(initialSelectedQuery)
        .mockReturnValueOnce(defaultQuery)
        .mockReturnValueOnce(writeQuery)
        .mockReturnValueOnce(retrySelectedQuery),
    };

    const result = await loadSelectedCharacter(
      supabase as never,
      "profile-with-concurrent-selection",
    );

    expect(writeQuery.upsert).toHaveBeenCalledTimes(1);
    expect(result.id).toBe("selected-sanzang");
    expect(result.name).toBe("Tang Sanzang (三藏)");
  });

  it("keeps the visible default when the repair write and verification read both fail", async () => {
    const initialSelectedQuery = queryResult({ data: null });
    const defaultQuery = queryResult({ data: [wukong] });
    const writeQuery = queryResult({
      data: null,
      upsertError: { message: "temporary write failure" },
    });
    const retrySelectedQuery = queryResult({
      data: null,
      error: { message: "temporary verification read failure" },
    });
    const supabase = {
      from: vi
        .fn()
        .mockReturnValueOnce(initialSelectedQuery)
        .mockReturnValueOnce(defaultQuery)
        .mockReturnValueOnce(writeQuery)
        .mockReturnValueOnce(retrySelectedQuery),
    };

    const result = await loadSelectedCharacter(
      supabase as never,
      "profile-during-write-outage",
    );

    expect(result.id).toBe("default-wukong");
    expect(result.name).toBe("Sun Wukong (孙悟空)");
  });

  it("prefers Sun Wukong when more than one character is marked as default", async () => {
    const selectedQuery = queryResult({ data: null });
    const defaultQuery = queryResult({
      data: [
        {
          ...sanzang,
          id: "default-sanzang",
        },
        wukong,
      ],
    });
    const writeQuery = queryResult({ data: null });
    const supabase = {
      from: vi
        .fn()
        .mockReturnValueOnce(selectedQuery)
        .mockReturnValueOnce(defaultQuery)
        .mockReturnValueOnce(writeQuery),
    };

    const result = await loadSelectedCharacter(
      supabase as never,
      "profile-with-several-defaults",
    );

    expect(result.id).toBe("default-wukong");
    expect(writeQuery.upsert).toHaveBeenCalledWith(
      {
        user_id: "profile-with-several-defaults",
        character_id: "default-wukong",
        is_selected: true,
      },
      { onConflict: "user_id,character_id" },
    );
  });
});
