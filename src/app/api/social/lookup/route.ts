import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, getSessionUser } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

// Friend codes are shared identifiers, but they are also enumerable, so the
// lookup budget per user stays small.
const LOOKUP_LIMIT_PER_MINUTE = 20;

const lookupRowsSchema = z.array(
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

  if (!checkRateLimit(`social-lookup:${user.id}`, LOOKUP_LIMIT_PER_MINUTE, 60_000)) {
    return NextResponse.json(
      { error: "Too many lookups, try again in a minute" },
      { status: 429 },
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.trim().length === 0) {
    return NextResponse.json(
      { error: "Friend code is required" },
      { status: 400 }
    );
  }

  const trimmedCode = code.trim();
  if (trimmedCode.length < 3 || trimmedCode.length > 50) {
    return NextResponse.json(
      { error: "Friend code must be 3-50 characters" },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_friend_code_profile", {
      requested_code: trimmedCode,
    });

    if (error) {
      throw error;
    }

    const rows = lookupRowsSchema.parse(data ?? []);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error("Lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
