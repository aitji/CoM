import { Block, ItemStack, Player, ItemComponentTypes, EntityComponentTypes, EquipmentSlot, GameMode, ItemEnchantableComponent, Entity, EntityComponentTypeMap } from "@minecraft/server"
import { CONFIG } from "./core/config"
import { consumeSeed, JobOptions as mineJob } from "./addon/mining"
import * as cache from "./core/cache"

// freeze-er
const god = Object.freeze(new Set([GameMode.Creative, GameMode.Spectator]))
const PREFIX = Object.freeze({
    log: "§6[INFO]§r",
    debug: "§e[DEBUG]§r",
    error: "§c[ERROR]§r"
} as const)
const OUTPUT = Object.freeze({
    log: console.log,
    debug: console.log,
    error: console.error
} as const)

// misc helper
export const randInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min
export const posKey = (b: Block | { x: number; y: number; z: number }): string => `${b.x},${b.y},${b.z}`
export const stripNs = (typeId: string): string => typeId.replace("minecraft:", "")
export const stripOreId = (typeId: string): string => stripNs(typeId).replace(/^lit_/, "").replace(/^deepslate_/, "")
export const log = (
    tag: string,
    str: string,
    type: "log" | "debug" | "error" = "log"
): void => {
    if (!CONFIG.debug && type !== "error") return
    OUTPUT[type](`${PREFIX[type]} [${tag}] ${str}`)
}

// player&entity helper
type ComponentName = keyof EntityComponentTypeMap
export const getAtt = <T extends ComponentName>(player: Player | Entity, comp: T):
    EntityComponentTypeMap[T] | undefined =>
    player.getComponent(`minecraft:${comp}` as EntityComponentTypes) as EntityComponentTypeMap[T] | undefined

// item helper
export const reduceStack = (item: ItemStack, amount = 1): ItemStack => {
    if (amount <= 0 || item.amount <= amount) return amount <= 0 ? item : new ItemStack("minecraft:air", 1)
    const clone = item.clone()
    clone.amount -= amount
    return clone
}

// enchant helper
export interface Enchants { fortune: number; silkTouch: boolean; unbreaking: number }
export const getEnchant = (item: ItemStack): ItemEnchantableComponent | undefined =>
    item?.getComponent(ItemComponentTypes.Enchantable) ?? undefined
export const getFUS = (tool?: ItemStack): Enchants => {
    const enc = tool ? getEnchant(tool) : undefined
    return {
        fortune: enc?.getEnchantment("fortune")?.level ?? 0,
        unbreaking: enc?.getEnchantment("unbreaking")?.level ?? 0,
        silkTouch: enc?.hasEnchantment("silk_touch") ?? false,
    }
}

// equ helper
export const getEqu = (player: Player) => getAtt(player, "equippable")
export const getEquS = (player: Player, slots: EquipmentSlot = EquipmentSlot.Mainhand) => getEqu(player)?.getEquipment(slots) ?? undefined

// options thing-y
export const buildOpt = (costsDurability: boolean, costsHunger: boolean): mineJob => {
    return {
        costsDurability,
        costsHunger: costsHunger && CONFIG.hunger.mode !== "none",
        exhaustionPerBlock: CONFIG.hunger.exhaustionPerBlock,
        blocksPerTick: Math.max(1, CONFIG.performance.blocksPerTick),
    }
}

// crop helper
export const qLogId = (logId: string): string => logId.replace(/^stripped_/, "").replace(/_(log|wood)$/, "")
export const plantBrokCrop = (block: any, brokenBlockPermutation: any, crop: any, player: any): boolean => {
    if (
        !CONFIG.rePlant ||
        !crop.canReplace ||
        !crop.seedItem || (
            CONFIG.rePlantMode === "paid" &&
            !consumeSeed(player, block.dimension, block.center(), crop.seedItem)
        )
    ) return false

    try { block.setPermutation(brokenBlockPermutation.withState(crop.maturity, 0)) }
    catch { return false }

    return true
}

// cache helper
export const isGod = (player: Player): boolean => god.has(cache.getPlayer(player, "gameMode") as GameMode)
export const qName = (player: Player): string => cache.getPlayer(player, "name") as string
