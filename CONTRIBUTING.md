# 贡献指南

感谢参与 Last Waystation。当前项目是 `v0.1.0-alpha` 技术原型，贡献应优先提高正确性、可测试性、可访问性和发布稳定性，避免在一个 Pull Request 中同时扩大玩法范围和重写架构。

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
npm run test:run
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

更多英雄、区域、装备、制作和大规模事件内容属于后续阶段。请先通过功能建议 Issue 讨论范围；当前阶段优先接受现有闭环的缺陷修复、测试、文档和可访问性改进。
