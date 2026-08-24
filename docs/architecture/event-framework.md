# 事件框架

Last Waystation 的远征事件由纯数据定义和固定解释器执行。内容层描述“何时出现、权重多少、产生什么效果”，核心层负责条件、随机数、状态更新和返程；React、存档仓库和浏览器 API 不参与规则计算。

## 边界与文件

| 职责 | 位置 |
| --- | --- |
| 事件、条件、效果和检定类型 | `src/core/content/contentTypes.ts` |
| 正式事件纯数据 | `src/core/content/events/` |
| 内容聚合注册表 | `src/core/content/contentRegistry.ts` |
| 内容结构、引用和可达性校验 | `src/core/content/validateContent.ts` |
| 条件求值 | `src/core/events/evaluateEventConditions.ts` |
| 方针修正和最终权重 | `src/core/events/calculateEventWeight.ts` |
| 候选过滤和加权选择 | `src/core/events/selectAdventureEvent.ts` |
| 能力检定和分支解析 | `src/core/events/resolveAdventureEvent.ts` |
| 效果顺序执行 | `src/core/events/applyEventEffects.ts` |
| 事件编排和安全返程 | `src/core/simulation/expeditionEngine.ts` |
| 战利品入库和统一结算 | `src/core/simulation/rewards.ts` |

事件定义必须能被 `JSON.stringify` 安全序列化，不得包含函数、类实例、循环引用或执行回调。解释器是唯一可以把定义变成状态变化的边界；内容文件不能导入 React、存档模块或模拟引擎。

## 处理流程

一次到期事件按以下固定顺序处理：

1. `processNextExpeditionEvent` 以 `processedEventCount + 1` 计算本次 `eventIndex`。
2. 从区域的 `eventIds` 取得已注册事件，再按事件的 `regionIds` 和全部 `conditions` 过滤。多个条件使用 AND，求值不修改输入，也不消费 RNG。
3. 计算 `baseWeight * policyModifiers[policy].weightMultiplier`。缺失修正默认为 `1`，非正最终权重不会进入候选集。
4. 对正权重候选执行一次加权选择，并把返回的 `nextRngState` 交给解析器。
5. `effects` 解析直接执行效果；`partyCheck` 先计算队伍指定属性总和与随机修正，结果大于或等于 `difficulty` 时进入成功分支，否则进入失败分支。
6. 选中分支内的效果严格按定义顺序执行。后一个效果读取前一个效果产生的英雄、战利品、旗标和 RNG 状态。
7. 写入主事件日志和额外日志，持久化新的英雄、战利品、旗标、下一事件时间及 RNG 状态。
8. 依次判断是否达到区域最大事件数、是否收到 `requestReturn`、是否触发谨慎方针返程；需要返程时统一调用 `settleExpedition`。

`eventIndexBetween` 使用 **1 基序号**。第一次处理的事件序号是 `1`，当前黑杉林最后一次正常事件序号是 `6`；`minimum` 和 `maximum` 都包含边界。条件中的生命比例取队伍成员生命比例的最小值。

## RNG 消耗

所有随机数都读取显式 `rngState` 并返回 `nextRngState`。固定范围表示 `min === max`，范围取样表示 `min < max`。

| 操作 | RNG 消耗 |
| --- | ---: |
| 区域和条件过滤 | 0 |
| 方针修正与权重计算 | 0 |
| 没有合格候选或没有正权重候选 | 0 |
| 成功的加权事件选择 | 1，即使只有一个候选 |
| 固定能力检定修正 | 0 |
| 范围能力检定修正 | 1 |
| 固定 `gainLoot` / `loseLoot` 数值 | 0 |
| 范围 `gainLoot` / `loseLoot` 数值 | 1 |
| 非随机英雄目标 | 0 |
| `randomPartyMember` 目标 | 1；有效远征队伍非空 |
| 固定伤害或治疗数值 | 0 |
| 范围伤害或治疗数值 | 1 |
| 日志、旗标、延迟和返程请求效果 | 0 |

`damageHero` 和 `healHero` 先选择目标，再抽取数值。因此随机目标加范围数值共消费两次 RNG，且顺序固定为“目标、数值”。非随机目标按目标属性排序，同值时按英雄 ID 稳定决胜。多个效果的总消耗是逐项消耗之和。

## 效果与返程

`gainLoot` 应用方针奖励倍率；`damageHero` 应用方针伤害倍率。`loseLoot` 不会把资源降到零以下，`damageHero` 默认不会把英雄降到 1 点生命以下，`healHero` 不会超过最大生命。设置旗标会去重，清除不存在的旗标无副作用，多个延迟调整会累加。

`requestReturn` 只在效果结果中记录返程意图，既不直接转移战利品，也不复制奖励逻辑。当前事件的剩余效果和日志仍按顺序完成，随后模拟引擎调用统一的 `settleExpedition`；最大事件数、请求返程和谨慎返程都共享该结算路径。

若没有满足条件的事件，或合格事件的最终权重全部为零，选择器返回原 RNG 状态。模拟引擎会写入标题为 `远征配置异常` 的 warning 日志，并通过 `settleExpedition` 安全返程，避免崩溃、空转或重复结算。该标题是系统保留值，内容事件不得使用。

## 确定性边界

可复现性要求以下输入完全一致：代码版本、内容定义及顺序、完整初始游戏状态、持久化 RNG 状态、命令参数和目标时间。满足这些条件时，在线推进、离线恢复和模拟器都经由 `advanceTo(state, targetTimestamp)` 得到相同结果，分段推进与一次推进保持等价。

事件注册顺序、区域 `eventIds` 顺序、效果顺序和英雄数据都属于确定性输入；调整它们可能改变后续随机序列对应的结果。框架不承诺不同应用版本之间保持相同事件序列。核心规则不得使用 `Math.random()`、隐式 `Date.now()` 或浏览器状态，也不得修改传入对象。
