import { Block, Dimension, ItemStack, Player, Vector3, EquipmentSlot, ItemComponentTypes, EntityComponentTypes, world } from "@minecraft/server"
import { CropEntry, CROP_DATA, OreEntry, SearchMode, dirs } from "../core/config"
import { computeOreDrop, rollCropFortune, rollXP, durabilityCheck } from "./drops"
import { exhaust } from "./hunger"
import * as lib from "../lib"
import * as cache from "../core/cache"
const { 6: DIR_6, 26: DIR_26, 124: DIR_124 } = dirs

// ts stuff
export interface JobOptions {
    costsDurability: boolean
    costsHunger: boolean
    exhaustionPerBlock: number
    blocksPerTick: number
}

class DropAccumulator {
    private c = new Map<string, number>()
    add = (i: string, a: number) => a > 0 && this.c.set(i, (this.c.get(i) ?? 0) + a)
    remove = (i: string, a = 1) => a <= 0 ? true : (this.c.get(i) ?? 0) >= a && (this.c.set(i, (this.c.get(i) ?? 0) - a), this.c.get(i) === 0 && this.c.delete(i), true)
    flush = (d: Dimension, p: Vector3) => {
        if (cache.getGameRule("doTileDrops") === false) return
        for (const [i, t] of this.c) {
            let r = t
            while (r > 0) {
                try { d.spawnItem(new ItemStack(i, Math.min(r, 64)), p) }
                catch { } finally { r -= 64 }
            }
        }
        this.c.clear()
    }
}

// helpers
const getDir = (m: SearchMode) => m === "aggressive" ? DIR_124 : m === "around" ? DIR_26 : DIR_6
const getNbr = (b: Block, d: readonly (readonly [number, number, number])[]) => {
    const r: Block[] = [], { x, y, z } = b, dim = b.dimension
    for (const [dx, dy, dz] of d) try {
        const nb = dim.getBlock({ x: x + dx, y: y + dy, z: z + dz })
        if (nb) r.push(nb)
    } catch { }
    return r
}

export function bfsCollect(s: Block, p: (b: Block) => boolean, m: number, m2: SearchMode = "around", t?: (b: Block) => boolean): Block[] {
    const f: Block[] = [], v = new Set([lib.posKey(s)]), q: Block[] = [s], d = getDir(m2)
    let h = 0, c = t ?? p
    while (h < q.length && f.length < m) {
        for (const nb of getNbr(q[h++], d)) {
            const k = lib.posKey(nb)
            if (v.has(k)) continue
            v.add(k)
            if (!c(nb)) continue
            if (p(nb)) {
                f.push(nb)
                if (f.length >= m) break
            }
            q.push(nb)
        }
    }
    return f
}

export function consumeSeed(pl: Player, d: Dimension, l: Vector3, s: string): boolean {
    const inv = pl.getComponent(EntityComponentTypes.Inventory)?.container
    if (inv) {
        const sl = inv.find(new ItemStack(s, 1))
        if (sl !== undefined && inv.getItem(sl)) {
            inv.setItem(sl, lib.reduceStack(inv.getItem(sl)!))
            return true
        }
    }
    for (const e of d.getEntities({ type: "minecraft:item", maxDistance: 2, location: l })) {
        const st = e.getComponent(EntityComponentTypes.Item)?.itemStack
        if (!st || !e.isValid || st.typeId !== s) continue
        const ni = lib.reduceStack(st)
        if (ni.typeId !== "minecraft:air") try {
            const sp = d.spawnItem(ni, l)
            if (sp) sp.applyImpulse(e.getVelocity())
        } catch { }
        try { e.remove() } catch { try { e.kill() } catch { } }
        return true
    }
    return false
}

const keepers = (b: Block[]) => {
    if (b.length === 0) return b
    const c = new Map<string, { b: Block; t: Block }>()
    for (const bl of b) {
        const k = `${bl.typeId}:${bl.x},${bl.z}`, e = c.get(k)
        if (!e) { c.set(k, { b: bl, t: bl }); continue }
        if (bl.y < e.b.y) e.b = bl
        if (bl.y > e.t.y) e.t = bl
    }
    return b.filter(bl => {
        const cr = CROP_DATA.get(lib.stripNs(bl.typeId))
        if (!cr) return true
        const col = c.get(`${bl.typeId}:${bl.x},${bl.z}`)
        return !col || !(cr.leaveBottom && bl === col.b) && !(cr.leaveTop && bl === col.t)
    })
}

interface JobCtx { cr: boolean; en: any; dr: DropAccumulator; br: number }
const mkCtx = (pl: Player): JobCtx => ({ cr: lib.isGod(pl), en: lib.getFUS(lib.getEquS(pl)), dr: new DropAccumulator(), br: 0 })
const applyDur = (pl: Player, u: number): boolean => {
    const ctx = mkCtx(pl)
    if (ctx.cr) return true
    const to = lib.getEquS(pl)
    if (!to) return false
    const d = to.getComponent(ItemComponentTypes.Durability)
    if (!d) return true
    if (d.damage >= d.maxDurability - 1) {
        lib.getEqu(pl)?.setEquipment(EquipmentSlot.Mainhand, new ItemStack("minecraft:air"))
        try { pl.playSound('random.break', { location: pl.location }) } catch { }
        return false
    }
    if (durabilityCheck(u)) {
        d.damage++
        lib.getEqu(pl)?.setEquipment(EquipmentSlot.Mainhand, to)
    }
    return true
}

export function* oreVeinJob(bl: Block[], o: OreEntry, di: string, pl: Player, dp: Vector3, opt: JobOptions): Generator<void, void, void> {
    const ctx = mkCtx(pl)
    let xp = 0
    try {
        for (const b of bl) {
            if (!ctx.cr) {
                if (ctx.en.silkTouch && o.silkTouch) ctx.dr.add(b.typeId, 1)
                else {
                    ctx.dr.add(di, Math.max(1, computeOreDrop(o, ctx.en.fortune)))
                    if (o.xp) xp += rollXP(o.xp)
                }
            }
            try { b.setType("minecraft:air") } catch { continue }
            ctx.br++
            if (opt.costsDurability && !applyDur(pl, ctx.en.unbreaking)) break
            if (ctx.br % opt.blocksPerTick === 0) yield
        }
    } finally {
        if (!ctx.cr) {
            ctx.dr.flush(bl[0]?.dimension ?? pl.dimension, dp)
            if (xp > 0) pl.addExperience(xp)
            if (opt.costsHunger) exhaust(pl, ctx.br, opt.exhaustionPerBlock)
        }
    }
}

export function* cropHarvestJob(bl: Block[], cr: CropEntry, pl: Player, dp: Vector3, opt: JobOptions, rp: boolean, rm: "free" | "paid"): Generator<void, void, void> {
    const ctx = mkCtx(pl)
    const hb = keepers(bl)
    try {
        for (const b of hb) {
            const cc = CROP_DATA.get(lib.stripNs(b.typeId))
            if (!cc) continue
            const sp = cc.canReplace && cc.maturity !== "none" ? (() => { try { return b.permutation.withState(cc.maturity, 0) } catch { return undefined } })() : undefined
            if (!ctx.cr) {
                if (ctx.en.silkTouch && cr.silkTouch) ctx.dr.add(b.typeId, 1)
                else if (cc.drops) for (const [di, dr] of Object.entries(cc.drops)) ctx.dr.add(`minecraft:${di}`, dr.chance ? Math.random() < dr.chance[0] / dr.chance[1] ? 1 : 0 : rollCropFortune(dr.min, dr.max, ctx.en.fortune, dr.fortuneCap))
            }
            const si = cc.seedItem?.includes(":") ? cc.seedItem : `minecraft:${cc.seedItem}`
            const sr = rp && cc.canReplace && si && (rm === "free" || consumeSeed(pl, b.dimension, b.center(), si) || ctx.dr.remove(si))
            try { b.setType("minecraft:air") } catch { continue }
            if (sr && sp) try { b.setPermutation(sp) } catch { }
            ctx.br++
            if (opt.costsDurability && !applyDur(pl, ctx.en.unbreaking)) break
            if (ctx.br % opt.blocksPerTick === 0) yield
        }
    } finally {
        if (!ctx.cr) {
            ctx.dr.flush(bl[0]?.dimension ?? pl.dimension, dp)
            if (opt.costsHunger) exhaust(pl, ctx.br, opt.exhaustionPerBlock)
        }
    }
}

export function* treeJob(l: Block[], pl: Player, dp: Vector3, opt: JobOptions): Generator<void, void, void> {
    const ctx = mkCtx(pl)
    try {
        for (const b of l) {
            if (!ctx.cr) ctx.dr.add(b.typeId, 1)
            try { b.setType("minecraft:air") } catch { continue }
            ctx.br++
            if (opt.costsDurability && !applyDur(pl, ctx.en.unbreaking)) break
            if (ctx.br % opt.blocksPerTick === 0) yield
        }
    } finally {
        if (!ctx.cr) {
            ctx.dr.flush(l[0]?.dimension ?? pl.dimension, dp)
            if (opt.costsHunger) exhaust(pl, ctx.br, opt.exhaustionPerBlock)
        }
    }
}

export function* leafClearJob(l: Block[], pl: Player, us: boolean, dp: Vector3, opt: JobOptions): Generator<void, void, void> {
    const ctx = mkCtx(pl)
    try {
        for (const b of l) {
            if (!ctx.cr) {
                if (us) ctx.dr.add(b.typeId, 1)
                else {
                    const li = lib.stripNs(b.typeId), jl = li.startsWith("jungle")
                    if (Math.random() < (jl ? 0.025 : 0.05)) ctx.dr.add(`minecraft:${li.replace("_leaves", "_sapling")}`, 1)
                    if (Math.random() < 0.02) ctx.dr.add("minecraft:stick", 1)
                    if ((li === "oak_leaves" || li === "dark_oak_leaves") && Math.random() < 0.005) ctx.dr.add("minecraft:apple", 1)
                }
            }
            try { b.setType("minecraft:air") } catch { continue }
            ctx.br++
            if (opt.costsDurability && !applyDur(pl, ctx.en.unbreaking)) break
            if (ctx.br % opt.blocksPerTick === 0) yield
        }
    } finally {
        if (!ctx.cr) {
            ctx.dr.flush(l[0]?.dimension ?? pl.dimension, dp)
            if (opt.costsHunger) exhaust(pl, ctx.br, opt.exhaustionPerBlock)
        }
    }
}