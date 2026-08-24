# 表现效果架构

阶段 2B 在核心模拟之上增加远征视觉演出，但不增加新的玩法规则。黑杉林场景、路线位移、事件卡片、伤害与战利品反馈、返程摘要和离线摘要都只是已结算状态的表现。

## 单向数据流

```text
命令、计时或存档加载
  -> advanceTo / 核心命令完成结算
  -> 新 GameState
  -> 集中状态替换入口记录 transition source
  -> 纯函数比较前后 GameState
  -> 临时 VisualEvent
  -> 有界表现队列
  -> React + CSS + 内联 SVG 展示
```

`src/core` 不导入 `src/presentation`。核心层只决定事件选择、伤害、奖励、返程、日志、RNG 和保存状态；表现层只能读取结算前后的快照，不能回写核心结果。

以下内容永远不属于 `GameState`：

- `VisualEvent` 和已消费 ID；
- 当前事件卡片、浮动数字和动画计时器；
- 返程或离线摘要的显示、关闭状态；
- 动画偏好及页面可见性。

因此切换 `system`、`full`、`reduced` 或 `off` 后，相同输入仍产生相同游戏状态和 RNG 状态。刷新、导入和导出也不会持久化或恢复一段动画。

## 状态变化来源

所有替换游戏状态的路径都通过集中入口携带 `GameTransitionSource`。来源是表现策略的输入，不是领域规则。

| 来源 | 含义 | 表现策略 |
| --- | --- | --- |
| `bootstrap` | 从浏览器存档初始化并完成离线推进 | 仅在确有进展时显示离线摘要 |
| `liveTick` | 前台常规计时推进 | 单事件可播放完整反馈，批量变化会合并 |
| `startCommand` | 开始远征 | 显示队伍出发和路线起点 |
| `retreatCommand` | 手动撤退 | 核心立即返程，再显示一次返程摘要 |
| `debugAdvance` | 开发环境的确定性推进 | 短推进可完整显示，长推进使用摘要 |
| `importSave` | 原子导入并完成必要推进 | 清除旧演出，只保留导入后的单份进展摘要 |
| `resetGame` | 重置游戏 | 立即清空队列、摘要和旧计时器 |
| `upgradeCommand` | 建筑升级 | 经过相同入口，但不会伪造远征事件 |
| `debugCommand` | 其他开发环境状态命令 | 经过相同入口，但不会伪造远征事件 |
| `backgroundRecovery` | 页面从后台恢复 | 把后台期间的变化合并为一份摘要 |

集中标记来源可避免组件根据日志标题或时间差猜测操作，也让定时器始终通过最新状态引用执行。Strict Mode 的 effect 清理会撤销旧监听器和旧计时器，不能让过期闭包再次入队或保存。

## VisualEvent 推导

`deriveVisualEvents(previous, next, source)` 是无 DOM、无浏览器 API 的纯函数。它不修改输入，不读取 `Date.now()`，不调用 `Math.random()`；稳定 ID 由 transition 指纹、远征 ID、日志 ID、英雄或资源标识组合得到。同一组输入会得到相同顺序和相同 ID，队列可据此消除 Strict Mode 或重复提交造成的重复演出。

表现层可推导以下临时事件：

- `expeditionStarted`：从无活动远征变为有活动远征；
- `partyAdvanced`：同一远征的 `processedEventCount` 增加；
- `eventRevealed`：本次 transition 新增了正式主事件日志；
- `heroDamaged` / `heroHealed`：英雄生命值的真实负差值或正差值；
- `lootChanged`：同一活动远征 `carriedLoot` 的真实差值；
- `expeditionReturned`：活动远征被核心结算并清除；
- `progressSummary`：批量、离线、导入、后台或队列溢出的聚合结果。

返程时携带物转入总资源只在返程摘要中计算一次，不会再伪装成新的掉落。`heroHealed` 只是对可能出现的正生命差值提供通用展示能力；当前阶段没有新增治疗事件或治疗玩法。

## sourceEventId

正式主事件生成日志时写入可选的 `JournalEntry.sourceEventId`。表现层用它查询事件注册表并取得 `safe`、`reward`、`danger`、`combat`、`discovery` 或 `recovery` 标签，标签优先级集中为：

```text
combat -> danger -> reward -> recovery -> discovery -> safe
```

`sourceEventId` 是可序列化的事件来源元数据，不是动画状态。系统日志、返程日志和普通追加日志不需要该字段。旧 V1/V2 日志缺少字段仍然合法；字段存在时必须是非空字符串，但注册表中暂时找不到该 ID 也不会使存档失效，事件卡片会按日志类别安全降级为通用样式。

## 批量与队列

一次状态变化可能跨过多个事件。表现层按实际处理数量压缩输出：

| 一次处理量 | 输出 |
| --- | --- |
| 0 或 1 个事件 | 输出对应的完整临时事件 |
| 2 至 3 个事件 | 最多保留最后一个重要事件，并追加聚合摘要 |
| 超过 3 个事件 | 只输出一份 `progressSummary` |

若同一批次已经返程，上述压缩结果会额外保留唯一的 `expeditionReturned`，供准备界面显示返程结算；它不会恢复被压缩的逐条事件演出。

队列最多保留 8 项。超限时现有项按 transition 分组后折叠为一份摘要；事件数、完成远征数、资源差值和英雄生命差值会聚合，而不是静默丢弃。已见 ID 使用有界集合去重，每项只消费一次。

`bootstrap`、`startCommand`、`importSave` 和 `backgroundRecovery` 使用替换语义，不会把新摘要或新远征接在陈旧演出后面。`importSave` 与 `resetGame` 还会清空表现层的已见 ID 集合，使导入较早存档或固定时间重开游戏后仍能正确呈现新的 transition；`resetGame` 同时清空队列。Provider 统一拥有展示计时器，卸载、导入或重置时会取消旧计时器；动画结束回调只消费表现项，绝不修改正式游戏状态。

## 后台与离线

页面隐藏时，CSS 环境循环暂停，正式推进仍由既有计时和 `advanceTo` 负责。`visibilitychange` 监听只改变表现策略：后台期间不积压逐条卡片，回到前台后把实际变化合并为一份 `background` 摘要。若恢复后的撤退或升级命令让远征返程，则以后台首个快照和命令后的最终状态生成唯一返程摘要，避免把携带战利品同时显示为后台收入和返程收入。监听器在 Provider 卸载时移除。

浏览器启动和存档导入继续走既有流程：解码、迁移、归一化、`advanceTo`。仓储层保留推进前的合法归一化状态，与推进后的状态纯比较，只把 `GameTransitionSummary` 作为不持久化的加载元数据返回；完整旧状态不会暴露给 UI。没有实际事件、返程、资源或生命变化时不显示离线摘要，刷新也不会重放已保存日志的演出。

## 动画偏好

动画偏好使用独立 key `last-waystation.ui-preferences.v1`，不会进入游戏存档，也不会被游戏导入或重置覆盖。页面根节点的 `data-motion-preference` 保存用户选择，`data-motion` 保存解析后的有效模式：

- `system`：根据 `prefers-reduced-motion: reduce` 解析为 `reduced`，否则为 `full`；
- `full`：启用环境循环、路线位移、轻量事件卡片与浮动反馈；
- `reduced`：移除大幅位移、震动和视差，以短淡入或即时更新保留状态提示；
- `off`：关闭所有非必要动画，但保留静态场景、路线、数字和文字摘要。

偏好读取失败、JSON 损坏或值非法时回退到 `system`。CSS 必须同时尊重有效 `data-motion` 与系统 reduced-motion 承诺；隐藏动画绝不能隐藏信息。

## 实现边界

- 场景使用 React、CSS、内联 SVG 和已有本地图标，不发起远程图片或动画资源请求。
- 环境循环只修改 `transform` 和 `opacity` 等合成友好属性，不驱动 React 每帧更新。
- 路线节点数来自 `activeExpedition.maxEventCount`，当前正式内容为六个事件，但表现层不硬编码六节点。
- 事件卡片不会抢焦点；精简后的结果会进入 `aria-live="polite"`，完整日志继续承担叙事。
- 动画不能延迟 `activeExpedition` 清除、奖励结算、自动保存或用户操作。

视觉验证方法见 [视觉测试指南](../development/visual-testing.md)。
