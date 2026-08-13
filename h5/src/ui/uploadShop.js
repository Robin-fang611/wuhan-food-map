// 探店采集：用户上传店铺（h() 构建，禁止 innerHTML）。
// 三分支结果态：verified（高德匹配）/ verified_stall（流动摊收录）/ pending（待核验·不删）。
// 入口由 main.js 经 ctx.goUpload 挂载；ctx 提供 goBack / goHome / goUpload / userId。
import { h, toast, clear } from './dom.js';
import { uploadShop } from '../../hypha/integration/agent-client.js';

function resultHead(d) {
  if (d === 'verified') return '已收录';
  if (d === 'verified_stall') return '已收录 · 流动摊';
  return '已存为待核验';
}
function resultSub(d) {
  if (d === 'verified') return '高德已匹配到这家店';
  if (d === 'verified_stall') return '按流动摊规则收录';
  return '高德没搜到，先存着等你确认';
}

export async function UploadShop(ctx) {
  const { goBack, goHome, goUpload, userId } = ctx;
  const root = h('div', { class: 'upload-view' });

  // 顶部返回条
  root.appendChild(h('div', { class: 'detail-top' }, [
    h('button', { class: 'nav-btn', type: 'button', text: '返回', onclick: goBack }),
    h('span', { class: 'detail-top-title', text: '贡献店铺' })
  ]));

  // 信任导语
  root.appendChild(h('div', { class: 'upload-intro' }, [
    h('div', { class: 'upload-intro-title', text: '探店采集 · 真人众包' }),
    h('div', { class: 'upload-intro-text', text: '提交后蛮有味用高德自动校验，真实即收录，数据不删、排序永不被出价影响。' })
  ]));

  // 表单字段（逐个持有引用，提交时读 .value）
  const nameInput = h('input', { class: 'ac-input upload-input', type: 'text', name: 'name', placeholder: '例如：南湖校区后门煎饼摊', 'aria-label': '店名', required: 'required' });
  const addrInput = h('input', { class: 'ac-input upload-input', type: 'text', name: 'address', placeholder: '街道 / 门牌，或留空改用定位', 'aria-label': '地址' });
  const descInput = h('textarea', { class: 'ac-input upload-textarea', name: 'description', rows: '4', placeholder: '卖啥、啥味、几点出摊？如果是流动摊/路边摊，请在这里说明，我们按摊类直接收录。', 'aria-label': '描述', required: 'required' });
  const catSelect = h('select', { class: 'ac-input upload-select', name: 'category' }, [
    h('option', { value: '早餐', text: '早餐' }),
    h('option', { value: '热干面', text: '热干面' }),
    h('option', { value: '小吃', text: '小吃' }),
    h('option', { value: '正餐', text: '正餐' }),
    h('option', { value: '饮品', text: '饮品' }),
    h('option', { value: '甜点', text: '甜点' }),
    h('option', { value: '其他', text: '其他' })
  ]);
  const stallToggle = h('input', { type: 'checkbox', class: 'upload-toggle-input', name: 'isStall' });
  const hiddenLng = h('input', { type: 'hidden', name: 'lng' });
  const hiddenLat = h('input', { type: 'hidden', name: 'lat' });
  const locStatus = h('span', { class: 'upload-loc-status muted', text: '' });

  function requestLocation() {
    if (!navigator.geolocation) { locStatus.textContent = '定位不可用，请手动填地址'; return; }
    locStatus.textContent = '定位中…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        hiddenLng.value = String(pos.coords.longitude);
        hiddenLat.value = String(pos.coords.latitude);
        locStatus.textContent = '已获取你的定位 ✓';
      },
      () => { locStatus.textContent = '定位失败，请手动填地址'; },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  const form = h('form', { class: 'ac-form upload-form', novalidate: 'novalidate' }, [
    h('label', { class: 'upload-field' }, [
      h('span', { class: 'upload-label' }, [document.createTextNode('店名 '), h('span', { class: 'upload-req', text: '*' })]),
      nameInput
    ]),
    h('label', { class: 'upload-field' }, [
      h('span', { class: 'upload-label', text: '地址' }),
      h('div', { class: 'upload-addr-row' }, [
        addrInput,
        h('button', { class: 'btn btn-ghost upload-loc-btn', type: 'button', text: '使用我的位置', onclick: requestLocation })
      ]),
      locStatus
    ]),
    h('label', { class: 'upload-field' }, [
      h('span', { class: 'upload-label' }, [document.createTextNode('描述 '), h('span', { class: 'upload-req', text: '*' })]),
      descInput
    ]),
    h('label', { class: 'upload-field' }, [
      h('span', { class: 'upload-label', text: '分类' }),
      catSelect
    ]),
    h('label', { class: 'upload-field upload-toggle' }, [
      h('span', { class: 'upload-toggle-text' }, [
        h('span', { class: 'upload-label', text: '流动摊 / 路边摊' }),
        h('span', { class: 'upload-toggle-hint muted', text: '勾选后按摊类规则收录（坐标取你的定位，不伪造）' })
      ]),
      h('span', { class: 'upload-toggle-switch' }, [stallToggle, h('span', { class: 'upload-toggle-slider' })])
    ]),
    hiddenLng, hiddenLat
  ]);

  const submitBtn = h('button', { class: 'btn btn-primary btn-block upload-submit', type: 'submit', text: '提交，让蛮有味核验' });
  form.appendChild(submitBtn);
  root.appendChild(form);

  // 错误/重试区（网络异常时插入）
  const errArea = h('div', { class: 'upload-err' });
  root.appendChild(errArea);

  let lastPayload = null;

  async function doUpload(payload) {
    lastPayload = payload;
    submitBtn.disabled = true;
    const overlay = h('div', { class: 'upload-loading' }, [
      h('div', { class: 'seal-ripple' }),
      h('div', { class: 'upload-loading-text', text: '正在用高德校验…' })
    ]);
    root.appendChild(overlay);
    try {
      const res = await uploadShop(payload);
      if (overlay.parentNode) root.removeChild(overlay);
      submitBtn.disabled = false;
      if (res && res.decision) renderResult(res.decision, res);
      else throw new Error(res && res.error ? res.error : '校验失败');
    } catch (err) {
      if (overlay.parentNode) root.removeChild(overlay);
      submitBtn.disabled = false;
      toast('网络开小差了，请重试');
      clear(errArea);
      errArea.appendChild(h('div', { class: 'agent-error' }, [
        h('div', { class: 'agent-error-title', text: '没连上核验服务' }),
        h('div', { class: 'agent-error-hint', text: '你填的店铺已暂存本地，点下方按钮重发。' }),
        h('button', { class: 'btn btn-primary', type: 'button', text: '重试', onclick: () => doUpload(lastPayload) })
      ]));
    }
  }

  function submit() {
    const name = nameInput.value.trim();
    const address = addrInput.value.trim();
    const description = descInput.value.trim();
    const category = catSelect.value;
    const isStall = stallToggle.checked;
    const lng = hiddenLng.value, lat = hiddenLat.value;
    if (name.length < 2) { toast('店名至少 2 个字'); nameInput.focus(); return; }
    if (description.length < 5) { toast('描述至少 5 个字（摊类请说明）'); descInput.focus(); return; }
    if (isStall && !address && !(lng && lat)) { toast('流动摊请填地址或点「使用我的位置」'); return; }
    const location = (lng && lat) ? { lng: Number(lng), lat: Number(lat) } : undefined;
    const payload = { name, address, description, category, isStall, location };
    if (userId) payload.userId = userId;
    doUpload(payload);
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });

  function renderResult(decision, data) {
    clear(root);
    root.appendChild(h('div', { class: 'detail-top' }, [
      h('button', { class: 'nav-btn', type: 'button', text: '返回', onclick: goHome }),
      h('span', { class: 'detail-top-title', text: '核验结果' })
    ]));

    const badgeClass = decision === 'verified' ? 'ok' : decision === 'verified_stall' ? 'stall' : 'pending';
    root.appendChild(h('div', { class: `upload-result-badge upload-result-${badgeClass}` }, [
      h('div', { class: 'upload-result-seal', text: decision === 'pending' ? '核' : '收' }),
      h('div', { class: 'upload-result-head', text: resultHead(decision) }),
      h('div', { class: 'upload-result-sub', text: resultSub(decision) })
    ]));

    const card = h('div', { class: 'card upload-result-card' });
    if (decision === 'verified') {
      card.appendChild(h('div', { class: 'detail-block' }, [
        h('div', { class: 'detail-block-title', text: '高德匹配到' }),
        h('div', { class: 'detail-dishes', text: data.poi.name }),
        h('div', { class: 'upload-result-addr', text: data.poi.address }),
        data.poi.distanceMeters != null
          ? h('div', { class: 'upload-result-dist muted', text: `距你约 ${data.poi.distanceMeters} m` })
          : null
      ]));
      card.appendChild(h('div', { class: 'agent-guidance', text: '已加入蛮有味美食库，真实收录，排序永不被出价影响。' }));
    } else if (decision === 'verified_stall') {
      card.appendChild(h('div', { class: 'detail-block' }, [
        h('div', { class: 'detail-block-title', text: '收录规则' }),
        h('div', { class: 'detail-dishes', text: '按流动摊 / 路边摊规则已收录' })
      ]));
      card.appendChild(h('div', { class: 'agent-guidance', text: data.note || '坐标取自你上传的定位，不伪造。' }));
      card.appendChild(h('div', { class: 'upload-result-welcome', text: '欢迎街边好味道' }));
    } else {
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

    root.appendChild(h('div', { class: 'upload-result-actions' }, [
      h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: '再贡献一家', onclick: () => goUpload && goUpload() }),
      h('button', { class: 'btn btn-primary btn-block', type: 'button', text: '回首页', onclick: goHome })
    ]));
  }

  root.appendChild(h('div', { class: 'footnote', text: '提交即表示你确认信息真实。坐标沿用你授权的定位，蛮有味绝不伪造地址。' }));
  return root;
}
