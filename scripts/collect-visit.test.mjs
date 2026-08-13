// 蛮有味 · 探店采集工具单元测试（V2.4）
// 确定性、无真实数据、不改写仓库任何文件。验证：反伪造门禁 + 红线字段剔除 + 合并链路。
import assert from 'assert';
import { validateRecord, validateBatch, makeTemplateRecord, makeTemplate } from './collect-visit.mjs';

let pass = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  pass++;
  console.log('  ✓', name);
}

console.log('— collect-visit 校验 —');

// 1) 合法实地核验记录 → 升级为 verified
const good = validateRecord({
  id: 'm0001', matchName: '测试面馆', taste: '筋道鲜香', avgPrice: 18,
  environment: '街边小店', tel: '027-00000000', attest: 'yes',
}, { batch: 't1' });
ok('合法记录接受', good.ok === true);
ok('dataConfidence=verified', good.entry.dataConfidence === 'verified');
ok('source=field-visit', good.entry.source === 'field-visit');
ok('provenance.method=field-visit', good.entry.provenance && good.entry.provenance.method === 'field-visit');
ok('tel 字段保留(非 phone)', good.entry.tel === '027-00000000' && !('phone' in good.entry));

// 2) 反伪造门禁：缺 attest → 拒绝
const noAttest = validateRecord({ id: 'm0002', matchName: '店B', taste: '香', attest: '' });
ok('缺 attest 被拒', noAttest.ok === false && noAttest.errors.some((e) => /attest/.test(e)));

// 3) 有 attest 但无任何观测 → 拒绝（防空壳升级）
const emptyObs = validateRecord({ id: 'm0003', matchName: '店C', attest: 'yes' });
ok('无观测字段被拒', emptyObs.ok === false && emptyObs.errors.some((e) => /观测/.test(e)));

// 4) 缺定位信息 → 拒绝
const noId = validateRecord({ matchName: '', attest: 'yes', taste: 'x' });
ok('缺 id/matchName 被拒', noId.ok === false && noId.errors.some((e) => /id|matchName/.test(e)));

// 5) 防御性剔除红线字段（即便输入误带）
const bad = validateRecord({
  id: 'm0004', matchName: '店D', attest: 'yes', taste: '鲜',
  phone: '13800000000', token: 'abc', user_id: 'u1', lng: 114, lat: 30,
});
ok('phone 被剔除', !('phone' in bad.entry));
ok('token 被剔除', !('token' in bad.entry));
ok('user_id 被剔除', !('user_id' in bad.entry));
ok('lng/lat 不导出(不伪造坐标)', !('lng' in bad.entry) && !('lat' in bad.entry));

// 6) 模板半自动：预填身份、观测留空
const tpl = makeTemplateRecord({ id: 'm0005', name: '店E', zone: '财大南湖周边', category: '小吃宵夜' });
ok('模板预填 id', tpl.id === 'm0005');
ok('模板预填 matchName', tpl.matchName === '店E');
ok('模板观测字段留空', tpl.taste === '' && tpl.avgPrice === null);
ok('模板 attest 初始为空', tpl.attest === '');

// 7) 批量：混合接受/拒绝计数
const batch = validateBatch({
  records: [
    { id: 'm1', matchName: 'A', attest: 'yes', taste: '鲜' },
    { id: 'm2', matchName: 'B', attest: '', taste: '鲜' },          // 拒
    { id: 'm3', matchName: 'C', attest: 'yes' },                    // 拒(无观测)
  ],
}, { batch: 't7' });
ok('批量接受数=1', batch.accepted.length === 1);
ok('批量拒绝数=2', batch.rejected.length === 2);
ok('批量总数=3', batch.total === 3);

// 8) 合并链路证明：模拟 normalize-data.mjs 的 norm + mergeOverride 契约
//    （mirror，仅用于证明本工具产出的条目喂入真实管线会得到 verified）
function norm(s) { return String(s || '').toLowerCase().replace(/[\s（）()、，。·\-—_,.]/g, ''); }
function mergeOverride(base, override) {
  if (!override || typeof override !== 'object') return base;
  const out = { ...base };
  for (const k of Object.keys(override)) {
    if (override[k] !== null && override[k] !== undefined) out[k] = override[k];
  }
  out.dataConfidence = override.dataConfidence || base.dataConfidence;
  out.needsEnrichment = out.dataConfidence !== 'verified';
  return out;
}
const baseMerchant = { id: 'm0001', name: '测试面馆', dataConfidence: 'estimated', needsEnrichment: true };
const entry = validateRecord({ id: 'm0001', matchName: '测试面馆', taste: '筋道鲜香', avgPrice: 18, attest: 'yes' }).entry;
// build-enrichment-map 按 matchName 子串匹配 → 命中 baseMerchant
const matched = norm(entry.matchName).includes(norm(baseMerchant.name)) || norm(baseMerchant.name).includes(norm(entry.matchName));
ok('enrichment 按 matchName 可命中 base 商户', matched === true);
const merged = mergeOverride(baseMerchant, entry);
ok('合并后 dataConfidence→verified', merged.dataConfidence === 'verified');
ok('合并后 needsEnrichment→false', merged.needsEnrichment === false);
ok('合并后 taste 被真实覆盖', merged.taste === '筋道鲜香');

console.log(`\nALL PASS (${pass} assertions)`);
