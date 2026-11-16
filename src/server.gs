/**
 * Boston Land Rush — máy chủ Google Apps Script (V6: Greater Boston)
 * Dán TOÀN BỘ file này vào Extensions → Apps Script, Save, rồi
 * Deploy → Manage deployments → ✏️ → Version: New version → Deploy (link /exec giữ nguyên).
 *
 * Sheet "Users":   username | passHash | token | money | color | createdAt
 * Sheet "Parcels": id | owner | model | level | paid | boughtAt | collectedAt | updatedAt
 * Lần chạy đầu: sheet "Lots" cũ (bản 9x9) được hoàn tiền cho chủ rồi đổi tên thành "Lots_old".
 * Thời gian, giá, thu nhập đều do máy chủ tính — người chơi không gửi thời gian hay giá lên.
 */

/*__SHARED__*/

const START_MONEY = 1500;
const COLORS = ['#e94f37', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#0ea5e9', '#84cc16', '#d946ef', '#64748b'];

function doGet(e) { return out_(handle_((e && e.parameter) || {})); }
function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (_) {}
  return out_(handle_(p));
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); s.appendRow(headers); s.setFrozenRows(1); }
  return s;
}
function usersSheet_() { return sheet_('Users', ['username', 'passHash', 'token', 'money', 'color', 'createdAt']); }
function parcelsSheet_() { return sheet_('Parcels', ['id', 'owner', 'model', 'level', 'paid', 'boughtAt', 'collectedAt', 'updatedAt']); }
function rows_(s) { const v = s.getDataRange().getValues(); v.shift(); return v; }
function hash_(str) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8)); }

function gameStart_() {
  const props = PropertiesService.getScriptProperties();
  let v = Number(props.getProperty('GAME_START'));
  if (!v) { v = Date.now(); props.setProperty('GAME_START', String(v)); }
  return v;
}

/* bản 9x9 cũ → hoàn tiền mua lô cho chủ, cất sheet cũ */
function migrate_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const old = ss.getSheetByName('Lots');
  if (!old) return;
  const us = usersSheet_(), users = rows_(us);
  rows_(old).forEach(r => {
    const i = users.findIndex(u => String(u[0]) === String(r[4]));
    if (i >= 0) { users[i][3] = Number(users[i][3]) + Number(r[5] || 0); us.getRange(i + 2, 4).setValue(users[i][3]); }
  });
  old.setName('Lots_old');
  SpreadsheetApp.flush();
}

function owned_() {
  return rows_(parcelsSheet_()).map((r, i) => ({
    row: i + 2, id: String(r[0]), owner: String(r[1]), model: String(r[2]), level: Number(r[3]) || 0,
    paid: Number(r[4]) || 0, boughtAt: Number(r[5]) || 0, collectedAt: Number(r[6]) || Number(r[5]) || 0
  }));
}
function state_() {
  const users = rows_(usersSheet_()).map(r => ({ username: String(r[0]), money: Number(r[3]), color: String(r[4]) }));
  const parcels = owned_().map(o => ({ id: o.id, owner: o.owner, model: o.model, level: o.level, paid: o.paid, boughtAt: o.boughtAt, collectedAt: o.collectedAt }));
  return { ok: true, v: 6, users: users, parcels: parcels, serverTime: Date.now(), gameStart: gameStart_(), speed: ECON.SPEED };
}

function handle_(p) {
  try {
    // đọc trạng thái không cần khóa (12 người chơi cùng hỏi liên tục)
    if (p.action === 'state' && !SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Lots')) return state_();
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      migrate_();
      if (p.action === 'state') return state_();
      if (p.action === 'register') return register_(p);
      if (p.action === 'login') return login_(p);
      if (p.action === 'buy') return buy_(p);
      if (p.action === 'build') return build_(p);
      if (p.action === 'upgrade') return upgrade_(p);
      if (p.action === 'collect') return collect_(p);
      return { ok: false, code: 'BAD_CMD', error: 'Lệnh không hợp lệ' };
    } finally { lock.releaseLock(); }
  } catch (err) {
    return { ok: false, code: 'SERVER', error: 'Lỗi máy chủ: ' + err };
  }
}

function cleanName_(n) { return String(n || '').trim().replace(/\s+/g, ' '); }
function register_(p) {
  const name = cleanName_(p.username), pass = String(p.password || '');
  if (name.length < 2 || name.length > 16) return { ok: false, code: 'NAME_LEN', error: 'Tên phải dài 2–16 ký tự' };
  if (pass.length < 4) return { ok: false, code: 'PASS_LEN', error: 'Mật khẩu ít nhất 4 ký tự' };
  const s = usersSheet_(), all = rows_(s);
  if (all.some(r => String(r[0]).toLowerCase() === name.toLowerCase())) return { ok: false, code: 'NAME_TAKEN', error: 'Tên này đã có người dùng' };
  const token = Utilities.getUuid();
  s.appendRow([name, hash_(name.toLowerCase() + ':' + pass), token, START_MONEY, COLORS[all.length % COLORS.length], Date.now()]);
  SpreadsheetApp.flush();
  const st = state_(); st.me = { username: name, token: token }; return st;
}
function login_(p) {
  const name = cleanName_(p.username), s = usersSheet_(), all = rows_(s);
  const i = all.findIndex(r => String(r[0]).toLowerCase() === name.toLowerCase());
  if (i < 0) return { ok: false, code: 'NO_USER', error: 'Không tìm thấy tài khoản' };
  if (all[i][1] !== hash_(name.toLowerCase() + ':' + String(p.password || ''))) return { ok: false, code: 'BAD_PASS', error: 'Sai mật khẩu' };
  let token = String(all[i][2] || '');
  if (!token) { token = Utilities.getUuid(); s.getRange(i + 2, 3).setValue(token); }
  const st = state_(); st.me = { username: String(all[i][0]), token: token }; return st;
}

/* xác thực + đọc tiền */
function auth_(p) {
  const us = usersSheet_(), users = rows_(us);
  const ui = users.findIndex(r => String(r[0]) === String(p.username) && String(r[2]) === String(p.token));
  if (ui < 0) return null;
  return { us: us, row: ui + 2, name: String(users[ui][0]), money: Number(users[ui][3]) };
}
function fail_(code, extra) { const st = state_(); st.ok = false; st.code = code; Object.assign(st, extra || {}); return st; }
function setMoney_(u, v) { u.us.getRange(u.row, 4).setValue(v); u.money = v; }

/* chốt tiền đang chờ của 1 lô trước khi đổi công trình (để không tính lùi với mức thu nhập mới) */
function settle_(o, snap, now) {
  return Math.floor(ECON.pending(o, snap, now));
}

function buy_(p) {
  const u = auth_(p); if (!u) return { ok: false, code: 'AUTH', error: 'Phiên đăng nhập hết hạn' };
  const parcel = WORLD.byId[String(p.id)]; if (!parcel) return fail_('NO_PARCEL');
  const owned = owned_(), have = owned.find(o => o.id === parcel.id);
  if (have) return fail_('TAKEN', { owner: have.owner });
  const snap = ECON.snapshot(owned), price = ECON.price(parcel, snap);
  if (u.money < price) return fail_('MONEY', { price: price });
  const now = Date.now();
  const model = parcel.lm ? 'landmark' : parcel.npc ? parcel.npc.model : 'empty';
  const level = parcel.lm ? 1 : parcel.npc ? parcel.npc.level : 0;
  parcelsSheet_().appendRow([parcel.id, u.name, model, level, price, now, now, now]);
  setMoney_(u, u.money - price);
  SpreadsheetApp.flush();
  const st = state_(); st.bought = { id: parcel.id, price: price }; return st;
}

function build_(p) {
  const u = auth_(p); if (!u) return { ok: false, code: 'AUTH', error: 'Phiên đăng nhập hết hạn' };
  const owned = owned_(), o = owned.find(x => x.id === String(p.id));
  if (!o || o.owner !== u.name) return fail_('NOT_OWNER');
  if (o.model === 'landmark') return fail_('LANDMARK');
  if (ECON.BUILDABLE.indexOf(p.model) < 0) return fail_('BAD_MODEL');
  if (o.model === p.model) return fail_('SAME_MODEL');
  const cost = ECON.M[p.model].cost;
  const snap = ECON.snapshot(owned), now = Date.now(), earned = settle_(o, snap, now);
  if (u.money + earned < cost) return fail_('MONEY', { price: cost });
  const ps = parcelsSheet_();
  ps.getRange(o.row, 3, 1, 2).setValues([[p.model, 1]]);
  ps.getRange(o.row, 5).setValue(o.paid + cost);
  ps.getRange(o.row, 7, 1, 2).setValues([[now, now]]);
  setMoney_(u, u.money + earned - cost);
  SpreadsheetApp.flush();
  const st = state_(); st.built = { id: o.id, model: p.model, cost: cost, earned: earned }; return st;
}

function upgrade_(p) {
  const u = auth_(p); if (!u) return { ok: false, code: 'AUTH', error: 'Phiên đăng nhập hết hạn' };
  const owned = owned_(), o = owned.find(x => x.id === String(p.id));
  if (!o || o.owner !== u.name) return fail_('NOT_OWNER');
  if (o.model === 'empty') return fail_('EMPTY');
  if (o.level >= ECON.MAX_LEVEL) return fail_('MAX_LEVEL');
  const parcel = WORLD.byId[o.id], cost = ECON.upgradeCost(o.model, o.level, parcel);
  const snap = ECON.snapshot(owned), now = Date.now(), earned = settle_(o, snap, now);
  if (u.money + earned < cost) return fail_('MONEY', { price: cost });
  const ps = parcelsSheet_();
  ps.getRange(o.row, 4).setValue(o.level + 1);
  ps.getRange(o.row, 5).setValue(o.paid + cost);
  ps.getRange(o.row, 7, 1, 2).setValues([[now, now]]);
  setMoney_(u, u.money + earned - cost);
  SpreadsheetApp.flush();
  const st = state_(); st.upgraded = { id: o.id, level: o.level + 1, cost: cost, earned: earned }; return st;
}

function collect_(p) {
  const u = auth_(p); if (!u) return { ok: false, code: 'AUTH', error: 'Phiên đăng nhập hết hạn' };
  const owned = owned_(), snap = ECON.snapshot(owned), now = Date.now(), ps = parcelsSheet_();
  let total = 0;
  owned.forEach(o => {
    if (o.owner !== u.name) return;
    total += ECON.pending(o, snap, now);
    ps.getRange(o.row, 7).setValue(now);
  });
  const amount = Math.floor(total);
  setMoney_(u, u.money + amount);
  SpreadsheetApp.flush();
  const st = state_(); st.collected = amount; return st;
}
