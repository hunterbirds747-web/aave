// ============================================================
//  BTC 价格小组件 v2 · 用于 iOS「Scriptable」App
//  数据:CoinGecko 免费接口(不用注册,不用 API Key)
//  尺寸:主屏幕 小 / 中 / 大,以及锁屏小组件
//  换主题:长按小组件 → 编辑小组件 → Parameter 里填
//          night(夜间)/ aurora(极光)/ orange(橙色)/ light(浅色)
// ============================================================

// ───── 可以修改的设置 ─────
const COIN = "bitcoin";        // CoinGecko 币种 ID,例如 "ethereum"、"solana"
const NAME = "Bitcoin";        // 显示的名称
const SYMBOL = "BTC";          // 显示的代号
const CURRENCY = "usd";        // "usd" 美元 / "cny" 人民币
const THEME = "night";         // 默认主题:night / aurora / orange / light
const RED_UP = false;          // true = 红涨绿跌;false = 绿涨红跌
const REFRESH_MINUTES = 10;    // 希望的刷新间隔(实际由 iOS 决定)
const PREVIEW_SIZE = "medium"; // 在 App 里点 ▶ 时预览的尺寸:small / medium / large
// ─────────────────────────

const API = "https://api.coingecko.com/api/v3";
const SIGN = { usd: "$", cny: "¥", eur: "€", gbp: "£", jpy: "¥", hkd: "HK$" }[CURRENCY] || "";

const THEMES = {
  night:  { bg: ["#22263c", "#0a0b12"], glow: "#f7931a", glowAlpha: 0.20, text: "#ffffff", sub: "#8f95ad",
            up: "#2ee6a8", down: "#ff5f6d", logo: "#f7931a", mono: null, pill: 0.16, fill: 0.34 },
  aurora: { bg: ["#3b2382", "#0e0a2b"], glow: "#c77dff", glowAlpha: 0.30, text: "#ffffff", sub: "#b4abe3",
            up: "#4df0c0", down: "#ff7a9c", logo: "#ffb24d", mono: null, pill: 0.18, fill: 0.34 },
  orange: { bg: ["#ffb03a", "#f2641c"], glow: "#fff6c9", glowAlpha: 0.38, text: "#ffffff", sub: "#ffe8cf",
            up: "#ffffff", down: "#ffffff", logo: "#ffffff", mono: "#ffffff", pill: 0.24, fill: 0.36 },
  light:  { bg: ["#ffffff", "#edf0f7"], glow: "#f7931a", glowAlpha: 0.12, text: "#10131f", sub: "#8a90a4",
            up: "#0fb47c", down: "#ef4553", logo: "#f7931a", mono: null, pill: 0.12, fill: 0.24 },
};

// ───── 小工具 ─────
const C = (hex, alpha) => new Color(hex, alpha === undefined ? 1 : alpha);
const pad2 = (n) => String(n).padStart(2, "0");
const clock = (ms) => { const t = new Date(ms); return pad2(t.getHours()) + ":" + pad2(t.getMinutes()); };
const stamp = (ms) => {   // 数据时间;超过 12 小时的旧数据带上日期
  const t = new Date(ms);
  return (Date.now() - ms > 12 * 3600 * 1000 ? pad2(t.getMonth() + 1) + "-" + pad2(t.getDate()) + " " : "") + clock(ms);
};

function mix(a, b, t) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  return "#" + [16, 8, 0].map((s) => {
    const p = (x >> s) & 255, q = (y >> s) & 255;
    return pad2(Math.round(p + (q - p) * t).toString(16));
  }).join("");
}

function fmtNumber(n, digits) {
  const parts = Math.abs(n).toFixed(digits).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

function fmtPrice(n) {
  if (typeof n !== "number" || isNaN(n)) return "—";
  const a = Math.abs(n);
  return (n < 0 ? "-" : "") + SIGN + fmtNumber(n, a >= 1000 ? 0 : a >= 1 ? 2 : 4);
}

function fmtDelta(n, price) {
  const a = Math.abs(price);
  return (n >= 0 ? "+" : "-") + SIGN + fmtNumber(n, a >= 1000 ? 0 : a >= 1 ? 2 : 4);
}

function fmtBig(n) {
  if (typeof n !== "number" || isNaN(n)) return "—";
  if (n >= 1e12) return SIGN + (n / 1e12).toFixed(2) + "万亿";
  if (n >= 1e8) return SIGN + (n / 1e8).toFixed(n >= 1e10 ? 0 : 1) + "亿";
  if (n >= 1e4) return SIGN + (n / 1e4).toFixed(0) + "万";
  return SIGN + fmtNumber(n, 0);
}

function pickTheme() {
  const alias = { "夜间": "night", "深色": "night", "黑色": "night", dark: "night", "极光": "aurora", "紫色": "aurora",
                  purple: "aurora", "橙色": "orange", "浅色": "light", "白色": "light", white: "light" };
  let key = String(args.widgetParameter || THEME).trim().toLowerCase();
  key = alias[key] || key;
  const th = Object.assign({}, THEMES[key] || THEMES.night);
  if (RED_UP && !th.mono) { const u = th.up; th.up = th.down; th.down = u; }
  return th;
}

// ───── 取数据(失败时用上一次的缓存)─────
async function getJSON(url) {
  const req = new Request(url);
  req.timeoutInterval = 12;
  return await req.loadJSON();
}

async function loadData() {
  const fm = FileManager.local();
  const file = fm.joinPath(fm.cacheDirectory(), "btc-widget-v2-" + COIN + "-" + CURRENCY + ".json");
  let cache = null;
  try { if (fm.fileExists(file)) cache = JSON.parse(fm.readString(file)); } catch (e) {}

  const [quote, chart] = await Promise.all([
    getJSON(API + "/simple/price?ids=" + COIN + "&vs_currencies=" + CURRENCY +
            "&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true").catch(() => null),
    getJSON(API + "/coins/" + COIN + "/market_chart?vs_currency=" + CURRENCY + "&days=1").catch(() => null),
  ]);

  const q = quote && quote[COIN];
  const fresh = !!q && typeof q[CURRENCY] === "number";
  if (!fresh && !cache) throw new Error("暂时获取不到行情");

  const d = fresh
    ? { price: q[CURRENCY], change: q[CURRENCY + "_24h_change"] || 0, cap: q[CURRENCY + "_market_cap"],
        vol: q[CURRENCY + "_24h_vol"], time: Date.now() }
    : { price: cache.price, change: cache.change, cap: cache.cap, vol: cache.vol, time: cache.time };

  let history = chart && Array.isArray(chart.prices)
    ? chart.prices.map((p) => p[1]).filter((v) => typeof v === "number") : [];
  if (history.length < 2) history = (cache && Array.isArray(cache.history)) ? cache.history : [];

  if (fresh) {
    try { fm.writeString(file, JSON.stringify(Object.assign({ history: history }, d))); } catch (e) {}
  }

  d.points = history.length >= 2 ? history.concat([d.price]) : [];
  d.high = d.points.length ? Math.max.apply(null, d.points) : d.price;
  d.low = d.points.length ? Math.min.apply(null, d.points) : d.price;
  d.delta = d.price - d.price / (1 + d.change / 100);
  return d;
}

// ───── 尺寸与排版参数 ─────
function widgetSize(family) {
  const s = Device.screenSize();
  const sw = Math.min(s.width, s.height);
  const m = sw > 500 ? 342 : Math.round(sw * 0.86);      // 中号宽度
  const sm = sw > 500 ? 155 : Math.round((m - 22) / 2);  // 小号边长
  if (family === "small") return new Size(sm, sm);
  if (family === "large" || family === "extraLarge") return new Size(m, Math.round(sm * 2.24));
  return new Size(m, sm);
}

// lineTop / lineBottom:折线上下范围;base:渐变填充的底边;pad:上、左、下、右内边距
function metrics(family, size) {
  const W = size.width, H = size.height;
  if (family === "small")
    return { W: W, H: H, pad: [14, 14, 12, 14], lineTop: 101, lineBottom: H - 14, base: H, x0: 0, x1: W - 17, samples: 40 };
  if (family === "large" || family === "extraLarge")
    return { W: W, H: H, pad: [16, 16, 14, 16], lineTop: 142, lineBottom: H - 84, base: H - 78, x0: 0, x1: W - 19, samples: 80 };
  return { W: W, H: H, pad: [14, 16, 12, 16], lineTop: 90, lineBottom: H - 14, base: H, x0: 0, x1: W - 19, samples: 64 };
}

// ───── 画背景:渐变 + 光晕 + 走势图 ─────
function resample(arr, n) {
  if (arr.length <= n) return arr.slice();
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * arr.length / n);
    const b = Math.max(a + 1, Math.floor((i + 1) * arr.length / n));
    let sum = 0;
    for (let j = a; j < b; j++) sum += arr[j];
    out.push(sum / (b - a));
  }
  out[0] = arr[0];
  out[n - 1] = arr[arr.length - 1];
  return out;
}

function traceCurve(path, P) {
  path.move(P[0]);
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    path.addCurve(p2,
      new Point(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6),
      new Point(p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6));
  }
}

function drawChart(ctx, d, family, th, m, accent) {
  const v = resample(d.points, m.samples);
  const lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
  const mid = (m.lineTop + m.lineBottom) / 2;
  const P = v.map((val, i) => new Point(
    m.x0 + (m.x1 - m.x0) * i / (v.length - 1),
    hi === lo ? mid : m.lineBottom - (val - lo) / (hi - lo) * (m.lineBottom - m.lineTop)));
  const end = P[P.length - 1];

  // 折线下方的渐变填充:多层半透明叠加,越靠近折线越浓;靠近末端时逐渐收窄
  const layers = 36, tail = family === "small" ? 26 : 38;
  const depth = P.map((p) => {
    const t = Math.min(1, (end.x - p.x) / tail);
    return (m.base - p.y) * t * t * (3 - 2 * t);
  });
  for (let k = 1; k <= layers; k++) {
    const f = k / layers;
    const area = new Path();
    traceCurve(area, P);
    for (let i = P.length - 1; i >= 0; i--) area.addLine(new Point(P[i].x, P[i].y + depth[i] * f));
    area.closeSubpath();
    ctx.addPath(area);
    ctx.setFillColor(C(accent, th.fill / layers));
    ctx.fillPath();
  }

  // 24 小时前价格的虚线参考线
  ctx.setFillColor(C(th.sub, 0.5));
  for (let x = m.x0 + 3; x < m.W - 4; x += 7) ctx.fillRect(new Rect(x, P[0].y - 0.5, 3, 1));

  // 折线(先画一层柔光,再画主线)
  const line = new Path();
  traceCurve(line, P);
  ctx.addPath(line);
  ctx.setStrokeColor(C(accent, 0.22));
  ctx.setLineWidth(6);
  ctx.strokePath();
  ctx.addPath(line);
  ctx.setStrokeColor(C(accent));
  ctx.setLineWidth(family === "small" ? 2 : 2.25);
  ctx.strokePath();

  // 末端的"当前价格"圆点
  const dot = (r, hex, alpha) => {
    ctx.setFillColor(C(hex, alpha));
    ctx.fillEllipse(new Rect(end.x - r, end.y - r, r * 2, r * 2));
  };
  dot(9, accent, 0.16);
  dot(5.5, accent, 0.3);
  dot(3.5, accent, 1);
  dot(1.5, th.mono ? th.bg[1] : "#ffffff", 1);

  // 大号:时间刻度
  if (family === "large" || family === "extraLarge") {
    ctx.setFont(Font.mediumSystemFont(9));
    ctx.setTextColor(C(th.sub, 0.9));
    const y = m.base + 5;
    for (let i = 0; i <= 4; i++) {
      const label = i === 4 ? "现在" : clock(d.time - (4 - i) * 6 * 3600 * 1000);
      const x = m.x0 + (m.x1 - m.x0) * i / 4;
      if (i === 0) { ctx.setTextAlignedLeft(); ctx.drawTextInRect(label, new Rect(m.pad[1], y, 60, 12)); }
      else if (i === 4) { ctx.setTextAlignedRight(); ctx.drawTextInRect(label, new Rect(m.W - m.pad[3] - 60, y, 60, 12)); }
      else { ctx.setTextAlignedCenter(); ctx.drawTextInRect(label, new Rect(x - 30, y, 60, 12)); }
    }
  }
}

function drawBackground(d, family, th, m, accent) {
  const W = m.W, H = m.H;
  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = true;
  ctx.respectScreenScale = true;

  // 上下渐变底色
  const bands = 64, bh = H / bands;
  for (let i = 0; i < bands; i++) {
    ctx.setFillColor(C(mix(th.bg[0], th.bg[1], i / (bands - 1))));
    ctx.fillRect(new Rect(0, i * bh, W, bh + 1));
  }

  // 左上角的柔和光晕
  const R = Math.max(W * 0.62, 150), steps = 30;
  for (let k = 0; k < steps; k++) {
    const r = R * (1 - Math.sqrt(k / steps));
    ctx.setFillColor(C(th.glow, th.glowAlpha / steps));
    ctx.fillEllipse(new Rect(m.pad[1] + 8 - r, m.pad[0] + 6 - r, r * 2, r * 2));
  }

  if (d.points.length >= 2) drawChart(ctx, d, family, th, m, accent);
  return ctx.getImage();
}

// ───── 拼界面 ─────
function symbol(name) {
  try {
    const s = SFSymbol.named(name);
    if (!s) return null;
    s.applyFont(Font.systemFont(60));
    return s.image;
  } catch (e) { return null; }
}

function addLabel(parent, str, font, hex) {
  const t = parent.addText(str);
  t.font = font;
  t.textColor = C(hex);
  t.lineLimit = 1;
  return t;
}

function addLogo(parent, th, size) {
  const name = SYMBOL === "BTC" ? "bitcoinsign.circle.fill" : SYMBOL.charAt(0).toLowerCase() + ".circle.fill";
  const img = symbol(name);
  if (!img) return addLabel(parent, "₿", Font.boldSystemFont(size * 0.9), th.logo);
  const v = parent.addImage(img);
  v.imageSize = new Size(size, size);
  v.tintColor = C(th.logo);
  return v;
}

function addPill(parent, d, th, accent, fs) {
  const up = d.change >= 0;
  const pill = parent.addStack();
  pill.centerAlignContent();
  pill.setPadding(3, 7, 3, 8);
  pill.cornerRadius = Math.round((fs * 1.2 + 6) / 2);
  pill.backgroundColor = C(accent, th.pill);
  const arrow = symbol(up ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill");
  if (arrow) {
    const a = pill.addImage(arrow);
    a.imageSize = new Size(Math.round(fs * 0.62), Math.round(fs * 0.62));
    a.tintColor = C(accent);
    pill.addSpacer(3);
  }
  const pct = Math.abs(d.change).toFixed(2) + "%";
  addLabel(pill, arrow ? pct : (up ? "▲ " : "▼ ") + pct, Font.semiboldRoundedSystemFont(fs), accent);
}

function layoutSmall(w, d, th, accent) {
  const head = w.addStack();
  head.centerAlignContent();
  addLogo(head, th, 20);
  head.addSpacer(6);
  addLabel(head, SYMBOL, Font.semiboldSystemFont(15), th.text);
  head.addSpacer();
  addLabel(head, stamp(d.time), Font.mediumSystemFont(10), th.sub);

  w.addSpacer(8);
  addLabel(w, fmtPrice(d.price), Font.boldRoundedSystemFont(24), th.text).minimumScaleFactor = 0.6;
  w.addSpacer(4);
  addPill(w, d, th, accent, 11);
  w.addSpacer();
}

function layoutMedium(w, d, th, accent) {
  const head = w.addStack();
  head.centerAlignContent();
  addLogo(head, th, 24);
  head.addSpacer(8);
  addLabel(head, NAME, Font.semiboldSystemFont(15), th.text);
  head.addSpacer(6);
  addLabel(head, SYMBOL, Font.mediumSystemFont(12), th.sub);
  head.addSpacer();
  addPill(head, d, th, accent, 12);

  w.addSpacer(5);
  const row = w.addStack();
  row.bottomAlignContent();
  addLabel(row, fmtPrice(d.price), Font.boldRoundedSystemFont(30), th.text).minimumScaleFactor = 0.6;
  row.addSpacer(8);
  const delta = row.addStack();
  delta.setPadding(0, 0, 4, 0);
  addLabel(delta, fmtDelta(d.delta, d.price), Font.semiboldRoundedSystemFont(13), accent);
  row.addSpacer();
  const time = row.addStack();
  time.setPadding(0, 0, 5, 0);
  addLabel(time, "更新于 " + stamp(d.time), Font.regularSystemFont(10), th.sub);
  w.addSpacer();
}

function layoutLarge(w, d, th, accent) {
  const head = w.addStack();
  head.centerAlignContent();
  addLogo(head, th, 34);
  head.addSpacer(10);
  const title = head.addStack();
  title.layoutVertically();
  addLabel(title, NAME, Font.semiboldSystemFont(17), th.text);
  addLabel(title, SYMBOL + " / " + CURRENCY.toUpperCase(), Font.mediumSystemFont(11), th.sub);
  head.addSpacer();
  addPill(head, d, th, accent, 13);

  w.addSpacer(12);
  addLabel(w, fmtPrice(d.price), Font.boldRoundedSystemFont(38), th.text).minimumScaleFactor = 0.6;
  w.addSpacer(1);
  const row = w.addStack();
  row.centerAlignContent();
  addLabel(row, "24h", Font.mediumSystemFont(12), th.sub);
  row.addSpacer(5);
  addLabel(row, fmtDelta(d.delta, d.price), Font.semiboldRoundedSystemFont(13), accent);
  row.addSpacer();
  addLabel(row, "更新于 " + stamp(d.time), Font.regularSystemFont(11), th.sub);

  w.addSpacer();
  const stats = w.addStack();
  const items = [["24h 最高", fmtPrice(d.high)], ["24h 最低", fmtPrice(d.low)], ["市值", fmtBig(d.cap)], ["24h 成交额", fmtBig(d.vol)]];
  items.forEach((it, i) => {
    if (i > 0) stats.addSpacer();
    const col = stats.addStack();
    col.layoutVertically();
    addLabel(col, it[0], Font.regularSystemFont(10), th.sub);
    col.addSpacer(3);
    addLabel(col, it[1], Font.semiboldRoundedSystemFont(13), th.text);
  });
}

function buildHomeWidget(d, family, th) {
  const m = metrics(family, widgetSize(family));
  const accent = th.mono || (d.change >= 0 ? th.up : th.down);
  const w = new ListWidget();
  w.backgroundColor = C(th.bg[1]);
  w.backgroundImage = drawBackground(d, family, th, m, accent);
  w.setPadding(m.pad[0], m.pad[1], m.pad[2], m.pad[3]);
  if (family === "small") layoutSmall(w, d, th, accent);
  else if (family === "medium") layoutMedium(w, d, th, accent);
  else layoutLarge(w, d, th, accent);
  return w;
}

// ───── 锁屏小组件 ─────
function buildLockWidget(d, family) {
  const w = new ListWidget();
  const up = d.change >= 0;
  const pct = (up ? "▲ " : "▼ ") + Math.abs(d.change).toFixed(2) + "%";
  if (family === "accessoryInline") {
    w.addText("₿ " + fmtPrice(d.price) + "  " + pct);
  } else if (family === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const a = w.addText("₿");
    a.font = Font.boldSystemFont(13);
    a.centerAlignText();
    const b = w.addText(d.price >= 1000 ? (d.price / 1000).toFixed(d.price >= 100000 ? 0 : 1) + "k" : fmtNumber(d.price, 0));
    b.font = Font.boldRoundedSystemFont(14);
    b.minimumScaleFactor = 0.5;
    b.lineLimit = 1;
    b.centerAlignText();
  } else {
    const a = w.addText("₿ " + SYMBOL + "   " + pct);
    a.font = Font.semiboldSystemFont(12);
    a.lineLimit = 1;
    const b = w.addText(fmtPrice(d.price));
    b.font = Font.boldRoundedSystemFont(22);
    b.minimumScaleFactor = 0.6;
    b.lineLimit = 1;
    const c = w.addText("更新于 " + stamp(d.time));
    c.font = Font.systemFont(11);
    c.textOpacity = 0.7;
  }
  return w;
}

function buildErrorWidget(err, th, family) {
  const w = new ListWidget();
  if (family.indexOf("accessory") === 0) { w.addText("₿ 加载失败"); return w; }
  w.backgroundColor = C(th.bg[1]);
  w.setPadding(14, 14, 14, 14);
  addLabel(w, "₿ 加载失败", Font.semiboldSystemFont(14), th.text);
  w.addSpacer(4);
  const t = w.addText(String((err && err.message) || err) + ",稍后会自动重试");
  t.font = Font.systemFont(11);
  t.textColor = C(th.sub);
  return w;
}

// ───── 运行 ─────
const family = config.widgetFamily || PREVIEW_SIZE;
const theme = pickTheme();
let widget;
try {
  const data = await loadData();
  widget = family.indexOf("accessory") === 0 ? buildLockWidget(data, family) : buildHomeWidget(data, family, theme);
} catch (e) {
  widget = buildErrorWidget(e, theme, family);
}
widget.url = "https://www.coingecko.com/zh/coins/" + COIN;
widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);

if (config.runsInWidget || config.runsInAccessoryWidget) {
  Script.setWidget(widget);
} else if (family === "small") {
  await widget.presentSmall();
} else if (family === "large") {
  await widget.presentLarge();
} else {
  await widget.presentMedium();
}
Script.complete();
