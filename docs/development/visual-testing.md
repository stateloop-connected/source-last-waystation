# 视觉测试指南

阶段 2B 的视觉测试验证状态表达、动画策略、响应式布局和生产资源，而不是逐帧复刻 CSS 动画。游戏结果仍由核心单元测试和流程 E2E 验证。

## 准备环境

安装锁文件依赖和 Chromium：

```bash
npm ci
npx playwright install chromium
```

常规开发 E2E 会按 Playwright 配置自动启动开发服务器。生产冒烟需要先生成 `dist/`：

```bash
npm run build
npm run test:e2e:prod
```

运行全部开发 E2E：

```bash
npm run test:e2e
```

只运行视觉相关套件：

```bash
npx playwright test tests/e2e/expedition-visuals.spec.ts tests/e2e/motion-preferences.spec.ts tests/e2e/offline-summary.spec.ts
```

需要人工观察过渡时使用 headed 模式；断言仍应等待可访问名称、测试 ID、日志或存档状态等语义结果：

```bash
npx playwright test tests/e2e/expedition-visuals.spec.ts --headed
```

失败时检查 `test-results/` 中的截图和 trace，以及 `playwright-report/`。这些目录是临时产物，不能提交。

## 动画模式矩阵

动画控制位于界面的“动画效果”字段组。测试可通过可访问标签选择模式，并检查根节点属性：

| 选择 | `data-motion-preference` | 有效 `data-motion` | 核心检查 |
| --- | --- | --- | --- |
| 跟随系统 | `system` | `full` 或 `reduced` | 与浏览器 `prefers-reduced-motion` 一致 |
| 完整 | `full` | `full` | 环境循环和过渡可用，状态立即完成结算 |
| 简化 | `reduced` | `reduced` | 无大幅位移、震动或视差，文字反馈保留 |
| 关闭 | `off` | `off` | 非必要动画关闭，静态场景与全部信息保留 |

系统模式用 Playwright context 的 `reducedMotion: 'reduce'` 和 `reducedMotion: 'no-preference'` 分别验证。切换设置应即时生效并写入 `last-waystation.ui-preferences.v1`；刷新、导入游戏存档和重置游戏后选择应保持。不要把 UI 偏好写进合成游戏存档。

普通业务 E2E 默认使用 reduced motion，减少时间相关波动。专门验证视觉演出时显式选择完整模式，验证功能降级时再分别选择简化或关闭模式。无论哪种模式，核心状态、日志、资源、英雄生命和 RNG 断言必须一致。

## 确定性场景

不要等待多个真实的 15 秒周期。视觉 E2E 应复用 `tests/e2e/testHarness.ts` 的合法 V2 合成状态和存档写入方式，固定 `savedAt`、活动远征、事件时间及 RNG 状态，再通过开发推进工具或到期的正式 tick 触发变化。

每类反馈至少同时验证视觉提示和正式结果：

- 场景：黑杉林背景存在，路线节点数等于存档中的 `maxEventCount`，初始和推进后的数字进度正确；
- 事件：卡片或静态提示出现，冒险日志新增同一正式事件；
- 伤害：反馈关联实际受伤英雄，显示值等于英雄生命差值；
- 战利品：资源提示等于 `carriedLoot` 差值，返程转存不重复显示掉落；
- 返程：核心远征、资源和自动保存先完成，摘要只出现一次，刷新后不重放；
- 离线：注入保存时间和事件时间位于过去的合法 V2 活动远征，只出现一份聚合摘要，日志仍包含正式结算；
- 后台：隐藏页面期间不积压卡片，恢复后只有合并摘要，推进结果不受可见性影响。

测试存档不得含个人信息，也不能绕过存档解码、迁移、归一化或 `advanceTo`。损坏存档路径不得伪造离线摘要。

## 断言原则

- 等待语义状态，不用大段 `waitForTimeout` 猜测动画结束时间。
- 不断言某一帧的坐标、透明度、雾的位置或抖动角度。
- 不把易变 CSS 类名当作主要定位；必要时使用稳定且有限的 `data-testid`。
- 不要求事件卡片获取焦点；检查 `aria-live="polite"` 的精简文字和日志即可。
- 不用颜色作为唯一断言；同时检查标签、图形、边框状态或可访问文本。
- 不为每个动画帧创建截图快照。截图只覆盖有代表性的稳定状态和布局回归。
- 不通过延长任意超时掩盖竞态。失败时先查看 trace 中的状态替换、存档和可见性事件。

## 视口检查

至少检查以下视口：

| 视口 | 重点 |
| --- | --- |
| 1440 x 900 | 场景、状态区和日志的桌面信息层级 |
| 768 x 1024 | 中等宽度下的栏位折行和摘要布局 |
| 390 x 844 | 常见移动端的场景高度、设置触控和日志滚动 |
| 360 x 800 | 路线节点、长文本和摘要无横向溢出 |

在每个移动视口检查 `document.documentElement.scrollWidth <= document.documentElement.clientWidth`，同时确认事件卡片不会遮挡撤退按钮，浮动结果不会越出场景，动画设置可操作，日志可滚动且不依赖 hover。

## 生成生产截图

提交的截图必须来自最新生产构建。先构建并启动预览，使用 Vite 在终端输出的地址，不要在文档、提交信息或截图中记录临时地址：

```bash
npm run build
npm run preview
```

使用浏览器自动化写入完全合成且通过 V2 校验的活动远征存档，然后重新加载应用。选择“完整”模式，触发一个确定性事件并停在可读的静态时刻；画面应展示黑杉林场景、路线、两名英雄标记、数字进度，以及事件卡片或当前结果。不得显示开发推进工具、浏览器开发工具、个人数据、本机路径或令牌。

分别设置并保存：

| 输出 | 视口 |
| --- | --- |
| `docs/images/game-desktop.png` | 1440 x 900 |
| `docs/images/game-mobile.png` | 390 x 844 |

截图后用生产构建再检查一次：控制台无项目错误，HTML、JS、CSS、图标和本地场景资源无 404，没有远程图片请求；移动截图无横向溢出，关键按钮和日志仍可见。PNG 应按实际界面尺寸导出并保持合理文件大小，不提交视频、GIF、Playwright 报告或其他临时产物。

## 提交前检查

视觉改动除相关定向测试外，还必须通过完整验证：

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

在 Pull Request 中记录桌面、390 px 和 360 px 的人工检查，完整、简化、关闭及系统 reduced motion 结果，后台恢复和离线摘要结果，以及构建体积、控制台错误和资源 404 数量。视觉层不能改变平衡模拟、`advanceTo` 语义、事件奖励或 RNG 顺序。
