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
