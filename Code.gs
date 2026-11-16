/**
 * Boston Land Rush (Lô Đất Vàng) — máy chủ Google Apps Script / Google Apps Script server
 * Dán toàn bộ file này vào Extensions → Apps Script của Google Sheet,
 * rồi Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 *
 * Sheet "Users": username | passHash | token | money | color | createdAt
 * Sheet "Lots":  id | x | y | dir | owner | price | boughtAt | kind
 * (Hai sheet tự tạo ở lần gọi đầu tiên.)
 */

const N = 9;               // bản đồ 9x9
const START_MONEY = 1500;  // tiền khởi điểm (triệu)
const BUILD = { house: 50, shop: 120, tower: 250 }; // chi phí xây: nhà phố, mặt bằng, cao ốc ($K)

// ===== Thời gian game: do máy chủ quyết định, mọi người chơi giống nhau =====
const SPEED = 24;                       // 1 giờ thật = 1 ngày trong game
const DAY_MS = 86400000 / SPEED;        // số ms thật của 1 ngày game
const CAP_DAYS = 12;                    // tiền chưa thu chỉ cộng dồn tối đa 12 ngày game
const RATE = { house: 10, shop: 16, tower: 28 }; // thu nhập cơ bản $K / ngày game

function gameStart_() {
  const props = PropertiesService.getScriptProperties();
  let v = Number(props.getProperty('GAME_START'));
  if (!v) { v = Date.now(); props.setProperty('GAME_START', String(v)); }
  return v;
}

/* Thu nhập 1 lô / ngày game, có cộng hiệu ứng láng giềng (lô chạm cạnh, của ai cũng tính) */
function lotCells_(l) { return cells_(l.x, l.y, l.dir); }
function neighbors_(l, lots) {
  const mine = {}; lotCells_(l).forEach(c => mine[c[0] + ',' + c[1]] = 1);
  return lots.filter(o => o.id !== l.id && lotCells_(o).some(c =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(d => mine[(c[0] + d[0]) + ',' + (c[1] + d[1])])));
}
function lotRate_(l, lots) {
  const nb = neighbors_(l, lots), count = k => nb.filter(o => o.kind === k).length;
  const kind = RATE[l.kind] ? l.kind : 'house';
  if (kind === 'shop') return RATE.shop + 4 * Math.min(4, count('house'));
  if (kind === 'tower') return RATE.tower + 6 * Math.min(3, count('tower'));
  return RATE.house + 2 * Math.min(3, count('shop'));
}
const COLORS = ['#e94f37', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];

function doGet(e) { return out_(handle_((e && e.parameter) || {})); }
function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (_) {}
  return out_(handle_(p));
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); s.appendRow(headers); s.setFrozenRows(1); }
  return s;
}
function usersSheet_() { return sheet_('Users', ['username', 'passHash', 'token', 'money', 'color', 'createdAt']); }
function lotsSheet_() {
  const s = sheet_('Lots', ['id', 'x', 'y', 'dir', 'owner', 'price', 'boughtAt', 'kind', 'collectedAt']);
  if (s.getRange(1, 9).getValue() !== 'collectedAt') s.getRange(1, 8, 1, 2).setValues([['kind', 'collectedAt']]);
  return s;
}
function rows_(s) { const v = s.getDataRange().getValues(); v.shift(); return v; }

function hash_(str) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8));
}
function cellPrice_(x, y) { return 100 + 50 * (4 - Math.max(Math.abs(x - 4), Math.abs(y - 4))); }
function cells_(x, y, dir) { return dir === 'v' ? [[x, y], [x, y + 1]] : [[x, y], [x + 1, y]]; }

function handle_(p) {
  try {
    if (p.action === 'state') return state_();
    // Mọi lệnh ghi đều đi qua khóa: hai người bấm mua cùng lúc thì xử lý lần lượt.
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      if (p.action === 'register') return register_(p);
      if (p.action === 'login') return login_(p);
      if (p.action === 'buy') return buy_(p);
      if (p.action === 'collect') return collect_(p);
      return { ok: false, code: 'BAD_CMD', error: 'Lệnh không hợp lệ' };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return { ok: false, code: 'SERVER', error: 'Lỗi máy chủ: ' + err };
  }
}

function state_() {
  const users = rows_(usersSheet_()).map(r => ({ username: String(r[0]), money: Number(r[3]), color: String(r[4]) }));
  const lots = rows_(lotsSheet_()).map(r => ({
    id: String(r[0]), x: Number(r[1]), y: Number(r[2]), dir: String(r[3]),
    owner: String(r[4]), price: Number(r[5]), boughtAt: Number(r[6]), kind: String(r[7] || 'house'),
    collectedAt: Number(r[8]) || Number(r[6])
  }));
  return { ok: true, users: users, lots: lots, serverTime: Date.now(), gameStart: gameStart_(), speed: SPEED };
}

function cleanName_(n) { return String(n || '').trim().replace(/\s+/g, ' '); }

function register_(p) {
  const name = cleanName_(p.username);
  const pass = String(p.password || '');
  if (name.length < 2 || name.length > 16) return { ok: false, code: 'NAME_LEN', error: 'Tên phải dài 2–16 ký tự' };
  if (pass.length < 4) return { ok: false, code: 'PASS_LEN', error: 'Mật khẩu ít nhất 4 ký tự' };
  const s = usersSheet_();
  const all = rows_(s);
  if (all.some(r => String(r[0]).toLowerCase() === name.toLowerCase())) return { ok: false, code: 'NAME_TAKEN', error: 'Tên này đã có người dùng' };
  const token = Utilities.getUuid();
  const color = COLORS[all.length % COLORS.length];
  s.appendRow([name, hash_(name.toLowerCase() + ':' + pass), token, START_MONEY, color, Date.now()]);
  SpreadsheetApp.flush();
  const st = state_();
  st.me = { username: name, token: token };
  return st;
}

function login_(p) {
  const name = cleanName_(p.username);
  const s = usersSheet_();
  const all = rows_(s);
  const i = all.findIndex(r => String(r[0]).toLowerCase() === name.toLowerCase());
  if (i < 0) return { ok: false, code: 'NO_USER', error: 'Không tìm thấy tài khoản' };
  if (all[i][1] !== hash_(name.toLowerCase() + ':' + String(p.password || ''))) return { ok: false, code: 'BAD_PASS', error: 'Sai mật khẩu' };
  let token = String(all[i][2] || '');
  if (!token) { token = Utilities.getUuid(); s.getRange(i + 2, 3).setValue(token); }
  const st = state_();
  st.me = { username: String(all[i][0]), token: token };
  return st;
}

function buy_(p) {
  const us = usersSheet_();
  const users = rows_(us);
  const ui = users.findIndex(r => String(r[0]) === String(p.username) && String(r[2]) === String(p.token));
  if (ui < 0) return { ok: false, code: 'AUTH', error: 'Phiên đăng nhập hết hạn, hãy đăng nhập lại' };

  const x = Number(p.x), y = Number(p.y), dir = p.dir === 'v' ? 'v' : 'h';
  const kind = BUILD[p.kind] ? p.kind : 'house';
  const cs = cells_(x, y, dir);
  if (!cs.every(c => Number.isInteger(c[0]) && Number.isInteger(c[1]) && c[0] >= 0 && c[1] >= 0 && c[0] < N && c[1] < N)) {
    return { ok: false, code: 'OUT', error: 'Lô nằm ngoài bản đồ' };
  }

  // lô không được vắt qua đường: 2 ô phải cùng một khu phố 3x3
  if (Math.floor(cs[0][0] / 3) !== Math.floor(cs[1][0] / 3) || Math.floor(cs[0][1] / 3) !== Math.floor(cs[1][1] / 3)) {
    return { ok: false, code: 'ROAD', error: 'Lô không được nằm vắt qua đường' };
  }

  const ls = lotsSheet_();
  const taken = {};
  rows_(ls).forEach(r => cells_(Number(r[1]), Number(r[2]), String(r[3])).forEach(c => { taken[c[0] + ',' + c[1]] = String(r[4]); }));
  for (const c of cs) {
    const owner = taken[c[0] + ',' + c[1]];
    if (owner) {
      const st = state_();
      st.ok = false; st.code = 'TAKEN'; st.owner = owner;
      st.error = 'Lô đã có chủ — ' + owner + ' mua trước rồi';
      return st;
    }
  }

  const price = cs.reduce((s, c) => s + cellPrice_(c[0], c[1]), 0) + BUILD[kind];
  const money = Number(users[ui][3]);
  if (money < price) { const st = state_(); st.ok = false; st.code = 'MONEY'; st.price = price; st.error = 'Không đủ tiền (cần $' + price + 'K)'; return st; }

  ls.appendRow([Utilities.getUuid().slice(0, 8), x, y, dir, String(users[ui][0]), price, Date.now(), kind, Date.now()]);
  us.getRange(ui + 2, 4).setValue(money - price);
  SpreadsheetApp.flush();
  const st = state_();
  st.bought = { x: x, y: y, dir: dir, price: price, kind: kind };
  return st;
}

/* Thu tiền: máy chủ tự tính theo giờ máy chủ, người chơi không gửi thời gian lên */
function collect_(p) {
  const us = usersSheet_();
  const users = rows_(us);
  const ui = users.findIndex(r => String(r[0]) === String(p.username) && String(r[2]) === String(p.token));
  if (ui < 0) return { ok: false, code: 'AUTH', error: 'Phiên đăng nhập hết hạn, hãy đăng nhập lại' };
  const me = String(users[ui][0]);
  const ls = lotsSheet_();
  const raw = rows_(ls);
  const lots = raw.map(r => ({ id: String(r[0]), x: Number(r[1]), y: Number(r[2]), dir: String(r[3]), owner: String(r[4]), kind: String(r[7] || 'house'), collectedAt: Number(r[8]) || Number(r[6]) }));
  const now = Date.now();
  let total = 0;
  lots.forEach((l, i) => {
    if (l.owner !== me) return;
    const days = Math.min(CAP_DAYS, Math.max(0, (now - l.collectedAt) / DAY_MS));
    total += lotRate_(l, lots) * days;
    ls.getRange(i + 2, 9).setValue(now);
  });
  const amount = Math.floor(total);
  us.getRange(ui + 2, 4).setValue(Number(users[ui][3]) + amount);
  SpreadsheetApp.flush();
  const st = state_();
  st.collected = amount;
  return st;
}
