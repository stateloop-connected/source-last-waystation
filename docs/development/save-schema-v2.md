# Save Schema V2

阶段 2A 将存档信封升级为 V2，同时继续读取已发布的 V1 存档。存档版本由 JSON 内的 `schemaVersion` 决定，不由 localStorage 键名决定。

## V2 信封

```ts
type SaveFileV2 = {
  schemaVersion: 2
  savedAt: number
  game: GameState
}
```

V2 在原游戏状态上增加以下字段：

| 字段 | 新游戏或 V1 迁移默认值 | 阶段 2A 语义 |
| --- | --- | --- |
| `unlockedRegionIds` | `["black-fir-forest"]` | 已解锁区域 ID；本阶段只有黑杉林 |
| `station.infirmaryLevel` | `0` | 医务室结构占位，本阶段不提供升级或治疗 |
| 罗恩 `traitIds` | `["ronn.guardian"]` | 固定特质元数据 |
| 伊芙 `traitIds` | `["eve.pathfinder"]` | 固定特质元数据 |
| 米娅 `traitIds` | `["mia.field-medic"]` | 固定特质元数据 |
| `activeExpedition.eventFlags` | `[]` | 当前远征的一次性旗标；远征结束时随对象清除 |

`traitIds` 和 `infirmaryLevel` 仅为后续阶段准备数据结构。阶段 2A 不实现特质效果、医务室交互或治疗规则；当前合法医务室等级仍为 `0`。

## 冻结的 V1 契约

`src/save/saveTypes.ts` 逐字段声明 `HeroStateV1`、`ExpeditionStateV1` 和 `GameStateV1`。这些类型不通过 `Omit<GameState, ...>` 等方式从当前运行时模型派生，因此阶段 2B 给运行时状态增加字段时，不会反向改变已发布的 v0.1 存档契约。

V1 校验只按 v0.1 的字段、枚举和内容引用执行。早期开发版 V1 若缺少 `hasClaimedFirstExpeditionReward`，会根据已有完成次数补齐后再进入正式迁移。

## V1 到 V2 迁移

`migrateSaveV1ToV2` 是纯函数，不修改传入对象。迁移会复制嵌套资源、英雄、远征、战利品和日志结构，并补充 V2 默认字段。它保留：

- 全部资源数量；
- 英雄等级、生命、属性、状态和顺序；
- 瞭望塔等级、完成远征次数和首次奖励标记；
- 日志 ID、内容、时间和顺序；
- 活跃远征的队伍、方针、战利品和处理进度；
- `seed`、`rngState`、`startedAt`、`lastProcessedAt` 和 `nextEventAt`。

迁移本身不推进时间、不重新执行事件、不重复发放首次远征奖励。迁移结果还必须通过 V2 结构与内容引用深校验；日志最多 200 条，持久化 RNG 值必须位于 `0..0xffffffff`，其中 `0` 继续按既有确定性兼容规则接受。

## 本地存储与原子回写

生产 localStorage 键继续使用：

```text
last-waystation.save.v1
```

保留带 `v1` 的旧键是为了不遗弃线上存档。首次加载合法 V1 时，仓库会依次完成验证、纯迁移、时间归一化和 `advanceTo` 推进，然后在同一键中立即写回 V2。

写入前会保留原始文本。若存储实现写入后抛错，仓库会尝试恢复原值；加载仍返回已经迁移的可玩状态，并向 Provider 报告“V1 升级未保存”。界面会提示 V2 写入失败且原 V1 已保留。普通保存与导入也使用相同的失败恢复原则，不会先删除旧存档。

当本地文本无法解析、验证、迁移或推进时，Provider 会隔离该文本并暂停定时与命令触发的普通保存，避免回退新游戏在稍后覆盖原存档。只有成功导入另一份合法存档，或玩家明确执行重置，才会解除隔离。

## 导入与导出

- `decodeSave` 和导入入口接受 V1 与 V2。
- V1 先迁移为 V2，再归一化、推进并保存。
- V2 通过深校验后直接归一化和推进。
- 新游戏首次保存、后续保存和导出始终生成 `schemaVersion: 2` 信封。
- 导入解析、迁移、推进或写入失败时，当前有效游戏状态保持不变。

`schemaVersion: 3` 或其他未知未来版本会返回 `unsupported-version`，不会按 V2 猜测解析。

## 时间归一化

系统时钟回拨时，归一化会整体平移游戏时间线，并保持日志与远征时间的相对关系。V1 与 V2 对下一事件间隔采用不同策略：

- V1 不支持事件延迟效果，因此加载或导入 V1 时使用区域基础间隔修复漂移的 `nextEventAt`。
- V2 支持 `adjustNextEventDelay`，因此保留任意非负、可安全表示的 `nextEventAt - lastProcessedAt`。负间隔回退到区域基础间隔，最终时间戳钳制在存档允许的最大值内。

这样既保持 v0.1 未来时间戳修复行为，也保证 V2 的自定义事件延迟在导出、导入和刷新后不丢失。
