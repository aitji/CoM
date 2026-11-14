import { Player } from "@minecraft/server"
import * as lib from "../lib"

const exhCache = new Map<string, number>()
const configs = Object.freeze({
    key: 'com:exhaustion' as const,
    threshold: 4 as const
} as const)

function loadDyp(player: Player): number {
    const cache = exhCache.get(player.id)
    if (cache !== undefined) return cache

    let stored = 0
    try {
        const raw = player.getDynamicProperty(configs.key)
        if (typeof raw === "number") stored = raw
    } catch { }

    exhCache.set(player.id, stored)
    return stored
}

function drain(player: Player): void {
    const saturation = lib.getAtt(player, "player.saturation")

    if (saturation && saturation.currentValue > saturation.effectiveMin) {
        try {
            const oldValue = saturation.currentValue
            const newValue = Math.max(saturation.effectiveMin, oldValue - 1)
            saturation.setCurrentValue(newValue)
            return
        } catch ($) { lib.log("HUNGER", `drain saturation: ${$}`, "error") }
    }

    const hunger = lib.getAtt(player, "player.hunger")!
    const { currentValue: val, effectiveMin: min } = hunger
    if (hunger && val > min) {
        try {
            const vNew = Math.max(min, val - 1)
            hunger.setCurrentValue(vNew)

            lib.log("HUNGER", `§b${lib.qName(player)}§r drained §phunger§r §f${val.toFixed(1)}->${vNew.toFixed(1)}`, "debug")
        } catch ($) { lib.log("HUNGER", `drain hunger: ${$}`, "error") }
    }
}

export function exhaust(player: Player, blockCount: number, exPb: number): void {
    if (blockCount <= 0 || exPb <= 0) return

    const oldExh = loadDyp(player)
    let exh = oldExh + blockCount * exPb

    let drainCount = 0
    while (exh >= configs.threshold) {
        exh -= configs.threshold
        drain(player)
        drainCount++
    }

    exhCache.set(player.id, exh)
    player.setDynamicProperty(configs.key, exh)
}

export const hunger_track_stop = (playerId: string):
    boolean | void => exhCache.delete(playerId)