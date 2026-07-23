import { describe, expect, it } from "vitest";

import {
  type CharacterReader,
  loadSelectedCharacterFromReader,
} from "@/lib/character-loader";

function reader({
  selectedData,
  selectedError = null,
  defaultData = [],
  defaultError = null,
}: {
  selectedData: unknown;
  selectedError?: unknown;
  defaultData?: unknown;
  defaultError?: unknown;
}): CharacterReader {
  return {
    async readSelected() {
      return { data: selectedData, error: selectedError };
    },
    async readDefaults() {
      return { data: defaultData, error: defaultError };
    },
  };
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

describe("loadSelectedCharacterFromReader", () => {
  it("returns the selected companion", async () => {
    const result = await loadSelectedCharacterFromReader(
      reader({ selectedData: { characters: sanzang } }),
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
  });

  it("uses the visible default when no selection exists", async () => {
    const result = await loadSelectedCharacterFromReader(
      reader({
        selectedData: null,
        defaultData: [wukong],
      }),
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
  });

  it("uses the static fallback when the selected-character read fails", async () => {
    const result = await loadSelectedCharacterFromReader(
      reader({
        selectedData: null,
        selectedError: {
          message: "temporary selected-character read failure",
        },
      }),
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
  });

  it("uses the static fallback when the default-character read fails", async () => {
    const result = await loadSelectedCharacterFromReader(
      reader({
        selectedData: null,
        defaultData: null,
        defaultError: {
          message: "temporary default-character read failure",
        },
      }),
      "profile-during-default-read-outage",
    );

    expect(result.name).toBe("Sun Wukong (孙悟空)");
    expect(result.id).toBeUndefined();
  });

  it("prefers Sun Wukong when more than one character is marked as default", async () => {
    const result = await loadSelectedCharacterFromReader(
      reader({
        selectedData: null,
        defaultData: [
          {
            ...sanzang,
            id: "66666666-6666-4666-8666-666666666666",
          },
          wukong,
        ],
      }),
      "profile-with-several-defaults",
    );

    expect(result.id).toBe("44444444-4444-4444-8444-444444444444");
  });
});
