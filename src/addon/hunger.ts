import { Player } from "@minecraft/server"
import type { EntityAttributeComponent } from "@minecraft/server"

const DYNAMIC_KEY = "com:exhaustion"
const EXHAUSTION_THRESHOLD = 4.0
const HUNGER_COMPONENT_ID = "minecraft:player.hunger"
const SATURATION_COMPONENT_ID = "minecraft:player.saturation"

const exhaustionCache = new Map<string, number>()

function getAttribute(player: Player, componentId: string): EntityAttributeComponent | undefined {
  try { return player.getComponent(componentId) as EntityAttributeComponent | undefined }
  catch { return undefined }
}

function loadDyp(player: Player): number {
  const cached = exhaustionCache.get(player.id)
  if (cached !== undefined) return cached

  let stored = 0
  try {
    const raw = player.getDynamicProperty(DYNAMIC_KEY)
    if (typeof raw === "number") stored = raw
  } catch { }

  exhaustionCache.set(player.id, stored)
  return stored
}

function persist(player: Player, value: number): void {
  try { player.setDynamicProperty(DYNAMIC_KEY, value) }
  catch { } // player left
}

function drainOnePoint(player: Player): void {
  const saturation = getAttribute(player, SATURATION_COMPONENT_ID)
  if (saturation && saturation.currentValue > saturation.effectiveMin) {
    try {
      saturation.setCurrentValue(Math.max(saturation.effectiveMin, saturation.currentValue - 1))
      return
    } catch { }
  }

  const hunger = getAttribute(player, HUNGER_COMPONENT_ID)
  if (hunger && hunger.currentValue > hunger.effectiveMin) {
    try { hunger.setCurrentValue(Math.max(hunger.effectiveMin, hunger.currentValue - 1)) }
    catch { }
  }
}

export function applyMiningExhaustion(
  player: Player,
  blockCount: number,
  exhaustionPerBlock: number,
): void {
  if (blockCount <= 0 || exhaustionPerBlock <= 0) return

  let exhaustion = loadDyp(player) + blockCount * exhaustionPerBlock
  while (exhaustion >= EXHAUSTION_THRESHOLD) {
    exhaustion -= EXHAUSTION_THRESHOLD
    drainOnePoint(player)
  }

  exhaustionCache.set(player.id, exhaustion)
  persist(player, exhaustion)
}

export const clearExhaustionCache = (playerId: string): boolean => exhaustionCache.delete(playerId)
