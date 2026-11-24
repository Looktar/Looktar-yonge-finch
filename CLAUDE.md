# CLAUDE.md — 央街·芬治 黄昏（Yonge × Finch Dusk）

始终用**中文**和用户交流。开工先读本文件，再看 `docs/HANDOFF.md`（详细交接：已完成内容、已知问题和优先级、调试技巧）。

## 项目一句话
浏览器里跑的第一人称打僵尸游戏，地图 1:1 还原多伦多北约克 Yonge St × Finch Ave 路口（以 (0,60) 为圆心、半径 380 m 可玩）。目标“3A 质感 + 真实地图”，当前最核心：**一眼认出这是真实的 Yonge/Finch**。

## 技术栈
- three.js r170（WebGLRenderer + EffectComposer），esbuild 打包成**单个 HTML**。
- 发布到 claude.ai artifact，slug `57bd93be-f9e8-4974-b546-461bba6874a5`（仅本人可见）。发布文件：`dist/index.html`、`dist/Soldier.json`、`dist/Michelle.json`。

## 常用命令
```
npm ci            # 只第一次
npm run build     # = python3 build.py：src/main.js → dist/game.js → 内联进 src/index.html 的 /*GAME*/ → dist/index.html
npm run serve     # http://localhost:8765/ （必须走 http，file:// 下角色 json 被 CORS 拦）
```
- 无头截图：Playwright 预装的 Chromium，`--use-angle=swiftshader`，软件渲染约 2 FPS 属正常。

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
src/data_*.js      OSM 建筑(b)、道路(r)、区域+节点(a)、街景线/massing/缺失建筑(x)、行道树(t)
dist/              构建产物 + 角色 json（.glb 转内嵌 glTF，artifact 服务器不收 .glb）；game.js 不提交
assets/            原始 Soldier.glb / Michelle.glb
test/              模型测试页
```

## 关键约定
- 坐标：x = 东，z = 南；原点 lat0 = 43.78060、lon0 = -79.41550；路口 XING = (-3, 92)；出生点 START = (-6, 128)。
- three r155 以后是物理光照单位：半球光/环境光约为旧版 π 倍。
- 立面 shader：常量 varying 经透视插值不精确，hash 前先 `floor()` 量化。
- 署名：OSM（ODbL）、多伦多 3D Massing 与 Street Tree（OGL-Toronto）、Mixamo。新增数据源要补署名。
- 谷歌街景接口被权限拒绝，不要绕过；实景参考用 Wikimedia Commons。
