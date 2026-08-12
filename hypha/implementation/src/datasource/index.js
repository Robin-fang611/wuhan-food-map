// datasource/index.js —— 数据抽象层统一出口。
// 框架其余代码只从此处 import（getDataSource / setDefaultDataSource / FoodDataSource 等），
// 不直接触碰具体数据集。
export { FoodDataSource } from './base.js';
export {
  registerDataSource,
  createDataSource,
  knownDataSources,
  setDefaultDataSource,
  getDataSource,
} from './registry.js';

// 自动注册默认 sample 数据源（仅注册；默认由 env MYWO_DATASOURCE 决定，缺省 'sample'）。
// wuhan 数据源按需由调用方 import './datasource/wuhan.js' 触发注册，不在此预载。
import './sample.js';
