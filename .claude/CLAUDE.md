# 江城 · 味觉地图 — 项目迭代规则

## 项目概述

武汉美食旅游新媒体导流平台，面向准大一新生。核心是 `food-map-v2` 目录。

- **入口页**: `index.html` | 校园美食: `campus.html` | 全城美食: `wuhan.html` | 周边游玩: `play.html`
- **部署**: Netlify 自动部署（GitHub → Netlify）
- **高德地图 API Key**: `js/config.js` 中 `window.__AMAP_CONFIG__.key`

## 模块架构

```
pages/*.js  →  components/*.js  →  core/*.js
（页面胶水）    （UI 构建器）       （无状态工具）
```

### 依赖规则（强约束）
- **禁止跨层引用**: pages → components → core（单向）
- core/* 之间可相互引用
- components/* 只能引用 core/*，不能引用 pages/*
- pages/* 可以引用 core/* 和 components/*

### 模块职责

| 层 | 文件 | 职责 |
|----|------|------|
| core | `utils.js` | 分类颜色/价格/距离格式化、收藏(Favorites)、防抖、导航 |
| core | `dom.js` | `el()` DOM 构建、`Icons` SVG 图标库 |
| core | `store.js` | loading/empty/skeleton 列表状态 |
| core | `ui.js` | splash/toast/socialModal/share/copy |
| core | `map.js` | `MapController` 类（地图初始化、标记、聚合、定位） |
| components | `ShopCard.js` | 店铺卡片 + 详情弹窗 |
| components | `PlaceCard.js` | 游玩卡片 + 详情弹窗 |
| components | `TabBar.js` | 底部导航栏 |
| components | `FilterBar.js` | 分类 chips + 排序 + 搜索 |
| components | `ProfileView.js` | "我的"页面 + 收藏列表 |

## 多智能体工作流

### 角色定义

| 角色 | 模型 | 职责 |
|------|------|------|
| **Architect (Pro)** | Fable / Opus | 进入 Plan mode，做架构设计、影响分析、接口定义 |
| **Builder (Flash)** | Sonnet / Haiku | 批准后执行编码、测试、修复 |
| **Reviewer** | Sonnet / Haiku | Code review、检查模块边界、验证一致性 |

### 迭代循环

```
1. 用户提需求
2. Architect 分析影响范围 → 输出 spec
3. 用户确认方案
4. Builder 按 spec 编码
5. Reviewer 验证（模块边界 + 功能完整性）
6. 用户验收 → 回到 1
```

### 原则

- **一次一个模块** — 每次迭代只改动一个模块
- **向后兼容** — 重构时保持 `window.__*__` 全局接口不变
- **增量替换** — 新模块写好后再改引用
- **一个迭代一个 git commit**
- **100% 向后兼容** — 重构完所有核心功能（筛选/搜索/地图/收藏/导航/分享）必须和重构前完全一致

## 当前不动的代码

- `index.html` 及所有校园信息页面（xinsheng/xuanke/tice 等 15 个页面）
- `data/*.js` 数据文件
- `js/config.js` / `js/analytics.js` 配置文件
- `js/baibaoxiang.js` 等非主流程脚本
- `food-map/` 和 `food-map-v2.bak/` 旧版本备份

## 验证方法

每次改动后：
1. 无 JS 语法错误
2. 无 Console 报错
3. 视觉检查关键页面变化
4. `git diff --stat` 确认只改目标文件

## 当前状态 (2026-07-25)

- ✅ V2 新生手册首页 (`index.html`) — 广告弹窗已配置
  - 打开后 2s 自动弹出（3 秒倒计时）
  - 底部"加入2026新生群"按钮点击弹出（无倒计时，可立即关闭）
  - 两张二维码：黑底新生群 + 白底 LinkYou
- 服务器：`npx serve . -p 3000` → http://localhost:3000/
- Robin 已验证效果通过，后续开发无需反复打开浏览器验证
