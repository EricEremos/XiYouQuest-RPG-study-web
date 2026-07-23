import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, getSessionUser } from "@/lib/supabase/server";
import { leaderboardQuerySchema } from "@/lib/validations";

interface RankingEntry {
  rank: number;
  id: string;
  display_name: string;
  avatar_url: string | null;
  current_level: number;
  value: number;
}

const projectionRowsSchema = z.array(
  z.object({
    rank: z.coerce.number().int().positive(),
    id: z.string().uuid(),
    display_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
    current_level: z.coerce.number().int(),
    value: z.coerce.number().finite(),
  }),
);

type ProjectionRow = z.infer<typeof projectionRowsSchema>[number];

const LEADERBOARD_LIMIT = 20;

function normalizeRow(row: ProjectionRow): RankingEntry {
  return {
    rank: Number(row.rank),
    id: row.id,
    display_name: row.display_name ?? "Anonymous",
    avatar_url: row.avatar_url,
    current_level: row.current_level,
    value: Number(row.value),
  };
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = leaderboardQuerySchema.safeParse({
    tab: request.nextUrl.searchParams.get("tab"),
    scope: request.nextUrl.searchParams.get("scope"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "get_leaderboard_projection",
      {
        requested_metric: parsed.data.tab,
        requested_scope: parsed.data.scope,
      },
    );

    if (error) {
      throw error;
    }

    const projected = projectionRowsSchema.parse(data ?? []).map(normalizeRow);
    const currentUser = projected.find((entry) => entry.id === user.id);

    return NextResponse.json({
      rankings:
        parsed.data.scope === "global"
          ? projected.filter((entry) => entry.rank <= LEADERBOARD_LIMIT)
          : projected,
      user_rank: currentUser
        ? { rank: currentUser.rank, value: currentUser.value }
        : null,
    });
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 },
    );
  }
}
