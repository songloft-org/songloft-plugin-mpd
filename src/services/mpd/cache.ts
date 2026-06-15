/**
 * 缓存管理模块
 * 提供统一的缓存管理功能，解决内存泄漏问题
 */

import type { TimedCacheEntry } from "./types";
import { BoundedCache, CacheManager } from "./cache-manager";
import { CACHE_CONFIG } from "./constants";

/**
 * 缓存项接口（兼容性保留）
 */
export interface CacheItem<T> extends TimedCacheEntry<T> {
  key: string;
}

/**
 * 缓存统计数据接口
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  hitRate: string;
  totalRequests: number;
}

/**
 * 简单内存缓存实现（兼容性保留）
 */
export class MemoryCache<T> {
  private boundedCache: BoundedCache<T>;

  constructor(maxSize: number = 1000, ttlMs: number = 3600000) {
    this.boundedCache = new BoundedCache<T>(maxSize, ttlMs);
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.boundedCache.set(key, value, ttlMs);
  }

  get(key: string): T | null {
    return this.boundedCache.get(key);
  }

  delete(key: string): void {
    this.boundedCache.delete(key);
  }

  clear(): void {
    this.boundedCache.clear();
  }

  async cleanup(): Promise<number> {
    return await this.boundedCache.cleanup();
  }

  size(): number {
    return this.boundedCache.size();
  }

  keys(): string[] {
    return Array.from(this.boundedCache['cache'].keys());
  }

  getStats(): CacheStats {
    const boundedStats = this.boundedCache.getStats();
    return {
      hits: boundedStats.hits,
      misses: boundedStats.misses,
      sets: boundedStats.sets,
      hitRate: boundedStats.hitRate || "0%",
      totalRequests: boundedStats.totalRequests || 0
    };
  }

  clearStats(): void {
    // 清空统计信息
    this.boundedCache['stats'] = { hits: 0, misses: 0, sets: 0, evictions: 0 };
  }
}

/**
 * 全局缓存实例（使用有界缓存）
 */
const cacheManager = CacheManager.getInstance();

const caches = {
  lyrics: cacheManager.register<string>("lyrics", 500, CACHE_CONFIG.LYRICS_CACHE_TTL_MS),
  covers: cacheManager.register<string>("covers", 200, CACHE_CONFIG.COVER_CACHE_TTL_MS),
  platform: cacheManager.register<any>("platform", 10, CACHE_CONFIG.PLATFORM_CACHE_TTL_MS),
  binaries: cacheManager.register<any>("binaries", 20, CACHE_CONFIG.RESOLVED_BINARY_CACHE_TTL_MS),
  songMetadata: cacheManager.register<any>("songMetadata", 1000, CACHE_CONFIG.SONG_TARGET_METADATA_TTL_MS)
};

/**
 * 获取歌词缓存
 */
export function getLyricsCache(): MemoryCache<string> {
  return caches.lyrics;
}

/**
 * 获取封面缓存
 */
export function getCoverCache(): MemoryCache<string> {
  return caches.covers;
}

/**
 * 获取平台缓存
 */
export function getPlatformCache(): MemoryCache<any> {
  return caches.platform;
}

/**
 * 获取二进制缓存
 */
export function getBinaryCache(): MemoryCache<any> {
  return caches.binaries;
}

/**
 * 获取歌曲元数据缓存
 */
export function getSongMetadataCache(): MemoryCache<any> {
  return caches.songMetadata;
}

/**
 * 清理所有过期缓存
 *
 * @returns 清理的缓存项总数
 */
export async function cleanupAllCaches(): Promise<number> {
  let totalCleaned = 0;

  for (const cache of Object.values(caches)) {
    totalCleaned += await cache.cleanup();
  }

  return totalCleaned;
}

/**
 * 清空所有缓存
 */
export async function clearAllCaches(): Promise<void> {
  for (const cache of Object.values(caches)) {
    await cache.clear();
  }
}

/**
 * 读取带时间的缓存
 * 
 * @param entry - 缓存条目
 * @returns 缓存值，如果已过期则返回 null
 */
export function readTimedCache<T>(entry: TimedCacheEntry<T> | null | undefined): T | null {
  if (!entry) {
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    return null;
  }
  return entry.value;
}

/**
 * 写入带时间的缓存
 * 
 * @param value - 缓存值
 * @param ttlMs - 生存时间（毫秒）
 * @returns 缓存条目
 */
export function writeTimedCache<T>(value: T, ttlMs: number): TimedCacheEntry<T> {
  return {
    value,
    expiresAt: Date.now() + ttlMs
  };
}

/**
 * 缓存装饰器
 * 
 * @param cache - 缓存实例
 * @param keyFn - 生成缓存键的函数
 * @param ttlMs - 缓存生存时间
 * @returns 装饰后的函数
 * 
 * @example
 * const cachedFetch = withCache(
 *   getLyricsCache(),
 *   (songId) => `lyrics:${songId}`,
 *   CACHE_CONFIG.LYRICS_CACHE_TTL_MS
 * );
 * 
 * const lyrics = await cachedFetch(songId, () => fetchLyrics(songId));
 */
export function withCache<T, Args extends unknown[]>(
  cache: MemoryCache<T>,
  keyFn: (...args: Args) => string,
  ttlMs: number
) {
  return async function(
    fn: (...args: Args) => Promise<T>,
    ...args: Args
  ): Promise<T> {
    const key = keyFn(...args);
    
    // 尝试从缓存获取
    const cached = cache.get(key);
    if (cached !== null) {
      return cached;
    }
    
    // 缓存未命中，执行函数
    const result = await fn(...args);
    
    // 写入缓存
    cache.set(key, result, ttlMs);
    
    return result;
  };
}

/**
 * 批量缓存预加载
 *
 * @param cache - 缓存实例
 * @param items - 要预加载的项目
 * @param loader - 加载函数
 * @param ttlMs - 缓存生存时间
 *
 * @example
 * await preloadCache(
 *   getLyricsCache(),
 *   [{ id: "1" }, { id: "2" }],
 *   (item) => fetchLyrics(item.id),
 *   CACHE_CONFIG.LYRICS_CACHE_TTL_MS
 * );
 */
export async function preloadCache<T, K>(
  cache: MemoryCache<T>,
  items: K[],
  loader: (item: K) => Promise<T>,
  ttlMs: number
): Promise<void> {
  const promises = items.map(async (item) => {
    try {
      const value = await loader(item);
      cache.set(String(item), value, ttlMs);
    } catch (error) {
      // 预加载失败不影响其他项目
      console.error(`预加载缓存失败: ${String(item)}`, error);
    }
  });

  await Promise.all(promises);
}

/**
 * 缓存统计数据接口
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  hitRate: string;
  totalRequests: number;
}

/**
 * 获取所有缓存的统计信息
 */
export function getAllCacheStats(): Record<string, CacheStats> {
  return {
    lyrics: getLyricsCache().getStats(),
    covers: getCoverCache().getStats(),
    platform: getPlatformCache().getStats(),
    binaries: getBinaryCache().getStats(),
    songMetadata: getSongMetadataCache().getStats()
  };
}

/**
 * 清空所有缓存的统计数据
 */
export function clearAllCacheStats(): void {
  getLyricsCache().clearStats();
  getCoverCache().clearStats();
  getPlatformCache().clearStats();
  getBinaryCache().clearStats();
  getSongMetadataCache().clearStats();
}