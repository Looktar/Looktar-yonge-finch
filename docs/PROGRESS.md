# 进度 PROGRESS

每完成一项就在这里记一行；已知问题按优先级排。以后的想法写进 `docs/BACKLOG.md`，决定写进 `docs/DECISIONS.md`。

## 当前版本：v0.4.0（2026-11-24）

### 已完成
- 交接包导入，建仓库（v0.1）。
- 画面对标改版：Poly Haven 实景 PBR 贴图、室内映射窗户、N8AO、SMAA、路缘石、递归树（见 `docs/RESEARCH-visuals.md`）。
- 对照 Google 街景 / 苹果地图：路面朝向 bug、分隔岛路缘、北美中心柱廊和玻璃带、TTC 站牌和候车亭、路名牌、广告牌、平屋顶颜色、停车场。
- 车道线重写：停止线、箭头、虚线、双黄中线。
- 放样建模的车（轿车 / SUV / 掀背车），轮胎、轮毂、刹车盘、轮拱内衬、车牌。
- 对标 Saltline：雨后湿路面（平面反射水坑）、最终后处理（光束、自动曝光、ACES/AgX、调色、颗粒）、弹簧枪模手感、后坐力、震屏、顿帧、弹孔、命中标记、极简 HUD。
- iPhone：白屏 / 黑屏（半精度溢出）、sRGB 贴图数组、角色贴图加载（沙箱拒绝 blob: / data:），手机默认关 AO，`#debug` 诊断面板。
- 仓库管理（v0.4.0）：ESLint、Vitest 单元测试、Playwright 冒烟测试、`build.py --check`、GitHub Actions CI、GitHub Pages 自动发布、Issue / PR 模板、本文件和 DECISIONS / BACKLOG / CREDITS。

### 已知问题（按优先级）
1. **iPhone 上受光面偏暗、窗户不亮**：原因还没找到，`#debug` 里的开关都试过无效；v0.4.0 起手机默认关 AO，等试玩确认。GitHub Pages 链接不经过 claude.ai 沙箱，也可以用来对比。
2. 逐栋外观核对还没做（`LOOKS` 机制已有，内容为空），用苹果地图 Look Around 对照。
3. ESLint 还有 14 条未用变量警告。
