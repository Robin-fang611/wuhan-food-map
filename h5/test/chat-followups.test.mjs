// 多轮追问快捷条单测（S6 · 2026-08-15）——纯逻辑，无 DOM。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOLLOWUP_ACTIONS, buildFollowupChips, shouldShowFollowups, parseFollowup } from '../src/ui/chatFollowups.js';

test('FOLLOWUP_ACTIONS：换一家/再便宜点/换个附近，换一家重置 seen', () => {
  assert.equal(FOLLOWUP_ACTIONS.length, 3);
  const byLabel = Object.fromEntries(FOLLOWUP_ACTIONS.map((a) => [a.label, a]));
  assert.equal(byLabel['换一家'].followup, '换一家');
  assert.equal(byLabel['换一家'].resetSeen, true, '换一家应重置已见列表');
  assert.equal(byLabel['再便宜点'].resetSeen, false);
  assert.equal(byLabel['换个附近'].followup, '换个附近');
});

test('buildFollowupChips：无主推 3 个；有主推追加「收藏这家」', () => {
  assert.equal(buildFollowupChips({ hasPrimary: false }).length, 3);
  const withPrimary = buildFollowupChips({ hasPrimary: true });
  assert.equal(withPrimary.length, 4);
  const fav = withPrimary[3];
  assert.equal(fav.label, '收藏这家');
  assert.equal(fav.primaryAction, 'favorite');
});

test('shouldShowFollowups：澄清时不追问；无商户不追问；有商户追问', () => {
  assert.equal(shouldShowFollowups({ needsClarification: true, merchantCount: 3 }), false);
  assert.equal(shouldShowFollowups({ merchantCount: 0 }), false);
  assert.equal(shouldShowFollowups({ merchantCount: 2 }), true);
});

test('parseFollowup：指令词识别', () => {
  assert.equal(parseFollowup('换一家'), 'change');
  assert.equal(parseFollowup('再便宜点'), 'cheaper');
  assert.equal(parseFollowup('换个附近'), 'nearby');
  assert.equal(parseFollowup('带朋友吃湖北菜'), null);
});
