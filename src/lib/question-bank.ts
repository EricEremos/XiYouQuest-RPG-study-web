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

/**
 * Whether a question_banks row with exactly this content exists for the
 * component. Used to validate client-submitted values (e.g. C5 speaking
 * topics) against the whole bank instead of a capped list fetch, which
 * silently rejected rows past the cap. Errors fail closed (false).
 *
 * Content values are stored trimmed (and the C5 picker serves trimmed
 * strings), so the exact-equality match is safe.
 */
export async function questionBankHasContent(
  supabase: SupabaseClient,
  component: number,
  content: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("question_banks")
    .select("id")
    .eq("component", component)
    .eq("content", content)
    .limit(1);

  if (error) {
    console.error(
      `[question-bank] content lookup (component=${component}) failed:`,
      error,
    );
    return false;
  }

  return (data ?? []).length > 0;
}
