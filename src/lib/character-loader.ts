import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getCharacterImageFallback } from "@/lib/character-images";

export interface LoadedCharacter {
  id: string | undefined;
  name: string;
  personalityPrompt: string;
  voiceId: string;
  expressions: Record<string, string>;
}

const characterRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  personality_prompt: z.string().nullable(),
  voice_id: z.string().nullable(),
  character_expressions: z
    .array(
      z.object({
        expression_name: z.string().min(1),
        image_url: z.string().min(1),
      }),
    )
    .nullable()
    .optional(),
});

const userCharacterRecordSchema = z.object({
  characters: characterRecordSchema.nullable(),
});

type CharacterRecord = z.infer<typeof characterRecordSchema>;

type CharacterReadResult = {
  data: unknown;
  error: unknown;
};

export interface CharacterReader {
  readSelected(userId: string): Promise<CharacterReadResult>;
  readDefaults(): Promise<CharacterReadResult>;
}

const STARTER_CHARACTER_NAME = "Sun Wukong (孙悟空)";
const STATIC_STUDY_BUDDY = {
  name: STARTER_CHARACTER_NAME,
  personality_prompt: "You are a friendly and encouraging study companion.",
  voice_id: "",
  character_expressions: [],
} satisfies Omit<CharacterRecord, "id">;

function toLoadedCharacter(characterData?: CharacterRecord | null): LoadedCharacter {
  const resolvedCharacter = characterData ?? STATIC_STUDY_BUDDY;
  const expressions: Record<string, string> = {};

  for (const expression of resolvedCharacter.character_expressions ?? []) {
    expressions[expression.expression_name] = expression.image_url;
  }

  const characterName = resolvedCharacter.name ?? STARTER_CHARACTER_NAME;

  return {
    id: characterData?.id,
    name: characterName,
    personalityPrompt:
      resolvedCharacter.personality_prompt ??
      "You are a friendly and encouraging study companion.",
    voiceId: resolvedCharacter.voice_id ?? "",
    expressions: getCharacterImageFallback(characterName, expressions),
  };
}

function createCharacterReader(
  supabase: SupabaseClient,
): CharacterReader {
  return {
    async readSelected(userId) {
      return await supabase
        .from("user_characters")
        .select(`
          *,
          characters (
            *,
            character_expressions (*)
          )
        `)
        .eq("user_id", userId)
        .eq("is_selected", true)
        .order("unlocked_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    },
    async readDefaults() {
      return await supabase
        .from("characters")
        .select(`
          *,
          character_expressions (*)
        `)
        .eq("is_default", true)
        .order("name", { ascending: true });
    },
  };
}

export async function loadSelectedCharacterFromReader(
  reader: CharacterReader,
  userId: string,
): Promise<LoadedCharacter> {
  const {
    data: userCharacter,
    error: selectedCharacterError,
  } = await reader.readSelected(userId);

  // A failed read is not proof that the user has no selection. Avoid mutating
  // state during a transient outage and render the safe static fallback.
  if (selectedCharacterError) {
    return toLoadedCharacter();
  }

  const selectedCharacter = userCharacterRecordSchema.safeParse(userCharacter);
  let characterData = selectedCharacter.success
    ? selectedCharacter.data.characters
    : null;

  if (!characterData) {
    const {
      data: defaultCharacters,
      error: defaultCharacterError,
    } = await reader.readDefaults();

    if (defaultCharacterError) {
      return toLoadedCharacter();
    }

    const parsedDefaults = z
      .array(characterRecordSchema)
      .safeParse(defaultCharacters ?? []);
    if (!parsedDefaults.success) {
      return toLoadedCharacter();
    }

    const defaults = parsedDefaults.data;
    const defaultCharacter =
      defaults.find((character) => character.name === STARTER_CHARACTER_NAME) ??
      defaults[0] ??
      null;
    characterData = defaultCharacter;
  }

  return toLoadedCharacter(characterData);
}

/**
 * Load the user's selected character with expressions from Supabase.
 * Shared across all component pages to avoid duplication.
 */
export async function loadSelectedCharacter(
  supabase: SupabaseClient,
  userId: string,
): Promise<LoadedCharacter> {
  return loadSelectedCharacterFromReader(
    createCharacterReader(supabase),
    userId,
  );
}
