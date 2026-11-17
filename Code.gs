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

/* =====================================================================
   BOSTON LAND RUSH — THẾ GIỚI + KINH TẾ (dùng chung cho game và máy chủ)
   File này được chép nguyên vào index.html và Code.gs bởi build.py.
   Mọi con số tính tiền đều chạy giống hệt ở hai nơi; máy chủ là nơi quyết định.
   ===================================================================== */
var WORLD = (function () {
  var LAT0 = 42.3601, LON0 = -71.0589, MLAT = 69.0, MLON = 51.1;
  var P = 4.4;                         // bước lưới khu phố (3 ô + đường 1.4)
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rnd(seed) { var s = hash(seed) % 2147483646 + 1; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function miles(lat, lon) { return [(lon - LON0) * MLON, (LAT0 - lat) * MLAT]; }   // x: đông, z: nam (dặm)
  // nén khoảng cách để cả vùng 35 dặm vừa màn hình mà phố trung tâm vẫn rộng
  function comp(p) { var d = Math.sqrt(p[0] * p[0] + p[1] * p[1]); if (!d) return [0, 0]; var f = 6.2 * Math.pow(d, 0.78) / d; return [p[0] * f, p[1] * f]; }
  function world(lat, lon) { return comp(miles(lat, lon)); }

  /* Thị trấn / khu phố. Thuộc tính ẩn (người chơi tự khám phá):
     aff giàu có, stu sinh viên, tour du lịch, off văn phòng, viet cộng đồng Việt, pop dân số gốc (nghìn) */
  var T = [
    ['DT', 'Downtown', 'Downtown', 42.3555, -71.0605, 2, { aff: .7, stu: .3, tour: .9, off: 1, viet: .3, pop: 34 }],
    ['BH', 'Beacon Hill', 'Beacon Hill', 42.3588, -71.0707, 1, { aff: 1, stu: .3, tour: .7, off: .5, viet: .1, pop: 28 }],
    ['NE', 'North End', 'North End', 42.3647, -71.0542, 1, { aff: .6, stu: .3, tour: .9, off: .3, viet: .1, pop: 26 }],
    ['BB', 'Back Bay', 'Back Bay', 42.3503, -71.0810, 2, { aff: 1, stu: .4, tour: .8, off: .8, viet: .1, pop: 32 }],
    ['SP', 'Seaport', 'Seaport', 42.3519, -71.0446, 2, { aff: .9, stu: .2, tour: .6, off: .9, viet: .1, pop: 22, wf: 1 }],
    ['SE', 'South End', 'South End', 42.3388, -71.0765, 1, { aff: .8, stu: .3, tour: .4, off: .4, viet: .2, pop: 30 }],
    ['FW', 'Fenway', 'Fenway', 42.3467, -71.0972, 1, { aff: .5, stu: 1, tour: .7, off: .4, viet: .2, pop: 36 }],
    ['CH', 'Charlestown', 'Charlestown', 42.3782, -71.0602, 1, { aff: .8, stu: .2, tour: .5, off: .3, viet: .1, pop: 20, wf: 1 }],
    ['EB', 'East Boston', 'East Boston', 42.3702, -71.0389, 2, { aff: .3, stu: .2, tour: .5, off: .3, viet: .3, pop: 30, wf: 1, air: 1 }],
    ['DO', 'Dorchester', 'Dorchester', 42.3016, -71.0676, 2, { aff: .3, stu: .2, tour: .1, off: .2, viet: 1, pop: 40 }],
    ['AL', 'Allston', 'Allston', 42.3539, -71.1337, 1, { aff: .3, stu: 1, tour: .2, off: .3, viet: .3, pop: 30 }],
    ['CA', 'Cambridge', 'Cambridge', 42.3736, -71.1097, 3, { aff: .9, stu: 1, tour: .7, off: .9, viet: .2, pop: 38 }],
    ['SO', 'Somerville', 'Somerville', 42.3876, -71.0995, 2, { aff: .6, stu: .7, tour: .3, off: .3, viet: .2, pop: 34 }],
    ['BR', 'Brookline', 'Brookline', 42.3318, -71.1212, 2, { aff: 1, stu: .5, tour: .3, off: .3, viet: .2, pop: 28 }],
    ['ME', 'Medford', 'Medford', 42.4184, -71.1062, 1, { aff: .5, stu: .6, tour: .1, off: .2, viet: .4, pop: 24 }],
    ['MA', 'Malden', 'Malden', 42.4251, -71.0662, 1, { aff: .4, stu: .2, tour: .1, off: .2, viet: .9, pop: 26 }],
    ['RV', 'Revere', 'Revere', 42.4084, -71.0120, 1, { aff: .3, stu: .1, tour: .5, off: .1, viet: .3, pop: 22, wf: 1 }],
    ['NW', 'Newton', 'Newton', 42.3370, -71.2092, 2, { aff: 1, stu: .5, tour: .1, off: .3, viet: .2, pop: 24 }],
    ['WA', 'Waltham', 'Waltham', 42.3765, -71.2356, 1, { aff: .6, stu: .5, tour: .1, off: .9, viet: .2, pop: 22 }],
    ['LX', 'Lexington', 'Lexington', 42.4473, -71.2245, 1, { aff: 1, stu: .2, tour: .5, off: .3, viet: .1, pop: 14 }],
    ['BU', 'Burlington', 'Burlington', 42.5048, -71.1956, 1, { aff: .7, stu: .1, tour: .1, off: 1, viet: .2, pop: 12 }],
    ['WO', 'Woburn', 'Woburn', 42.4793, -71.1523, 1, { aff: .5, stu: .1, tour: .1, off: .6, viet: .2, pop: 16 }],
    ['LY', 'Lynn', 'Lynn', 42.4668, -70.9495, 1, { aff: .3, stu: .1, tour: .2, off: .1, viet: .5, pop: 26, wf: 1 }],
    ['SA', 'Salem', 'Salem', 42.5195, -70.8967, 2, { aff: .5, stu: .4, tour: 1, off: .2, viet: .1, pop: 18, wf: 1 }],
    ['GL', 'Gloucester', 'Gloucester', 42.6159, -70.6620, 1, { aff: .5, stu: .1, tour: .8, off: .1, viet: .1, pop: 12, wf: 1 }],
    ['AN', 'Andover', 'Andover', 42.6583, -71.1368, 1, { aff: 1, stu: .4, tour: .1, off: .4, viet: .1, pop: 12 }],
    ['LA', 'Lawrence', 'Lawrence', 42.7070, -71.1631, 1, { aff: .2, stu: .1, tour: .1, off: .2, viet: .3, pop: 24 }],
    ['LO', 'Lowell', 'Lowell', 42.6334, -71.3162, 2, { aff: .3, stu: .6, tour: .3, off: .3, viet: .8, pop: 28 }],
    ['MB', 'Marlborough', 'Marlborough', 42.3459, -71.5523, 1, { aff: .5, stu: .1, tour: .1, off: .6, viet: .1, pop: 12 }],
    ['FR', 'Framingham', 'Framingham', 42.2793, -71.4162, 2, { aff: .5, stu: .3, tour: .1, off: .5, viet: .2, pop: 20 }],
    ['NA', 'Natick', 'Natick', 42.2834, -71.3495, 1, { aff: .7, stu: .1, tour: .3, off: .3, viet: .1, pop: 14 }],
    ['WE', 'Wellesley', 'Wellesley', 42.2968, -71.2924, 1, { aff: 1, stu: .7, tour: .1, off: .2, viet: .1, pop: 12 }],
    ['ND', 'Needham', 'Needham', 42.2809, -71.2378, 1, { aff: .9, stu: .1, tour: .1, off: .4, viet: .1, pop: 12 }],
    ['DE', 'Dedham', 'Dedham', 42.2418, -71.1662, 1, { aff: .6, stu: .1, tour: .2, off: .3, viet: .1, pop: 12 }],
    ['NO', 'Norwood', 'Norwood', 42.1945, -71.1995, 1, { aff: .5, stu: .1, tour: .1, off: .3, viet: .1, pop: 12 }],
    ['QU', 'Quincy', 'Quincy', 42.2529, -71.0023, 2, { aff: .5, stu: .2, tour: .3, off: .4, viet: .9, pop: 30, wf: 1 }],
    ['BT', 'Braintree', 'Braintree', 42.2079, -71.0040, 1, { aff: .6, stu: .1, tour: .2, off: .3, viet: .4, pop: 14 }],
    ['WY', 'Weymouth', 'Weymouth', 42.2180, -70.9410, 1, { aff: .5, stu: .1, tour: .2, off: .2, viet: .5, pop: 18, wf: 1 }],
    ['SW', 'South Weymouth', 'South Weymouth', 42.1754, -70.9447, 1, { aff: .5, stu: .1, tour: .2, off: .1, viet: .6, pop: 14 }],
    ['HI', 'Hingham', 'Hingham', 42.2418, -70.8898, 1, { aff: 1, stu: .1, tour: .4, off: .2, viet: .1, pop: 10, wf: 1 }],
    ['BK', 'Brockton', 'Brockton', 42.0834, -71.0184, 2, { aff: .3, stu: .1, tour: .1, off: .2, viet: .4, pop: 22 }],
    ['DX', 'Duxbury', 'Duxbury', 42.0418, -70.6723, 1, { aff: .9, stu: .1, tour: .6, off: .1, viet: .1, pop: 8, wf: 1 }]
  ];
  /* Địa danh: mỗi địa danh chiếm nguyên 1 khu phố, mua được */
  var LANDMARKS = [
    ['common', 'BH', 'Boston Common', 'Boston Common', 'park', 2600, 34],
    ['statehouse', 'BH', 'State House', 'State House', 'dome', 3200, 38],
    ['faneuil', 'DT', 'Faneuil Hall', 'Faneuil Hall', 'hall', 3000, 42],
    ['oldnorth', 'NE', 'Nhà thờ Old North', 'Old North Church', 'church', 2200, 30],
    ['pru', 'BB', 'Prudential', 'Prudential Tower', 'pru', 4800, 60],
    ['hancock', 'BB', 'Hancock Tower', 'Hancock Tower', 'glass', 4600, 58],
    ['harvard', 'CA', 'Harvard Yard', 'Harvard Yard', 'campus', 3400, 40],
    ['mit', 'CA', 'MIT Dome', 'MIT Dome', 'mitdome', 3200, 38],
    ['logan', 'EB', 'Sân bay Logan', 'Logan Airport', 'airport', 5600, 70],
    ['witch', 'SA', 'Witch House', 'Witch House', 'witch', 1800, 30],
    ['mills', 'LO', 'Lowell Mills', 'Lowell Mills', 'mills', 1600, 24],
    ['fisher', 'GL', 'Fisherman Memorial', 'Fisherman Memorial', 'statue', 1400, 22],
    ['saigonesee', 'SW', 'Saigonesee Coffee', 'Saigonesee Coffee', 'cafe', 1500, 26]
  ];
  /* Bờ biển (lat, lon): phía đông đường này là Đại Tây Dương / vịnh Boston */
  var COAST = [[42.95, -70.80], [42.70, -70.62], [42.62, -70.60], [42.58, -70.70], [42.52, -70.86], [42.47, -70.92], [42.42, -70.97],
    [42.39, -70.99], [42.375, -71.02], [42.36, -71.04], [42.345, -71.035], [42.32, -71.03], [42.29, -71.03], [42.27, -70.99],
    [42.26, -70.93], [42.27, -70.88], [42.24, -70.80], [42.20, -70.74], [42.12, -70.68], [42.04, -70.66], [41.95, -70.60], [41.80, -70.50]];
  var coastW = COAST.map(function (c) { return world(c[0], c[1]); });
  function coastX(z) {               // x của bờ biển tại toạ độ z (phía đông là nước)
    for (var i = 0; i < coastW.length - 1; i++) {
      var a = coastW[i], b = coastW[i + 1];
      if ((z >= a[1] && z <= b[1]) || (z <= a[1] && z >= b[1])) { var t = (z - a[1]) / ((b[1] - a[1]) || 1); return a[0] + (b[0] - a[0]) * t; }
    }
    return z < coastW[0][1] ? coastW[0][0] : coastW[coastW.length - 1][0];
  }
  function inWater(x, z) { return x > coastX(z) - 0.6; }

  /* ===== Sinh khu phố + lô đất (tất định: ai chạy cũng ra giống hệt) ===== */
  var towns = [], blocks = [], parcels = [], byId = {}, used = {};
  var key = function (i, j) { return i + ',' + j; };
  T.forEach(function (t) {
    var p = world(t[3], t[4]);
    var town = { code: t[0], vi: t[1], en: t[2], x: p[0], z: p[1], a: t[6], blocks: [] };
    towns.push(town);
  });
  var lmByTown = {}; LANDMARKS.forEach(function (l) { (lmByTown[l[1]] = lmByTown[l[1]] || []).push(l); });
  towns.forEach(function (town) {
    var need = T.filter(function (t) { return t[0] === town.code; })[0][5] + (lmByTown[town.code] || []).length;
    var ci = Math.round(town.x / P), cj = Math.round(town.z / P), placed = 0;
    for (var r = 0; r < 8 && placed < need; r++) {
      for (var di = -r; di <= r && placed < need; di++) for (var dj = -r; dj <= r && placed < need; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        var i = ci + di, j = cj + dj, cx = i * P + 1.5, cz = j * P + 1.5;
        if (used[key(i, j)] || inWater(cx, cz) || inWater(cx + 1.5, cz) || inWater(cx, cz + 1.5) || inWater(cx + 1.5, cz + 1.5)) continue;
        used[key(i, j)] = town.code;
        var b = { town: town.code, idx: town.blocks.length, i: i, j: j, x0: i * P, z0: j * P };
        town.blocks.push(b); blocks.push(b); placed++;
      }
    }
    if (town.blocks.length) { town.x = town.blocks[0].x0 + 1.5; town.z = town.blocks[0].z0 + 1.5; }
  });
  function distCenter(x, z) { return Math.sqrt(x * x + z * z); }
  function nearWater(x, z) { return coastX(z) - x < 4.5; }
  var NPC_RES_CORE = ['brownstone', 'brownstone', 'condo', 'triple'], NPC_RES_SUB = ['single', 'single', 'triple', 'single'];
  var NPC_BIZ = ['cafe', 'grocery', 'bakery', 'pho', 'nail', 'gym', 'office', 'seafood'];
  towns.forEach(function (town) {
    var lms = (lmByTown[town.code] || []).slice();
    town.blocks.forEach(function (b, bi) {
      // khu cuối cùng của thị trấn dành cho địa danh (nếu có)
      var lmIndex = bi - (town.blocks.length - lms.length);
      if (lmIndex >= 0) {
        var L = lms[lmIndex];
        var lp = { id: 'LM-' + L[0], town: town.code, block: b, cell: -1, x: b.x0 + 1.5, z: b.z0 + 1.5, w: 3, lm: { key: L[0], vi: L[2], en: L[3], style: L[4], price: L[5], base: L[6] },
          npc: { model: 'landmark', level: 1 }, wf: nearWater(b.x0 + 1.5, b.z0 + 1.5) ? 1 : 0 };
        b.lm = lp; parcels.push(lp); byId[lp.id] = lp; return;
      }
      var core = distCenter(b.x0, b.z0) < 14;
      for (var c = 0; c < 9; c++) {
        var id = town.code + b.idx + '-' + c, r = rnd(id);
        var px = b.x0 + (c % 3) + 0.5, pz = b.z0 + Math.floor(c / 3) + 0.5;
        var emptyP = core ? 0.18 : 0.42, npc = null;
        var roll = r();
        if (roll > emptyP) {
          var isBiz = r() < (core ? 0.35 : 0.22);
          var model = isBiz ? NPC_BIZ[Math.floor(r() * NPC_BIZ.length)] : (core ? NPC_RES_CORE : NPC_RES_SUB)[Math.floor(r() * 4)];
          if (model === 'seafood' && !nearWater(px, pz)) model = 'cafe';
          npc = { model: model, level: 1 + Math.floor(r() * (core ? 3 : 2)) };
        }
        var p = { id: id, town: town.code, block: b, cell: c, x: px, z: pz, w: 1, npc: npc, wf: nearWater(px, pz) ? 1 : 0, seed: r() };
        parcels.push(p); byId[id] = p;
      }
    });
  });
  /* ===== Giai đoạn 2: khu phố phụ lấp đầy quanh mỗi thị trấn =====
     Thêm SAU giai đoạn 1 nên ID và vị trí các lô cũ không đổi. ID dạng <town>F<k>-<ô>. */
  T.forEach(function (t) {
    var town = towns.filter(function (x) { return x.code === t[0]; })[0];
    var extra = Math.round(3 + t[6].pop / 4.5), placed = 0;
    var ci = Math.round(town.x / P - 0.34), cj = Math.round(town.z / P - 0.34);
    for (var r = 1; r < 12 && placed < extra; r++) {
      var ring = [];
      for (var di = -r; di <= r; di++) for (var dj = -r; dj <= r; dj++) if (Math.max(Math.abs(di), Math.abs(dj)) === r) ring.push([di, dj]);
      var rr = rnd(town.code + 'ring' + r);
      ring.sort(function (a, b) { return (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]) || rr() - 0.5; });
      for (var q = 0; q < ring.length && placed < extra; q++) {
        var i = ci + ring[q][0], j = cj + ring[q][1], cx = i * P + 1.5, cz = j * P + 1.5;
        if (used[key(i, j)] || inWater(cx, cz) || inWater(cx + 1.5, cz) || inWater(cx, cz + 1.5) || inWater(cx + 1.5, cz + 1.5)) continue;
        // chỉ đặt sát khu đã có để phố liền mạch
        if (!(used[key(i + 1, j)] || used[key(i - 1, j)] || used[key(i, j + 1)] || used[key(i, j - 1)])) continue;
        used[key(i, j)] = town.code;
        var k = placed, b = { town: town.code, idx: town.blocks.length, i: i, j: j, x0: i * P, z0: j * P, fill: true };
        town.blocks.push(b); blocks.push(b); placed++;
        var core = distCenter(b.x0, b.z0) < 14;
        for (var c = 0; c < 9; c++) {
          var id = town.code + 'F' + k + '-' + c, r2 = rnd(id);
          var px = b.x0 + (c % 3) + 0.5, pz = b.z0 + Math.floor(c / 3) + 0.5, npc = null;
          if (r2() > (core ? 0.14 : 0.28)) {
            var isBiz = r2() < (core ? 0.3 : 0.16);
            var model = isBiz ? NPC_BIZ[Math.floor(r2() * NPC_BIZ.length)] : (core ? NPC_RES_CORE : NPC_RES_SUB)[Math.floor(r2() * 4)];
            if (model === 'seafood' && !nearWater(px, pz)) model = 'bakery';
            npc = { model: model, level: 1 + Math.floor(r2() * (core ? 3 : 2)) };
          }
          var pp = { id: id, town: town.code, block: b, cell: c, x: px, z: pz, w: 1, npc: npc, wf: nearWater(px, pz) ? 1 : 0, seed: r2() };
          parcels.push(pp); byId[id] = pp;
        }
      }
    }
  });
  var townByCode = {}; towns.forEach(function (t) { townByCode[t.code] = t; });
  return { towns: towns, townByCode: townByCode, blocks: blocks, parcels: parcels, byId: byId, coastW: coastW, coastX: coastX, inWater: inWater, world: world, P: P, hash: hash, rnd: rnd };
})();

/* ===== KINH TẾ ===== */
var ECON = (function () {
  var SPEED = 48, DAY_MS = 86400000 / SPEED, CAP_DAYS = 16, MAX_LEVEL = 5;   // 30 phút thật = 1 ngày game; cộng dồn tối đa 16 ngày (8 giờ thật)
  // type: res (cho thuê) / biz (kinh doanh). cost: tiền xây ($K). base: thu nhập gốc/ngày ($K). units: dân (nghìn) mỗi cấp
  var M = {
    single:     { type: 'res', cost: 120, base: 7,  units: .25, icon: '🏠' },
    triple:     { type: 'res', cost: 190, base: 11, units: .5,  icon: '🏘️' },
    brownstone: { type: 'res', cost: 280, base: 15, units: .6,  icon: '🧱' },
    condo:      { type: 'res', cost: 560, base: 30, units: 1.4, icon: '🏢' },
    cafe:       { type: 'biz', cost: 150, base: 9,  units: .05, icon: '☕' },
    pho:        { type: 'biz', cost: 180, base: 11, units: .05, icon: '🍜' },
    bakery:     { type: 'biz', cost: 140, base: 8,  units: .05, icon: '🥖' },
    grocery:    { type: 'biz', cost: 220, base: 13, units: .05, icon: '🛒' },
    nail:       { type: 'biz', cost: 130, base: 8,  units: .05, icon: '💅' },
    gym:        { type: 'biz', cost: 260, base: 14, units: .05, icon: '🏋️' },
    seafood:    { type: 'biz', cost: 240, base: 13, units: .05, icon: '🦞' },
    hotel:      { type: 'biz', cost: 720, base: 38, units: .1,  icon: '🏨' },
    office:     { type: 'biz', cost: 620, base: 32, units: .1,  icon: '🏬' },
    landmark:   { type: 'lm',  cost: 0,   base: 0,  units: 0,   icon: '⭐' }
  };
  var BUILDABLE = ['single', 'triple', 'brownstone', 'condo', 'cafe', 'pho', 'bakery', 'grocery', 'nail', 'gym', 'seafood', 'hotel', 'office'];

  /* tình trạng thế giới từ danh sách lô đã có chủ: owned = [{id, owner, model, level}] */
  function snapshot(owned) {
    var pop = {}, comp = {}, map = {};
    WORLD.towns.forEach(function (t) { pop[t.code] = t.a.pop; });
    owned.forEach(function (o) {
      var p = WORLD.byId[o.id]; if (!p) return; map[o.id] = o;
      var m = M[o.model] || M.single;
      pop[p.town] += m.units * o.level;
      if (m.type === 'biz') { var k = p.town + ':' + o.model; comp[k] = (comp[k] || 0) + 1; }
    });
    return { pop: pop, comp: comp, map: map };
  }
  function densN(town, snap) { return Math.min(2.5, snap.pop[town] / 25); }
  function townGrowth(town, snap) { var t = WORLD.townByCode[town]; return snap.pop[town] / t.a.pop; }

  /* giá mua một lô ($K) — tăng theo mật độ dân của thị trấn */
  function landValue(p, snap) {
    var t = WORLD.townByCode[p.town], d = Math.sqrt(p.x * p.x + p.z * p.z);
    var central = 1.6 / (1 + d / 18) + 0.25;
    var base = 90 + 260 * central * (0.6 + 0.5 * t.a.aff) + (p.wf ? 40 : 0);
    return Math.round(base * (0.85 + 0.35 * townGrowth(p.town, snap)));
  }
  function buildingValue(model, level) { var m = M[model]; return m && m.cost ? Math.round(m.cost * 0.8 * (1 + 0.7 * (level - 1))) : 0; }
  function price(p, snap) {
    if (p.lm) return Math.round(p.lm.price * (0.9 + 0.2 * townGrowth(p.town, snap)));
    return landValue(p, snap) + (p.npc ? buildingValue(p.npc.model, p.npc.level) : 0);
  }
  function upgradeCost(model, level, p) {
    if (model === 'landmark') return Math.round(p.lm.price * 0.25 * level);
    return Math.round(M[model].cost * 0.9 * level);
  }

  /* THU NHẬP/NGÀY ($K) — công thức ẩn, người chơi tự khám phá */
  function income(o, snap) {
    var p = WORLD.byId[o.id]; if (!p) return 0;
    var t = WORLD.townByCode[p.town], a = t.a, dn = densN(p.town, snap), lvl = 1 + 0.6 * (o.level - 1);
    if (o.model === 'landmark') return Math.round(p.lm.base * (0.8 + a.tour * 0.6 + dn * 0.15) * lvl * 10) / 10;
    var m = M[o.model]; if (!m || !m.base) return 0;
    var f = 1, wf = p.wf ? 1 : 0, air = a.air ? 1 : 0;
    switch (o.model) {
      case 'single': case 'triple': case 'brownstone': case 'condo':
        f = (0.55 + 0.7 * a.aff) * (0.75 + 0.25 * dn) + (o.model === 'condo' ? 0.3 * a.off : 0) + 0.15 * a.stu; break;
      case 'cafe':    f = 0.45 + 0.35 * dn + 0.6 * a.stu + 0.4 * a.off + 0.2 * a.tour; break;
      case 'pho':     f = 0.45 + 0.3 * dn + 1.0 * a.viet + 0.25 * a.tour + 0.2 * a.stu; break;
      case 'bakery':  f = 0.55 + 0.4 * dn + 0.45 * a.aff + 0.2 * a.viet; break;
      case 'grocery': f = 0.35 + 0.75 * dn + 0.2 * a.viet; break;
      case 'nail':    f = 0.45 + 0.6 * a.aff + 0.5 * a.viet + 0.15 * dn; break;
      case 'gym':     f = 0.35 + 0.6 * a.stu + 0.5 * a.off + 0.25 * dn; break;
      case 'seafood': f = 0.35 + 0.9 * wf + 0.7 * a.tour; break;
      case 'hotel':   f = 0.25 + 1.0 * a.tour + 0.6 * air + 0.3 * a.off; break;
      case 'office':  f = 0.25 + 1.1 * a.off + 0.15 * dn; break;
    }
    if (m.type === 'biz') { var n = snap.comp[p.town + ':' + o.model] || 1; f = f / (1 + 0.18 * (n - 1)); }   // cạnh tranh cùng loại
    var jitter = 0.9 + 0.2 * (p.seed || 0.5);                                                              // vị trí từng lô hơi khác nhau
    return Math.round(m.base * f * jitter * lvl * 10) / 10;
  }
  function pending(o, snap, now) {
    var days = Math.min(CAP_DAYS, Math.max(0, (now - o.collectedAt) / DAY_MS));
    return income(o, snap) * days;
  }
  return { SPEED: SPEED, DAY_MS: DAY_MS, CAP_DAYS: CAP_DAYS, MAX_LEVEL: MAX_LEVEL, M: M, BUILDABLE: BUILDABLE,
    snapshot: snapshot, densN: densN, price: price, landValue: landValue, upgradeCost: upgradeCost, income: income, pending: pending };
})();


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
