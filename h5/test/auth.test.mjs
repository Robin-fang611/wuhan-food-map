// 账号体系核心测试（无 DOM，可在 node 直接跑，供自动开发循环做验收）。
// 覆盖：输入校验 / 脱敏 / 注册 / 登录 / 登出 / 收藏 / anon 合并 / Bff 预留 / activeUserId。
const mem = new Map();
// 确定性注入 localStorage（用 defineProperty，避免与运行环境全局冲突）。
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k)
  }
});

const {
  LocalAuthProvider, BffAuthProvider, validateNickname, validatePhone, validateEmail,
  maskContact, auth, activeUserId
} = await import('../src/core/auth.js');
const { DEMO_USER } = await import('../src/core/store.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const reset = () => mem.clear();

// —— 输入校验 ——
ok(validateNickname('').ok === false, '空昵称被拒');
ok(validateNickname('   ').ok === false, '纯空白昵称被拒');
ok(validateNickname('阿味').ok === true, '正常昵称通过');
ok(validateNickname('一'.repeat(21)).ok === false, '超长昵称被拒(>20)');
ok(validatePhone('').ok === false, '空手机被拒');
ok(validatePhone('12345').ok === false, '短手机被拒');
ok(validatePhone('13800001111').ok === true, '正常手机通过');
ok(validatePhone('23800001111').ok === false, '非 1[3-9] 手机被拒');
ok(validateEmail('a@b').ok === false, '非法邮箱被拒');
ok(validateEmail('robin@manyouwei.com').ok === true, '正常邮箱通过');

// —— 脱敏 ——
ok(maskContact('13800001111') === '138****1111', '手机号脱敏');
ok(maskContact('robin@example.com') === 'ro***@example.com', '邮箱脱敏');
ok(maskContact('') === '', '空联系脱敏为空');

// —— LocalAuthProvider：注册 / 登录 / 登出 / 收藏 ——
reset();
const p = new LocalAuthProvider();
ok((await p.getSession()) === null, '初始无会话');

const reg = await p.register({ nickname: '阿味', phone: '13800001111' });
ok(reg.ok === true, '注册成功');
ok(!!reg.user.id && reg.user.nickname === '阿味', '返回用户含 id 与昵称');
ok(reg.user.phone === '13800001111', '保存手机号');
ok(reg.user.password === undefined, '不存储密码字段（安全）');
ok((await p.getSession()) !== null, '注册后自动登录(有会话)');

const reg2 = await p.register({ nickname: '重复' });
ok(reg2.ok === true, '再次注册复用既有会话(幂等登录)');

const login = await p.loginWithPhoneEmail({ email: 'robin@example.com' });
ok(login.ok === true, '手机/邮箱登录成功(复用会话)');

await p.logout();
ok((await p.getSession()) === null, '登出后无会话');

// —— 收藏：anon 合并到账号 ——
reset();
const p2 = new LocalAuthProvider();
ok((await p2.isFavorite('m1')) === false, '初始未收藏');
await p2.addFavorite('m1');
ok((await p2.isFavorite('m1')) === true, 'anon 收藏成功');
ok((await p2.getFavorites()).includes('m1'), 'anon 收藏在列表');
await p2.addFavorite('m1'); // 重复添加幂等
ok((await p2.getFavorites()).filter((x) => x === 'm1').length === 1, '重复收藏幂等');
await p2.removeFavorite('m1');
ok((await p2.isFavorite('m1')) === false, '取消收藏成功');

// 登录后合并 anon 收藏
reset();
const p3 = new LocalAuthProvider();
await p3.addFavorite('m_anon');
const r3 = await p3.register({ nickname: '合并测试', phone: '13900002222' });
const favs = await p3.getFavorites();
ok(favs.includes('m_anon'), '登录后 anon 收藏已合并到账号');
ok((await p3.isFavorite('m_anon')) === true, '合并后判定为已收藏');

// —— BffAuthProvider 预留（M13）——
const bff = new BffAuthProvider({ fake: true });
let threw = false;
try { await bff.loginWithWechat(); } catch (e) { threw = /M13 BFF/.test(e.message); }
ok(threw, 'Bff 微信登录预留抛错(需 M13)');
threw = false;
try { await bff.register({ nickname: 'x' }); } catch (e) { threw = /M13 BFF/.test(e.message); }
ok(threw, 'Bff 注册预留抛错(需 M13)');

// —— activeUserId：未登录回退 DEMO_USER，登录后用会话 id ——
reset();
ok(activeUserId() === DEMO_USER, '未登录 activeUserId=DEMO_USER');
await auth.register({ nickname: '活跃用户', phone: '13700003333' });
ok(activeUserId() === auth.currentUserId(), '登录后 activeUserId=会话id');
await auth.logout();

console.log(`\n账号体系测试： ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
