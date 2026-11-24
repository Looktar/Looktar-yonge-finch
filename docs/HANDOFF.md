# 交接文件 · 《央街·芬治 黄昏》网页 3D 第一人称打僵尸

> 写给接手的 Claude Code。请始终用**中文**和用户交流。

## 1. 项目是什么

- 一款浏览器里跑的第一人称僵尸射击游戏。
- 地图按 1:1 还原多伦多北约克 **Yonge St × Finch Ave** 路口：可玩范围是以 (0,60) 为圆心、半径 380 m 的圆。
- 用户的最终目标是"3A 质感 + 真实地图"。当下最核心的诉求是：**让人一眼认出这是真实的 Yonge/Finch**。
- 技术栈：
  - three.js r170（WebGLRenderer + EffectComposer）
  - esbuild 打包成**单个 HTML**
  - 发布到 claude.ai artifact（slug `57bd93be-f9e8-4974-b546-461bba6874a5`，可见范围仅本人）

## 2. 目录与构建

```
yf/
  build.py        # npx esbuild src/main.js → dist/game.js，再内联进 src/index.html 的 /*GAME*/ → dist/index.html
  src/
    main.js       # 渲染器/灯光/后期/武器/僵尸 AI/波次/HUD/主循环；window.__yf 暴露调试对象
    buildings.js  # ★新：建筑解析 + 分风格立面 shader + 阳台/招牌/雨篷/屋顶
    world.js      # 碰撞网格、道路、地面、路灯、信号灯、车、树、边界、小地图；调用 buildCity()
    street.js     # 人行道、斑马线、围栏、电线杆+电线、高压塔、消防栓、站牌；nearestRoad()
    fx.js         # 粒子、黄昏天空 makeSky()、太阳方向 SUN、合成音效 Sfx（城市底噪 + 远处警笛）
    zombie.js     # Mixamo 骨骼角色加载/重定向/僵尸化材质/程序化姿态
    weapons.js    # 步枪/霰弹/手枪视图模型
    touch.js      # 手机触控
    index.html    # 菜单/HUD/触控层/CSS
    data_b.js     # OSM 建筑 376 条：B|type|height|levels|minheight|delta坐标(0.5m单位)
    data_r.js     # 道路；data_a.js 区域+节点；data_x.js 街景线 X、massing 高度 HM、OSM 缺失建筑 BX；data_t.js 市政行道树
  dist/           # index.html + Soldier.json + Michelle.json（.glb 转成内嵌 glTF 的 json，artifact 服务器不收 .glb）
  assets/         # 原始 Soldier.glb / Michelle.glb
  test/           # 模型测试页
```

**构建与测试流程**

- 构建：`python3 build.py`
- 本地测试：`cd dist && python3 -m http.server 8765`
  - 必须走 http，file:// 下角色 json 会被 CORS 拦掉。
- 无头截图：playwright + `/usr/bin/google-chrome --use-angle=swiftshader`，参考脚本 `/tmp/dusk.py`。
  - 传入视角数组 `[x, z, yawDeg, pitchDeg]`。
  - 软件渲染只有约 2 FPS，属正常。

**坐标系**

- x = 东，z = 南。
- 原点 lat0 = 43.78060、lon0 = -79.41550。
- 路口在 XING = (-3, 92)：Yonge 大致沿 x≈-3 南北走向，Finch 大致沿 z≈92 东西走向。
- 出生点 START = (-6, 128)。

## 3. 用户最近一次需求及完成情况

原话："以后和我用中文交流，说回这个项目，不要雨天，时间改成傍晚，还有一大问题是现在完全看不出这个真实世界里的yonge/finch地区，建筑全都对不上号"

### 已完成（已构建，**尚未发布**到 artifact）

**去掉雨夜**

- 雨线、地面雨点溅射、闪电、雷声、湿路反光条纹（streaks）全部删除。
- 路面改为干沥青粗糙度。
- 菜单、标题、暂停文案改为"黄昏"。

**黄昏光照**

- 太阳方位角 240°（西南偏西），高度角 7°，对应 11 月下旬多伦多日落。见 `fx.js` 的 `SUN`。
- 太阳 `DirectionalLight` 投射阴影，阴影相机跟随玩家并按 texel 吸附。
  - 画质分档：high 4096 / mid 2048 / low 关闭阴影。
- 半球光 3.4（r155 以后是物理光照单位，环境补光需要这么高才不发黑）。
- 天空 shader 重写：日落渐变、太阳盘、被夕阳照亮的卷云。
- 用天空做 PMREM 环境图，玻璃幕墙会映出晚霞。
- 雾改写了 `ShaderChunk.fog_*`：朝太阳方向偏暖色。
- 路灯刚亮、亮度降低。手电默认关闭。
- 后期参数改成适合亮场景的 bloom 和调色。
- 音效：城市低频底噪 + 阵风，随机远处警笛（替代原来的雷声）。

**建筑重做**（`src/buildings.js`）

建筑高度修正：
- building:part 改为优先用 OSM 自己的高度或层数。之前误用整栋 massing 的均值，导致 North American Centre（NAC）、27 层白色双塔等被压矮。

分风格立面 shader：用 box-filtered pulse 做窗格，远处不闪烁。风格 ID 见 `ST`：

| 风格 | 用途与外观 |
|---|---|
| HB / HS / HV | 独立屋：砖、灰泥、壁板，带窗框和地基 |
| CONDO | 预制混凝土公寓：窗墙 + 墩柱 + 楼板带 |
| GLASS | 玻璃幕墙 |
| RIB | 办公楼带形窗 |
| NAC | 玫瑰色花岗岩带 + 古铜色反光玻璃 |
| RET | 沿街商铺：底层橱窗 + 招牌带 |
| BRK | 70–80 年代砖板楼：点窗 + 阳台门 |
| TRN | TTC / GO 车站玻璃亭 |
| INST | 学校 |
| MECH | 屋顶机房百叶 |
| RFLAT / RSH / RGL | 平屋顶 / 沥青瓦 / 玻璃斜顶 |
| PAR | 女儿墙 |

玻璃与窗：
- 玻璃按格做法线微扰，反射有变化，远处自动淡出。
- 部分窗户亮灯；商铺室内亮灯。

几何细节：
- 女儿墙。
- 塔楼屋顶机房：主轴对齐。
- 独立屋屋顶：矩形用双坡（gable）+ 山墙，其余用四坡（hip），都带挑檐。
- **NAC 双塔的玻璃斜顶**：按 OSM `roof:shape=skillion`、`roof:height=14`、`roof:direction` 生成，5650 号是 125°，5700 号是 35°。
- 阳台：InstancedMesh 约 1.9 万个。混凝土楼板 + 半透明玻璃栏杆；砖楼用实心栏板。
- 雨篷：InstancedMesh，颜色随机。

临街判定：每条边用 `nearestRoad` 判断是否面朝 pri/sec/ter 道路。
- 临街边生成底层橱窗。
- 每 7.5 m 一个铺面招牌，自发光 canvas 图集，32 种；韩文、波斯文、中文混排，符合 Yonge 北段街景。

真实位置的招牌（`NAMED_SIGNS`）：

| 招牌 | 位置 |
|---|---|
| Shoppers Drug Mart | 5576 Yonge |
| H Mart 한아름 | 5545 Yonge |
| Circle K | 5571 Yonge |
| FINCH STATION | |
| Finch GO Bus Terminal | 5697 Yonge |
| FINCH BUS TERMINAL | |

颜色依据（`TAGS`）：来自 OSM 的 building:colour / material，例如 Luxe、7 号、白色双塔为白色；Place Nouveau 为灰色；1 号为棕色；5775 为玻璃办公；5734 为灰混凝土办公。另有 Olive Residences，即 BX 中 98.6 m 的那栋。

统计：355 栋，主网格 5.97 万顶点，阳台 18774，招牌 161，雨篷 69。

## 4. 已知问题 / 下一步（按优先级）

1. **还没发布**。
   - 先 `python3 build.py`，再用 `publish_files` 发布：`dist/index.html`、`Soldier.json`、`Michelle.json`。
   - slug `57bd93be-f9e8-4974-b546-461bba6874a5`，base_version 先用 `get_artifact` 取最新值。
2. **NAC 还不够像**。
   - 现在看着像暗红色砖楼配白窗。
   - 实景是浅鲑鱼粉色花岗岩配古铜反光玻璃的横向带，八角切角平面，斜玻璃顶。
   - 建议：
     - 提高花岗岩亮度、降低饱和度。
     - 玻璃带做得更连续、更像镜面。
     - 办公室亮窗再少一些。
     - 中间的玻璃金字塔天窗中庭目前只是 3.5 m 斜顶，可以单独建模。
3. **阴影里的地面仍偏暗**（草地、路面）。可继续调：
   - `hemi` 强度
   - `scene.environmentIntensity`
   - 曝光值 `toneMappingExposure`
   - 草地贴图亮度
4. **其余塔楼外观是按规则加随机分配的**，不是逐栋核对实景。
   - 能逐栋查证的：Mona Lisa、The Monet、Symphony Square、Dynasty、Skyview、Pemberton 系列、Place Nouveau、Luxe、The Palm、Olive Residences 等。
   - 可以在 `TAGS` 里按质心坐标补上 `white / grey / beige / brown / teal / dark / olive`。
   - 想加新风格就扩展 `assignStyle()`。
   - 质心坐标可用 `node` 跑类似 `/tmp/nac.mjs` 的脚本列出。
5. **实景参考来源**：
   - 维基共享资源（Wikimedia Commons）上的照片可用：搜索 "Finch Bus Terminal"、"Finch station Toronto"、"Yonge Street Highrises (27839431513).jpg"（航拍）。
   - 谷歌街景缩略图接口被权限系统拒绝，不要绕过。
6. **视图模型**：右下角的手或护木在暖光下像一块平的棕色方块，`vmKey`、材质需要再调。
7. **性能**：阳台约 2 万个实例 + 4096 阴影在中低端机上可能吃力。
   - 可以按距离剔除，或在 low 档不生成阳台。
   - 手机端默认 low 档，已关闭阴影。
8. **可选的大升级**（先前研究过）：
   - 迁移到 WebGPURenderer + TSL 后处理（GTAO、SSR、TRAA）。
   - three-mesh-bvh 碰撞。
   - recast 导航网格。
   - 地形高差：现在是平面，真实高差只有几米。
9. 版权和署名：页面里已经有 OSM（ODbL）、多伦多 3D Massing 与 Street Tree（OGL-Toronto）、Mixamo 的署名。新增数据源时要补上。

## 5. 调试小贴士

- `window.__yf` 可访问：`S, player, zombies, camera, W, fire, update, renderer, scene, sun, bloom, composer`。
- 在控制台把 `__yf.S.wave` 设为 99、`__yf.S.toSpawn` 设为 0，可以停止刷怪，方便截图。
- 立面 shader 的坑：常量 varying 经过透视插值后不是精确值，hash 之前必须先量化。已用 `floor(vInfo.x)` 加稳定 hash 处理，否则窗户会出现雪花噪点。
- three r155 以后光照单位变了：半球光和环境光需要比旧版大约 π 倍的强度。
- 打包后的源码改动备份：`/tmp/src_backup_v5` 是本轮改动前的 `src`。
