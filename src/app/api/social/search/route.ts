import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, getSessionUser } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

const SEARCH_LIMIT_PER_MINUTE = 30;

// friend_code is deliberately absent: search results are for sending requests
// by id, and returning other users' codes would widen the enumeration surface.
const searchRowsSchema = z.array(
  z.object({
    id: z.string().uuid(),
    display_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
    current_level: z.coerce.number().int(),
  }),
);

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(`social-search:${user.id}`, SEARCH_LIMIT_PER_MINUTE, 60_000)) {
    return NextResponse.json(
      { error: "Too many searches, try again in a minute" },
      { status: 429 },
    );
  }

  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 2) {
    return NextResponse.json(
      { error: "Query must be at least 2 characters" },
      { status: 400 }
    );
  }
  if (q.trim().length > 50) {
    return NextResponse.json(
      { error: "Query must be at most 50 characters" },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("search_profiles_for_friends", {
      search_term: q.trim(),
    });

    if (error) {
      console.error("Search error:", error);
      return NextResponse.json(
        { error: "Search failed" },
        { status: 500 }
      );
    }

    return NextResponse.json(searchRowsSchema.parse(data ?? []));
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
