// 数据抽象层验收：证明「美食发现 Agent 框架」与具体数据集解耦。
// 1) 默认数据源 = sample（明显合成，非真实商户），规模远小于真实 590；
// 2) /run 在 sample 上返回合法 output.food-recommendation 契约（含 provenance + 红线通过）；
// 3) 显式切换到 wuhan 后 listMerchants 为真实 590，证明「数据后灌」接入点可用；
// 4) 切回 sample 不影响后续。
// 运行：node hypha/implementation/test/datasource.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.RUNTIME_STORE_FILE = join(mkdtempSync(join(tmpdir(), 'mywo-ds-store-')), 'runtime-store.json'); // W7.2 测试隔离
import { getDataSource, setDefaultDataSource, createDataSource, knownDataSources } from '../src/datasource/index.js';
import '../src/datasource/wuhan.js'; // 触发 wuhan 数据源注册（真实数据集接入点）
import { runFoodDiscovery } from '../src/orchestrator.js';
import { PROCESS_HASH } from '../src/provenance.js';

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, '✗ ' + name);
  passed++;
  console.log('  ✓', name);
}

console.log('Datasource · 注册表');
ok('已注册 sample 与 wuhan', knownDataSources().includes('sample') && knownDataSources().includes('wuhan'));

console.log('Datasource · 默认=sample（非真实数据）');
const ds = getDataSource();
ok("默认数据源 name = 'sample-v1'", ds.name === 'sample-v1');
const all = await ds.listMerchants();
ok('sample 规模远小于真实数据集', all.length > 0 && all.length < 100);
ok('sample 含缺坐标样本（s005）以演示降级', all.some((m) => typeof m.lng !== 'number'));

console.log('Datasource · /run 在 sample 上返回合法契约');
const r = await runFoodDiscovery({ intent: '南湖附近便宜的宵夜' });
ok('runFoodDiscovery 成功（含红线通过）', r.success === true);
ok('merchants 为数组', Array.isArray(r.output.merchants));
ok('summary.total_matched 为数字', typeof r.output.summary.total_matched === 'number');
ok('provenance.processHash 与编译指纹一致', r.output.summary.provenance.processHash === PROCESS_HASH);
ok('含降级说明（数据缺口显式标注）', Array.isArray(r.output.summary.degradation));
const cheapest = r.output.merchants[0];
ok('南湖+夜宵+便宜 命中性价比优先（s004 ≤ s003）', cheapest && cheapest.id === 's004');

console.log('Datasource · 切到 wuhan 验证「数据后灌」接入点');
setDefaultDataSource(createDataSource('wuhan'));
const w = getDataSource();
ok("wuhan 数据源 name = 'wuhan'", w.name === 'wuhan');
const wall = await w.listMerchants();
ok('wuhan 数据集已统一为 860 家（V4.4 S2 口径，与前端 allMerchants 同源）', wall.length === 860);
const wr = await runFoodDiscovery({ intent: '首义必吃' });
ok('wuhan 上 runFoodDiscovery 同样成功', wr.success === true);
ok('wuhan 结果量明显大于 sample', wr.output.summary.total_matched > all.length);

console.log('Datasource · 切回 sample');
setDefaultDataSource(createDataSource('sample'));
ok("恢复默认 = 'sample-v1'", getDataSource().name === 'sample-v1');

console.log(`\ndatasource.test.mjs 全部通过（${passed} 项）`);
