# CLAUDE.md — 央街·芬治 黄昏（Yonge × Finch Dusk）

始终用**中文**和用户交流。开工先读本文件，再看 `docs/HANDOFF.md`（详细交接：已完成内容、已知问题和优先级、调试技巧）。

## 项目一句话
浏览器里跑的第一人称打僵尸游戏，地图 1:1 还原多伦多北约克 Yonge St × Finch Ave 路口（以 (0,60) 为圆心、半径 380 m 可玩）。目标“3A 质感 + 真实地图”，当前最核心：**一眼认出这是真实的 Yonge/Finch**。

## 技术栈
- three.js r170（WebGLRenderer + EffectComposer），esbuild 打包成**单个 HTML**。
- 试玩链接只用 GitHub Pages：https://looktar.github.io/Looktar-yonge-finch/ （`main` 合并后自动发布，网址区分大小写）。claude.ai artifact（4PRSuvUCvZC57hKZHgX5jd、57bd93be）不再更新。
- 依赖：three r170、n8ao（环境光遮蔽，CC0）。n8ao 会引用 `postprocessing`，构建时用 `--alias` 指到 `src/pp_stub.js`，不打包进来。

## 常用命令
```
npm ci            # 只第一次
npm run build     # = python3 build.py：src/main.js → dist/game.js → 内联进 src/index.html 的 /*GAME*/ → dist/index.html（版本号取 package.json）
npm run check     # 确认提交的 dist/index.html 和 src/ 一致（CI 会查）
npm run lint && npm test   # ESLint + Vitest 单元测试（tests/unit/，约 1 秒）
npm run smoke     # Playwright 冒烟：桌面 + iPhone 横屏，出画面、无报错、非全黑全白，截图到 test-results/smoke/（约 2 分钟）
npm run serve     # http://localhost:8765/ （必须走 http，file:// 下角色 json 被 CORS 拦）
```
- 无头截图：Playwright 预装的 Chromium，`--use-angle=swiftshader`，软件渲染约 2 FPS 属正常。云端环境里**不要**运行 `playwright install`（CI 里要）。

## 工作规则（照 project905）
- 进度看 `docs/PROGRESS.md`，决定记 `docs/DECISIONS.md`（D-xx 只增不改），以后的想法写 `docs/BACKLOG.md`，外来素材登记 `CREDITS.md`。
- 每个改动开新分支，提 PR 合并进 `main`；PR 模板在 `.github/PULL_REQUEST_TEMPLATE.md`。
- 合并前：`npm run build && npm run check && npm run lint && npm test && npm run smoke` 全绿，冒烟截图亲自看一遍。
- 发版时改 `package.json` 的 `version`（菜单底部显示），再 `npm run build`。
- `main` 推送后 GitHub Actions 自动发布 `dist/` 到 GitHub Pages：https://looktar.github.io/Looktar-yonge-finch/ （网址区分大小写；仓库 Settings → Pages → Source 已选 GitHub Actions）。
- 已知但还没修的 bug 先写成 `it.fails` 测试。

## 目录
```
build.py           打包脚本
src/main.js        渲染器/灯光/后期/武器/僵尸 AI/波次/HUD/主循环；window.__yf 暴露调试对象
src/buildings.js   建筑解析 + 分风格立面 shader + 阳台/招牌/雨篷/屋顶
src/world.js       碰撞网格、道路、地面、路灯、信号灯、车、树、边界、小地图；调用 buildCity()
src/street.js      人行道、斑马线、围栏、电线杆、高压塔、消防栓、站牌；nearestRoad()
src/fx.js          粒子、黄昏天空 makeSky()、太阳 SUN、合成音效 Sfx
src/zombie.js      Mixamo 骨骼角色加载/重定向/僵尸化/程序化姿态
src/weapons.js     步枪/霰弹/手枪视图模型
src/touch.js       手机触控
src/index.html     菜单/HUD/触控层/CSS
src/pbr.js         Poly Haven CC0 实景扫描贴图：地面（草/混凝土按铺装遮罩混合）、路面材质、墙面贴图数组
src/data_*.js      OSM 建筑(b)、道路(r)、区域+节点(a)、街景线/massing/缺失建筑(x)、行道树(t)
dist/              构建产物 + 角色 json（.glb 转内嵌 glTF，artifact 服务器不收 .glb）；game.js 不提交
dist/tex/          PBR 贴图（1k 地面、512 墙面，约 3 MB）
docs/RESEARCH-visuals.md  画面对标研究和改动清单
assets/            原始 Soldier.glb / Michelle.glb
test/              模型测试页
tests/unit/        Vitest：车模几何（法线、尺寸、轮胎贴地）、手感（后坐力回正、低帧率稳定）
tests/e2e/smoke.mjs  Playwright 冒烟测试
.github/           CI、Pages 发布、Issue / PR 模板
```

## 画面要点（2026-11-24 对标改版）
- 中/高画质：N8AO 环境光遮蔽 + SMAA；低画质（手机默认）都关。`QUAL` 里的 `ao`、`aa`。
- 立面 shader（buildings.js）：墙面贴图数组按风格选层（砖/灰泥/预制混凝土/花岗岩），除以平均色只加细节；窗户用室内映射（每格一个房间，有视差），玻璃是电介质，镀膜玻璃（GLASS/RIB/NAC）带金属度。
- 地面：`pavedMask()` 画出铺装区域（非独立屋的建筑周边、主干道两侧），其余是草；OSM 草地/公园强制为草。
- 路缘石：每条路两侧 15 cm，跨过别的车道处断开（world.js 的 `cover` 栅格）。
- 截图脚本要用手动渲染 + `toDataURL`（软件渲染下 `page.screenshot` 会超时），见 docs/RESEARCH-visuals.md 末尾。

## 关键约定
- 坐标：x = 东，z = 南；原点 lat0 = 43.78060、lon0 = -79.41550；路口 XING = (-3, 92)；出生点 START = (-6, 128)。
- three r155 以后是物理光照单位：半球光/环境光约为旧版 π 倍。
- 立面 shader：常量 varying 经透视插值不精确，hash 前先 `floor()` 量化。
- 署名：OSM（ODbL）、多伦多 3D Massing 与 Street Tree（OGL-Toronto）、Mixamo。新增数据源要补署名。
- 谷歌街景接口被权限拒绝，不要绕过；实景参考用 Wikimedia Commons。
