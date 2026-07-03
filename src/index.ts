import { GameMode, ItemComponentTypes, system, world } from "@minecraft/server"
import {
  CONFIG, CROP_DATA,
  LEAF_TYPES, LOG_SUFFIXES,
  ORE_DATA, PICKAXE_TIERS,
} from "./core/config"
import {
  bfsCollect,
  getMainhand,
  cropHarvestJob, leafClearJob,
  oreVeinJob, stripNs,
  stripOreId, treeJob,
} from "./addon/mining"
import {
  clearExhaustionCache
} from "./addon/hunger"
import * as lib from "./lib"

// routers
world.afterEvents.playerLeave.subscribe(({ playerId }) => clearExhaustionCache(playerId))
world.afterEvents.playerBreakBlock.subscribe((event) => {
  const { player, block, brokenBlockPermutation } = event

  if (CONFIG.requireSneak && !player.isSneaking) return

  const tool = getMainhand(player)
  const brokenId = brokenBlockPermutation.type.id
  const dropPos = block.center()

  // ore
  const oreKey = stripOreId(brokenId)
  const ore = ORE_DATA.get(oreKey)
  if (ore) {
    if(player.getGameMode() !== GameMode.Creative){
      const toolTier = tool ? (PICKAXE_TIERS.get(tool.typeId) ?? 0) : 0
      if (toolTier < ore.tier) return
    }

    const matchIds = new Set([
      `minecraft:${oreKey}`, `minecraft:deepslate_${oreKey}`,
      `minecraft:lit_${oreKey}`, `minecraft:lit_deepslate_${oreKey}`
    ])

    const vein = bfsCollect(block, (b) => matchIds.has(b.typeId), CONFIG.maxOreVein, false)
    if (vein.length === 0) return

    system.runJob(oreVeinJob(
      vein, ore,
      ore.drop, player,
      dropPos, lib.buildOpt(
        CONFIG.durability.oreVein,
        CONFIG.hunger.oreVein
      )
    ))
    return
  }

  // tree
  const logId = stripNs(brokenId)
  if (LOG_SUFFIXES.has(logId) && tool?.typeId.endsWith("_axe")) {
    const logs = bfsCollect(block, (b) => b.typeId === brokenId, CONFIG.maxTreeLogs, true)
    if (logs.length === 0) return

    system.runJob(treeJob(
      logs, player,
      dropPos, lib.buildOpt(
        CONFIG.durability.treeFell,
        CONFIG.hunger.treeFell
      )
    ))

    if (CONFIG.leafClear.autoClearOnTreeFell) {
      const leafId = `minecraft:${lib.qLogId(logId)}_leaves`
      if (LEAF_TYPES.has(stripNs(leafId))) {
        const combined = bfsCollect(
          block, (b) => b.typeId === brokenId || b.typeId === leafId,
          CONFIG.maxTreeLogs + CONFIG.maxLeaves, true,
        )

        const leaves = combined.filter((b) => b.typeId === leafId)
        if (leaves.length > 0) {
          system.runJob(leafClearJob(
            leaves, player,
            false, dropPos,
            lib.buildOpt(
              CONFIG.durability.leafClear,
              CONFIG.hunger.leafClear
            )
          ))
        }
      }
    }

    return
  }

  // crop
  const cropKey = stripNs(brokenId)
  const crop = CROP_DATA.get(cropKey)
  if (crop && tool?.typeId.endsWith("_hoe")) {
    if (crop.maturity !== "none") {
      const stage = brokenBlockPermutation.getState(crop.maturity)
      if (typeof stage !== "number" || crop.maturityStage === undefined || stage < crop.maturityStage) return
    }

    const cropBlocks = bfsCollect(
      block,
      (b) => {
        if (b.typeId !== brokenId) return false
        if (crop.maturity === "none") return true
        const stage = b.permutation.getState(crop.maturity)
        return typeof stage === "number" && crop.maturityStage !== undefined && stage >= crop.maturityStage
      },
      CONFIG.maxCropChain,
      false,
    )

    if (
      CONFIG.rePlant &&
      crop.canReplace &&
      crop.seedItem
    ) lib.plantBrokCrop(block, brokenBlockPermutation, crop, player)
    if (cropBlocks.length > 0) system.runJob(cropHarvestJob(
      cropBlocks, crop,
      player, dropPos,
      lib.buildOpt(
        CONFIG.durability.mode === "vanilla" && Boolean(crop.costsDurability),
        true
      ),
      CONFIG.rePlant, CONFIG.rePlantMode
    ))

    return
  }

  // leaves
  const leafSuffix = stripNs(brokenId)
  if (LEAF_TYPES.has(leafSuffix) && (tool?.typeId === "minecraft:shears" || tool?.typeId.endsWith("_hoe"))) {
    const shearType = tool?.typeId === "minecraft:shears" ||
      tool.getComponent(ItemComponentTypes.Enchantable)?.hasEnchantment("silk_touch") ||
      false

    const leaves = bfsCollect(block, (b) => b.typeId === brokenId, CONFIG.maxLeaves, true)
    if (leaves && leaves.length === 0) return

    system.runJob(leafClearJob(
      leaves, player,
      shearType, dropPos,
      lib.buildOpt(
        CONFIG.durability.leafClear,
        CONFIG.hunger.leafClear
      )
    ))
  }
})