// 探店采集：decideUpload 三分支 + verifyWithAmap + handleUpload（高德用 mock fetch，无外网）。
// 运行：node hypha/implementation/test/upload.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decideUpload, verifyWithAmap, handleUpload, nameSimilarity, listPendingUploads, listAudit, governUpload } from '../src/upload.js';

let passed = 0;
function ok(name, cond) { assert.ok(cond, '✗ ' + name); passed++; console.log('  ✓', name); }

const POI = { id: 'B0FFHSLZLY', name: '长子热干面', address: '湖北省武汉市江岸区车站路49号', location: { lng: 114.299158, lat: 30.590975 } };

console.log('decideUpload · 三分支纯决策');
const v = decideUpload({ name: '长子热干面', isStall: false, location: { lng: 114.30, lat: 30.59 }, amapMatch: POI });
ok('高德匹配 → verified', v.decision === 'verified');
ok('verified 带 poi + merchantId', v.poi && v.poi.name === '长子热干面' && typeof v.merchantId === 'string');
ok('verified 计算距离（米，有限正数）', typeof v.poi.distanceMeters === 'number' && v.poi.distanceMeters > 0);

const s = decideUpload({ name: '南湖后门煎饼摊', isStall: true, amapMatch: null });
ok('无匹配 + 流动摊 → verified_stall', s.decision === 'verified_stall');
ok('verified_stall 含 note', /流动摊|路边摊/.test(s.note));

const p = decideUpload({ name: '某神秘私房菜', isStall: false, amapMatch: null });
ok('无匹配 + 非摊 → pending', p.decision === 'pending');
ok('pending 带 label + reason', p.label === '待核验' && /高德未匹配且非摊类/.test(p.reason));

const pNoKey = decideUpload({ name: 'x', isStall: false, amapMatch: null, amapEnabled: false });
ok('无 Key 降级 pending 文案不同', /暂未启用/.test(pNoKey.reason));

console.log('verifyWithAmap · 高德响应解析');
const okFetch = async () => ({ ok: true, json: async () => ({ status: '1', pois: [{ id: POI.id, name: POI.name, location: '114.299158,30.590975', address: POI.address, pname: '湖北省', cityname: '武汉市', adname: '江岸区' }] }) });
const r1 = await verifyWithAmap({ name: '长子热干面', key: 'k', fetchImpl: okFetch });
ok('命中返回 POI（含坐标）', r1 && r1.name === '长子热干面' && r1.location.lng === 114.299158);

const badFetch = async () => ({ ok: true, json: async () => ({ status: '0', info: 'INVALID_USER_KEY' }) });
ok('status≠1 → null', (await verifyWithAmap({ name: 'x', key: 'k', fetchImpl: badFetch })) === null);

const emptyFetch = async () => ({ ok: true, json: async () => ({ status: '1', pois: [] }) });
ok('无 POI → null', (await verifyWithAmap({ name: 'x', key: 'k', fetchImpl: emptyFetch })) === null);

const throwFetch = async () => { throw new Error('network'); };
ok('网络异常 → null（不阻断）', (await verifyWithAmap({ name: 'x', key: 'k', fetchImpl: throwFetch })) === null);

console.log('nameSimilarity · 相关性度量');
ok('精确同名 = 1', nameSimilarity('长子热干面', '长子热干面') === 1);
ok('括号内分店注解等价 = 1', nameSimilarity('长子热干面', '长子热干面(车站路店)') === 1);
ok('描述性前缀包含核心串 = 0.9', nameSimilarity('校门口那家李记热干面', '李记热干面') === 0.9);
ok('无关店名 ≈ 0', nameSimilarity('zzz虚构店铺测试123', '荣耀官方授权服务中心') < 0.3);

console.log('verifyWithAmap · 相关性闸门（不降级为误判 verified）');
// 高德模糊返回了一个名字不相关的 POI → 应视为未匹配（防 branch 2/3 误判）。
const looseFetch = async () => ({ ok: true, json: async () => ({ status: '1', pois: [{ id: 'P1', name: '煎饼道(武汉金银潭永旺店)', location: '114.239079,30.650569', address: '东西湖区金银潭', pname: '湖北省', cityname: '武汉市', adname: '东西湖区' }] }) });
ok('店名不相关 → null（落摊类/待核验）', (await verifyWithAmap({ name: '南湖后门流动煎饼摊', key: 'k', fetchImpl: looseFetch })) === null);
// 名字强相关但定位 10km 外（不同分店/区域）→ 应视为未匹配。
const farFetch = async () => ({ ok: true, json: async () => ({ status: '1', pois: [{ id: 'P2', name: '李记热干面', location: '114.239079,30.650569', address: '东西湖区', pname: '湖北省', cityname: '武汉市', adname: '东西湖区' }] }) });
ok('名字相关但 >3km → null（防远处分店误判）', (await verifyWithAmap({ name: '李记热干面', location: { lng: 114.34, lat: 30.47 }, key: 'k', fetchImpl: farFetch })) === null);
// 名字相关且定位在范围内 → 命中。
const nearFetch = async () => ({ ok: true, json: async () => ({ status: '1', pois: [{ id: 'P3', name: '李记热干面', location: '114.341,30.471', address: '洪山区', pname: '湖北省', cityname: '武汉市', adname: '洪山区' }] }) });
const near = await verifyWithAmap({ name: '李记热干面', location: { lng: 114.34, lat: 30.47 }, key: 'k', fetchImpl: nearFetch });
ok('名字相关且定位近 → 命中（含 similarity）', near && near.name === '李记热干面' && typeof near.similarity === 'number');

console.log('handleUpload · 编排（MYWO_NO_PERSIST 跳过文件 IO）');
process.env.MYWO_NO_PERSIST = '1';
const h1 = await handleUpload({ name: '南湖后门煎饼摊', description: '流动煎饼', isStall: true }, { amapKey: 'k', fetchImpl: badFetch });
ok('handleUpload：无 Key 命中 + 流动摊 → verified_stall', h1.decision === 'verified_stall');

const h2 = await handleUpload({ name: '某神秘私房菜', description: '朋友家做的', isStall: false }, { amapKey: 'k', fetchImpl: badFetch });
ok('handleUpload：无命中 + 非摊 → pending', h2.decision === 'pending');

const h3 = await handleUpload({ name: '长子热干面', description: '好吃', isStall: false, location: { lng: 114.30, lat: 30.59 } }, { amapKey: 'k', fetchImpl: okFetch });
ok('handleUpload：高德命中 → verified（带距离）', h3.decision === 'verified' && typeof h3.poi.distanceMeters === 'number');

console.log(`\nupload.test.mjs 全部通过（${passed} 项）`);


// —— S5 · pending 上传治理（临时存储文件，真 IO）——
console.log('S5 · pending 列表 + 治理（promote/reject/dry-run/审计）');
delete process.env.MYWO_NO_PERSIST;
const GOV_FILE = join(mkdtempSync(join(tmpdir(), 'mywo-upload-')), 'merchant-uploads.json');
process.env.UPLOAD_STORE_FILE = GOV_FILE;

const seedP1 = await handleUpload({ name: '张三私房菜', description: '朋友介绍，需要核验', isStall: false }, { amapKey: 'k', fetchImpl: badFetch });
const seedP2 = await handleUpload({ name: '李四烧烤摊', description: '夜市流动摊位', isStall: false }, { amapKey: 'k', fetchImpl: badFetch });
const seedV = await handleUpload({ name: '长子热干面', description: '好吃', isStall: false, location: { lng: 114.30, lat: 30.59 } }, { amapKey: 'k', fetchImpl: okFetch });
ok('seed：两条 pending + 一条 verified', seedP1.decision === 'pending' && seedP2.decision === 'pending' && seedV.decision === 'verified');

const pl = await listPendingUploads();
ok('list：total=2', pl.ok && pl.total === 2 && pl.count === 2);
ok('list 治理视图脱敏（无 userId / 无 source 原始字段）', pl.items.every((it) => !('userId' in it) && !('source' in it) && !('user_id' in it)));
ok('list 条目含 uploadId/name/reason', pl.items[0].uploadId && pl.items[0].name && pl.items[0].reason);

const dry = await governUpload({ uploadId: seedP1.uploadId, action: 'promote', dryRun: true, by: 'test', note: '预演' });
ok('dry-run promote：不落盘', dry.ok && dry.dryRun === true && dry.would === 'promote');
ok('dry-run 后 pending 仍为 2', (await listPendingUploads()).total === 2);

const gov1 = await governUpload({ uploadId: seedP1.uploadId, action: 'promote', by: 'test', note: '人工确认收录' });
ok('promote：成功且 pending 剩 1', gov1.ok && gov1.pendingTotal === 1);
ok('promote 写审计日志', gov1.audit && gov1.audit.action === 'promote' && gov1.audit.by === 'test');
const store1 = JSON.parse(readFileSync(GOV_FILE, 'utf8'));
ok('store：verified +1（带 governance 标记）', store1.verified.length === 2 && store1.verified.some((e) => e.governance && e.governance.action === 'promote' && e.uploadId === seedP1.uploadId));
ok('store：audit 数组存在', Array.isArray(store1.audit) && store1.audit.length === 1);

const gov2 = await governUpload({ uploadId: seedP2.uploadId, action: 'reject', by: 'test', note: '信息不足驳回' });
ok('reject：成功且 pending 清空', gov2.ok && gov2.pendingTotal === 0);
const store2 = JSON.parse(readFileSync(GOV_FILE, 'utf8'));
ok('store：rejected +1（保留轨迹不硬删）', store2.rejected.length === 1 && store2.rejected[0].uploadId === seedP2.uploadId);
ok('store：audit 累计 2 条', store2.audit.length === 2);

const unknown = await governUpload({ uploadId: 'u_nonexist', action: 'promote' });
ok('未知 uploadId → 报错', unknown.ok === false && /未找到/.test(unknown.error));
ok('重复处理 → 报错（原记录已移出 pending）', (await governUpload({ uploadId: seedP1.uploadId, action: 'reject' })).ok === false);

// 审计轨迹查询（管理后台 /upload/audit 用）：新→旧，无 PII。
const audit = await listAudit();
ok('listAudit：total=2（promote+reject）', audit.ok && audit.total === 2 && audit.count === 2);
ok('listAudit：新→旧排序（reject 在前）', audit.items[0].action === 'reject' && audit.items[1].action === 'promote');
ok('listAudit：记录无 PII（无 userId/tel/phone）', audit.items.every((a) => !('userId' in a) && !('tel' in a) && !('phone' in a)));
const audit1 = await listAudit({ limit: 1 });
ok('listAudit：limit 生效', audit1.count === 1);

delete process.env.UPLOAD_STORE_FILE;


