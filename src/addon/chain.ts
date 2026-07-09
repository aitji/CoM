import { Block, Player, system, Vector3 } from "@minecraft/server"
import { CONFIG, CROP_DATA, LEAF_TYPES, LOG_SUFFIXES, ORE_DATA, PICKAXE_TIERS } from "../core/config"
import { bfsCollect, cropHarvestJob, leafClearJob, oreVeinJob, treeJob } from "../addon/mining"
import * as lib from "../lib"
// ore, tree, crop & leaves (in order)

export const handleOre = (block: Block, brokenId: string, tool: any, player: Player, dropPos: Vector3) => {
    const oreKey = lib.stripOreId(brokenId)
    const ore = ORE_DATA.get(oreKey)
    if (!ore) return false

    if (!lib.isGod(player)) {
        const toolTier = tool ? (PICKAXE_TIERS.get(tool.typeId) ?? 0) : 0
        if (toolTier < ore.tier) return false
    }

    const matchIds = Object.freeze(new Set([
        `minecraft:${oreKey}`, `minecraft:deepslate_${oreKey}`,
        `minecraft:lit_${oreKey}`, `minecraft:lit_deepslate_${oreKey}`
    ]))

    const vein = bfsCollect(block, (b) => matchIds.has(b.typeId), CONFIG.maxOreVein, CONFIG.search.mode)
    if (vein.length === 0) return false

    system.runJob(oreVeinJob(vein, ore, ore.drop, player, dropPos, lib.buildOpt(CONFIG.durability.oreVein, CONFIG.hunger.oreVein)))
    return true
}

export const handleTree = (block: Block, brokenId: string, tool: any, player: any, dropPos: Vector3) => {
    const logId = lib.stripNs(brokenId)
    if (!LOG_SUFFIXES.has(logId) || !tool?.hasTag("is_axe")) return false

    const logs = bfsCollect(block, (b) => b.typeId === brokenId, CONFIG.maxTreeLogs, CONFIG.search.mode)
    if (logs.length === 0) return false

    system.runJob(treeJob(logs, player, dropPos, lib.buildOpt(CONFIG.durability.treeFell, CONFIG.hunger.treeFell)))

    if (CONFIG.leafClear.autoClearOnTreeFell) {
        const leafId = `minecraft:${lib.qLogId(logId)}_leaves`
        if (LEAF_TYPES.has(lib.stripNs(leafId))) {
            const combined = bfsCollect(block, (b) => b.typeId === brokenId || b.typeId === leafId, CONFIG.maxTreeLogs + CONFIG.maxLeaves, CONFIG.search.mode)
            const leaves = combined.filter((b) => b.typeId === leafId)
            if (leaves.length > 0) {
                system.runJob(leafClearJob(leaves, player, false, dropPos, lib.buildOpt(CONFIG.durability.leafClear, CONFIG.hunger.leafClear)))
            }
        }
    }
    return true
}

export const handleCrop = (block: Block, brokenId: string, brokenBlockPermutation: any, tool: any, player: any, dropPos: Vector3) => {
    const cropKey = lib.stripNs(brokenId)
    const crop = CROP_DATA.get(cropKey)
    if (!crop || !(tool?.hasTag('is_hoe') || tool?.hasTag('is_sword') || tool?.hasTag('is_axe'))) return false
    const { maturity, maturityStage, canReplace, seedItem, costsDurability } = crop

    if (maturity !== "none") {
        const stage = brokenBlockPermutation.getState(maturity)
        if (typeof stage !== "number" || maturityStage === undefined || stage < maturityStage) return false
    }

    const isReady = (b: Block): boolean => {
        const c = CROP_DATA.get(lib.stripNs(b.typeId))
        if (!c) return false
        if (c.maturity === "none") return true
        const { maturityStage: cStage } = c
        const stage = b.permutation.getState(c.maturity)

        return typeof stage === "number" &&
            cStage !== undefined &&
            stage >= cStage
    }

    const cropBlocks = bfsCollect(
        block, isReady,
        CONFIG.maxCropChain, CONFIG.search.mode,
        (b) => isReady(b)
            || lib.stripNs(b.typeId) === cropKey
            || b.typeId.endsWith("_stem")
    )

    if (CONFIG.rePlant && canReplace && seedItem) lib.plantBrokCrop(
        block, brokenBlockPermutation,
        crop, player
    )

    if (cropBlocks.length > 0) system.runJob(cropHarvestJob(
        cropBlocks, crop,
        player, dropPos,
        lib.buildOpt(
            CONFIG.durability.cropMode === "always" ||
            (CONFIG.durability.cropMode === "vanilla" && Boolean(costsDurability)),
            true
        ),
        CONFIG.rePlant, CONFIG.rePlantMode)
    )

    return true
}

export const handleLeaves = (block: Block, brokenId: string, tool: any, player: any, dropPos: Vector3) => {
    const leafSuffix = lib.stripNs(brokenId)
    if (!LEAF_TYPES.has(leafSuffix) || !(tool?.typeId === "minecraft:shears" || tool?.typeId.endsWith("_hoe"))) return false

    const shearType = tool?.typeId === "minecraft:shears" || lib.getEnchant(tool)?.hasEnchantment("silk_touch") || false
    const leaves = bfsCollect(block, (b) => b.typeId === brokenId, CONFIG.maxLeaves, CONFIG.search.mode)
    if (leaves.length === 0) return false

    system.runJob(leafClearJob(leaves, player, shearType, dropPos, lib.buildOpt(CONFIG.durability.leafClear, CONFIG.hunger.leafClear)))
    return true
}