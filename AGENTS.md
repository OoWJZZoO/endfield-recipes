# AGENTS.md

## 这个仓库是什么

《明日方舟：终末地》物品图鉴「制造链路」的还原工具：把 `endfield_recipes.json` 渲染成一个
自包含的单文件网页。**交付物是 `endfield_chain.html`** —— 单文件、全部图标内联为 data URI，
双击即可打开，不联网、不需要本地服务器。功能、还原对照、已知取舍都写在 `README.md`。

## 构建

```bash
pip install -r requirements.txt   # numpy + pillow，版本已固定
python build_chain.py             # -> endfield_chain.html
```

没有 test / lint / typecheck 脚本。CI（`.github/workflows/pages.yml`）在推 main 后跑
`python build_chain.py`，断言产物非空且含 `window.__DATA__`，再作为 `index.html` 发布到 Pages。

**构建必须逐字节可复现**（Windows 本地与 Linux CI 产物一致）。改构建代码时不要引入平台差异：
换行、时间戳、字典顺序、webp 编码参数都要留意，输出固定写 LF。

数据流水线脚本（`fetch_modules.py` → `extract.mjs` → `build.mjs` → `build_html.mjs` →
`fetch_icons.py` → `compose_filled.py`）需要联网和本地 `snapshot/`、`modules/` 镜像，
日常改 UI 用不到。`verify.mjs` / `verify2.mjs` 是拿 `snapshot/items.html` 对数据的一次性核对脚本，
没有快照就跑不了。

## 目录与产物边界

| 路径 | 角色 |
| --- | --- |
| `src/app.js`、`src/style.css`、`src/template.html`、`src/glyphs.js` | 唯一的源码，**所有改动写在这里** |
| `build_chain.py` | 构建脚本：过滤配方 → 选默认配方 → 归一化图标 → 内联打包 |
| `endfield_chain.html` | **生成物，但入库**。永远不要直接编辑；改完 `src/` 必须重新构建 |
| `endfield_recipes.json` | 原始数据集（190 物品 / 288 配方 / 21 机具） |
| `assets/items/*.webp` | 图标母版，构建时读取，入库（209 个） |
| `README.md` | 面向用户的说明。改界面后容易滞后，动 UI 时顺手核对 |

`dev/`、`probe/`、`shots/`、`modules/`、`snapshot/` 是本机开发产物，已在 `.gitignore` 里排除；
`.endfield-state.json` 含本机绝对路径与 MaaEnd 实例 id，同样没有入库。

## 数据契约（最容易踩的坑）

- **payload 字段在 `build_chain.py` 的 `build_payload()` 里显式列出**，前端从 `window.__DATA__` 读。
  只在 `app.js` 里读某个原始数据集字段、却没在 payload 里输出，得到的就是永远 undefined 的死代码
  —— `producedPowerW` 这样静默失效过（热能池的发电功率整段显示不出来）。读任何字段前先确认它在 payload 里。
- 发货的配方集**不是** `endfield_recipes.json` 那 288 条：`filter_recipes()` 会剔掉扩容反应池里与
  反应池完全重复的配方，以及拆解机的瓶装拆解配方（液体 + 气体，判据 `is_liquid()` / `is_gas()`，
  与前端 `familyOf()` 同口径）。所以 README 写 288、产物里是 227，两个数都对。
- 环境是**配方级**属性，不是机具级；同一台机具的不同配方有的需要有的不需要。
- localStorage 键 `endfield_chain_ui_v1` 内含数据集日期版本，数据集重抓后旧状态自动作废。

## 界面约定

- 路由：图鉴平铺页是主页（`#/`），每个物品的链路是 hash 子页（`#/物品id`），
  前进 / 后退 / 刷新 / 分享交给浏览器原生历史，不自己管历史栈。
- 色板：稀有度 `TIER_COL`（白→绿→蓝→紫→金→红，物品块底部色条）；环境色 `ENV_COL`
  （稳定蓝 / 湿润青 / 酸性橙 / 息壤绿）。两者都是单一常量，改一处即全局生效。
- 顶栏控件共用一套材质：26px 高、6px 圆角、`#e7e5e0` 底 + `#d3d0ca` 描边，选中态转深墨渐变
  （`.tg.on`、`.cx-chip.on`、`#pinbtn.on`）。新增顶栏按钮照这套抄。
- 面板排版：小节标题（`#panel .sect h4`）黑色加粗，条目标签灰色加粗、正文灰色。
- 计数读法挂在「锚定窗口」上：默认取链路主体一次制造的耗时，勾「按2秒计」则锚到 2 秒。
  胶囊第二行「N机器×各M次」由 `machineSplit()` 算，台数向上取整，台数 × 各次数恒等于总次数。
- 界面文案尽量不用括号补充说明，近期几轮改动都在往外删括号。

## 工作方式

- **改完先汇报，等用户说「提交」再提交**，不要自作主张提交。提交信息用中文，
  风格照 `git log`：一行标题 + 若干条「改了什么、为什么」。
- 视觉 / 布局类改动**不要主动起 HTTP 服务或开浏览器验证** —— 用户明确表示自己看比 agent 开浏览器快。
  需要自查时优先走数据层或静态检索：直接 read 构建产物、或拿 `endfield_recipes.json` 跑一遍渲染逻辑，
  核对文案与数值（例如确认某条配方会渲染成什么样）。
- 用户的消息常常是「顺手再删/改某处」的连续迭代，改动小而密；每次改完都要重新构建产物。
