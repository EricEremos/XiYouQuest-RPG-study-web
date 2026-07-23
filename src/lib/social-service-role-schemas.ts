import { z } from "zod";

import { postgresIntegerSchema } from "@/lib/postgres-wire";

export const socialProfileProjectionSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  current_level: postgresIntegerSchema,
});

export const socialProfileLookupSchema = socialProfileProjectionSchema.extend({
  friend_code: z.string(),
});

export const socialSearchProfilesSchema = z.array(
  socialProfileProjectionSchema.extend({
    friend_code: z.string().nullable(),
  }),
);

export const socialPendingIncomingRequestSchema = z.object({
  id: z.string().uuid(),
  requester_id: z.string().uuid(),
  created_at: z.string(),
});

export const socialPendingOutgoingRequestSchema = z.object({
  id: z.string().uuid(),
  addressee_id: z.string().uuid(),
  created_at: z.string(),
});

export const socialAcceptedFriendshipSchema = z.object({
  requester_id: z.string().uuid(),
  addressee_id: z.string().uuid(),
});

export const socialAchievementFeedProfileSchema = z.object({
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

export const socialAchievementSchema = z.object({
  key: z.string(),
  name: z.string(),
  emoji: z.string(),
  tier: z.string(),
});

export const socialAchievementFeedRowSchema = z.object({
  unlocked_at: z.string(),
  user_id: z.string().uuid(),
  achievements: socialAchievementSchema.nullable(),
  profiles: socialAchievementFeedProfileSchema.nullable(),
});
