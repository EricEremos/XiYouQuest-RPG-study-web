import assert from "node:assert/strict";

const expectedLearningAchievements = [
  {
    key: "learning_adapting",
    name: "Adapting (因材施教)",
    description: "Complete all 3 mid-checkpoints",
    emoji: "🎯",
    tier: "rare",
    sort_order: 43,
  },
  {
    key: "learning_exam_ready",
    name: "Exam Ready (胸有成竹)",
    description: "Complete an entire learning plan",
    emoji: "🎓",
    tier: "epic",
    sort_order: 44,
  },
  {
    key: "learning_first_step",
    name: "First Step (学习启程)",
    description: "Complete the initial learning path assessment",
    emoji: "📋",
    tier: "common",
    sort_order: 41,
  },
  {
    key: "learning_on_track",
    name: "On Track (按部就班)",
    description: "Complete the first mid-checkpoint",
    emoji: "📊",
    tier: "uncommon",
    sort_order: 42,
  },
];

export async function verifyAchievementCatalog(client) {
  const { rows } = await client.query(
    `SELECT key, name, description, emoji, tier::TEXT, sort_order
     FROM public.achievements
     WHERE key = ANY($1::TEXT[])
     ORDER BY key`,
    [expectedLearningAchievements.map(({ key }) => key)],
  );

  assert.deepEqual(rows, expectedLearningAchievements);
  return "personalized-learning achievement catalog matches the application contract";
}
