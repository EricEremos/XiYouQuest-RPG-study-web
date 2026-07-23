import { NextResponse } from "next/server";
import { createClient, getSessionUser } from "@/lib/supabase/server";

interface UserStats {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  current_level: number;
  total_xp: number;
  login_streak: number;
  total_sessions: number;
  avg_scores: Record<number, number | null>;
  selected_character: {
    name: string;
    image_url: string | null;
  } | null;
  achievement_count: number;
}

interface SocialStatsRow extends UserStats {
  friendship_id: string | null;
  is_self: boolean;
}

export async function GET() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabase.rpc("get_social_friend_stats");

    if (error) {
      console.error("Friends fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch friends" },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as SocialStatsRow[];
    const selfStats = rows.find((row) => row.is_self) ?? null;
    const friends = rows
      .filter((row) => !row.is_self && row.friendship_id)
      .map((row) => ({
        friendship_id: row.friendship_id,
        id: row.id,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
        current_level: row.current_level,
        total_xp: row.total_xp,
        login_streak: row.login_streak,
        total_sessions: row.total_sessions,
        avg_scores: row.avg_scores,
        selected_character: row.selected_character,
        achievement_count: row.achievement_count,
      }));

    return NextResponse.json({
      self: selfStats,
      friends,
    });
  } catch (error) {
    console.error("Friends error:", error);
    return NextResponse.json(
      { error: "Failed to fetch friends" },
      { status: 500 }
    );
  }
}
