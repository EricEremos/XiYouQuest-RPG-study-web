import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient, getSessionUser } from "@/lib/supabase/server";

const requestRowsSchema = z.array(
  z.object({
    direction: z.enum(["incoming", "outgoing"]),
    friendship_id: z.string().uuid(),
    created_at: z.string(),
    id: z.string().uuid(),
    display_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
    current_level: z.coerce.number().int(),
  }),
);

type RequestRow = z.infer<typeof requestRowsSchema>[number];

function toRequestEntry(row: RequestRow) {
  return {
    friendship_id: row.friendship_id,
    created_at: row.created_at,
    user: {
      id: row.id,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      current_level: row.current_level,
    },
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_pending_friend_requests");

    if (error) {
      console.error("Requests fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch requests" },
        { status: 500 }
      );
    }

    const rows = requestRowsSchema.parse(data ?? []);

    return NextResponse.json({
      incoming: rows
        .filter((row) => row.direction === "incoming")
        .map(toRequestEntry),
      outgoing: rows
        .filter((row) => row.direction === "outgoing")
        .map(toRequestEntry),
    });
  } catch (error) {
    console.error("Requests error:", error);
    return NextResponse.json(
      { error: "Failed to fetch requests" },
      { status: 500 }
    );
  }
}
