import { afterEach, describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchQuestionSample } from "./question-bank";

function makeSupabase(result: { data: unknown; error: unknown }) {
  const select = vi.fn().mockResolvedValue(result);
  const rpc = vi.fn(() => ({ select }));
  return { supabase: { rpc } as unknown as SupabaseClient, rpc, select };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchQuestionSample", () => {
  test("requests a server-side random sample via the sample_question_bank RPC", async () => {
    const rows = [
      { content: "八", pinyin: "ba1" },
      { content: "把", pinyin: "ba3" },
    ];
    const { supabase, rpc, select } = makeSupabase({ data: rows, error: null });

    const result = await fetchQuestionSample(supabase, 1, 600);

    expect(rpc).toHaveBeenCalledWith("sample_question_bank", {
      p_component: 1,
      p_n: 600,
    });
    expect(select).toHaveBeenCalledWith("content, pinyin");
    expect(result).toEqual(rows);
  });

  test("returns an empty array when the RPC errors, so callers use their fallback content", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = makeSupabase({
      data: null,
      error: { message: "function does not exist" },
    });

    const result = await fetchQuestionSample(supabase, 2, 600);

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });

  test("returns an empty array when the RPC yields no rows", async () => {
    const { supabase } = makeSupabase({ data: null, error: null });

    const result = await fetchQuestionSample(supabase, 1, 50);

    expect(result).toEqual([]);
  });
});
