export interface PscReadingScope {
  text: string;
  syllableCount: number;
  truncated: boolean;
}

function removeParentheticalText(text: string): string {
  let depth = 0;
  let result = "";

  for (const character of text) {
    if (character === "（" || character === "(" || character === "【" || character === "[") {
      depth += 1;
      continue;
    }
    if (character === "）" || character === ")" || character === "】" || character === "]") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) result += character;
  }

  return result;
}

export function scopeOfficialReadingPassage(text: string, limit = 400): PscReadingScope {
  const assessableText = removeParentheticalText(text);
  let syllableCount = 0;
  let scopedText = "";

  for (const character of assessableText) {
    const isSyllable = /\p{Script=Han}/u.test(character);
    if (isSyllable && syllableCount >= limit) break;
    scopedText += character;
    if (isSyllable) syllableCount += 1;
  }

  const totalSyllables = [...assessableText].filter((character) => /\p{Script=Han}/u.test(character)).length;
  return {
    text: scopedText.trim(),
    syllableCount,
    truncated: totalSyllables > limit,
  };
}
