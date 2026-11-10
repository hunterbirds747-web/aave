// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: chart-line;

// Aave V3 地址理财收益 —— Scriptable 桌面小组件
//
// 用法：
// 1. 在 Scriptable 里新建脚本，粘贴本文件全部内容
// 2. 在下面填写 ADDRESS；或者长按小组件 → 编辑小组件 → Parameter 填 "0x地址,网络"
//    网络可选：ethereum / arbitrum / base / optimism / polygon / avalanche
// 3. 桌面添加 Scriptable 小组件并选择本脚本（支持小 / 中 / 大号和锁屏组件）

const ADDRESS = '0x0Ca6982c030B015b5e2B3417e473F5E26a053453';  // 默认地址；小组件 Parameter 里填了地址则以 Parameter 为准
const CHAIN = 'ethereum';      // 默认网络
const REFRESH_MINUTES = 5;     // 期望刷新间隔，实际由 iOS 决定
const OPEN_URL = '';           // 可选：点击小组件打开的网址，例如你部署的网页版

const CHAINS = {
  ethereum:  { name: 'Ethereum',  rpc: 'https://ethereum-rpc.publicnode.com',          provider: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e' },
  arbitrum:  { name: 'Arbitrum',  rpc: 'https://arbitrum-one-rpc.publicnode.com',      provider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb' },
  base:      { name: 'Base',      rpc: 'https://base-rpc.publicnode.com',              provider: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D' },
  optimism:  { name: 'Optimism',  rpc: 'https://optimism-rpc.publicnode.com',          provider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb' },
  polygon:   { name: 'Polygon',   rpc: 'https://polygon-bor-rpc.publicnode.com',       provider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb' },
  avalanche: { name: 'Avalanche', rpc: 'https://avalanche-c-chain-rpc.publicnode.com', provider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb' },
};

// 合约函数选择器
const SEL = {
  getPool: '0x026b1d5f',
  getPoolDataProvider: '0xe860accb',
  getPriceOracle: '0xfca513a8',
  getReservesList: '0xd1946dbc',
  baseCurrencyUnit: '0x8c89b64f',
  getUserAccountData: '0xbf92857c',
  getUserReserveData: '0x28dd2d01',
  getReserveConfigurationData: '0x3e150141',
  getReserveData: '0x35ea6a75',
  getAssetPrice: '0xb3596f07',
  symbol: '0x95d89b41',
};
const SECONDS_PER_YEAR = 31536000;

// ---------- 链上读取 ----------
const pad = (addr) => addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const word = (hex, i) => BigInt('0x' + (hex.substr(2 + 64 * i, 64) || '0'));
const wordAddr = (hex, i) => '0x' + hex.substr(2 + 64 * i + 24, 40);
const hexToText = (h) => {
  let s = '';
  for (let i = 0; i < h.length; i += 2) { const c = parseInt(h.substr(i, 2), 16); if (c) s += String.fromCharCode(c); }
  return s;
};
// symbol() 通常返回 string，少数老代币（如 MKR）返回 bytes32
function decodeSymbol(hex) {
  if (!hex || hex.length <= 2) return '?';
  if (hex.length === 66) return hexToText(hex.slice(2)) || '?';
  const offset = Number(word(hex, 0)) / 32;
  const len = Number(word(hex, offset));
  return hexToText(hex.substr(2 + 64 * (offset + 1), len * 2)) || '?';
}

// 一次 HTTP 请求批量执行多个 eth_call；失败的调用返回 null
async function ethCalls(rpc, calls) {
  const out = new Array(calls.length).fill(null);
  for (let start = 0; start < calls.length; start += 40) {
    const chunk = calls.slice(start, start + 40);
    const req = new Request(rpc);
    req.method = 'POST';
    req.headers = { 'Content-Type': 'application/json' };
    req.timeoutInterval = 20;
    req.body = JSON.stringify(chunk.map((c, i) => ({
      jsonrpc: '2.0', id: start + i, method: 'eth_call', params: [{ to: c.to, data: c.data }, 'latest'],
    })));
    const res = await req.loadJSON();
    if (!Array.isArray(res)) throw new Error((res && res.error && res.error.message) || 'RPC 请求失败');
    for (const r of res) if (typeof r.result === 'string' && r.result.length > 2) out[r.id] = r.result;
  }
  return out;
}

async function fetchPositions(chainKey, user) {
  const { rpc, provider } = CHAINS[chainKey];
  const u = pad(user);

  const a = await ethCalls(rpc, [
    { to: provider, data: SEL.getPool },
    { to: provider, data: SEL.getPoolDataProvider },
    { to: provider, data: SEL.getPriceOracle },
  ]);
  if (a.includes(null)) throw new Error('无法读取 Aave 合约地址');
  const pool = wordAddr(a[0], 0), dp = wordAddr(a[1], 0), oracle = wordAddr(a[2], 0);

  const b = await ethCalls(rpc, [
    { to: pool, data: SEL.getReservesList },
    { to: oracle, data: SEL.baseCurrencyUnit },
    { to: pool, data: SEL.getUserAccountData + u },
  ]);
  if (!b[0] || !b[1]) throw new Error('无法读取资产列表');
  const count = Number(word(b[0], 1));
  const assets = [];
  for (let i = 0; i < count; i++) assets.push(wordAddr(b[0], 2 + i));
  const baseUnit = Number(word(b[1], 0));

  // getUserReserveData: [0] aToken 余额 [1] 固定债务 [2] 浮动债务 [5] 固定借款利率 [6] 存款利率
  const userData = await ethCalls(rpc, assets.map(x => ({ to: dp, data: SEL.getUserReserveData + pad(x) + u })));
  const held = [];
  assets.forEach((address, i) => {
    const d = userData[i];
    if (d && (word(d, 0) > 0n || word(d, 1) > 0n || word(d, 2) > 0n)) held.push({ address, d });
  });

  const details = await ethCalls(rpc, held.flatMap(h => [
    { to: dp, data: SEL.getReserveConfigurationData + pad(h.address) },  // [0] decimals
    { to: dp, data: SEL.getReserveData + pad(h.address) },               // [6] 浮动借款利率
    { to: oracle, data: SEL.getAssetPrice + pad(h.address) },
    { to: h.address, data: SEL.symbol },
  ]));

  const apy = (ray) => Math.pow(1 + Number(ray) / 1e27 / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1;
  const supplies = [], borrows = [];
  held.forEach((h, i) => {
    const cfg = details[i * 4], rd = details[i * 4 + 1], px = details[i * 4 + 2];
    if (!cfg || !px) return;
    const scale = Math.pow(10, Number(word(cfg, 0)));
    const price = Number(word(px, 0)) / baseUnit;
    const symbol = decodeSymbol(details[i * 4 + 3]);
    const row = (raw, rate, sym) => {
      const amount = Number(raw) / scale, usd = amount * price, y = apy(rate);
      return { symbol: sym, amount, usd, apy: y, yearlyUsd: usd * y };
    };
    if (word(h.d, 0) > 0n) supplies.push(row(word(h.d, 0), word(h.d, 6), symbol));
    if (word(h.d, 2) > 0n) borrows.push(row(word(h.d, 2), rd ? word(rd, 6) : 0n, symbol));
    if (word(h.d, 1) > 0n) borrows.push(row(word(h.d, 1), word(h.d, 5), symbol));
  });

  const tidy = (rows) => rows.filter(r => r.usd >= 0.01).sort((x, y) => y.usd - x.usd);
  const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
  const s = tidy(supplies), d = tidy(borrows);
  const supplyUsd = sum(s, 'usd'), borrowUsd = sum(d, 'usd');
  const yearlyUsd = sum(s, 'yearlyUsd') - sum(d, 'yearlyUsd');
  const netUsd = supplyUsd - borrowUsd;
  return {
    supplies: s, borrows: d, supplyUsd, borrowUsd, netUsd, yearlyUsd,
    netApy: netUsd > 0 ? yearlyUsd / netUsd : null,
    healthFactor: b[2] && borrowUsd > 0 ? Number(word(b[2], 5)) / 1e18 : null,
    updatedAt: Date.now(),
  };
}

// ---------- 缓存：断网或 RPC 出错时显示上一次的数据 ----------
const fm = FileManager.local();
const cachePath = (key) => fm.joinPath(fm.cacheDirectory(), 'aave-yield-' + key + '.json');
const readCache = (key) => { try { return JSON.parse(fm.readString(cachePath(key))); } catch (e) { return null; } };
const writeCache = (key, data) => { try { fm.writeString(cachePath(key), JSON.stringify(data)); } catch (e) {} };

// ---------- 界面 ----------
const C = {
  bgTop: new Color('#241d45'), bgBottom: new Color('#12131c'),
  text: new Color('#f1f2f8'), muted: new Color('#9a9fb5'),
  pos: new Color('#4fd1a1'), neg: new Color('#ff8076'), warn: new Color('#f0b45a'),
};
const fix = (v, n) => Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: n, maximumFractionDigits: n });
const usd = (v, n = 2) => (v < 0 ? '-$' : '$') + fix(v, n);
const signed = (v, n = 2) => (v > 0 ? '+' : v < 0 ? '-' : '') + '$' + fix(v, n);
const pct = (v) => (v * 100).toFixed(2) + '%';
const tone = (v) => (v > 0 ? C.pos : v < 0 ? C.neg : C.text);
const shortAddr = (x) => x.slice(0, 6) + '…' + x.slice(-4);

function label(parent, str, size, color, bold) {
  const t = parent.addText(str);
  t.font = bold ? Font.boldRoundedSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.5;
  return t;
}

function stat(parent, title, value, color) {
  const col = parent.addStack();
  col.layoutVertically();
  label(col, title, 10, C.muted);
  label(col, value, 14, color, true);
}

function footer(w, data, stale) {
  const row = w.addStack();
  row.centerAlignContent();
  label(row, stale ? '离线数据 · ' : '更新于 ', 9, stale ? C.warn : C.muted);
  const d = row.addDate(new Date(data.updatedAt));
  d.applyRelativeStyle();   // 相对时间由系统实时更新
  d.font = Font.systemFont(9);
  d.textColor = stale ? C.warn : C.muted;
}

function messageWidget(title, text) {
  const w = new ListWidget();
  w.backgroundColor = C.bgBottom;
  label(w, title, 13, C.text, true);
  w.addSpacer(4);
  const t = w.addText(text);
  t.font = Font.systemFont(11);
  t.textColor = C.muted;
  return w;
}

function buildWidget(data, address, chainKey, family, stale) {
  const w = new ListWidget();
  const yearly = data.yearlyUsd;

  // 锁屏组件：只显示总资产和日收益
  if (family && family.startsWith('accessory')) {
    label(w, 'Aave ' + usd(data.netUsd), 13, Color.white(), true);
    if (family !== 'accessoryInline') label(w, '日收益 ' + signed(yearly / 365), 11, Color.white());
    return w;
  }

  const bg = new LinearGradient();
  bg.colors = [C.bgTop, C.bgBottom];
  bg.locations = [0, 1];
  w.backgroundGradient = bg;
  w.setPadding(14, 14, 12, 14);
  if (OPEN_URL) w.url = OPEN_URL;

  const head = w.addStack();
  label(head, 'Aave · ' + CHAINS[chainKey].name, 11, C.muted, true);
  head.addSpacer();
  if (family !== 'small') label(head, shortAddr(address), 10, C.muted);

  w.addSpacer(6);
  label(w, '总资产', 10, C.muted);
  label(w, usd(data.netUsd), family === 'small' ? 22 : 28, C.text, true);
  w.addSpacer(6);

  const row = w.addStack();
  stat(row, '日收益', signed(yearly / 365), tone(yearly));
  row.addSpacer();
  if (family !== 'small') {
    stat(row, '月收益', signed(yearly / 12), tone(yearly));
    row.addSpacer();
    stat(row, '年收益', signed(yearly), tone(yearly));
    row.addSpacer();
  }
  stat(row, '净 APY', data.netApy == null ? '—' : pct(data.netApy), tone(data.netApy || 0));
  if (family !== 'small' && data.healthFactor != null) {
    const hf = data.healthFactor;
    row.addSpacer();
    stat(row, '健康系数', hf > 100 ? '>100' : hf.toFixed(2), hf < 1.1 ? C.neg : hf < 1.5 ? C.warn : C.pos);
  }

  if (family === 'large') {
    const section = (title, total, rows, sign) => {
      if (!rows.length) return;
      w.addSpacer(10);
      label(w, title + ' ' + usd(total), 11, C.muted, true);
      rows.slice(0, 4).forEach(r => {
        w.addSpacer(4);
        const line = w.addStack();
        label(line, r.symbol, 12, C.text, true);
        line.addSpacer();
        label(line, usd(r.usd) + '   ' + pct(r.apy) + '   ' + signed(sign * r.yearlyUsd / 365) + '/日', 11, sign > 0 ? C.pos : C.neg);
      });
    };
    section('存款', data.supplyUsd, data.supplies, 1);
    section('借款', data.borrowUsd, data.borrows, -1);
  }

  w.addSpacer();
  footer(w, data, stale);
  return w;
}

// ---------- 入口 ----------
async function main() {
  const param = String(args.widgetParameter || '').split(/[,\s]+/).filter(Boolean);
  const address = (param.find(p => /^0x/i.test(p)) || ADDRESS).trim();
  const chainKey = (param.find(p => CHAINS[p.toLowerCase()]) || CHAIN).toLowerCase();
  const family = config.widgetFamily || 'medium';

  let widget;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    widget = messageWidget('Aave 理财收益', '请在脚本顶部填写 ADDRESS，或在小组件 Parameter 中填写 "0x地址,网络"。');
  } else if (!CHAINS[chainKey]) {
    widget = messageWidget('Aave 理财收益', '不支持的网络：' + chainKey);
  } else {
    const key = chainKey + '-' + address.toLowerCase();
    let data, stale = false;
    try {
      data = await fetchPositions(chainKey, address);
      writeCache(key, data);
    } catch (e) {
      console.error(e);
      data = readCache(key);
      stale = true;
      if (!data) widget = messageWidget('Aave 理财收益', '读取失败：' + (e.message || e));
    }
    if (data) widget = buildWidget(data, address, chainKey, family, stale);
  }

  widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60000);
  if (config.runsInWidget) Script.setWidget(widget);
  else if (family === 'small') await widget.presentSmall();
  else if (family === 'large') await widget.presentLarge();
  else await widget.presentMedium();
  Script.complete();
}

await main();
