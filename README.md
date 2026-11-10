# Aave 地址理财收益小组件

输入钱包地址（或 ENS 域名），查看该地址在 Aave V3 的存款、借款和预估收益。

- 单文件、无需构建：直接用浏览器打开 `index.html`，或部署到任意静态托管
- 支持 Ethereum、Arbitrum、Base、Optimism、Polygon、Avalanche
- 展示实时累计收益、日 / 月 / 年收益、净资产、净年化 APY、健康系数与各资产明细
- 数据通过公共 RPC 直接读取链上合约，每 60 秒刷新
- 可用链接参数预填：`index.html?address=0x…&chain=ethereum`，也可用 `<iframe>` 嵌入

## 在 iPhone 上使用

1. 把仓库部署到 HTTPS 静态托管（例如 GitHub Pages：Settings → Pages → 选择分支）
2. 用 Safari 打开页面，查询一次地址
3. 点分享按钮 → “添加到主屏幕”

之后从主屏幕图标打开即为全屏 App，会自动载入上次查询的地址，总资产和收益数字实时跳动。

收益按当前浮动利率估算，不含激励奖励，仅供参考。
