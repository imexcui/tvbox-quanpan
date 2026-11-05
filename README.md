# 全盘搜4K · TVBox 夸克/百度/UC/115 聚合源

把 Hawk 模块 `全盘搜.js`（夸克/百度/UC/115 网盘聚合搜索）转换为 CatVod/TVBox 的 JS 蜘蛛，
并合并进 `aiwex.json`（原 98 个站点 + 新增「🌸 全盘搜4K」），供 TVBox / 影视仓 直接使用。

## 文件说明
- `source_hawk.js` —— 原始 Hawk 模块（全盘搜.js），转换源
- `build.py` —— 转换 + 合并脚本（在线抓取最新 aiwex，重生成 spider 与 config）
- `quanpan_spider.js` —— 生成的 CatVod JS 蜘蛛（TVBox 远程加载）
- `merged_tvbox.json` —— 多源聚合 TVBox 配置（精选 102 条线路（按名字模糊去重），已去重并按画质/速度/夸克排序；QuanPan4K 的 `api` 已指向下方 jsDelivr 蜘蛛链接，需替换 `tlwj01/tvbox-quanpan`）
- `aiwex_quanpan.json` —— 轻量自动更新版配置（99 站点，仅依赖 aiwex，可由 GitHub Actions 每日自更新）
- `.github/workflows/update.yml` —— 每日 04:00（北京）自动重抓 aiwex 并重新发布（更新 `aiwex_quanpan.json`）

## 部署到 GitHub（一次性）
1. 新建一个**公开** GitHub 仓库（例如 `tlwj01/tvbox-quanpan`）。
2. 把本目录全部文件 push 上去：
   ```bash
   git init
   git add -A
   git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/tlwj01/tvbox-quanpan.git
   git push -u origin main
   ```
3. 仓库 → Settings → Actions → 允许 `update.yml` 工作流（首次需开启）。

## TVBox / 影视仓 配置地址
spider 与 config 均通过 jsDelivr（免鉴权、URL 以 `.js` 结尾，TVBox 可正确识别为 JS 蜘蛛）：

- **全网多源聚合配置（推荐，102 条线路）— 粘到「配置地址」：**
  ```
  https://cdn.jsdelivr.net/gh/tlwj01/tvbox-quanpan/merged_tvbox.json
  ```
  > 该文件内「🌸全盘搜｜夸克4K」站点的 `api` 已写为
  > `https://cdn.jsdelivr.net/gh/tlwj01/tvbox-quanpan@main/quanpan_spider.js`，
  > 请在 push 前把 `tlwj01/tvbox-quanpan` 全局替换为你的 `用户名/仓库名`。
- **轻量自动更新版（99 站点）：**
  ```
  https://cdn.jsdelivr.net/gh/tlwj01/tvbox-quanpan/aiwex_quanpan.json
  ```
- 若国内访问 jsDelivr 不稳，换 ghproxy 包装的 raw 链接（config 与 spider 都要同步改）：
  ```
  https://ghproxy.net/https://raw.githubusercontent.com/tlwj01/tvbox-quanpan/main/merged_tvbox.json
  ```
  （spider 同理：`https://ghproxy.net/https://raw.githubusercontent.com/tlwj01/tvbox-quanpan/main/quanpan_spider.js`）

> ⚠️ 关键点：TVBox 按 `api` **是否以 `.js` 结尾**来判断 JS 蜘蛛。任何带 `?参数` 的链接（如分享平台的 `?sharecode=`）都会导致识别失败、站点 404，因此本方案使用干净链接。

## 播放前必填 Cookie（仅播放需要，搜索不需要）
打开 `quanpan_spider.js` 顶部 `USER_COOKIES`，填入你自己的网盘 Cookie：
- 夸克：`quark_cookie`（pan.quark.cn）
- 百度：`baidu_cookie`（pan.baidu.com）
- 115：`pan115_cookie`（115.com）
- UC 网盘免登

也可不改文件，直接在该站点 `ext` 字段写：`{"cookies":{"quark_cookie":"你的cookie"}}`。
改完后重新 push（或等每日 Action 跑），链接不变。

## 自动更新
仓库内的 GitHub Actions 会每天北京时间 04:00 自动重新抓取最新 `aiwex.json` 并重新合并、推送，
TVBox 端无需任何改动即可获得更新。也可在 Actions 页面手动 `Run workflow` 立即更新。

## 免责声明
本仓库为技术聚合/转换示例，依赖第三方后端 `quanpan.xyz` 与用户自有网盘账号。
仅供学习研究，请只播放自有或已授权内容，注意版权与合规风险。
