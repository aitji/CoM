import { Block, Player, Vector3 } from "@minecraft/server"
import { dirs, LEAF_DECAY_RANGE, LeafClearMode, LOG_SUFFIXES } from "../core/config"
import { getNbr, JobOptions, leafClearJob } from "./mining"
import * as lib from "../lib"
const { 6: DIR_6 } = dirs

const YIELD_EVERY = 64
const isLeaf = (b: Block) => /_leaves(_flowered)?$/.test(b.typeId)
const isLog = (b: Block) => LOG_SUFFIXES.has(lib.stripNs(b.typeId))
const stateOf = (b: Block, s: string) => {
    try { return b.permutation.getState(s as any) }
    catch { return undefined }
}

export const isPersistent = (b: Block) => stateOf(b, "persistent_bit") === true
export function* findOrphanLeaves(felled: Block[], limit: number): Generator<void, { orphans: Block[]; capped: boolean }, void> {
    const range = LEAF_DECAY_RANGE
    const gone = new Set(felled.map(lib.posKey))
    let work = 0, capped = false

    const cand = new Map<string, Block>()
    let front: Block[] = felled
    for (let depth = 1; depth <= range && front.length; depth++) {
        const next: Block[] = []
        for (const src of front) {
            for (const nb of getNbr(src, DIR_6)) {
                if (++work % YIELD_EVERY === 0) yield
                const k = lib.posKey(nb)
                if (cand.has(k) || !isLeaf(nb)) continue
                if (cand.size >= limit) { capped = true; continue }
                cand.set(k, nb)
                next.push(nb)
            }
        }
        front = next
    }
    if (cand.size === 0) return { orphans: [], capped }

    const region = new Map<string, Block>(cand)
    const logs = new Map<string, Block>()
    front = [...cand.values()]
    for (let depth = 0; depth < range && front.length; depth++) {
        const next: Block[] = []
        for (const src of front) {
            for (const nb of getNbr(src, DIR_6)) {
                if (++work % YIELD_EVERY === 0) yield
                const k = lib.posKey(nb)
                if (isLog(nb)) { if (!gone.has(k)) logs.set(k, nb); continue }
                if (region.has(k) || !isLeaf(nb) || depth >= range - 1) continue
                region.set(k, nb)
                next.push(nb)
            }
        }
        front = next
    }

    const dist = new Map<string, number>()
    const seed: Block[] = []
    const spread = (from: { x: number; y: number; z: number }, d: number, out: Block[]) => {
        for (const [dx, dy, dz] of DIR_6) {
            const k = lib.posKey({ x: from.x + dx, y: from.y + dy, z: from.z + dz })
            const lf = region.get(k)
            if (lf && !dist.has(k)) { dist.set(k, d); out.push(lf) }
        }
    }
    for (const lg of logs.values()) spread(lg, 1, seed)
    front = seed
    for (let d = 1; d < range && front.length; d++) {
        const next: Block[] = []
        for (const src of front) {
            if (++work % YIELD_EVERY === 0) yield
            spread(src, d + 1, next)
        }
        front = next
    }

    const orphans: Block[] = []
    for (const [k, b] of cand) if (!dist.has(k) && !isPersistent(b)) orphans.push(b)
    return { orphans, capped }
}


function* markForDecay(leaves: Block[]): Generator<void, number, void> {
    let marked = 0, seen = 0
    for (const b of leaves) {
        try {
            const p = b.permutation
            if (stateOf(b, "update_bit") !== undefined) {
                b.setPermutation(p.withState("persistent_bit", false).withState("update_bit", true))
                marked++
            }
        } catch { }
        if (++seen % 32 === 0) yield
    }
    return marked
}

export function* leafAfterFellJob(felled: Block[], pl: Player, dp: Vector3, opt: JobOptions, mode: LeafClearMode, limit: number): Generator<void, void, void> {
    try {
        const { orphans, capped } = yield* findOrphanLeaves(felled, limit)
        if (capped) lib.log("LEAF", `hit tree_leaf_limit (${limit}); the rest is left to natural decay`, "debug")
        if (orphans.length === 0) return

        if (mode === "instant") yield* leafClearJob(orphans, pl, false, dp, opt)
        else {
            const n = yield* markForDecay(orphans)
            lib.log("LEAF", `flagged ${n}/${orphans.length} orphaned leaves for natural decay`, "debug")
        }
    } catch ($) { lib.log("LEAF", `leaf cleanup failed: ${$}`, "error") }
}
