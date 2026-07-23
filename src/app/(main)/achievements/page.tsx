import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { ACHIEVEMENTS } from "@/lib/achievements/definitions";
import type { Achievement } from "@/types/database";
import { AchievementsClient } from "./achievements-client";

// Static mirror of the DB catalog. If the DB read fails or comes back empty,
// the page still renders every locked achievement instead of an impossible
// "N total but 0 in every category" state.
const FALLBACK_CATALOG: Achievement[] = ACHIEVEMENTS.map((a) => ({
  id: a.key,
  key: a.key,
  name: a.name,
  description: a.description,
  emoji: a.emoji,
  tier: a.tier,
  sort_order: a.sortOrder,
}));

export default async function AchievementsPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [
    { data: allAchievements },
    { data: userAchievements },
  ] = await Promise.all([
    supabase
      .from("achievements")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase
      .from("user_achievements")
      .select("achievement_id, unlocked_at")
      .eq("user_id", user.id),
  ]);

  const usingFallback = !allAchievements || allAchievements.length === 0;
  const catalog = usingFallback ? FALLBACK_CATALOG : allAchievements;

  return (
    <AchievementsClient
      achievements={catalog}
      // Fallback catalog rows use keys as ids, so DB unlock rows (keyed by
      // real ids) could never match a card; showing everything locked is
      // more coherent than a count with no highlighted cards.
      userAchievements={usingFallback ? [] : (userAchievements ?? [])}
    />
  );
}
