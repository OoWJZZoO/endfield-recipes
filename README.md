# 终末地 · 制造链路（仿原生 UI）

把本地配方树渲染成《明日方舟：终末地》物品图鉴「制造链路」的样子，支持画布拖动 / 缩放，
并把原生 UI 省略掉的信息（配方比例、需求数量、生产次数、副产物、总耗时）补回到界面上。

**在线预览：** <https://oowjzzoo.github.io/endfield-recipes/>

数据规模：267 物品 / 400 条原始配方（构建时剔除 11 条扩容反应池重复、79 条瓶装拆解、14 条机具内重复，
产物内 296 条）/ 23 机具，全部图标内联，无外部请求。数据源为 `rmxlinux/EndfieldData` 的 1.7 版本解包数据。

## 交付物

| 文件 | 说明 |
| --- | --- |
| **`endfield_chain.html`** | **最终交付**。单文件、自包含（数据 + 全部图标以 data URI 内联），双击即可用浏览器打开，无需联网、无需本地服务器。 |
| `assets/` | 下载/合成的图标母版（webp，128~256px） |
| `endfield_recipes.json` | 原始数据集：267 物品 / 400 配方 / 23 机具（由 1.7 解包数据生成） |
| `src/` | 源码：`template.html` / `style.css` / `app.js` / `glyphs.js` |
| `build_chain.py` | 构建脚本：选默认配方 → 归一化图标 → 内联打包 |
| `extract_game_data.py` | 从 EndfieldData 的 TableCfg 生成 `endfield_recipes.json` |
| `compose_filled.py` | 用瓶身 + 内容物合成灌装瓶 / 耐压罐图标 |

`endfield_recipe_tree.html` 是更早一版的配方树查看器（同样是自包含单文件），
`recipes.csv` / `recipe_tree.md` / `recipe_trees.json` / `recipe_data.js` 是
早期 gameheads 数据集经 `node build.mjs` 与 `node build_html.mjs` 输出的派生文件，
停留在旧数据版本，仅作历史资料保留。

## 构建与部署

重新构建只要一步：

```bash
pip install -r requirements.txt   # numpy + pillow，已固定版本
python build_chain.py             # -> endfield_chain.html
```

构建是**可复现**的：`build_chain.py` + `endfield_recipes.json` + `src/` + `assets/items/`
在固定依赖版本下产出的 `endfield_chain.html` 逐字节一致（sha256
`2e6b25f9…6530`），Windows 本地构建与 Linux CI 构建结果完全相同
（输出固定写为 LF 换行），因此 CI 发布的站点与本地打开的文件是同一份字节。

部署走 GitHub Actions（`.github/workflows/pages.yml`）：推送到 `main` 后自动构建，
把 `endfield_chain.html` 作为站点根页 `index.html` 发布到 GitHub Pages。
首次启用需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。

## 仓库结构

进版本库的是构建所需的最小集合（源码 + 数据集 + 图标母版 + 已生成的交付物），
以下目录是本机开发产物，已在 `.gitignore` 中排除：

| 目录 | 内容 |
| --- | --- |
| `shots/` / `probe/` | 游戏内截图与 UI 探测脚本（走 MaaEnd 本地 HTTP API 点击 + 取帧） |
| `snapshot/` / `modules/` | 抓取自 gameheads.gg 的页面与 JS bundle 原样镜像，可用 `fetch_modules.py` 重新抓取 |
| `dev/` | 早期探索脚本、`EndfieldData` 本地 clone 等开发产物 |

另有两个辅助文件：`endfield.py` 是本机 MaaEnd 取帧/点击的命令行辅助（对照游戏截图时用），
`assets_manifest.json` 记录当前数据集需要的物品/机具图标清单。

## 数据流水线（从零重建数据集）

配方数据来自 [rmxlinux/EndfieldData](https://github.com/rmxlinux/EndfieldData) 的 1.7 版本
TableCfg 解包数据（commit `19d202b`，2026-11-27 的 1.7 更新）。准备一份 clone 到
`dev/EndfieldData`（`--filter=blob:none` 即可，不需要 checkout），然后：

```
git clone --filter=blob:none https://github.com/rmxlinux/EndfieldData dev/EndfieldData
python extract_game_data.py --repo dev/EndfieldData --ref 19d202b
                           # TableCfg -> endfield_recipes.json
python compose_filled.py   # 用瓶身 + 内容物合成灌装瓶/耐压罐图标
python build_chain.py      # -> endfield_chain.html
```

`extract_game_data.py` 只用 `git show <ref>:TableCfg/<表>.json` 读取需要的十几张表，
不需要 checkout 整个仓库：

- 配方：`FactoryMachineCraftTable`，外加 `FactoryFuelItemTable`（热能池）、
  `FactoryVaporizerTable`（气体散布机）、`FactorySewageTreatImportTable`（废水处理）
- 物品 / 机具：`ItemTable`、`FactoryItemTable`、`FactoryBuildingTable`、
  `FactoryBuildingItemTable`、`FactoryBuildingTypeToNodeType`
- 三语名称：`I18nTextTable_CN/EN/JP`
- 活动限时配方：`LimitedFormulaCraftIdReverseTable`

EndfieldData 只包含表数据，不含图片。1.5 已有物品的图标沿用仓库里的 gameheads 母版，
按中文名迁移；1.7 新增的 57 个物品里，53 个按官方 id 从 warfarin.wiki 补齐，
4 个耐压罐再用 `compose_filled.py` 由瓶身 + 气体图标合成。
`fetch_modules.py` / `extract.mjs` / `fetch_icons.py` 是旧 gameheads 数据源的抓取脚本，
产物停留在旧版本，仅作历史参考。

解包表里灌装瓶 / 耐压罐的 `name` 只有通用瓶身名（如「赤铜瓶」），
`extract_game_data.py` 会按 id 后缀找到内容物，把显示名拼成「赤铜瓶（清水）」这种形式；
id 和图标规则都不变，只是便于搜索与辨认。

## 界面还原

对照游戏截图逐项复刻：

- **物品块**：白色卡片 + 深色头像 + 头像内底部的稀有度色条与数量标记；
  所有物品头像（物品块、边栏配方条、图鉴网格、搜索、详情面板）共用同一套斜纹深色材质与数量标记画法
- **机具胶囊**：深色胶囊、外层浅色描边 + 内层高光双线、白色单色机具图标 + 名称、第二行 `⏱ 耗时 · 生产次数`
- **连线**：正交走线（圆角折弯），两端各有一对短粗「接头」；备选配方支路用细灰线区分
- **气体环境**：需要环境的配方（气体反应炉、提纯机、息壤窑的部分配方），胶囊顶部多出一条环境色带
  —— 稳定环境（蓝）/ 湿润环境（青）/ 酸性环境（琥珀）/ 息壤环境（紫），带环境图标与环境名。
  环境是**配方级**属性，同一台机具的不同配方有的需要有的不需要（例如提纯机默认配方不需要，
  它的「稳定环境」变体需要，但能省一半分离芯）
- **金色胶囊**：`其他配方 ⤨ N` / `收起 ⌃`，带外发光与引导细线
- **配方标签**：展开备选后，主链上出现 `默认配方 ✓`，每条备选产线出现 `设为默认配方 ○`（可点击切换）
- **眼睛按钮**：同一物品的上游已在链路别处展开过时，该节点默认不重复渲染，左侧显示眼睛；点击可展开/收起。
  可采集物品复用同一只眼睛管理配方显隐：默认收起（不显示配方），点开按当前选用配方展开，状态持久保存；
  同一物品在链路里多处出现时，从任意一处点开都会一次睁开首行与当前行
- **选中态**：物品块浮起 + 金色描边，链路上的中间物品可点「切换制造链路 ›」把它变成画布主体
- **顶栏 / 缩放控件**：面包屑（终末地百科 › 物品图鉴 › 当前物品名）、搜索框、返回按钮、右下角鼠标滚轮缩放提示与滑杆
- **物品图鉴页（首屏）**：267 件物品的深色卡片网格（图标 + 名称 + 稀有度色条），
  名称过长时按卡片宽度自动缩字号，不再显示省略号；
  顶部按分类筛选并显示数量，点任意物品直接进入它的制造链路；顶栏「物品图鉴」可随时回到这里
- **背景**：暖灰渐变 + 等高线 + 顶部点阵带

## 补回的信息（原生 UI 缺失）

| 信息 | 位置 |
| --- | --- |
| **配方比例** | 机具胶囊第三行：`赤铜矿石×1 + 清水×1 → 赤铜块×1 + 污水×1`（副产物高亮），按本链路次数缩放 |
| **需求数量** | 物品块头像内底部的白色数字（与原生配方条的数量标记同款画法） |
| **生产次数** | 胶囊第二行 `2秒 · ×20次` |
| **总耗时** | 底栏汇总；悬浮卡与详情面板显示单节点 `耗时×次数` |
| **机具与配方全集** | 详情面板列出该物品的全部可选配方、直接投入、下游用途、环境/能源用途 |
| **单次配方原值** | 详情面板「单次配方」行给出未缩放的原始比例 |
| **所需/产出环境** | 胶囊顶部色带；详情面板给出环境由哪台机具、消耗什么气提供，以及与不带环境版本的原料对比 |

## 操作

| 操作 | 效果 |
| --- | --- |
| 拖拽空白处 | 平移画布 |
| 滚轮 | 以光标为中心缩放（15% ~ 260%） |
| 右下角鼠标图标 | 适应窗口（快捷键 `F`） |
| 点顶栏「物品图鉴」 | 回到图鉴页，可筛选、可直接点进链路 |
| 点击物品块 | 选中并打开右侧详情面板 |
| 物品块下「切换制造链路 ›」 | 以此物品为主体重建链路 |
| 胶囊下「其他配方 ⤨ N」 | 展开该物品的全部备选产线 |
| 备选产线标签「设为默认配方 ○」 | 切换该物品的默认配方，选完自动收起备选组并重算整棵树 |
| 左侧眼睛 | 重复上游：展开/收起「已在别处展示过」的节点；可采集物品：显示/收起配方，开合持久保存 |
| 顶栏搜索 | 中文 / 英文 / ID 模糊匹配，回车或点击直达 |
| 顶栏 ← | 返回上一级链路（直链进入时回图鉴页） |
| `Esc` | 关闭详情面板并取消选中 |

**子页面路由**：图鉴平铺页是主页，每个物品的制造链路是独立的 hash 子页
（`#/物品ID`，如 `#/item_carbon_mtl`，主页为 `#/`）。顶栏 ← / 面包屑 / 图鉴卡片 /
搜索 / 「切换制造链路」的跳转全部写入浏览器历史，前进 / 后退按钮、刷新、
分享链接均原生可用；子页链接也可直接打开（文件双击打开时同样支持）。

**本地持久化**：挂起的产线、边栏收起状态、「设为默认配方」的覆盖、图鉴筛选
自动存入 localStorage（键 `endfield_chain_ui_v1`，内含数据集日期版本），
刷新 / 关闭后恢复；数据集重抓后版本不符，旧状态自动作废。
隐私模式等 localStorage 不可用的场景退化为仅内存，不影响使用。

顶栏正中的三个按钮：
`配方比例` / `需求数量` 开关对应信息层；
整条链路默认以**链路主体的一次制造**为基准 —— 主体数量取该配方的单次产出，
胶囊读作 `2秒 · ×1次`，上游按这一炉的配比逐级折算
（单次产出 2 个的配方不会退化成 `×0.5次`）。
`按2秒计` 在这个基准上把时间锚定到 2 秒 —— 各节点数量统一乘以 `2 ÷ 链路主体单次耗时`，
于是物品块数量标记读作「每 2 秒需要多少」，主体读作「每 2 秒产出多少」
（例如单次产 1 个、耗时 10 秒的主体变为每 2 秒产出 0.2 个）。
缩放低于 34% 时自动隐藏比例行、金色胶囊与数量标记（信息仍可在详情面板查看）。

## 数据与图标来源

- 配方数据：[rmxlinux/EndfieldData](https://github.com/rmxlinux/EndfieldData) 的 1.7 版本 TableCfg
  （`endfield_recipes.json`，commit `19d202b`）
- 物品图标：1.5 之前的母版来自 gameheads.gg；1.7 新增的 57 个物品里，53 个按官方 id 从
  warfarin.wiki 补齐（`https://static.warfarin.wiki/v4/itemicon/<id>.webp`），4 个耐压罐由合成补齐，
  共 267 个；EndfieldData 本身不含图片
- 机具图标：手绘 SVG 单色 glyph（23 个），与原生胶囊里的白色机具图标风格一致
- 灌装瓶 / 耐压罐图标：按游戏做法用「瓶身 + 内容物图标」合成
  （`compose_filled.py`，内容物按瓶腹 alpha 质心定位、按瓶体宽度等比缩放，共 78 个）

## 已知取舍

- **胶囊比原生宽**（约 252px vs 120px）：原生胶囊只放机具名与耗时，这里额外承载配方比例，
  列宽由最长比例文本决定；比例过长时折成两行。
- **物品分类为自建体系**（矿石 / 植物 / 种子 / 液体 / 气体 / 粉末 / 金属块 / 晶体与息壤 /
  零件与元件 / 容器 / 消耗品 / 活动与特殊 / 杂项，共 13 类），只用于图鉴页的筛选：
  数据集的 `category` 由 TableCfg 的 `showingType` / `type` 推导，`transportMode` 由
  `FactoryItemTable.phaseType` 推导；前端的 `familyOf()` 再按物品 id 与中文名细分。
  规则要点：气体按名字含「气态」或以「气」结尾（这样「气态赤铜」不会被当成液体），
  「息壤」「重息壤」虽 id 含 `_powder` 但实为固体矿物，因此单独排除；1.7 新增的农作物按
  `item_corp_` 归入植物 / 种子，副产品按 `item_byproduct_` 归入植物 / 粉末，食材按
  `item_Ingredient_` 归入消耗品。
- **物品块底部色条 = 稀有度（tier）**，白(1) → 绿(2) → 蓝(3) → 紫(4) → 金(5) → 红(6)，
  与游戏一致；缩略图底部的渐变也用同色加深。图鉴页默认按游戏物品图鉴的排列顺序展示
  （溶液 → 气体 → 块与晶体 → 粉末 → 空瓶罐 → 零件 → 装备原件 → 电池 → 灌装瓶罐 →
  天然资源 → 消耗品 → 活动 → 杂项），该顺序写在 `src/app.js` 的 `CX_SEQ`，已按 1.7 的
  物品 id 更新。
- **可采集资源（矿石、清水、天然气、植物与种子）默认作为链路端点**：与游戏一致（游戏里这些节点
  显示眼睛或直接终止）。点物品块左缘的眼睛按当前选用配方展开，再点收回；想换配方先点开眼睛，
  再用「其他配方」与「设为默认配方」切换。
- **明晦炉按范围转化计**：它是 5×5 区域设备，每 10 秒对范围内传送带物品判定一次，
  台数由阵列覆盖决定，不能按「需求次数 ÷ 单台产能」折算；因此链路里显示
  「范围转化 · 10秒/判定」，不显示机器 × 次数。
- **拆解机的瓶装拆解配方在构建时剔除**：它们的产出是液体 / 气体，与管道输送重复；
  扩容反应池里与反应池完全相同的配方、以及 1.7 明晦炉里完全相同的阵列转化副本也一并剔除。
  这些是 `build_chain.py` 的 `filter_recipes()` 有意为之，所以产物内配方数（296）少于
  原始数据集（400）。

## 许可与致谢

代码以 MIT 许可发布。游戏图标与配方数据的版权归属及来源说明见 [NOTICE](NOTICE)。

本项目是非官方同人工具；配方数据来自 [rmxlinux/EndfieldData](https://github.com/rmxlinux/EndfieldData)，
物品图标母版来自 [gameheads.gg](https://gameheads.gg/)，游戏内截图对照素材由本机 MaaEnd 取帧获得。
