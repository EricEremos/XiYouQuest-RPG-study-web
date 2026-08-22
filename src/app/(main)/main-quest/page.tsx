// src/app/(main)/main-quest/page.tsx
import { createClient, getSessionUser } from "@/lib/supabase/server";
import dynamic from "next/dynamic";
import type { StageNumber } from "@/lib/quest/types";
import { getUnlockedCharacters } from "@/lib/quest/battle-logic";
import { PageLoadMetric } from "@/components/shared/page-load-metric";
import { measureServerQuery } from "@/lib/server/load-metrics";

const MainQuestClient = dynamic(
  () => import("./main-quest-client").then((m) => m.MainQuestClient),
  {
    loading: () => (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 w-48 bg-muted rounded" />
        <div className="h-64 bg-muted rounded pixel-border" />
      </div>
    ),
  }
);

export default async function MainQuestPage() {
  const supabase = await createClient();
  const user = await getSessionUser();

  const userId = user!.id;

  const { result: questProgressResult, durationMs } = await measureServerQuery(
    "MainQuest.quest_progress",
    supabase
      .from("quest_progress")
      .select("*")
      .eq("user_id", userId)
      .order("stage", { ascending: true })
  );
  const { data: questProgress, error } = questProgressResult;

  if (error) throw new Error(`Quest progress query failed: ${error.message}`);

  const clearedStages = (questProgress ?? [])
    .filter((p: { is_cleared: boolean }) => p.is_cleared)
    .map((p: { stage: number }) => p.stage as StageNumber);

  const unlockedCharacters = getUnlockedCharacters(clearedStages);

  return (
    <>
      <PageLoadMetric name="MainQuest" serverDataMs={durationMs} />
      <MainQuestClient
        questProgress={questProgress ?? []}
        unlockedCharacters={unlockedCharacters}
      />
    </>
  );
}
