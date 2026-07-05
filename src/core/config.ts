import { world } from "@minecraft/server"

export type ReplantMode = "free" | "paid"
export type DurabilityMode = "none" | "vanilla" | "always"
export type CropDurabilityMode = DurabilityMode
export type SearchMode = "classic" | "around" | "aggressive"

export type HungerMode = "none" | "vanilla" | "exhaustion"

export interface Config {
  debug: boolean
  rePlant: boolean
  rePlantMode: ReplantMode
  requireSneak: boolean
  maxOreVein: number
  maxTreeLogs: number
  maxLeaves: number
  maxCropChain: number
  performance: { blocksPerTick: number }
  search: { mode: SearchMode }
  durability: {
    mode: DurabilityMode
    cropMode: CropDurabilityMode
    oreVein: boolean
    treeFell: boolean
    leafClear: boolean
  }
  leafClear: { autoClearOnTreeFell: boolean }
  hunger: {
    mode: HungerMode
    exhaustionPerBlock: number
    oreVein: boolean
    treeFell: boolean
    leafClear: boolean
  }
}

type PackSettingValue = boolean | number | string
const packSettings = buildPackSettings()

function buildPackSettings(): Record<string, PackSettingValue> {
  try {
    const settings = world.getPackSettings()
    if (settings && typeof settings === "object")
      return settings as Record<string, PackSettingValue>
  } catch { }
  return {}
}

function getBool(name: string, fallback: boolean): boolean {
  const raw = packSettings[name]
  return typeof raw === "boolean" ? raw : fallback
}

function getStr(name: string, fallback: string): string {
  const raw = packSettings[name]
  return typeof raw === "string" ? raw : fallback
}

function getInt(name: string, fallback: number): number {
  const raw = packSettings[name]
  if (typeof raw === "number") return raw
  if (typeof raw === "string") return Number(raw) ?? fallback

  return fallback
}

function buildConfig(): Readonly<Config> {
  const durabilityMode = getStr("com:durability", "vanilla") as DurabilityMode
  const cropDurabilityMode = getStr(
    "com:durability_crop",
    durabilityMode === "always" ? "always" : "vanilla"
  ) as CropDurabilityMode
  const rePlantMode = getStr("com:replant", "paid") as ReplantMode
  const searchMode = getStr("com:block_search", "around") as SearchMode

  return Object.freeze({
    rePlant: getBool("com:replant_enabled", true),
    rePlantMode,
    requireSneak: getBool("com:require_sneak", true),
    debug: getBool("com:debug", false),
    maxOreVein: getInt("com:ore_limit", 32),
    maxTreeLogs: getInt("com:tree_limit", 256),
    maxLeaves: getInt("com:leaf_limit", 128),
    maxCropChain: getInt("com:crop_limit", 64),
    performance: Object.freeze({
      blocksPerTick: getInt("com:performance", 8)
    }),
    search: Object.freeze({
      mode: searchMode
    }),
    durability: Object.freeze({
      mode: durabilityMode,
      cropMode: cropDurabilityMode,
      oreVein: durabilityMode !== "none",
      treeFell: durabilityMode !== "none",
      leafClear: durabilityMode !== "none",
    }),
    leafClear: Object.freeze({
      autoClearOnTreeFell: getBool("com:auto_leaf_clear", false)
    }),
    hunger: Object.freeze({
      mode: getStr("com:hunger_mode", "exhaustion") as HungerMode,
      exhaustionPerBlock: (() => {
        const mode = getStr("com:hunger_mode", "exhaustion") as HungerMode
        return mode === "vanilla" ? 0.005 : mode === "exhaustion" ? 0.1 : 0
      })(),
      oreVein: true,
      treeFell: true,
      leafClear: true,
    })
  }) as Readonly<Config>
}
export const CONFIG: Readonly<Config> = buildConfig()

// tool tier
export const PICKAXE_TIERS: ReadonlyMap<string, number> = new Map([
  ["minecraft:wooden_pickaxe", 1],
  ["minecraft:golden_pickaxe", 1],

  ["minecraft:stone_pickaxe", 2],
  ["minecraft:copper_pickaxe", 2],

  ["minecraft:iron_pickaxe", 3],

  ["minecraft:diamond_pickaxe", 4],
  ["minecraft:netherite_pickaxe", 4],
])

// ore-data
export type FortuneMode = "multiply" | "cap" | "none"
export interface OreEntry {
  drop: string // name space (of drop)
  tier: number // minimum pickaxe tier
  base: [number, number] // base drop
  fortune: FortuneMode // none|cap|multiply
  fortuneCap?: number // hard cap (*cap-mode)
  silkTouch: boolean // xp on break (omit=no-xp)
  xp?: [number, number]
}

export const ORE_DATA: ReadonlyMap<string, OreEntry> = new Map([
  // overworld
  ["coal_ore", { drop: "minecraft:coal", tier: 1, base: [1, 1], fortune: "multiply", silkTouch: true, xp: [0, 2] }],
  ["copper_ore", { drop: "minecraft:raw_copper", tier: 2, base: [2, 5], fortune: "multiply", silkTouch: true }],
  ["iron_ore", { drop: "minecraft:raw_iron", tier: 2, base: [1, 1], fortune: "multiply", silkTouch: true }],
  ["gold_ore", { drop: "minecraft:raw_gold", tier: 3, base: [1, 1], fortune: "multiply", silkTouch: true }],
  ["redstone_ore", { drop: "minecraft:redstone", tier: 3, base: [4, 5], fortune: "multiply", silkTouch: true, xp: [1, 5] }],
  ["lapis_ore", { drop: "minecraft:lapis_lazuli", tier: 2, base: [4, 9], fortune: "cap", silkTouch: true, xp: [2, 5] }],
  ["diamond_ore", { drop: "minecraft:diamond", tier: 3, base: [1, 1], fortune: "multiply", silkTouch: true, xp: [3, 7] }],
  ["emerald_ore", { drop: "minecraft:emerald", tier: 3, base: [1, 1], fortune: "multiply", silkTouch: true, xp: [3, 7] }],
  ["obsidian", { drop: "minecraft:obsidian", tier: 4, base: [1, 1], fortune: "none", silkTouch: false }],

  // nether
  ["glowstone", { drop: "minecraft:glowstone_dust", tier: 0, base: [2, 4], fortune: "cap", silkTouch: true }],
  ["nether_gold_ore", { drop: "minecraft:gold_nugget", tier: 1, base: [2, 6], fortune: "multiply", silkTouch: true, xp: [0, 1] }],
  ["quartz_ore", { drop: "minecraft:quartz", tier: 1, base: [1, 1], fortune: "multiply", silkTouch: true, xp: [2, 5] }],
  ["ancient_debris", { drop: "minecraft:ancient_debris", tier: 4, base: [1, 1], fortune: "none", silkTouch: false }],

  // the end update when?
])

// log&leaf
export const LEAF_TYPES: ReadonlySet<string> = new Set([
  "oak_leaves", "spruce_leaves", "birch_leaves", "jungle_leaves",
  "acacia_leaves", "dark_oak_leaves", "mangrove_leaves", "cherry_leaves",
  "azalea_leaves", "flowering_azalea_leaves", "pale_oak_leaves",

  "crimson_stem", "warped_stem", "crimson_hyphae", "warped_hyphae",
  "stripped_crimson_stem", "stripped_warped_stem", "stripped_crimson_hyphae", "stripped_warped_hyphae",
  "nether_wart_block", "warped_wart_block"
])

/** All log/wood block suffixes (stripped variants included) */
export const LOG_SUFFIXES: ReadonlySet<string> = new Set([
  // log
  "oak_log", "spruce_log", "birch_log", "jungle_log", "acacia_log",
  "dark_oak_log", "mangrove_log", "cherry_log", "pale_oak_log",
  "crimson_stem", "warped_stem",

  // wood
  "oak_wood", "spruce_wood", "birch_wood", "jungle_wood", "acacia_wood",
  "dark_oak_wood", "mangrove_wood", "cherry_wood", "pale_oak_wood",
  "crimson_hyphae", "warped_hyphae",

  // stripped logs
  "stripped_oak_log", "stripped_spruce_log", "stripped_birch_log",
  "stripped_jungle_log", "stripped_acacia_log", "stripped_dark_oak_log",
  "stripped_mangrove_log", "stripped_cherry_log", "stripped_pale_oak_log",
  "stripped_crimson_stem", "stripped_warped_stem",

  // Stripped woods
  "stripped_oak_wood", "stripped_spruce_wood", "stripped_birch_wood",
  "stripped_jungle_wood", "stripped_acacia_wood", "stripped_dark_oak_wood",
  "stripped_mangrove_wood", "stripped_cherry_wood", "stripped_pale_oak_wood",
  "stripped_crimson_hyphae", "stripped_warped_hyphae"
])

// crop data
export type CropMaturity = "growth" | "age" | "none"
export interface DropEntry {
  min: number
  max: number
  fortuneCap?: number
  chance?: [number, number]
}

export interface CropEntry {
  fortune: boolean
  silkTouch: boolean
  canReplace: boolean
  maturity: CropMaturity
  maturityStage?: number
  seedItem?: string
  leaveBottom?: true
  leaveTop?: true
  costsDurability?: true
  drops?: Record<string, DropEntry>
}

export const CROP_DATA: ReadonlyMap<string, CropEntry> = new Map<string, CropEntry>([
  ["wheat", { fortune: true, silkTouch: false, canReplace: true, maturity: "growth", maturityStage: 7, seedItem: "minecraft:wheat_seeds", drops: { wheat: { min: 1, max: 1 }, wheat_seeds: { min: 1, max: 4 } } }],
  ["beetroot", { fortune: true, silkTouch: false, canReplace: true, maturity: "growth", maturityStage: 7, seedItem: "minecraft:beetroot_seeds", drops: { beetroot: { min: 1, max: 1 }, beetroot_seeds: { min: 1, max: 4 } } }],
  ["carrots", { fortune: true, silkTouch: false, canReplace: true, maturity: "growth", maturityStage: 7, seedItem: "minecraft:carrot", drops: { carrot: { min: 2, max: 5 } } }],
  ["potatoes", { fortune: true, silkTouch: false, canReplace: true, maturity: "growth", maturityStage: 7, seedItem: "minecraft:potato", drops: { potato: { min: 2, max: 5 }, poisonous_potato: { min: 0, max: 0, chance: [2, 100] } } }],
  ["melon_block", { fortune: true, silkTouch: true, canReplace: false, maturity: "none", costsDurability: true, drops: { melon_slice: { min: 3, max: 7, fortuneCap: 9 } } }],
  ["pumpkin", { fortune: false, silkTouch: true, canReplace: false, maturity: "none", costsDurability: true, drops: { pumpkin: { min: 1, max: 1 } } }],
  ["bamboo", { fortune: false, silkTouch: false, canReplace: false, maturity: "none", costsDurability: true, leaveBottom: true, drops: { bamboo: { min: 1, max: 1 } } }],
  ["cocoa", { fortune: false, silkTouch: false, canReplace: true, maturity: "age", maturityStage: 2, seedItem: "minecraft:cocoa_beans", costsDurability: true, drops: { cocoa_beans: { min: 3, max: 3 } } }],
  ["reeds", { fortune: false, silkTouch: false, canReplace: false, maturity: "none", leaveBottom: true, drops: { sugar_cane: { min: 1, max: 1 } } }],
  ["cactus", { fortune: false, silkTouch: false, canReplace: false, maturity: "none", costsDurability: true, leaveBottom: true, drops: { cactus: { min: 1, max: 1 } } }],
  ["nether_wart", { fortune: true, silkTouch: false, canReplace: true, maturity: "age", maturityStage: 3, seedItem: "minecraft:nether_wart", drops: { nether_wart: { min: 2, max: 4, fortuneCap: 7 } } }],

  ["mangrove_roots", { fortune: false, silkTouch: false, canReplace: false, maturity: "none", maturityStage: 3, seedItem: "minecraft:mangrove_roots", drops: { mangrove_roots: { min: 1, max: 1 } } }],
  ["nether_wart_block", { fortune: false, silkTouch: false, canReplace: false, maturity: "none", seedItem: "minecraft:nether_wart_block", drops: { nether_wart_block: { min: 1, max: 1 } } }],
  ["warped_wart_block", { fortune: false, silkTouch: false, canReplace: false, maturity: "none", seedItem: "minecraft:warped_wart_block", drops: { warped_wart_block: { min: 1, max: 1 } } }],
  ["shroomlight", { fortune: false, silkTouch: false, canReplace: false, maturity: "none", seedItem: "minecraft:shroomlight", drops: { shroomlight: { min: 1, max: 1 } } }],

  ["red_mushroom_block", { fortune: true, silkTouch: true, canReplace: false, maturity: "none", seedItem: "minecraft:red_mushroom_block", drops: { red_mushroom: { min: 0, max: 2 } } }],
  ["brown_mushroom_block", { fortune: true, silkTouch: true, canReplace: false, maturity: "none", seedItem: "minecraft:brown_mushroom_block", drops: { brown_mushroom: { min: 0, max: 2 } } }],
  ["mushroom_stem", { fortune: false, silkTouch: true, canReplace: false, maturity: "none", seedItem: "minecraft:mushroom_stem" }],
  // plan not yet implemented:
  // ["pointed_dripstone", { fortune: false, silkTouch: false, canReplace: false, maturity: "none", leaveTop: true, drops: { pointed_dripstone: { min: 1, max: 1 } } }],
  // ["sulfur_spike", { fortune: false, silkTouch: false, canReplace: false, maturity: "none", leaveTop: true, drops: { sulfur_spike: { min: 1, max: 1 } } }],
])