import { Player, world } from "@minecraft/server"
import type { EntityAttributeComponent } from "@minecraft/server"
import { CONFIG } from "../core/config"

// constant value ---
const DYNAMIC_KEY = "com:exhaustion"
const THRESHOLD = 4.0
const HUNGER_ID = "minecraft:player.hunger"
const SATURATION_ID = "minecraft:player.saturation"
// constant value ---

const exhaustionCache = new Map<string, number>()
function getAttribute(player: Player, componentId: string): EntityAttributeComponent | undefined {
  try {
    const component = player.getComponent(componentId) as EntityAttributeComponent | undefined
    return component
  } catch (e) { return undefined }
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
  const saturation = getAttribute(player, SATURATION_ID)
  if (saturation && saturation.currentValue > saturation.effectiveMin) {
    try {
      const oldValue = saturation.currentValue
      const newValue = Math.max(saturation.effectiveMin, oldValue - 1)
      saturation.setCurrentValue(newValue)

      if (CONFIG.debug) console.log(`§e[HUNGER DEBUG]§r §b${player.name}§r: drained §qsaturation§r from §f${oldValue.toFixed(1)}§r to §f${newValue.toFixed(1)}§r§7 (min: ${saturation.effectiveMin})`)
      return
    } catch (e) { if (CONFIG.debug) console.error(`§c[HUNGER ERROR]§r drain saturation: ${e}`) }
  }

  const hunger = getAttribute(player, HUNGER_ID)
  if (hunger && hunger.currentValue > hunger.effectiveMin) {
    try {
      const oldValue = hunger.currentValue
      const newValue = Math.max(hunger.effectiveMin, oldValue - 1)
      hunger.setCurrentValue(newValue)

      if (CONFIG.debug) console.log(`§e[HUNGER DEBUG]§r §b${player.name}§r: drained §phunger§r from §f${oldValue.toFixed(1)}§r to §f${newValue.toFixed(1)}§r§7 (min: ${hunger.effectiveMin})`)
    } catch (e) { if (CONFIG.debug) console.log(`§c[HUNGER ERROR]§r drain hunger: ${e}`) }
  }
}

export function applyMiningExhaustion(
  player: Player,
  blockCount: number,
  exhaustionPerBlock: number,
): void {
  if (blockCount <= 0 || exhaustionPerBlock <= 0) return

  const oldExhaustion = loadDyp(player)
  let exhaustion = oldExhaustion + blockCount * exhaustionPerBlock
  const hungerAttr = getAttribute(player, HUNGER_ID)
  const saturationAttr = getAttribute(player, SATURATION_ID)

  if (CONFIG.debug) console.log(`§6[HUNGER]§r §b${player.name}§r mined §e${blockCount}§r block (§a${exhaustionPerBlock}§r per block), exhaustion: §c${oldExhaustion.toFixed(2)}§r -> §c${exhaustion.toFixed(2)}§r §7(threshold: ${THRESHOLD}) | hunger: §p${hungerAttr?.currentValue ?? "?"}§r§7 Saturation: §q${saturationAttr?.currentValue.toFixed(1) ?? "?"}§r`)

  let drainCount = 0
  while (exhaustion >= THRESHOLD) {
    exhaustion -= THRESHOLD
    drainOnePoint(player)
    drainCount++
  }

  if (drainCount > 0) {
    if (CONFIG.debug) console.log(`§6[HUNGER]§r §b${player.name}§r drained §c${drainCount}§r point, remaining exhaustion §c${exhaustion.toFixed(2)}§r`)
  } else {
    const remainingToDrain = THRESHOLD - exhaustion
    if (CONFIG.debug) console.log(`§6[HUNGER]§r §b${player.name}§r no drain yet. need §c${remainingToDrain.toFixed(2)}§r more exhaustion before next hunger point`)
  }

  exhaustionCache.set(player.id, exhaustion)
  persist(player, exhaustion)
}

export const clearExhaustionCache = (playerId: string): boolean => exhaustionCache.delete(playerId)
