export type TabKey = "study" | "life";

export interface ChecklistItem {
  id: string;
  label: string;
  must: boolean;
}

export interface Module {
  id: string;
  title: string;
  tab: TabKey;
  badge: string;
  color: string;
  desc: string;
  tags: string[];
  checklist?: ChecklistItem[];
}

export interface SearchEntry {
  title: string;
  kind: string;
  excerpt: string;
  moduleId?: string;
  campus?: "nanhu" | "shouyi" | "both";
}

const luggage: ChecklistItem[] = [
  { id: "l1", label: "录取通知书 / 身份证 / 档案", must: true },
  { id: "l2", label: "银行卡 + 少量现金", must: true },
  { id: "l3", label: "一寸 / 两寸证件照", must: true },
  { id: "l4", label: "校园卡（报到现场领取）", must: true },
  { id: "l5", label: "插线板 / 台灯", must: false },
  { id: "l6", label: "床上三件套（可到校买）", must: false },
  { id: "l7", label: "大功率电器（电煮锅等）", must: false },
];

export const studyModules: Module[] = [
  {
    id: "guide",
    title: "新生入学指南",
    tab: "study",
    badge: "新",
    color: "bg-rose-500",
    desc: "从录取到第一学期：报到、宿舍、军训、校园卡全流程",
    tags: ["生活", "学业", "手续"],
    checklist: luggage,
  },
  {
    id: "xuanke",
    title: "选课攻略",
    tab: "study",
    badge: "选",
    color: "bg-sky-500",
    desc: "师兄师姐推荐选修课 + 给分 / 避雷标签",
    tags: ["学业"],
  },
  {
    id: "tools",
    title: "学业工具箱",
    tab: "study",
    badge: "工",
    color: "bg-violet-500",
    desc: "课表导入 · GPA 计算 · 学分进度 · 体测标准",
    tags: ["工具"],
  },
  {
    id: "upgrade",
    title: "升学就业",
    tab: "study",
    badge: "升",
    color: "bg-emerald-500",
    desc: "保研 / 考研 / 实习内推 / 校招时间线",
    tags: ["高年级"],
  },
  {
    id: "notice",
    title: "校园通知",
    tab: "study",
    badge: "知",
    color: "bg-amber-500",
    desc: "全校教务 / 学院 / 活动通知聚合",
    tags: ["通知"],
  },
];

export const lifeModules: Module[] = [
  {
    id: "food",
    title: "美食地图",
    tab: "life",
    badge: "食",
    color: "bg-red-500",
    desc: "财大周边 + 武汉全城 540+ 家，打分 / 评论 / 优惠",
    tags: ["美食"],
  },
  {
    id: "canteen",
    title: "食堂实时点评",
    tab: "life",
    badge: "堂",
    color: "bg-orange-500",
    desc: "分档口打分，今日推荐 / 避雷实时更新",
    tags: ["美食"],
  },
  {
    id: "play",
    title: "周边游玩",
    tab: "life",
    badge: "游",
    color: "bg-teal-500",
    desc: "32 处景点 + 周末路线，学生专属优惠",
    tags: ["生活"],
  },
  {
    id: "secondhand",
    title: "二手市场",
    tab: "life",
    badge: "二",
    color: "bg-cyan-500",
    desc: "教材 / 数码 / 生活用品，校内当面交易",
    tags: ["交易"],
  },
  {
    id: "ask",
    title: "校园互助问答",
    tab: "life",
    badge: "问",
    color: "bg-indigo-500",
    desc: "全学段答疑，替代零散微信群",
    tags: ["问答"],
  },
  {
    id: "feed",
    title: "校园动态",
    tab: "life",
    badge: "圈",
    color: "bg-pink-500",
    desc: "在校日常分享 / 话题 / 组队",
    tags: ["社交"],
  },
  {
    id: "events",
    title: "校园活动",
    tab: "life",
    badge: "活",
    color: "bg-lime-500",
    desc: "社团 / 讲座 / 比赛 / 志愿汇总",
    tags: ["活动"],
  },
];

export const allModules: Module[] = [...studyModules, ...lifeModules];

export const searchIndex: SearchEntry[] = [
  ...allModules.map((m) => ({
    title: m.title,
    kind: "模块",
    excerpt: m.desc,
    moduleId: m.id,
  })),
  {
    title: "英语分级考试怎么准备？",
    kind: "问答",
    excerpt: "分级考决定教学班，刷真题 + 背核心词汇即可",
    moduleId: "guide",
  },
  {
    title: "军训必备清单",
    kind: "模块",
    excerpt: "防晒 / 鞋垫 / 大容量水杯 / 别针",
    moduleId: "guide",
  },
  {
    title: "五食堂 · 麻辣烫窗口",
    kind: "食堂",
    excerpt: "人均 ¥12，辣度可调，午餐高峰排队",
    campus: "nanhu",
    moduleId: "canteen",
  },
  {
    title: "光谷步行街 · 蜀大侠火锅",
    kind: "美食",
    excerpt: "南湖校区 1.2km，凭学生证 8.5 折",
    campus: "nanhu",
    moduleId: "food",
  },
  {
    title: "首义 · 户部巷小吃",
    kind: "美食",
    excerpt: "首义校区步行 10 分钟，热干面必吃",
    campus: "shouyi",
    moduleId: "food",
  },
  {
    title: "高数教材 九成新",
    kind: "二手",
    excerpt: "¥15，南湖自取，附满分笔记",
    campus: "nanhu",
    moduleId: "secondhand",
  },
  {
    title: "雅思词汇书",
    kind: "二手",
    excerpt: "¥20，首义校区交易",
    campus: "shouyi",
    moduleId: "secondhand",
  },
  {
    title: "百团大战在哪天？",
    kind: "问答",
    excerpt: "开学第二周周末，中原楼前广场",
    moduleId: "events",
  },
];
