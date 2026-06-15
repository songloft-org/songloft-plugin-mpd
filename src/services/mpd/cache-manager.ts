/**
 * 高级缓存管理模块
 * 解决内存泄漏问题，提供有界缓存和LRU淘汰策略
 */

import type { TimedCacheEntry } from "./types";

interface CacheItem<T> {
  key: string;
  value: T;
  expiresAt: number;
  size: number;
  lastAccess: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  hitRate?: string;
  totalRequests?: number;
  currentSize?: number;
  maxSize?: number;
}

/**
 * 有界缓存实现
 * 支持LRU淘汰策略和大小限制
 */
export class BoundedCache<T> {
  private cache: Map<string, CacheItem<T>>;
  private accessOrder: string[];
  private maxSize: number;
  private defaultTtl: number;
  private stats: CacheStats;

  constructor(maxSize: number = 1000, defaultTtl: number = 3600000) {
    this.cache = new Map();
    this.accessOrder = [];
    this.maxSize = maxSize;
    this.defaultTtl = defaultTtl;
    this.stats = { hits: 0, misses: 0, sets: 0, evictions: 0 };
  }

  set(key: string, value: T, ttlMs?: number): void {
    // LRU淘汰
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const item: CacheItem<T> = {
      key,
      value,
      expiresAt: Date.now() + (ttlMs || this.defaultTtl),
      size: this.estimateSize(value),
      lastAccess: Date.now()
    };

    this.cache.set(key, item);
    this.updateAccessOrder(key);
    this.stats.sets++;
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) {
      this.stats.misses++;
      return null;
    }

    if (item.expiresAt < Date.now()) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.stats.misses++;
      return null;
    }

    this.updateAccessOrder(key);
    item.lastAccess = Date.now();
    this.stats.hits++;
    return item.value;
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.removeFromAccessOrder(key);
    }
    return deleted;
  }

  async cleanup(): Promise<number> {
    let cleanedCount = 0;
    const now = Date.now();

    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt < now) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder = [];
  }

  size(): number {
    return this.cache.size;
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) + "%" : "0%",
      totalRequests: total,
      currentSize: this.cache.size,
      maxSize: this.maxSize
    };
  }

  private evictLRU(): void {
    if (this.accessOrder.length > 0) {
      const lruKey = this.accessOrder.shift()!;
      this.cache.delete(lruKey);
      this.stats.evictions++;
    }
  }

  private updateAccessOrder(key: string): void {
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
  }

  private removeFromAccessOrder(key: string): void {
    this.accessOrder = this.accessOrder.filter(k => k !== key);
  }

  private estimateSize(value: T): number {
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      return 1024;
    }
  }
}

/**
 * 缓存管理器
 * 统一管理所有缓存实例
 */
export class CacheManager {
  private static instance: CacheManager;
  private caches: Map<string, BoundedCache<any>>;

  private constructor() {
    this.caches = new Map();
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  register<T>(
    name: string,
    maxSize: number = 1000,
    ttlMs: number = 3600000
  ): BoundedCache<T> {
    if (!this.caches.has(name)) {
      this.caches.set(name, new BoundedCache<T>(maxSize, ttlMs));
    }
    return this.caches.get(name)!;
  }

  async cleanup(): Promise<number> {
    let totalCleaned = 0;
    for (const cache of this.caches.values()) {
      totalCleaned += await cache.cleanup();
    }
    return totalCleaned;
  }

  async clear(): Promise<void> {
    for (const cache of this.caches.values()) {
      await cache.clear();
    }
  }

  getStats(): Record<string, CacheStats> {
    const stats: Record<string, CacheStats> = {};
    for (const [name, cache] of this.caches.entries()) {
      stats[name] = cache.getStats();
    }
    return stats;
  }
}

// 兼容性函数：保持原有API不变
export function readTimedCache<T>(entry: TimedCacheEntry<T> | null | undefined): T | null {
  if (!entry) {
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    return null;
  }
  return entry.value;
}

export function writeTimedCache<T>(value: T, ttlMs: number): TimedCacheEntry<T> {
  return {
    value,
    expiresAt: Date.now() + ttlMs
  };
}