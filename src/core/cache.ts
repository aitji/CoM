import { Dimension, GameMode, GameRuleChangeAfterEvent, PlatformType, Player, PlayerGameModeChangeAfterEvent, PlayerLeaveAfterEvent, PlayerSpawnAfterEvent, system, world } from "@minecraft/server"

const PlayerDataShape = { name: '' as string, platformType: '' as PlatformType, gameMode: '' as GameMode }
const WorldDataShape = { gamerule: { doTileDrops: false as boolean | number } }

const TRACKED_GAME_RULES = ["doTileDrops"] as const
export const WORLD_CACHE_ID = "world"
const trackedGameRuleSet = new Set<string>(TRACKED_GAME_RULES)

export type PlayerData = typeof PlayerDataShape
export type TrackedGameRule = (typeof TRACKED_GAME_RULES)[number]
export type WorldData = typeof WorldDataShape
export type CacheData = keyof PlayerData

export const playerDataKeys = Object.keys(PlayerDataShape) as (keyof PlayerData)[]
export const worldDataKeys = Object.keys(WorldDataShape) as (keyof WorldData)[]
export const worldGameRuleKeys = Object.keys(WorldDataShape.gamerule) as (keyof WorldData['gamerule'])[]

export const playerData = new Map<string, PlayerData>()
export const worldData = new Map<string, WorldData>()

const cachedDimensions = new Map<string, Dimension>()
const typeMap = { player: playerData, world: worldData } as const

type TypeMap = typeof typeMap
type CacheType = keyof TypeMap
type CacheValue<T extends CacheType> = TypeMap[T] extends Map<any, infer V> ? V : never

system.run(() => {
    world_init_update()
    for (const player of world.getAllPlayers()) player_init_update(player)
})

export const world_init_update = () => {
    const gamerule = {} as WorldData['gamerule']
    for (const rule of worldGameRuleKeys) {
        const val = (world.gameRules as any)[rule]
        world.sendMessage(`Game Rule ${rule} is set to ${val}`)
        gamerule[rule] = (typeof val === 'boolean' || typeof val === 'number') ? (val as boolean | number) : false
    }
    return update('world', WORLD_CACHE_ID, { gamerule })
}

export const gamerule_update = (data: GameRuleChangeAfterEvent) => {
    if (!trackedGameRuleSet.has(data.rule)) return
    world.sendMessage(`Game Rule ${data.rule} changed to ${data.value}`)
    return update('world', WORLD_CACHE_ID, { gamerule: { [data.rule as unknown as keyof WorldData['gamerule']]: data.value as any } })
}

export const player_init_update = (player: Player) => update('player', player.id, { name: player.name, gameMode: player.getGameMode() })
export const player_gamemode_update = (data: PlayerGameModeChangeAfterEvent) => update('player', data.player.id, { gameMode: data.toGameMode })

export const player_track_start = (data: PlayerSpawnAfterEvent) => {
    if (data.initialSpawn) player_init_update(data.player)
}

export const player_track_stop = (data: PlayerLeaveAfterEvent) => {
    playerData.delete(data.playerId)
}

export const update = <T extends CacheType>(type: T, id: string, kv: Partial<CacheValue<T>>) => {
    const cache = typeMap[type] as Map<string, CacheValue<T>>
    const prev = cache.get(id)
    const next = { ...(prev || {}), ...kv } as CacheValue<T>
    cache.set(id, next)
    return next
}

export const getPlayer = (player: Player | string, get?: CacheData) => {
    const id = typeof player === 'string' ? player : player.id
    let data = playerData.get(id)
    if (!data) {
        if (typeof player === 'string') return ''
        data = player_init_update(player)
    }
    return get ? data[get as CacheData] : data
}

export const getCachedDimension = (dimensionId: string): Dimension | null => {
    if (cachedDimensions.has(dimensionId)) return cachedDimensions.get(dimensionId)!
    try {
        const dim = world.getDimension(dimensionId)
        cachedDimensions.set(dimensionId, dim)
        return dim
    } catch { return null }
}