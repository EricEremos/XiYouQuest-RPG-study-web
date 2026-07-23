import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient, getSessionUser } from "@/lib/supabase/server";
import { postgresIntegerSchema } from "@/lib/postgres-wire";

const socialStatsRowsSchema = z.array(
  z.object({
    friendship_id: z.string().uuid().nullable(),
    is_self: z.boolean(),
    id: z.string().uuid(),
    display_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
    current_level: postgresIntegerSchema,
    total_xp: postgresIntegerSchema,
    login_streak: postgresIntegerSchema,
    total_sessions: postgresIntegerSchema.pipe(z.number().nonnegative()),
    avg_scores: z.record(z.string(), z.number().nullable()),
    selected_character: z
      .object({
        name: z.string(),
        image_url: z.string().nullable(),
      })
      .nullable(),
    achievement_count: postgresIntegerSchema.pipe(z.number().nonnegative()),
  }),
);

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

    const rows = socialStatsRowsSchema.parse(data ?? []);
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
