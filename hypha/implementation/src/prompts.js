// 加载 4 个 prompt.food.* 模板（对应 domain.yaml allowedPromptRefs），供本地确定性
// 编排器生成品牌化导览；亦为步骤 9 接入 Hypha Server prompts 目录的本地事实来源。
// 仅在 Node 侧（httpServer / 测试）被引用，浏览器 agent-client 不依赖本模块。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_DIR = join(__dirname, '..', 'prompts');

export const PROMPT_IDS = ['intake', 'discover', 'detail', 'reward'];

// 读全部 4 个模板（同步、确定性）。任一缺失即抛错，由测试/启动捕获。
export function loadPrompts() {
  const out = {};
  for (const id of PROMPT_IDS) {
    out[id] = readFileSync(join(PROMPT_DIR, `${id}.md`), 'utf8');
  }
  return out;
}

const RANKED_BY_LABEL = {
  mustEat: '必吃榜', value: '性价比榜', lateNight: '夜宵榜', newest: '新收录',
  rating: '评分', price: '人均', distance: '距离',
};

// 确定性品牌化导览：结合解析后的参数与摘要，产出一句话「为什么推荐这些」。
// 纯函数、无 DOM、不调用任何工具；内容完全由入参推导，绝不编造评分/距离/券。
export function buildGuidance(params = {}, summary = {}) {
  const z = params.zone || '全城';
  const sortLabel = RANKED_BY_LABEL[summary.ranked_by] || summary.ranked_by || '推荐度';
  const parts = [`为你从「${z}」片区`];
  if (params.maxPrice) parts.push(`人均不超过 ${params.maxPrice} 元`);
  if (params.category) parts.push(`主打「${params.category}」`);
  if (params.mealTime && params.mealTime.length) parts.push(`适合「${params.mealTime.join('/')}」场景`);
  parts.push(`按「${sortLabel}」排序，共 ${summary.total_matched ?? 0} 家`);
  let line = parts.join('，') + '。';
  if (summary.nearest && typeof summary.nearest.distanceKm === 'number') {
    line += `最近的一家是 ${summary.nearest.name}（约 ${summary.nearest.distanceKm}km）。`;
  }
  line += ' 蛮有味 Agent 全程不编造评分与距离，数据缺口已显式标注。';
  return line;
}
