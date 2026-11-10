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

## Scriptable 桌面小组件

`scriptable/AaveYield.js` 是 iOS 桌面小组件版本，不打开 App 就能看到总资产和收益。

1. 在 App Store 安装 [Scriptable](https://scriptable.app)
2. 新建脚本，粘贴 `scriptable/AaveYield.js` 的全部内容
3. 在脚本顶部填写 `ADDRESS`；或长按小组件 → 编辑小组件 → Parameter 填 `0x地址,网络`
   （网络可选 `ethereum` / `arbitrum` / `base` / `optimism` / `polygon` / `avalanche`，不同小组件可填不同地址）
4. 在桌面添加 Scriptable 小组件并选择该脚本

支持小号、中号、大号（含存借款明细）和锁屏组件。断网或 RPC 出错时显示上一次的数据并标注“离线数据”。

小组件由 iOS 决定何时刷新（通常几分钟到十几分钟一次），数字不会逐秒跳动；需要实时跳动请用上面的网页版。脚本只接受 `0x` 地址，不支持 ENS 域名。
