// ===== バージョンと更新履歴 =====
// 更新したら GAME_VERSION を1つ増やし、version.json の数字も同じにして、CHANGELOG の先頭に追記する
const GAME_VERSION = 5;
const CHANGELOG = [
  { v: 5, date: "試作", items: [
    "【試作版】部品にそれぞれ損を付けた。加速の軸は1周の効果も半分、共鳴の石は付けた円盤が止まる（そのかわり直列の判定から外れる）",
    "【試作版】部品は加速の軸・重り・共鳴の石の3つから。外側の円盤などを手に入れると順番に出てくる。質量でLv3まで強化できる（強くなるだけで、周期は変わらない）",
    "【試作版】ブラックホールを5回起こすと、上級の部品「はみ出し歯車」が出てくる。付ける場所によって直列が崩れる",
    "【試作版】降着円盤の周期を「刻」で数えるようにした。内側2刻・中間6刻・外側24刻で1周",
    "【試作版】円盤が全部同時に1周し終わると「直列」。6刻のあいだ、円盤の上乗せ分が3倍になる",
    "【試作版】「円盤を加速」をなくして、質量ショップで「部品」を買うようにした。部品は円盤に1つずつ付けられて、周期や効果が変わる",
    "【試作版】部品を付け替えると、その円盤は区切りのいい刻まで止まって回り直す（回りかけの1周はなくなる）",
  ] },
  { v: 4, date: "11/28", items: [
    "超新星・ブラックホール・ビッグクランチのタブに「最近の〜」の履歴を追加。タップで開くと、かかった時間ともらえた量が見られる（この版から記録を始める）",
  ] },
  { v: 3, date: "11/28", items: [
    "はじめての超新星の前に、起こすと何がいいのか（もらえる星屑・買える強化・粘りすぎると損なこと）を超新星タブに出すようにした。1回起こすと消える",
  ] },
  { v: 2, date: "11/28", items: [
    "セーブの書き出しの文字列を、大文字・小文字が変わっても読み込める形にした（「COSMOS2:」から始まる）。前の「COSMOS1:」の文字列もそのまま読み込める",
  ] },
  { v: 1, date: "11/28", items: [
    "アップデートのお知らせを出すようにした。遊んでいる途中に新しい版が出たら、画面の下に「更新する」の案内が出る",
    "輝き・重力の値段を見直した（レベルが上がるほど高くなる）",
    "ビッグクランチと法則カードを追加。条件は「1回の周回で塵1e50」と「質量を35持っていること」",
    "ブラックホールに必要な星屑が、回数に応じて増えるようにした（最初は30、そのあと200→400→800）",
    "残光は「前の周回の長さの1/3（最大60秒）」だけ続くようにした",
    "流れ星を追加（タップするといいことがある）。PCなど横に広い画面では2列で表示",
  ] },
];

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
const AFTERGLOW_TIME = 60;                       // 残光が続く最大の秒数
const AFTERGLOW_RATIO = 1 / 3;                   // 残光は「前の周回の長さ」のこの割合だけ続く（周回の頭だけに効くように）
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
const massGainFor = sd => {
  if (sd < bhReq()) return 0;
  let g = Math.max(0, Math.floor(Math.log2(sd / massBase()))) + lawMassBonus();
  if ((S.blackholes || 0) === 0) g = Math.max(g, FIRST_BH_MASS + lawMassBonus());
  return g;
};
const massNextAt = g => massBase() * Math.pow(2, g + 1 - lawMassBonus()); // 質量が g+1 になる星屑の量
// 円盤の周期は「刻（こく）」で数える。1刻の長さは法則カードで短くなる
const KOKU_SEC = 5;                                   // 1刻の秒数（法則カードなし）
const ALIGN_KOKU = 6;                                 // 直列が続く刻数
const RINGS = [
  { name: "内側の円盤", koku: 2,  per: 0.1,  target: "塵の生産" },
  { name: "中間の円盤", koku: 6,  per: 0.04, target: "惑星・恒星・銀河の生産" },
  { name: "外側の円盤", koku: 24, per: 0.07, target: "超新星で手に入る星屑" },
];
// 円盤に付ける部品（各円盤に1つ。同じ部品は1つしか持てない）
// 基本の3つは周期を「半分」か「2倍」にするだけなので、直列は崩れない。
// はみ出し歯車だけは周期を1刻ずらすので、付ける場所によって直列が崩れる（上級の部品・パズル担当）
// 強化は強くなるだけで、周期は変わらない（ビッグクランチまでのつなぎ）
const ODD_UNLOCK_BH = 5; // はみ出し歯車が出てくるブラックホールの回数
const PARTS = [
  { id: "p_fast",   name: "加速の軸",     costs: [3, 5, 7],
    eff: lv => `1周が半分になるけど、1周ごとの効果も ×${(0.4 + 0.1 * lv).toFixed(1)}。直列が起きやすくなる` },
  { id: "p_weight", name: "重り",         costs: [4, 6, 8], needs: "ring1",
    eff: lv => `1周が2倍になるけど、1周ごとの効果が${2 + lv}倍` },
  { id: "p_reso",   name: "共鳴の石",     costs: [5, 7, 9], needs: "ring2",
    eff: lv => `付けた円盤は止まる（周回数が増えない）。そのかわり直列の判定から外れて、直列の倍率が ×3 → ×${3 + 2 * lv}` },
  { id: "p_odd",    name: "はみ出し歯車", costs: [5, 7, 9], unlock: () => S.blackholes >= ODD_UNLOCK_BH, advanced: true,
    eff: lv => `1周が1刻長くなるけど、周回数が${1 + lv}倍たまる。付ける場所によっては直列が崩れる` },
];
const partById = id => PARTS.find(p => p.id === id);
const partName = id => `${partById(id).name}${mlvl(id) > 1 ? " Lv" + mlvl(id) : ""}`;
// 質量ショップ（cost(lv)、max、needs = 先に必要な強化）
const MUPGRADES = [
  { id: "ring1",    name: "中間の円盤",       desc: `2つ目の円盤ができる。${RINGS[1].koku}刻で1周し、1周ごとに${RINGS[1].target}が +${RINGS[1].per}倍`, max: 1,
    cost: () => 2,                   effect: lv => lv ? "あり" : "なし" },
  { id: "ring2",    name: "外側の円盤",       desc: `3つ目の円盤ができる。${RINGS[2].koku}刻で1周し、1周ごとに${RINGS[2].target}が +${RINGS[2].per}倍`, max: 1, needs: "ring1",
    cost: () => 4,                   effect: lv => lv ? "あり" : "なし" },
  ...PARTS.map(p => ({ id: p.id, name: `部品：${p.name}`, desc: p.advanced ? "上級の部品。円盤に付けて使う" : "円盤に付けて使う。強化すると強くなる",
    max: 3, part: true, needs: p.needs, unlock: p.unlock,
    cost: lv => p.costs[lv], effect: lv => lv ? p.eff(lv) : "なし" })),
  { id: "autoNova", name: "自動超新星",       desc: "恒星が決めた段階に届いたら、自動で超新星を起こす", max: 1,
    cost: () => 2,                   effect: lv => lv ? "あり" : "なし" },
  { id: "keepAuto", name: "自動購入の記憶",   desc: "ブラックホールを起こしても、星屑ショップの自動購入が残る", max: 1,
    cost: () => 2,                   effect: lv => lv ? "残る" : "残らない" },
];
const freshMup = () => Object.fromEntries(MUPGRADES.map(u => [u.id, 0]));
const mlvl = id => (S.mup && S.mup[id]) || 0;
const ringActive = i => S.blackholes > 0 && (i === 0 || mlvl("ring" + i) > 0);
const ringLaps = i => Math.floor((S.rings[i] || 0) + 1e-9);
// 部品を付けたときの周期（刻）と、1周でたまる周回数
const periodWith = (i, part) => {
  const b = RINGS[i].koku;
  if (part === "p_fast") return Math.ceil(b / 2);
  if (part === "p_weight") return b * 2;
  if (part === "p_odd") return b + 1;
  return b;
};
const ringPeriodK = i => periodWith(i, S.equip[i]);
const lapValueWith = part => {
  const lv = part ? Math.max(1, mlvl(part)) : 0;
  if (part === "p_fast") return 0.4 + 0.1 * lv;
  if (part === "p_weight") return 2 + lv;
  if (part === "p_odd") return 1 + lv;
  return 1;
};
const resoOn = () => S.equip.some((p, i) => p === "p_reso" && ringActive(i));
const alignMult = () => resoOn() ? 3 + 2 * Math.max(1, mlvl("p_reso")) : 3;
const alignLen = () => ALIGN_KOKU;
const aligned = () => S.alignLeft > 0;
const ringMult = i => ringActive(i) ? 1 + RINGS[i].per * ringLaps(i) * (aligned() ? alignMult() : 1) : 1;
const gcd = (a, b) => b ? gcd(b, a % b) : a;
const lcm = (a, b) => a / gcd(a, b) * b;
// 直列の間隔（刻）。円盤が2つ以上回っていないと直列は起きない
const alignEvery = periods => periods.length >= 2 ? periods.reduce(lcm) : 0;
const activeRings = () => [0, 1, 2].filter(ringActive);
// 共鳴の石を付けた円盤は止まって、直列の判定から外れる
const stoppedWith = (i, eq) => eq[i] === "p_reso";
const alignRingsWith = eq => activeRings().filter(i => !stoppedWith(i, eq));
const alignRings = () => alignRingsWith(S.equip);
// 次の直列まであと何刻か
function kokuToAlign() {
  const act = alignRings();
  const L = alignEvery(act.map(ringPeriodK));
  if (!L) return null;
  const from = Math.max(S.koku, ...act.map(i => S.ringPause[i]));
  const next = (Math.floor(from / L) + 1) * L;
  return { left: next - S.koku, every: L };
}
let alignFlashAt = 0;
// 刻を進める：区切りの刻ごとに、1周し終わった円盤に周回数を足し、全部そろったら直列
function advanceRings(dt, live) {
  const dk = dt / KOKU_SEC * lawSpin();
  const k0 = S.koku, k1 = k0 + dk;
  S.koku = k1;
  if (S.alignLeft > 0) S.alignLeft = Math.max(0, S.alignLeft - dk);
  const act = alignRings(); // 回っている円盤（止まっている円盤は周回数も増えない）
  if (!act.length) return;
  for (let k = Math.floor(k0) + 1; k <= Math.floor(k1 + 1e-9); k++) {
    let done = 0;
    for (const i of act) {
      if (k <= S.ringPause[i] || k % ringPeriodK(i) !== 0) continue;
      S.rings[i] += lapValueWith(S.equip[i]);
      done++;
    }
    if (act.length >= 2 && done === act.length) {
      // 直列は「直列の間隔の半分」までしか続かない（ずっと直列にならないように）
      const len = Math.min(alignLen(), alignEvery(act.map(ringPeriodK)) / 2);
      S.alignLeft = Math.max(0, len - (k1 - k));
      S.alignCount = (S.alignCount || 0) + 1;
      if (live) { alignFlashAt = performance.now(); showAlignBanner(); }
    }
  }
}

// ===== ビッグクランチと法則カード =====
const CRUNCH_REQ = 1e50;         // 1回の周回で塵がこれだけ貯まったらビッグクランチを起こせる
const CRUNCH_MASS = 35;          // さらに、質量をこれだけ持っていること（使わずに貯めておく必要がある）
const crunchMassOk = () => S.mass >= CRUNCH_MASS;
const crunchReady = () => seedGainFor(S.runPeak) > 0 && crunchMassOk();
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
  { id: "spin",   rar: "c", name: "回る円盤",   good: lv => `1刻が短くなる（円盤の回転 ×${(1 + 0.2 * lv).toFixed(1)}）` },
  { id: "meteor", rar: "c", name: "流れ星の夜", good: lv => `流れ星が出る間隔 ×${Math.pow(0.85, lv).toFixed(2)}` },
  { id: "cheap",  rar: "c", name: "安い星",     good: lv => `値上がり幅 −${5 * lv}%` },
  { id: "heavy",  rar: "r", name: "重い宇宙",   good: lv => `節目の倍率 ×${(1.2 + 0.1 * lv).toFixed(1)}`, bad: "値上がり幅 +30%" },
  { id: "light",  rar: "r", name: "速い光",     good: lv => `惑星・恒星・銀河の生産 ×${2 + lv}`, bad: "岩の生産 ×0.5" },
  { id: "cold",   rar: "r", name: "冷えた宇宙", good: lv => `1刻が短くなる（円盤の回転 ×${(2 + 0.5 * lv).toFixed(1)}）`, bad: "星屑ショップで残光が買えない" },
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
// ブラックホールに必要な星屑は、起こすたびに倍になる（100 → 200 → 400 → 800、そこから先は800のまま）。
// ビッグクランチで回数が0に戻るので、また100から。
// 周期の後半で星屑が一気に増えるので、要求が低いままだと「届いたらすぐ起こす」が損な選択になるため
const BH_REQ_STEPS = 3;
const FIRST_BH_REQ = 30;     // 最初のブラックホール（宇宙ごと）だけは軽く。序盤のつかみなので
const FIRST_BH_MASS = 2;    // 最初のブラックホールでもらえる質量の最低保証（中間の円盤がすぐ買えるように）
const bhReq     = () => ((S.blackholes || 0) === 0 ? FIRST_BH_REQ : BH_REQ_BASE * Math.pow(2, Math.min(S.blackholes, BH_REQ_STEPS))) * bhReqMult();
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
  { id: "afterglow", name: "残光",      desc: `超新星の直後、塵の生産が一時的に跳ね上がる。前の周回の長さの1/3だけ続く（最大${AFTERGLOW_TIME}秒）`, max: 5,
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
const SAVE_KEY = "cosmos-save-proto"; // 試作版は本編とセーブを分ける

// ===== 記録 =====
const HIST_MAX = { nova: 10, bh: 5, crunch: 5 };
const freshHist = () => ({ nova: [], bh: [], crunch: [] });
// play: 画面を開いていた時間（秒）、away: 閉じていた時間（秒、上限なし）
// first: 初めて超新星・ブラックホール・ビッグクランチに届いたときの { play, away, at(日時) }
const freshStats = () => ({ play: 0, away: 0, first: {} });
let histVer = 0; // 履歴が変わったら増やす（表示の作り直し用）
function pushHist(kind, entry) {
  const list = S.hist[kind] || (S.hist[kind] = []);
  list.unshift(entry);
  if (list.length > HIST_MAX[kind]) list.length = HIST_MAX[kind];
  histVer++;
}
function markFirst(kind) {
  if (S.stats.first[kind]) return;
  S.stats.first[kind] = { play: Math.round(S.stats.play), away: Math.round(S.stats.away), at: Date.now() };
}
// 留守中の自動超新星は1行にまとめる
let awayNova = null;

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
    afterglowMax: 0,    // 今回の残光の長さ（前の周回の長さの1/3、最大60秒）
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
    lawDraft: null,     // 次の宇宙の法則の下書き（null なら今の法則のまま）
    choosing: false,    // ビッグクランチ後、法則を選ぶ画面を開いている（この間は時間が止まる）
    chooseOnCrunch: true, // ビッグクランチ後に法則を選ぶ画面を出すか（設定）
    flashOn: true,      // 超新星などで画面をフラッシュさせるか
    starsCaught: 0,     // 流れ星をつかまえた回数
    seenVersion: GAME_VERSION, // お知らせを読んだバージョン
    costV3: true,       // 輝き・重力が値上げされてからのセーブか
    hintOn: true,       // 起こしどきのヒントを出すか（ブラックホール後のみ）
    autoNovaAt: 3,      // 自動超新星：星屑がこの数以上もらえるときに起こす
    runTime: 0,         // この周回（前の超新星から）の経過秒数
    bhTime: 0,          // 今のブラックホール周期の経過秒数（超新星では消えない）
    koku: 0,            // このブラックホール周期の経過刻数（円盤の時計）
    ringPause: [0, 0, 0], // 部品を付け替えた円盤は、この刻まで止まる
    alignLeft: 0,       // 直列の残り刻数
    alignCount: 0,      // このブラックホール周期で起きた直列の回数
    equip: [null, null, null], // 円盤に付けている部品
    bhNovas: 0,         // 今のブラックホール周期で起こした超新星の回数
    crunchTime: 0,      // 今の宇宙（前のビッグクランチから）の経過秒数
    hist: freshHist(),  // 最近の超新星・ブラックホール・ビッグクランチの記録（画面の履歴用）
    stats: freshStats(), // 遊んだ時間の合計と、初めて届いたときの記録（セーブにだけ残す。調整用）
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
// 残光：超新星直後に最大、afterglowMax秒かけて×1まで直線的に下がる（岩だけ）
const afterglowMult = i => {
  if (i !== 0 || !S.afterglow || lvl("afterglow") === 0 || law("cold")) return 1;
  const len = S.afterglowMax || AFTERGLOW_TIME;
  return 1 + (afterglowPeakAt(lvl("afterglow")) - 1) * Math.min(1, S.afterglow / len);
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
  S.bhTime += dt;
  S.crunchTime += dt;
  const rate = runRate();
  if (rate > S.runBestRate) S.runBestRate = rate;
  const base = snBase();
  if (base > S.runLastBase) { S.runLastBase = base; S.runJumpRate = rate; }
  advanceRings(dt, !offlineRunning);
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
const META_KEYS = ["equip", "hist", "stats", "crunchTime", "seenVersion", "lawDraft", "chooseOnCrunch", "starsCaught", "costV3", "flashOn", "seeds", "cards", "laws", "crunches", "crunchSeen", "pity", "lastPull", "windBoost", "notation", "speed", "last", "mass", "massTotal", "blackholes", "bhSeen", "mup", "autoNovaOn", "autoNovaAt", "hintOn", "supernovas", "stardustTotal", "memV2", "compV2"];
function keepMeta() { const k = {}; META_KEYS.forEach(key => k[key] = S[key]); return k; }

// silent: 留守中の計算など、何も出さない / auto: 自動超新星（フラッシュとお知らせは出さず、保存はいつものタイミングで）
function supernova(silent, auto) {
  if (snGain() <= 0) return;
  const g = rollGain();
  // 残光の長さは、終わった周回の長さで決まる（周回が短いほど、残光も短い）
  const glowLen = Math.min(AFTERGLOW_TIME, S.runTime * AFTERGLOW_RATIO);
  const sg = safeNum(g);
  if (silent) {
    // 留守中：まとめて1行にする
    if (!awayNova) awayNova = { n: 0, t: 0, g: 0 };
    awayNova.n++; awayNova.t += S.runTime; awayNova.g += sg;
  } else {
    pushHist("nova", { no: S.supernovas + 1, t: Math.round(S.runTime * 10) / 10, g: sg, auto: auto ? 1 : 0 });
  }
  markFirst("nova");
  if (!silent && !auto) toast(S.supernovas === 0
    ? `はじめての超新星！ 星屑 +${fmt(g)}。下の星屑ショップで強化を買おう`
    : `超新星！ 星屑 +${fmt(g)}`);
  const keep = Object.assign(keepMeta(), {
    stardust: S.stardust + g, stardustTotal: S.stardustTotal + g, supernovas: S.supernovas + 1,
    cycleStardust: S.cycleStardust + g, bhNotified: S.bhNotified, bhTime: S.bhTime, bhNovas: S.bhNovas + 1, koku: S.koku, ringPause: S.ringPause, alignLeft: S.alignLeft, alignCount: S.alignCount, rings: S.rings, up: S.up, autoOn: S.autoOn, novaSeen: true,
  });
  S = Object.assign(freshState(), keep);
  S.afterglow = glowLen;
  S.afterglowMax = glowLen;
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
  pushHist("bh", { no: S.blackholes + 1, t: Math.round(S.bhTime), novas: S.bhNovas, g: safeNum(g) });
  markFirst("bh");
  const up = freshUp();
  if (mlvl("keepAuto")) up.auto = lvl("auto");
  const keep = Object.assign(keepMeta(), {
    mass: S.mass + g, massTotal: S.massTotal + g, blackholes: S.blackholes + 1, bhSeen: true,
    up, autoOn: S.autoOn, novaSeen: true,
  });
  S = Object.assign(freshState(), keep);
  toast(S.blackholes === ODD_UNLOCK_BH ? `ブラックホール！ 質量 +${fmt(g)}。質量ショップに上級の部品「はみ出し歯車」が出てきた` : `ブラックホール！ 質量 +${fmt(g)}`);
  flash(true);
  save();
  buildTiers();
}

// ビッグクランチで消えないもの（設定・記録・法則カードまわり）
const CRUNCH_KEYS = ["hist", "stats", "seenVersion", "chooseOnCrunch", "starsCaught", "costV3", "flashOn", "notation", "speed", "last", "hintOn", "supernovas", "stardustTotal", "memV2", "compV2",
  "seeds", "cards", "laws", "pity", "lastPull", "autoNovaOn", "autoNovaAt", "autoOn", "windBoost"];
// ビッグクランチと「法則を変えて作り直す」で共通の、宇宙のリセット
const keepAutomationNow = () => S.crunches >= 1; // 1回目のビッグクランチのあとからは、自動化が消えない
function resetUniverse(extra) {
  const k = {};
  CRUNCH_KEYS.forEach(key => k[key] = S[key]);
  const up = freshUp(), mup = freshMup();
  if (keepAutomationNow()) {
    up.auto = lvl("auto");
    mup.autoNova = mlvl("autoNova");
    mup.keepAuto = mlvl("keepAuto");
  }
  Object.assign(k, { crunches: S.crunches, crunchSeen: true, novaSeen: true, bhSeen: true, up, mup }, extra);
  S = Object.assign(freshState(), k);
}
function bigCrunch() {
  const g = seedGainFor(S.runPeak);
  if (g <= 0 || !crunchMassOk()) return;
  const choose = S.chooseOnCrunch !== false;
  pushHist("crunch", { no: S.crunches + 1, t: Math.round(S.crunchTime), bhs: S.blackholes, g: safeNum(g) });
  markFirst("crunch");
  resetUniverse({ seeds: S.seeds + g, crunches: S.crunches + 1 });
  if (choose) { S.choosing = true; S.lawDraft = S.laws.slice(); }
  toast(`ビッグクランチ！ 宇宙の種 +${fmt(g)}`);
  flash(true);
  save();
  buildTiers();
  if (choose) openChooser();
}
// 下書きの法則で宇宙を作り直す（ビッグクランチと同じリセット、宇宙の種はもらえない）
function rebuildUniverse() {
  if (!draftChanged()) return;
  const laws = currentDraft().slice();
  resetUniverse({ laws, lawDraft: null });
  toast("新しい法則で宇宙を作り直した");
  flash(true);
  save();
  buildTiers();
}
// 法則を選ぶ画面で「始める」：時間を動かし始める
function startUniverse(laws) {
  S.laws = laws.slice(0, lawSlots());
  S.lawDraft = null;
  S.choosing = false;
  S.last = Date.now();
  closeChooser();
  save();
  render();
}

// ===== アップデートのお知らせ =====
// 開いたとき、前回より新しい版なら変更点を、セーブを書き換えたならその説明を出す
function showUpdateNotice() {
  const news = CHANGELOG.filter(c => c.v > (S.seenVersion || 0)).slice(0, 5);
  const notes = migrationNotes.slice();
  migrationNotes = [];
  if (!news.length && !notes.length) { S.seenVersion = GAME_VERSION; return; }
  const box = $("noticeBody");
  box.innerHTML = "";
  if (notes.length) {
    const h = document.createElement("p");
    h.className = "notice-reset";
    h.textContent = "進み具合が一部リセットされました";
    box.appendChild(h);
    const ul = document.createElement("ul");
    ul.className = "notice-list reset";
    notes.forEach(t => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
    box.appendChild(ul);
  }
  news.forEach(c => {
    const h = document.createElement("p");
    h.className = "notice-ver num";
    h.textContent = `バージョン ${c.v}（${c.date}）`;
    box.appendChild(h);
    const ul = document.createElement("ul");
    ul.className = "notice-list";
    c.items.forEach(t => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
    box.appendChild(ul);
  });
  $("updateNotice").hidden = false;
}
function closeUpdateNotice() {
  $("updateNotice").hidden = true;
  S.seenVersion = GAME_VERSION;
  save();
}
// 遊んでいる途中に新しい版が出ていないか、ときどき確かめる（version.json の数字と比べる）
async function checkNewVersion() {
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    if (typeof j.version === "number" && j.version > GAME_VERSION) {
      $("newVersionBar").hidden = false;
      document.body.classList.add("has-update");
    }
  } catch (e) { /* ファイルとして開いているときなどは確かめない */ }
}
setInterval(() => { if (!document.hidden) checkNewVersion(); }, 5 * 60 * 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkNewVersion(); });

// ===== 法則の下書き =====
const currentDraft = () => S.lawDraft || S.laws;
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const draftChanged = () => !!S.lawDraft && !sameSet(S.lawDraft, S.laws);

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
// カードを付け外しすると、今の法則ではなく下書きが変わる（使うには作り直しが必要）
function toggleLaw(id) {
  const d = currentDraft().slice();
  const i = d.indexOf(id);
  if (i >= 0) d.splice(i, 1);
  else if (d.length < lawSlots() && S.cards[id]) d.push(id);
  S.lawDraft = d;
  if (!S.choosing && sameSet(d, S.laws)) S.lawDraft = null; // 今と同じに戻ったら下書きは消す
  save();
}

function protoBH() { S.blackholes += 1; S.bhSeen = true; toast(`試作用：ブラックホールの回数 ${S.blackholes}`); save(); }
let protoStartArmed = 0;
function protoStart() {
  // 2回押しで確定（今のセーブを上書きするので）
  if (Date.now() - protoStartArmed > 4000) { protoStartArmed = Date.now(); toast("今の進み具合を上書きするよ。もう一度押すと始まる"); return; }
  const keep = { flashOn: S.flashOn, notation: S.notation, hintOn: S.hintOn, seenVersion: S.seenVersion };
  S = Object.assign(freshState(), keep, {
    blackholes: 5, bhSeen: true, novaSeen: true, supernovas: 300, stardustTotal: 5000,
    mass: 12, massTotal: 40, autoOn: true, autoNovaOn: true, autoNovaAt: 1,
  });
  S.up.auto = 4;
  Object.assign(S.mup, { ring1: 1, ring2: 1, autoNova: 1, keepAuto: 1 });
  starNextAt = Date.now() + 30000;
  buildTiers(); buildShop(); buildBH(); render(); save();
  toast("試作用：ブラックホール5回のあとの周期から始めた。質量12で部品を買ってみてね");
}
function protoMass() { S.mass += 10; S.massTotal += 10; if (!S.blackholes) { S.blackholes = 1; S.bhSeen = true; } toast("試作用：質量 +10"); save(); }
function buyMassUpgrade(u) {
  const lv = mlvl(u.id);
  if (lv >= u.max) return;
  if (u.needs && !mlvl(u.needs)) return;
  if (u.unlock && !u.unlock()) return;
  const c = u.cost(lv);
  if (S.mass < c) return;
  S.mass -= c;
  S.mup[u.id] = lv + 1;
  save();
}

// 法則のせいで買えない強化（冷えた宇宙では残光が買えない）
const upgradeBlocked = u => u.id === "afterglow" && law("cold") > 0;
function buyUpgrade(u) {
  if (upgradeBlocked(u)) return;
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
try { tabChannel = new BroadcastChannel("cosmos-tabs-proto"); } catch (e) {}
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
let migrationNotes = []; // セーブの読み込みで進み具合を変えたときの説明（お知らせに出す）
function applySave(d) {
  migrationNotes = [];
  {
    {
      S = Object.assign(freshState(), d);
      if (d.seenVersion === undefined) S.seenVersion = 0; // お知らせ機能より前のセーブ
      clampState(); // 壊れた数（null・NaN・∞）が入っていたら直す
      S.up = Object.assign(freshUp(), d.up || {});
      S.mup = Object.assign(freshMup(), d.mup || {});
      if (!d.cards) S.cards = {};
      S.hist = Object.assign(freshHist(), d.hist || {});
      histVer++;
      S.stats = Object.assign(freshStats(), d.stats || {});
      S.stats.first = Object.assign({}, S.stats.first);
      if (!d.stats) {
        // 記録を始める前のセーブ：もう届いている段階は「記録なし」にしておく（次に起こした時を初回と数えないように）
        S.stats.legacy = true;
        if (S.supernovas > 0) S.stats.first.nova = { old: 1 };
        if (S.massTotal > 0 || S.blackholes > 0 || S.crunches > 0) S.stats.first.bh = { old: 1 };
        if (S.crunches > 0) S.stats.first.crunch = { old: 1 };
      }
      if (!d.costV3) {
        // 輝き・重力を値上げしたので、旧価格（1, 2, 3…）で払い戻してLv0に戻す。
        // 旧価格で育った今の周回（塵が桁違いに多い）も、ここでやり直しにする
        const tri = n => n * (n + 1) / 2;
        const refund = tri(S.up.glow || 0) + tri(S.up.gravity || 0);
        if (refund > 0 || S.dust > 10) migrationNotes.push(`輝き・重力の値段が変わったため、輝き・重力をLv0に戻し、星屑 ${fmt(refund)} を払い戻しました。今の周回（塵と岩〜銀河）もやり直しになっています。`);
        S.stardust += refund;
        S.up.glow = 0; S.up.gravity = 0;
        const f = freshState();
        ["dust", "amt", "bought", "runPeak", "runTime", "runBestRate", "runLastBase", "runJumpRate", "crunchNotified"].forEach(k => S[k] = f[k]);
        S.costV3 = true;
      }
      if (!Array.isArray(d.laws)) S.laws = [];
      if (!Array.isArray(d.lawDraft)) S.lawDraft = null;
      if (!S.mup.autoNova && d.autoNovaAt === 5) S.autoNovaAt = 3; // 初期値を5→3に変えたので、まだ使っていない人は3に
      if (d.runTime === undefined) S.runTime = 0;
      if (!Array.isArray(d.rings)) S.rings = [0, 0, 0];
      if (!Array.isArray(d.equip)) S.equip = [null, null, null];
      if (!Array.isArray(d.ringPause)) S.ringPause = [0, 0, 0];
      {
        // 「円盤を加速」は部品に置き換えたので、使った質量を返す
        const om = d.mup || {};
        let r = 0;
        for (let lv = 0; lv < (om.spd0 || 0); lv++) r += Math.pow(2, lv);
        for (let lv = 0; lv < (om.spd1 || 0); lv++) r += 2 * Math.pow(2, lv);
        for (let lv = 0; lv < (om.spd2 || 0); lv++) r += 3 * Math.pow(2, lv);
        ["spd0", "spd1", "spd2"].forEach(k => delete S.mup[k]);
        // 試作版の途中でなくした「流星の軸」も返す
        for (let lv = 0; lv < (om.p_meteor || 0); lv++) r += [2, 3, 4][lv];
        delete S.mup.p_meteor;
        S.equip = S.equip.map(e => e === "p_meteor" ? null : e);
        if (r > 0) {
          S.mass += r;
          migrationNotes.push(`「円盤を加速」（や試作版でなくなった部品）に使った質量 ${fmt(r)} を返しました。`);
        }
      }
      if (d.cycleStardust === undefined) S.cycleStardust = S.stardustTotal; // ブラックホール追加前のセーブ
      if (!d.compV2 && S.up.compress > 0) { // 圧縮を値上げしたので、旧価格（1, 2, 3…）で払い戻してLv0に戻す
        let r = 0;
        for (let lv = 0; lv < Math.min(S.up.compress, 5); lv++) r += 1 + lv;
        S.stardust += r;
        migrationNotes.push(`圧縮の値段が変わったため、圧縮をLv0に戻し、星屑 ${fmt(r)} を払い戻しました。`);
        S.up.compress = 0;
      }
      if (!d.memV2 && S.up.memory > 0) {
        let r = 0;
        for (let lv = 0; lv < S.up.memory; lv++) r += 4 * Math.pow(4, lv);
        S.stardust += r;
        migrationNotes.push(`恒星の記憶の仕組みが変わったため、恒星の記憶をLv0に戻し、星屑 ${fmt(r)} を払い戻しました。`);
        S.up.memory = 0;
      }
      if (S.up.compress > 5) {
        let r = 0;
        for (let lv = 5; lv < S.up.compress; lv++) r += 3 * Math.pow(2, lv);
        S.stardust += r;
        migrationNotes.push(`圧縮の上限がLv5になったため、超えた分の星屑 ${fmt(r)} を払い戻しました。`);
        S.up.compress = 5;
      }
      if (d.up && d.up.primal) { // 廃止した「原始の塵」の分は星屑で払い戻す
        let r = 0;
        for (let lv = 0; lv < d.up.primal; lv++) r += Math.pow(3, lv);
        S.stardust += r;
        migrationNotes.push(`「原始の塵」をなくしたため、星屑 ${fmt(r)} を払い戻しました。`);
        delete S.up.primal;
      }
      if (!d.stardustTotal) S.stardustTotal = S.stardust; // 前の版のセーブから引き継ぐとき
    }
  }
}

// 書き出し：JSONを小文字と数字だけの文字列にしたもの（「COSMOS2:」から始まる）
// 大文字・小文字が変わっても読めるように、base32（0-9とa-zの一部）を使う。
// 前の形式（「COSMOS1:」+ base64）も読み込める
const SAVE_PREFIX = "COSMOS2:";
const OLD_PREFIX = "COSMOS1:";
const B32 = "0123456789abcdefghjkmnpqrstvwxyz";
function b32encode(bytes) {
  let out = "", bits = 0, val = 0;
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
    val &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function b32decode(str) {
  // 読み間違えやすい文字（o→0、i/l→1）も受け付ける
  const t = str.toLowerCase().replace(/o/g, "0").replace(/[il]/g, "1");
  const out = []; let bits = 0, val = 0;
  for (const ch of t) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error("char");
    val = (val << 5) | v; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
    val &= (1 << bits) - 1;
  }
  return new Uint8Array(out);
}
function exportSave() {
  clampState();
  const json = JSON.stringify(S);
  return SAVE_PREFIX + b32encode(new TextEncoder().encode(json));
}
function importSave(text) {
  // 途中に改行や空白が入っても読めるようにする
  const t = text.replace(/\s+/g, "");
  const head = t.slice(0, 8).toUpperCase();
  let d;
  if (head === SAVE_PREFIX) {
    d = JSON.parse(new TextDecoder().decode(b32decode(t.slice(8))));
  } else if (head === OLD_PREFIX) {
    const body = t.slice(8);
    try {
      d = JSON.parse(decodeURIComponent(escape(atob(body))));
    } catch (e) {
      // 前の形式は大文字・小文字の区別が必要。全部小文字（大文字）になっていたら直せない
      if (body === body.toLowerCase() || body === body.toUpperCase()) throw new Error("case");
      throw e;
    }
  } else throw new Error("prefix");
  if (typeof d !== "object" || !d || !Array.isArray(d.amt)) throw new Error("shape");
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
let offlineRunning = false;
function applyOffline(seconds) {
  offlineRunning = true;
  try { applyOfflineInner(seconds); } finally { offlineRunning = false; }
}
function applyOfflineInner(seconds) {
  S.stats.away += seconds;
  const sec = Math.min(seconds, OFFLINE_CAP);
  const before = S.dust;
  const steps = 300;
  const dt = sec / steps;
  const novasBefore = S.supernovas;
  awayNova = null;
  for (let k = 0; k < steps; k++) { tick(dt); autoNova(true); }
  if (awayNova) {
    pushHist("nova", { no: S.supernovas, n: awayNova.n, t: Math.round(awayNova.t), g: awayNova.g, away: 1 });
    awayNova = null;
  }
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
    const blocked = upgradeBlocked(u);
    el.row.classList.toggle("blocked", blocked);
    if (blocked) el.effect.textContent = "冷えた宇宙の法則で買えない";
    else el.effect.innerHTML = maxed ? `<b>${u.effect(lv)}</b>（最大）` : `${u.effect(lv)} → <b>${u.effect(lv + 1)}</b>`;
    const c = u.cost(lv);
    el.cost.textContent = `${fmt(c)} 星屑`;
    el.btn.disabled = blocked || maxed || S.stardust < c;
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
  buildPartEditor();
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
// ===== 直列の表示 =====
function showAlignBanner() {
  if (S.flashOn === false) return; // 演出オフの設定に従う
  const b = $("alignBanner");
  $("alignBannerSub").textContent = `円盤の力 ×${alignMult()}`;
  b.classList.remove("show"); void b.offsetWidth; b.classList.add("show");
}
function renderAlignChip() {
  const chip = $("alignChip");
  chip.hidden = !aligned();
  if (aligned()) chip.textContent = `直列中 ×${alignMult()}`;
}
function renderAlign() {
  const box = $("alignBox");
  const a = kokuToAlign();
  box.hidden = !S.blackholes;
  if (box.hidden) return;
  const bar = $("alignBar"), txt = $("alignText");
  box.classList.toggle("on", aligned());
  if (aligned()) {
    txt.innerHTML = `<b>直列中！</b> 円盤の上乗せ分が ×${alignMult()}`;
    bar.style.width = Math.min(100, S.alignLeft / alignLen() * 100) + "%";
  } else if (!a) {
    txt.textContent = "円盤が2つ以上回ると、全部が同時に1周し終わったときに「直列」が起きる";
    bar.style.width = "0";
  } else {
    txt.innerHTML = `次の直列まで（${a.every}刻ごと）`;
    bar.style.width = Math.max(0, Math.min(100, (1 - a.left / a.every) * 100)) + "%";
  }
}

// ===== 部品の付け替え =====
let draftEquip = null; // 付け替え画面で選んでいる途中の組み合わせ
function buildPartEditor() {
  $("partOpen").onclick = () => { draftEquip = S.equip.slice(); renderPartEditor(true); };
  $("partCancel").onclick = () => { draftEquip = null; renderPartEditor(true); };
  $("partApply").onclick = () => { applyEquip(); renderPartEditor(true); render(); };
}
const ownedParts = () => PARTS.filter(p => mlvl(p.id) > 0);
function applyEquip() {
  if (!draftEquip) return;
  let changed = 0;
  for (let i = 0; i < 3; i++) {
    if (draftEquip[i] === S.equip[i]) continue;
    const p = periodWith(i, draftEquip[i]);
    S.ringPause[i] = (Math.floor(S.koku / p) + 1) * p; // 区切りのいい刻まで止まる
    changed++;
  }
  S.equip = draftEquip.slice();
  draftEquip = null;
  if (changed) { toast("部品を付け替えた！ 付け替えた円盤は、区切りのいい刻から回り出す"); save(); }
}
function setDraft(i, id) {
  if (id) for (let j = 0; j < 3; j++) if (draftEquip[j] === id) draftEquip[j] = null; // 同じ部品は1つだけ
  draftEquip[i] = id;
  renderPartEditor(true);
}
let partEditorKey = "";
function renderPartEditor(force) {
  const owned = ownedParts();
  $("partOpen").hidden = !!draftEquip || !S.blackholes;
  $("partOpen").disabled = owned.length === 0;
  $("partOpen").textContent = owned.length ? "部品を付け替える" : "部品を付け替える（質量ショップで部品を買うと使える）";
  const ed = $("partEditor");
  ed.hidden = !draftEquip;
  if (!draftEquip) return;
  const key = JSON.stringify([draftEquip, owned.map(p => p.id + mlvl(p.id)), activeRings()]);
  if (!force && key === partEditorKey) return;
  partEditorKey = key;
  const act = activeRings();
  // 円盤ごとの選択肢
  const rows = act.map(i => {
    const opts = [null, ...owned.map(p => p.id)].map(id => {
      const on = draftEquip[i] === id;
      const name = id ? partName(id) : "なし";
      return `<button class="chip${on ? " on" : ""}" data-i="${i}" data-id="${id || ""}">${name}</button>`;
    }).join("");
    const id = draftEquip[i];
    const p = periodWith(i, id), base = RINGS[i].koku;
    const lapGain = +(RINGS[i].per * lapValueWith(id)).toFixed(2);
    // 選んでいる部品の説明と、この円盤でどうなるか
    const what = id ? `<b>${partName(id)}</b>：${partById(id).eff(Math.max(1, mlvl(id)))}` : "<b>部品なし</b>";
    const res = stoppedWith(i, draftEquip)
      ? `→ この円盤は <b>止まる</b>。今の ${RINGS[i].target} ×${(1 + RINGS[i].per * ringLaps(i)).toFixed(2)} のまま、直列のときだけ強くなる`
      : `→ この円盤は <b>${p}刻で1周</b>${p !== base ? `（部品なしだと${base}刻）` : ""}、1周ごとに${RINGS[i].target} <b>+${lapGain}</b>`;
    return `<div class="pe-row"><div class="pe-name">${RINGS[i].name}<span class="pe-per num">${p}刻で1周</span></div><div class="chips">${opts}</div>`
      + `<p class="pe-what">${what}<br>${res}</p></div>`;
  }).join("");
  // 直列の間隔の比較
  const nowL = alignEvery(alignRings().map(ringPeriodK));
  const newL = alignEvery(alignRingsWith(draftEquip).map(i => periodWith(i, draftEquip[i])));
  const cmp = !newL ? "回っている円盤が2つ以上ないと直列は起きない"
    : nowL === newL ? `直列は <b>${newL}刻ごと</b>（今と同じ）`
    : `直列は ${nowL}刻ごと → <b>${newL}刻ごと</b>${newL < nowL ? "（増える）" : "（減る）"}`;
  // 刻の表（各円盤が1周し終わる刻に印、全部そろう刻はピンク）
  const cols = Math.max(12, Math.min(48, newL || 24));
  let grid = `<div class="pe-grid" style="grid-template-columns: 64px repeat(${cols}, minmax(0, 1fr))">`;
  act.forEach(i => {
    const p = periodWith(i, draftEquip[i]), st = stoppedWith(i, draftEquip);
    grid += `<span class="pe-gl">${RINGS[i].name.replace("の円盤", "")}${st ? "（止）" : ""}</span>`;
    for (let t = 1; t <= cols; t++) {
      const hit = !st && t % p === 0, al = !st && newL && t % newL === 0;
      grid += `<span class="pe-c${hit ? (al ? " al" : " hit") : ""}"></span>`;
    }
  });
  grid += `<span></span>`;
  for (let t = 1; t <= cols; t++) grid += `<span class="pe-n num">${t % 6 === 0 ? t : ""}</span>`;
  grid += `</div>`;
  const changedN = act.filter(i => draftEquip[i] !== S.equip[i]).length;
  const list = `<details class="pe-list"><summary>持っている部品の効果</summary><ul>${owned.map(p => `<li><b>${partName(p.id)}</b>：${p.eff(mlvl(p.id))}</li>`).join("")}</ul></details>`;
  $("peBody").innerHTML = list + rows + `<p class="pe-cmp">${cmp}</p>` + grid
    + `<p class="pe-note">${cols < newL ? `表は最初の${cols}刻だけ。` : ""}紫は1周し終わる刻、ピンクは全部そろう刻（直列）。`
    + (changedN ? `付け替えた円盤（${changedN}つ）は、区切りのいい刻まで止まって回り直す。回りかけの1周はなくなる。` : "") + `</p>`;
  $("peBody").querySelectorAll(".chip").forEach(b => b.onclick = () => setDraft(+b.dataset.i, b.dataset.id || null));
  $("partApply").disabled = changedN === 0;
}

let pullAnimAt = 0;
function renderCrunch() {
  if (S.blackholes >= 3 || S.crunches > 0) S.crunchSeen = true;
  const tab = $("crunchTab");
  tab.textContent = S.crunchSeen ? "ビッグクランチ" : "？？？";
  tab.disabled = !S.crunchSeen;
  const ready = crunchReady();
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
  $("crProgress").textContent = (g > 0 ? "✓ " : "") + (g > 0
    ? `この周回の塵の最高 ${fmt(S.runPeak)}。種がもう1つ増えるまで 塵 ${fmt(Math.pow(10, 50 + 10 * (g - 2)))}`
    : `この周回の塵の最高 ${fmt(S.runPeak)} / ${fmt(CRUNCH_REQ)}`);
  $("crMassBar").style.width = Math.min(100, S.mass / CRUNCH_MASS * 100) + "%";
  $("crMass").textContent = (crunchMassOk() ? "✓ " : "") + `持っている質量 ${fmt(S.mass)} / ${CRUNCH_MASS}（質量ショップで使うと減る）`;
  const btn = $("crBtn");
  btn.disabled = !crunchReady();
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

  renderGacha($("pullBtn"), $("pityText"), $("pullResult"));
  renderLawList($("lawList"), $("lawSlots"), false);
  // 作り直しの案内
  const changed = draftChanged();
  $("rebuildBox").hidden = !changed;
  if (changed) {
    $("rebuildDiff").textContent = draftDiffText();
    $("rebuildLoss").textContent = `作り直すと、物質・星屑・星屑ショップ・質量・質量ショップ・円盤がリセットされる（宇宙の種はもらえない）。自動化は${keepAutomationNow() ? "残る" : "消える"}。`;
    if (!rebuildArmed) $("rebuildBtn").textContent = "この法則で宇宙を作り直す";
  }
}

function renderGacha(btn, pityEl, resultEl) {
  btn.disabled = S.seeds < GACHA_COST;
  btn.textContent = S.seeds < GACHA_COST ? "宇宙の種がない（ビッグクランチでもらえる）" : `ガチャを引く（宇宙の種 ${GACHA_COST}・残り ${fmt(S.seeds)}）`;
  const left = PITY - S.pity;
  pityEl.textContent = `あと ${left} 回のうちにエピックが出なければ、${left}回目はエピック確定`;
  if (S.lastPull) {
    const l = lawById(S.lastPull.id);
    const label = S.lastPull.result === "new" ? "NEW!" : S.lastPull.result === "up" ? `Lv ${S.lastPull.lv - 1} → ${S.lastPull.lv}` : "最大レベルなので種を返した";
    resultEl.hidden = false;
    resultEl.className = `pull-result law rar-${l.rar}` + (performance.now() - pullAnimAt < 700 ? " pop" : "");
    resultEl.innerHTML = "";
    resultEl.appendChild(lawCardBody(l, S.cards[l.id] || 1, label));
  } else resultEl.hidden = true;
}

// 手持ちのカードを並べる。付け外しは下書きに入る。「今」の印は、今の宇宙で効いている法則
function renderLawList(list, titleEl, inChooser) {
  const draft = currentDraft();
  titleEl.textContent = inChooser
    ? `この宇宙の法則（${draft.length} / ${lawSlots()}）`
    : `法則（${draft.length} / ${lawSlots()}）`;
  list.innerHTML = "";
  const owned = LAWS.filter(l => S.cards[l.id]);
  if (owned.length === 0) {
    const p = document.createElement("p");
    p.className = "sn-text";
    p.textContent = "まだ法則カードを持っていない。宇宙の種でガチャを引こう。";
    list.appendChild(p);
  }
  owned.forEach(l => {
    const on = draft.includes(l.id);
    const active = !inChooser && S.laws.includes(l.id);
    const row = document.createElement("div");
    row.className = `law rar-${l.rar}` + (on ? " on" : "");
    const body = lawCardBody(l, S.cards[l.id], null);
    if (active) {
      const tag = document.createElement("span");
      tag.className = "law-now";
      tag.textContent = "今の宇宙";
      body.querySelector(".law-head").appendChild(tag);
    }
    row.appendChild(body);
    const b = document.createElement("button");
    b.className = "buy law-btn";
    b.textContent = on ? "外す" : "選ぶ";
    b.disabled = !on && draft.length >= lawSlots();
    b.addEventListener("click", () => { toggleLaw(l.id); render(); if (S.choosing) renderChooser(); });
    row.appendChild(b);
    list.appendChild(row);
  });
}
function draftDiffText() {
  const d = currentDraft();
  const add = d.filter(id => !S.laws.includes(id)).map(id => `＋ ${lawById(id).name}`);
  const del = S.laws.filter(id => !d.includes(id)).map(id => `− ${lawById(id).name}`);
  return add.concat(del).join("　");
}

// ===== ビッグクランチ後に法則を選ぶ画面 =====
function openChooser() {
  $("chooser").hidden = false;
  document.body.classList.add("choosing");
  renderChooser();
}
function closeChooser() {
  $("chooser").hidden = true;
  document.body.classList.remove("choosing");
}
function renderChooser() {
  if (!S.choosing) return;
  $("chSeeds").textContent = `${fmt(S.seeds)} 宇宙の種`;
  renderGacha($("chPull"), $("chPity"), $("chResult"));
  renderLawList($("chList"), $("chSlots"), true);
  const prev = S.laws.length ? S.laws.map(id => lawById(id).name).join("・") : "法則なし";
  $("chSame").textContent = `前回と同じ法則で始める（${prev}）`;
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
      el.effect.textContent = `${how}。${r.koku}刻で1周し、1周ごとに${r.target}が +${r.per}倍`;
      el.laps.textContent = "";
      el.bar.style.width = "0";
      return;
    }
    const pk = ringPeriodK(i), part = S.equip[i];
    const stopped = stoppedWith(i, S.equip);
    const paused = !stopped && S.koku < S.ringPause[i];
    el.effect.innerHTML = (stopped
      ? `${r.target} <b>×${ringMult(i).toFixed(2)}</b>（止まっている。直列のときに強くなる）`
      : `${r.target} <b>×${ringMult(i).toFixed(2)}</b>（${pk}刻で1周、1周ごとに +${+(r.per * lapValueWith(part)).toFixed(2)}）`)
      + `<br><span class="part-tag">${part ? "部品：" + partName(part) : "部品なし"}${paused ? "・付け替え中（もうすぐ回り出す）" : ""}</span>`;
    el.laps.textContent = `${ringLaps(i)} 周`;
    el.bar.style.width = (paused || stopped) ? "0" : (((S.koku % pk) / pk) * 100) + "%";
  });
  renderAlign();
  renderPartEditor();

  MUPGRADES.forEach((u, k) => {
    const el = mshopEls[k];
    const lv = mlvl(u.id);
    const locked = (u.needs && !mlvl(u.needs)) || (u.unlock && !u.unlock());
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

// 一度も超新星を起こしていない人向けの説明（超新星タブの上）
let firstNovaToasted = false;
function renderFirstNova() {
  const box = $("firstNova");
  box.hidden = S.supernovas > 0;
  if (box.hidden || $("panel-nova").hidden) return;
  const g = snGain();
  const items = [];
  items.push("<b>星屑とショップの強化は消えない。</b>次の周回は強化が付いた状態で始まるから、今の周回より速く進む");
  if (g > 0) {
    const can = UPGRADES.filter(u => !upgradeBlocked(u) && u.cost(lvl(u.id)) <= S.stardust + g)
      .map(u => `${u.name}（${fmt(u.cost(lvl(u.id)))}星屑：${u.effect(lvl(u.id) + 1)}）`);
    items.push(`今起こすと<b>星屑 +${snGainText()}</b>。それで買えるもの：${can.length ? can.join("、") : "まだない"}`);
  } else {
    items.push(`恒星を ${fmt(snReq())} 集めると起こせる`);
  }
  items.push("星屑は恒星が10倍になるごとに1つずつしか増えない。<b>長く粘るより、早めに起こして強化を重ねたほうが速い</b>");
  $("firstNovaList").innerHTML = items.map(t => `<li>${t}</li>`).join("");
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
  // 一度も超新星を起こしていない人には、起こすと何がいいのかを伝える
  if (S.supernovas === 0) return `<strong>超新星</strong>で星屑 +${snGainText()} → 強化を買うと次の周回が速くなる`;
  if (hintActive() && pastPeak()) return `粘るより<strong>超新星を起こした方が速そう</strong>（星屑 +${snGainText()}）`;
  return `超新星を起こすと 星屑 <strong>+${snGainText()}</strong>`;
}

// ===== 履歴の表示 =====
const fmtDur = sec => {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec}秒`;
  if (sec < 3600) return fmtTime(sec);
  return `${Math.floor(sec / 3600)}時間${String(Math.floor(sec % 3600 / 60)).padStart(2, "0")}分`;
};
const HIST_EMPTY = { nova: "まだ記録がない。次の超新星から記録される", bh: "まだ記録がない。次のブラックホールから記録される", crunch: "まだ記録がない。次のビッグクランチから記録される" };
function histTable(kind) {
  const list = S.hist[kind] || [];
  if (!list.length) return `<p class="hist-empty">${HIST_EMPTY[kind]}</p>`;
  const tr = (cells, cls) => `<tr${cls ? ` class="${cls}"` : ""}>${cells.map(c => `<td>${c}</td>`).join("")}</tr>`;
  let head, rows, foot = "";
  if (kind === "nova") {
    const perMin = e => e.t > 0 ? e.g / e.t * 60 : 0;
    const normal = list.filter(e => !e.away);
    const best = normal.length >= 2 ? Math.max(...normal.map(perMin)) : -1;
    head = ["回", "時間", "星屑", "毎分"];
    rows = list.map(e => e.away
      ? tr([`留守中<span class="tag">${e.n}回</span>`, `平均 ${fmtDur(e.t / e.n)}`, `+${fmt(e.g)}`, perMin(e).toFixed(2)])
      : tr([`${e.no}回目${e.auto ? '<span class="tag">自動</span>' : ""}`, fmtDur(e.t), `+${fmt(e.g)}`, perMin(e).toFixed(2)],
           perMin(e) === best ? "best" : ""));
    if (normal.length >= 2) {
      const t = normal.reduce((a, e) => a + e.t, 0), g = normal.reduce((a, e) => a + e.g, 0);
      foot = `留守中を除いた${normal.length}回の平均：${fmtDur(t / normal.length)}・毎分 ${(g / t * 60).toFixed(2)} 星屑。太字は毎分が一番よかった回`;
    }
  } else if (kind === "bh") {
    head = ["回", "時間", "超新星", "質量"];
    rows = list.map(e => tr([`${e.no}回目`, fmtDur(e.t), `${e.novas}回`, `+${fmt(e.g)}`]));
  } else {
    head = ["回", "時間", "ブラックホール", "宇宙の種"];
    rows = list.map(e => tr([`${e.no}回目`, fmtDur(e.t), `${e.bhs}回`, `+${fmt(e.g)}`]));
  }
  return `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`
    + (foot ? `<p class="hist-foot">${foot}</p>` : "");
}
const histShown = { nova: -1, bh: -1, crunch: -1 };
function renderHist(force) {
  ["nova", "bh", "crunch"].forEach(k => {
    const d = $(k + "Hist");
    if (!d || !d.open) return;
    if (!force && histShown[k] === histVer) return;
    histShown[k] = histVer;
    $(k + "HistBody").innerHTML = histTable(k);
  });
}
["nova", "bh", "crunch"].forEach(k => $(k + "Hist").addEventListener("toggle", () => renderHist(true)));

function render() {
  renderHist();
  renderAlignChip();
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
  // 最初の1回だけ：起こせるようになったら知らせて、タブに印を付ける
  const firstReady = S.supernovas === 0 && snGain() > 0;
  novaTab.classList.toggle("ready", firstReady);
  if (firstReady && !firstNovaToasted) {
    firstNovaToasted = true;
    toast("超新星を起こせるようになった！ 超新星タブで、もらえる星屑と買える強化を見てみよう");
  }
  renderFirstNova();

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
$("protoMassBtn").addEventListener("click", () => { protoMass(); render(); });
$("protoBHBtn").addEventListener("click", () => { protoBH(); render(); });
$("protoStartBtn").addEventListener("click", () => protoStart());
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
$("chPull").addEventListener("click", () => { if (pullLaw()) { pullAnimAt = performance.now(); renderChooser(); } });
$("chStart").addEventListener("click", () => startUniverse(currentDraft()));
$("noticeOk").addEventListener("click", closeUpdateNotice);
$("reloadBtn").addEventListener("click", () => { S.last = Date.now(); save(); location.reload(); });
$("chSame").addEventListener("click", () => startUniverse(S.laws));
let rebuildArmed = false;
$("rebuildBtn").addEventListener("click", () => {
  if (!rebuildArmed) {
    rebuildArmed = true;
    $("rebuildBtn").textContent = "もう一度押すと作り直す（全部リセット）";
    setTimeout(() => { rebuildArmed = false; render(); }, 4000);
    return;
  }
  rebuildArmed = false;
  rebuildUniverse();
  render();
});
$("draftReset").addEventListener("click", () => { S.lawDraft = null; save(); render(); });
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
  document.querySelectorAll("#chooseSeg button").forEach(b => b.setAttribute("aria-pressed", (b.dataset.v === "on") === (S.chooseOnCrunch !== false)));
}
document.querySelectorAll("#notationSeg button").forEach(b => b.addEventListener("click", () => { S.notation = b.dataset.v; syncSettings(); render(); }));
document.querySelectorAll("#speedSeg button").forEach(b => b.addEventListener("click", () => { S.speed = Number(b.dataset.v); syncSettings(); }));
document.querySelectorAll("#hintSeg button").forEach(b => b.addEventListener("click", () => { S.hintOn = b.dataset.v === "on"; syncSettings(); render(); }));
document.querySelectorAll("#flashSeg button").forEach(b => b.addEventListener("click", () => { S.flashOn = b.dataset.v === "on"; syncSettings(); }));
document.querySelectorAll("#chooseSeg button").forEach(b => b.addEventListener("click", () => { S.chooseOnCrunch = b.dataset.v === "on"; syncSettings(); }));

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
    if (migrationNotes.length) showUpdateNotice();
  } catch (e) {
    if (e && e.message === "case") toast("読み込めませんでした。文字の大文字・小文字が変わってしまっているみたい。元のゲームで「書き出す」をやり直して、新しい文字列を貼り付けてね");
    else toast("読み込めませんでした。「COSMOS」から始まる文字列を全部貼り付けてね");
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
  const pk = ringPeriodK(i);
  const ph = (S.koku < S.ringPause[i] || stoppedWith(i, S.equip) ? 0 : (S.koku % pk) / pk) * Math.PI * 2;
  // 直列した瞬間：3つの粒がそろった向きに光の筋と、広がる光の輪
  const since = (performance.now() - alignFlashAt) / 1000;
  if (!back && i === 2 && since < 1.4) {
    const rr = r * (0.3 + since / 1.4 * 0.9);
    c.globalAlpha = (1 - since / 1.4) * 0.7;
    c.strokeStyle = colors["--accent"]; c.lineWidth = 4 * (1 - since / 1.4) + 1;
    c.beginPath(); c.ellipse(0, 0, rr, rr * tilt, 0, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
  }
  if (!back && i === 0 && since < 1.6) {
    c.globalAlpha = (1 - since / 1.6) * 0.8;
    c.strokeStyle = colors["--star"]; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(r / 0.38 * 0.95, 0); c.stroke();
    c.globalAlpha = 1;
  }
  for (let k = 0; k < 14; k++) {
    const a = ph - k * 0.06;
    const isBack = Math.sin(a) < 0;
    if (isBack !== back) continue;
    c.globalAlpha = (1 - k / 14) * (isBack ? 0.5 : 1);
    c.fillStyle = colors["--star"];
    const big = aligned() ? 1.6 : 1;
    if (aligned()) c.fillStyle = colors["--accent"];
    c.beginPath(); c.arc(Math.cos(a) * r, Math.sin(a) * r * tilt, (k === 0 ? 4.5 : 3 - k * 0.15) * big, 0, Math.PI * 2); c.fill();
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
    for (let k = 0; k < RINGS.length; k++) if (ringActive(k)) S.rings[k] += 3 * lapValueWith(S.equip[k]);
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
  if (S.choosing) { S.last = Date.now(); requestAnimationFrame(loop); return; } // 法則を選んでいる間は時間を止める
  const wall = Date.now();
  const gap = (wall - S.last) / 1000;
  if (gap > 5) applyOffline(gap);          // 裏に回っていた分は留守中扱い
  else if (gap > 0) { S.stats.play += gap; tick(gap * S.speed); autoNova(false); }
  S.last = wall;

  drawUniverse(now);
  updateStar(now);
  if (!$("panel-bh").hidden) drawBH(now);
  if (now - lastUI > 100) { render(); lastUI = now; }
  if (now - lastSave > 10000) { save(); lastSave = now; }
  requestAnimationFrame(loop);
}

// iPhoneのSafariは、リロードや閉じるときに visibilitychange が来ないことがあるので、pagehide でも保存する
window.addEventListener("pagehide", () => { S.last = Date.now(); save(); });
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
  if (gap > 5 && !S.choosing) applyOffline(gap);
  S.last = Date.now();
  render();
  if (S.choosing) openChooser();
  showUpdateNotice();
  checkNewVersion();
  requestAnimationFrame(loop);
})();
