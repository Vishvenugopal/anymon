import type Redis from "ioredis";
import type {
  Anymon,
  AnymonState,
  BattleRoom,
  GeoHit,
  NearbyTrainer,
  User,
} from "./types";
import { PRESENCE_TTL_MS } from "./types";

// Storage abstraction. Prefers Redis (real GEOADD/GEOSEARCH + locks) when
// REDIS_URL is set; otherwise falls back to an in-memory store so the app
// boots with zero setup.

export interface Store {
  saveAnymon(a: Anymon): Promise<void>;
  getAnymon(id: string): Promise<Anymon | null>;
  updateAnymon(id: string, patch: Partial<Anymon>): Promise<Anymon | null>;
  /** Permanently remove an Anymon (used to dismiss capture-notice ghosts). */
  deleteAnymon(id: string): Promise<void>;
  listByOwner(ownerId: string): Promise<Anymon[]>;
  countByState(ownerId: string, state: AnymonState): Promise<number>;
  allAnymons(): Promise<Anymon[]>;
  geoAdd(id: string, lng: number, lat: number): Promise<void>;
  geoRemove(id: string): Promise<void>;
  geoSearch(lng: number, lat: number, radiusM: number): Promise<GeoHit[]>;
  acquireLock(id: string, ttlMs: number): Promise<boolean>;
  releaseLock(id: string): Promise<void>;
  // Users
  getUser(id: string): Promise<User | null>;
  saveUser(user: User): Promise<void>;
  getUserIdByUsername(username: string): Promise<string | null>;
  /** Atomically reserve a username for a user id. Returns false if taken. */
  reserveUsername(username: string, userId: string): Promise<boolean>;
  // Presence (TTL + geo index of live trainers)
  setPresence(userId: string, lat: number, lng: number, username: string): Promise<void>;
  nearbyPlayers(lat: number, lng: number, radiusM: number): Promise<NearbyTrainer[]>;
  // PvP rooms
  saveRoom(room: BattleRoom): Promise<void>;
  getRoom(id: string): Promise<BattleRoom | null>;
  /** Patch a room; auto-bumps version + updatedAt unless the patch sets them. */
  updateRoom(id: string, patch: Partial<BattleRoom>): Promise<BattleRoom | null>;
  // Per-user incoming invite pointer (the pending room someone is challenging me to)
  setIncomingInvite(userId: string, roomId: string | null): Promise<void>;
  getIncomingInvite(userId: string): Promise<string | null>;
  // Per-user active/pending room pointer (anti-spam: one live room per user)
  setUserRoom(userId: string, roomId: string | null): Promise<void>;
  getUserRoom(userId: string): Promise<string | null>;
}

function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------- In-memory store ----------------
class MemoryStore implements Store {
  private anymons = new Map<string, Anymon>();
  private geo = new Map<string, { lat: number; lng: number }>();
  private locks = new Map<string, number>();
  private users = new Map<string, User>();
  private usernames = new Map<string, string>(); // lower(username) -> userId
  private presence = new Map<
    string,
    { lat: number; lng: number; username: string; exp: number }
  >();
  private rooms = new Map<string, BattleRoom>();
  private incomingInvite = new Map<string, string>(); // userId -> roomId
  private userRoom = new Map<string, string>(); // userId -> roomId

  async getUser(id: string) {
    return this.users.get(id) ?? null;
  }
  async saveUser(user: User) {
    this.users.set(user.id, user);
  }
  async getUserIdByUsername(username: string) {
    return this.usernames.get(username.toLowerCase()) ?? null;
  }
  async reserveUsername(username: string, userId: string) {
    const key = username.toLowerCase();
    const existing = this.usernames.get(key);
    if (existing && existing !== userId) return false;
    this.usernames.set(key, userId);
    return true;
  }

  async saveAnymon(a: Anymon) {
    this.anymons.set(a.id, a);
  }
  async getAnymon(id: string) {
    return this.anymons.get(id) ?? null;
  }
  async updateAnymon(id: string, patch: Partial<Anymon>) {
    const cur = this.anymons.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    this.anymons.set(id, next);
    return next;
  }
  async deleteAnymon(id: string) {
    this.anymons.delete(id);
    this.geo.delete(id);
  }
  async listByOwner(ownerId: string) {
    return [...this.anymons.values()].filter((a) => a.ownerId === ownerId);
  }
  async countByState(ownerId: string, state: AnymonState) {
    return (await this.listByOwner(ownerId)).filter((a) => a.state === state)
      .length;
  }
  async allAnymons() {
    return [...this.anymons.values()];
  }
  async geoAdd(id: string, lng: number, lat: number) {
    this.geo.set(id, { lat, lng });
  }
  async geoRemove(id: string) {
    this.geo.delete(id);
  }
  async geoSearch(lng: number, lat: number, radiusM: number) {
    const hits: GeoHit[] = [];
    for (const [id, pos] of this.geo.entries()) {
      const distM = haversineMeters(lat, lng, pos.lat, pos.lng);
      if (distM <= radiusM) hits.push({ id, distM, lat: pos.lat, lng: pos.lng });
    }
    return hits.sort((a, b) => a.distM - b.distM);
  }
  async acquireLock(id: string, ttlMs: number) {
    const now = Date.now();
    const exp = this.locks.get(id);
    if (exp && exp > now) return false;
    this.locks.set(id, now + ttlMs);
    return true;
  }
  async releaseLock(id: string) {
    this.locks.delete(id);
  }

  async setPresence(userId: string, lat: number, lng: number, username: string) {
    this.presence.set(userId, { lat, lng, username, exp: Date.now() + PRESENCE_TTL_MS });
  }
  async nearbyPlayers(lat: number, lng: number, radiusM: number) {
    const now = Date.now();
    const out: NearbyTrainer[] = [];
    for (const [userId, p] of this.presence.entries()) {
      if (p.exp <= now) {
        this.presence.delete(userId);
        continue;
      }
      const distM = haversineMeters(lat, lng, p.lat, p.lng);
      if (distM <= radiusM) {
        out.push({ userId, username: p.username, distM, lat: p.lat, lng: p.lng });
      }
    }
    return out.sort((a, b) => a.distM - b.distM);
  }

  async saveRoom(room: BattleRoom) {
    this.rooms.set(room.id, room);
  }
  async getRoom(id: string) {
    return this.rooms.get(id) ?? null;
  }
  async updateRoom(id: string, patch: Partial<BattleRoom>) {
    const cur = this.rooms.get(id);
    if (!cur) return null;
    const next: BattleRoom = {
      ...cur,
      ...patch,
      version: patch.version ?? cur.version + 1,
      updatedAt: patch.updatedAt ?? Date.now(),
    };
    this.rooms.set(id, next);
    return next;
  }
  async setIncomingInvite(userId: string, roomId: string | null) {
    if (roomId) this.incomingInvite.set(userId, roomId);
    else this.incomingInvite.delete(userId);
  }
  async getIncomingInvite(userId: string) {
    return this.incomingInvite.get(userId) ?? null;
  }
  async setUserRoom(userId: string, roomId: string | null) {
    if (roomId) this.userRoom.set(userId, roomId);
    else this.userRoom.delete(userId);
  }
  async getUserRoom(userId: string) {
    return this.userRoom.get(userId) ?? null;
  }
}

// ---------------- Redis store ----------------
const KEY = {
  anymon: (id: string) => `anymon:${id}`,
  all: "anymon:all",
  owner: (ownerId: string) => `owner:${ownerId}`,
  geo: "anymon:geo",
  lock: (id: string) => `lock:anymon:${id}`,
  user: (id: string) => `user:${id}`,
  username: (name: string) => `username:${name.toLowerCase()}`,
  presence: (userId: string) => `presence:${userId}`,
  playersGeo: "players:geo",
  room: (id: string) => `room:${id}`,
  invite: (userId: string) => `invite:${userId}`,
  userRoom: (userId: string) => `userroom:${userId}`,
};

class RedisStore implements Store {
  constructor(private redis: Redis) {}

  async saveAnymon(a: Anymon) {
    const pipe = this.redis.pipeline();
    pipe.set(KEY.anymon(a.id), JSON.stringify(a));
    pipe.sadd(KEY.all, a.id);
    pipe.sadd(KEY.owner(a.ownerId), a.id);
    await pipe.exec();
  }
  async getAnymon(id: string) {
    const raw = await this.redis.get(KEY.anymon(id));
    return raw ? (JSON.parse(raw) as Anymon) : null;
  }
  async updateAnymon(id: string, patch: Partial<Anymon>) {
    const cur = await this.getAnymon(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    // Owner can change on capture; keep owner index in sync.
    if (patch.ownerId && patch.ownerId !== cur.ownerId) {
      const pipe = this.redis.pipeline();
      pipe.srem(KEY.owner(cur.ownerId), id);
      pipe.sadd(KEY.owner(patch.ownerId), id);
      await pipe.exec();
    }
    await this.redis.set(KEY.anymon(id), JSON.stringify(next));
    return next;
  }
  async deleteAnymon(id: string) {
    const cur = await this.getAnymon(id);
    const pipe = this.redis.pipeline();
    pipe.del(KEY.anymon(id));
    pipe.srem(KEY.all, id);
    if (cur) pipe.srem(KEY.owner(cur.ownerId), id);
    pipe.zrem(KEY.geo, id);
    await pipe.exec();
  }
  async listByOwner(ownerId: string) {
    const ids = await this.redis.smembers(KEY.owner(ownerId));
    return this.mget(ids);
  }
  async countByState(ownerId: string, state: AnymonState) {
    return (await this.listByOwner(ownerId)).filter((a) => a.state === state)
      .length;
  }
  async allAnymons() {
    const ids = await this.redis.smembers(KEY.all);
    return this.mget(ids);
  }
  private async mget(ids: string[]) {
    if (!ids.length) return [];
    const raws = await this.redis.mget(ids.map(KEY.anymon));
    return raws
      .filter((r): r is string => !!r)
      .map((r) => JSON.parse(r) as Anymon);
  }
  async geoAdd(id: string, lng: number, lat: number) {
    await this.redis.geoadd(KEY.geo, lng, lat, id);
  }
  async geoRemove(id: string) {
    await this.redis.zrem(KEY.geo, id);
  }
  async geoSearch(lng: number, lat: number, radiusM: number) {
    // GEOSEARCH key FROMLONLAT lng lat BYRADIUS r m ASC WITHCOORD WITHDIST
    const res = (await this.redis.geosearch(
      KEY.geo,
      "FROMLONLAT",
      lng,
      lat,
      "BYRADIUS",
      radiusM,
      "m",
      "ASC",
      "WITHCOORD",
      "WITHDIST",
    )) as Array<[string, string, [string, string]]>;
    return res.map(([id, dist, [mLng, mLat]]) => ({
      id,
      distM: parseFloat(dist),
      lat: parseFloat(mLat),
      lng: parseFloat(mLng),
    }));
  }
  async acquireLock(id: string, ttlMs: number) {
    const ok = await this.redis.set(KEY.lock(id), "1", "PX", ttlMs, "NX");
    return ok === "OK";
  }
  async releaseLock(id: string) {
    await this.redis.del(KEY.lock(id));
  }
  async getUser(id: string) {
    const raw = await this.redis.get(KEY.user(id));
    return raw ? (JSON.parse(raw) as User) : null;
  }
  async saveUser(user: User) {
    await this.redis.set(KEY.user(user.id), JSON.stringify(user));
  }
  async getUserIdByUsername(username: string) {
    return this.redis.get(KEY.username(username));
  }
  async reserveUsername(username: string, userId: string) {
    const ok = await this.redis.set(KEY.username(username), userId, "NX");
    if (ok === "OK") return true;
    // Allow the same user to "re-reserve" their own name (idempotent).
    const current = await this.redis.get(KEY.username(username));
    return current === userId;
  }

  async setPresence(userId: string, lat: number, lng: number, username: string) {
    const pipe = this.redis.pipeline();
    // Per-member geo TTL isn't a thing, so we TTL the presence record and lazily
    // prune the geo index on read.
    pipe.set(
      KEY.presence(userId),
      JSON.stringify({ username, lat, lng }),
      "PX",
      PRESENCE_TTL_MS,
    );
    pipe.geoadd(KEY.playersGeo, lng, lat, userId);
    await pipe.exec();
  }
  async nearbyPlayers(lat: number, lng: number, radiusM: number) {
    const res = (await this.redis.geosearch(
      KEY.playersGeo,
      "FROMLONLAT",
      lng,
      lat,
      "BYRADIUS",
      radiusM,
      "m",
      "ASC",
      "WITHCOORD",
      "WITHDIST",
    )) as Array<[string, string, [string, string]]>;
    const out: NearbyTrainer[] = [];
    for (const [userId, dist, [, mLat]] of res) {
      const raw = await this.redis.get(KEY.presence(userId));
      if (!raw) {
        // Expired presence — drop the stale geo entry.
        await this.redis.zrem(KEY.playersGeo, userId).catch(() => {});
        continue;
      }
      const p = JSON.parse(raw) as { username: string; lat: number; lng: number };
      out.push({
        userId,
        username: p.username,
        distM: parseFloat(dist),
        lat: parseFloat(mLat) || p.lat,
        lng: p.lng,
      });
    }
    return out;
  }

  async saveRoom(room: BattleRoom) {
    // Rooms self-expire after an hour so dead demos don't linger.
    await this.redis.set(KEY.room(room.id), JSON.stringify(room), "PX", 3_600_000);
  }
  async getRoom(id: string) {
    const raw = await this.redis.get(KEY.room(id));
    return raw ? (JSON.parse(raw) as BattleRoom) : null;
  }
  async updateRoom(id: string, patch: Partial<BattleRoom>) {
    const cur = await this.getRoom(id);
    if (!cur) return null;
    const next: BattleRoom = {
      ...cur,
      ...patch,
      version: patch.version ?? cur.version + 1,
      updatedAt: patch.updatedAt ?? Date.now(),
    };
    await this.saveRoom(next);
    return next;
  }
  async setIncomingInvite(userId: string, roomId: string | null) {
    if (roomId) await this.redis.set(KEY.invite(userId), roomId, "PX", 3_600_000);
    else await this.redis.del(KEY.invite(userId));
  }
  async getIncomingInvite(userId: string) {
    return this.redis.get(KEY.invite(userId));
  }
  async setUserRoom(userId: string, roomId: string | null) {
    if (roomId) await this.redis.set(KEY.userRoom(userId), roomId, "PX", 3_600_000);
    else await this.redis.del(KEY.userRoom(userId));
  }
  async getUserRoom(userId: string) {
    return this.redis.get(KEY.userRoom(userId));
  }
}

// ---------------- Singleton selection ----------------
let store: Store | null = null;

export function getStore(): Store {
  if (store) return store;
  const url = process.env.REDIS_URL;
  if (url) {
    // Lazy require so the in-memory path never needs ioredis at runtime.
    const IORedis = require("ioredis") as typeof import("ioredis").default;
    const g = globalThis as unknown as { __anymonRedis?: Redis };
    if (!g.__anymonRedis) {
      // If auth is rejected we must NOT keep reconnecting — a retry storm against
      // a bad password is exactly what trips Redis Cloud's brute-force lockout.
      const isAuthError = (msg: string) =>
        /WRONGPASS|NOAUTH|NOPERM|invalid username-password/i.test(msg);

      const client = new IORedis(url, {
        maxRetriesPerRequest: 3,
        connectTimeout: 8000,
        keepAlive: 10000, // TCP keepalive to reduce idle disconnects
        // Give up reconnecting after ~10 network attempts; null = stop.
        retryStrategy: (times) => (times > 10 ? null : Math.min(times * 200, 2000)),
        // Don't auto-reconnect on auth errors at all.
        reconnectOnError: (err) => !isAuthError(err.message),
      });

      client.on("error", (e) => {
        if (isAuthError(e.message)) {
          console.error(
            "[redis] AUTH rejected — disabling Redis for this run to avoid a " +
              "lockout. Fix REDIS_URL (regenerate the password) and restart. " +
              "Falling back to in-memory store.",
          );
          // Kill the client so nothing keeps hammering the server.
          try {
            client.disconnect();
          } catch {}
          // Swap the live store over to in-memory so requests keep working.
          const gm = globalThis as unknown as { __anymonMem?: MemoryStore };
          if (!gm.__anymonMem) gm.__anymonMem = new MemoryStore();
          store = gm.__anymonMem;
        } else {
          // Benign transient drop (e.g. ECONNRESET on idle) — ioredis reconnects.
          console.warn("[redis] connection error (auto-reconnecting):", e.message);
        }
      });
      g.__anymonRedis = client;
    }
    store = new RedisStore(g.__anymonRedis);
  } else {
    const g = globalThis as unknown as { __anymonMem?: MemoryStore };
    if (!g.__anymonMem) g.__anymonMem = new MemoryStore();
    store = g.__anymonMem;
  }
  return store;
}
