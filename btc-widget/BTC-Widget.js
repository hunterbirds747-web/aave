// BTC 价格小组件 —— 用于 iOS「Scriptable」App
// 数据来源:CoinGecko 免费 API(无需 API Key)
// 支持:小号 / 中号 / 大号主屏幕小组件、锁屏小组件、深浅色模式
// 中号和大号会显示 24 小时价格走势图

// ===== 可修改的设置 =====
const COIN = "bitcoin";        // 换成 "ethereum" 等即可显示其他币种
const SYMBOL = "BTC";
const CURRENCY = "usd";        // "usd" 或 "cny"
const CURRENCY_SIGN = CURRENCY === "cny" ? "¥" : "$";
const REFRESH_MINUTES = 15;    // 建议刷新间隔(iOS 会自行决定实际刷新时间)
// ========================

const API = "https://api.coingecko.com/api/v3";

async function fetchJSON(url) {
  const req = new Request(url);
  req.timeoutInterval = 15;
  return await req.loadJSON();
}

async function getData() {
  const cacheFile = FileManager.local().joinPath(
    FileManager.local().cacheDirectory(), `btc-widget-${COIN}-${CURRENCY}.json`);
  const fm = FileManager.local();
  try {
    const [price, chart] = await Promise.all([
      fetchJSON(`${API}/simple/price?ids=${COIN}&vs_currencies=${CURRENCY}&include_24hr_change=true`),
      fetchJSON(`${API}/coins/${COIN}/market_chart?vs_currency=${CURRENCY}&days=1`),
    ]);
    const data = {
      price: price[COIN][CURRENCY],
      change: price[COIN][`${CURRENCY}_24h_change`],
      points: (chart.prices || []).map(p => p[1]),
      time: Date.now(),
    };
    fm.writeString(cacheFile, JSON.stringify(data));
    return data;
  } catch (e) {
    // 网络失败或被限流时使用上次缓存的数据
    if (fm.fileExists(cacheFile)) {
      const data = JSON.parse(fm.readString(cacheFile));
      data.stale = true;
      return data;
    }
    throw e;
  }
}

function formatPrice(n) {
  const digits = n >= 1000 ? 0 : 2;
  return CURRENCY_SIGN + n.toLocaleString("en-US", {
    minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatChange(c) {
  return (c >= 0 ? "▲ " : "▼ ") + Math.abs(c).toFixed(2) + "%";
}

function drawChart(points, width, height, color) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  if (points.length < 2) return ctx.getImage();

  // 抽样,避免点过多
  const step = Math.max(1, Math.floor(points.length / 120));
  const pts = points.filter((_, i) => i % step === 0);
  const min = Math.min(...pts), max = Math.max(...pts);
  const range = max - min || 1;
  const pad = 4;
  const xy = pts.map((v, i) => new Point(
    (i / (pts.length - 1)) * width,
    pad + (1 - (v - min) / range) * (height - pad * 2)));

  // 渐变填充区域
  const fill = new Path();
  fill.move(new Point(0, height));
  xy.forEach(p => fill.addLine(p));
  fill.addLine(new Point(width, height));
  fill.closeSubpath();
  ctx.addPath(fill);
  ctx.setFillColor(new Color(color.hex, 0.15));
  ctx.fillPath();

  // 折线
  const line = new Path();
  line.move(xy[0]);
  xy.slice(1).forEach(p => line.addLine(p));
  ctx.addPath(line);
  ctx.setStrokeColor(color);
  ctx.setLineWidth(2);
  ctx.strokePath();
  return ctx.getImage();
}

function createWidget(data) {
  const family = config.widgetFamily || "medium";
  const w = new ListWidget();
  w.url = `https://www.coingecko.com/en/coins/${COIN}`;
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);

  const up = data.change >= 0;
  const accent = up ? new Color("#16c784") : new Color("#ea3943");
  const orange = new Color("#f7931a");

  // ---- 锁屏小组件 ----
  if (family === "accessoryRectangular") {
    const t = w.addText(`₿ ${SYMBOL}`);
    t.font = Font.semiboldSystemFont(12);
    const p = w.addText(formatPrice(data.price));
    p.font = Font.boldRoundedSystemFont(18);
    p.minimumScaleFactor = 0.6;
    const c = w.addText(formatChange(data.change));
    c.font = Font.systemFont(12);
    return w;
  }
  if (family === "accessoryInline") {
    w.addText(`₿ ${formatPrice(data.price)} ${up ? "▲" : "▼"}${Math.abs(data.change).toFixed(1)}%`);
    return w;
  }
  if (family === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const t = w.addText("₿");
    t.font = Font.boldSystemFont(14);
    t.centerAlignText();
    const k = w.addText((data.price / 1000).toFixed(1) + "k");
    k.font = Font.boldRoundedSystemFont(14);
    k.minimumScaleFactor = 0.5;
    k.centerAlignText();
    return w;
  }

  // ---- 主屏幕小组件 ----
  const bg = new LinearGradient();
  bg.colors = [
    Color.dynamic(new Color("#ffffff"), new Color("#1c1c1e")),
    Color.dynamic(new Color("#f2f2f7"), new Color("#000000")),
  ];
  bg.locations = [0, 1];
  w.backgroundGradient = bg;
  w.setPadding(14, 14, 14, 14);

  const header = w.addStack();
  header.centerAlignContent();
  const logo = header.addText("₿");
  logo.font = Font.boldSystemFont(18);
  logo.textColor = orange;
  header.addSpacer(6);
  const name = header.addText(SYMBOL);
  name.font = Font.semiboldSystemFont(15);
  name.textColor = Color.dynamic(Color.black(), Color.white());
  header.addSpacer();
  if (family !== "small") {
    const cur = header.addText(CURRENCY.toUpperCase());
    cur.font = Font.mediumSystemFont(11);
    cur.textColor = Color.gray();
  }

  w.addSpacer(family === "small" ? 10 : 6);

  const price = w.addText(formatPrice(data.price));
  price.font = Font.boldRoundedSystemFont(family === "small" ? 24 : 30);
  price.textColor = Color.dynamic(Color.black(), Color.white());
  price.minimumScaleFactor = 0.5;
  price.lineLimit = 1;

  const change = w.addText(formatChange(data.change) + "  24h");
  change.font = Font.semiboldSystemFont(13);
  change.textColor = accent;

  if (family === "small") {
    w.addSpacer();
  } else {
    w.addSpacer(8);
    const chartH = family === "large" ? 200 : 50;
    const img = w.addImage(drawChart(data.points, 300, chartH, accent));
    img.resizable = true;
    img.imageSize = new Size(300, chartH);
    w.addSpacer();
  }

  const df = new DateFormatter();
  df.useNoDateStyle();
  df.useShortTimeStyle();
  const upd = w.addText((data.stale ? "⚠︎ 离线 · " : "更新于 ") + df.string(new Date(data.time)));
  upd.font = Font.systemFont(10);
  upd.textColor = Color.gray();
  return w;
}

function errorWidget(msg) {
  const w = new ListWidget();
  const t = w.addText("₿ 加载失败");
  t.font = Font.boldSystemFont(14);
  const m = w.addText(String(msg));
  m.font = Font.systemFont(10);
  m.textColor = Color.gray();
  return w;
}

let widget;
try {
  widget = createWidget(await getData());
} catch (e) {
  widget = errorWidget(e.message || e);
}

if (config.runsInWidget || config.runsInAccessoryWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium(); // 在 App 内运行时预览中号效果
}
Script.complete();
