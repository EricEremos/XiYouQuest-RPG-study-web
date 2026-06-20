// Topic-categorized speaking guidance for 命题说话 (PSC Section 5).
// Each prompt type needs a different structure (describe vs narrate vs argue vs instruct),
// so a single template no longer fits all 50+ topics.

export type TopicCategory =
  | "descriptive"
  | "narrative"
  | "personal-opinion"
  | "social-issue"
  | "procedural";

export interface SpeakingGuide {
  label: string;
  template: string;
  tips: string[];
}

export const SPEAKING_GUIDES: Record<TopicCategory, SpeakingGuide> = {
  descriptive: {
    label: "描述说明类 (Describe a person / place / thing)",
    template:
      "开头（10–15秒）：我想谈谈……。在我心里，它/他很特别。\n" +
      "主体（约2分20秒）：\n" +
      "  第一，是什么——介绍基本情况（外形/特点/背景）。\n" +
      "  第二，为什么喜欢——说出两三个具体理由 + 一个生动的细节或小场景。\n" +
      "  第三，它对我的意义——它怎样影响了我的生活或心情。\n" +
      "结尾（10–15秒）：总之，……是我生活里很重要的一部分，以后我还会……",
    tips: [
      "用‘五感’铺细节：颜色、声音、味道、触感、画面，让描述具体可感。",
      "至少讲一个具体的小场景或小故事，不要只堆形容词。",
      "按‘整体→局部→感受’的顺序展开，避免想到哪说到哪。",
      "多用‘比如说、特别是、最让我难忘的是’把例子引出来，自然不卡顿。",
      "结尾把‘它对我的意义’点出来，比单纯说‘我很喜欢’更有深度。",
      "注意儿化与轻声（如‘小盒儿、东西’），描述类口语词多，发音最易暴露口音。",
    ],
  },

  narrative: {
    label: "叙事经历类 (Tell about one experience / memory)",
    template:
      "开头（10–15秒）：我想讲一次……的经历，到现在我还记得很清楚。\n" +
      "主体（约2分20秒）：\n" +
      "  起因——当时是什么情况、为什么会发生（时间、地点、人物）。\n" +
      "  经过——按时间顺序讲，把最关键的一两个细节讲细（动作、对话、心理）。\n" +
      "  高潮/转折——最紧张或最打动我的那一刻。\n" +
      "结尾（10–15秒）：这件事让我明白了……，从那以后我……",
    tips: [
      "只讲‘一件事’，把它讲透；不要平铺好几件事。",
      "用时间线索词串起来：先是、接着、后来、最后，让叙事有节奏不混乱。",
      "加入对话和心理活动（‘我心想……’‘他对我说……’），比纯叙述更生动。",
      "在转折处放慢语速、加重停顿，制造画面感，也帮你撑满时间。",
      "结尾一定要落到‘我懂得了什么’，把经历升华为感悟。",
      "全程用过去的时间词，注意人称和事件一致，别讲到一半改主角。",
    ],
  },

  "personal-opinion": {
    label: "观点态度类 (Your view on a personal value)",
    template:
      "开头（10–15秒）：说到‘……’，我的理解是……（先给一句你的定义/态度）。\n" +
      "主体（约2分20秒）：\n" +
      "  第一，我为什么这样看——讲清你的道理。\n" +
      "  第二，用我自己的经历来证明（亲身的小例子最有说服力）。\n" +
      "  第三，反过来说——如果没有它/不这样会怎样，做个对比。\n" +
      "结尾（10–15秒）：所以对我来说，‘……’的意义就在于……，我会一直这样做。",
    tips: [
      "开头先给一句你自己的‘定义’，立场清楚，老师一听就懂。",
      "一定要用‘亲身经历’而不是大道理来论证，个人例子最真实也最好讲。",
      "用‘对比’撑深度：有它/没它、以前/现在、别人/我，对照着说。",
      "避免喊口号（‘我们一定要……’），命题说话考的是个人表达，不是演讲稿。",
      "用‘在我看来、对我而言、我始终相信’亮明态度，避免立场摇摆。",
      "结尾回扣开头的定义，首尾呼应，结构显得完整。",
    ],
  },

  "social-issue": {
    label: "社会议论类 (Your view on a social / tech / environment topic)",
    template:
      "开头（10–15秒）：‘……’是现在大家都很关注的话题，我也想谈谈我的看法。\n" +
      "主体（约2分20秒）：\n" +
      "  现象——先客观描述这个现象/它给生活带来的变化。\n" +
      "  两面看——它的好处是……；同时也带来一些问题是……（一分为二）。\n" +
      "  我的态度 + 例子——结合身边的具体例子说出你怎么看。\n" +
      "结尾（10–15秒）：总的来说，我们应该……，这样才能……",
    tips: [
      "采用‘一分为二’的思路：先说好处再说问题，显得客观全面。",
      "用身边的具体例子代替抽象议论（如‘我邻居用手机支付买菜’），别空谈‘科技改变生活’。",
      "结尾给一条可行的建议或呼吁，落到‘个人能做什么’，不要只停在评论。",
      "用议论连接词：首先、其次、与此同时、然而、归根结底，让逻辑清晰。",
      "保持中立客观的语气，避免极端化（‘完全没用’‘绝对是好事’这类话别说）。",
      "这类词偏书面（环境、科技、效率），注意前后鼻音和平翘舌，别因为词难就含糊带过。",
    ],
  },

  procedural: {
    label: "方法经验类 (How you do something / your approach)",
    template:
      "开头（10–15秒）：在‘……’这件事上，我慢慢摸索出了一些自己的方法。\n" +
      "主体（约2分20秒）：\n" +
      "  第一种方法——是什么 + 为什么有用 + 我怎么做的。\n" +
      "  第二种方法——同上，可加一个小例子。\n" +
      "  我遇到的困难和怎么解决的——让经验更真实。\n" +
      "结尾（10–15秒）：靠这些方法，我……（说出效果/收获），也推荐给大家试试。",
    tips: [
      "用‘第一、第二、第三’把方法分点列清楚，条理感最能撑满3分钟。",
      "每条方法都要‘方法 + 原因 + 效果’三件套，别只说做什么不说为什么。",
      "加入一次失败或走过的弯路，再说怎么调整，经验才显得真实可信。",
      "用‘我习惯先……然后……最后……’的顺序词，让流程自然流畅。",
      "结尾用‘效果/收获’收尾（‘现在我已经能……’），证明方法真的有用。",
      "口语化但别口水，少用‘那个、然后然后’，用‘接下来、与此同时’替代。",
    ],
  },
};

// Personal-value words: topics phrased "我对…的看法/理解" that are answered from inner
// experience (definition-first) rather than as societal debate.
const PERSONAL_VALUE =
  /责任|公平|诚信|勇气|自律|效率|运气|选择|规则|压力|时间管理|独立生活|健康生活|慢生活|家庭|朋友|阅读|写作|考试|教育/;

/**
 * Infer a topic's category from its grammatical frame. Mirrors the SQL used to tag
 * `question_banks.metadata.category`, so brand-new DB topics still get a sensible guide.
 */
export function inferTopicCategory(topic: string): TopicCategory {
  if (/我如何|怎样|的做法|的体会|的计划|我会做什么|我怎么/.test(topic)) return "procedural";
  if (/我对|的看法|的理解/.test(topic)) {
    return PERSONAL_VALUE.test(topic) ? "personal-opinion" : "social-issue";
  }
  if (/我的一次|经历|记忆|童年|第一次|坏习惯|误会|道歉/.test(topic)) return "narrative";
  return "descriptive";
}

/**
 * Resolve the speaking guide for a topic. Prefers a stored category (DB source of truth),
 * falling back to inference from the topic text.
 */
export function getSpeakingGuide(topic: string, storedCategory?: string | null): SpeakingGuide {
  const category =
    storedCategory && storedCategory in SPEAKING_GUIDES
      ? (storedCategory as TopicCategory)
      : inferTopicCategory(topic);
  return SPEAKING_GUIDES[category];
}
