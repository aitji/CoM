import { OreEntry, FortuneMode } from "../core/config"

// helpers
export const randInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;
export const rollFortune = (fortune: number): number => {
  if (fortune <= 0) return 1
  const roll = Math.floor(Math.random() * (fortune + 2))
  return roll <= 1 ? 1 : roll
}

export const rollCapFortune = (
  base: [number, number],
  fortune: number,
  cap?: number,
): number => {
  const [min, max] = base
  const effectiveMax = cap !== undefined
    ? Math.min(max + fortune, cap)
    : max + fortune
  return randInt(min, effectiveMax)
}

// ore
export function computeOreDrop(ore: OreEntry, fortune: number): number {
  const [min, max] = ore.base;
  switch (ore.fortune as FortuneMode) {
    case "multiply": return randInt(min, max) * rollFortune(fortune)
    case "cap": return rollCapFortune(ore.base, fortune, ore.fortuneCap)

    case "none":
    default: return randInt(min, max)
  }
}

// crop
export function rollCropFortune(
  min: number,
  max: number,
  fortune: number,
  cap?: number,
): number {
  if (fortune <= 0) return randInt(min, max);
  const bonus = Math.max(0, Math.floor(Math.random() * (fortune + 2)) - 1);
  const result = Math.min(max + bonus, cap ?? Infinity);
  return Math.max(min, result);
}

// xp (warper)
export const rollXP = (xp: [number, number]): number => randInt(xp[0], xp[1])
// durability
export function durabilityCheck(unbreakingLevel: number): boolean {
  if (unbreakingLevel === 0) return true
  return Math.random() < 1 / (unbreakingLevel + 1)
}