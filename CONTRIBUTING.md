# 贡献指南

感谢参与 Last Waystation。当前已发布版本是 `v0.1.0-alpha.0` 技术原型，贡献应优先提高正确性、可测试性、可访问性和发布稳定性，避免在一个 Pull Request 中同时扩大玩法范围和重写架构。

## 安装与运行

需要 Node.js 22 LTS 与 npm。

```bash
npm ci
npm run dev
```

提交前运行：

```bash
npm run lint
npm run typecheck
npm run validate:content
npm run test:run
npm run simulate:balance:check
npm run build
npm run test:e2e
npm run test:e2e:prod
```

首次运行 E2E 时安装 Chromium：

```bash
npx playwright install chromium
```

生产冒烟测试前需要先完成 `npm run build`。

## 提交 Issue

- Bug 请使用 Bug 报告表单，提供最小复现步骤、期望行为、实际行为、浏览器和操作系统。
- 可附上已移除私人信息的存档和控制台错误，但不要提交账号、令牌、个人路径或其他敏感数据。
- 功能建议请说明它解决的问题，以及为什么符合当前路线图。
- 安全问题或可能暴露私人数据的问题不要附带真实敏感样本。

## 提交 Pull Request

- 保持改动聚焦，并在说明中写明行为变化和实际验证命令。
- 不要丢弃或重写与改动无关的代码。
- 保持 `src/core` 与 React、DOM、存储和真实系统时间解耦。
- 修改模拟、奖励、RNG 或存档规则时必须增加确定性单元测试。
- 修改用户流程时补充或更新 Playwright 测试，并优先使用角色、标签等稳定定位方式。
- 不要提交 `node_modules`、`dist`、Playwright 报告、trace、密钥或本地环境文件。

## 内容贡献

事件内容必须满足以下最低要求：

- 定义必须是可 JSON 序列化的纯数据，不得包含函数回调、Class 实例、循环引用或脚本字符串。
- 条件、检定和效果必须使用现有判别联合类型与集中解析器，不得在内容文件或 React 组件中实现旁路规则。
- 不得随意修改已经发布的英雄、区域和事件 ID；确需变更时必须同时给出存档兼容方案。
- 新增或修改事件必须补充条件、RNG 消耗、效果范围和正式推进路径的测试。
- 提交前必须运行 `npm run validate:content` 和 `npm run simulate:balance:check`，并在 PR 中记录结果。
- 平衡报告中的差异先作为客观观察记录；除非违反不变量，不要把内容 PR 扩大为无关的大规模调平衡。

完整示例与字段说明见 [内容创作指南](docs/development/content-authoring.md)。更多英雄、区域、装备、制作和大规模事件内容仍需先通过功能建议 Issue 讨论范围。

## 视觉贡献

- 视觉演出只能表现已经完成的核心结算。不得从动画回调修改 `GameState`，不得用 UI 定时器推进远征，也不得为了等待动画而延迟奖励、返程、自动保存或其他正式状态变化。
- 表现逻辑放在 `src/presentation` 或对应展示组件中，不能进入 `src/core`；核心层也不能反向导入 `VisualEvent`、React、DOM 或浏览器 API。详细依赖边界见 [表现效果架构](docs/architecture/presentation-effects.md)。
- 不得把动画队列、持续时间、关闭状态或临时摘要写入游戏存档，也不得让视觉代码消费或改变 RNG。动画偏好使用独立的 UI 偏好存储。
- 场景资源必须随仓库提供。不要新增远程图片、字体、视频、GIF、动态脚本或第三方动画引擎；优先使用轻量的 React、CSS、内联 SVG 和现有图标。
- 每个视觉变化都必须支持 `prefers-reduced-motion` 和游戏内简化、关闭模式。关闭动画后，进度、事件结果、伤害、战利品及返程或离线摘要仍须有完整文字表达。
- 装饰图形应对辅助技术隐藏；核心进度需要可读数字，事件提示使用克制的 live region，颜色不能是唯一的状态区别，也不得加入高频闪烁。
- 视觉 Pull Request 需要验证至少 1440 x 900、390 x 844 和 360 x 800 的布局，提供桌面与移动端结果，并记录控制台错误、资源加载失败和横向溢出检查。
- 测试应等待语义状态，不等待动画的固定毫秒或比较每一帧。业务流程默认减少动画，专门的视觉用例再显式启用完整模式。运行方式和生产截图要求见 [视觉测试指南](docs/development/visual-testing.md)。
