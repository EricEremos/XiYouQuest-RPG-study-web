"use client";

import { useMemo, useSyncExternalStore } from "react";

interface ChineseTextProps {
  text: string;
  className?: string;
}

// CJK and common Western closing punctuation that must not start a line.
const TRAILING_PUNCTUATION = /^[、。，；：？！”’）》〉】」』,.;:?!)\]}]+$/;

const emptySubscribe = () => () => {};

/**
 * Renders Chinese text with phrase-aware line wrapping. Browsers break CJK
 * text between any two characters, splitting words like 明白 or 每一步 across
 * lines. Intl.Segmenter's word granularity finds word boundaries, and wrapping
 * each word in an inline-block span makes it unbreakable.
 *
 * Segmentation is applied only after hydration (via useSyncExternalStore):
 * server and browser ICU dictionaries can disagree on boundaries, and a
 * differing span structure during hydration would trigger React error 418.
 */
export function ChineseText({ text, className }: ChineseTextProps) {
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const segments = useMemo(() => {
    if (!hydrated || typeof Intl === "undefined" || !("Segmenter" in Intl)) {
      return null;
    }
    const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
    const words: string[] = [];
    for (const { segment } of segmenter.segment(text)) {
      // Glue punctuation onto the preceding word so lines never begin with
      // a comma or full stop.
      if (TRAILING_PUNCTUATION.test(segment) && words.length > 0) {
        words[words.length - 1] += segment;
      } else {
        words.push(segment);
      }
    }
    return words;
  }, [hydrated, text]);

  if (!segments) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {segments.map((word, i) => (
        <span key={i} className="inline-block">
          {word}
        </span>
      ))}
    </span>
  );
}
