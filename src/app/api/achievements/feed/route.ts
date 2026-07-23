import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient, getSessionUser } from "@/lib/supabase/server";

const feedRowsSchema = z.array(
  z.object({
    unlocked_at: z.string(),
    user_id: z.string().uuid(),
    display_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
    achievement_key: z.string(),
    achievement_name: z.string(),
    achievement_emoji: z.string().nullable(),
    achievement_tier: z.string(),
    is_self: z.boolean(),
  }),
);

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_achievement_feed");

    if (error) {
      console.error("Achievement feed query error:", error);
      return NextResponse.json({ error: "Failed to fetch feed" }, { status: 500 });
    }

    const entries = feedRowsSchema.parse(data ?? []).map((row) => ({
      unlocked_at: row.unlocked_at,
      user_id: row.user_id,
      display_name: row.display_name ?? "Unknown",
      avatar_url: row.avatar_url,
      achievement_key: row.achievement_key,
      achievement_name: row.achievement_name,
      achievement_emoji: row.achievement_emoji,
      achievement_tier: row.achievement_tier,
      is_self: row.is_self,
    }));

    return NextResponse.json({ feed: entries });
  } catch (err) {
    console.error("Achievement feed error:", err);
    return NextResponse.json({ error: "Failed to fetch feed" }, { status: 500 });
  }
}
