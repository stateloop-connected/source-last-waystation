# 事件内容创作指南

正式事件位于 `src/core/content/events/`，并由 `src/core/content/events.ts` 汇总到内容注册表。事件只能声明数据，不能加入 `resolve`、`apply`、`handler` 或其他函数回调；所有条件、检定和效果必须使用 `contentTypes.ts` 已定义的判别联合类型。

## 未注册示例

下面的定义展示一个可用的黑杉林事件，但它是文档示例，**没有注册，也不得因复制示例而直接加入正式内容**。它同时演示 1 基事件序号、一次性远征旗标、固定奖励、范围奖励、额外日志和方针修正。

```ts
import type { AdventureEventDefinition } from '../../src/core/content/contentTypes'

export const UNREGISTERED_SUPPLY_CACHE_EXAMPLE = {
  id: 'forest-supply-cache-example',
  title: '林间补给箱示例',
  description: '队伍在倒伏的黑杉下发现一个尚未腐坏的补给箱。',
  regionIds: ['black-fir-forest'],
  tags: ['reward', 'discovery'],
  baseWeight: 4,
  conditions: [
    { type: 'regionIs', regionId: 'black-fir-forest' },
    { type: 'eventIndexBetween', minimum: 2, maximum: 5 },
    {
      type: 'expeditionFlagAbsent',
      flag: 'example.supply-cache-opened',
    },
  ],
  policyModifiers: {
    cautious: { weightMultiplier: 0.8, rewardMultiplier: 0.9 },
    explore: { weightMultiplier: 1.2 },
    greedy: { weightMultiplier: 1.1, rewardMultiplier: 1.2 },
  },
  resolution: {
    type: 'effects',
    effects: [
      {
        type: 'gainLoot',
        resource: 'medicine',
        amount: { min: 1, max: 1 }, // 固定值，不消费 RNG
      },
      {
        type: 'gainLoot',
        resource: 'wood',
        amount: { min: 2, max: 4 }, // 范围值，消费一次 RNG
      },
      {
        type: 'setExpeditionFlag',
        flag: 'example.supply-cache-opened',
      },
      {
        type: 'appendJournal',
        category: 'reward',
        title: '补给箱已开启',
        text: '药品和木材已经装入远征行囊。',
      },
    ],
  },
} as const satisfies AdventureEventDefinition
```

如果未来按已批准范围把事件转为正式内容，需要同时把定义加入对应区域事件数组，并把事件 ID 加入该区域的 `eventIds`。单边注册会被内容校验器拒绝。

## 字段规则

- `id` 是稳定引用。使用清晰的 lowercase kebab-case；已发布 ID 不得随意修改或复用。
- `title` 去除首尾空白后必须非空且在全部事件中唯一。`src/core/content/contentDiagnostics.ts` 的 `RESERVED_ADVENTURE_EVENT_TITLES` 是系统诊断保留标题清单，当前的 `远征配置异常` 不得作为内容标题。
- `regionIds` 必须引用已注册区域，区域的 `eventIds` 也必须反向包含事件 ID。
- `tags` 至少包含一个受支持标签：`safe`、`reward`、`danger`、`combat`、`discovery` 或 `recovery`。标签参与校验、日志分类和统计，不应被当作任意文本。
- `baseWeight` 必须是有限正数。`weightMultiplier`、`rewardMultiplier` 和 `damageMultiplier` 默认为 `1`，声明值必须是有限非负数；最终权重为零时该方针不会选择事件。
- `conditions` 全部使用 AND。`eventIndexBetween` 是 1 基且包含两端；生命比例在 `0..1`；资源阈值非负；旗标使用小写字母和数字组成的点号、下划线或连字符分段。
- 数值范围使用安全整数且满足 `min <= max`。`min === max` 是固定值，不消费 RNG；`min < max` 消费一次 RNG。
- `resolution.effects` 按数组顺序执行。需要检定时使用 `partyCheck`，不要在内容文件内计算属性、调用 RNG 或直接修改状态。

每个区域、方针和双人队伍组合在 `1..maxEventCount` 的每个事件序号都必须有静态保证候选。用于保证覆盖的事件可以按区域、方针、队伍或事件序号限制，但不能依赖会在远征中变化的生命、战利品或旗标；条件事件之外应始终保留这样的兜底内容。

方针修正应表达明确的既有设计意图，不要仅为拉开模拟结果而随意放大差异。奖励倍率只作用于 `gainLoot`，伤害倍率只作用于 `damageHero`，权重倍率只影响事件选择。

## 校验与测试

修改内容后至少运行：

```bash
npm run typecheck
npm run validate:content
npm run test:run
npm run simulate:balance:check
```

提交前还应运行 `npm run lint` 和 `npm run build`。`validate:content` 会检查可序列化结构、重复 ID、标题、引用、条件与效果参数、方针权重、区域覆盖和事件可达性；失败时返回非零退出码。`simulate:balance:check` 使用正式命令、`advanceTo` 和事件解析器检查确定性及状态不变量，不替代单元测试。

新增或修改事件时，测试应覆盖条件命中与不命中、固定与范围数值的 RNG 消耗、效果顺序、方针权重、所有检定分支，以及通过正式推进路径产生的合法日志和状态。仅在后续事件序号可触发的定义，也应有测试证明它在区域最大事件数内可达。

## 阶段 2B 边界

本指南描述的是阶段 2A 已具备的底层能力，不代表示例事件或新玩法已经上线。特质效果、医务室治疗、废弃矿井、进一步的方针差异化和新正式事件内容留给阶段 2B；不得借内容贡献提前加入新区域、治疗操作、任意脚本效果或未建模规则。`traitIds` 与 `infirmaryLevel` 在当前阶段仅是数据结构准备。
