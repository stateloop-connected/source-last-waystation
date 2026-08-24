import type { BuildingDefinition } from './contentTypes'

export const WATCHTOWER_ID = 'watchtower'

export const BUILDING_DEFINITIONS = [
  {
    id: WATCHTOWER_ID,
    name: '瞭望塔',
    maxLevel: 3,
    upgradeWoodCosts: [10, 25, 50],
  },
] as const satisfies readonly BuildingDefinition[]

export const WATCHTOWER_DEFINITION: BuildingDefinition =
  BUILDING_DEFINITIONS[0]

export function getBuildingDefinition(
  id: string,
): BuildingDefinition | undefined {
  return BUILDING_DEFINITIONS.find((building) => building.id === id)
}

export function getWatchtowerUpgradeCost(level: number): number | null {
  if (level < 0 || level >= WATCHTOWER_DEFINITION.maxLevel) {
    return null
  }

  return WATCHTOWER_DEFINITION.upgradeWoodCosts[level] ?? null
}
