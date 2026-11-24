# 画面对标研究（2026-11-24）

## 对标了哪些项目

**以画面真实著称**
- [Streets GL](https://github.com/StrandedKitty/streets-gl)：浏览器里的 OSM 实时 3D 渲染器。
  - 延迟着色 + PBR、TAA、SSAO、屏幕空间反射、景深、bloom。
  - 物理大气和空气透视，级联阴影（CSM）。
  - 建筑立面和屋顶用贴图数组（`resources/textures/buildings`）按 OSM 标签挑材质。
- [jeantimex/tokyo](https://github.com/jeantimex/tokyo)：three.js 东京城市渲染，和我们技术栈一样。
  - 用 N8AO 环境光遮蔽、窗玻璃屏幕空间反射、takram 大气和云。
  - 黄昏时城市灯光在天黑前先亮。
  - 路灯是俯视画进光照贴图的小方片，所以能有很多路灯而不需要很多真光源。
- [OSM2World](https://osm2world.org)、[Blosm](https://github.com/vvoovv/blosm)：都靠可平铺的实景材质贴图让 OSM 建筑像真的。

**以画面精美著称**
- [N8AO](https://github.com/N8python/n8ao)（CC0）：three.js 最常用的高质量 SSAO。
- [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing)：建议半浮点缓冲（暗场景不出色带）、色调映射放最后、SMAA。
- [takram three-geospatial](https://github.com/takram-design-engineering/three-geospatial)：预计算大气散射和空气透视、体积云。这是下一步最大的升级点，但接入风险也最大。

## 对比出来的差距 → 这次怎么改的

| 差距 | 对标项目的做法 | 这次的改动 |
|---|---|---|
| 地面一大片暗绿色，路口实际全是硬铺装 | 按 OSM 面状要素和建筑周边铺材质 | 新增“铺装遮罩”：非独立屋的建筑周边和主干道两侧铺浅灰混凝土（带 1.5 m 板缝），草地只留在独立屋院子和 OSM 草地 / 公园 |
| 贴图是 256 像素噪声，没有法线 | 实景扫描 PBR 贴图，按真实尺寸铺 | 换成 Poly Haven CC0 扫描贴图（颜色 + 法线 + AO/粗糙度）：沥青 3 m、扫帚纹混凝土 2 m、草 2 m、红砖 1 m、灰泥 2 m、预制混凝土 2.71 m、花岗岩 1.8 m |
| 墙面是纯色 + 程序线条 | 立面材质贴图数组 | 墙面用 2D 贴图数组，按风格选材质；除以贴图平均色，只加细节，保留每栋楼自己的颜色 |
| 窗户像随机黑黄格子，没有深度 | 窗玻璃反射；游戏业界常用室内映射 | 室内映射：每扇窗后面有真实视差的房间（天花板、侧墙、地板、家具、百叶帘），玻璃按菲涅尔反射晚霞；商铺有灯板、货架、陈列柜 |
| 没有接触阴影，楼像贴在地上 | SSAO / N8AO | 中、高画质加 N8AO（半径 2.2 m，偏冷的暗蓝色），低画质（手机）关闭 |
| 没有抗锯齿 | SMAA | 中、高画质加 SMAA |
| 路边没有路缘石 | 道路图生成路缘 | 每条路两侧 15 cm 浅色混凝土路缘 + 深色边沟，跨过别的车道时自动断开 |
| 车是两个方块 | 实际车形 | 按侧面轮廓挤出、圆角，分轿车和 SUV，加玻璃车顶 |
| 树是 6 根直棍 | 递归分枝 | 递归生成：主干 → 主枝 → 枝 → 下垂细枝，逐级变细、弯曲 |
| 信号灯和灯杆是黑的 | 和实景照片对照 | 按 Wikimedia Commons 上的 Yonge/Finch 照片：多伦多的黄色信号灯壳、镀锌灰色灯杆 |
| NAC 像暗红砖楼配黑窗 | 逐栋核对 | 浅鲑鱼粉花岗岩 + 连续的古铜色镀膜玻璃带（玻璃金属度 0.85，反射带古铜色） |
| 环境反射的下半球是黑的，玻璃朝下看全黑 | 环境图包含街景 | 环境图里的地面和周边楼调亮到黄昏街道的亮度 |
| 招牌、斑马线自发光，过曝 | 真实油漆不发光 | 去掉路面油漆的自发光，降低招牌亮度 |
| 修了一个 bug | | 有 min_height 的楼体部件从地面开始数层数，阳台浮在楼顶上方 |

## 还没做（按收益排序）

1. **takram 物理大气 + 空气透视**：现在的天空和雾是手写的，远处楼体的大气感还不够。
2. **逐栋核对外观**：Mona Lisa、The Monet、Symphony Square、Dynasty、Skyview、Pemberton 系列、Place Nouveau、Luxe、The Palm、Olive Residences。要配合实景照片，在 `TAGS` 里补颜色和风格。
3. **Finch 站绿色拱形入口**：参考照片 `File:Finch Station - TTC.jpg`。
4. **人行道整体抬高**：现在只有路缘，人行道本身还在地面高度。
5. **Google 照片级 3D Tiles**（Photorealistic 3D Tiles）：这是“一眼认出”最直接的办法，多伦多有摄影测量覆盖。但它需要 Google Maps API 密钥和计费，必须显示 Google 署名，条款也不允许缓存或离线。要用的话得总决策拍板。

## 截图方法（无头软件渲染）

`page.screenshot` 在软件渲染下会等不到帧而超时。可行的做法：
1. 先用 `addInitScript` 包一层 `requestAnimationFrame`，置 `window.__hold = true` 后暂停主循环。
2. 再手动设好 `__yf.player` 和 `__yf.camera`。
3. 调 `__yf.placeSun(x, z)`，然后调两次 `__yf.composer.render()`。
4. 在同一个 `evaluate` 里用 `renderer.domElement.toDataURL()` 取图。
