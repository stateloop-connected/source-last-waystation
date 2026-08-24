import type { AdventureEventDefinition } from './contentTypes'
import { BLACK_FIR_FOREST_EVENTS } from './events/blackFirForest'

export { BLACK_FIR_FOREST_EVENTS } from './events/blackFirForest'

export const ADVENTURE_EVENTS = [
  ...BLACK_FIR_FOREST_EVENTS,
] as const satisfies readonly AdventureEventDefinition[]

export function getAdventureEvent(
  id: string,
): AdventureEventDefinition | undefined {
  return ADVENTURE_EVENTS.find((event) => event.id === id)
}
