// CPS 商户签约集合（纯渲染层标记，与排序/推荐逻辑完全解耦）。
//
// 防火墙（对齐 MONETIZATION-MODEL.md §4）：本模块**绝不被** discovery-engine / intent-parser /
// filter / rank / orchestrator 导入；它只在「推荐结果已生成之后」由 agent-loop / orchestrator
// 的输出装配阶段调用，给入选商户贴一个 cpsTag 展示标。排序从不读取本集合。
//
// 含义：某商户是否在「到店核销分润网络」中。它**只决定卡片上是否挂「可核销优惠」标**，
// 不影响该商户能否入选推荐，也不影响排序位置。未签约商户照样可凭信任入选（只是没标）。
//
// 数据来源（商业动作，非技术）：
//  - 默认：env MYWO_CPS_MERCHANTS（逗号分隔的商户 id 白名单），由 Robin 在真实签约后填写。
//  - 缺省回退：sample 演示数据集的 7 家（仅用于本地 demo 展示挂标效果）。
//  - wuhan 真实数据：若未设置 env，默认空（诚实——尚无真实签约商户），等签约后填 env。
import { getDataSource } from './datasource/index.js';

let _cached = null;

function resolveEnrolled() {
  const env = process.env.MYWO_CPS_MERCHANTS;
  if (env && env.trim()) {
    return new Set(env.split(',').map((s) => s.trim()).filter(Boolean));
  }
  // 无 env：sample 演示数据挂标；真实 wuhan 默认空（需签约后填 env）。
  const dsName = (() => { try { return getDataSource().name; } catch { return ''; } })();
  if (dsName === 'sample-v1') {
    return new Set(['s001', 's002', 's003', 's004', 's005', 's006', 's007']);
  }
  return new Set();
}

export function getCpsEnrolledSet() {
  if (!_cached) _cached = resolveEnrolled();
  return _cached;
}

// 是否在某商户 id 上挂「可核销优惠」标（渲染层只读查询）。
export function isCpsEnrolled(merchantId) {
  if (!merchantId) return false;
  return getCpsEnrolledSet().has(merchantId);
}

// 测试/运营重载（变更 env 后调用）。
export function resetCpsCache() { _cached = null; }
