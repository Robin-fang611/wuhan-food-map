# BFF 接口契约（v1.5 · RewardStore 后端）

> 对应产品方案 §4.5 / §5 / §13（M13）。前端 `h5/src/core/store.bff.js` 的 `BffStore` 已实现此契约；本文是后端（Next.js Route Handlers）落地的唯一事实来源。

## 1. 切换方式（前端）
默认 `LocalStore`（localStorage，v0.5）。v1.5 部署后端后，在应用启动处：
```js
import { setActiveStore } from './store.js';
import { BffStore }       from './store.bff.js';
setActiveStore(new BffStore({ baseUrl: '/api', getToken: () => auth.sessionToken }));
```
`store` 为 ES 模块 live binding，引擎 / 玩法 / 券包零改动即可切到 BFF。

## 2. 路由（baseUrl + 以下路径）
| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| GET  | `/api/rewards/checkin?userId=`   | 取签到状态 | `{ streak, lastDate, dates }` |
| PUT  | `/api/rewards/checkin`           | 保存签到     | 200 / body |
| GET  | `/api/rewards/coupons?userId=`   | 取券包       | `Coupon[]` |
| POST | `/api/rewards/coupons`           | 新增券       | body `{ userId, coupon }` |
| PATCH| `/api/rewards/coupons/:id`       | 局部更新（核销/过期） | body `{ userId, patch }` |

## 3. 数据模型（与 §5 `user_coupons` / `checkin_log` 对齐）
- Coupon：`{ id, user_id, code, play_type, title, discount_desc, amount, merchant_id, status("已得"|"已核销"|"已过期"), issued_at, expires_at, redeemed_at? }`
- Checkin：`{ streak, lastDate, dates[] }`

## 4. 安全红线（§8，后端必须落实）
- **鉴权**：所有路由校验 `Authorization: Bearer <JWT>`；**服务端以 JWT 重新解析 `user_id`，忽略客户端传入的 `userId`**（防越权读写他人券/签到）。
- **防刷**：券一次性、短时效、限频；核销幂等（已核销不可重复）；库存原子扣减；签到同设备/同日不可重复（前端已做首道，后端兜底）。
- **传输**：HTTPS；响应统一 JSON，错误体 `{ error: "可读原因" }`（前端会取 `error` 提示）。
- **密钥**：JWT 密钥 / 微信 AppSecret 仅存服务端，绝不下发前端。
