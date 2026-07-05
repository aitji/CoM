import {
  Block, Dimension,
  Entity, EntityComponentTypes,
  EntityEquippableComponent,
  EquipmentSlot, GameMode,
  ItemComponentTypes, ItemStack,
  Player, Vector3
} from "@minecraft/server"
import { CropEntry, CROP_DATA, DropEntry, OreEntry, SearchMode } from "../core/config"
import { computeOreDrop, randInt, rollCropFortune, rollXP, durabilityCheck } from "./drops"
import { applyMiningExhaustion } from "./hunger"

const posKey = (b: Block): string => `${b.x},${b.y},${b.z}`
export interface JobOptions {
  costsDurability: boolean
  costsHunger: boolean
  exhaustionPerBlock: number
  blocksPerTick: number
}

// nbr offset
const DIRS_6: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 0], [0, -1, 0],
  [0, 0, -1], [0, 0, 1],
  [1, 0, 0], [-1, 0, 0]
]

const buildDirs = (radius: number): ReadonlyArray<readonly [number, number, number]> => {
  const dirs: [number, number, number][] = []
  for (let dx = -radius; dx <= radius; dx++)
    for (let dy = -radius; dy <= radius; dy++)
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue
        dirs.push([dx, dy, dz])
      }
  return dirs
}

const DIRS_26 = buildDirs(1)
const DIRS_AGGRESSIVE = buildDirs(2)

const getSearchDirs = (mode: SearchMode): ReadonlyArray<readonly [number, number, number]> => {
  switch (mode) {
    case "aggressive":
      return DIRS_AGGRESSIVE
    case "around":
      return DIRS_26
    default:
      return DIRS_6
  }
}

const getNbr = (block: Block, dirs: ReadonlyArray<readonly [number, number, number]>): Block[] => {
  const result: Block[] = []
  const dim = block.dimension
  const { x, y, z } = block
  for (const [dx, dy, dz] of dirs) {
    try {
      const nb = dim.getBlock({ x: x + dx, y: y + dy, z: z + dz })
      if (nb) result.push(nb)
    } catch { }
  }
  return result
}

export function bfsCollect(
  start: Block, predicate: (b: Block) => boolean,
  maxBlocks: number, searchMode: SearchMode = "around",
  traversePredicate?: (b: Block) => boolean,
): Block[] {
  const found: Block[] = []
  const visited = new Set<string>([posKey(start)])
  const queue: Block[] = [start]
  const dirs = getSearchDirs(searchMode)
  let head = 0
  const canTraverse = traversePredicate ?? predicate

  while (head < queue.length && found.length < maxBlocks) {
    const current = queue[head++]
    const neighbours = getNbr(current, dirs)

    for (const nb of neighbours) {
      const key = posKey(nb)
      if (visited.has(key)) continue
      visited.add(key)

      if (!canTraverse(nb)) continue
      if (predicate(nb)) {
        found.push(nb)
        if (found.length >= maxBlocks) break
      }
      queue.push(nb)
    }
  }

  return found
}

// id normalized
export const stripOreId = (typeId: string): string => typeId
  .replace("minecraft:", "")
  .replace(/^lit_/, "")
  .replace(/^deepslate_/, "")

export const stripNs = (typeId: string): string => typeId.replace("minecraft:", "")

// batching
class DropAccumulator {
  private counts = new Map<string, number>()

  add(id: string, amount: number): void {
    if (amount <= 0) return
    this.counts.set(id, (this.counts.get(id) ?? 0) + amount)
  }

  remove(id: string, amount = 1): boolean {
    if (amount <= 0) return true
    const current = this.counts.get(id) ?? 0
    if (current < amount) return false
    const next = current - amount
    if (next > 0) this.counts.set(id, next)
    else this.counts.delete(id)
    return true
  }

  flush(dim: Dimension, pos: Vector3): void {
    for (const [id, total] of this.counts) {
      let remaining = total
      while (remaining > 0) {
        const stackSize = Math.min(remaining, 64)
        try { dim.spawnItem(new ItemStack(id, stackSize), pos) }
        catch { }

        remaining -= stackSize
      }
    }
    this.counts.clear()
  }
}

function getCropDropCount(drop: DropEntry, fortune: number, fortuneEnabled: boolean): number {
  if (drop.chance) return Math.random() < drop.chance[0] / drop.chance[1] ? 1 : 0
  if (!fortuneEnabled) return randInt(drop.min, drop.max)

  return rollCropFortune(drop.min, drop.max, fortune, drop.fortuneCap)
}

function reduceStack(item: ItemStack, amount = 1): ItemStack {
  if (amount <= 0) return item
  if (item.amount <= amount) return new ItemStack("minecraft:air", 1)

  const clone = item.clone()
  clone.amount -= amount
  return clone
}

export function consumeSeed(player: Player, dimension: Dimension, location: Vector3, seedId: string): boolean {
  const inventory = player.getComponent(EntityComponentTypes.Inventory)?.container
  if (inventory) {
    const slot = inventory.find(new ItemStack(seedId, 1))
    if (slot !== undefined) {
      const currItem = inventory.getItem(slot)
      if (currItem) {
        inventory.setItem(slot, reduceStack(currItem))
        return true
      }
    }
  }

  const itemEntities = dimension.getEntities({ type: "minecraft:item", maxDistance: 2, location })
  for (const entity of itemEntities) {
    const itemComp = entity.getComponent(EntityComponentTypes.Item)
    const itemStack = itemComp?.itemStack
    if (!itemStack || !entity.isValid) continue
    if (itemStack.typeId !== seedId) continue

    const newItem = reduceStack(itemStack)
    if (newItem.typeId !== "minecraft:air") {
      try {
        const spawned = dimension.spawnItem(newItem, location)
        if (spawned) spawned.applyImpulse(entity.getVelocity())
      } catch { }
    }

    try { entity.remove() }
    catch {
      try { entity.kill() }
      catch { }
    }

    return true
  }

  return false
}

function filterKeepers(blocks: Block[]): Block[] {
  if (blocks.length === 0) return blocks

  const columns = new Map<string, { bottom: Block; top: Block }>()
  for (const block of blocks) {
    const key = `${block.typeId}:${block.x},${block.z}`
    const existing = columns.get(key)
    if (!existing) {
      columns.set(key, { bottom: block, top: block })
      continue
    }

    if (block.y < existing.bottom.y) existing.bottom = block
    if (block.y > existing.top.y) existing.top = block
  }

  return blocks.filter((block) => {
    const crop = CROP_DATA.get(stripNs(block.typeId))
    if (!crop) return true
    const column = columns.get(`${block.typeId}:${block.x},${block.z}`)
    if (!column) return true
    if (crop.leaveBottom && block === column.bottom) return false
    if (crop.leaveTop && block === column.top) return false
    return true
  })
}

interface Enchants { fortune: number; silkTouch: boolean; unbreaking: number; }
export const getEnchants = (tool: ItemStack | undefined): Enchants => {
  const enc = tool?.getComponent(ItemComponentTypes.Enchantable)
  return {
    fortune: enc?.getEnchantment("fortune")?.level ?? 0,
    silkTouch: enc?.hasEnchantment("silk_touch") ?? false,
    unbreaking: enc?.getEnchantment("unbreaking")?.level ?? 0
  }
}

const getEquip = (player: Player) => player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined
export const getMainhand = (player: Player) => getEquip(player)?.getEquipment(EquipmentSlot.Mainhand) ?? undefined

function applyDurability(player: Player, unbreaking: number): boolean {
  if (player.getGameMode() === GameMode.Creative) return true
  const equip = getEquip(player)
  const tool = getMainhand(player)
  if (!equip || !tool) return false

  const dur = tool.getComponent(ItemComponentTypes.Durability)
  if (!dur) return true

  if (dur.damage >= dur.maxDurability - 1) {
    equip.setEquipment(EquipmentSlot.Mainhand, new ItemStack("minecraft:air"))
    try {
      const pos = player.location
      player.playSound('random.break', { location: pos })
    } catch { }
    return false
  }

  if (durabilityCheck(unbreaking)) {
    dur.damage++
    equip.setEquipment(EquipmentSlot.Mainhand, tool)
  }
  return true
}

// ore
export function* oreVeinJob(
  blocks: Block[], ore: OreEntry,
  dropId: string, player: Player,
  dropPos: Vector3, opts: JobOptions,
): Generator<void, void, void> {
  const creative = player.getGameMode() === GameMode.Creative
  const enchants = getEnchants(getMainhand(player))
  const drops = new DropAccumulator()
  let totalXp = 0, broken = 0

  try {
    for (const block of blocks) {
      if (!creative) {
        if (enchants.silkTouch && ore.silkTouch) drops.add(block.typeId, 1)
        else {
          const count = computeOreDrop(ore, enchants.fortune)
          drops.add(dropId, Math.max(1, count))
          if (ore.xp) totalXp += rollXP(ore.xp)
        }
      }

      try { block.setType("minecraft:air") }
      catch { continue }

      broken++
      if (opts.costsDurability && !applyDurability(player, enchants.unbreaking)) break
      if (broken % opts.blocksPerTick === 0) yield
    }
  } finally {
    if (!creative) {
      drops.flush(blocks[0]?.dimension ?? player.dimension, dropPos)

      if (totalXp > 0) player.addExperience(totalXp)
      if (opts.costsHunger) applyMiningExhaustion(player, broken, opts.exhaustionPerBlock)
    }
  }
}

export function* cropHarvestJob(
  blocks: Block[], crop: CropEntry,
  player: Player, dropPos: Vector3,
  opts: JobOptions, replant: boolean,
  replantMode: "free" | "paid",
): Generator<void, void, void> {
  const creative = player.getGameMode() === GameMode.Creative
  const enchants = getEnchants(getMainhand(player))
  const drops = new DropAccumulator()
  let broken = 0
  const harvestBlocks = filterKeepers(blocks)

  try {
    for (const block of harvestBlocks) {
      const currentCrop = CROP_DATA.get(stripNs(block.typeId))
      if (!currentCrop) continue

      const seedPermutation = currentCrop.canReplace && currentCrop.maturity !== "none"
        ? (() => {
          try {
            return block.permutation.withState(currentCrop.maturity, 0)
          } catch {
            return undefined
          }
        })()
        : undefined

      if (!creative) {
        if (enchants.silkTouch && crop.silkTouch) drops.add(block.typeId, 1)
        else if (currentCrop.drops) {
          for (const [dropId, drop] of Object.entries(currentCrop.drops)) {
            const count = getCropDropCount(drop, enchants.fortune, currentCrop.fortune)
            drops.add(`minecraft:${dropId}`, count)
          }
        }
      }

      const seedId = currentCrop.seedItem?.includes(":") ? currentCrop.seedItem : `minecraft:${currentCrop.seedItem}`
      const shouldReplant = Boolean(
        replant &&
        currentCrop.canReplace &&
        seedId && (
          replantMode === "free" ||
          consumeSeed(player, block.dimension, block.center(), seedId) ||
          drops.remove(seedId)
        )
      )

      try { block.setType("minecraft:air") }
      catch { continue }

      if (shouldReplant && seedPermutation)
        try { block.setPermutation(seedPermutation) }
        catch { }

      broken++
      if (opts.costsDurability && !applyDurability(player, enchants.unbreaking)) break
      if (broken % opts.blocksPerTick === 0) yield
    }
  } finally {
    if (!creative) {
      drops.flush(blocks[0]?.dimension ?? player.dimension, dropPos)
      if (opts.costsHunger) applyMiningExhaustion(player, broken, opts.exhaustionPerBlock)
    }
  }
}

// tree
export function* treeJob(
  logs: Block[], player: Player,
  dropPos: Vector3, opts: JobOptions,
): Generator<void, void, void> {
  const creative = player.getGameMode() === GameMode.Creative
  const enchants = getEnchants(getMainhand(player))
  const drops = new DropAccumulator()
  let broken = 0

  try {
    for (const block of logs) {
      if (!creative) drops.add(block.typeId, 1)

      try { block.setType("minecraft:air") }
      catch { continue }
      broken++

      if (opts.costsDurability && !applyDurability(player, enchants.unbreaking)) break
      if (broken % opts.blocksPerTick === 0) yield
    }
  } finally {
    if (!creative) {
      drops.flush(logs[0]?.dimension ?? player.dimension, dropPos)
      if (opts.costsHunger) applyMiningExhaustion(player, broken, opts.exhaustionPerBlock)
    }
  }
}

// leaf
export function* leafClearJob(
  leaves: Block[], player: Player,
  useShears: boolean, dropPos: Vector3,
  opts: JobOptions,
): Generator<void, void, void> {
  const creative = player.getGameMode() === GameMode.Creative
  const enchants = getEnchants(getMainhand(player))
  const drops = new DropAccumulator()
  let broken = 0

  try {
    for (const block of leaves) {
      if (!creative) {
        if (useShears) drops.add(block.typeId, 1)
        else {
          const leafId = stripNs(block.typeId)
          const jungleLeaf = leafId.startsWith("jungle")
          const saplingChance = jungleLeaf ? 0.025 : 0.05
          if (Math.random() < saplingChance) drops.add(`minecraft:${leafId.replace("_leaves", "_sapling")}`, 1)
          if (Math.random() < 0.02) drops.add("minecraft:stick", 1)
          if ((leafId === "oak_leaves" || leafId === "dark_oak_leaves") && Math.random() < 0.005) drops.add("minecraft:apple", 1)
        }
      }

      try { block.setType("minecraft:air") }
      catch { continue }
      broken++

      if (opts.costsDurability && !applyDurability(player, enchants.unbreaking)) break
      if (broken % opts.blocksPerTick === 0) yield
    }
  } finally {
    if (!creative) {
      drops.flush(leaves[0]?.dimension ?? player.dimension, dropPos)
      if (opts.costsHunger) applyMiningExhaustion(player, broken, opts.exhaustionPerBlock)
    }
  }
}