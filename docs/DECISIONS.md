# 决定 DECISIONS

小事自己定，在这里记一条；方向、范围、花钱拿不准的先问。编号只增不改。

| 编号 | 日期 | 决定 | 原因 |
|---|---|---|---|
| D-01 | 2026-11-24 | 技术栈保持 three.js r170 + esbuild 单 HTML，不引入框架 | 交接包已经跑通，发布到 claude.ai artifact 只需静态文件 |
| D-02 | 2026-11-24 | 新的试玩链接另发一个 artifact（4PRSuvUCvZC57hKZHgX5jd），旧的 57bd93be 不动 | 总决策选择 |
| D-03 | 2026-11-24 | 实景贴图用 Poly Haven CC0，不用需要计费的 Google 照片级 3D Tiles | 3D Tiles 要 API 密钥、计费、不允许缓存，需要总决策拍板 |
| D-04 | 2026-11-24 | 不绕过 Google 街景接口的权限拒绝；实景对照用 Wikimedia Commons 和苹果地图 Look Around | 遵守权限设置 |
| D-05 | 2026-11-24 | 天气定为“雨后”：湿路面和水坑，不下雨 | 总决策选择，对标 Saltline |
| D-06 | 2026-11-24 | 诊断开关走 `#hash`（`#debug #nowet #nopost #noao #nobloom #safe`） | artifact 只透传 hash，不透传查询参数 |
| D-07 | 2026-11-24 | 手机默认关 AO | iPhone 画面偏暗的头号嫌疑，且手机性能紧 |
| D-08 | 2026-11-24 | 角色贴图拆成 `dist/chars/` 下的文件，缓冲在 JS 里解码成内存 GLB | iOS 的 artifact 沙箱拒绝 blob: 和 data: |
| D-09 | 2026-11-24 | 仓库管理照 project905：PR 合并、CI（lint / 单元测试 / 构建一致性 / 冒烟）、`main` 自动发布到 GitHub Pages；npm 只用于开发工具 | 总决策要求“参考其他项目的模式”；Pages 链接还能绕开 artifact 沙箱的限制 |
| D-10 | 2026-11-24 | `dist/index.html` 提交进仓库，CI 用 `npm run check` 确认它和 `src/` 一致 | artifact 和 Pages 都直接发布 `dist/`，不需要在线构建 |
| D-11 | 2026-11-24 | 版本号写在 `package.json`，构建时替换菜单里的 `__BUILD__` | 试玩反馈时能对上是哪个版本 |
| D-12 | 2026-11-25 | 环境图生成后先自检，失败就关掉环境光，不让整座城变黑 | 苹果 GPU 上环境图出现过 NaN；宁可少反射也不能黑屏 |
