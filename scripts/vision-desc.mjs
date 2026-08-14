#!/usr/bin/env node
// 视觉桥接工具（方案 A · 2026-08-15）：给无多模态的 DeepSeek 提供"看图"能力。
// 原理：图片 → base64 → 智谱免费视觉模型 glm-4v-flash（OpenAI 兼容）→ 文字描述。
// 用途：开发 AI 评估 UI 截图 / 设计稿 / 上传图片；产品侧可复用同一通道（见 docs/design/vision-adapter-design.md）。
// 安全红线：Key 仅从 .env 读（ZHIPU_API_KEY，gitignored）；仅允许免费模型 glm-4v-flash；图片不落盘、不写日志。
// 用法：
//   node scripts/vision-desc.mjs <图片路径> ["自定义提示词，如：描述这个界面的布局问题"]
//   node scripts/vision-desc.mjs <图片路径> --json   （输出 JSON：{ok, model, text}）
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// 手动解析 .env（零依赖）：取 ZHIPU_API_KEY；进程 env 优先。
function loadEnvKey(name) {
  if (process.env[name]) return process.env[name];
  try {
    const p = resolve(ROOT, '.env');
    if (!existsSync(p)) return '';
    const line = readFileSync(p, 'utf8').split('\n').find((l) => l.startsWith(name + '='));
    return line ? line.slice(name.length + 1).trim() : '';
  } catch { return ''; }
}

const ALLOWED_MODELS = new Set(['glm-4v-flash']); // 免费视觉模型白名单（防误用付费档）
const API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

const args = process.argv.slice(2);
const imgPath = args.find((a) => !a.startsWith('-'));
const jsonOut = args.includes('--json');
const prompt = args.filter((a) => !a.startsWith('-') && a !== imgPath).join(' ');

if (!imgPath) {
  console.error('用法: node scripts/vision-desc.mjs <图片路径> [提示词] [--json]');
  process.exit(1);
}
const abs = resolve(ROOT, imgPath);
if (!existsSync(abs)) { console.error('图片不存在: ' + abs); process.exit(1); }

const key = loadEnvKey('ZHIPU_API_KEY');
if (!key) { console.error('缺少 ZHIPU_API_KEY（请配置在 .env，gitignored）'); process.exit(1); }

const ext = abs.split('.').pop().toLowerCase();
const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/png';
const b64 = readFileSync(abs).toString('base64');

const messages = [{
  role: 'user',
  content: [
    { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
    { type: 'text', text: prompt || '请详细描述这张图片的内容：如果是界面/设计稿，请说明整体布局、各区块的作用、文案、以及你认为的问题；如果是食物/店铺照片，请说明店铺或菜品特征、招牌文字（OCR）。' },
  ],
}];

async function main() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: 'glm-4v-flash', messages, temperature: 0.3, max_tokens: 1024 }), // glm-4v-flash 上限 1024
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + ' ' + body.slice(0, 300));
    }
    const j = await res.json();
    const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    if (jsonOut) { console.log(JSON.stringify({ ok: true, model: 'glm-4v-flash', text }, null, 2)); }
    else { console.log(text); }
  } catch (err) {
    if (jsonOut) { console.log(JSON.stringify({ ok: false, error: String(err && err.message || err) })); }
    else { console.error('视觉识别失败:', String(err && err.message || err)); }
    process.exitCode = 1;
  } finally { clearTimeout(timer); }
}
main();
