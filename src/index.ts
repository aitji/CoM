import { Block, GameMode, ItemComponentTypes, system, world } from "@minecraft/server"
import { hunger_track_stop } from "./addon/hunger"
import { CONFIG } from "./core/config"
import * as lib from "./lib"
import * as cache from "./core/cache"
import * as chain from "./addon/chain"
const { requireSneak } = { ...CONFIG } as const

world.afterEvents.playerGameModeChange.subscribe((data) => cache.player_gamemode_update(data))
world.afterEvents.playerLeave.subscribe((data) => { cache.player_track_stop(data); hunger_track_stop(data.playerId) })
world.afterEvents.playerSpawn.subscribe((data) => cache.player_track_start(data))
world.afterEvents.gameRuleChange.subscribe((data) => cache.gamerule_update(data))
world.afterEvents.playerBreakBlock.subscribe((event) => {
    const { player, block, brokenBlockPermutation } = event
    if (requireSneak && !player.isSneaking) return

    const tool = lib.getEquS(player)!
    const brokenId = brokenBlockPermutation.type.id
    const dropPos = block.center()

    chain.handleOre(block, brokenId, tool, player, dropPos)
        || chain.handleTree(block, brokenId, tool, player, dropPos)
        || chain.handleCrop(block, brokenId, brokenBlockPermutation, tool, player, dropPos)
        || chain.handleLeaves(block, brokenId, tool, player, dropPos)
})