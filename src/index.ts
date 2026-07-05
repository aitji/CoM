import { Block, GameMode, ItemComponentTypes, system, world } from "@minecraft/server"
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
import * as cache from "./core/cache"

// routers
world.afterEvents.playerGameModeChange.subscribe((data) => cache.player_gamemode_update(data))
world.afterEvents.playerLeave.subscribe((data) => {
  cache.player_track_stop(data)
  clearExhaustionCache(data.playerId)
})
world.afterEvents.playerSpawn.subscribe((data) => cache.player_track_start(data))
world.afterEvents.gameRuleChange.subscribe((data) => cache.gamerule_update(data))

// routes mining
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
    if (player.getGameMode() !== GameMode.Creative) {
      const toolTier = tool ? (PICKAXE_TIERS.get(tool.typeId) ?? 0) : 0
      if (toolTier < ore.tier) return
    }

    const matchIds = new Set([
      `minecraft:${oreKey}`, `minecraft:deepslate_${oreKey}`,
      `minecraft:lit_${oreKey}`, `minecraft:lit_deepslate_${oreKey}`
    ])

    const vein = bfsCollect(block, (b) => matchIds.has(b.typeId), CONFIG.maxOreVein, CONFIG.search.mode)
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
  if (LOG_SUFFIXES.has(logId) && tool?.hasTag("is_axe")) {
    const logs = bfsCollect(block, (b) => b.typeId === brokenId, CONFIG.maxTreeLogs, CONFIG.search.mode)
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
          CONFIG.maxTreeLogs + CONFIG.maxLeaves, CONFIG.search.mode,
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
  if (crop && (
    tool?.hasTag('is_hoe') ||
    tool?.hasTag('is_sword') ||
    tool?.hasTag('is_axe')
  )) {
    if (crop.maturity !== "none") {
      const stage = brokenBlockPermutation.getState(crop.maturity)
      if (typeof stage !== "number" || crop.maturityStage === undefined || stage < crop.maturityStage) return
    }

    const isHarvestableCrop = (b: Block): boolean => {
      const currentCrop = CROP_DATA.get(stripNs(b.typeId))
      if (!currentCrop) return false
      if (currentCrop.maturity === "none") return true
      const stage = b.permutation.getState(currentCrop.maturity)
      return typeof stage === "number" && currentCrop.maturityStage !== undefined && stage >= currentCrop.maturityStage
    }

    const cropBlocks = bfsCollect(
      block,
      isHarvestableCrop,
      CONFIG.maxCropChain,
      CONFIG.search.mode,
      (b) => isHarvestableCrop(b) || b.typeId.endsWith("_stem"),
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
        CONFIG.durability.cropMode === "always" || (CONFIG.durability.cropMode === "vanilla" && Boolean(crop.costsDurability)),
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

    const leaves = bfsCollect(block, (b) => b.typeId === brokenId, CONFIG.maxLeaves, CONFIG.search.mode)
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