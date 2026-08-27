import type { SupabaseClient } from "@supabase/supabase-js";

/** Row shape C1/C2 consumers read (matches the previous `.select("content, pinyin")`). */
export interface QuestionSampleRow {
  content: string;
  pinyin: string | null;
}

/**
 * Uniform random sample of `count` question_banks rows for a component, drawn
 * server-side by the `sample_question_bank` RPC (ORDER BY random()).
 *
 * Replaces capped `.from("question_banks").limit(n)` reads: PostgREST without
 * an ORDER BY returns physical row order, so rows inserted after the original
 * seed sat past the cap and were never served. Errors resolve to an empty
 * array so callers keep their built-in fallback content.
 */
export async function fetchQuestionSample(
  supabase: SupabaseClient,
  component: number,
  count: number,
): Promise<QuestionSampleRow[]> {
  const { data, error } = await supabase
    .rpc("sample_question_bank", { p_component: component, p_n: count })
    .select("content, pinyin");

  if (error) {
    console.error(
      `[question-bank] sample_question_bank(component=${component}, n=${count}) failed:`,
      error,
    );
    return [];
  }

  return (data ?? []) as QuestionSampleRow[];
}
