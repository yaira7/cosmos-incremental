// ===== バランス調整用の定数（ここをいじって遊び心地を変える） =====
// base = 最初の1個の値段、r = 1個買うごとに値段が何倍になるか、prod = 1個が毎秒生む量
const TIERS = [
  { name: "岩",   makes: "塵",   base: 10,   r: 1.15, prod: 1 },
  { name: "惑星", makes: "岩",   base: 200,  r: 1.20, prod: 0.4 },
  { name: "恒星", makes: "惑星", base: 5000, r: 1.25, prod: 0.2 },
  { name: "銀河", makes: "恒星", base: 2e5,  r: 1.30, prod: 0.1 },
];
// 倍率UPの節目：最初は10個。そこから間隔が25, 50, 75…と広がる（10, 35, 85, 160, 260…）
const FIRST_MILESTONE = 10;
const MILESTONE_STEP = 25;
const MILESTONE_MULT = 2;
const SN_REQ_BASE = 500;      // 超新星に必要な恒星の量（法則カードで変わる）

const memMultAt = lv => 1 + 0.5 * lv;            // 恒星の記憶：×1 → ×1.5 → ×2 → ×2.5
const COMPRESS_RATE = 0.8;                       // 圧縮1レベルごとに、値上がり幅がこの割合になる（−20%ずつ）
const AFTERGLOW_TIME = 60;                       // 残光が続く秒数
const afterglowPeakAt = lv => 1 + 4 * lv;         // 超新星直後の倍率（Lv1で×5、Lv2で×9…）
// 自動購入は「今の塵のこの割合以下」の買い物しかしない（上の段を買う分を残すため）
const AUTO_BUDGET = 0.1;

// ===== ブラックホールと降着円盤 =====
const BH_REQ_BASE = 100;                              // この周期で手に入れた星屑がこれだけあると起こせる（法則カードで変わる）
// 質量は「星屑が2倍になるごとに+1」：100で2、200で3、400で4、800で5…
// 超新星層が完成して星屑の増え方が一定になると、+1までの時間がどんどん倍になるので、
// 「どこかで止めてブラックホールを起こした方が得」になる
const MASS_BASE = 25;
const massBase = () => MASS_BASE * bhReqMult();
const massGainFor = sd => sd >= bhReq() ? Math.floor(Math.log2(sd / massBase())) + lawMassBonus() : 0;
const massNextAt = g => massBase() * Math.pow(2, g + 1 - lawMassBonus()); // 質量が g+1 になる星屑の量
const RINGS = [
  { name: "内側の円盤", period: 10,  per: 0.1,  target: "塵の生産" },
  { name: "中間の円盤", period: 45,  per: 0.05, target: "惑星・恒星・銀河の生産" },
  { name: "外側の円盤", period: 180, per: 0.1,  target: "超新星で手に入る星屑" },
];
const RING_SPEEDUP = 1.25;                            // 加速1レベルごとに、1周の時間がこの分の1になる
// 質量ショップ（cost(lv)、max、needs = 先に必要な強化）
const MUPGRADES = [
  { id: "spd0",     name: "内側の円盤を加速", desc: "内側の円盤が速く回る", max: 10,
    cost: lv => Math.pow(2, lv),     effect: lv => `1周 ${ringPeriodAt(0, lv).toFixed(1)}秒` },
  { id: "ring1",    name: "中間の円盤",       desc: `2つ目の円盤ができる。1周（${RINGS[1].period}秒）ごとに、${RINGS[1].target}が +${RINGS[1].per}倍`, max: 1,
    cost: () => 2,                   effect: lv => lv ? "あり" : "なし" },
  { id: "spd1",     name: "中間の円盤を加速", desc: "中間の円盤が速く回る", max: 10, needs: "ring1",
    cost: lv => 2 * Math.pow(2, lv), effect: lv => `1周 ${ringPeriodAt(1, lv).toFixed(1)}秒` },
  { id: "ring2",    name: "外側の円盤",       desc: `3つ目の円盤ができる。1周（${RINGS[2].period}秒）ごとに、${RINGS[2].target}が +${RINGS[2].per}倍`, max: 1, needs: "ring1",
    cost: () => 4,                   effect: lv => lv ? "あり" : "なし" },
  { id: "spd2",     name: "外側の円盤を加速", desc: "外側の円盤が速く回る", max: 10, needs: "ring2",
    cost: lv => 3 * Math.pow(2, lv), effect: lv => `1周 ${ringPeriodAt(2, lv).toFixed(1)}秒` },
  { id: "autoNova", name: "自動超新星",       desc: "恒星が決めた段階に届いたら、自動で超新星を起こす", max: 1,
    cost: () => 2,                   effect: lv => lv ? "あり" : "なし" },
  { id: "keepAuto", name: "自動購入の記憶",   desc: "ブラックホールを起こしても、星屑ショップの自動購入が残る", max: 1,
    cost: () => 2,                   effect: lv => lv ? "残る" : "残らない" },
];
const freshMup = () => Object.fromEntries(MUPGRADES.map(u => [u.id, 0]));
const mlvl = id => (S.mup && S.mup[id]) || 0;
const ringPeriodAt = (i, lv) => RINGS[i].period / Math.pow(RING_SPEEDUP, lv);
const ringPeriod = i => ringPeriodAt(i, mlvl("spd" + i)) / lawSpin();
const ringActive = i => S.blackholes > 0 && (i === 0 || mlvl("ring" + i) > 0);
const ringLaps = i => Math.floor((S.rings[i] || 0) + 1e-9);
const ringMult = i => ringActive(i) ? 1 + RINGS[i].per * ringLaps(i) : 1;

// ===== ビッグクランチと法則カード =====
const CRUNCH_REQ = 1e50;         // 1回の周回で塵がこれだけ貯まったらビッグクランチを起こせる
// もらえる宇宙の種：1e50で3つ、そこから塵が100億倍（e+10）になるごとに+1
const seedGainFor = peak => peak >= CRUNCH_REQ ? 3 + Math.floor((Math.log10(peak) - 50) / 10) : 0;
const GACHA_COST = 1;            // ガチャ1回に使う宇宙の種
const PITY = 10;                 // この回数のうちにエピックが出なければ、10回目はエピック確定
const LAW_MAX = 5;               // カードの最大レベル（ダブるとレベルが上がる）
const RARITY = {
  c: { name: "コモン",   weight: 65 },
  r: { name: "レア",     weight: 27 },
  e: { name: "エピック", weight: 8 },
};
// good / bad は説明文。効果そのものは下の law〜 関数で計算する
const LAWS = [
  { id: "dense",  rar: "c", name: "濃い塵",     good: lv => `塵の生産 ×${1 + lv}` },
  { id: "spin",   rar: "c", name: "回る円盤",   good: lv => `円盤の回転 ×${(1 + 0.2 * lv).toFixed(1)}` },
  { id: "meteor", rar: "c", name: "流れ星の夜", good: lv => `流れ星が出る間隔 ×${Math.pow(0.85, lv).toFixed(2)}` },
  { id: "cheap",  rar: "c", name: "安い星",     good: lv => `値上がり幅 −${5 * lv}%` },
  { id: "heavy",  rar: "r", name: "重い宇宙",   good: lv => `節目の倍率 ×${(1.2 + 0.1 * lv).toFixed(1)}`, bad: "値上がり幅 +30%" },
  { id: "light",  rar: "r", name: "速い光",     good: lv => `惑星・恒星・銀河の生産 ×${2 + lv}`, bad: "岩の生産 ×0.5" },
  { id: "cold",   rar: "r", name: "冷えた宇宙", good: lv => `円盤の回転 ×${(2 + 0.5 * lv).toFixed(1)}`, bad: "残光が効かない" },
  { id: "young",  rar: "e", name: "若い宇宙",   good: lv => `超新星の星屑 ×${2 + lv}`, bad: "超新星に必要な恒星 ×10" },
  { id: "swell",  rar: "e", name: "膨らむ宇宙", good: lv => `ブラックホールの質量 +${lv}`, bad: "ブラックホールに必要な星屑 ×2" },
  { id: "silent", rar: "e", name: "静かな宇宙", good: lv => `塵の生産 ×${5 + 2 * lv}`, bad: "自動購入が効かない" },
];
const lawById = id => LAWS.find(l => l.id === id);
// 装備している法則のレベル（装備していなければ0）
const law = id => (S.laws || []).includes(id) ? ((S.cards || {})[id] || 0) : 0;
const lawSlots = () => 2 + (S.crunches >= 3 ? 1 : 0) + (S.crunches >= 5 ? 1 : 0);
const lawRock   = () => (law("dense") ? 1 + law("dense") : 1) * (law("light") ? 0.5 : 1) * (law("silent") ? 5 + 2 * law("silent") : 1);
const lawUpper  = () => law("light") ? 2 + law("light") : 1;
const lawMs     = () => law("heavy") ? 1.2 + 0.1 * law("heavy") : 1;
const lawGrowth = () => (law("cheap") ? 1 - 0.05 * law("cheap") : 1) * (law("heavy") ? 1.3 : 1);
const lawSpin   = () => (law("spin") ? 1 + 0.2 * law("spin") : 1) * (law("cold") ? 2 + 0.5 * law("cold") : 1);
const lawSnGain = () => law("young") ? 2 + law("young") : 1;
const snReq     = () => SN_REQ_BASE * (law("young") ? 10 : 1);
const bhReqMult = () => law("swell") ? 2 : 1;
const bhReq     = () => BH_REQ_BASE * bhReqMult();
const lawMassBonus = () => law("swell");
const lawStarGap = () => law("meteor") ? Math.pow(0.85, law("meteor")) : 1;
const lawNoAuto  = () => law("silent") > 0;
// ビッグクランチの回数でもらえるマイルストーン
const CRUNCH_MILESTONES = [
  { at: 1, text: "法則カードとガチャが解放。法則の枠 2つ" },
  { at: 1, text: "2回目のビッグクランチから、自動化（自動購入・自動超新星・自動購入の記憶）が消えなくなる" },
  { at: 3, text: "法則の枠 +1（3つ）" },
  { at: 5, text: "法則の枠 +1（4つ）" },
];

// ===== 星屑ショップ =====
// cost(lv) = 次のレベルの値段、max = 最大レベル（なしなら無限）
const UPGRADES = [
  { id: "glow",     name: "岩の輝き",   desc: "岩が生む塵が増える",
    cost: lv => Math.ceil(Math.pow(1.7, lv)),     effect: lv => `塵の生産 ×${1 + lv}` },
  { id: "gravity",  name: "重力",       desc: "節目の倍率が強くなる",
    cost: lv => Math.ceil(2 * Math.pow(1.7, lv)), effect: lv => `節目1つごと ×${milestoneMultAt(lv).toFixed(2)}` },
  { id: "afterglow", name: "残光",      desc: `超新星の直後、塵の生産が一時的に跳ね上がる（${AFTERGLOW_TIME}秒かけて元に戻る）`, max: 5,
    cost: lv => 1 + lv,               effect: lv => lv === 0 ? "なし" : `直後の塵の生産 ×${afterglowPeakAt(lv)}` },
  { id: "compress", name: "圧縮",       desc: "1個ごとの値上がりがゆるやかになる", max: 5,
    cost: lv => 5 * Math.pow(2, lv),  effect: lv => `値上がり幅 −${Math.round((1 - Math.pow(COMPRESS_RATE, lv)) * 100)}%` },
  { id: "auto",     name: "自動購入",   desc: "下の段から順に、自動で買ってくれるようになる", max: 4,
    cost: lv => Math.pow(2, lv),      effect: lv => lv === 0 ? "なし" : TIERS.slice(0, lv).map(t => t.name).join("・") },
  { id: "memory",   name: "恒星の記憶", desc: "超新星でもらえる星屑が増える。端数は確率で+1", max: 3,
    cost: lv => [20, 50, 120][lv],    effect: lv => `獲得する星屑 ×${memMultAt(lv)}` },
];
const freshUp = () => Object.fromEntries(UPGRADES.map(u => [u.id, 0]));
const lvl = id => S.up[id] || 0;
const milestoneMultAt = lv => Math.pow(MILESTONE_MULT, 1 + lv * 0.15);
const SN_GAIN_SCALE = 10;     // 星屑がもう1つ増えるのに、恒星が何倍必要か
const OFFLINE_CAP = 24 * 3600; // 留守中に進む最大秒数
const SAVE_KEY = "cosmos-save-v2";

// ===== 状態 =====
function freshState() {
  return {
    // 超新星やブラックホールのたびに最初の岩を買う手間を省くため、岩1個を持った状態で始まる
    dust: 0,
    amt: [1, 0, 0, 0],
    bought: [1, 0, 0, 0],
    stardust: 0,        // 手持ちの星屑（ショップで使う）
    stardustTotal: 0,   // これまでに手に入れた星屑の合計（次の層で使う予定）
    supernovas: 0,
    up: freshUp(),
    autoOn: true,
    afterglow: 0,       // 残光の残り秒数
    memV2: true,        // 恒星の記憶が掛け算版になってからのセーブか
    compV2: true,       // 圧縮が値上げされてからのセーブか
    novaSeen: false,
    cycleStardust: 0,   // 今のブラックホール周期で手に入れた星屑
    mass: 0,            // 手持ちの質量（質量ショップで使う）
    massTotal: 0,
    blackholes: 0,
    bhSeen: false,
    rings: [0, 0, 0],   // 各円盤の周回数（小数部分は今の周の進み具合）
    mup: freshMup(),
    autoNovaOn: true,
    bhNotified: false,  // この周期で「ブラックホールを起こせる」を知らせたか
    windBoost: 0,       // 流れ星の追い風の残り秒数
    runPeak: 0,         // この周回で貯まった塵の最高値（ビッグクランチの条件）
    crunchNotified: false,
    seeds: 0,           // 宇宙の種（ガチャに使う）
    cards: {},          // 持っている法則カード { id: レベル }
    laws: [],           // 今の宇宙に組み込んでいる法則
    crunches: 0,
    crunchSeen: false,
    pity: 0,            // エピックが出ていない回数
    lastPull: null,     // 最後に引いたカード（表示用）
    flashOn: true,      // 超新星などで画面をフラッシュさせるか
    starsCaught: 0,     // 流れ星をつかまえた回数
    costV3: true,       // 輝き・重力が値上げされてからのセーブか
    hintOn: true,       // 起こしどきのヒントを出すか（ブラックホール後のみ）
    autoNovaAt: 3,      // 自動超新星：星屑がこの数以上もらえるときに起こす
    runTime: 0,         // この周回（前の超新星から）の経過秒数
    runBestRate: 0,     // この周回で一番よかった「1分あたりの星屑」
    runLastBase: 0,     // この周回で最後に届いた獲得量（+1, +2…）
    runJumpRate: 0,     // 最後に獲得量が+1されたときの「1分あたりの星屑」
    last: Date.now(),
    notation: "suffix",
    speed: 1,
  };
}
let S = freshState();

// ===== 計算 =====
// 購入数 b に対して「何回節目を越えたか」「直前の節目」「次の節目」を返す
function msInfo(b) {
  let n = 0, prev = 0, next = FIRST_MILESTONE;
  while (b >= next) { n++; prev = next; next += MILESTONE_STEP * n; }
  return { n, prev, next };
}
const milestoneMult = () => milestoneMultAt(lvl("gravity")) * lawMs();
const msMult = i => Math.pow(milestoneMult(), msInfo(S.bought[i]).n); // 節目による倍率
const glowMult = i => i === 0 ? 1 + lvl("glow") : 1;                  // 岩の輝き（岩だけ）
// 残光：超新星直後に最大、AFTERGLOW_TIME秒かけて×1まで直線的に下がる（岩だけ）
const afterglowMult = i => {
  if (i !== 0 || !S.afterglow || lvl("afterglow") === 0 || law("cold")) return 1;
  return 1 + (afterglowPeakAt(lvl("afterglow")) - 1) * (S.afterglow / AFTERGLOW_TIME);
};
const diskMult = i => i === 0 ? ringMult(0) : ringMult(1);           // 降着円盤（内側は塵、中間は上の段）
// 流れ星の「追い風」：決まった秒数だけ塵の生産が上がる
const WIND_TIME = 30, WIND_MULT = 3;
const windMult = i => i === 0 && S.windBoost > 0 ? WIND_MULT : 1;
const lawMult = i => i === 0 ? lawRock() : lawUpper();
const mult = i => msMult(i) * glowMult(i) * afterglowMult(i) * diskMult(i) * windMult(i) * lawMult(i);
// ===== 数字の安全装置 =====
// JavaScriptの数値は約1.8e308を超えると「Infinity（∞）」になり、0×∞ = NaN などで計算が壊れる。
// セーブにもnullとして書かれてしまうので、すべての量を NUM_CAP で頭打ちにする。
const NUM_CAP = 1e300;
const safeNum = x => (typeof x !== "number" || Number.isNaN(x)) ? 0 : Math.max(-NUM_CAP, Math.min(NUM_CAP, x));
let capWarned = false;
function clampState() {
  let hit = false;
  const c = x => { const v = safeNum(x); if (v >= NUM_CAP) hit = true; return v; };
  S.dust = c(S.dust);
  S.amt = S.amt.map(c);
  S.bought = S.bought.map(x => safeNum(x));
  ["stardust", "stardustTotal", "cycleStardust", "mass", "massTotal", "seeds", "runPeak", "runTime", "runBestRate", "runJumpRate"]
    .forEach(k => { S[k] = c(S[k]); });
  S.rings = (S.rings || [0, 0, 0]).map(x => safeNum(x));
  if (hit && !capWarned) {
    capWarned = true;
    toast("数字が上限（1e300）に届いたので、そこで止めています");
  }
}

const rateOf = i => {
  if (!(S.amt[i] > 0)) return 0;                      // 0 × ∞ = NaN を避ける
  return Math.min(NUM_CAP, S.amt[i] * TIERS[i].prod * Math.min(NUM_CAP, mult(i))); // その段が毎秒生む量
};
// 圧縮で値上がり幅（r − 1）が1レベルごとに10%ずつ縮む
const rOf = i => 1 + (TIERS[i].r - 1) * Math.pow(COMPRESS_RATE, lvl("compress")) * lawGrowth();
const price = i => TIERS[i].base * Math.pow(rOf(i), S.bought[i]);
// n個まとめて買うときの合計（等比数列の和）
const bulkCost = (i, n) => price(i) * (Math.pow(rOf(i), n) - 1) / (rOf(i) - 1);
// 今の塵で何個まで買えるか
const maxAffordable = i => {
  const r = rOf(i);
  let n = Math.floor(Math.log(S.dust * (r - 1) / price(i) + 1) / Math.log(r));
  if (n > 0 && bulkCost(i, n) > S.dust) n--; // 丸め誤差で1個多く出たとき用
  return Math.max(0, n);
};
const unlocked = i => i === 0 || S.bought[i - 1] > 0;
const dustPerSec = () => rateOf(0);
// 恒星がsnReq()で1つ、その10倍で2つ、100倍で3つ…
const snBase = () => S.amt[2] >= snReq() ? Math.floor(Math.log(S.amt[2] / snReq()) / Math.log(SN_GAIN_SCALE)) + 1 : 0;
const snExpected = () => snBase() * memMultAt(lvl("memory")) * ringMult(2) * lawSnGain();   // 端数込みの獲得量
const snGain = () => Math.floor(snExpected());                      // 最低保証の獲得量
// 表示用：端数があるときは「3〜4」のように幅で出す
const snGainText = () => {
  const x = snExpected(), lo = Math.floor(x), hi = Math.ceil(x);
  return lo === hi ? fmt(lo) : `${fmt(lo)}〜${fmt(hi)}`;
};
// 実際にもらえる量：端数の分は確率で+1（2.5なら半々で2か3）
const rollGain = () => {
  const x = snExpected();
  return Math.floor(x) + (Math.random() < x - Math.floor(x) ? 1 : 0);
};

function tick(dt) {
  // 上の段から順に足す（下の段が同じフレームで二重に増えないように）
  const r = TIERS.map((_, i) => rateOf(i));
  S.dust += r[0] * dt;
  for (let i = 1; i < TIERS.length; i++) S.amt[i - 1] += r[i] * dt;
  if (S.afterglow > 0) S.afterglow = Math.max(0, S.afterglow - dt);
  if (S.windBoost > 0) S.windBoost = Math.max(0, S.windBoost - dt);
  if (S.dust > S.runPeak) S.runPeak = S.dust;
  S.runTime += dt;
  const rate = runRate();
  if (rate > S.runBestRate) S.runBestRate = rate;
  const base = snBase();
  if (base > S.runLastBase) { S.runLastBase = base; S.runJumpRate = rate; }
  for (let k = 0; k < RINGS.length; k++) if (ringActive(k)) S.rings[k] += dt / ringPeriod(k);
  autoBuy(dt); // 留守中の計算でも自動購入が動く
  clampState();
}

// count は個数、"max" なら買えるだけ
// 買ったときの演出用
let buyingAuto = false, pulseAt = -1e9, msPulseAt = -1e9;
function buy(i, count) {
  const msBefore = msInfo(S.bought[i]).n;
  const ok = buyCore(i, count);
  if (ok && !buyingAuto) {
    const t = performance.now();
    pulseAt = t;
    if (msInfo(S.bought[i]).n > msBefore) msPulseAt = t;
  }
  return ok;
}
function buyCore(i, count) {
  if (!unlocked(i)) return false;
  const n = count === "max" ? maxAffordable(i) : count;
  if (n <= 0) return false;
  const cost = bulkCost(i, n);
  if (S.dust < cost) return false;
  S.dust -= cost;
  S.amt[i] += n;
  S.bought[i] += n;
  return true;
}

function buyMax() {
  // そのとき一番安いものから1個ずつ買っていく
  for (let guard = 0; guard < 5000; guard++) {
    let best = -1;
    for (let i = 0; i < TIERS.length; i++) {
      if (unlocked(i) && S.dust >= price(i) && (best < 0 || price(i) < price(best))) best = i;
    }
    if (best < 0) break;
    buy(best, 1);
  }
}

// 超新星・ブラックホールで消えないもの
const META_KEYS = ["starsCaught", "costV3", "flashOn", "seeds", "cards", "laws", "crunches", "crunchSeen", "pity", "lastPull", "windBoost", "notation", "speed", "last", "mass", "massTotal", "blackholes", "bhSeen", "mup", "autoNovaOn", "autoNovaAt", "hintOn", "supernovas", "stardustTotal", "memV2", "compV2"];
function keepMeta() { const k = {}; META_KEYS.forEach(key => k[key] = S[key]); return k; }

// silent: 留守中の計算など、何も出さない / auto: 自動超新星（フラッシュとお知らせは出さず、保存はいつものタイミングで）
function supernova(silent, auto) {
  if (snGain() <= 0) return;
  const g = rollGain();
  if (!silent && !auto) toast(`超新星！ 星屑 +${fmt(g)}`);
  const keep = Object.assign(keepMeta(), {
    stardust: S.stardust + g, stardustTotal: S.stardustTotal + g, supernovas: S.supernovas + 1,
    cycleStardust: S.cycleStardust + g, bhNotified: S.bhNotified, rings: S.rings, up: S.up, autoOn: S.autoOn, novaSeen: true,
  });
  S = Object.assign(freshState(), keep);
  S.afterglow = AFTERGLOW_TIME;
  if (!silent && !auto) { flash(); save(); }
}

// 1分あたりに稼げる星屑（今超新星したら）
const runRate = () => S.runTime > 0 && snGain() > 0 ? snExpected() / S.runTime * 60 : 0;
// 獲得量は恒星10倍ごとに+1なので、効率は「+1されるたびに跳ねて、次の+1まで下がる」をくり返す。
// 最後に+1されたときの効率が、それまでの最高に届かなかったら、粘るほど損している合図
// ヒントはブラックホールを起こしたあと、設定でONのときだけ（最初は自分でタイミングを決めてほしいので）
const hintActive = () => S.blackholes > 0 && S.hintOn !== false;
const pastPeak = () => S.runLastBase >= 2 && S.runJumpRate < S.runBestRate * 0.98;
const fmtTime = sec => `${Math.floor(sec / 60)}分${String(Math.floor(sec % 60)).padStart(2, "0")}秒`;

// 自動超新星：基準に届いていたら起こす
function autoNova(silent) {
  if (!mlvl("autoNova") || !S.autoNovaOn) return;
  // 星屑の量（倍率や端数で変わる）ではなく、恒星が何段階目に届いたかで判定する
  if (snBase() >= S.autoNovaAt) supernova(silent, true);
}

function blackhole() {
  const g = massGainFor(S.cycleStardust);
  if (g <= 0) return;
  const up = freshUp();
  if (mlvl("keepAuto")) up.auto = lvl("auto");
  const keep = Object.assign(keepMeta(), {
    mass: S.mass + g, massTotal: S.massTotal + g, blackholes: S.blackholes + 1, bhSeen: true,
    up, autoOn: S.autoOn, novaSeen: true,
  });
  S = Object.assign(freshState(), keep);
  toast(`ブラックホール！ 質量 +${fmt(g)}`);
  flash(true);
  save();
  buildTiers();
}

// ビッグクランチで消えないもの（設定・記録・法則カードまわり）
const CRUNCH_KEYS = ["starsCaught", "costV3", "flashOn", "notation", "speed", "last", "hintOn", "supernovas", "stardustTotal", "memV2", "compV2",
  "seeds", "cards", "laws", "pity", "lastPull", "autoNovaOn", "autoNovaAt", "autoOn", "windBoost"];
function bigCrunch() {
  const g = seedGainFor(S.runPeak);
  if (g <= 0) return;
  const keepAutomation = S.crunches >= 1; // 2回目のビッグクランチから自動化が残る
  const k = {};
  CRUNCH_KEYS.forEach(key => k[key] = S[key]);
  const up = freshUp(), mup = freshMup();
  if (keepAutomation) {
    up.auto = lvl("auto");
    mup.autoNova = mlvl("autoNova");
    mup.keepAuto = mlvl("keepAuto");
  }
  Object.assign(k, {
    seeds: S.seeds + g, crunches: S.crunches + 1, crunchSeen: true, novaSeen: true, bhSeen: true,
    up, mup,
  });
  S = Object.assign(freshState(), k);
  toast(`ビッグクランチ！ 宇宙の種 +${fmt(g)}`);
  flash(true);
  save();
  buildTiers();
}

// ガチャ：レア度を決めてから、そのレア度のカードを1枚選ぶ
function pullLaw() {
  if (S.seeds < GACHA_COST) return null;
  S.seeds -= GACHA_COST;
  let rar;
  if (S.pity >= PITY - 1) rar = "e";
  else {
    let x = Math.random() * 100;
    rar = x < RARITY.e.weight ? "e" : x < RARITY.e.weight + RARITY.r.weight ? "r" : "c";
  }
  S.pity = rar === "e" ? 0 : S.pity + 1;
  const pool = LAWS.filter(l => l.rar === rar);
  const card = pool[Math.floor(Math.random() * pool.length)];
  const before = S.cards[card.id] || 0;
  let result;
  if (before === 0) { S.cards[card.id] = 1; result = "new"; }
  else if (before < LAW_MAX) { S.cards[card.id] = before + 1; result = "up"; }
  else { S.seeds += GACHA_COST; result = "max"; } // 最大レベルのダブりは種を返す
  S.lastPull = { id: card.id, result, lv: S.cards[card.id] };
  save();
  return S.lastPull;
}
function toggleLaw(id) {
  const i = S.laws.indexOf(id);
  if (i >= 0) S.laws.splice(i, 1);
  else if (S.laws.length < lawSlots() && S.cards[id]) S.laws.push(id);
  save();
}

function buyMassUpgrade(u) {
  const lv = mlvl(u.id);
  if (lv >= u.max) return;
  if (u.needs && !mlvl(u.needs)) return;
  const c = u.cost(lv);
  if (S.mass < c) return;
  S.mass -= c;
  S.mup[u.id] = lv + 1;
  save();
}

function buyUpgrade(u) {
  const lv = lvl(u.id);
  if (u.max !== undefined && lv >= u.max) return;
  const c = u.cost(lv);
  if (S.stardust < c) return;
  S.stardust -= c;
  S.up[u.id] = lv + 1;
  save();
}

// この段が今、自動購入されているか（表示用）
const autoActive = i => i < lvl("auto") && S.autoOn && !lawNoAuto();
// 自動購入：解放された段を、上の段から順に買う。ただし1回の買い物は今の塵のAUTO_BUDGET以下だけ
let autoTimer = 0;
function autoBuy(dt) {
  const n = lvl("auto");
  if (n === 0 || !S.autoOn || lawNoAuto()) return;
  autoTimer += dt;
  if (autoTimer < 0.5) return;
  autoTimer = 0;
  buyingAuto = true;
  for (let i = Math.min(n, TIERS.length) - 1; i >= 0; i--) {
    for (let guard = 0; guard < 200; guard++) {
      if (!unlocked(i) || price(i) > S.dust * AUTO_BUDGET) break;
      buy(i, 1);
    }
  }
  buyingAuto = false;
}

// ===== 数字の表記 =====
const SUF = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
function fmt(n, decimals) {
  if (!isFinite(n)) return "∞";
  if (n < 1000) {
    if (decimals && n < 100) return n.toFixed(1);
    return Math.floor(n).toString();
  }
  const e = Math.floor(Math.log10(n));
  const g = Math.floor(e / 3);
  if (S.notation === "suffix" && g < SUF.length) {
    return (n / Math.pow(10, g * 3)).toFixed(2) + SUF[g];
  }
  return (n / Math.pow(10, e)).toFixed(2) + "e" + e;
}

// ===== セーブ（Claudeのアーティファクト用ストレージ。自分で公開するときはここをlocalStorageに差し替え） =====
// セーブはブラウザのlocalStorage（遊ぶ人ごと・端末ごとに別々）。使えない環境では何もしない
// 保存に失敗したら画面に警告を出す（黙って消えるのを防ぐ）
let storageOk = true;
function setStorageOk(ok) {
  if (ok === storageOk) return;
  storageOk = ok;
  const w = document.getElementById("storageWarn");
  if (w) w.hidden = ok;
}
async function save() {
  if (!tabActive) return; // 別のタブに譲ったあとは保存しない
  clampState();
  const json = JSON.stringify(S);
  try {
    localStorage.setItem(SAVE_KEY, json);
    // 書いたものが本当に読めるかまで確認する
    if (localStorage.getItem(SAVE_KEY) === json) { setStorageOk(true); return; }
  } catch (e) {}
  if (window.storage) {
    try { await window.storage.set(SAVE_KEY, json, false); setStorageOk(true); return; } catch (e) {}
  }
  setStorageOk(false);
}

// ===== 同じゲームを複数のタブで開いたとき =====
// 先に開いていたタブが優先。あとから開いたタブは止まった状態で始まり、「このタブで遊ぶ」を押すと、
// 前のタブが保存してから止まり、こちらに切り替わる（Claudeの画面のプレビューなどで勝手に切り替わらないように）
const TAB_ID = Math.random().toString(36).slice(2);
let tabActive = true;
let tabChannel = null;
try { tabChannel = new BroadcastChannel("cosmos-tabs"); } catch (e) {}
let handoffWaiter = null, aliveWaiter = null;
function tabSend(msg) { if (tabChannel) { try { tabChannel.postMessage(msg); } catch (e) {} } }
if (tabChannel) {
  tabChannel.onmessage = ev => {
    const m = ev.data || {};
    if (m.id === TAB_ID) return;
    if (m.type === "ping" && tabActive) {
      tabSend({ type: "alive", id: TAB_ID });
    } else if (m.type === "alive" && aliveWaiter) {
      aliveWaiter();
    } else if (m.type === "hello" && tabActive) {
      S.last = Date.now();
      save();                 // 最新の状態を残してから
      tabActive = false;      // このタブは止める
      document.getElementById("tabCover").hidden = false;
      tabSend({ type: "handoff", id: TAB_ID });
    } else if (m.type === "handoff" && handoffWaiter) {
      handoffWaiter();
    }
  };
}
// ほかに遊んでいるタブがあるか確かめる（あればtrue）
function otherTabAlive() {
  if (!tabChannel) return Promise.resolve(false);
  tabSend({ type: "ping", id: TAB_ID });
  return new Promise(resolve => {
    const timer = setTimeout(() => { aliveWaiter = null; resolve(false); }, 400);
    aliveWaiter = () => { aliveWaiter = null; clearTimeout(timer); resolve(true); };
  });
}
// ほかのタブに「今からこっちで遊ぶ」と知らせ、保存し終わるのを少し待つ
function claimTab() {
  tabActive = true;
  tabSend({ type: "hello", id: TAB_ID });
  return new Promise(resolve => {
    const done = () => { handoffWaiter = null; clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, 400);
    handoffWaiter = done;
  });
}
async function readSave() {
  try { const v = localStorage.getItem(SAVE_KEY); if (v) return v; } catch (e) {}
  if (window.storage) { try { const r = await window.storage.get(SAVE_KEY, false); if (r && r.value) return r.value; } catch (e) {} }
  return null;
}
async function load() {
  try {
    const raw = await readSave();
    if (raw) applySave(JSON.parse(raw));
  } catch (e) { /* セーブがまだない */ }
}
// セーブの中身を状態に反映する（古い版のセーブの移行もここでやる）
function applySave(d) {
  {
    {
      S = Object.assign(freshState(), d);
      clampState(); // 壊れた数（null・NaN・∞）が入っていたら直す
      S.up = Object.assign(freshUp(), d.up || {});
      S.mup = Object.assign(freshMup(), d.mup || {});
      if (!d.cards) S.cards = {};
      if (!d.costV3) {
        // 輝き・重力を値上げしたので、旧価格（1, 2, 3…）で払い戻してLv0に戻す。
        // 旧価格で育った今の周回（塵が桁違いに多い）も、ここでやり直しにする
        const tri = n => n * (n + 1) / 2;
        S.stardust += tri(S.up.glow || 0) + tri(S.up.gravity || 0);
        S.up.glow = 0; S.up.gravity = 0;
        const f = freshState();
        ["dust", "amt", "bought", "runPeak", "runTime", "runBestRate", "runLastBase", "runJumpRate", "crunchNotified"].forEach(k => S[k] = f[k]);
        S.costV3 = true;
      }
      if (!Array.isArray(d.laws)) S.laws = [];
      if (!S.mup.autoNova && d.autoNovaAt === 5) S.autoNovaAt = 3; // 初期値を5→3に変えたので、まだ使っていない人は3に
      if (d.runTime === undefined) S.runTime = 0;
      if (!Array.isArray(d.rings)) S.rings = [0, 0, 0];
      if (d.cycleStardust === undefined) S.cycleStardust = S.stardustTotal; // ブラックホール追加前のセーブ
      if (!d.compV2 && S.up.compress > 0) { // 圧縮を値上げしたので、旧価格（1, 2, 3…）で払い戻してLv0に戻す
        for (let lv = 0; lv < Math.min(S.up.compress, 5); lv++) S.stardust += 1 + lv;
        S.up.compress = 0;
      }
      if (!d.memV2 && S.up.memory > 0) {
        for (let lv = 0; lv < S.up.memory; lv++) S.stardust += 4 * Math.pow(4, lv);
        S.up.memory = 0;
      }
      if (S.up.compress > 5) {
        for (let lv = 5; lv < S.up.compress; lv++) S.stardust += 3 * Math.pow(2, lv);
        S.up.compress = 5;
      }
      if (d.up && d.up.primal) { // 廃止した「原始の塵」の分は星屑で払い戻す
        for (let lv = 0; lv < d.up.primal; lv++) { S.stardust += Math.pow(3, lv); }
        delete S.up.primal;
      }
      if (!d.stardustTotal) S.stardustTotal = S.stardust; // 前の版のセーブから引き継ぐとき
    }
  }
}

// 書き出し：JSONをbase64にした文字列（「COSMOS1:」から始まる）
const SAVE_PREFIX = "COSMOS1:";
function exportSave() {
  clampState();
  const json = JSON.stringify(S);
  return SAVE_PREFIX + btoa(unescape(encodeURIComponent(json)));
}
function importSave(text) {
  const t = text.trim();
  if (!t.startsWith(SAVE_PREFIX)) throw new Error("prefix");
  const d = JSON.parse(decodeURIComponent(escape(atob(t.slice(SAVE_PREFIX.length)))));
  if (typeof d !== "object" || !Array.isArray(d.amt)) throw new Error("shape");
  applySave(d);
  S.last = Date.now(); // 別の端末の留守時間を二重に数えないように
}
async function wipe() {
  S = freshState();
  shownStage = 0;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  if (window.storage) { try { await window.storage.delete(SAVE_KEY, false); } catch (e) {} }
  buildTiers();
}

// ===== 留守中の進行 =====
function applyOffline(seconds) {
  const sec = Math.min(seconds, OFFLINE_CAP);
  const before = S.dust;
  const steps = 300;
  const dt = sec / steps;
  const novasBefore = S.supernovas;
  for (let k = 0; k < steps; k++) { tick(dt); autoNova(true); }
  const gained = S.dust - before;
  if (S.supernovas > novasBefore) {
    toast(`留守中に超新星が ${S.supernovas - novasBefore} 回起きた`);
    return;
  }
  if (gained > 0) {
    const mins = sec >= 3600 ? (sec / 3600).toFixed(1) + "時間" : Math.max(1, Math.round(sec / 60)) + "分";
    toast(`留守中（${mins}）に塵が +${fmt(gained)}`);
  }
}

// ===== UI =====
const $ = id => document.getElementById(id);
const tierEls = [];

function buildTiers() {
  const wrap = $("tiers");
  wrap.innerHTML = "";
  tierEls.length = 0;
  TIERS.forEach((t, i) => {
    // 段と段の間に「この段が上の段を生んでいる」ことを示す行を入れる（岩の上の行は、画面上部の塵を指す）
    const flow = document.createElement("div");
    flow.className = "flow";
    flow.innerHTML = `<span class="flow-arrow" aria-hidden="true">▲</span><span class="flow-text"></span><span class="flow-rate num"></span>`;
    wrap.appendChild(flow);
    const row = document.createElement("div");
    row.className = "tier";
    row.innerHTML = `
      <div>
        <div class="tier-name"><span class="tname"></span><span class="mult num"></span><span class="auto-chip" hidden>自動</span></div>
        <div class="tier-info num info"></div>
        <div class="tier-progress"><span></span></div>
        <div class="tier-info num ms"></div>
      </div>
      <div class="tier-buttons">
        <button class="buy primary one"><span class="num">1個</span><small class="num"></small></button>
        <button class="buy ten"><span class="num">10個</span><small class="num"></small></button>
        <button class="buy max"><span class="num"></span><small class="num"></small></button>
      </div>`;
    row.querySelector(".one").addEventListener("click", () => { buy(i, 1); render(); });
    row.querySelector(".ten").addEventListener("click", () => { buy(i, 10); render(); });
    row.querySelector(".max").addEventListener("click", () => { buy(i, "max"); render(); });
    wrap.appendChild(row);
    tierEls.push({
      row,
      flow,
      flowText: flow.querySelector(".flow-text"),
      flowRate: flow.querySelector(".flow-rate"),
      auto: row.querySelector(".auto-chip"),
      name: row.querySelector(".tname"),
      mult: row.querySelector(".mult"),
      info: row.querySelector(".info"),
      ms: row.querySelector(".ms"),
      bar: row.querySelector(".tier-progress span"),
      one: row.querySelector(".one"),
      oneCost: row.querySelector(".one small"),
      ten: row.querySelector(".ten"),
      tenCost: row.querySelector(".ten small"),
      max: row.querySelector(".max"),
      maxLabel: row.querySelector(".max span"),
      maxCost: row.querySelector(".max small"),
    });
  });
}

const shopEls = [];
function buildShop() {
  const wrap = $("shop");
  wrap.innerHTML = "";
  shopEls.length = 0;
  UPGRADES.forEach(u => {
    const row = document.createElement("div");
    row.className = "up";
    row.innerHTML = `
      <div class="up-name">${u.name}<span class="lv num"></span></div>
      <div class="up-desc">${u.desc}</div>
      <div class="up-effect num"></div>
      <button class="buy sd"><span>強化</span><small class="num"></small></button>`;
    row.querySelector("button").addEventListener("click", () => { buyUpgrade(u); render(); });
    wrap.appendChild(row);
    shopEls.push({ row, lv: row.querySelector(".lv"), effect: row.querySelector(".up-effect"), btn: row.querySelector("button"), cost: row.querySelector("small") });
  });
}
function renderShop() {
  UPGRADES.forEach((u, k) => {
    const el = shopEls[k];
    const lv = lvl(u.id);
    const maxed = u.max !== undefined && lv >= u.max;
    el.row.classList.toggle("maxed", maxed);
    el.lv.textContent = u.max !== undefined ? `Lv ${lv} / ${u.max}` : `Lv ${lv}`;
    el.effect.innerHTML = maxed ? `<b>${u.effect(lv)}</b>（最大）` : `${u.effect(lv)} → <b>${u.effect(lv + 1)}</b>`;
    const c = u.cost(lv);
    el.cost.textContent = `${fmt(c)} 星屑`;
    el.btn.disabled = maxed || S.stardust < c;
  });
}

const ringEls = [], mshopEls = [];
function buildBH() {
  const rw = $("rings");
  rw.innerHTML = ""; ringEls.length = 0;
  RINGS.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "ring-row";
    row.innerHTML = `
      <div class="up-name">${r.name}</div>
      <div class="up-effect num"></div>
      <div class="laps num"></div>
      <div class="ring-bar"><span></span></div>`;
    rw.appendChild(row);
    ringEls.push({ row, effect: row.querySelector(".up-effect"), laps: row.querySelector(".laps"), bar: row.querySelector(".ring-bar span") });
  });
  const mw = $("mshop");
  mw.innerHTML = ""; mshopEls.length = 0;
  MUPGRADES.forEach(u => {
    const row = document.createElement("div");
    row.className = "up";
    row.innerHTML = `
      <div class="up-name">${u.name}<span class="lv num"></span></div>
      <div class="up-desc">${u.desc}</div>
      <div class="up-effect num"></div>
      <button class="buy mass"><span>強化</span><small class="num"></small></button>`;
    row.querySelector("button").addEventListener("click", () => { buyMassUpgrade(u); render(); });
    mw.appendChild(row);
    mshopEls.push({ row, lv: row.querySelector(".lv"), effect: row.querySelector(".up-effect"), btn: row.querySelector("button"), cost: row.querySelector("small") });
  });
}
let pullAnimAt = 0;
function renderCrunch() {
  if (S.blackholes >= 3 || S.crunches > 0) S.crunchSeen = true;
  const tab = $("crunchTab");
  tab.textContent = S.crunchSeen ? "ビッグクランチ" : "？？？";
  tab.disabled = !S.crunchSeen;
  const ready = seedGainFor(S.runPeak) > 0;
  if (ready && !S.crunchNotified) {
    S.crunchNotified = true;
    toast(`ビッグクランチを起こせるようになった！（宇宙の種 +${seedGainFor(S.runPeak)}）`);
  }
  tab.classList.toggle("ready", ready);
  if ($("panel-crunch").hidden) return;

  $("crSeeds").textContent = `${fmt(S.seeds)} 宇宙の種`;
  const lg = S.runPeak > 1 ? Math.log10(S.runPeak) : 0;
  $("crBar").style.width = Math.min(100, lg / Math.log10(CRUNCH_REQ) * 100) + "%";
  const g = seedGainFor(S.runPeak);
  $("crProgress").textContent = g > 0
    ? `この周回の塵の最高 ${fmt(S.runPeak)}。種がもう1つ増えるまで 塵 ${fmt(Math.pow(10, 50 + 10 * (g - 2)))}`
    : `この周回の塵の最高 ${fmt(S.runPeak)} / ${fmt(CRUNCH_REQ)}`;
  const btn = $("crBtn");
  btn.disabled = g === 0;
  if (!crunchArmed) btn.textContent = g > 0 ? `ビッグクランチを起こす（宇宙の種 +${fmt(g)}）` : "ビッグクランチを起こす";

  $("crMilestones").innerHTML = "";
  CRUNCH_MILESTONES.forEach(m => {
    const li = document.createElement("li");
    li.className = S.crunches >= m.at ? "done" : "";
    li.textContent = `${m.at}回：${m.text}`;
    $("crMilestones").appendChild(li);
  });

  const lawOpen = S.crunches > 0 || S.seeds > 0 || Object.keys(S.cards).length > 0;
  $("lawArea").hidden = !lawOpen;
  if (!lawOpen) return;

  // ガチャ
  $("pullBtn").disabled = S.seeds < GACHA_COST;
  $("pullBtn").textContent = S.seeds < GACHA_COST ? "宇宙の種がない（ビッグクランチでもらえる）" : `ガチャを引く（宇宙の種 ${GACHA_COST}）`;
  const left = PITY - S.pity;
  $("pityText").textContent = `あと ${left} 回のうちにエピックが出なければ、${left}回目はエピック確定`;
  const r = $("pullResult");
  if (S.lastPull) {
    const l = lawById(S.lastPull.id);
    const label = S.lastPull.result === "new" ? "NEW!" : S.lastPull.result === "up" ? `Lv ${S.lastPull.lv - 1} → ${S.lastPull.lv}` : "最大レベルなので種を返した";
    r.hidden = false;
    r.className = `pull-result law rar-${l.rar}` + (performance.now() - pullAnimAt < 700 ? " pop" : "");
    r.innerHTML = "";
    r.appendChild(lawCardBody(l, S.cards[l.id] || 1, label));
  } else r.hidden = true;

  // 今の宇宙の法則と手持ちのカード
  $("lawSlots").textContent = `今の宇宙の法則（${S.laws.length} / ${lawSlots()}）`;
  const list = $("lawList");
  list.innerHTML = "";
  const owned = LAWS.filter(l => S.cards[l.id]);
  if (owned.length === 0) {
    const p = document.createElement("p");
    p.className = "sn-text";
    p.textContent = "まだ法則カードを持っていない。宇宙の種でガチャを引こう。";
    list.appendChild(p);
  }
  owned.forEach(l => {
    const on = S.laws.includes(l.id);
    const row = document.createElement("div");
    row.className = `law rar-${l.rar}` + (on ? " on" : "");
    row.appendChild(lawCardBody(l, S.cards[l.id], null));
    const b = document.createElement("button");
    b.className = "buy law-btn";
    b.textContent = on ? "外す" : "組み込む";
    b.disabled = !on && S.laws.length >= lawSlots();
    b.addEventListener("click", () => { toggleLaw(l.id); render(); });
    row.appendChild(b);
    list.appendChild(row);
  });
}
function lawCardBody(l, lv, label) {
  const d = document.createElement("div");
  d.className = "law-body";
  const head = document.createElement("div");
  head.className = "law-head";
  const name = document.createElement("span");
  name.className = "law-name";
  name.textContent = l.name;
  const meta = document.createElement("span");
  meta.className = "law-meta num";
  // 引いた結果のカードは「Lv 1 → 2」などをレベルの代わりに出す（同じことを2回書かない）
  meta.textContent = label && label !== "NEW!" ? `${RARITY[l.rar].name} ・ ${label}` : `${RARITY[l.rar].name} ・ Lv ${lv}` + (label ? ` ・ ${label}` : "");
  head.append(name, meta);
  const good = document.createElement("div");
  good.className = "law-good num";
  good.textContent = `＋ ${l.good(lv)}`;
  d.append(head, good);
  if (l.bad) {
    const bad = document.createElement("div");
    bad.className = "law-bad";
    bad.textContent = `− ${l.bad}`;
    d.append(bad);
  }
  return d;
}

function renderBH() {
  if (S.cycleStardust >= bhReq() / 2 || S.blackholes > 0) S.bhSeen = true;
  const tab = $("bhTab");
  tab.textContent = S.bhSeen ? "ブラックホール" : "？？？";
  tab.disabled = !S.bhSeen;
  // ブラックホールを起こせるようになったら知らせる（周期ごとに1回）。起こせる間はタブに印を付ける
  const ready = massGainFor(S.cycleStardust) > 0;
  if (ready && !S.bhNotified) {
    S.bhNotified = true;
    toast(`ブラックホールを起こせるようになった！（質量 +${fmt(massGainFor(S.cycleStardust))}）`);
  }
  tab.classList.toggle("ready", ready);
  if ($("panel-bh").hidden) return;

  $("bhMass").textContent = `${fmt(S.mass)} 質量`;
  $("bhBar").style.width = Math.min(100, S.cycleStardust / bhReq() * 100) + "%";
  const g = massGainFor(S.cycleStardust);
  $("bhProgress").textContent = g > 0
    ? `この周期で手に入れた星屑 ${fmt(S.cycleStardust)}。質量がもう1つ増えるまで あと ${fmt(Math.ceil(massNextAt(g) - S.cycleStardust))}`
    : `この周期で手に入れた星屑 ${fmt(S.cycleStardust)} / ${bhReq()}`;
  const btn = $("bhBtn");
  btn.disabled = g === 0;
  btn.textContent = g > 0 ? `ブラックホールを起こす（質量 +${fmt(g)}）` : "ブラックホールを起こす";

  RINGS.forEach((r, i) => {
    const el = ringEls[i];
    const on = ringActive(i);
    el.row.classList.toggle("locked", !on);
    if (!on) {
      const how = i === 0 ? "ブラックホールを起こすとできる" : "質量ショップで解放";
      el.effect.textContent = `${how}。1周（${r.period}秒）ごとに、${r.target}が +${r.per}倍`;
      el.laps.textContent = "";
      el.bar.style.width = "0";
      return;
    }
    el.effect.innerHTML = `${r.target} <b>×${ringMult(i).toFixed(2)}</b>（1周ごとに +${r.per}、1周 ${ringPeriod(i).toFixed(1)}秒）`;
    el.laps.textContent = `${ringLaps(i)} 周`;
    el.bar.style.width = ((S.rings[i] % 1) * 100) + "%";
  });

  MUPGRADES.forEach((u, k) => {
    const el = mshopEls[k];
    const lv = mlvl(u.id);
    const locked = u.needs && !mlvl(u.needs);
    const maxed = lv >= u.max;
    el.row.hidden = !!locked;
    el.row.classList.toggle("maxed", maxed);
    el.lv.textContent = u.max > 1 ? `Lv ${lv} / ${u.max}` : "";
    el.effect.innerHTML = maxed ? `<b>${u.effect(lv)}</b>${u.max > 1 ? "（最大）" : ""}` : `${u.effect(lv)} → <b>${u.effect(lv + 1)}</b>`;
    const c = u.cost(lv);
    el.cost.textContent = `${fmt(c)} 質量`;
    el.btn.disabled = maxed || S.mass < c;
  });
}

function goalText() {
  if (S.bought[0] === 0) return `まずは<strong>岩</strong>を1つ買おう（${fmt(price(0))} 塵）`;
  for (let i = 1; i < TIERS.length; i++) {
    if (S.bought[i] === 0) {
      return S.dust >= price(i)
        ? `<strong>${TIERS[i].name}</strong>が買えるようになった`
        : `<strong>${TIERS[i].name}</strong>まで あと ${fmt(price(i) - S.dust)} 塵`;
    }
  }
  const g = snGain();
  if (g === 0) return `超新星まで 恒星あと <strong>${fmt(snReq() - S.amt[2])}</strong>`;
  if (hintActive() && pastPeak()) return `粘るより<strong>超新星を起こした方が速そう</strong>（星屑 +${snGainText()}）`;
  return `超新星を起こすと 星屑 <strong>+${snGainText()}</strong>`;
}

function render() {
  $("dust").textContent = fmt(S.dust);
  const ag = afterglowMult(0);
  const extras = [];
  if (ag > 1) extras.push(`残光 ×${ag.toFixed(1)} あと${Math.ceil(S.afterglow)}秒`);
  if (S.windBoost > 0) extras.push(`追い風 ×${WIND_MULT} あと${Math.ceil(S.windBoost)}秒`);
  $("rate").textContent = `毎秒 ${fmt(dustPerSec(), true)}` + (extras.length ? `（${extras.join("、")}）` : "");
  const sd = $("sdChip");
  sd.hidden = S.stardust === 0;
  sd.textContent = `星屑 ${fmt(S.stardust)}`;
  const mc = $("massChip");
  mc.hidden = S.massTotal === 0;
  mc.textContent = `質量 ${fmt(S.mass)}`;
  $("goal").innerHTML = goalText();

  TIERS.forEach((t, i) => {
    const el = tierEls[i];
    const open = unlocked(i);
    el.row.classList.toggle("locked", !open);
    el.flow.hidden = !open;
    el.auto.hidden = !(open && autoActive(i));
    if (!open) {
      el.name.textContent = "？？？";
      el.mult.textContent = "";
      el.info.textContent = `${TIERS[i - 1].name}を1つ買うと解放`;
      el.ms.textContent = "";
      el.bar.style.width = "0";
      return;
    }
    const b = S.bought[i];
    const perSec = rateOf(i);
    el.name.textContent = t.name;
    el.mult.textContent = `×${fmt(mult(i), true)}`;
    el.info.textContent = `${fmt(Math.floor(S.amt[i]))} 個 持っている`; // 内部は小数、表示は切り捨て
    if (S.amt[i] >= 1) {
      el.flowText.textContent = `${t.name}が${t.makes}を生んでいる`;
      el.flowRate.textContent = `毎秒 +${fmt(perSec, true)}`;
    } else {
      el.flowText.textContent = `${t.name}を買うと、${t.makes}が自動で増えていく`;
      el.flowRate.textContent = "";
    }
    const m = msInfo(b);
    el.bar.style.width = ((b - m.prev) / (m.next - m.prev) * 100) + "%";
    const parts = [`節目 ×${fmt(msMult(i), true)}`];
    if (glowMult(i) > 1) parts.push(`輝き ×${glowMult(i)}`);
    if (afterglowMult(i) > 1) parts.push(`残光 ×${afterglowMult(i).toFixed(1)}`);
    el.ms.textContent = `${b} / ${m.next} 個で次の節目（×${milestoneMult().toFixed(2)}）・ 内訳 ${parts.join(" × ")}`;
    const p = price(i);
    el.oneCost.textContent = `${fmt(p)} 塵`;
    el.one.disabled = S.dust < p;
    const c10 = bulkCost(i, 10);
    el.tenCost.textContent = `${fmt(c10)} 塵`;
    el.ten.disabled = S.dust < c10;
    const n = maxAffordable(i);
    el.maxLabel.textContent = n > 0 ? `最大 ${n}個` : "最大";
    el.maxCost.textContent = n > 0 ? `${fmt(bulkCost(i, n))} 塵` : "—";
    el.max.disabled = n === 0;
  });

  // 超新星タブ：恒星を初めて買うか、一度でも超新星を起こしたら解放
  if (S.bought[2] > 0 || S.supernovas > 0) S.novaSeen = true;
  const novaTab = $("novaTab");
  novaTab.textContent = S.novaSeen ? "超新星" : "？？？";
  novaTab.disabled = !S.novaSeen;

  $("snStardust").textContent = `${fmt(S.stardust)} 星屑`;
  // ゲージ：次に獲得量が+1されるまでの進み具合。恒星10倍ごとなので対数で測る（最初の1つ目までは普通に割合）
  const b0 = snBase();
  let ratio;
  if (b0 === 0) ratio = Math.min(1, S.amt[2] / snReq());
  else {
    const lo = snReq() * Math.pow(SN_GAIN_SCALE, b0 - 1);
    ratio = Math.log(S.amt[2] / lo) / Math.log(SN_GAIN_SCALE);
  }
  $("snBar").style.width = (Math.max(0, Math.min(1, ratio)) * 100) + "%";
  const g = snGain();
  $("snProgress").textContent = g > 0
    ? `恒星 ${fmt(S.amt[2])}。星屑がもう1段階増えるまで 恒星 ${fmt(Math.ceil(snReq() * Math.pow(SN_GAIN_SCALE, snBase()) - S.amt[2]))}`
    : `恒星 ${fmt(S.amt[2])} / ${fmt(snReq())}`;
  const btn = $("novaBtn");
  btn.disabled = g === 0;
  btn.textContent = g > 0 ? `超新星を起こす（星屑 +${snGainText()}）` : "超新星を起こす";
  const hi = Math.ceil(snExpected());
  const rb = $("rateBox");
  rb.classList.toggle("idle", g === 0);
  if (g === 0) {
    rb.classList.remove("peak");
    $("rateMain").textContent = `この周回 ${fmtTime(S.runTime)}`;
    $("rateSub").textContent = "起こせるようになると毎分の星屑が出る";
  } else {
    const peak = hintActive() && pastPeak();
    rb.classList.toggle("peak", peak);
    $("rateMain").textContent = `この周回 ${fmtTime(S.runTime)} ・ 毎分 ${runRate().toFixed(2)} 星屑`;
    $("rateSub").textContent = peak
      ? `最高は毎分 ${S.runBestRate.toFixed(2)}。粘るより起こした方が速そう`
      : `この周回の最高 毎分 ${S.runBestRate.toFixed(2)}`;
  }
  $("snPreview").textContent = g > 0
    ? `手持ちの星屑 ${fmt(S.stardust)} → ${g === hi ? fmt(S.stardust + g) : `${fmt(S.stardust + g)}〜${fmt(S.stardust + hi)}`}`
    : "\u00a0"; // 空でも1行分の高さを残す
  renderShop();
  renderBH();
  renderCrunch();
  // 自動超新星の設定
  const an = $("autoNovaRow");
  an.hidden = !mlvl("autoNova");
  $("autoNovaDesc").textContent = `恒星が ${S.autoNovaAt} 段階目（${fmt(snReq() * Math.pow(SN_GAIN_SCALE, S.autoNovaAt - 1))}個）に届いたら自動で起こす`;
  $("anToggle").textContent = S.autoNovaOn ? "ON" : "OFF";
  $("anToggle").setAttribute("aria-pressed", S.autoNovaOn);
  const ab = $("autoBtn");
  ab.hidden = lvl("auto") === 0;
  ab.textContent = lawNoAuto() ? "自動購入（静かな宇宙で停止中）" : S.autoOn ? "自動購入 ON" : "自動購入 OFF";
  ab.classList.toggle("on", S.autoOn && !lawNoAuto());
  ab.setAttribute("aria-pressed", S.autoOn);
}

// タブ切り替え
document.querySelectorAll(".tab[data-tab]").forEach(tab => {
  tab.addEventListener("click", () => {
    if (tab.disabled) return;
    document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", t === tab ? "true" : "false"));
    ["matter", "nova", "bh", "crunch", "settings"].forEach(k => $("panel-" + k).hidden = k !== tab.dataset.tab);
    if (tab.dataset.tab === "bh") resizeBH();
    syncSettings();
  });
});

$("buyMax").addEventListener("click", () => { buyMax(); render(); });
$("autoBtn").addEventListener("click", () => { S.autoOn = !S.autoOn; render(); });
$("bhBtn").addEventListener("click", () => { blackhole(); render(); });
let crunchArmed = false;
$("crBtn").addEventListener("click", () => {
  // 全部リセットされるので、2回押しで確定
  if (!crunchArmed) {
    crunchArmed = true;
    $("crBtn").textContent = "もう一度押すとビッグクランチ（全部リセット）";
    setTimeout(() => { crunchArmed = false; render(); }, 4000);
    return;
  }
  crunchArmed = false;
  bigCrunch();
  render();
});
$("pullBtn").addEventListener("click", () => { if (pullLaw()) { pullAnimAt = performance.now(); render(); } });
$("shootingStar").addEventListener("click", catchStar);
$("goExport").addEventListener("click", () => {
  document.querySelector('.tab[data-tab="settings"]').click();
  document.getElementById("saveText").scrollIntoView({ block: "center" });
});
$("takeOver").addEventListener("click", async () => {
  await claimTab();
  await load();            // 向こうのタブが残した最新のセーブを読み直す
  shownStage = currentStage();
  buildTiers();
  syncSettings();
  const gap = (Date.now() - S.last) / 1000;
  if (gap > 5) applyOffline(gap);
  S.last = Date.now();
  document.getElementById("tabCover").hidden = true;
  render();
});
$("anMinus").addEventListener("click", () => { S.autoNovaAt = Math.max(1, S.autoNovaAt - 1); render(); });
$("anPlus").addEventListener("click", () => { S.autoNovaAt += 1; render(); });
$("anToggle").addEventListener("click", () => { S.autoNovaOn = !S.autoNovaOn; render(); });
$("novaBtn").addEventListener("click", () => { supernova(); render(); });

function syncSettings() {
  document.querySelectorAll("#notationSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === S.notation));
  document.querySelectorAll("#speedSeg button").forEach(b => b.setAttribute("aria-pressed", Number(b.dataset.v) === S.speed));
  document.querySelectorAll("#hintSeg button").forEach(b => b.setAttribute("aria-pressed", (b.dataset.v === "on") === S.hintOn));
  document.querySelectorAll("#flashSeg button").forEach(b => b.setAttribute("aria-pressed", (b.dataset.v === "on") === (S.flashOn !== false)));
}
document.querySelectorAll("#notationSeg button").forEach(b => b.addEventListener("click", () => { S.notation = b.dataset.v; syncSettings(); render(); }));
document.querySelectorAll("#speedSeg button").forEach(b => b.addEventListener("click", () => { S.speed = Number(b.dataset.v); syncSettings(); }));
document.querySelectorAll("#hintSeg button").forEach(b => b.addEventListener("click", () => { S.hintOn = b.dataset.v === "on"; syncSettings(); render(); }));
document.querySelectorAll("#flashSeg button").forEach(b => b.addEventListener("click", () => { S.flashOn = b.dataset.v === "on"; syncSettings(); }));

$("exportBtn").addEventListener("click", () => {
  const box = $("saveText");
  box.value = exportSave();
  const fallback = () => { box.focus(); box.select(); toast("書き出しました。欄の文字を長押ししてコピーしてね"); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(box.value).then(() => toast("書き出してコピーしました"), fallback);
  } else fallback();
});
let importArmed = false;
$("importBtn").addEventListener("click", () => {
  const box = $("saveText");
  if (!box.value.trim()) { toast("先に欄にセーブの文字列を貼り付けてね"); return; }
  if (!importArmed) {
    importArmed = true;
    $("importBtn").textContent = "今のセーブを上書きして読み込む";
    setTimeout(() => { importArmed = false; $("importBtn").textContent = "読み込む"; }, 4000);
    return;
  }
  importArmed = false;
  $("importBtn").textContent = "読み込む";
  try {
    importSave(box.value);
    shownStage = currentStage();
    buildTiers();
    syncSettings();
    save();
    render();
    box.value = "";
    toast(`読み込みました（星屑 ${fmt(S.stardust)}、超新星 ${S.supernovas}回）`);
  } catch (e) {
    toast("読み込めませんでした。「COSMOS1:」から始まる文字列を全部貼り付けてね");
  }
});

let wipeArmed = false;
$("wipe").addEventListener("click", async () => {
  if (!wipeArmed) {
    wipeArmed = true;
    $("wipe").textContent = "もう一度押すと消去";
    setTimeout(() => { wipeArmed = false; $("wipe").textContent = "消去"; }, 3000);
    return;
  }
  wipeArmed = false;
  $("wipe").textContent = "消去";
  await wipe();
  render();
  toast("セーブデータを消去しました");
});

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 3500);
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function flash(dark) {
  const f = $("flash");
  if (reduceMotion || S.flashOn === false) return;
  f.style.background = dark ? "#000" : "#fff";
  f.style.transition = "none";
  f.style.opacity = "0.95";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    f.style.transition = "";
    f.style.opacity = "0";
  }));
}

// ===== 宇宙のビジュアル =====
const cv = $("universe");
const ctx = cv.getContext("2d");
let W = 0, H = 0;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);

// 固定シードの乱数で、毎回同じ配置の塵を作る
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const specks = Array.from({ length: 160 }, () => ({ a: rnd() * Math.PI * 2, r: 0.15 + rnd() * 0.85, s: 0.02 + rnd() * 0.08, z: 0.6 + rnd() * 1.4 }));
const rocks = Array.from({ length: 30 }, () => ({ a: rnd() * Math.PI * 2, r: 0.25 + rnd() * 0.6, s: 0.1 + rnd() * 0.25, z: 2.5 + rnd() * 3.5, k: Math.floor(rnd() * 3) + 5 }));
const orbits = Array.from({ length: 8 }, (_, i) => ({ a: rnd() * Math.PI * 2, r: 0.26 + i * 0.09, s: 0.6 / (1 + i * 0.7), z: 2.5 + rnd() * 3 }));
const arms = Array.from({ length: 1200 }, () => ({ t: Math.pow(rnd(), 0.8), u: rnd(), off: (rnd() - 0.5) * 0.4, z: 0.6 + rnd() * 1.6 }));
const sparkles = Array.from({ length: 8 }, () => ({ t: 0.2 + rnd() * 0.7, a: rnd() * Math.PI * 2, ph: rnd() * 10 }));

let colors = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  ["--speck", "--rock", "--planet", "--star", "--line", "--accent", "--bh-core", "--bg", "--muted"].forEach(k => colors[k] = cs.getPropertyValue(k).trim());
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);
new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

let shownStage = 0, zoomStart = 0;
function currentStage() {
  for (let i = TIERS.length - 1; i >= 0; i--) if (S.amt[i] > 0) return i + 1;
  return 0;
}
const msN = i => msInfo(S.bought[i]).n;

function drawUniverse(now) {
  const t = now / 1000;
  ctx.clearRect(0, 0, W, H);
  const stage = currentStage();
  if (stage !== shownStage) {
    if (stage > shownStage) zoomStart = now;
    shownStage = stage;
  }
  // 新しい段に入ったとき、寄った状態から引いていく
  let zoom = 1;
  if (!reduceMotion) {
    const p = Math.min(1, (now - zoomStart) / 1600);
    zoom = 1 + 1.4 * Math.pow(1 - p, 3);
    // 買ったときに少し弾む
    zoom *= 1 + 0.035 * Math.exp(-(now - pulseAt) / 140);
  }
  const R = Math.min(W, H) * 0.46;
  ctx.save();
  ctx.translate(W / 2, H / 2 - 10);
  ctx.scale(zoom, zoom);

  // 塵（量に応じて増える）
  const speckCount = Math.min(specks.length, 24 + Math.floor(Math.log10(S.dust + 1) * 6));
  ctx.fillStyle = colors["--speck"];
  for (let k = 0; k < speckCount; k++) {
    const p = specks[k];
    const a = p.a + t * p.s * (stage >= 4 ? 0.3 : 1);
    ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t * 1.3 + k);
    ctx.fillRect(Math.cos(a) * p.r * R, Math.sin(a) * p.r * R * 0.8, p.z, p.z);
  }
  ctx.globalAlpha = 1;

  if (stage === 1) {
    // 岩：買うたびに1つずつ増える（30個まで）。節目ごとに少し大きくなる
    const n = Math.min(rocks.length, 1 + S.bought[0]);
    const grow = 1 + 0.12 * Math.min(6, msN(0));
    ctx.fillStyle = colors["--rock"];
    for (let k = 0; k < n; k++) {
      const p = rocks[k];
      const a = p.a + t * p.s;
      polygon(Math.cos(a) * p.r * R, Math.sin(a) * p.r * R * 0.6, p.z * grow, p.k, a);
    }
  }
  if (stage === 2) {
    // 惑星：買うほど大きく、節目で衛星と輪が増える。岩は惑星のまわりを回る
    const ms1 = msN(1);
    const pr = R * Math.min(0.3, 0.11 + 0.025 * Math.min(5, ms1) + 0.015 * Math.log10(S.bought[1] + 1));
    const nRock = Math.min(rocks.length, 3 + Math.floor(S.bought[0] / 6));
    ctx.fillStyle = colors["--rock"];
    for (let k = 0; k < nRock; k++) {
      const p = rocks[k];
      const a = p.a + t * p.s * 0.8;
      const rr = pr / R + 0.18 + (k % 5) * 0.05;
      const x = Math.cos(a) * rr * R, y = Math.sin(a) * rr * R * 0.4;
      if (Math.sin(a) < 0) polygon(x, y, p.z * 0.8, p.k, a); // 奥側は惑星より先に描く
    }
    if (ms1 >= 2) ring2d(pr, ms1, true);
    ctx.fillStyle = colors["--planet"];
    ctx.beginPath(); ctx.arc(0, 0, pr, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = colors["--speck"];
    ctx.beginPath(); ctx.arc(-pr * 0.35, -pr * 0.35, pr * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (ms1 >= 2) ring2d(pr, ms1, false);
    ctx.fillStyle = colors["--rock"];
    for (let k = 0; k < nRock; k++) {
      const p = rocks[k];
      const a = p.a + t * p.s * 0.8;
      const rr = pr / R + 0.18 + (k % 5) * 0.05;
      const x = Math.cos(a) * rr * R, y = Math.sin(a) * rr * R * 0.4;
      if (Math.sin(a) >= 0) polygon(x, y, p.z * 0.8, p.k, a);
    }
    // 衛星（節目1つごとに1つ、4つまで）
    for (let k = 0; k < Math.min(4, ms1); k++) {
      const a = t * (0.9 - k * 0.15) + k * 1.7;
      const rr = pr * (1.6 + k * 0.45);
      ctx.fillStyle = colors["--speck"];
      ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.5, 2.5 + k * 0.4, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (stage === 3) {
    // 恒星系：惑星を買うほど軌道が増え、恒星の節目で星が大きく明るくなる
    const nPl = Math.min(orbits.length, 1 + Math.floor(S.bought[1] / 10));
    const plGrow = 1 + 0.1 * Math.min(6, msN(1));
    for (let k = 0; k < nPl; k++) {
      const o = orbits[k];
      ctx.strokeStyle = colors["--line"];
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 0, o.r * R, o.r * R * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
      const a = o.a + t * o.s;
      const x = Math.cos(a) * o.r * R, y = Math.sin(a) * o.r * R * 0.45;
      ctx.fillStyle = colors["--planet"];
      ctx.beginPath(); ctx.arc(x, y, o.z * plGrow, 0, Math.PI * 2); ctx.fill();
      if (k % 2 === 1 && msN(1) >= 3) { // 衛星
        ctx.fillStyle = colors["--speck"];
        ctx.beginPath(); ctx.arc(x + Math.cos(t * 2 + k) * o.z * 2.4, y + Math.sin(t * 2 + k) * o.z * 1.2, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    const ms2 = Math.min(8, msN(2));
    glow(0, 0, R * (0.06 + 0.012 * ms2), R * (0.26 + 0.04 * ms2), t);
  }
  if (stage === 4) {
    // 銀河：銀河の節目で腕が増え、銀河や恒星を買うほど星が濃くなる
    const nArms = 2 + Math.min(3, msN(3));
    // 渦の腕は外へ行くほど時計回りに巻いているので、回転は反時計回り（腕が回転の後ろになびく向き）
    const rot = -t * 0.06;
    const n = Math.min(arms.length, 160 + S.bought[3] * 5 + Math.floor(S.bought[2] / 2));
    ctx.fillStyle = colors["--star"];
    for (let k = 0; k < n; k++) {
      const p = arms[k];
      const r = p.t * R * 0.95;
      const arm = Math.floor(p.u * nArms) * (Math.PI * 2 / nArms);
      const a = arm + p.t * 4.2 + p.off + rot;
      ctx.globalAlpha = 0.2 + 0.7 * (1 - p.t);
      ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r * 0.55, p.z, p.z);
    }
    // ときどき瞬く明るい星（恒星の節目で増える）
    for (let k = 0; k < Math.min(sparkles.length, msN(2)); k++) {
      const sp = sparkles[k];
      const tw = Math.max(0, Math.sin(t * 0.9 + sp.ph));
      if (tw < 0.6) continue;
      const a = sp.a + rot;
      ctx.globalAlpha = (tw - 0.6) * 2.5;
      ctx.beginPath(); ctx.arc(Math.cos(a) * sp.t * R, Math.sin(a) * sp.t * R * 0.55, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    glow(0, 0, R * (0.04 + 0.006 * Math.min(8, msN(3))), R * (0.22 + 0.03 * Math.min(8, msN(2))), t);
  }

  // 節目を越えたときの波紋
  if (!reduceMotion) {
    const p = (now - msPulseAt) / 800;
    if (p >= 0 && p < 1) {
      ctx.strokeStyle = colors["--accent"];
      ctx.globalAlpha = 1 - p;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, R * (0.15 + p), R * (0.15 + p) * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

// 惑星の輪（奥側と手前側に分けて描く）
function ring2d(pr, ms, back) {
  ctx.strokeStyle = colors["--rock"];
  ctx.lineWidth = Math.min(6, 1.5 + (ms - 2) * 1.2);
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.ellipse(0, 0, pr * 1.7, pr * 0.45, -0.25, back ? Math.PI : 0, back ? Math.PI * 2 : Math.PI);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ===== ブラックホールのビジュアル =====
const bcv = $("bhCanvas");
const bctx = bcv.getContext("2d");
let BW = 0, BHh = 0;
function resizeBH() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  BW = bcv.clientWidth; BHh = bcv.clientHeight;
  bcv.width = BW * dpr; bcv.height = BHh * dpr;
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", () => { if (!$("panel-bh").hidden) resizeBH(); });
function drawBH(now) {
  if (!BW) resizeBH();
  const c = bctx;
  c.clearRect(0, 0, BW, BHh);
  const R = Math.min(BW * 0.46, BHh * 1.1);
  c.save();
  c.translate(BW / 2, BHh / 2);
  const radii = [0.38, 0.62, 0.86];
  const tilt = 0.32;
  // 奥半分の円盤
  for (let i = RINGS.length - 1; i >= 0; i--) drawRing(c, i, radii[i] * R, tilt, true, now);
  // 本体
  const core = R * 0.16;
  const g = c.createRadialGradient(0, 0, core * 0.9, 0, 0, core * 1.8);
  g.addColorStop(0, colors["--accent"] + "aa");
  g.addColorStop(1, colors["--accent"] + "00");
  c.fillStyle = g;
  c.beginPath(); c.arc(0, 0, core * 1.8, 0, Math.PI * 2); c.fill();
  c.fillStyle = colors["--bh-core"];
  c.beginPath(); c.arc(0, 0, core, 0, Math.PI * 2); c.fill();
  // 手前半分の円盤
  for (let i = 0; i < RINGS.length; i++) drawRing(c, i, radii[i] * R, tilt, false, now);
  c.restore();
}
function drawRing(c, i, r, tilt, back, now) {
  const on = ringActive(i);
  const from = back ? Math.PI : 0, to = back ? Math.PI * 2 : Math.PI;
  c.lineWidth = on ? 3 : 1;
  c.strokeStyle = on ? colors["--accent"] : colors["--line"];
  c.globalAlpha = on ? (back ? 0.35 : 0.6) : 0.6;
  if (!on) c.setLineDash([4, 6]);
  c.beginPath(); c.ellipse(0, 0, r, r * tilt, 0, from, to); c.stroke();
  c.setLineDash([]);
  c.globalAlpha = 1;
  if (!on) return;
  // 今の周の位置に光の粒と尾
  const ph = (S.rings[i] % 1) * Math.PI * 2;
  for (let k = 0; k < 14; k++) {
    const a = ph - k * 0.06;
    const isBack = Math.sin(a) < 0;
    if (isBack !== back) continue;
    c.globalAlpha = (1 - k / 14) * (isBack ? 0.5 : 1);
    c.fillStyle = colors["--star"];
    c.beginPath(); c.arc(Math.cos(a) * r, Math.sin(a) * r * tilt, k === 0 ? 4.5 : 3 - k * 0.15, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
}

function polygon(x, y, r, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const rr = r * (0.75 + 0.25 * Math.sin(i * 2.3));
    i === 0 ? ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}
function glow(x, y, core, halo, t) {
  const pulse = 1 + 0.04 * Math.sin(t * 2);
  const g = ctx.createRadialGradient(x, y, 0, x, y, halo * pulse);
  g.addColorStop(0, colors["--star"]);
  g.addColorStop(0.3, colors["--star"] + "88");
  g.addColorStop(1, colors["--star"] + "00");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, halo * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = colors["--star"];
  ctx.beginPath(); ctx.arc(x, y, core, 0, Math.PI * 2); ctx.fill();
}

// ===== 流れ星 =====
// 遊んでいる間だけ、ときどき宇宙を横切る。タップすると、ランダムでいいことがある
const STAR_MIN_GAP = 60, STAR_MAX_GAP = 150; // 次の流れ星までの秒数（実時間）
const STAR_DURATION = 9;                     // 画面を横切る秒数
const STAR_LABEL_UNTIL = 3;                  // この回数つかまえるまでは「タップ！」の文字を出す
let starNextAt = performance.now() + (20 + Math.random() * 40) * 1000; // 最初の1つは早めに
let star = null;
function scheduleStar(now) {
  starNextAt = now + (STAR_MIN_GAP + Math.random() * (STAR_MAX_GAP - STAR_MIN_GAP)) * lawStarGap() * 1000;
}
function updateStar(now) {
  const el = $("shootingStar");
  if (!star) {
    if (now < starNextAt || document.hidden) return;
    const ltr = Math.random() < 0.5;
    star = { start: now, ltr, y0: 0.1 + Math.random() * 0.3, y1: 0.45 + Math.random() * 0.35 };
    el.classList.toggle("rtl", !ltr);
    el.classList.toggle("labeled", (S.starsCaught || 0) < STAR_LABEL_UNTIL);
    el.hidden = false;
    // まだ一度もつかまえたことがなければ、何ができるかを知らせる
    if (!S.starsCaught) toast("流れ星が来た！ タップするといいことがある");
  }
  const p = (now - star.start) / (STAR_DURATION * 1000);
  if (p >= 1) { star = null; el.hidden = true; scheduleStar(now); return; }
  const wrap = el.parentElement;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const x = star.ltr ? -0.1 + 1.2 * p : 1.1 - 1.2 * p;
  const y = star.y0 + (star.y1 - star.y0) * p;
  el.style.transform = `translate(${x * w - 22}px, ${y * h - 22}px)`;
}
function catchStar() {
  const el = $("shootingStar");
  if (!star) return;
  star = null;
  el.hidden = true;
  scheduleStar(performance.now());
  S.starsCaught = (S.starsCaught || 0) + 1;
  const rewards = [
    () => { S.windBoost = WIND_TIME; return `追い風！ ${WIND_TIME}秒間、塵の生産 ×${WIND_MULT}`; },
    () => { const g = dustPerSec() * 60; S.dust += g; return `塵の雨！ 塵 +${fmt(g)}（60秒分）`; },
  ];
  if (S.blackholes > 0) rewards.push(() => {
    for (let k = 0; k < RINGS.length; k++) if (ringActive(k)) S.rings[k] += 3;
    return "軌道の加速！ 降着円盤がそれぞれ3周進んだ";
  });
  const msg = rewards[Math.floor(Math.random() * rewards.length)]();
  toast(`流れ星をつかまえた！ ${msg}`);
  render();
}

// ===== ゲームループ =====
let lastUI = 0, lastSave = 0;
function loop(now) {
  if (!tabActive) { requestAnimationFrame(loop); return; }
  const wall = Date.now();
  const gap = (wall - S.last) / 1000;
  if (gap > 5) applyOffline(gap);          // 裏に回っていた分は留守中扱い
  else if (gap > 0) { tick(gap * S.speed); autoNova(false); }
  S.last = wall;

  drawUniverse(now);
  updateStar(now);
  if (!$("panel-bh").hidden) drawBH(now);
  if (now - lastUI > 100) { render(); lastUI = now; }
  if (now - lastSave > 10000) { save(); lastSave = now; }
  requestAnimationFrame(loop);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { S.last = Date.now(); save(); }
});

// ブラウザに「このサイトのデータは消さないで」とお願いする。
// SafariやChromeは、そのサイトでどれだけ操作してきたかを見て、聞かずに許可するか決める。
// 起動時と、最初に画面を触ったときに1回ずつ頼む（操作のあとの方が通りやすいため）
async function requestPersist() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    if (await navigator.storage.persisted()) return;
    await navigator.storage.persist();
  } catch (e) { /* 使えない環境では何もしない */ }
}
document.addEventListener("pointerdown", requestPersist, { once: true });

(async function start() {
  requestPersist();
  if (await otherTabAlive()) {
    tabActive = false;
    document.getElementById("tabCover").hidden = false;
  }
  await load();
  resize();
  readColors();
  buildTiers();
  buildShop();
  buildBH();
  syncSettings();
  shownStage = currentStage();
  const gap = (Date.now() - S.last) / 1000;
  if (gap > 5) applyOffline(gap);
  S.last = Date.now();
  render();
  requestAnimationFrame(loop);
})();
