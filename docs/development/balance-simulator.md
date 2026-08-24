# 平衡模拟器

平衡模拟器用于批量检查当前正式内容的收益、伤害、事件分布和状态不变量。它不是独立的收益公式：每次远征都调用正式 `createNewGame` 和 `startExpedition`，并且只通过 `advanceTo(state, targetTimestamp)` 推进。事件选择、效果、RNG 和返程结算均复用正式核心实现。

模拟器不依赖 React、浏览器、`localStorage`、网络、`Date.now()` 或 `Math.random()`。所有运行使用固定基准时间 `1_700_000_000_000`。

## 模拟场景

场景由正式内容注册表生成，不硬编码英雄组合数。当前内容包含：

- 1 个区域：黑杉林。
- 3 组双人英雄组合。
- 3 种行动方针。
- 2 个 cohort。

因此共有 `1 × 3 × 3 × 2 = 18` 个场景组。默认每组运行 1000 个 seed index，总计 18,000 次远征。

- `onboarding`：`completedExpeditions = 0`，保留正式首次远征木材保底。
- `steady-state`：`completedExpeditions >= 1` 且首航保底已领取，用于观察稳定期收益。

两个 cohort 分组统计，不会把首航保底混入稳定期平均值。

## Seed index

CLI 显示的 `1..N` 是可复现的 seed index，不是直接传给 xorshift32 的初始状态。连续小整数直接作为 xorshift32 状态会使首次抽样强相关，因此模拟器先使用稳定的 32 位 `murmur3-finalizer-v1` 混合函数派生非零 RNG 状态。

同一 seed index 会在不同英雄组合和方针中复用，便于进行受控比较。JSON 报告的 `configuration.seedDerivation` 会记录派生版本。可复现性仅承诺同一代码版本、内容定义、seed index 和参数产生相同结果；不承诺跨应用版本保持相同事件序列。

## 命令与参数

```bash
npm run simulate:balance
npm run simulate:balance -- --seeds 100
npm run simulate:balance -- --seeds 100 --check
npm run simulate:balance -- --seeds 1000 --output artifacts/balance
npm run simulate:balance:check
```

- `--seeds N`：每个场景组的 seed index 数量。`N` 必须是有限正整数，默认为 1000。
- `--check`：执行硬性不变量检查，并实际重复整次模拟比较稳定结果。此模式始终不写文件，即使同时提供 `--output` 也不例外。
- `--output <path>`：生成 `<path>/balance-summary.json` 和 `<path>/balance-summary.md`。未提供时仅输出终端摘要。

非法参数返回退出码 1。`simulate:balance:check` 固定使用 1000 个 seed index 和 `--check`，供 CI 调用。

## 指标定义

每个“区域 + 英雄组合 + 方针 + cohort”分组输出：

- 模拟次数和平均处理事件数。
- 完整完成率：处理到区域最大事件数的远征比例。
- 提前返程率：正常结算但未达最大事件数的比例；配置异常安全返程不计入。
- 平均木材、金币、食物和药品：结算后驿站资源减去出发完成时的资源。因此不包含出发消耗的 2 份食物，onboarding 木材包含正式首航保底。
- 平均总伤害：出发时队伍生命总和与结束时的净减少量。
- 最低生命触底次数：英雄从高于 1 点降到 1 点的观测次数。
- 各事件触发次数和占该组全部已识别事件的比例。
- 首航木材保底触发率、命令失败数和模拟异常数。

总体摘要包含场景组数、总模拟数、两个 cohort 的模拟数、seed index 范围、事件总数，以及命令失败、运行异常、无候选事件、NaN、Infinity、负资源、非法生命、未结束远征、非法 RNG、日志超限、循环保护和非确定结果的计数。状态不变量在出发后及每次 `advanceTo` 返回时观测，同一次模拟内的同类违规只累计一次。

## Check 失败条件

`--check` 在以下任一情况返回退出码 1：

- 内容校验失败。
- 远征命令失败或模拟运行异常。
- 无候选事件。
- 出现 NaN、Infinity 或负资源。
- 英雄生命超出合法范围。
- 远征未结束，或触发循环保护。
- 活动远征的 RNG 状态非法。
- 日志超过 200 条上限。
- 相同参数的两次完整模拟报告不一致。

## Warning 与解读边界

内容校验 warning 会显示在终端，但不使命令失败。某个方针收益稍高、某组英雄表现稍强、平均伤害较高或事件分布不均，都不是硬性失败条件。这些数据只是固定内容、参数和 seed index 范围下的客观观测，不直接证明因果，也不应单独作为大幅调整数值的依据。

比较报告时应保持代码版本、内容定义、cohort 和 seed index 范围一致。onboarding 与 steady-state 必须分开解读。

## 报告文件

提供 `--output` 时生成：

```text
<output>/balance-summary.json
<output>/balance-summary.md
```

JSON 字段顺序、场景顺序和事件顺序稳定；Markdown 提供总体摘要、分组表格和事件分布。两种报告都不包含生成时间戳，相同输入可以进行逐字节比较。

默认生成路径由 `.gitignore` 精确忽略：

```text
artifacts/balance/
artifacts/balance-*/
```

生成的报告用于本地检查，不应提交到仓库。
