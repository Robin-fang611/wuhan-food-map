// 离线校验「服务端就绪」DomainPack 可被 @hypha/domain 编译，并打印 processHash。
// 不触碰运行中的 Server；仅证明该 pack 是合法 DomainPack（工具绑定层已改为 http+endpoint）。
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = process.env.HYPHA_DOMAIN_PKG
  || '/Users/onebilion/opt/hypha/node_modules/@hypha/domain/dist/index.js';
const { loadDomainPackFile, compileDomainPackToHarnessedSystem } = await import(PKG);

const YAML = join(__dirname, 'manyouwei-food-discovery.domain.server.yaml');
const domainPack = await loadDomainPackFile(YAML);
const compiled = compileDomainPackToHarnessedSystem(domainPack, { agentRef: 'manyouwei-food-agent' });
console.log('[verify] domainPack id =', domainPack.id, 'version =', domainPack.version);
console.log('[verify] processHash =', compiled.processHash);
console.log('[verify] toolSpecs =', (domainPack.tools || []).map((t) => `${t.id}@${t.source}`).join(', '));

// 注意：@hypha/domain 离线编译器只校验「契约」（图纸），不识别也不保留运行时 http 绑定
// （endpoint 由 Server 的 http 工具适配器在运行时读取，不属于 deterministic 指纹 → processHash 不变）。
// 因此 endpoint 校验针对【原始 yaml 文本】而非编译产物。
const raw = readFileSync(YAML, 'utf8');
const epLines = (raw.match(/endpoint: http:\/\/127\.0\.0\.1:8799\/tools\/[\w.-]+/g) || []);
const expected = [
  'discover.filter', 'discover.rank', 'discover.detail', 'discover.geo',
  'discover.navigate', 'user.favorite', 'reward.checkin', 'reward.view-wallet',
  'reward.claim', 'analytics.track',
];
const got = new Set(epLines.map((s) => s.split('/tools/')[1]));
const missing = expected.filter((id) => !got.has(id));
if (missing.length) {
  console.error('[verify] FAIL: 缺少 endpoint 绑定:', missing.join(', '));
  process.exit(1);
}
console.log(`[verify] OK: 原始 yaml 含 ${epLines.length}/${expected.length} 个 :8799 http 端点，` +
  '可经本机工具服务被 Server 调用（编译指纹不变）');
