import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpressionName } from "@/types/character";
import { getCharacterImageFallback } from "@/lib/character-images";

export interface LoadedCharacter {
  id: string | undefined;
  name: string;
  personalityPrompt: string;
  voiceId: string;
  expressions: Record<string, string>;
}

interface CharacterRecord {
  id?: string;
  name?: string;
  personality_prompt?: string | null;
  voice_id?: string | null;
  character_expressions?: Array<{
    expression_name: ExpressionName;
    image_url: string;
  }> | null;
}

interface UserCharacterRecord {
  characters?: CharacterRecord | null;
}

const STARTER_CHARACTER_NAME = "Sun Wukong (孙悟空)";
const STATIC_STUDY_BUDDY: CharacterRecord = {
  name: STARTER_CHARACTER_NAME,
  personality_prompt: "You are a friendly and encouraging study companion.",
  voice_id: "",
  character_expressions: [],
};

function toLoadedCharacter(characterData?: CharacterRecord | null): LoadedCharacter {
  const resolvedCharacter = characterData ?? STATIC_STUDY_BUDDY;
  const expressions: Record<string, string> = {};

  for (const expression of resolvedCharacter.character_expressions ?? []) {
    expressions[expression.expression_name] = expression.image_url;
  }

  const characterName = resolvedCharacter.name ?? STARTER_CHARACTER_NAME;

  return {
    id: resolvedCharacter.id,
    name: characterName,
    personalityPrompt:
      resolvedCharacter.personality_prompt ??
      "You are a friendly and encouraging study companion.",
    voiceId: resolvedCharacter.voice_id ?? "",
    expressions: getCharacterImageFallback(characterName, expressions),
  };
}

async function readSelectedCharacter(
  supabase: SupabaseClient,
  userId: string,
) {
  return supabase
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
}

/**
 * Load the user's selected character with expressions from Supabase.
 * Shared across all component pages to avoid duplication.
 */
export async function loadSelectedCharacter(
  supabase: SupabaseClient,
  userId: string
): Promise<LoadedCharacter> {
  const {
    data: userCharacter,
    error: selectedCharacterError,
  } = await readSelectedCharacter(supabase, userId);

  // A failed read is not proof that the user has no selection. Avoid mutating
  // state during a transient outage and render the safe static fallback.
  if (selectedCharacterError) {
    return toLoadedCharacter();
  }

  let characterData = (userCharacter as UserCharacterRecord | null)?.characters;
  if (!characterData) {
    const {
      data: defaultCharacters,
      error: defaultCharacterError,
    } = await supabase
      .from("characters")
      .select(`
        *,
        character_expressions (*)
      `)
      .eq("is_default", true)
      .order("name", { ascending: true });

    if (defaultCharacterError) {
      return toLoadedCharacter();
    }

    const defaults = (defaultCharacters ?? []) as CharacterRecord[];
    const defaultCharacter =
      defaults.find((character) => character.name === STARTER_CHARACTER_NAME) ??
      defaults[0] ??
      null;
    characterData = defaultCharacter;

    if (defaultCharacter?.id) {
      const { error: repairError } = await supabase
        .from("user_characters")
        .upsert(
          {
            user_id: userId,
            character_id: defaultCharacter.id,
            is_selected: true,
          },
          { onConflict: "user_id,character_id" },
        );

      // A concurrent request may have selected a companion between our read and
      // write. Re-read once after any failed repair and prefer the winning row.
      if (repairError) {
        const {
          data: repairedUserCharacter,
          error: verificationError,
        } = await readSelectedCharacter(supabase, userId);
        const repairedCharacter = (
          repairedUserCharacter as UserCharacterRecord | null
        )?.characters;
        if (!verificationError && repairedCharacter) {
          characterData = repairedCharacter;
        }
      }
    }
  }

  return toLoadedCharacter(characterData);
}
