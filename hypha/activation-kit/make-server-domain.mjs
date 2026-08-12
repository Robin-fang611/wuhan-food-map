// 生成「服务端就绪」版 DomainPack：把 10 个工具从 source:local 改为 source:http，
// 并注入本机工具服务端点 http://127.0.0.1:8799/tools/<id>（与 hypha/implementation/src/httpServer.js 的
// POST /tools/:id 对齐）。discover.navigate 当前已是 source:http 但缺 endpoint，同样补上。
//
// 用法（本机已验证）：
//   /Users/onebilion/.workbuddy/binaries/node/versions/22.22.2/bin/node make-server-domain.mjs
//
// 输出：manyouwei-food-discovery.domain.server.yaml（与本项目 domain.yaml 同源，仅工具绑定层不同）。
// 该文件用于 PATH-A：复制到 ~/opt/hypha/configs/domain-packs/ 后重启 Server（需用户授权）。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'manyouwei-food-discovery.domain.yaml');
const OUT = join(__dirname, 'manyouwei-food-discovery.domain.server.yaml');

const TOOL_IDS = [
  'discover.filter', 'discover.rank', 'discover.detail', 'discover.geo',
  'discover.navigate', 'user.favorite', 'reward.checkin', 'reward.view-wallet',
  'reward.claim', 'analytics.track',
];

const raw = readFileSync(SRC, 'utf8');
const lines = raw.split('\n');

let currentId = null;
const out = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const idMatch = line.match(/^\s*-\s*id:\s*([\w.-]+)\s*$/);
  if (idMatch && TOOL_IDS.includes(idMatch[1])) currentId = idMatch[1];

  // 工具块内的 source 行（4 空格缩进）
  if (/^    source: local\s*$/.test(line) && currentId && TOOL_IDS.includes(currentId)) {
    out.push('    source: http');
    out.push(`    endpoint: http://127.0.0.1:8799/tools/${currentId}`);
    continue;
  }
  if (/^    source: http\s*$/.test(line) && currentId === 'discover.navigate') {
    // navigate 已是 http，但缺 endpoint：下一非空行非 endpoint 时补上
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (!(lines[j] || '').startsWith('    endpoint:')) {
      out.push(line);
      out.push(`    endpoint: http://127.0.0.1:8799/tools/${currentId}`);
      continue;
    }
  }
  out.push(line);
}

writeFileSync(OUT, out.join('\n'), 'utf8');
console.log('[make-server-domain] wrote', OUT);
console.log('[make-server-domain] tool endpoints injected for', TOOL_IDS.length, 'tools');
