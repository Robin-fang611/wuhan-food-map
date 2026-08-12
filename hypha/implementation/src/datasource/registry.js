// datasource/registry.js —— 数据源注册表与解析。
// 不在此导入任何具体数据集，避免框架默认加载真实数据。
const registry = new Map();

export function registerDataSource(name, factory) {
  if (typeof factory !== 'function') throw new Error('registerDataSource: factory 必须是函数');
  registry.set(name, factory);
}

export function createDataSource(name, opts) {
  const f = registry.get(name);
  if (!f) {
    throw new Error(`未知数据源: ${name}（已注册：${[...registry.keys()].join(', ') || '无'}）`);
  }
  return f(opts);
}

export function knownDataSources() {
  return [...registry.keys()];
}

let _default = null;

// 显式设定默认数据源（如测试里切到 wuhan 验证引擎回归）
export function setDefaultDataSource(ds) {
  if (!ds || typeof ds.listMerchants !== 'function') {
    throw new Error('setDefaultDataSource 需要 FoodDataSource 实例');
  }
  _default = ds;
}

// 框架默认数据源：env MYWO_DATASOURCE 决定，缺省 'sample'（明显合成数据，非真实商户）。
// 真实数据集（wuhan）需显式切换，做到「框架先行、数据后灌」。
export function getDataSource() {
  if (_default) return _default;
  const name = process.env.MYWO_DATASOURCE || 'sample';
  _default = createDataSource(name);
  return _default;
}
