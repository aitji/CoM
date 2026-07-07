// confusing math stuff
import { OreEntry, FortuneMode } from "../core/config"

// random
export const randInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min
export const rollFortune = (fortune: number): number => fortune <= 0 ? 1 : Math.max(1, Math.floor(Math.random() * (fortune + 2)) - 1)
export const rollCapFortune = (base: [number, number], fortune: number, cap?: number): number => {
    const [min, max] = base
    const effectiveMax = cap !== undefined ? Math.min(max + fortune, cap) : max + fortune
    return randInt(min, effectiveMax)
}

export function computeOreDrop(ore: OreEntry, fortune: number): number {
    const [min, max] = ore.base
    switch (ore.fortune as FortuneMode) {
        case "multiply": return randInt(min, max) * (fortune <= 0 ? 1 : rollFortune(fortune))
        case "cap": return rollCapFortune(ore.base, fortune, ore.fortuneCap)

        case "none":
        default: return randInt(min, max)
    }
}

export function rollCropFortune(min: number, max: number, fortune: number, cap?: number): number {
    if (fortune <= 0) return randInt(min, max)
    const bonus = Math.max(0, Math.floor(Math.random() * (fortune + 2)) - 1)
    return Math.min(Math.max(min, max + bonus), cap ?? Infinity)
}

export const rollXP = (xp: [number, number]): number => randInt(xp[0], xp[1])
export const durabilityCheck = (unbreakingLevel: number): boolean => unbreakingLevel === 0 || Math.random() < 1 / (unbreakingLevel + 1)