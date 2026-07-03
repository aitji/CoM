import { CONFIG } from "./core/config"
import { consumeSeed, JobOptions } from "./addon/mining"

// index helpers
export const buildOpt = (costsDurability: boolean, costsHunger: boolean): JobOptions => {
    return {
        costsDurability,
        costsHunger: CONFIG.hunger.enabled && costsHunger,
        exhaustionPerBlock: CONFIG.hunger.exhaustionPerBlock,
        blocksPerTick: Math.max(1, CONFIG.performance.blocksPerTick),
    }
}

export const qLogId = (logId: string): string => logId.replace(/^stripped_/, "").replace(/_(log|wood)$/, "")
export const plantBrokCrop = (block: any, brokenBlockPermutation: any, crop: any, player: any): boolean => {
    if (
        !CONFIG.rePlant ||
        !crop.canReplace ||
        !crop.seedItem || (
            CONFIG.rePlantMode === "paid" &&
            !consumeSeed(
                player,
                block.dimension,
                block.center(),
                crop.seedItem
            )
        )
    ) return false

    try { block.setPermutation(brokenBlockPermutation.withState(crop.maturity, 0)) }
    catch { return false }

    return true
}