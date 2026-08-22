export type ReadingPassageSource = {
  label: string;
  isSchoolProvided: boolean;
};

type PassageMetadata = {
  source_scope?: unknown;
  source_title?: unknown;
  source_version?: unknown;
};

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getReadingPassageSource(metadata: PassageMetadata | null | undefined): ReadingPassageSource {
  const sourceTitle = nonEmptyText(metadata?.source_title);
  const sourceVersion = nonEmptyText(metadata?.source_version);

  if (
    metadata?.source_scope === "school_provided_public_use" &&
    sourceTitle &&
    sourceVersion
  ) {
    return {
      label: `School-provided practice source: ${sourceTitle} (${sourceVersion})`,
      isSchoolProvided: true,
    };
  }

  return {
    label: "XiYouQuest practice passage — source record pending; not an official PSC reading text.",
    isSchoolProvided: false,
  };
}

export const XIYOUQUEST_ORIGINAL_READING_SOURCE: ReadingPassageSource = {
  label: "XiYouQuest original practice passage — not an official PSC reading text.",
  isSchoolProvided: false,
};
