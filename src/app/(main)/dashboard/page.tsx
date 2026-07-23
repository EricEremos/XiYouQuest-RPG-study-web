import { createClient, getSessionUser } from "@/lib/supabase/server";
import { loadSelectedCharacter } from "@/lib/character-loader";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await getSessionUser();

  const userId = user!.id;

  const [{ data: profile }, selectedCharacter] =
    await Promise.all([
      supabase.from("profiles").select("display_name, total_xp, login_streak").eq("id", userId).single(),
      loadSelectedCharacter(supabase, userId),
    ]);

  const charName = selectedCharacter.name;
  const charImage =
    selectedCharacter.expressions.neutral ??
    Object.values(selectedCharacter.expressions)[0] ??
    null;

  return (
    <DashboardClient
      displayName={profile?.display_name ?? null}
      totalXP={profile?.total_xp ?? 0}
      loginStreak={profile?.login_streak ?? 0}
      charName={charName}
      charImage={charImage}
    />
  );
}
