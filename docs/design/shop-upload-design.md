# 蛮有味 ·「用户上传店铺 / 探店采集」前端设计规格

> 文档版本：v1.0（设计稿 · 仅供评审，不含生产代码）
> 作者：前端 UI/UX 设计子代理
> 适用：H5 移动端（容器最大宽 `--maxw: 480px`）
> 关联规格：`SPEC.md` §7.4「探店采集（用户上传 + 高德校验）」
> 关联文档：`collect-visit-guide.md`（人工核验流程的补全闭环）

---

## 0. 一句话目标与用户故事

**一句话目标**：让用户把「自己发现的野店 / 街边摊 / 还没进库的好吃的」一键提交，蛮有味后端用高德自动校验、透明地决定「入库 / 摊类入库 / 待核验」，全程不删数据、不恰饭。

**用户故事（As a user）**：
> 我作为一个常逛财大南湖周边的学生，发现了一家没在高德上挂但很好吃的流动煎饼摊。我想把它告诉蛮有味，让更多人能找到它。我希望填完名字、地址（或用我当前定位）、描述、分类，告诉系统「这是路边摊」，点提交后立刻知道它有没有被收录、为什么，并且相信它「只要真实就不会被删掉」。

**非目标（本期不做，已注明假设）**：
- 不做上传人身份强绑定（匿名也可贡献，登录态可选附加）；
- 不做上传后编辑 / 撤回（待核验数据由人工处理，预留说明）；
- 不做上传队列与进度持久化（提交即同步等待结果）。

---

## 1. 用户流程图（ASCII）

```
┌─────────────────────────────────────────────┐
│ 首页 home.js                                  │
│  [英雄区] 问 Agent                            │
│  ─────────────────────────────────────────── │
│  [贡献店铺 卡片] ← 新增入口（见 §2）         │
│  ─────────────────────────────────────────── │
│  每日签到 / 抽奖 / 任务 / 发现 / 榜单 / 券包  │
└───────────────┬─────────────────────────────┘
                │ 点击「去贡献店铺」
                ▼
┌─────────────────────────────────────────────┐
│ 上传表单视图 uploadForm                       │
│  店名* │ 地址 + [使用我的位置] │ 描述*      │
│  分类（下拉） │ 是否流动摊/路边摊（开关）   │
│  [提交]                                       │
└───────┬─────────────────────────┬───────────┘
        │ 校验通过                │ 校验不通过（前端）
        ▼                         ▼
   idle ──提交──▶ loading（「正在用高德校验…」）
                          │
                          │ agentClient.uploadShop(payload)
                          │ POST :8799/upload
                          ▼
                后端调高德校验 → 决策
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        verified    verified_stall   pending
       （高德匹配） （摊类入正式库） （待核验·不删）
              └────────────┼────────────┘
                          ▼
                   结果视图 resultView
                   [再次贡献] [返回首页]
                          │
                ┌─────────┴──────────┐
                ▼                    ▼
           网络/后端异常          无高德 Key（降级）
           error 态 + 重试       → 全部进 pending（预留）
```

---

## 2. 信息架构（入口 → 表单 → 结果）

```
home（落地页）
 └─ 贡献店铺入口（常驻 section 卡片，英雄区下方、签到区上方）
      └─ uploadForm（独立视图，可经 ctx.goUpload 进入；顶部有返回）
           ├─ 表单区（5 字段）
           ├─ 提交按钮（btn-primary btn-block）
           └─ 状态覆盖层 / 结果区
                ├─ loading（印章红波纹 + 文案）
                ├─ resultView.verified
                ├─ resultView.verified_stall
                ├─ resultView.pending
                └─ error（toast + 重试按钮）
```

**入口放置决策（明确）**：在 `home.js` 的 `home-hero` 之后、第一个 `section`（每日签到）之前，插入一个 `section.shop-upload-entry` 卡片。理由：
- 英雄区是「问 Agent」主入口，不应被污染；
- 贡献店铺与「真人探过的，不恰饭」的信任调性天然衔接，放在英雄区正下方顺承品牌承诺；
- 比塞进顶部 `top-actions`（「我的 / 地图 / 券包」已三枚）更显眼，且避免与导航争夺空间。

> 设计稿用 `h()` 伪代码描述入口卡片（见 §4.1）。实现时由 `Home(ctx)` 接收 `goUpload` 回调，渲染该卡片并挂 `onclick: goUpload`。

---

## 3. 组件树（h() 伪代码，禁止 innerHTML）

> 约定：`h(tag, attrs, children)` 来自 `h5/src/ui/dom.js`。所有**动态文本**走 `text` 属性或 `document.createTextNode`，绝不拼接 innerHTML（防 XSS §8）。`ctx` 为视图上下文，含 `goBack`、`goHome`、`goUploadAgain`、`onSubmit(payload)`。

### 3.1 首页入口卡片（插入 home.js）

```js
// 在 Home() 内，home-hero 之后插入：
root.appendChild(h('div', { class: 'section shop-upload-entry' }, [
  h('div', { class: 'shop-entry-card', role: 'button', tabindex: '0',
    onclick: () => goUpload && goUpload(),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goUpload && goUpload(); } }
  }, [
    h('div', { class: 'shop-entry-icon', text: '献' }),   // 印章红方块，楷体「献」
    h('div', { class: 'shop-entry-body' }, [
      h('div', { class: 'shop-entry-title', text: '发现野店？贡献给蛮有味' }),
      h('div', { class: 'shop-entry-sub', text: '街边摊、新开张、高德没挂的——你报，我们核' })
    ]),
    h('div', { class: 'shop-entry-arrow', text: '→' })
  ])
]));
```

### 3.2 上传表单视图 uploadForm（独立视图）

```js
export function UploadForm(ctx) {
  const { goBack, onSubmit } = ctx;
  const root = h('div', { class: 'upload-view' });

  // 顶部返回条（沿用 detail-top 视觉语言）
  root.appendChild(h('div', { class: 'detail-top' }, [
    h('button', { class: 'nav-btn', type: 'button', text: '返回', onclick: goBack }),
    h('span', { class: 'detail-top-title', text: '贡献店铺' })
  ]));

  // 信任导语（弱化营销，强调真实）
  root.appendChild(h('div', { class: 'upload-intro' }, [
    h('div', { class: 'upload-intro-title', text: '探店采集 · 真人众包' }),
    h('div', { class: 'upload-intro-text', text: '提交后蛮有味用高德自动校验，真实即收录，数据不删、排序永不被出价影响。' })
  ]));

  const form = h('form', { class: 'ac-form upload-form', novalidate: 'novalidate' });

  // 字段 1：店名*
  form.appendChild(h('label', { class: 'upload-field' }, [
    h('span', { class: 'upload-label', text: '店名 ', }, [
      h('span', { class: 'upload-req', text: '*' })
    ]),
    h('input', {
      class: 'ac-input upload-input', type: 'text', name: 'name',
      placeholder: '例如：南湖校区后门煎饼摊', 'aria-label': '店名', required: 'required'
    })
  ]));

  // 字段 2：地址 + 使用我的位置
  const locStatus = h('span', { class: 'upload-loc-status muted', text: '' });
  form.appendChild(h('label', { class: 'upload-field' }, [
    h('span', { class: 'upload-label', text: '地址' }),
    h('div', { class: 'upload-addr-row' }, [
      h('input', {
        class: 'ac-input upload-input', type: 'text', name: 'address',
        placeholder: '街道 / 门牌，或留空改用定位', 'aria-label': '地址'
      }),
      h('button', {
        class: 'btn btn-ghost upload-loc-btn', type: 'button',
        text: '使用我的位置',
        onclick: () => requestLocation(locStatus, hiddenLng, hiddenLat) // 见 §5 geolocation
      })
    ]),
    locStatus
  ]));
  // 定位坐标以隐藏字段随表单提交（不展示经纬度本身，仅文案提示已获取）
  const hiddenLng = h('input', { type: 'hidden', name: 'lng' });
  const hiddenLat = h('input', { type: 'hidden', name: 'lat' });
  form.appendChild(hiddenLng); form.appendChild(hiddenLat);

  // 字段 3：描述*（摊类说明的关键渠道）
  form.appendChild(h('label', { class: 'upload-field' }, [
    h('span', { class: 'upload-label', text: '描述 ', }, [
      h('span', { class: 'upload-req', text: '*' })
    ]),
    h('textarea', {
      class: 'ac-input upload-textarea', name: 'description', rows: '4',
      placeholder: '卖啥、啥味、几点出摊？如果是流动摊/路边摊，请在这里说明，我们按摊类直接收录。',
      'aria-label': '描述', required: 'required'
    })
  ]));

  // 字段 4：分类（下拉）
  form.appendChild(h('label', { class: 'upload-field' }, [
    h('span', { class: 'upload-label', text: '分类' }),
    h('select', { class: 'ac-input upload-select', name: 'category' }, [
      h('option', { value: '早餐', text: '早餐' }),
      h('option', { value: '热干面', text: '热干面' }),
      h('option', { value: '小吃', text: '小吃' }),
      h('option', { value: '正餐', text: '正餐' }),
      h('option', { value: '饮品', text: '饮品' }),
      h('option', { value: '甜点', text: '甜点' }),
      h('option', { value: '其他', text: '其他' })
    ])
  ]));

  // 字段 5：是否流动摊/路边摊（开关 toggle）
  const toggleInput = h('input', { type: 'checkbox', class: 'upload-toggle-input', name: 'isStall' });
  form.appendChild(h('label', { class: 'upload-field upload-toggle' }, [
    h('span', { class: 'upload-toggle-text' }, [
      h('span', { class: 'upload-label', text: '流动摊 / 路边摊' }),
      h('span', { class: 'upload-toggle-hint muted', text: '勾选后按摊类规则收录（坐标取你的定位，不伪造）' })
    ]),
    h('span', { class: 'upload-toggle-switch' }, [
      toggleInput,
      h('span', { class: 'upload-toggle-slider' })
    ])
  ]));

  // 提交按钮
  const submitBtn = h('button', {
    class: 'btn btn-primary btn-block upload-submit', type: 'submit', text: '提交，让蛮有味核验'
  });
  form.appendChild(submitBtn);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // 前端校验（见 §6 表单字段表）→ 组装 payload → ctx.onSubmit(payload)
  });
  root.appendChild(form);

  root.appendChild(h('div', { class: 'footnote', text: '提交即表示你确认信息真实。坐标沿用你授权的定位，蛮有味绝不伪造地址。' }));
  return root;
}
```

### 3.3 结果视图 resultView（三分支共用骨架）

```js
// decision: 'verified' | 'verified_stall' | 'pending'
export function UploadResult(ctx) {
  const { decision, data, goHome, goUploadAgain } = ctx;
  const root = h('div', { class: 'upload-view upload-result' });

  root.appendChild(h('div', { class: 'detail-top' }, [
    h('button', { class: 'nav-btn', type: 'button', text: '返回', onclick: goHome }),
    h('span', { class: 'detail-top-title', text: '核验结果' })
  ]));

  // 印章结果徽标（统一）
  const badgeClass = decision === 'verified' ? 'ok'
                   : decision === 'verified_stall' ? 'stall'
                   : 'pending';
  root.appendChild(h('div', { class: `upload-result-badge upload-result-${badgeClass}` }, [
    h('div', { class: 'upload-result-seal', text: decision === 'pending' ? '核' : '收' }),
    h('div', { class: 'upload-result-head', text: resultHead(decision) }),
    h('div', { class: 'upload-result-sub', text: resultSub(decision) })
  ]));

  const card = h('div', { class: 'card upload-result-card' });

  if (decision === 'verified') {
    // 高德匹配到的 POI
    card.appendChild(h('div', { class: 'detail-block' }, [
      h('div', { class: 'detail-block-title', text: '高德匹配到' }),
      h('div', { class: 'detail-dishes', text: data.poi.name }),
      h('div', { class: 'upload-result-addr', text: data.poi.address }),
      data.poi.distanceMeters != null
        ? h('div', { class: 'upload-result-dist muted', text: `距你约 ${Math.round(data.poi.distanceMeters)} m` })
        : null
    ]));
    card.appendChild(h('div', { class: 'agent-guidance', text: '已加入蛮有味美食库，真实收录，排序永不被出价影响。' }));
  }
  else if (decision === 'verified_stall') {
    card.appendChild(h('div', { class: 'detail-block' }, [
      h('div', { class: 'detail-block-title', text: '收录规则' }),
      h('div', { class: 'detail-dishes', text: '按流动摊 / 路边摊规则已收录' })
    ]));
    card.appendChild(h('div', { class: 'agent-guidance', text: data.note || '坐标取自你上传的定位，不伪造。' }));
    card.appendChild(h('div', { class: 'upload-result-welcome', text: '欢迎街边好味道 🍜' }));
  }
  else { // pending
    card.appendChild(h('div', { class: 'detail-block' }, [
      h('div', { class: 'detail-block-title', text: '状态标注' }),
      h('span', { class: 'm-tag', text: data.label || '待核验' })
    ]));
    card.appendChild(h('div', { class: 'detail-block' }, [
      h('div', { class: 'detail-block-title', text: '原因' }),
      h('div', { class: 'detail-reason', text: data.reason || '高德未匹配且非摊类' })
    ]));
    card.appendChild(h('div', { class: 'upload-result-keep', text: '不会删除，留待人工核实后入库。' }));
  }

  root.appendChild(card);

  // 操作
  root.appendChild(h('div', { class: 'upload-result-actions' }, [
    h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: '再贡献一家', onclick: goUploadAgain }),
    h('button', { class: 'btn btn-primary btn-block', type: 'button', text: '回首页', onclick: goHome })
  ]));
  return root;
}
```

> `error` 态不单独成视图：在 `uploadForm` 上方以 toast 报错（复用 `toast()`），并在表单底部插入一个 `agent-error` 风格的重试块（见 `app.css:417` 的 `.agent-error`），含「重试」按钮调用 `ctx.onSubmit(lastPayload)`。

---

## 4. 表单字段表

| 字段名 | UI 控件 | 类型 | 必填 | 校验规则 | 占位文案 |
|---|---|---|---|---|---|
| `name` 店名 | `input[type=text]` | 文本 | 是 | 非空；去除首尾空白后 ≥ 2 字（防乱填） | 例如：南湖校区后门煎饼摊 |
| `address` 地址 | `input[type=text]` | 文本 | 否（与定位二选一） | 若留空，必须有 `location`；若填写，≤ 80 字 | 街道 / 门牌，或留空改用定位 |
| `location` 定位 | 隐藏 `lng/lat` + 「使用我的位置」按钮 | `{lng,lat}` | 否（与地址二选一；摊类建议必填） | geolocation 成功才写入；失败时 `locStatus` 提示，不阻断提交（除非摊类勾选且无地址） | — |
| `description` 描述 | `textarea` | 多行文本 | 是 | 非空；≥ 5 字（这是「是否摊类」的关键说明渠道） | 卖啥、啥味、几点出摊？如果是流动摊/路边摊请说明 |
| `category` 分类 | `select` | 枚举 | 否（默认「其他」） | 取值 ∈ {早餐,热干面,小吃,正餐,饮品,甜点,其他} | — |
| `isStall` 是否流动摊 | toggle 开关 | 布尔 | 否（默认 false） | 勾选 = true；勾选后建议有 `location` 或 `address` | — |

**提交 payload 组装**（前端校验通过后）：
```js
const payload = {
  name: nameEl.value.trim(),
  address: addrEl.value.trim(),
  description: descEl.value.trim(),
  category: catEl.value,
  isStall: toggleInput.checked,
  location: (hasLng && hasLat) ? { lng: Number(hiddenLng.value), lat: Number(hiddenLat.value) } : undefined
};
```
> 字段名与后端契约（§8）严格对齐；`location` 仅在取得时携带。

---

## 5. 状态机

`idle → loading → { verified | verified_stall | pending | error }`

| 状态 | 触发 | 画面 |
|---|---|---|
| `idle` | 进入表单 | 表单可编辑；提交按钮可用 |
| `loading` | 提交且前端校验通过，调用 `uploadShop` | 表单禁用；顶部「正在用高德校验…」印章红波纹 + 骨架屏（用 `--skeleton-base`/`--skeleton-shine`）；按钮显示 loading |
| `verified` | 后端 `decision:"verified"` | 结果徽标「收」+ 高德 POI 名称/地址/距离 + 「已加入蛮有味美食库」 |
| `verified_stall` | 后端 `decision:"verified_stall"` | 结果徽标「收」+ 「按流动摊规则已收录」+ 坐标取自定位说明 + 「欢迎街边好味道」 |
| `pending` | 后端 `decision:"pending"` | 结果徽标「核」+ `label` 标注 + `reason` + 「不会删除，留待人工核实」 |
| `error` | 网络错误 / 后端无响应 / `success:false` | toast 报错 + 表单下方 `agent-error` 重试块（带「重试」按钮，重发 `lastPayload`） |

> `loading` 与 `error` 均为表单视图内的覆盖 / 内嵌态，不离开表单上下文，便于重试。`verified/verified_stall/pending` 切到结果视图。

---

## 6. 视觉规范（全部引用 tokens.css 变量）

> 严禁写死颜色；以下每处均标注所用令牌。

### 6.1 入口卡片 `shop-entry-card`
- 容器：`background: var(--paper-2)`；`border: 1px solid var(--line)`；`border-radius: var(--r-lg)`；`box-shadow: var(--shadow-sm)`；`padding: 14px 16px`。
- 图标 `shop-entry-icon`：`width/height 40px`；`border-radius: var(--r-sm)`；`background: var(--seal-red)`；`border: 2px solid var(--gold)`；楷体白字（复用 `.brand .seal` 视觉）。
- 标题 `shop-entry-title`：`font-family: var(--font-display)`；`color: var(--ink)`；`font-size: 16px`。
- 副文案 `shop-entry-sub`：`color: var(--ink-2)`；`font-size: 12px`。
- 箭头 `shop-entry-arrow`：`color: var(--seal-red)`。

### 6.2 表单
- 沿用现有 `.ac-form` / `.ac-input`（账号中心输入框样式）：`border: 1px solid var(--line)`；`border-radius: var(--r-sm)`；`background: var(--paper-2)`；`color: var(--ink)`；聚焦 `border-color: var(--seal-red)` + `box-shadow: 0 0 0 3px rgba(192,57,43,.12)`（同 `.ac-input:focus`）。
- 必填星标 `upload-req`：`color: var(--seal-red)`。
- 标签 `upload-label`：`font-family: var(--font-body)`；`color: var(--ink-2)`；`font-size: 13px`。
- 描述 `textarea.upload-textarea`：同 `.ac-input`，`resize: vertical`；`min-height: 88px`。
- 分类 `select.upload-select`：继承 `.ac-input`，右侧系统箭头。
- 「使用我的位置」按钮 `upload-loc-btn`：复用 `.btn .btn-ghost`（透明底 + 印章红描边），紧凑内边距。
- 提交按钮 `upload-submit`：复用 `.btn .btn-primary .btn-block`（印章红实底白字）。

### 6.3 流动摊开关 toggle（新增组件，令牌化）
- 轨道 `upload-toggle-slider`：`width 46px; height 26px`；`border-radius: 999px`；`background: var(--line)`；过渡 `var(--dur-fast) var(--ease-out)`。
- 开启态：轨道 `background: var(--seal-red)`；滑块（伪元素或子节点）`transform: translateX(20px)`；`background: #fff`（白点，未写死新色，属中性白）。
- 文案 `upload-toggle-hint`：`color: var(--ink-2)`；`font-size: 11px`。

### 6.4 结果视图
- 徽标 `upload-result-badge`：
  - `ok` / `stall`：`background: rgba(192,57,43,.06)`；印章块 `background: var(--seal-red)`；标题 `color: var(--seal-red)`。
  - `pending`：`background: rgba(201,162,39,.10)`；印章块 `background: var(--gold)`；标题 `color: var(--gold)`（金=待处理语义，复用 `--gold`）。
- 结果卡 `upload-result-card`：复用 `.card`。
- 信任导语 `agent-guidance`：复用现有（左 3px 印章红边框 + 浅红底），文案强调「真实收录 / 不恰饭」。
- 距离 `upload-result-dist`：`color: var(--ink-2)`。
- 待核验强调 `upload-result-keep`：`color: var(--ticket-green)`（墨绿=郑重承诺语义，复用 `--ticket-green`）。

### 6.5 loading（印章红波纹 + 骨架）
- 遮罩层 `upload-loading`：半透明 `background: rgba(247,241,230,.9)`（宣纸半透），居中。
- 波纹：`.seal-ripple` 用 `var(--seal-red)` 主圆 + `var(--gold)` 外环，`animation` 用 `var(--dur-slow)` 时长、`var(--ease-out-soft)` 缓动，无限脉冲。
- 骨架占位条：用 `--skeleton-base` 底 + `--skeleton-shine` 流光（参考现有 `--skeleton-*` 令牌）。
- 文案「正在用高德校验…」：`color: var(--ink-2)`；`font-family: var(--font-body)`。

---

## 7. 集成契约（供后续实现，严格据此画结果态）

### 7.1 前端新增客户端方法
```js
// agentClient.uploadShop(payload)
// 请求：POST http://127.0.0.1:8799/upload
// headers: { 'Content-Type': 'application/json' }
// body: { name, address, description, category, isStall, location?: {lng,lat} }
async function uploadShop(payload) {
  const res = await fetch('http://127.0.0.1:8799/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json(); // 见下方三态 + 异常
}
```

### 7.2 后端响应（设计稿据此画结果态）
```jsonc
// ① 高德匹配到 → 正式库
{ "decision": "verified",
  "poi": { "name": "xxx", "address": "yyy", "location": { "lng": 114.3, "lat": 30.5 }, "distanceMeters": 320 },
  "merchantId": "m_xxx" }

// ② 流动摊/路边摊 → 正式库（坐标取上传定位）
{ "decision": "verified_stall",
  "merchantId": "m_yyy",
  "note": "流动摊/路边摊，坐标取自上传定位" }

// ③ 搜不到且非摊类 → 待核验（不删）
{ "decision": "pending",
  "uploadId": "u_zzz",
  "label": "待核验",
  "reason": "高德未匹配且非摊类" }

// ④ 异常
{ "success": false, "error": "..." }
```

---

## 8. 异常与边界

| 场景 | 处理 |
|---|---|
| **网络错误 / 后端无响应** | `uploadShop` 抛错 → `toast('网络开小差了，请重试')` + 表单内 `agent-error` 重试块（带「重试」）。提交按钮恢复可用。 |
| **无高德 Key（降级）** | 后端理论上不会触发（Robin 已提供免费 Key，见 SPEC §7.4）。设计上**预留**：若后端返回 `decision:"pending"` 且 `reason` 含「高德未启用」类字样，结果页在 `agent-guidance` 额外提示「高德校验暂未启用，已先存为待核验，启用后自动复核」。前端不主动判断 Key 缺失。 |
| **geolocation 被拒 / 不可用** | `locStatus` 显示「定位不可用，请手动填地址」；不阻断提交，但**若摊类开关已勾选且无地址**，前端提示「摊类建议提供定位或地址」并拦截提交。 |
| **重复店铺** | 交给后端去重：若高德命中已存在商户，后端返回 `verified` 并复用原 `merchantId`（设计上视为「已收录」，结果页文案不变）。前端不在提交前做去重查询。 |
| **字段校验失败** | 前端拦截，聚焦首个错误字段，`toast(errorMsg)`（如「店名至少 2 个字」），不进入 loading。 |
| **提交中重复点击** | loading 态禁用提交按钮（`submitBtn.disabled = true`），防重复请求。 |

---

## 9. 验收清单

- [ ] 首页英雄区下方出现「贡献店铺」入口卡片，点击进入上传表单。
- [ ] 表单含 5 字段：店名*、地址+使用我的位置、描述*、分类下拉、流动摊开关。
- [ ] 「使用我的位置」能调浏览器 geolocation，成功写入隐藏 lng/lat 并提示，失败有降级提示。
- [ ] 前端校验：必填项缺失 / 店名<2 字 / 描述<5 字 被拦截并 toast。
- [ ] 提交进入 loading（印章红波纹 + 骨架），按钮禁用。
- [ ] 三分支结果态均按 §7.2 渲染：verified（POI 名/址/距）、verified_stall（摊类说明+欢迎语）、pending（标注+原因+不删承诺）。
- [ ] error 态：toast + 重试块，可重发上次 payload。
- [ ] 所有颜色 / 圆角 / 间距 / 字体均引用 tokens.css 变量，无写死色值。
- [ ] 所有 DOM 经 `h()` 构建，无 innerHTML 拼接动态文本（防 XSS §8）。
- [ ] 信任调性：结果页弱化营销，强调「真实收录 / 不恰饭 / 不删数据」。
- [ ] 移动端优先，`max-width: var(--maxw)` 居中，无横向溢出。

---

## 10. 合理假设（已自行决定，未询问）

1. **入口位置**：放在英雄区下方独立 section 卡片（而非顶部导航或英雄区 chip），理由见 §2。
2. **视图切换机制**：新增 `ctx.goUpload` / `goHome` / `goUploadAgain` 回调，由 `app.js` 路由层负责切换视图（不在本设计内实现路由，仅约定接口）。
3. **分类枚举**：沿用 SPEC §7.4 的 7 项（早餐/热干面/小吃/正餐/饮品/甜点/其他），默认「其他」。
4. **地址与定位二选一**：两者都不填仍可提交（仅影响匹配质量）；但**摊类勾选且无地址时强制要求定位或地址**，避免摊类无坐标。
5. **定位展示**：经纬度不向用户展示具体数值，仅以「已获取你的定位」文案提示，符合「坐标不伪造、不泄露」调性。
6. **提交为同步等待**：不做离线队列 / 草稿保存，提交即 `fetch` 等待结果（移动端单次操作，足够）。
7. **无高德 Key 降级**：前端不主动探测，完全依赖后端 `decision` 字段；结果页仅对 `reason` 含「未启用」字样追加说明。
8. **登录态**：贡献不强制登录；若 `ctx.userId` 存在则随 payload 附带（契约未要求，预留），否则匿名。
9. **去重与编辑**：交给后端；前端不做提交前查重、不做上传后编辑/撤回（见 §0 非目标）。
10. **字体回退**：原型中楷体优先 `'LXGW WenKai', 'Ma Shan Zheng', STKaiti, KaiTi`，与 tokens 一致；若环境无网络字体，回退到系统楷体/serif，不影响布局。
11. **动效时长**：波纹 / 骨架 / 入场过渡均引用 tokens 的 `--dur-*` 与 `--ease-*`，不新増魔法数值（除 toggle 滑块位移 20px 这类纯几何量）。
12. **结果视图「返回」语义**：pending 态的「返回」回到首页（数据已存，无需停留）；「再贡献一家」重置表单。
```
