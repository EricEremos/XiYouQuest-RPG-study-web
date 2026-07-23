import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Fisher-Yates shuffle: returns a new shuffled copy of the array */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Extract the (first) tone from a tone-number pinyin string.
 * e.g. "zhe2" -> 2, "fu2 dian3" -> 2 (first syllable), "ma" / "r5" -> 0 (neutral/unknown).
 */
export function toneFromPinyin(pinyin?: string | null): 0 | 1 | 2 | 3 | 4 {
  if (!pinyin) return 0;
  const m = pinyin.match(/[1-4]/);
  return m ? (Number(m[0]) as 1 | 2 | 3 | 4) : 0;
}

/**
 * Tone-stratified sample: returns `count` items with an even spread across the four
 * main tones (1-4), drawing extras/leftovers (incl. neutral) to fill. The result is
 * shuffled so tones interleave. Falls back to a plain shuffle when there are too few
 * items. Used so reading sections (C1/C2) don't skew toward one tone (e.g. 3rd tone).
 */
export function sampleByTone<T extends { pinyin?: string | null }>(items: T[], count: number): T[] {
  if (items.length <= count) return shuffle(items);

  const groups: Record<0 | 1 | 2 | 3 | 4, T[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  for (const item of items) groups[toneFromPinyin(item.pinyin)].push(item);
  (Object.keys(groups) as unknown as (0 | 1 | 2 | 3 | 4)[]).forEach((k) => {
    groups[k] = shuffle(groups[k]);
  });

  const mainTones: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];
  const perTone = Math.floor(count / mainTones.length);

  const picked: T[] = [];
  for (const tone of mainTones) {
    picked.push(...groups[tone].splice(0, perTone));
  }

  // Fill the remainder (rounding + any short tone groups) from everything left, neutral included.
  const leftover = shuffle([...groups[1], ...groups[2], ...groups[3], ...groups[4], ...groups[0]]);
  while (picked.length < count && leftover.length > 0) {
    picked.push(leftover.shift()!);
  }

  const ordered = shuffle(picked);
  // FU Laoshi feedback: "the first question is also too random." Open on a first-tone
  // (阴平) item (the conventional warm-up tone) so the reading section always starts
  // on a predictable, easy tone instead of an arbitrary one. Rest stays shuffled.
  const openerIdx = ordered.findIndex((it) => toneFromPinyin(it.pinyin) === 1);
  if (openerIdx > 0) {
    const [opener] = ordered.splice(openerIdx, 1);
    ordered.unshift(opener);
  }
  return ordered;
}

/** Format a date string as a relative time (e.g. "2h ago", "3d ago") */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/** Randomize answer positions in a quiz question */
export function randomizeAnswerPositions<T extends { options: string[]; correctIndex: number }>(question: T): T {
  const indices = question.options.map((_, i) => i);
  const shuffledIndices = shuffle(indices);
  const shuffledOptions = shuffledIndices.map(i => question.options[i]);
  const newCorrectIndex = shuffledIndices.indexOf(question.correctIndex);

  return {
    ...question,
    options: shuffledOptions,
    correctIndex: newCorrectIndex,
  };
}
