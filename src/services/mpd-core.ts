type CommandExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type SongRecord = {
  id: number | string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  file_path?: string;
  filePath?: string;
  url?: string;
  lyric?: string;
  lyrics?: string;
  lrc?: string;
  lyric_text?: string;
  lyrics_text?: string;
  rawLyrics?: string;
  raw_lyrics?: string;
};

type SongloftCommandApi = {
  plugin: {
    getHostUrl(): Promise<string>;
    getToken(): Promise<string>;
  };
  command: {
    exec(program: string, args?: string[], options?: {
      timeout?: number;
      stdin?: string;
      env?: Record<string, string>;
    }): Promise<CommandExecResult>;
    start(name: string, program: string, args?: string[], options?: {
      env?: Record<string, string>;
    }): Promise<{ pid: number }>;
    download(url: string, filename: string, options?: {
      extract?: "tgz";
      extractTarget?: string;
    }): Promise<void>;
    deleteBin(filename: string): Promise<void>;
    listBin(): Promise<string[]>;
    exists(filename: string): Promise<boolean>;
    stop(name: string): Promise<void>;
    isRunning(name: string): Promise<boolean>;
  };
  fs: {
    exists(path: string): Promise<boolean>;
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
    writeFile(path: string, data: string, options?: { encoding?: "utf8" | "base64" }): Promise<void>;
    readFile(path: string, options?: { encoding?: "utf8" | "base64" }): Promise<string>;
  };
  songs: {
    list(options?: { limit?: number; offset?: number }): Promise<SongRecord[] | null | undefined>;
    getById(id: number | string): Promise<SongRecord | null | undefined>;
    search(keyword: string): Promise<SongRecord[] | null | undefined>;
  };
  storage: {
    get(key: string): Promise<string | null | undefined>;
    set(key: string, value: string): Promise<void>;
  };
  log: {
    warn(message: string): void;
    error(message: string): void;
  };
};

export type MpdRuntimePayload = {
  serviceStatus: string;
  managedByPlugin: boolean;
  mpdAvailable: boolean;
  mpcAvailable: boolean;
  configExists: boolean;
  configPath: string;
  logPath: string;
  mode: string;
  audioPreferences: AudioPreferencePayload;
  audioGuidance: AudioGuidancePayload;
  notes: string[];
};

export type MpdPlatformPayload = {
  os: string;
  arch: string;
  libc: string;
  platformKey: string;
  supported: boolean;
  notes: string[];
};

export type BinaryItemStatus = {
  kind: "mpd" | "mpc";
  pluginBinExists: boolean;
  executableAvailable: boolean;
  source: string;
  filename: string;
};

export type MpdBinaryPayload = {
  platform: MpdPlatformPayload;
  binFiles: string[];
  mpd: BinaryItemStatus;
  mpc: BinaryItemStatus;
  managedDownload: {
    platformKey: string;
    url: string;
    configured: boolean;
  };
  notes: string[];
};

export type PlayerStatePayload = {
  serviceStatus: string;
  playbackStatus: string;
  managedByPlugin: boolean;
  mpdAvailable: boolean;
  mpcAvailable: boolean;
  currentSong: {
    songId: string | null;
    title: string;
    artist: string;
    album: string;
  } | null;
  volume: number | null;
  mode: {
    repeat: boolean;
    random: boolean;
    single: boolean;
    consume: boolean;
  };
  progress: {
    currentSeconds: number;
    totalSeconds: number;
    currentLabel: string;
    totalLabel: string;
    sampledAt: number;
  };
  lyrics: {
    source: string;
    available: boolean;
    lines: Array<{
      timeSeconds: number;
      text: string;
    }>;
  };
  raw: {
    current: string;
    status: string;
  };
};

export type QueueItemPayload = {
  queueId: string;
  position: number;
  title: string;
  artist: string;
  album: string;
  durationLabel: string;
  isCurrent: boolean;
};

export type QueuePayload = {
  total: number;
  currentPosition: number | null;
  items: QueueItemPayload[];
};

export type AudioPreferencePayload = {
  outputType: "auto" | "pulse" | "alsa" | "pipewire" | "null";
  xdgRuntimeDir: string;
  pulseServer: string;
  pipewireRemote: string;
  alsaDevice: string;
  hasOverrides: boolean;
};

export type AudioDeviceOptionPayload = {
  value: string;
  label: string;
  description: string;
  transport: "analog" | "hdmi" | "other";
  recommended: boolean;
};

export type AudioGuidancePayload = {
  summary: string;
  hints: string[];
  recommendedOutputType: AudioPreferencePayload["outputType"];
  recommendedOutputLabel: string;
  recommendedAlsaDevice: string;
  recommendedAlsaLabel: string;
  alsaDeviceOptions: AudioDeviceOptionPayload[];
};

type ParsedStatusLine = {
  playbackStatus: string;
  currentSeconds: number;
  totalSeconds: number;
};

const MPD_PROCESS_NAME = "mpd-player-daemon";
const MPD_RUNTIME_DIR = ".";
const MPD_PLAYLIST_DIR = ".";
const MPD_LOG_DIR = ".";
const MPD_BIN_DIR = "bin";
const MPD_CONFIG_PATH = "mpd.conf";
const MPD_LOG_PATH = "mpd.log";
const MPD_PID_PATH = "mpd.pid";
const MPD_STATE_PATH = "mpd.state";
const MPD_STICKER_PATH = "mpd.sticker.sql";
const STORAGE_ACTIVE_SONG_SNAPSHOT = "player:active-song-snapshot";
const STORAGE_QUEUE_METADATA_SNAPSHOT = "player:queue-metadata-snapshot";
const STORAGE_AUDIO_OUTPUT_SNAPSHOT = "player:audio-output-snapshot";
const STORAGE_RUNTIME_FILES_SNAPSHOT = "player:runtime-files-snapshot";
const STORAGE_AUDIO_OUTPUT_TYPE = "mpd:audio:output-type";
const STORAGE_AUDIO_XDG_RUNTIME_DIR = "mpd:audio:xdg-runtime-dir";
const STORAGE_AUDIO_PULSE_SERVER = "mpd:audio:pulse-server";
const STORAGE_AUDIO_PIPEWIRE_REMOTE = "mpd:audio:pipewire-remote";
const STORAGE_AUDIO_ALSA_DEVICE = "mpd:audio:alsa-device";
const SONG_TARGET_METADATA_CACHE_TTL_MS = 300000; // 5分钟（从60秒延长）

// ===== v1.0.8优化：性能监控系统 =====
interface PerformanceMetrics {
  operationCount: Map<string, number>;
  totalLatency: Map<string, number>;
  cacheHits: Map<string, number>;
  cacheMisses: Map<string, number>;
  lastUpdated: number;
}

const performanceMetrics: PerformanceMetrics = {
  operationCount: new Map(),
  totalLatency: new Map(),
  cacheHits: new Map(),
  cacheMisses: new Map(),
  lastUpdated: Date.now()
};

const PERFORMANCE_CONFIG = {
  MAX_SAMPLES: 100,
  ENABLED: true,
  LOG_INTERVAL_MS: 60000 // 每分钟记录一次
};

function recordMetrics(operation: string, latency: number, cacheHit: boolean): void {
  if (!PERFORMANCE_CONFIG.ENABLED) return;

  // 操作次数
  const currentCount = performanceMetrics.operationCount.get(operation) || 0;
  performanceMetrics.operationCount.set(operation, currentCount + 1);

  // 总延迟
  const currentLatency = performanceMetrics.totalLatency.get(operation) || 0;
  performanceMetrics.totalLatency.set(operation, currentLatency + latency);

  // 缓存命中/未命中
  if (cacheHit) {
    const hits = performanceMetrics.cacheHits.get(operation) || 0;
    performanceMetrics.cacheHits.set(operation, hits + 1);
  } else {
    const misses = performanceMetrics.cacheMisses.get(operation) || 0;
    performanceMetrics.cacheMisses.set(operation, misses + 1);
  }

  performanceMetrics.lastUpdated = Date.now();
}

function getPerformanceReport(): Record<string, any> {
  const report: Record<string, any> = {
    timestamp: new Date().toISOString(),
    lastUpdated: new Date(performanceMetrics.lastUpdated).toISOString(),
    operations: {}
  };

  for (const operation of performanceMetrics.operationCount.keys()) {
    const count = performanceMetrics.operationCount.get(operation) || 0;
    const totalLatency = performanceMetrics.totalLatency.get(operation) || 0;
    const hits = performanceMetrics.cacheHits.get(operation) || 0;
    const misses = performanceMetrics.cacheMisses.get(operation) || 0;

    const cacheHitRate = hits + misses > 0 ? hits / (hits + misses) : 0;

    report.operations[operation] = {
      count,
      avgLatency: count > 0 ? Math.round(totalLatency / count) : 0,
      totalLatency,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      cacheHitRatePercent: Math.round(cacheHitRate * 100) + '%',
      hits,
      misses
    };
  }

  return report;
}

function resetPerformanceMetrics(): void {
  performanceMetrics.operationCount.clear();
  performanceMetrics.totalLatency.clear();
  performanceMetrics.cacheHits.clear();
  performanceMetrics.cacheMisses.clear();
  performanceMetrics.lastUpdated = Date.now();
}

// ===== v1.0.9优化：预加载机制 =====
type PrefetchStats = {
  queueSize: number;
  isPrefetching: boolean;
  totalPrefetched: number;
  prefetchHits: number;
};

class PrefetchManager {
  private prefetchQueue: Set<string> = new Set();
  private isPrefetching: boolean = false;
  private stats: PrefetchStats = {
    queueSize: 0,
    isPrefetching: false,
    totalPrefetched: 0,
    prefetchHits: 0
  };
  private prefetchCache: Map<string, any> = new Map();
  private readonly PREFETCH_COUNT = 5;
  private readonly CACHE_TTL = 300000; // 5分钟

  async prefetchNextSongs(songloft: SongloftCommandApi, currentQueue: any, currentIndex: number): Promise<void> {
    if (this.isPrefetching || !currentQueue?.items) return;

    this.isPrefetching = true;
    this.stats.isPrefetching = true;

    const nextIndices = [];
    for (let i = 1; i <= this.PREFETCH_COUNT; i++) {
      const nextIndex = currentIndex + i;
      if (nextIndex < currentQueue.items.length) {
        nextIndices.push(nextIndex);
      }
    }

    for (const index of nextIndices) {
      const songId = currentQueue.items[index]?.songId;
      if (songId && !this.prefetchQueue.has(songId)) {
        this.prefetchQueue.add(songId);
        this.stats.queueSize = this.prefetchQueue.size;

        try {
          await this.prefetchSong(songloft, songId);
        } catch (error) {
          // 预加载失败不影响主流程
        } finally {
          this.prefetchQueue.delete(songId);
          this.stats.queueSize = this.prefetchQueue.size;
        }
      }
    }

    this.isPrefetching = false;
    this.stats.isPrefetching = false;
  }

  private async prefetchSong(songloft: SongloftCommandApi, songId: string): Promise<void> {
    const numericId = toNumericId(songId);
    if (numericId === null) return;

    const song = await songloft.songs.getById(numericId);
    if (!song) return;

    // 预加载URL解析
    const target = await resolvePlayableTarget(songloft, song);

    // 缓存预加载结果
    this.prefetchCache.set(songId, {
      song,
      target,
      timestamp: Date.now()
    });

    this.stats.totalPrefetched++;
  }

  getPrefetchedSong(songId: string): { song: any; target: string } | null {
    const cached = this.prefetchCache.get(songId);
    if (!cached) return null;

    // 检查缓存是否过期
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.prefetchCache.delete(songId);
      return null;
    }

    this.stats.prefetchHits++;
    return {
      song: cached.song,
      target: cached.target
    };
  }

  getStats(): PrefetchStats {
    return { ...this.stats };
  }

  clearCache(): void {
    this.prefetchCache.clear();
    this.stats.totalPrefetched = 0;
    this.stats.prefetchHits = 0;
  }
}

const prefetchManager = new PrefetchManager();

// ===== v1.0.9优化：连接池优化 =====
interface ConnectionPoolEntry {
  connection: any;
  lastUsed: number;
  inUse: boolean;
  pid: number | null;
}

class ConnectionPool {
  private pool: Map<string, ConnectionPoolEntry> = new Map();
  private maxPoolSize: number = 5;
  private idleTimeout: number = 60000; // 60秒空闲超时
  private stats = {
    created: 0,
    reused: 0,
    closed: 0,
    active: 0,
    idle: 0
  };

  async getConnection(key: string, songloft: SongloftCommandApi): Promise<any> {
    const now = Date.now();

    // 清理空闲连接
    this.cleanupIdleConnections(now);

    // 查找可用连接
    for (const [poolKey, entry] of this.pool.entries()) {
      if (!entry.inUse && entry.pid !== null) {
        // 检查进程是否仍在运行
        const isRunning = await songloft.command.isRunning(MPD_PROCESS_NAME).catch(() => false);
        if (isRunning && (now - entry.lastUsed) < this.idleTimeout) {
          entry.inUse = true;
          this.stats.reused++;
          this.updateStats();
          return entry.connection;
        }
      }
    }

    // 创建新连接
    if (this.pool.size < this.maxPoolSize) {
      const newConnection = await this.createConnection(key, songloft);
      this.pool.set(key, {
        connection: newConnection,
        lastUsed: now,
        inUse: true,
        pid: Date.now()
      });
      this.stats.created++;
      this.updateStats();
      return newConnection;
    }

    // 使用最旧的空闲连接
    return this.getOldestConnection();
  }

  releaseConnection(key: string): void {
    const entry = this.pool.get(key);
    if (entry) {
      entry.inUse = false;
      entry.lastUsed = Date.now();
      this.updateStats();
    }
  }

  private async createConnection(key: string, songloft: SongloftCommandApi): Promise<any> {
    // 这里返回一个占位符，实际连接管理在底层实现
    return { key, created: Date.now() };
  }

  private getOldestConnection(): any {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.pool.entries()) {
      if (!entry.inUse && entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.pool.get(oldestKey)!;
      entry.inUse = true;
      this.stats.reused++;
      this.updateStats();
      return entry.connection;
    }

    return null;
  }

  private cleanupIdleConnections(now: number): void {
    const toDelete: string[] = [];

    for (const [key, entry] of this.pool.entries()) {
      if (!entry.inUse && (now - entry.lastUsed) > this.idleTimeout) {
        toDelete.push(key);
      }
    }

    toDelete.forEach(key => {
      this.pool.delete(key);
      this.stats.closed++;
    });

    if (toDelete.length > 0) {
      this.updateStats();
    }
  }

  private updateStats(): void {
    this.stats.active = Array.from(this.pool.values()).filter(e => e.inUse).length;
    this.stats.idle = Array.from(this.pool.values()).filter(e => !e.inUse).length;
  }

  getStats() {
    return {
      ...this.stats,
      poolSize: this.pool.size,
      maxPoolSize: this.maxPoolSize
    };
  }

  clear(): void {
    this.pool.clear();
    this.stats = {
      created: 0,
      reused: 0,
      closed: 0,
      active: 0,
      idle: 0
    };
  }
}

const connectionPool = new ConnectionPool();

// ===== v1.0.9优化：动态并发控制 =====
class DynamicConcurrencyController {
  private currentConcurrency: number = 2;
  private targetLatency: number = 100; // 目标延迟100ms
  private minConcurrency: number = 2;
  private maxConcurrency: number = 5;
  private recentLatencies: number[] = [];
  private readonly maxLatencySamples = 10;
  private stats = {
    currentConcurrency: 2,
    adjustments: 0,
    avgLatency: 0
  };

  getCurrentConcurrency(): number {
    return this.currentConcurrency;
  }

  updateLatency(latency: number): void {
    // 记录最近的延迟
    this.recentLatencies.push(latency);
    if (this.recentLatencies.length > this.maxLatencySamples) {
      this.recentLatencies.shift();
    }

    // 计算平均延迟
    const avgLatency = this.recentLatencies.reduce((a, b) => a + b, 0) / this.recentLatencies.length;
    this.stats.avgLatency = Math.round(avgLatency);

    // 动态调整并发数
    if (avgLatency < this.targetLatency) {
      // 延迟低，增加并发
      if (this.currentConcurrency < this.maxConcurrency) {
        this.currentConcurrency++;
        this.stats.adjustments++;
        this.stats.currentConcurrency = this.currentConcurrency;
      }
    } else if (avgLatency > this.targetLatency * 2) {
      // 延迟高，减少并发
      if (this.currentConcurrency > this.minConcurrency) {
        this.currentConcurrency--;
        this.stats.adjustments++;
        this.stats.currentConcurrency = this.currentConcurrency;
      }
    }
  }

  getStats() {
    return { ...this.stats };
  }

  reset(): void {
    this.currentConcurrency = this.minConcurrency;
    this.recentLatencies = [];
    this.stats = {
      currentConcurrency: this.currentConcurrency,
      adjustments: 0,
      avgLatency: 0
    };
  }
}

const dynamicConcurrencyController = new DynamicConcurrencyController();

// ===== v1.0.9优化：智能批量大小 =====
class NetworkLatencyMonitor {
  private recentLatencies: number[] = [];
  private readonly maxSamples = 20;
  private stats = {
    avgLatency: 0,
    minLatency: 0,
    maxLatency: 0,
    samples: 0
  };

  recordLatency(latency: number): void {
    this.recentLatencies.push(latency);
    this.stats.samples++;

    if (this.recentLatencies.length > this.maxSamples) {
      this.recentLatencies.shift();
    }

    this.updateStats();
  }

  private updateStats(): void {
    if (this.recentLatencies.length === 0) return;

    const sum = this.recentLatencies.reduce((a, b) => a + b, 0);
    this.stats.avgLatency = Math.round(sum / this.recentLatencies.length);
    this.stats.minLatency = Math.round(Math.min(...this.recentLatencies));
    this.stats.maxLatency = Math.round(Math.max(...this.recentLatencies));
  }

  getAverageLatency(): number {
    return this.stats.avgLatency;
  }

  calculateOptimalBatchSize(totalSongs: number): number {
    let batchSize = BATCH_CONFIG.DEFAULT_BATCH_SIZE;
    const avgLatency = this.getAverageLatency();

    // 根据网络延迟调整
    if (avgLatency > 1000) {
      // 网络慢，减小批量
      batchSize = Math.max(10, batchSize - 10);
    } else if (avgLatency < 100) {
      // 网络快，增大批量
      batchSize = Math.min(50, batchSize + 10);
    }

    // 根据歌曲数量调整
    if (totalSongs > 1000) {
      batchSize = Math.max(20, Math.min(50, Math.floor(totalSongs / 20)));
    }

    // 确保批量大小在合理范围内
    return Math.max(10, Math.min(BATCH_CONFIG.MAX_BATCH_SIZE, batchSize));
  }

  getStats() {
    return { ...this.stats };
  }

  reset(): void {
    this.recentLatencies = [];
    this.stats = {
      avgLatency: 0,
      minLatency: 0,
      maxLatency: 0,
      samples: 0
    };
  }
}

const networkLatencyMonitor = new NetworkLatencyMonitor();

let songTargetMetadataCache: {
  expiresAt: number;
  snapshot: QueueMetadataSnapshot;
} | null = null;

// 队列状态缓存
let queueStateCache: {
  data: any;
  timestamp: number;
  version: number;
} = { data: null, timestamp: 0, version: 0 };

const QUEUE_CACHE_TTL = 5000; // 5秒
let queueVersion = 0;

function incrementQueueVersion(): void {
  queueVersion++;
}

// ===== 中期优化：智能轮询和请求管理配置 =====

// 批量处理配置
const BATCH_CONFIG = {
  DEFAULT_BATCH_SIZE: 30, // 每批处理30首歌曲
  MAX_BATCH_SIZE: 50, // 最大批量大小
  BATCH_DELAY_MS: 200, // 批次间隔200ms
  MAX_CONCURRENT_BATCHES: 3, // 最多3个批次并行
};

// 重试配置
const RETRY_CONFIG = {
  MAX_RETRIES: 2, // 最大重试次数
  INITIAL_DELAY_MS: 500, // 初始延迟
  MAX_DELAY_MS: 5000, // 最大延迟
  EXPONENTIAL_BACKOFF: true, // 指数退避
};

// 请求合并配置
const REQUEST_MERGE_CONFIG = {
  MERGE_WINDOW_MS: 100, // 合并窗口100ms
  MAX_QUEUE_SIZE: 50, // 最大队列大小
};

// 轮询状态管理
type PollingState = {
  isNavigating: boolean;
  isBatchProcessing: boolean;
  lastActivity: number;
  requestCount: number;
  errorCount: number;
  lastErrorDecay: number;
};

let pollingState: PollingState = {
  isNavigating: false,
  isBatchProcessing: false,
  lastActivity: Date.now(),
  requestCount: 0,
  errorCount: 0,
  lastErrorDecay: Date.now(),
};

// 请求合并队列
type PendingRequest = {
  id: string;
  type: string;
  params: any;
  timestamp: number;
  resolve: (value: any) => void;
  reject: (error: any) => void;
};

let requestQueue: PendingRequest[] = [];
let mergeTimer: NodeJS.Timeout | null = null;

// ===== 重试机制 =====

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries: number = RETRY_CONFIG.MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  let delay = RETRY_CONFIG.INITIAL_DELAY_MS;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      pollingState.errorCount++;

      if (attempt === maxRetries) {
        songloft.log.warn(`[${context}] Retry failed after ${maxRetries} attempts: ${String(error)}`);
        throw error;
      }

      const delayStr = `${delay}ms`;
      songloft.log.warn(`[${context}] Attempt ${attempt + 1} failed, retrying in ${delayStr}: ${String(error)}`);

      await new Promise(resolve => setTimeout(resolve, delay));

      if (RETRY_CONFIG.EXPONENTIAL_BACKOFF) {
        delay = Math.min(delay * 2, RETRY_CONFIG.MAX_DELAY_MS);
      }
    }
  }

  throw lastError;
}

// ===== 请求合并器 =====

function mergeRequests(requests: PendingRequest[]): Map<string, PendingRequest[]> {
  const merged = new Map<string, PendingRequest[]>();

  for (const request of requests) {
    const key = `${request.type}:${JSON.stringify(request.params)}`;
    if (!merged.has(key)) {
      merged.set(key, []);
    }
    merged.get(key)!.push(request);
  }

  return merged;
}

async function processRequestQueue(): Promise<void> {
  if (requestQueue.length === 0) {
    return;
  }

  const currentQueue = requestQueue.splice(0);
  const merged = mergeRequests(currentQueue);

  for (const [key, requests] of merged.entries()) {
    const primaryRequest = requests[0];
    try {
      // 这里应该根据请求类型调用相应的处理函数
      // 由于这是一个简化版本，我们暂时只记录日志
      songloft.log.info(`Processing merged request: ${key}, count: ${requests.length}`);
    } catch (error) {
      songloft.log.error(`Failed to process merged request: ${String(error)}`);
      requests.forEach(req => req.reject(error));
    }
  }
}

function scheduleRequestProcessing(): void {
  if (mergeTimer) {
    clearTimeout(mergeTimer);
  }

  mergeTimer = setTimeout(() => {
    processRequestQueue();
    mergeTimer = null;
  }, REQUEST_MERGE_CONFIG.MERGE_WINDOW_MS);
}

// 批量处理辅助函数
async function processBatch<T>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<void>,
  batchDelay: number = BATCH_CONFIG.BATCH_DELAY_MS
): Promise<void> {
  const batches: T[][] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  pollingState.isBatchProcessing = true;

  try {
    for (let i = 0; i < batches.length; i += BATCH_CONFIG.MAX_CONCURRENT_BATCHES) {
      const batchGroup = batches.slice(i, i + BATCH_CONFIG.MAX_CONCURRENT_BATCHES);

      await Promise.all(batchGroup.map(batch => processor(batch)));

      if (i + BATCH_CONFIG.MAX_CONCURRENT_BATCHES < batches.length) {
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }
  } finally {
    pollingState.isBatchProcessing = false;
  }
}

// ===== v1.0.8优化：错误计数衰减机制 =====
function decayErrorCount(): void {
  if (pollingState.errorCount > 0) {
    const now = Date.now();
    const timeSinceLastDecay = now - pollingState.lastErrorDecay;

    if (timeSinceLastDecay > 30000) {
      const decayAmount = Math.floor(timeSinceLastDecay / 30000);
      pollingState.errorCount = Math.max(0, pollingState.errorCount - decayAmount);
      pollingState.lastErrorDecay = now;
    }
  }
}

// 智能轮询间隔计算
function getOptimalPollingInterval(): number {
  // v1.0.8优化：先衰减错误计数
  decayErrorCount();

  const idleThreshold = 30000; // 30秒无活动

  if (pollingState.isNavigating) {
    return 10000; // 导航时降低到10秒
  }

  if (pollingState.isBatchProcessing) {
    return 5000; // 批量处理时降低到5秒
  }

  const timeSinceLastActivity = Date.now() - pollingState.lastActivity;
  if (timeSinceLastActivity > idleThreshold) {
    return 10000; // 长时间无活动，降低到10秒
  }

  if (pollingState.errorCount > 5) {
    return 5000; // 错误较多时降低到5秒
  }

  return 2500; // 默认2.5秒
}

// ===== v1.0.8优化：LRU缓存系统 =====
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private capacity: number;

  constructor(capacity: number) {
    this.cache = new Map();
    this.capacity = capacity;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;

    // 重新插入以更新访问顺序（Map会保持插入顺序）
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // 删除最旧的项（第一个键）
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  getStats(): { size: number; capacity: number } {
    return {
      size: this.cache.size,
      capacity: this.capacity
    };
  }
}

// URL解析缓存（使用LRU优化）
const URL_CACHE_TTL = 3600000; // 1小时
const URL_CACHE_CAPACITY = 1000; // 最大缓存1000个URL
const urlCache = new LRUCache<string, { url: string; timestamp: number }>(URL_CACHE_CAPACITY);

async function resolvePlayableTargetWithCache(songloft: SongloftCommandApi, song: SongRecord | null | undefined): Promise<string> {
  if (!song) {
    return "";
  }

  const cacheKey = `${song.id}_${song.url}_${song.file_path || ""}`;
  const cached = urlCache.get(cacheKey);

  // 检查缓存
  if (cached && (Date.now() - cached.timestamp) < URL_CACHE_TTL) {
    return cached.url;
  }

  // 原有逻辑解析URL
  let target = "";

  if (typeof song.url === "string" && isDirectPlayableUrl(song.url)) {
    target = song.url.trim();
  } else if (typeof song.url === "string" && song.url.trim()) {
    target = await buildSongloftAbsoluteUrl(songloft, song.url) || "";
  } else {
    const localPath = getSongLocalPath(song);
    if (localPath) {
      target = await buildSongloftHostedFileUrl(songloft, localPath) || "";
    }
  }

  // 更新缓存（LRU自动管理大小）
  if (target) {
    urlCache.set(cacheKey, { url: target, timestamp: Date.now() });
  }

  return target;
}

function cleanupUrlCache(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  // 遍历当前缓存，删除过期项
  for (const [key, value] of (urlCache as any).cache.entries()) {
    if (now - value.timestamp > URL_CACHE_TTL) {
      keysToDelete.push(key);
    }
  }

  // 批量删除过期项
  keysToDelete.forEach(key => (urlCache as any).cache.delete(key));
}

const MANAGED_BINARY_BUNDLE_URLS: Record<string, string> = {
  "linux-x86_64-glibc": "https://github.com/huaimi123/mympd/releases/download/v1.0.0/mpd-player-linux-x86_64-glibc.tgz",
  "linux-x86_64-musl": "https://github.com/huaimi123/mympd/releases/download/v1.0.0/mpd-player-linux-x86_64-musl.tgz",
  "linux-arm64-glibc": "https://github.com/huaimi123/mympd/releases/download/v1.0.0/mpd-player-linux-arm64-glibc.tgz",
  "linux-arm64-musl": "https://github.com/huaimi123/mympd/releases/download/v1.0.0/mpd-player-linux-arm64-musl.tgz",
  "linux-armv7-glibc": "https://github.com/huaimi123/mympd/releases/download/v1.0.0/mpd-player-linux-armv7-glibc.tgz"
};
const SUPPORTED_MANAGED_PLATFORM_KEYS = [
  "linux-x86_64-glibc",
  "linux-x86_64-musl",
  "linux-arm64-glibc",
  "linux-arm64-musl",
  "linux-armv7-glibc"
] as const;
const SUPPORTED_MANAGED_PLATFORM_TEXT = SUPPORTED_MANAGED_PLATFORM_KEYS.join(" / ");
const MANAGED_UPLOAD_ARCHIVE_TGZ_PATH = "upload-managed-bundle.tgz";
const MANAGED_DOWNLOAD_ARCHIVE_TGZ_PATH = "download-managed-bundle.tgz";
const MANAGED_BUNDLE_BACKUP_DIR = ".managed-bundle-backup";
const MANAGED_BUNDLE_STAGING_DIR = ".managed-bundle-staging";
const MANAGED_BUNDLE_TARGETS = ["mpd", "mpc", "mpd.real", "mpc.real", "lib"] as const;
const PLATFORM_CACHE_TTL_MS = 300000; // 5分钟（从10秒延长）
const RESOLVED_BINARY_CACHE_TTL_MS = 600000; // 10分钟（从5秒延长）
const COMMON_SYSTEM_BIN_DIRS = [
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/local/sbin",
  "/usr/sbin",
  "/sbin",
  "/snap/bin"
];
let platformCacheEntry: TimedCacheEntry<MpdPlatformPayload> | null = null;
const resolvedBinaryCache: Partial<Record<"mpd" | "mpc", TimedCacheEntry<ResolvedBinary>>> = {};

type ActiveSongSnapshot = {
  songId: string;
  title: string;
  artist: string;
  album: string;
  target: string;
};

type AudioOutputSnapshot = {
  selectedType: string;
  selectedName: string;
  notes: string[];
};

type QueueMetadataItem = {
  title: string;
  artist: string;
  album: string;
};

type QueueMetadataSnapshot = Record<string, QueueMetadataItem>;

type ParsedQueuePlaylistLine = {
  position: number;
  artist: string;
  title: string;
  album: string;
  durationLabel: string;
  target: string;
};

type SongMatchResult = {
  song: SongRecord | null;
  source: string;
};

type ResolvedBinary = {
  program: string;
  source: string;
  exists: boolean;
  executableAvailable: boolean;
  filename: string;
  launchMode: "direct" | "shell";
};

type RuntimeFilesSnapshot = {
  rootDir: string;
  configPath: string;
  logPath: string;
  pidPath: string;
  statePath: string;
  stickerPath: string;
  playlistDir: string;
};

type ManagedArchiveFormat = "tgz";

type MpdAudioOutputCandidate = {
  type: "pipewire" | "pulse" | "alsa" | "null";
  name: string;
  lines: string[];
  reason: string;
};

type MpdAudioOutputDetection = {
  selected: MpdAudioOutputCandidate;
  candidates: MpdAudioOutputCandidate[];
  supportedTypes: string[];
  notes: string[];
  env: Record<string, string>;
  preferences: AudioPreferencePayload;
  guidance: AudioGuidancePayload;
};

type DetectedAlsaDeviceInfo = {
  card: number;
  device: number;
  value: string;
  label: string;
  description: string;
  transport: "analog" | "hdmi" | "other";
};

type TimedCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

function shellQuote(value: string): string {
  return "'" + String(value).replace(/'/g, "'\"'\"'") + "'";
}

function readTimedCache<T>(entry: TimedCacheEntry<T> | null | undefined): T | null {
  if (!entry || entry.expiresAt <= Date.now()) {
    return null;
  }
  return entry.value;
}

function writeTimedCache<T>(value: T, ttlMs: number): TimedCacheEntry<T> {
  return {
    value,
    expiresAt: Date.now() + ttlMs
  };
}

function getAudioOutputCandidatePriority(type: MpdAudioOutputCandidate["type"]): number {
  switch (type) {
    case "pipewire":
      return 0;
    case "pulse":
      return 1;
    case "alsa":
      return 2;
    case "null":
    default:
      return 3;
  }
}

function selectPreferredAudioOutput(
  candidates: MpdAudioOutputCandidate[],
  notes: string[]
): MpdAudioOutputCandidate {
  const sorted = [...candidates].sort((left, right) => {
    return getAudioOutputCandidatePriority(left.type) - getAudioOutputCandidatePriority(right.type);
  });
  const selected = sorted[0];

  if (sorted.some((candidate) => candidate.type === "pulse") && sorted.some((candidate) => candidate.type === "pipewire")) {
    notes.push("当前同时检测到 PulseAudio 与 PipeWire；蓝牙桌面场景优先尝试 PipeWire，必要时仍可手动切回 PulseAudio");
  }

  return selected;
}

function invalidateResolvedBinaryCache(kind?: "mpd" | "mpc"): void {
  if (kind) {
    delete resolvedBinaryCache[kind];
    return;
  }
  delete resolvedBinaryCache.mpd;
  delete resolvedBinaryCache.mpc;
}

function buildShellExecScript(program: string, args: string[]): string {
  return "exec " + [program, ...args].map(shellQuote).join(" ");
}

function toNumericId(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseCurrentLine(currentLine: string) {
  const trimmed = currentLine.trim();
  if (!trimmed) {
    return null;
  }

  const separator = trimmed.indexOf(" - ");
  if (separator >= 0) {
    return {
      songId: null,
      title: trimmed.slice(separator + 3).trim() || trimmed,
      artist: trimmed.slice(0, separator).trim() || "未知歌手",
      album: "MPD 当前曲目"
    };
  }

  return {
    songId: null,
    title: trimmed,
    artist: "未知歌手",
    album: "MPD 当前曲目"
  };
}

function normalizeCompareText(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function trimTrailingSlash(value: string): string {
  return String(value || "").replace(/\/+$/, "");
}

function encodeSongloftMusicPath(filePath: string): string {
  return String(filePath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function isDirectPlayableUrl(value: string): boolean {
  return /^(https?|file|alsa|nfs|smb):\/\//i.test(String(value || "").trim());
}

function appendAccessTokenToUrl(url: string, accessToken: string): string {
  const trimmedUrl = String(url || "").trim();
  if (!trimmedUrl) {
    return "";
  }
  if (!accessToken) {
    return trimmedUrl;
  }
  return trimmedUrl + (trimmedUrl.includes("?") ? "&" : "?") + `access_token=${encodeURIComponent(accessToken)}`;
}

async function buildSongloftAbsoluteUrl(songloft: SongloftCommandApi, pathOrUrl: string): Promise<string> {
  const trimmed = String(pathOrUrl || "").trim();
  if (!trimmed) {
    return "";
  }
  if (isDirectPlayableUrl(trimmed)) {
    return trimmed;
  }
  const [hostUrl, accessToken] = await Promise.all([
    songloft.plugin.getHostUrl().catch(() => ""),
    songloft.plugin.getToken().catch(() => "")
  ]);
  const normalizedHostUrl = trimTrailingSlash(hostUrl);
  if (!normalizedHostUrl) {
    return "";
  }

  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return appendAccessTokenToUrl(`${normalizedHostUrl}${normalizedPath}`, accessToken);
}

async function buildSongloftHostedFileUrl(songloft: SongloftCommandApi, filePath: string): Promise<string> {
  const encodedPath = encodeSongloftMusicPath(filePath);
  if (!encodedPath) {
    return "";
  }
  return buildSongloftAbsoluteUrl(songloft, `/music/${encodedPath}`);
}

async function readActiveSongSnapshot(songloft: SongloftCommandApi): Promise<ActiveSongSnapshot | null> {
  try {
    const raw = await songloft.storage.get(STORAGE_ACTIVE_SONG_SNAPSHOT);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as ActiveSongSnapshot;
  } catch {
    return null;
  }
}

async function writeActiveSongSnapshot(songloft: SongloftCommandApi, snapshot: ActiveSongSnapshot | null) {
  await songloft.storage.set(STORAGE_ACTIVE_SONG_SNAPSHOT, snapshot ? JSON.stringify(snapshot) : "");
}

async function readQueueMetadataSnapshot(songloft: SongloftCommandApi): Promise<QueueMetadataSnapshot> {
  try {
    const raw = await songloft.storage.get(STORAGE_QUEUE_METADATA_SNAPSHOT);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as QueueMetadataSnapshot;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeQueueMetadataSnapshot(songloft: SongloftCommandApi, snapshot: QueueMetadataSnapshot) {
  await songloft.storage.set(
    STORAGE_QUEUE_METADATA_SNAPSHOT,
    snapshot && Object.keys(snapshot).length ? JSON.stringify(snapshot) : ""
  );
}

function createQueueMetadataItem(song: SongRecord | null | undefined): QueueMetadataItem {
  return {
    title: typeof song?.title === "string" && song.title.trim() ? song.title.trim() : "未知标题",
    artist: typeof song?.artist === "string" && song.artist.trim() ? song.artist.trim() : "未知歌手",
    album: typeof song?.album === "string" && song.album.trim() ? song.album.trim() : "未知专辑"
  };
}

function cloneQueueMetadataItem(item: QueueMetadataItem | null | undefined): QueueMetadataItem | null {
  if (!item) {
    return null;
  }
  return {
    title: String(item.title || "").trim() || "未知标题",
    artist: String(item.artist || "").trim() || "未知歌手",
    album: String(item.album || "").trim() || "未知专辑"
  };
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeQueueMetadataKey(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  if (/^(https?|file):\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      parsed.hash = "";
      parsed.searchParams.delete("access_token");
      return parsed.toString();
    } catch {
      return trimmed;
    }
  }

  return trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
}

function extractSongloftMusicPathFromTarget(value: string): string {
  const normalized = normalizeQueueMetadataKey(value);
  if (!/^(https?|file):\/\//i.test(normalized)) {
    return "";
  }

  try {
    const parsed = new URL(normalized);
    const match = parsed.pathname.match(/\/music\/(.+)$/i);
    if (!match) {
      return "";
    }
    return match[1]
      .split("/")
      .filter(Boolean)
      .map((segment) => safeDecodeURIComponent(segment))
      .join("/");
  } catch {
    return "";
  }
}

function getQueueMetadataLookupKeys(value: string): string[] {
  const raw = String(value || "").trim();
  const normalized = normalizeQueueMetadataKey(raw);
  const decoded = safeDecodeURIComponent(normalized);
  const musicPath = extractSongloftMusicPathFromTarget(raw);
  const pathLike = /^(https?|file):\/\//i.test(decoded) ? "" : decoded.replace(/\\/g, "/").replace(/^\/+/, "");
  const keys = [raw, normalized, decoded, musicPath, pathLike];
  const unique: string[] = [];

  for (const item of keys) {
    const candidate = String(item || "").trim();
    if (!candidate || unique.includes(candidate)) {
      continue;
    }
    unique.push(candidate);
  }

  return unique;
}

function getSongLocalPath(song: SongRecord | null | undefined): string {
  if (typeof song?.file_path === "string" && song.file_path.trim()) {
    return song.file_path.trim();
  }
  if (typeof song?.filePath === "string" && song.filePath.trim()) {
    return song.filePath.trim();
  }
  return "";
}

function setQueueMetadataForTarget(
  snapshot: QueueMetadataSnapshot,
  target: string,
  item: QueueMetadataItem | null | undefined
) {
  const normalizedItem = cloneQueueMetadataItem(item);
  if (!normalizedItem) {
    return;
  }
  for (const key of getQueueMetadataLookupKeys(target)) {
    snapshot[key] = normalizedItem;
  }
}

function setQueueMetadataForSong(
  snapshot: QueueMetadataSnapshot,
  song: SongRecord | null | undefined,
  resolvedTarget?: string
) {
  const item = createQueueMetadataItem(song);
  const target = String(resolvedTarget || "").trim();
  if (target) {
    setQueueMetadataForTarget(snapshot, target, item);
  }

  const localPath = getSongLocalPath(song);
  if (localPath) {
    setQueueMetadataForTarget(snapshot, localPath, item);
  }

  if (typeof song?.url === "string" && song.url.trim()) {
    setQueueMetadataForTarget(snapshot, song.url.trim(), item);
  }
}

function findQueueMetadataItem(queueMetadata: QueueMetadataSnapshot, target: string): QueueMetadataItem | undefined {
  for (const key of getQueueMetadataLookupKeys(target)) {
    const candidate = cloneQueueMetadataItem(queueMetadata[key]);
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

async function listAllSongsForQueueMetadata(songloft: SongloftCommandApi): Promise<SongRecord[]> {
  const songs: SongRecord[] = [];
  const pageSize = 200;

  for (let offset = 0; offset < 10_000; offset += pageSize) {
    const page = await songloft.songs.list({ limit: pageSize, offset }).catch(() => []);
    const items = Array.isArray(page) ? page : [];
    if (!items.length) {
      break;
    }
    songs.push(...items);
    if (items.length < pageSize) {
      break;
    }
  }

  return songs;
}

async function buildSongTargetMetadataSnapshot(songloft: SongloftCommandApi): Promise<QueueMetadataSnapshot> {
  const songs = await listAllSongsForQueueMetadata(songloft);
  const snapshot: QueueMetadataSnapshot = {};

  for (const song of songs) {
    const target = await resolvePlayableTarget(songloft, song).catch(() => "");
    setQueueMetadataForSong(snapshot, song, target);
  }

  return snapshot;
}

async function getSongTargetMetadataSnapshot(songloft: SongloftCommandApi): Promise<QueueMetadataSnapshot> {
  if (songTargetMetadataCache && songTargetMetadataCache.expiresAt > Date.now()) {
    return songTargetMetadataCache.snapshot;
  }

  const snapshot = await buildSongTargetMetadataSnapshot(songloft);
  songTargetMetadataCache = {
    expiresAt: Date.now() + SONG_TARGET_METADATA_CACHE_TTL_MS,
    snapshot
  };
  return snapshot;
}

function sanitizePlaybackProbeText(value: string | null | undefined): string {
  return String(value || "")
    .replace(/access_token=[^&\s]+/gi, "access_token=<redacted>")
    .trim();
}

function getPulseUnixSocketPath(server: string): string {
  const normalized = String(server || "").trim();
  if (!normalized) {
    return "";
  }
  const match = normalized.match(/^unix:(.+)$/i);
  return match ? String(match[1] || "").trim() : "";
}

function currentSongMatchesSnapshotTarget(
  currentSong: PlayerStatePayload["currentSong"],
  snapshot: ActiveSongSnapshot | null | undefined
): boolean {
  if (!currentSong || !snapshot || !snapshot.target) {
    return false;
  }
  const currentTitle = sanitizePlaybackProbeText(currentSong.title || "");
  const snapshotTarget = sanitizePlaybackProbeText(snapshot.target || "");
  return !!currentTitle && currentTitle === snapshotTarget;
}

function looksLikeLrc(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return /\[\d{1,2}:\d{2}[.:]\d{2,3}\]/.test(text) && text.length > 10;
}

function extractLyricContent(text: string): string {
  if (!text || text.charAt(0) !== "{") return text;
  try {
    let parsed = JSON.parse(text);
    const found = findLyricValue(parsed);
    return found || text;
  } catch {
    return text;
  }
}

function findLyricValue(obj: unknown): string | null {
  if (typeof obj === "string") {
    if (obj.charAt(0) === "{") {
      try {
        const nested = JSON.parse(obj);
        const found = findLyricValue(nested);
        if (found) return found;
      } catch { /* ignore */ }
    }
    if (looksLikeLrc(obj)) return obj;
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const objRecord = obj as Record<string, unknown>;
  for (const key of ["data", "lyric", "lrc", "content", "text"]) {
    if (key in objRecord) {
      const found = findLyricValue(objRecord[key]);
      if (found) return found;
    }
  }
  for (const val of Object.values(objRecord)) {
    const found = findLyricValue(val);
    if (found) return found;
  }
  return null;
}

async function fetchSongLyricsFromApi(songloft: SongloftCommandApi, songId: number | string): Promise<string> {
  try {
    const [hostUrl, accessToken] = await Promise.all([
      songloft.plugin.getHostUrl().catch(() => ""),
      songloft.plugin.getToken().catch(() => "")
    ]);
    if (!hostUrl || !accessToken) {
      return "";
    }

    const numericId = typeof songId === "string" ? parseInt(songId, 10) : songId;
    if (!numericId || isNaN(numericId)) {
      return "";
    }

    const url = `${hostUrl}/api/v1/songs/${numericId}/lyric?access_token=${accessToken}`;
    const response = await fetch(url);
    if (!response.ok) {
      return "";
    }

    return extractLyricContent(await response.text());
  } catch (error) {
    songloft.log.warn("fetchSongLyricsFromApi failed: " + String(error));
    return "";
  }
}

async function fetchSongCoverFromApi(songloft: SongloftCommandApi, songId: number | string): Promise<string> {
  try {
    const [hostUrl, accessToken] = await Promise.all([
      songloft.plugin.getHostUrl().catch(() => ""),
      songloft.plugin.getToken().catch(() => "")
    ]);
    if (!hostUrl || !accessToken) {
      return "";
    }

    const numericId = typeof songId === "string" ? parseInt(songId, 10) : songId;
    if (!numericId || isNaN(numericId)) {
      return "";
    }

    const url = `${hostUrl}/api/v1/songs/${numericId}/cover?access_token=${accessToken}`;
    return url;
  } catch (error) {
    songloft.log.warn("fetchSongCoverFromApi failed: " + String(error));
    return "";
  }
}

async function fetchPlaylistCoverFromApi(songloft: SongloftCommandApi, playlistId: number | string): Promise<string> {
  try {
    const [hostUrl, accessToken] = await Promise.all([
      songloft.plugin.getHostUrl().catch(() => ""),
      songloft.plugin.getToken().catch(() => "")
    ]);
    if (!hostUrl || !accessToken) {
      return "";
    }

    const numericId = typeof playlistId === "string" ? parseInt(playlistId, 10) : playlistId;
    if (!numericId || isNaN(numericId)) {
      return "";
    }

    const url = `${hostUrl}/api/v1/playlists/${numericId}/cover?access_token=${accessToken}`;
    return url;
  } catch (error) {
    songloft.log.warn("fetchPlaylistCoverFromApi failed: " + String(error));
    return "";
  }
}

function readLyricsText(song: SongRecord | null): string {
  if (!song) {
    return "";
  }

  const fields = [
    song.lyrics,
    song.lyric,
    song.lrc,
    song.lyric_text,
    song.lyrics_text,
    song.rawLyrics,
    song.raw_lyrics,
    song.lrc_content,
    song.lyric_content,
    song.text
  ];

  for (const field of fields) {
    if (typeof field === "string" && field.trim()) {
      return field.trim();
    }
  }

  return "";
}

function parseLrc(rawLyrics: string) {
  const parsed: Array<{ timeSeconds: number; text: string }> = [];

  if (!rawLyrics || !rawLyrics.trim()) {
    return parsed;
  }

  const cleaned = rawLyrics.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

  const METADATA_LINE_PATTERNS = [
    /^\[ti:/i,
    /^\[ar:/i,
    /^\[al:/i,
    /^\[by:/i,
    /^\[offset:/i,
    /^\[hash:/i,
    /^\[sign:/i,
    /^\[qq:/i,
    /^\[total:/i,
    /^\[id:/i,
    /^\[re:/i,
    /^\[ve:/i,
  ];

  const METADATA_CONTENT_PATTERNS = [
    /^(词|曲|词曲|作词|作曲|作词作曲|演唱|编曲|制作人|制作人|监制|混音|母带|和声|和声编写|吉他|贝斯|鼓|钢琴|键盘|弦乐|录音|录音室|录音师|制作公司|发行|企划|统筹|出品|OP|SP|SP公司|版权|专辑|歌手|原唱|填词|作曲人|编曲人|制作人|录音|录音室|录音师|制作|后期|后期制作|音乐制作|音乐总监|艺术总监|制作统筹|发行公司|唱片公司|所属专辑|所属唱片)/,
  ];

  for (const rawLine of cleaned.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (METADATA_LINE_PATTERNS.some((p) => p.test(line))) {
      continue;
    }

    const text = line.replace(/\[[^\]]+\]/g, "").trim();
    if (!text) {
      continue;
    }

    if (METADATA_CONTENT_PATTERNS.some((p) => p.test(text))) {
      continue;
    }

    const matches = Array.from(line.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{2,3}))?\]/g));

    if (!matches.length) {
      continue;
    }

    for (const match of matches) {
      try {
        const minutes = Number(match[1] || 0);
        const seconds = Number(match[2] || 0);
        let fraction = 0;

        if (match[3]) {
          const msStr = String(match[3]).padEnd(3, "0");
          fraction = Number("0." + msStr);
        }

        const timeSeconds = minutes * 60 + seconds + fraction;

        if (timeSeconds >= 0 && timeSeconds < 7200) {
          parsed.push({
            timeSeconds,
            text: text || "..."
          });
        }
      } catch (error) {
        continue;
      }
    }
  }

  return parsed.sort((a, b) => a.timeSeconds - b.timeSeconds);
}

function deduplicateLyricLines(lines: Array<{ timeSeconds: number; text: string }>) {
  if (lines.length < 2) return lines;
  const result: Array<{ timeSeconds: number; text: string }> = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const last = result[result.length - 1];
    const gap = lines[i].timeSeconds - last.timeSeconds;
    if (gap < 0.2) {
      continue;
    }
    result.push(lines[i]);
  }
  return result;
}

function buildFallbackLyrics(currentSong: PlayerStatePayload["currentSong"]) {
  if (!currentSong) {
    return [];
  }

  const lyrics = [
    { timeSeconds: 0, text: currentSong.title || "未知歌曲" },
    { timeSeconds: 6, text: "歌手: " + (currentSong.artist || "未知歌手") },
    { timeSeconds: 12, text: "专辑: " + (currentSong.album || "未知专辑") }
  ];

  if (currentSong.title || currentSong.artist || currentSong.album) {
    lyrics.push({ timeSeconds: 18, text: "正在播放..." });
  } else {
    lyrics.push({ timeSeconds: 18, text: "暂无歌曲信息" });
  }

  return lyrics;
}

function songMatchesCurrent(song: SongRecord | null | undefined, currentSong: PlayerStatePayload["currentSong"]) {
  if (!song || !currentSong) {
    return false;
  }

  const sameTitle = normalizeCompareText(song.title) === normalizeCompareText(currentSong.title);
  if (!sameTitle) {
    return false;
  }

  const songArtist = normalizeCompareText(song.artist);
  const currentArtist = normalizeCompareText(currentSong.artist);
  return !songArtist || !currentArtist || songArtist === currentArtist;
}

function pickSongFromSearchResults(results: SongRecord[], currentSong: PlayerStatePayload["currentSong"]) {
  if (!currentSong) {
    return null;
  }

  let firstSameTitle: SongRecord | null = null;

  for (const song of results) {
    if (songMatchesCurrent(song, currentSong)) {
      return song;
    }

    if (
      !firstSameTitle &&
      normalizeCompareText(song.title) === normalizeCompareText(currentSong.title)
    ) {
      firstSameTitle = song;
    }
  }

  if (firstSameTitle) {
    return firstSameTitle;
  }

  return results.length === 1 ? results[0] || null : null;
}

async function resolveMatchedSong(
  songloft: SongloftCommandApi,
  currentSong: PlayerStatePayload["currentSong"]
): Promise<SongMatchResult> {
  if (!currentSong) {
    return {
      song: null,
      source: "none"
    };
  }

  const snapshot = await readActiveSongSnapshot(songloft);
  if (snapshot) {
    const snapshotSongId = toNumericId(snapshot.songId);
    if (snapshotSongId !== null) {
      const snapshotSong = await songloft.songs.getById(snapshotSongId);
      if (songMatchesCurrent(snapshotSong, currentSong) || currentSongMatchesSnapshotTarget(currentSong, snapshot)) {
        return {
          song: snapshotSong || null,
          source: "snapshot"
        };
      }
    }
  }

  try {
    const results = await songloft.songs.search(currentSong.title) || [];
    const matched = pickSongFromSearchResults(results, currentSong);
    if (matched) {
      const matchedSongId = toNumericId(matched.id);
      if (matchedSongId !== null) {
        const detailSong = await songloft.songs.getById(matchedSongId);
        if (detailSong && songMatchesCurrent(detailSong, currentSong)) {
          return {
            song: detailSong,
            source: "library-search"
          };
        }
      }

      return {
        song: matched,
        source: "library-search"
      };
    }
  } catch (error) {
    songloft.log.warn("resolveMatchedSong search failed: " + String(error));
  }

  return {
    song: null,
    source: "fallback"
  };
}

function parseStatusLine(line: string): ParsedStatusLine {
  const trimmed = line.trim();
  const playbackMatch = trimmed.match(/\[(playing|paused|stopped)\]/);
  const timeMatch = trimmed.match(/(\d+):(\d+)\/(\d+):(\d+)/);

  const currentSeconds = timeMatch
    ? Number(timeMatch[1]) * 60 + Number(timeMatch[2])
    : 0;
  const totalSeconds = timeMatch
    ? Number(timeMatch[3]) * 60 + Number(timeMatch[4])
    : 0;

  return {
    playbackStatus: playbackMatch ? playbackMatch[1] : "stopped",
    currentSeconds,
    totalSeconds
  };
}

function parseCurrentPosition(line: string): number | null {
  const match = line.trim().match(/#(\d+)\/\d+/);
  return match ? Number(match[1]) : null;
}

function parseOptionLine(line: string) {
  const readToggle = (name: string) => new RegExp(`${name}:\\s*(on|off)`).exec(line)?.[1] === "on";
  const volumeMatch = line.match(/volume:\s*(\d+)%/);

  return {
    volume: volumeMatch ? Number(volumeMatch[1]) : null,
    repeat: readToggle("repeat"),
    random: readToggle("random"),
    single: readToggle("single"),
    consume: readToggle("consume")
  };
}

async function tryExec(
  songloft: SongloftCommandApi,
  program: string,
  args: string[]
): Promise<CommandExecResult | null> {
  try {
    return await songloft.command.exec(program, args, { timeout: 10_000 });
  } catch (error) {
    songloft.log.warn(`${program} ${args.join(" ")} failed: ${String(error)}`);
    return null;
  }
}

async function canExec(songloft: SongloftCommandApi, program: string, args: string[]): Promise<boolean> {
  const result = await tryExec(songloft, program, args);
  return !!result && result.exitCode === 0;
}

function trimToSingleLine(value: string | null | undefined): string {
  return String(value || "")
    .split(/\r?\n/)[0]
    .trim();
}

function extractProbeSection(output: string, key: string): string {
  const normalized = String(output || "");
  const marker = `${key}=`;
  const start = normalized.indexOf(marker);
  if (start < 0) {
    return "";
  }
  const rest = normalized.slice(start + marker.length);
  const nextMatch = rest.match(/\n[A-Z_]+=+/);
  const value = nextMatch ? rest.slice(0, nextMatch.index) : rest;
  return value.trim();
}

function parseRuntimePlaybackDevices(devSndSection: string): Array<{ card: number; device: number }> {
  const matches = Array.from(String(devSndSection || "").matchAll(/pcmC(\d+)D(\d+)p\b/g));
  const seen = new Set<string>();
  const devices: Array<{ card: number; device: number }> = [];
  for (const match of matches) {
    const card = Number(match[1]);
    const device = Number(match[2]);
    if (!Number.isFinite(card) || !Number.isFinite(device)) {
      continue;
    }
    const key = `${card},${device}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    devices.push({ card, device });
  }
  return devices;
}

function buildAlsaDeviceKey(card: number, device: number): string {
  return `${card},${device}`;
}

function parseAlsaHwDevice(value: string): { prefix: "hw" | "plughw"; card: number; device: number } | null {
  const match = String(value || "").trim().match(/^(plughw|hw):(\d+),(\d+)$/i);
  if (!match) {
    return null;
  }
  return {
    prefix: match[1].toLowerCase() === "hw" ? "hw" : "plughw",
    card: Number(match[2]),
    device: Number(match[3])
  };
}

function detectAlsaTransport(labelText: string): "analog" | "hdmi" | "other" {
  const normalized = normalizeCompareText(labelText);
  if (normalized.includes("hdmi")) {
    return "hdmi";
  }
  if (
    normalized.includes("analog") ||
    normalized.includes("speaker") ||
    normalized.includes("headphone") ||
    normalized.includes("headset") ||
    normalized.includes("line out") ||
    normalized.includes("lineout")
  ) {
    return "analog";
  }
  return "other";
}

function describeAlsaTransport(transport: "analog" | "hdmi" | "other"): string {
  switch (transport) {
    case "analog":
      return "更适合有线耳机、内置喇叭或 3.5mm 输出";
    case "hdmi":
      return "更适合显示器、电视或 AV 接收器";
    default:
      return "可作为 ALSA 输出候选，适合在高级模式下手动验证";
  }
}

function getDetectedAlsaDevicePriority(device: DetectedAlsaDeviceInfo): number {
  switch (device.transport) {
    case "analog":
      return 0;
    case "other":
      return 1;
    case "hdmi":
    default:
      return 2;
  }
}

function sortDetectedAlsaDevices(devices: DetectedAlsaDeviceInfo[]): DetectedAlsaDeviceInfo[] {
  return [...devices].sort((left, right) => {
    const priorityDiff = getDetectedAlsaDevicePriority(left) - getDetectedAlsaDevicePriority(right);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    if (left.card !== right.card) {
      return left.card - right.card;
    }
    return left.device - right.device;
  });
}

function buildDetectedAlsaDeviceInfo(
  card: number,
  device: number,
  cardLabel: string,
  deviceLabel: string
): DetectedAlsaDeviceInfo {
  const normalizedDeviceLabel = String(deviceLabel || "").trim() || `播放设备 ${card},${device}`;
  const normalizedCardLabel = String(cardLabel || "").trim();
  const transport = detectAlsaTransport(`${normalizedDeviceLabel} ${normalizedCardLabel}`);
  const descriptionParts = [`card ${card}`, normalizedCardLabel, describeAlsaTransport(transport)];

  return {
    card,
    device,
    value: `plughw:${card},${device}`,
    label: normalizedDeviceLabel,
    description: descriptionParts.filter(Boolean).join(" · "),
    transport
  };
}

function parseAplayPlaybackDevices(output: string): DetectedAlsaDeviceInfo[] {
  const devices: DetectedAlsaDeviceInfo[] = [];
  const lines = String(output || "").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*card\s+(\d+):\s*([^\[]+?)\s*\[([^\]]+)\],\s*device\s+(\d+):\s*([^\[]+?)\s*\[([^\]]+)\]/i);
    if (!match) {
      continue;
    }
    const card = Number(match[1]);
    const device = Number(match[4]);
    if (!Number.isFinite(card) || !Number.isFinite(device)) {
      continue;
    }
    devices.push(buildDetectedAlsaDeviceInfo(card, device, match[3], match[6]));
  }
  return sortDetectedAlsaDevices(devices);
}

function mergeDetectedAlsaDevices(
  runtimePlaybackDevices: Array<{ card: number; device: number }>,
  aplayPlaybackDevices: DetectedAlsaDeviceInfo[]
): DetectedAlsaDeviceInfo[] {
  const merged = new Map<string, DetectedAlsaDeviceInfo>();
  aplayPlaybackDevices.forEach((item) => {
    merged.set(buildAlsaDeviceKey(item.card, item.device), item);
  });
  runtimePlaybackDevices.forEach((item) => {
    const key = buildAlsaDeviceKey(item.card, item.device);
    if (!merged.has(key)) {
      merged.set(key, buildDetectedAlsaDeviceInfo(item.card, item.device, "", `播放设备 ${item.card},${item.device}`));
    }
  });
  return sortDetectedAlsaDevices(Array.from(merged.values()));
}

function resolvePreferredAlsaDevice(
  requestedDevice: string,
  runtimePlaybackDevices: DetectedAlsaDeviceInfo[],
  notes: string[]
): string {
  const manualDevice = String(requestedDevice || "").trim();
  if (!runtimePlaybackDevices.length) {
    return manualDevice || "default";
  }

  const runtimePreferred = runtimePlaybackDevices[0];
  const runtimePreferredDevice = runtimePreferred.value;
  const availableText = runtimePlaybackDevices
    .map((item) => `${item.label} (${item.value})`)
    .join(", ");
  notes.push(`运行时探针发现的 ALSA 播放设备: ${availableText}`);

  if (!manualDevice) {
    notes.push(`未手动指定 ALSA 设备，已优先采用 ${runtimePreferred.label} (${runtimePreferredDevice})`);
    return runtimePreferredDevice;
  }

  const parsedManual = parseAlsaHwDevice(manualDevice);
  if (!parsedManual) {
    notes.push(`手动 ALSA 设备 ${manualDevice} 不是 hw/plughw 形式，当前保持原值`);
    return manualDevice;
  }

  const manualExists = runtimePlaybackDevices.some((item) => item.card === parsedManual.card && item.device === parsedManual.device);
  if (manualExists) {
    if (parsedManual.prefix === "hw") {
      const upgradedDevice = `plughw:${parsedManual.card},${parsedManual.device}`;
      notes.push(`手动 ALSA 设备 ${manualDevice} 与运行时探针识别到的播放节点一致，但当前优先升级为 ${upgradedDevice}，以避免裸 hw 设备在容器里打开失败`);
      return upgradedDevice;
    }
    notes.push(`手动 ALSA 设备 ${manualDevice} 与运行时探针识别到的播放节点一致，继续沿用`);
    return manualDevice;
  }

  notes.push(`手动 ALSA 设备 ${manualDevice} 未出现在当前运行时的 /dev/snd 播放节点中，已自动回退到 ${runtimePreferredDevice}`);
  return runtimePreferredDevice;
}

function getAudioOutputTypeLabel(value: AudioPreferencePayload["outputType"]): string {
  switch (value) {
    case "pulse":
      return "PulseAudio（蓝牙 / 桌面音频）";
    case "alsa":
      return "ALSA（有线 / HDMI）";
    case "pipewire":
      return "PipeWire（桌面 / 蓝牙）";
    case "null":
      return "Null（仅诊断）";
    case "auto":
    default:
      return "自动选择（推荐）";
  }
}

function buildAudioGuidance(
  candidates: MpdAudioOutputCandidate[],
  supportedTypes: string[],
  detectedAlsaDevices: DetectedAlsaDeviceInfo[],
  recommendedAlsaDevice: string,
  pulseReachable: boolean,
  pipewireReachable: string | boolean
): AudioGuidancePayload {
  const recommendedOutput = selectPreferredAudioOutput(candidates.length ? candidates : [{
    type: "null",
    name: "Songloft Null Output",
    lines: [],
    reason: "fallback"
  }], []);
  const recommendedAlsaInfo = detectedAlsaDevices.find((item) => item.value === recommendedAlsaDevice) || null;
  const summary =
    recommendedOutput.type === "pulse"
      ? "当前环境更适合蓝牙音箱或桌面音频，推荐优先尝试 PulseAudio。"
      : recommendedOutput.type === "pipewire"
        ? "当前环境已接入 PipeWire，会更适合桌面或蓝牙音频链路。"
        : recommendedOutput.type === "alsa"
          ? "当前环境更适合 ALSA 直连，通常用于有线耳机、内置喇叭或 HDMI。"
          : "当前未检测到稳定的出声后端，建议先使用自动选择并查看诊断说明。";
  const hints: string[] = [];

  if (recommendedOutput.type === "alsa" && recommendedAlsaInfo) {
    hints.push(`推荐的 ALSA 设备是 ${recommendedAlsaInfo.label}（${recommendedAlsaInfo.value}）。`);
  }
  if (!pulseReachable) {
    hints.push("如果你使用蓝牙音箱，通常需要宿主机提供 PulseAudio 或 PipeWire 会话，单独 ALSA 直连往往只能驱动有线输出。");
    hints.push("如果插件运行在 Docker 容器里，通常还需要把宿主的 PulseAudio 或 PipeWire socket 挂进容器，再在高级设置里填写对应的 XDG_RUNTIME_DIR 或服务器地址。");
  }
  if (detectedAlsaDevices.some((item) => item.transport === "analog")) {
    hints.push("如果你接的是耳机、内置喇叭或 3.5mm 口，优先尝试带 Analog、Speaker、Headphone 字样的设备。");
  }
  if (detectedAlsaDevices.some((item) => item.transport === "hdmi")) {
    hints.push("如果你接的是显示器或电视，优先尝试 HDMI 设备。");
  }
  if (!detectedAlsaDevices.length && supportedTypes.indexOf("alsa") >= 0) {
    hints.push("当前未整理出可选 ALSA 设备列表，建议先保持自动选择，再根据运行时说明排查 /dev/snd 与 /proc/asound。");
  }
  if (!pipewireReachable && supportedTypes.indexOf("pipewire") >= 0) {
    hints.push("PipeWire 插件已编译进 MPD，但当前没有检测到可用的 PipeWire socket。");
    hints.push("如果你走的是宿主 PipeWire 蓝牙链路，可以在高级设置里手动填写 PipeWire Remote，常见默认值是 pipewire-0。");
  }

  return {
    summary,
    hints,
    recommendedOutputType: recommendedOutput.type,
    recommendedOutputLabel: getAudioOutputTypeLabel(recommendedOutput.type),
    recommendedAlsaDevice,
    recommendedAlsaLabel: recommendedAlsaInfo ? recommendedAlsaInfo.label : (recommendedAlsaDevice || "自动选择"),
    alsaDeviceOptions: detectedAlsaDevices.map((item) => ({
      value: item.value,
      label: item.label,
      description: item.description,
      transport: item.transport,
      recommended: item.value === recommendedAlsaDevice
    }))
  };
}

function normalizePlatformArch(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "x86_64" || normalized === "amd64") {
    return "x86_64";
  }
  if (normalized === "aarch64" || normalized === "arm64") {
    return "arm64";
  }
  if (normalized === "armv7l" || normalized === "armv7" || normalized === "armhf" || normalized === "armv6l") {
    return "armv7";
  }
  return normalized || "unknown";
}

function normalizeHostLibc(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  if (normalized.includes("musl")) {
    return "musl";
  }
  if (
    normalized.includes("glibc") ||
    normalized.includes("gnu libc") ||
    normalized.includes("gnu c library") ||
    normalized.includes("gnu_get_libc_version")
  ) {
    return "glibc";
  }
  return "unknown";
}

function getManagedBinaryProbeDiagnosticValue(diagnostics: string[], key: string): string {
  const prefix = `${key}=`;
  const match = diagnostics.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function inferManagedBinaryProbeFailureCause(details: string, diagnostics: string[]): string {
  const hostLibc = getManagedBinaryProbeDiagnosticValue(diagnostics, "host_libc").toLowerCase();
  const lddMissing = getManagedBinaryProbeDiagnosticValue(diagnostics, "real_ldd_missing");
  const lddHead = getManagedBinaryProbeDiagnosticValue(diagnostics, "real_ldd_head").toLowerCase();
  const combined = `${details}\n${lddMissing}\n${lddHead}`.toLowerCase();
  const glibcMismatchPatterns = [
    /__\w+_chk: symbol not found/g,
    /__register_atfork: symbol not found/g,
    /__libc_single_threaded: symbol not found/g,
    /pthread_cond_clockwait: symbol not found/g,
    /fcntl64: symbol not found/g,
    /close_range: symbol not found/g,
    /posix_fallocate64: symbol not found/g,
    /error relocating/g
  ];
  const glibcMismatchScore = glibcMismatchPatterns.reduce((total, pattern) => {
    const matches = combined.match(pattern);
    return total + (matches ? matches.length : 0);
  }, 0);
  const likelyMuslHost = hostLibc.includes("musl") || lddHead.includes("musl") || combined.includes("error relocating");

  if (likelyMuslHost && glibcMismatchScore >= 4) {
    return "检测到上传 bundle 很可能是基于 glibc 构建，但当前宿主更接近 musl/Alpine 运行时，动态链接失败会被 shell 误报成 mpd.real not found；请改用 musl 兼容的 MPD bundle，或改在提供 glibc 运行环境的宿主中安装";
  }
  if (combined.includes("error relocating")) {
    return "检测到上传 bundle 的动态库无法在当前宿主解析，当前更像是 libc/ABI 不兼容，而不是 mpd.real 文件缺失；请改用与宿主系统匹配的 MPD bundle";
  }

  return "";
}

async function readEnvVar(songloft: SongloftCommandApi, name: string): Promise<string> {
  const result = await tryExec(songloft, "printenv", [name]);
  if (!result || result.exitCode !== 0) {
    return "";
  }
  return trimToSingleLine(result.stdout);
}

async function readUserId(songloft: SongloftCommandApi): Promise<string> {
  const result = await tryExec(songloft, "id", ["-u"]);
  if (!result || result.exitCode !== 0) {
    return "";
  }
  return trimToSingleLine(result.stdout);
}

function getPosixDirname(value: string): string {
  const normalized = String(value || "").trim();
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash <= 0) {
    return "";
  }
  return normalized.slice(0, lastSlash);
}

function getPosixBasename(value: string): string {
  const normalized = String(value || "").trim();
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash < 0) {
    return normalized;
  }
  return normalized.slice(lastSlash + 1);
}

function parseDetectedSocketProbeValue(output: string, key: string): string {
  const match = String(output || "").match(new RegExp(`^${key}=(.*)$`, "m"));
  return trimToSingleLine(match?.[1] || "");
}

async function detectHostAudioSocketInfo(
  songloft: SongloftCommandApi,
  userId: string
): Promise<{
  runtimeDir: string;
  pulseSocketPath: string;
  pulseServer: string;
  pipewireSocketPath: string;
  pipewireRemote: string;
}> {
  const preferredRuntimeDir = userId ? `/run/user/${userId}` : "";
  const script = [
    "pulse_socket=''",
    "pipewire_socket=''",
    "record_dir() {",
    "  dir=\"$1\"",
    "  [ -n \"$dir\" ] || return 0",
    "  [ -d \"$dir\" ] || return 0",
    "  if [ -z \"$pulse_socket\" ] && [ -S \"$dir/pulse/native\" ]; then",
    "    pulse_socket=\"$dir/pulse/native\"",
    "  fi",
    "  if [ -z \"$pipewire_socket\" ] && [ -S \"$dir/pipewire-0\" ]; then",
    "    pipewire_socket=\"$dir/pipewire-0\"",
    "  fi",
    "}",
    preferredRuntimeDir ? `record_dir ${shellQuote(preferredRuntimeDir)}` : "",
    "for dir in /run/user/*; do",
    "  record_dir \"$dir\"",
    "done",
    "printf 'PULSE_SOCKET=%s\\n' \"$pulse_socket\"",
    "printf 'PIPEWIRE_SOCKET=%s\\n' \"$pipewire_socket\""
  ].filter(Boolean).join("\n");
  const result = await execShell(songloft, script, { timeout: 5_000 }).catch(() => null);
  const pulseSocketPath = result && result.exitCode === 0
    ? parseDetectedSocketProbeValue(result.stdout || "", "PULSE_SOCKET")
    : "";
  const pipewireSocketPath = result && result.exitCode === 0
    ? parseDetectedSocketProbeValue(result.stdout || "", "PIPEWIRE_SOCKET")
    : "";
  const runtimeDir = getPosixDirname(getPosixDirname(pulseSocketPath)) || getPosixDirname(pipewireSocketPath);

  return {
    runtimeDir,
    pulseSocketPath,
    pulseServer: pulseSocketPath ? `unix:${pulseSocketPath}` : "",
    pipewireSocketPath,
    pipewireRemote: pipewireSocketPath ? (getPosixBasename(pipewireSocketPath) || "pipewire-0") : ""
  };
}

function parsePulseServerFromPactlInfo(output: string): string {
  const match = String(output || "").match(/Server String:\s*(.+)/i);
  const value = trimToSingleLine(match?.[1] || "");
  if (!value) {
    return "";
  }
  if (value.startsWith("/")) {
    return `unix:${value}`;
  }
  return value;
}

function escapeMpdConfigString(value: string): string {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildAlsaAudioOutputCandidate(
  device: string,
  reason: string
): MpdAudioOutputCandidate {
  const normalizedDevice = String(device || "").trim() || "default";
  return {
    type: "alsa",
    name: "Songloft ALSA Output",
    lines: [
      'audio_output {',
      '  type "alsa"',
      '  name "Songloft ALSA Output"',
      `  device "${escapeMpdConfigString(normalizedDevice)}"`,
      '  mixer_type "software"',
      '}'
    ],
    reason
  };
}

async function readRuntimeFilesSnapshot(songloft: SongloftCommandApi): Promise<RuntimeFilesSnapshot | null> {
  try {
    const raw = await songloft.storage.get(STORAGE_RUNTIME_FILES_SNAPSHOT);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return {
      rootDir: typeof parsed.rootDir === "string" ? parsed.rootDir : "",
      configPath: typeof parsed.configPath === "string" ? parsed.configPath : "",
      logPath: typeof parsed.logPath === "string" ? parsed.logPath : "",
      pidPath: typeof parsed.pidPath === "string" ? parsed.pidPath : "",
      statePath: typeof parsed.statePath === "string" ? parsed.statePath : "",
      stickerPath: typeof parsed.stickerPath === "string" ? parsed.stickerPath : "",
      playlistDir: typeof parsed.playlistDir === "string" ? parsed.playlistDir : ""
    };
  } catch (error) {
    songloft.log.warn(`Failed to read runtime files snapshot: ${String(error)}`);
    return null;
  }
}

async function writeRuntimeFilesSnapshot(songloft: SongloftCommandApi, snapshot: RuntimeFilesSnapshot) {
  try {
    await songloft.storage.set(STORAGE_RUNTIME_FILES_SNAPSHOT, JSON.stringify(snapshot));
  } catch (error) {
    songloft.log.warn(`Failed to persist runtime files snapshot: ${String(error)}`);
  }
}

async function clearRuntimeFilesSnapshot(songloft: SongloftCommandApi) {
  try {
    await songloft.storage.set(STORAGE_RUNTIME_FILES_SNAPSHOT, "");
  } catch (error) {
    songloft.log.warn(`Failed to clear runtime files snapshot: ${String(error)}`);
  }
}

async function resolveShellProgram(songloft: SongloftCommandApi): Promise<string> {
  const candidates = ["sh", "/bin/sh"];
  for (const candidate of candidates) {
    const result = await tryExec(songloft, candidate, ["-lc", "exit 0"]);
    if (result && result.exitCode === 0) {
      return candidate;
    }
  }
  throw new Error("未找到可执行的 sh，无法通过命令侧管理 MPD 运行时文件");
}

async function execShell(
  songloft: SongloftCommandApi,
  script: string,
  options?: {
    timeout?: number;
    env?: Record<string, string>;
  }
): Promise<CommandExecResult> {
  const shellProgram = await resolveShellProgram(songloft);
  return songloft.command.exec(shellProgram, ["-lc", script], {
    timeout: options?.timeout ?? 15_000,
    env: options?.env
  });
}

async function execShellWithStdin(
  songloft: SongloftCommandApi,
  script: string,
  stdin: string,
  options?: {
    timeout?: number;
    env?: Record<string, string>;
  }
): Promise<CommandExecResult> {
  const shellProgram = await resolveShellProgram(songloft);
  return songloft.command.exec(shellProgram, ["-lc", script], {
    timeout: options?.timeout ?? 30_000,
    env: options?.env,
    stdin
  });
}

async function startShellProcess(
  songloft: SongloftCommandApi,
  name: string,
  script: string,
  env?: Record<string, string>
) {
  const shellProgram = await resolveShellProgram(songloft);
  return songloft.command.start(name, shellProgram, ["-lc", script], { env });
}

async function readAudioOutputSnapshot(songloft: SongloftCommandApi): Promise<AudioOutputSnapshot | null> {
  try {
    const raw = await songloft.storage.get(STORAGE_AUDIO_OUTPUT_SNAPSHOT);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return {
      selectedType: typeof parsed.selectedType === "string" ? parsed.selectedType : "",
      selectedName: typeof parsed.selectedName === "string" ? parsed.selectedName : "",
      notes: Array.isArray(parsed.notes) ? parsed.notes.map((item) => String(item)) : []
    };
  } catch (error) {
    songloft.log.warn(`Failed to read audio output snapshot: ${String(error)}`);
    return null;
  }
}

async function writeAudioOutputSnapshot(songloft: SongloftCommandApi, snapshot: AudioOutputSnapshot) {
  try {
    await songloft.storage.set(STORAGE_AUDIO_OUTPUT_SNAPSHOT, JSON.stringify(snapshot));
  } catch (error) {
    songloft.log.warn(`Failed to persist audio output snapshot: ${String(error)}`);
  }
}

function normalizeAudioOutputType(value: string): AudioPreferencePayload["outputType"] {
  switch (String(value || "").trim().toLowerCase()) {
    case "pulse":
    case "alsa":
    case "pipewire":
    case "null":
      return value.trim().toLowerCase() as AudioPreferencePayload["outputType"];
    default:
      return "auto";
  }
}

export async function readAudioPreferences(songloft: SongloftCommandApi): Promise<AudioPreferencePayload> {
  const [outputType, xdgRuntimeDir, pulseServer, pipewireRemote, alsaDevice] = await Promise.all([
    songloft.storage.get(STORAGE_AUDIO_OUTPUT_TYPE).catch(() => ""),
    songloft.storage.get(STORAGE_AUDIO_XDG_RUNTIME_DIR).catch(() => ""),
    songloft.storage.get(STORAGE_AUDIO_PULSE_SERVER).catch(() => ""),
    songloft.storage.get(STORAGE_AUDIO_PIPEWIRE_REMOTE).catch(() => ""),
    songloft.storage.get(STORAGE_AUDIO_ALSA_DEVICE).catch(() => "")
  ]);

  const normalized = {
    outputType: normalizeAudioOutputType(String(outputType || "")),
    xdgRuntimeDir: String(xdgRuntimeDir || "").trim(),
    pulseServer: String(pulseServer || "").trim(),
    pipewireRemote: String(pipewireRemote || "").trim(),
    alsaDevice: String(alsaDevice || "").trim()
  };

  return {
    ...normalized,
    hasOverrides: normalized.outputType !== "auto" ||
      !!normalized.xdgRuntimeDir ||
      !!normalized.pulseServer ||
      !!normalized.pipewireRemote ||
      !!normalized.alsaDevice
  };
}

export async function saveAudioPreferences(
  songloft: SongloftCommandApi,
  payload: Partial<AudioPreferencePayload> | null | undefined
): Promise<AudioPreferencePayload> {
  const outputType = normalizeAudioOutputType(String(payload?.outputType || ""));
  const xdgRuntimeDir = String(payload?.xdgRuntimeDir || "").trim();
  const pulseServer = String(payload?.pulseServer || "").trim();
  const pipewireRemote = String(payload?.pipewireRemote || "").trim();
  const alsaDevice = String(payload?.alsaDevice || "").trim();

  await Promise.all([
    songloft.storage.set(STORAGE_AUDIO_OUTPUT_TYPE, outputType),
    songloft.storage.set(STORAGE_AUDIO_XDG_RUNTIME_DIR, xdgRuntimeDir),
    songloft.storage.set(STORAGE_AUDIO_PULSE_SERVER, pulseServer),
    songloft.storage.set(STORAGE_AUDIO_PIPEWIRE_REMOTE, pipewireRemote),
    songloft.storage.set(STORAGE_AUDIO_ALSA_DEVICE, alsaDevice)
  ]);

  return readAudioPreferences(songloft);
}

async function readMpdLog(songloft: SongloftCommandApi): Promise<string> {
  const runtimeFiles = await readRuntimeFilesSnapshot(songloft);
  if (!runtimeFiles?.logPath) {
    return "";
  }
  const result = await execShell(
    songloft,
    `if [ -f ${shellQuote(runtimeFiles.logPath)} ]; then tail -n 200 ${shellQuote(runtimeFiles.logPath)}; fi`,
    { timeout: 10_000 }
  ).catch(() => null);
  if (!result || result.exitCode !== 0) {
    return "";
  }
  return result.stdout || "";
}

async function waitForMpdReady(songloft: SongloftCommandApi, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const resolvedMpc = await resolveBinary(songloft, "mpc");
    if (resolvedMpc.executableAvailable) {
      const result = await execResolvedCommand(songloft, resolvedMpc, ["status"], 3_000);
      if (result && result.exitCode === 0) {
        return true;
      }
    }

    await delay(300);
  }

  return false;
}

async function buildMpdReadyError(songloft: SongloftCommandApi, message: string): Promise<Error> {
  const logTail = getRecentLogTail(await readMpdLog(songloft), 12);
  if (!logTail.length) {
    return new Error(message);
  }
  return new Error(`${message}。最近日志: ${logTail.join(" | ")}`);
}

function getRecentLogTail(content: string, lineCount: number): string[] {
  return String(content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-lineCount);
}

function buildRuntimeHintsFromLog(logTail: string[]): string[] {
  const joined = logTail.join("\n").toLowerCase();
  const notes: string[] = [];

  if (!joined) {
    return notes;
  }

  if (joined.indexOf("exception: failed to open alsa device") >= 0 || joined.indexOf("alsa lib") >= 0) {
    notes.push("最近日志提示 ALSA 设备打开失败，可能是默认声卡不存在、被占用，或当前宿主没有可用的 ALSA 输出");
  }
  if (joined.indexOf("pulse") >= 0 && (joined.indexOf("connection refused") >= 0 || joined.indexOf("failed to connect") >= 0)) {
    notes.push("最近日志提示 PulseAudio 连接失败，通常是 MPD 进程拿不到用户会话的 PulseAudio 地址或 socket");
  }
  if (joined.indexOf("pipewire") >= 0 && (joined.indexOf("failed") >= 0 || joined.indexOf("error") >= 0)) {
    notes.push("最近日志提示 PipeWire 输出初始化失败，可能是当前 MPD 构建未启用 pipewire，或用户会话中的 PipeWire socket 不可达");
  }
  if (joined.indexOf("no such audio output plugin") >= 0) {
    notes.push("最近日志提示所选音频输出插件不存在，说明当前 mpd 构建未包含对应的 audio_output 插件");
  }
  if (joined.indexOf("decoder") >= 0 && joined.indexOf("failed") >= 0) {
    notes.push("最近日志里出现解码器失败，可能是当前 mpd 构建缺少目标音频格式所需的解码支持");
  }
  if (joined.indexOf("permission denied") >= 0) {
    notes.push("最近日志里出现权限错误，可能与音频设备、运行目录或用户会话 socket 的访问权限有关");
  }
  if (joined.indexOf("u_init() failed") >= 0 || joined.indexOf("u_file_access_error") >= 0) {
    notes.push("最近日志提示 ICU 初始化失败；当前 MPD 二进制很可能依赖 ICU 数据文件，但宿主运行环境无法正确访问。建议重新发布关闭 ICU 的 MPD bundle，或确保 bundle/runtime 中提供可访问的 ICU 数据");
  }

  return notes;
}

function getPackagedBinaryProgram(platform: MpdPlatformPayload, kind: "mpd" | "mpc"): string {
  if (!platform.supported) {
    return "";
  }
  return `${platform.platformKey}/${kind}`;
}

function getPackagedBinaryPath(platform: MpdPlatformPayload, kind: "mpd" | "mpc"): string {
  const program = getPackagedBinaryProgram(platform, kind);
  if (!program) {
    return "";
  }
  return `${MPD_BIN_DIR}/${program}`;
}

function getManagedBinaryFilename(kind: "mpd" | "mpc"): string {
  return kind;
}

function getManagedBinaryShellProgram(filename: string, baseDir = MPD_BIN_DIR): string {
  return `${baseDir}/${filename}`;
}

function getVersionCheckArgs(kind: "mpd" | "mpc"): string[] {
  return ["--version"];
}

function isBinaryProbeSuccessful(kind: "mpd" | "mpc", result: CommandExecResult | null): boolean {
  if (!result) {
    return false;
  }

  if (result.exitCode === 0) {
    return true;
  }

  if (kind !== "mpc") {
    return false;
  }

  const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
  return output.includes("invalid option --version");
}

async function canExecBinary(songloft: SongloftCommandApi, program: string, kind: "mpd" | "mpc"): Promise<boolean> {
  const result = await tryExec(songloft, program, getVersionCheckArgs(kind));
  return isBinaryProbeSuccessful(kind, result);
}

async function probeManagedBinary(
  songloft: SongloftCommandApi,
  filename: string,
  kind: "mpd" | "mpc",
  baseDir = MPD_BIN_DIR
): Promise<CommandExecResult | null> {
  const program = getManagedBinaryShellProgram(filename, baseDir);
  return execShell(songloft, buildShellExecScript(program, getVersionCheckArgs(kind)), {
    timeout: 10_000
  }).catch(() => null);
}

async function collectManagedBinaryProbeDiagnostics(songloft: SongloftCommandApi, filename: string, baseDir = MPD_BIN_DIR): Promise<string[]> {
  const wrapperPath = `${baseDir}/${filename}`;
  const wrapperContent = await readTextFileViaShell(songloft, wrapperPath);
  const requiredRealFile = detectManagedWrapperRealDependency(wrapperContent);
  const realPath = requiredRealFile ? `${baseDir}/${requiredRealFile}` : "";
  const diagnostics: string[] = [];

  if (requiredRealFile) {
    diagnostics.push(`wrapper依赖 ${requiredRealFile}`);
  }

  const script = [
    'if command -v uname >/dev/null 2>&1; then printf "host_arch=%s\\n" "$(uname -m)"; fi',
    'if command -v ldd >/dev/null 2>&1; then printf "host_libc="; ldd --version 2>&1 | head -n 1 | tr \'\\n\' \' \'; printf \'\\n\'; fi',
    `if [ -e ${shellQuote(wrapperPath)} ]; then printf "wrapper_exists=yes\\n"; else printf "wrapper_exists=no\\n"; fi`,
    `if [ -e ${shellQuote(wrapperPath)} ] && command -v od >/dev/null 2>&1; then printf "wrapper_bytes="; od -An -tx1 -N 32 ${shellQuote(wrapperPath)} 2>/dev/null | tr -d ' \\n'; printf '\\n'; fi`,
    requiredRealFile
      ? `if [ -e ${shellQuote(realPath)} ]; then printf "real_exists=yes\\n"; else printf "real_exists=no\\n"; fi`
      : "",
    requiredRealFile
      ? `if [ -e ${shellQuote(realPath)} ] && command -v file >/dev/null 2>&1; then printf "real_file="; file -L ${shellQuote(realPath)} 2>/dev/null | head -n 1; fi`
      : "",
    requiredRealFile
      ? `if [ -e ${shellQuote(realPath)} ] && command -v readelf >/dev/null 2>&1; then printf "real_interp="; readelf -l ${shellQuote(realPath)} 2>/dev/null | grep 'Requesting program interpreter' | head -n 1 | tr '\\n' ' '; printf '\\n'; fi`
      : "",
    requiredRealFile
      ? `if [ -e ${shellQuote(realPath)} ] && command -v ldd >/dev/null 2>&1; then printf "real_ldd_missing="; ldd ${shellQuote(realPath)} 2>&1 | grep 'not found' | tr '\\n' ' '; printf '\\n'; fi`
      : "",
    requiredRealFile
      ? `if [ -e ${shellQuote(realPath)} ] && command -v ldd >/dev/null 2>&1; then printf "real_ldd_head="; ldd ${shellQuote(realPath)} 2>&1 | head -n 8 | tr '\\n' ' '; printf '\\n'; fi`
      : ""
  ].filter(Boolean).join("\n");

  const result = await execShell(songloft, script, { timeout: 10_000 }).catch(() => null);
  if (!result || result.exitCode !== 0) {
    return diagnostics;
  }

  return diagnostics.concat(
    String(result.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
}

async function buildManagedBinaryProbeFailureMessage(
  songloft: SongloftCommandApi,
  filename: string,
  kind: "mpd" | "mpc",
  result: CommandExecResult | null,
  phase: string,
  baseDir = MPD_BIN_DIR
): Promise<string> {
  const details = trimToSingleLine(result?.stderr || result?.stdout || "");
  const diagnostics = await collectManagedBinaryProbeDiagnostics(songloft, filename, baseDir);
  const inferredCause = inferManagedBinaryProbeFailureCause(details, diagnostics);
  const diagnosticText = diagnostics.length ? `；诊断: ${diagnostics.join(" | ")}` : "";
  const causeText = inferredCause ? `；原因判断: ${inferredCause}` : "";
  return details
    ? `${phase}，插件内的 ${kind} 无法通过执行校验${causeText}；宿主返回: ${details}${diagnosticText}`
    : `${phase}，插件内的 ${kind} 无法通过执行校验${causeText}${diagnosticText}`;
}

async function canExecManagedBinary(
  songloft: SongloftCommandApi,
  filename: string,
  kind: "mpd" | "mpc",
  baseDir = MPD_BIN_DIR
): Promise<boolean> {
  const result = await probeManagedBinary(songloft, filename, kind, baseDir);
  return isBinaryProbeSuccessful(kind, result);
}

function stripUrlSearchAndHash(url: string): string {
  return url.replace(/[?#].*$/, "");
}

function getManagedArchiveFormat(value: string): ManagedArchiveFormat | null {
  const normalized = stripUrlSearchAndHash(String(value || "").trim()).toLowerCase();
  if (normalized.endsWith(".tgz") || normalized.endsWith(".tar.gz")) {
    return "tgz";
  }
  return null;
}

function getManagedUploadArchivePath(): string {
  return MANAGED_UPLOAD_ARCHIVE_TGZ_PATH;
}

function inferManagedBundlePlatformKeyFromFilename(filename: string): string {
  const normalized = stripUrlSearchAndHash(String(filename || "").trim()).toLowerCase();
  if (!normalized) {
    return "";
  }

  for (const platformKey of SUPPORTED_MANAGED_PLATFORM_KEYS) {
    if (normalized.includes(platformKey)) {
      return platformKey;
    }
  }

  if (normalized.includes("linux-amd64")) {
    return "linux-x86_64-glibc";
  }
  if (normalized.includes("linux-arm64")) {
    return "linux-arm64-glibc";
  }
  if (normalized.includes("linux-armv7")) {
    return "linux-armv7-glibc";
  }

  return "";
}

function ensureUploadedArchiveMatchesHostPlatform(filename: string, platform: MpdPlatformPayload): void {
  const inferredPlatformKey = inferManagedBundlePlatformKeyFromFilename(filename);
  if (!inferredPlatformKey || !platform.supported) {
    return;
  }
  if (inferredPlatformKey !== platform.platformKey) {
    throw new Error(`上传压缩包文件名看起来属于 ${inferredPlatformKey}，但当前宿主是 ${platform.platformKey}，请上传匹配当前平台的 bundle`);
  }
}

function shouldExtractTgz(url: string): boolean {
  return getManagedArchiveFormat(url) === "tgz";
}

function toSafeBinFilename(value: string): string {
  const safe = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safe || "asset";
}

async function deleteBinaryIfExists(songloft: SongloftCommandApi, filename: string): Promise<void> {
  if (!filename) {
    return;
  }
  const existed = await songloft.command.exists(filename).catch(() => false);
  if (existed) {
    try {
      await songloft.command.deleteBin(filename);
    } catch {
      const fallbackResult = await execShell(songloft, `rm -rf ${shellQuote(`${MPD_BIN_DIR}/${filename}`)}`, {
        timeout: 10_000
      }).catch(() => null);
      if (!fallbackResult || fallbackResult.exitCode !== 0) {
        throw new Error(`无法删除旧的插件托管文件: ${filename}`);
      }
    }
  }
}

async function deleteManagedBinaryFiles(songloft: SongloftCommandApi, filenames: string[]): Promise<void> {
  const seen = new Set<string>();
  for (const filename of filenames) {
    const normalized = String(filename || "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    await deleteBinaryIfExists(songloft, normalized);
  }
}

function getDownloadArchiveFilename(platform: MpdPlatformPayload, kind: "mpd" | "mpc", url: string): string {
  const platformSegment = platform.supported ? platform.platformKey : `${platform.os || "unknown"}-${platform.arch || "unknown"}`;
  const suffix = shouldExtractTgz(url) ? ".tgz" : ".bin";
  return `${kind}-${toSafeBinFilename(platformSegment)}${suffix}`;
}

function getManagedBundleUrl(platform: MpdPlatformPayload): string {
  return MANAGED_BINARY_BUNDLE_URLS[platform.platformKey] || "";
}

async function chmodManagedBinary(songloft: SongloftCommandApi, filename: string, baseDir = MPD_BIN_DIR): Promise<void> {
  const chmodResult = await execShell(songloft, `chmod +x ${shellQuote(`${baseDir}/${filename}`)}`, {
    timeout: 5_000
  }).catch(() => null);
  if (!chmodResult || chmodResult.exitCode !== 0) {
    throw new Error(`已下载 ${filename}，但无法为插件托管二进制授予执行权限`);
  }
}

async function chmodManagedBinaryIfExists(songloft: SongloftCommandApi, filename: string, baseDir = MPD_BIN_DIR): Promise<void> {
  const exists = await shellPathExists(songloft, `${baseDir}/${filename}`);
  if (exists) {
    await chmodManagedBinary(songloft, filename, baseDir);
  }
}

function getAbsoluteSystemBinaryCandidates(kind: "mpd" | "mpc"): string[] {
  return COMMON_SYSTEM_BIN_DIRS.map((dir) => `${dir}/${kind}`);
}

async function findExecutableCandidate(
  songloft: SongloftCommandApi,
  candidates: string[],
  args: string[]
): Promise<{ program: string; executableAvailable: boolean } | null> {
  for (const candidate of candidates) {
    const executableAvailable = await canExec(songloft, candidate, args);
    if (executableAvailable) {
      return {
        program: candidate,
        executableAvailable: true
      };
    }
  }

  return null;
}

async function findExecutableViaShell(songloft: SongloftCommandApi, kind: "mpd" | "mpc"): Promise<string> {
  const candidates = [kind, ...getAbsoluteSystemBinaryCandidates(kind)];
  const versionCommand = getVersionCheckArgs(kind).join(" ");
  const scriptLines = ["for c in " + candidates.map(shellQuote).join(" ") + "; do"];
  scriptLines.push('  out=""');
  scriptLines.push('  code=1');
  scriptLines.push('  case "$c" in');
  scriptLines.push(`    */*) if [ -x "$c" ]; then out=$("$c" ${versionCommand} 2>&1) || code=$?; [ "${'$'}{code:-0}" -eq 0 ] && { printf "%s\\n" "$c"; exit 0; }; fi ;;`);
  scriptLines.push(`    *) if command -v "$c" >/dev/null 2>&1; then out=$("$c" ${versionCommand} 2>&1) || code=$?; [ "${'$'}{code:-0}" -eq 0 ] && { printf "%s\\n" "$c"; exit 0; }; fi ;;`);
  scriptLines.push("  esac");
  scriptLines.push('  if [ ' + shellQuote(kind) + ' = "mpc" ]; then');
  scriptLines.push('    case "$out" in');
  scriptLines.push('      *"invalid option --version"*) printf "%s\\n" "$c"; exit 0 ;;');
  scriptLines.push('    esac');
  scriptLines.push("  fi");
  scriptLines.push("done");
  scriptLines.push("exit 1");

  const result = await execShell(songloft, scriptLines.join("\n"), { timeout: 10_000 }).catch(() => null);
  if (!result || result.exitCode !== 0) {
    return "";
  }
  return trimToSingleLine(result.stdout);
}

async function ensureRuntimeFiles(songloft: SongloftCommandApi): Promise<RuntimeFilesSnapshot> {
  const existing = await readRuntimeFilesSnapshot(songloft);
  if (existing?.rootDir && existing.configPath && existing.logPath) {
    const existingRootDirAvailable = await shellPathExists(songloft, existing.rootDir);
    if (existingRootDirAvailable) {
      return existing;
    }
    await clearRuntimeFilesSnapshot(songloft);
  }

  const result = await execShell(
    songloft,
    "root_dir=$(mktemp -d /tmp/songloft-mpd-XXXXXX) || exit 1\nprintf '%s\\n' \"$root_dir\"",
    { timeout: 10_000 }
  );
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || "无法创建 MPD 命令侧临时目录");
  }

  const rootDir = trimToSingleLine(result.stdout);
  if (!rootDir) {
    throw new Error("未能获取 MPD 命令侧临时目录");
  }

  const snapshot: RuntimeFilesSnapshot = {
    rootDir,
    configPath: `${rootDir}/mpd.conf`,
    logPath: `${rootDir}/mpd.log`,
    pidPath: `${rootDir}/mpd.pid`,
    statePath: `${rootDir}/mpd.state`,
    stickerPath: `${rootDir}/mpd.sticker.sql`,
    playlistDir: rootDir
  };
  await writeRuntimeFilesSnapshot(songloft, snapshot);
  return snapshot;
}

async function shellPathExists(songloft: SongloftCommandApi, path: string): Promise<boolean> {
  const result = await execShell(
    songloft,
    `if [ -e ${shellQuote(path)} ]; then exit 0; fi\nexit 1`,
    { timeout: 10_000 }
  ).catch(() => null);
  return !!result && result.exitCode === 0;
}

async function readTextFileViaShell(songloft: SongloftCommandApi, path: string): Promise<string> {
  const result = await execShell(
    songloft,
    `if [ -f ${shellQuote(path)} ]; then cat ${shellQuote(path)}; fi`,
    { timeout: 10_000 }
  ).catch(() => null);
  if (!result || result.exitCode !== 0) {
    return "";
  }
  return result.stdout || "";
}

function replaceMpdConfigDirective(configText: string, directive: string, value: string): string {
  const pattern = new RegExp(`^${directive}\\s+\".*\"$`, "m");
  const replacement = `${directive} "${value}"`;
  if (pattern.test(configText)) {
    return configText.replace(pattern, replacement);
  }
  return `${configText.trimEnd()}\n${replacement}\n`;
}

function buildForegroundProbeConfigText(
  configText: string,
  runtimeFiles: RuntimeFilesSnapshot,
  probePort: number
): string {
  let next = String(configText || "");
  next = replaceMpdConfigDirective(next, "port", String(probePort));
  next = replaceMpdConfigDirective(next, "log_file", `${runtimeFiles.rootDir}/mpd-probe.log`);
  next = replaceMpdConfigDirective(next, "pid_file", `${runtimeFiles.rootDir}/mpd-probe.pid`);
  next = replaceMpdConfigDirective(next, "state_file", `${runtimeFiles.rootDir}/mpd-probe.state`);
  next = replaceMpdConfigDirective(next, "sticker_file", `${runtimeFiles.rootDir}/mpd-probe.sticker.sql`);
  return next;
}

async function writeForegroundProbeConfig(
  songloft: SongloftCommandApi,
  runtimeFiles: RuntimeFilesSnapshot
): Promise<string> {
  const configText = await readTextFileViaShell(songloft, runtimeFiles.configPath);
  if (!configText.trim()) {
    return "";
  }
  const probePort = 20000 + (Date.now() % 10000);
  const probeConfigPath = `${runtimeFiles.rootDir}/mpd-probe.conf`;
  const probeConfigText = buildForegroundProbeConfigText(configText, runtimeFiles, probePort);
  const hereDocMarker = "SONGLOFT_MPD_PROBE_CONFIG_EOF";
  const writeResult = await execShell(
    songloft,
    `cat > ${shellQuote(probeConfigPath)} <<'${hereDocMarker}'\n${probeConfigText}\n${hereDocMarker}`,
    { timeout: 10_000 }
  ).catch(() => null);
  if (!writeResult || writeResult.exitCode !== 0) {
    return "";
  }
  return probeConfigPath;
}

async function normalizeManagedWrapperLineEndings(songloft: SongloftCommandApi, filename: string, baseDir = MPD_BIN_DIR): Promise<void> {
  const path = `${baseDir}/${filename}`;
  const normalizeResult = await execShell(
    songloft,
    [
      `if [ ! -f ${shellQuote(path)} ]; then exit 0; fi`,
      `first_bytes=$(od -An -tx1 -N 3 ${shellQuote(path)} 2>/dev/null | tr -d ' \n')`,
      'case "$first_bytes" in',
      '  2321*|efbbbf*) ;;',
      '  *) exit 0 ;;',
      'esac',
      "tmp_file=$(mktemp) || exit 1",
      `if [ "$first_bytes" = "efbbbf" ]; then tail -c +4 ${shellQuote(path)} | tr -d '\\r' > "$tmp_file" || { rm -f "$tmp_file"; exit 1; }; else tr -d '\\r' < ${shellQuote(path)} > "$tmp_file" || { rm -f "$tmp_file"; exit 1; }; fi`,
      `cat "$tmp_file" > ${shellQuote(path)} || { rm -f "$tmp_file"; exit 1; }`,
      'rm -f "$tmp_file"'
    ].join("\n"),
    { timeout: 10_000 }
  ).catch(() => null);

  if (!normalizeResult || normalizeResult.exitCode !== 0) {
    throw new Error(`上传解压完成，但无法修正 ${filename} 的换行符格式`);
  }
}

async function normalizeManagedWrapperScripts(songloft: SongloftCommandApi, baseDir = MPD_BIN_DIR): Promise<void> {
  await normalizeManagedWrapperLineEndings(songloft, "mpd", baseDir);
  await normalizeManagedWrapperLineEndings(songloft, "mpc", baseDir);
}

function detectManagedWrapperRealDependency(content: string): string {
  const normalized = String(content || "");
  if (!normalized.startsWith("#!")) {
    return "";
  }
  const match = normalized.match(/(?:\/|\$\{SELF_DIR\}\/)(mp[dc]\.real)\b/);
  return match ? match[1] || "" : "";
}

async function ensureManagedWrapperRealTargetsExist(songloft: SongloftCommandApi, baseDir = MPD_BIN_DIR): Promise<void> {
  for (const item of [
    { wrapper: "mpd", kind: "mpd" as const },
    { wrapper: "mpc", kind: "mpc" as const }
  ]) {
    const wrapperContent = await readTextFileViaShell(songloft, `${baseDir}/${item.wrapper}`);
    const requiredRealFile = detectManagedWrapperRealDependency(wrapperContent);
    if (!requiredRealFile) {
      continue;
    }

    const exists = await shellPathExists(songloft, `${baseDir}/${requiredRealFile}`);
    if (!exists) {
      throw new Error(`上传包中的 ${item.kind} wrapper 依赖 ${requiredRealFile}，但压缩包中缺少该文件`);
    }
  }
}

async function execResolvedCommand(
  songloft: SongloftCommandApi,
  resolved: ResolvedBinary,
  args: string[],
  timeout = 15_000
): Promise<CommandExecResult | null> {
  if (resolved.launchMode === "shell") {
    const result = await execShell(songloft, buildShellExecScript(resolved.program, args), { timeout }).catch(() => null);
    return result && typeof result.exitCode === "number" ? result : null;
  }
  return tryExec(songloft, resolved.program, args);
}

async function startResolvedCommand(
  songloft: SongloftCommandApi,
  name: string,
  resolved: ResolvedBinary,
  args: string[],
  env?: Record<string, string>
) {
  if (resolved.launchMode === "shell") {
    return startShellProcess(songloft, name, buildShellExecScript(resolved.program, args), env);
  }
  return songloft.command.start(name, resolved.program, args, { env });
}

async function probeResolvedForegroundLaunch(
  songloft: SongloftCommandApi,
  resolved: ResolvedBinary,
  args: string[],
  env?: Record<string, string>
): Promise<{
  mode: string;
  launchMode: string;
  exitCode: number | null;
  stillRunningAfterDelay: boolean;
  stdout: string;
  stderr: string;
  combined: string;
} | null> {
  const script = [
    "tmp_out=$(mktemp) || exit 1",
    "tmp_err=$(mktemp) || exit 1",
    `${buildShellExecScript(resolved.program, args)} >"$tmp_out" 2>"$tmp_err" &`,
    "child_pid=$!",
    "sleep 1",
    'if kill -0 "$child_pid" >/dev/null 2>&1; then',
    '  alive="yes"',
    '  kill "$child_pid" >/dev/null 2>&1 || true',
    '  wait "$child_pid" >/dev/null 2>&1 || true',
    "  exit_code=''",
    "else",
    '  alive="no"',
    '  wait "$child_pid"; exit_code=$?',
    "fi",
    'printf "__PROBE_META__ alive=%s exit=%s\\n" "$alive" "${exit_code:-}"',
    'printf "__PROBE_STDOUT__\\n"',
    'cat "$tmp_out" 2>/dev/null || true',
    'printf "\\n__PROBE_STDERR__\\n"',
    'cat "$tmp_err" 2>/dev/null || true',
    'printf "\\n__PROBE_COMBINED__\\n"',
    'cat "$tmp_out" "$tmp_err" 2>/dev/null || true',
    'rm -f "$tmp_out" "$tmp_err"'
  ].join("\n");

  const result = await execShell(songloft, script, {
    timeout: 8_000,
    env
  }).catch(() => null);
  if (!result || result.exitCode !== 0) {
    return null;
  }

  const output = String(result.stdout || "");
  const metaMatch = output.match(/__PROBE_META__ alive=(yes|no) exit=([^\n]*)/);
  const stdoutMatch = output.match(/__PROBE_STDOUT__\n([\s\S]*?)\n__PROBE_STDERR__/);
  const stderrMatch = output.match(/__PROBE_STDERR__\n([\s\S]*?)\n__PROBE_COMBINED__/);
  const combinedMatch = output.match(/__PROBE_COMBINED__\n([\s\S]*)$/);

  return {
    mode: "foreground-shell-probe",
    launchMode: resolved.launchMode,
    exitCode: metaMatch && metaMatch[2] ? Number(metaMatch[2]) : null,
    stillRunningAfterDelay: metaMatch ? metaMatch[1] === "yes" : false,
    stdout: stdoutMatch?.[1] || "",
    stderr: stderrMatch?.[1] || "",
    combined: combinedMatch?.[1] || ""
  };
}

async function getUnameValue(songloft: SongloftCommandApi, flag: "-s" | "-m"): Promise<string> {
  const result = await tryExec(songloft, "uname", [flag]);
  if (!result || result.exitCode !== 0) {
    return "";
  }
  return result.stdout.trim();
}

async function detectHostLibc(songloft: SongloftCommandApi): Promise<string> {
  const script = [
    'if command -v ldd >/dev/null 2>&1; then ldd --version 2>&1 | head -n 1; exit 0; fi',
    'if command -v getconf >/dev/null 2>&1; then getconf GNU_LIBC_VERSION 2>/dev/null | head -n 1; exit 0; fi',
    'if ls /lib/libc.musl-* >/dev/null 2>&1; then printf "musl\\n"; exit 0; fi',
    'if ls /lib64/libc.so.6 >/dev/null 2>&1 || ls /lib/x86_64-linux-gnu/libc.so.6 >/dev/null 2>&1 || ls /lib/aarch64-linux-gnu/libc.so.6 >/dev/null 2>&1; then printf "glibc\\n"; exit 0; fi'
  ].join("\n");
  const result = await execShell(songloft, script, { timeout: 5_000 }).catch(() => null);
  return normalizeHostLibc(`${result?.stdout || ""}\n${result?.stderr || ""}`);
}

function mapPlatform(os: string, arch: string, libc: string): MpdPlatformPayload {
  const normalizedOs = (os || "").toLowerCase();
  const normalizedArch = normalizePlatformArch(arch);
  const normalizedLibc = normalizeHostLibc(libc);

  if (normalizedOs !== "linux") {
    return {
      os: normalizedOs || "unknown",
      arch: normalizedArch || "unknown",
      libc: normalizedLibc,
      platformKey: "unsupported",
      supported: false,
      notes: ["当前插件仅支持 Linux 宿主环境"]
    };
  }

  if (normalizedLibc !== "glibc" && normalizedLibc !== "musl") {
    return {
      os: normalizedOs,
      arch: normalizedArch,
      libc: normalizedLibc,
      platformKey: "unsupported",
      supported: false,
      notes: [`无法识别当前宿主的 libc 类型，暂时无法安全匹配到 ${SUPPORTED_MANAGED_PLATFORM_TEXT}`]
    };
  }

  if (normalizedArch === "x86_64") {
    return {
      os: normalizedOs,
      arch: normalizedArch,
      libc: normalizedLibc,
      platformKey: `linux-x86_64-${normalizedLibc}`,
      supported: true,
      notes: []
    };
  }

  if (normalizedArch === "arm64") {
    return {
      os: normalizedOs,
      arch: normalizedArch,
      libc: normalizedLibc,
      platformKey: `linux-arm64-${normalizedLibc}`,
      supported: true,
      notes: []
    };
  }

  if (normalizedArch === "armv7") {
    if (normalizedLibc !== "glibc") {
      return {
        os: normalizedOs,
        arch: normalizedArch,
        libc: normalizedLibc,
        platformKey: "unsupported",
        supported: false,
        notes: ["当前 armv7 宿主暂时只计划支持 glibc bundle，musl 版本还未纳入发布矩阵"]
      };
    }
    return {
      os: normalizedOs,
      arch: normalizedArch,
      libc: normalizedLibc,
      platformKey: "linux-armv7-glibc",
      supported: true,
      notes: String(arch || "").trim().toLowerCase() === "armv6l"
        ? ["当前设备是 armv6l，插件先按 linux-armv7-glibc 兼容模式处理"]
        : []
    };
  }

  return {
    os: normalizedOs,
    arch: normalizedArch || "unknown",
    libc: normalizedLibc,
    platformKey: "unsupported",
    supported: false,
    notes: [`无法映射到 ${SUPPORTED_MANAGED_PLATFORM_TEXT}`]
  };
}

async function detectPlatform(songloft: SongloftCommandApi): Promise<MpdPlatformPayload> {
  const cached = readTimedCache(platformCacheEntry);
  if (cached) {
    return cached;
  }
  const [os, arch, libc] = await Promise.all([
    getUnameValue(songloft, "-s"),
    getUnameValue(songloft, "-m"),
    detectHostLibc(songloft)
  ]);
  const detected = mapPlatform(os, arch, libc);
  platformCacheEntry = writeTimedCache(detected, PLATFORM_CACHE_TTL_MS);
  return detected;
}

async function resolveBinary(songloft: SongloftCommandApi, kind: "mpd" | "mpc"): Promise<ResolvedBinary> {
  const cached = readTimedCache(resolvedBinaryCache[kind]);
  if (cached) {
    return cached;
  }
  const platform = await detectPlatform(songloft);
  const packagedBinaryPath = getPackagedBinaryPath(platform, kind);
  const packagedBinaryProgram = getPackagedBinaryProgram(platform, kind);
  const packagedExecutableAvailable = packagedBinaryProgram
    ? await canExecBinary(songloft, packagedBinaryProgram, kind)
    : false;

  if (packagedExecutableAvailable) {
    const resolved = {
      program: packagedBinaryProgram,
      source: "packaged-bin",
      exists: true,
      executableAvailable: true,
      filename: packagedBinaryPath,
      launchMode: "direct"
    };
    resolvedBinaryCache[kind] = writeTimedCache(resolved, RESOLVED_BINARY_CACHE_TTL_MS);
    return resolved;
  }

  const managedBinaryFilename = getManagedBinaryFilename(kind);
  const pluginBinExists = await songloft.command.exists(managedBinaryFilename).catch(() => false);

  if (pluginBinExists) {
    const executableAvailable = await canExecManagedBinary(songloft, managedBinaryFilename, kind);
    const resolved = {
      program: getManagedBinaryShellProgram(managedBinaryFilename),
      source: "plugin-bin",
      exists: true,
      executableAvailable,
      filename: managedBinaryFilename,
      launchMode: "shell"
    };
    resolvedBinaryCache[kind] = writeTimedCache(resolved, RESOLVED_BINARY_CACHE_TTL_MS);
    return resolved;
  }

  const versionCheckArgs = getVersionCheckArgs(kind);
  const pathResolved = await findExecutableCandidate(songloft, [kind], versionCheckArgs);
  if (pathResolved) {
    const resolved = {
      program: pathResolved.program,
      source: "system-path",
      exists: true,
      executableAvailable: true,
      filename: pathResolved.program,
      launchMode: "direct"
    };
    resolvedBinaryCache[kind] = writeTimedCache(resolved, RESOLVED_BINARY_CACHE_TTL_MS);
    return resolved;
  }

  const absoluteResolved = await findExecutableCandidate(songloft, getAbsoluteSystemBinaryCandidates(kind), versionCheckArgs);
  if (absoluteResolved) {
    const resolved = {
      program: absoluteResolved.program,
      source: "system-path",
      exists: true,
      executableAvailable: true,
      filename: absoluteResolved.program,
      launchMode: "direct"
    };
    resolvedBinaryCache[kind] = writeTimedCache(resolved, RESOLVED_BINARY_CACHE_TTL_MS);
    return resolved;
  }

  const shellResolved = await findExecutableViaShell(songloft, kind);
  if (shellResolved) {
    const resolved = {
      program: shellResolved,
      source: "system-path",
      exists: true,
      executableAvailable: true,
      filename: shellResolved,
      launchMode: "shell"
    };
    resolvedBinaryCache[kind] = writeTimedCache(resolved, RESOLVED_BINARY_CACHE_TTL_MS);
    return resolved;
  }

  const resolved = {
    program: kind,
    source: "missing",
    exists: false,
    executableAvailable: false,
    filename: packagedBinaryPath || kind,
    launchMode: "direct"
  };
  resolvedBinaryCache[kind] = writeTimedCache(resolved, RESOLVED_BINARY_CACHE_TTL_MS);
  return resolved;
}

async function detectSupportedAudioOutputTypes(songloft: SongloftCommandApi): Promise<{ program: string; supportedTypes: string[]; rawVersion: string }> {
  const resolvedMpd = await resolveBinary(songloft, "mpd");
  if (!resolvedMpd.executableAvailable) {
    return {
      program: resolvedMpd.program,
      supportedTypes: [],
      rawVersion: ""
    };
  }

  const versionResult = await execResolvedCommand(songloft, resolvedMpd, getVersionCheckArgs("mpd"));
  const rawVersion = [versionResult?.stdout || "", versionResult?.stderr || ""].join("\n").toLowerCase();
  const supportedTypes: string[] = [];

  ["pipewire", "pulse", "alsa", "null"].forEach((type) => {
    if (rawVersion.indexOf(type) >= 0) {
      supportedTypes.push(type);
    }
  });

  return {
    program: resolvedMpd.program,
    supportedTypes,
    rawVersion
  };
}

async function detectAudioOutput(songloft: SongloftCommandApi): Promise<MpdAudioOutputDetection> {
  const [supportInfo, storedPreferences, xdgRuntimeDir, pulseServer, pipewireRemote, pactlInfo, aplayList, userId, runtimeShellProbe, runtimeAudioServiceProbe] = await Promise.all([
    detectSupportedAudioOutputTypes(songloft),
    readAudioPreferences(songloft),
    readEnvVar(songloft, "XDG_RUNTIME_DIR"),
    readEnvVar(songloft, "PULSE_SERVER"),
    readEnvVar(songloft, "PIPEWIRE_REMOTE"),
    tryExec(songloft, "pactl", ["info"]),
    tryExec(songloft, "aplay", ["-l"]),
    readUserId(songloft),
    execShell(
      songloft,
      [
        "id 2>&1 || true",
        "groups 2>&1 || true",
        "printf 'APLAY_PATH='; command -v aplay 2>/dev/null || true; printf '\\n'",
        "printf 'DEV_SND='; if [ -d /dev/snd ]; then printf 'yes\\n'; ls -l /dev/snd 2>&1 || true; else printf 'no\\n'; fi",
        "printf 'PROC_ASOUND='; if [ -f /proc/asound/cards ]; then printf 'yes\\n'; cat /proc/asound/cards 2>&1 || true; else printf 'no\\n'; fi"
      ].join("\n"),
      { timeout: 5_000 }
    ).catch(() => null),
    execShell(
      songloft,
      [
        "printf 'ENV_XDG_RUNTIME_DIR=%s\\n' \"${XDG_RUNTIME_DIR:-}\"",
        "printf 'ENV_PULSE_SERVER=%s\\n' \"${PULSE_SERVER:-}\"",
        "printf 'ENV_PIPEWIRE_REMOTE=%s\\n' \"${PIPEWIRE_REMOTE:-}\"",
        "for dir in /run/user/*; do",
        "  [ -d \"$dir\" ] || continue",
        "  if [ -S \"$dir/pulse/native\" ]; then",
        "    printf 'PULSE_SOCKET_FOUND=%s\\n' \"$dir/pulse/native\"",
        "    ls -ld \"$dir\" \"$dir/pulse\" \"$dir/pulse/native\" 2>&1 || true",
        "  fi",
        "  if [ -S \"$dir/pipewire-0\" ]; then",
        "    printf 'PIPEWIRE_SOCKET_FOUND=%s\\n' \"$dir/pipewire-0\"",
        "    ls -ld \"$dir\" \"$dir/pipewire-0\" 2>&1 || true",
        "  fi",
        "done",
        "if command -v pactl >/dev/null 2>&1; then",
        "  printf 'PACTL_INFO_BEGIN\\n'",
        "  pactl info 2>&1 || true",
        "  printf 'PACTL_INFO_END\\n'",
        "  printf 'PACTL_DEFAULT_SINK='",
        "  pactl get-default-sink 2>&1 || true",
        "  printf '\\nPACTL_SINKS_BEGIN\\n'",
        "  pactl list short sinks 2>&1 || true",
        "  printf 'PACTL_SINKS_END\\n'",
        "else",
        "  printf 'PACTL_MISSING=yes\\n'",
        "fi"
      ].join("\n"),
      { timeout: 8_000 }
    ).catch(() => null)
  ]);

  const supportedTypes = supportInfo.supportedTypes;
  const notes: string[] = [];
  const candidates: MpdAudioOutputCandidate[] = [];
  const env: Record<string, string> = {};
  const manualAlsaRequested = storedPreferences.outputType === "alsa" || !!storedPreferences.alsaDevice;
  let effectiveRuntimeDir = storedPreferences.xdgRuntimeDir || xdgRuntimeDir;
  let effectivePulseServer = storedPreferences.pulseServer || pulseServer;
  let effectivePipewireRemote = storedPreferences.pipewireRemote || pipewireRemote;
  const detectedSocketInfo = await detectHostAudioSocketInfo(songloft, userId);

  if (storedPreferences.hasOverrides) {
    notes.push("当前已启用手动音频覆盖配置，自动探测结果将与手动配置合并后再决策");
  }
  if (storedPreferences.outputType !== "auto") {
    notes.push(`当前手动指定的输出类型为 ${storedPreferences.outputType}`);
  }

  if (!effectiveRuntimeDir && userId) {
    const fallbackRuntimeDir = `/run/user/${userId}`;
    const fallbackRuntimeDirExists = await canExec(songloft, "/bin/sh", ["-lc", `test -d "${fallbackRuntimeDir.replace(/"/g, '\\"')}"`]);
    if (fallbackRuntimeDirExists) {
      effectiveRuntimeDir = fallbackRuntimeDir;
      notes.push(`当前进程未暴露 XDG_RUNTIME_DIR，已自动回退到 ${fallbackRuntimeDir}`);
    }
  }

  if (!effectiveRuntimeDir && detectedSocketInfo.runtimeDir) {
    effectiveRuntimeDir = detectedSocketInfo.runtimeDir;
    notes.push(`已从宿主音频 socket 自动识别到运行目录 ${detectedSocketInfo.runtimeDir}`);
  }

  if (!effectivePulseServer && pactlInfo && pactlInfo.exitCode === 0) {
    effectivePulseServer = parsePulseServerFromPactlInfo(pactlInfo.stdout || "");
    if (effectivePulseServer) {
      notes.push("已从 pactl info 中解析到可用的 PulseAudio 服务器地址");
    }
  }

  if (!effectivePulseServer && detectedSocketInfo.pulseServer) {
    effectivePulseServer = detectedSocketInfo.pulseServer;
    notes.push(`已从宿主音频 socket 自动识别到 PulseAudio 服务地址 ${detectedSocketInfo.pulseServer}`);
  }

  if (!effectivePipewireRemote && detectedSocketInfo.pipewireRemote) {
    effectivePipewireRemote = detectedSocketInfo.pipewireRemote;
    notes.push(`已从宿主音频 socket 自动识别到 PipeWire Remote ${detectedSocketInfo.pipewireRemote}`);
  }

  if (effectiveRuntimeDir) {
    env.XDG_RUNTIME_DIR = effectiveRuntimeDir;
  }
  if (effectivePulseServer) {
    env.PULSE_SERVER = effectivePulseServer;
  }
  if (effectivePipewireRemote) {
    env.PIPEWIRE_REMOTE = effectivePipewireRemote;
  }

  const pipewireSocketPath = effectiveRuntimeDir ? `${effectiveRuntimeDir}/pipewire-0` : "";
  const pulseSocketPath = effectiveRuntimeDir ? `${effectiveRuntimeDir}/pulse/native` : "";
  const pulseServerSocketPath = getPulseUnixSocketPath(effectivePulseServer);

  const [pipewireSocketExists, pulseSocketExists, pulseServerSocketExists, alsaCardsExists, devSndExists] = await Promise.all([
    pipewireSocketPath ? canExec(songloft, "/bin/sh", ["-lc", `test -S "${pipewireSocketPath.replace(/"/g, '\\"')}"`]) : Promise.resolve(false),
    pulseSocketPath ? canExec(songloft, "/bin/sh", ["-lc", `test -S "${pulseSocketPath.replace(/"/g, '\\"')}"`]) : Promise.resolve(false),
    pulseServerSocketPath ? canExec(songloft, "/bin/sh", ["-lc", `test -S "${pulseServerSocketPath.replace(/"/g, '\\"')}"`]) : Promise.resolve(false),
    canExec(songloft, "/bin/sh", ["-lc", 'test -e "/proc/asound/cards"']),
    canExec(songloft, "/bin/sh", ["-lc", 'test -d "/dev/snd"'])
  ]);

  const pulseUsesUnixSocket = !!pulseServerSocketPath;
  const pulseServerReachable =
    !effectivePulseServer
      ? false
      : pulseUsesUnixSocket
        ? pulseServerSocketExists
        : true;
  const pulseReachable = pulseServerReachable || pulseSocketExists || !!(pactlInfo && pactlInfo.exitCode === 0);
  const pipewireReachable = pipewireSocketExists || (effectivePipewireRemote && effectivePipewireRemote !== "null");
  const alsaReachable =
    manualAlsaRequested ||
    alsaCardsExists ||
    devSndExists ||
    !!(aplayList && aplayList.exitCode === 0 && /card\s+\d+/i.test(aplayList.stdout || ""));
  const probeOutput = runtimeShellProbe && runtimeShellProbe.exitCode === 0 ? String(runtimeShellProbe.stdout || "") : "";
  const probeDevSnd = extractProbeSection(probeOutput, "DEV_SND");
  const runtimePlaybackDevices = parseRuntimePlaybackDevices(probeDevSnd);
  const aplayPlaybackDevices = aplayList && aplayList.exitCode === 0
    ? parseAplayPlaybackDevices(aplayList.stdout || "")
    : [];
  const detectedAlsaDevices = mergeDetectedAlsaDevices(runtimePlaybackDevices, aplayPlaybackDevices);
  const resolvedAlsaDevice = resolvePreferredAlsaDevice(storedPreferences.alsaDevice || "", detectedAlsaDevices, notes);

  if (supportedTypes.length) {
    notes.push(`mpd --version 当前识别到的音频输出插件: ${supportedTypes.join(", ")}`);
  } else {
    notes.push("mpd --version 中未识别到 pulse、alsa、pipewire、null 等常见音频输出插件");
  }
  if (effectiveRuntimeDir) {
    notes.push(`当前有效的 XDG_RUNTIME_DIR 为 ${effectiveRuntimeDir}`);
  } else {
    notes.push("当前未拿到可用的 XDG_RUNTIME_DIR，用户态音频 socket 可能不可达");
  }
  if (effectivePulseServer && pulseUsesUnixSocket && !pulseServerSocketExists) {
    notes.push(`当前 PULSE_SERVER 指向 ${effectivePulseServer}，但对应 Unix socket 在插件运行时不可达`);
  }
  if (pactlInfo && pactlInfo.exitCode === 0) {
    notes.push("宿主可执行 pactl info，说明当前用户态音频服务至少部分可见");
  } else {
    notes.push("宿主无法成功执行 pactl info，PulseAudio/pipewire-pulse 探测能力受限");
  }
  if (aplayList && aplayList.exitCode === 0) {
    notes.push("宿主可执行 aplay -l，可用于探测 ALSA 设备");
  } else {
    notes.push("宿主无法成功执行 aplay -l，ALSA 设备探测将依赖 /proc/asound/cards");
  }
  if (devSndExists) {
    notes.push("检测到 /dev/snd 目录，更符合 Debian 服务端或无桌面环境下的 ALSA 直连场景");
  } else {
    notes.push("当前未检测到 /dev/snd 目录，宿主可能没有暴露内核声卡设备");
  }
  if (runtimeShellProbe && runtimeShellProbe.exitCode === 0) {
    const probeLines = probeOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const probeId = probeLines[0] || "";
    const probeGroups = probeLines[1] || "";
    const probeAplayPath = extractProbeSection(probeOutput, "APLAY_PATH");
    const probeProcAsound = extractProbeSection(probeOutput, "PROC_ASOUND");
    if (probeId) {
      notes.push(`运行时探针 id: ${trimToSingleLine(probeId)}`);
    }
    if (probeGroups) {
      notes.push(`运行时探针 groups: ${trimToSingleLine(probeGroups)}`);
    }
    notes.push(`运行时探针 aplay 路径: ${trimToSingleLine(probeAplayPath || "<missing>")}`);
    notes.push(`运行时探针 /dev/snd: ${trimToSingleLine(probeDevSnd || "<missing>")}`);
    notes.push(`运行时探针 /proc/asound/cards: ${trimToSingleLine(probeProcAsound || "<missing>")}`);
  } else {
    notes.push("运行时探针未成功返回，暂时无法确认插件进程里的 ALSA 可见性");
  }
  if (runtimeAudioServiceProbe && runtimeAudioServiceProbe.exitCode === 0) {
    const audioProbeOutput = String(runtimeAudioServiceProbe.stdout || "");
    const envProbeRuntimeDir = parseDetectedSocketProbeValue(audioProbeOutput, "ENV_XDG_RUNTIME_DIR");
    const envProbePulseServer = parseDetectedSocketProbeValue(audioProbeOutput, "ENV_PULSE_SERVER");
    const envProbePipewireRemote = parseDetectedSocketProbeValue(audioProbeOutput, "ENV_PIPEWIRE_REMOTE");
    const pulseSocketFound = parseDetectedSocketProbeValue(audioProbeOutput, "PULSE_SOCKET_FOUND");
    const pipewireSocketFound = parseDetectedSocketProbeValue(audioProbeOutput, "PIPEWIRE_SOCKET_FOUND");
    const pactlDefaultSink = parseDetectedSocketProbeValue(audioProbeOutput, "PACTL_DEFAULT_SINK");
    const pactlInfoBlock = (audioProbeOutput.match(/PACTL_INFO_BEGIN\r?\n([\s\S]*?)\r?\nPACTL_INFO_END/) || [])[1] || "";
    const pactlSinksBlock = (audioProbeOutput.match(/PACTL_SINKS_BEGIN\r?\n([\s\S]*?)PACTL_SINKS_END/) || [])[1] || "";
    const pactlInfoSummary = trimToSingleLine(pactlInfoBlock);
    const pactlSinksSummary = trimToSingleLine(pactlSinksBlock);

    notes.push(`Pulse 探针环境 XDG_RUNTIME_DIR: ${envProbeRuntimeDir || "<empty>"}`);
    notes.push(`Pulse 探针环境 PULSE_SERVER: ${envProbePulseServer || "<empty>"}`);
    notes.push(`Pulse 探针环境 PIPEWIRE_REMOTE: ${envProbePipewireRemote || "<empty>"}`);
    notes.push(`Pulse 探针找到的 socket: ${pulseSocketFound || "<missing>"}`);
    notes.push(`PipeWire 探针找到的 socket: ${pipewireSocketFound || "<missing>"}`);
    if (pactlInfoSummary) {
      notes.push(`pactl info 摘要: ${pactlInfoSummary}`);
    } else if (audioProbeOutput.includes("PACTL_MISSING=yes")) {
      notes.push("Pulse 探针未找到 pactl，可用 sink 与默认设备无法直接枚举");
    }
    if (pactlDefaultSink) {
      notes.push(`Pulse 探针默认 sink: ${pactlDefaultSink}`);
    }
    if (pactlSinksSummary) {
      notes.push(`Pulse 探针 sinks: ${pactlSinksSummary}`);
    }
  } else {
    notes.push("Pulse/PipeWire 运行时探针未成功返回，当前无法确认默认 sink 与 socket 权限");
  }

  if (supportedTypes.indexOf("pipewire") >= 0 && pipewireReachable) {
    notes.push("检测到 MPD 支持 PipeWire，且当前用户会话存在 PipeWire 套接字");
    candidates.push({
      type: "pipewire",
      name: "Songloft PipeWire Output",
      lines: [
        'audio_output {',
        '  type "pipewire"',
        '  name "Songloft PipeWire Output"',
        '  mixer_type "software"',
        '}'
      ],
      reason: "匹配用户会话中的 PipeWire 服务"
    });
  }

  if (supportedTypes.indexOf("pulse") >= 0 && pulseReachable) {
    const lines = [
      'audio_output {',
      '  type "pulse"',
      '  name "Songloft Pulse Output"',
      '  mixer_type "software"'
    ];
    if (effectivePulseServer && pulseServerReachable) {
      lines.push(`  server "${effectivePulseServer.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
      notes.push("检测到 PULSE_SERVER，启动 MPD 时将显式透传 PulseAudio 服务地址");
    } else if (pulseSocketExists) {
      lines.push(`  server "unix:${pulseSocketPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
      notes.push("检测到用户态 PulseAudio 套接字，将优先连接该 Unix socket");
    } else if (pactlInfo && pactlInfo.exitCode === 0) {
      notes.push("检测到 pactl 可访问当前音频服务，将回退使用 PulseAudio 默认服务器");
    }
    lines.push("}");

    candidates.push({
      type: "pulse",
      name: "Songloft Pulse Output",
      lines,
      reason: "兼容 PulseAudio 以及 pipewire-pulse 场景"
    });
  }

  if (supportedTypes.indexOf("alsa") >= 0 && alsaReachable) {
    notes.push("检测到 ALSA 设备，可作为桌面声卡与服务器环境的稳妥回退");
    candidates.push(buildAlsaAudioOutputCandidate(
      resolvedAlsaDevice || "default",
      storedPreferences.alsaDevice
        ? resolvedAlsaDevice === storedPreferences.alsaDevice
          ? `使用手动指定的 ALSA 设备 ${storedPreferences.alsaDevice}`
          : `手动指定的 ALSA 设备 ${storedPreferences.alsaDevice} 在当前运行时无对应播放节点，已回退到 ${resolvedAlsaDevice}`
        : devSndExists
          ? `检测到 /dev/snd，可直接尝试 ALSA 设备输出（优先 ${resolvedAlsaDevice || "default"}）`
          : "检测到 ALSA 声卡或 aplay 可列出音频设备"
    ));
  }

  if (supportedTypes.indexOf("pulse") < 0) {
    notes.push("未把 PulseAudio 加入候选：当前 mpd --version 未识别到 pulse 输出插件");
  } else if (!pulseReachable) {
    notes.push("未把 PulseAudio 加入候选：当前 PULSE_SERVER 不可达，且 Pulse socket / pactl info 也不可用");
  }

  if (supportedTypes.indexOf("alsa") < 0) {
    notes.push("未把 ALSA 加入候选：当前 mpd --version 未识别到 alsa 输出插件");
  } else if (!alsaReachable) {
    notes.push("未把 ALSA 加入候选：未检测到 /proc/asound/cards、/dev/snd，且 aplay -l 也未列出声卡");
  }

  if (supportedTypes.indexOf("pipewire") < 0) {
    notes.push("未把 PipeWire 加入候选：当前 mpd --version 未识别到 pipewire 输出插件");
  } else if (!pipewireReachable) {
    notes.push("未把 PipeWire 加入候选：未检测到 pipewire socket，且 PIPEWIRE_REMOTE 也不可用");
  }

  if (!candidates.length && supportedTypes.indexOf("null") >= 0) {
    notes.push("未检测到可直接出声的音频后端，先使用 null 输出保证 MPD 能启动并返回诊断信息");
    candidates.push({
      type: "null",
      name: "Songloft Null Output",
      lines: [
        'audio_output {',
        '  type "null"',
        '  name "Songloft Null Output"',
        '}'
      ],
      reason: "兜底输出，便于排查环境问题"
    });
  }

  if (!supportedTypes.length) {
    notes.push("未能从 mpd --version 中识别出音频输出插件，配置将优先尝试 ALSA 兜底");
    candidates.push(buildAlsaAudioOutputCandidate(
      resolvedAlsaDevice || "default",
      "无法识别输出插件时的传统兼容兜底"
    ));
  }

  if (!candidates.length) {
    notes.push("未检测到 PipeWire、PulseAudio 或 ALSA 设备，且当前 mpd 也未暴露 null 输出插件");
    candidates.push(buildAlsaAudioOutputCandidate(
      resolvedAlsaDevice || "default",
      "最后回退到 ALSA"
    ));
  }

  const guidance = buildAudioGuidance(
    candidates,
    supportedTypes,
    detectedAlsaDevices,
    resolvedAlsaDevice || "",
    pulseReachable,
    pipewireReachable
  );
  let selected = selectPreferredAudioOutput(candidates, notes);
  if (storedPreferences.outputType !== "auto") {
    const forcedCandidate = candidates.find((candidate) => candidate.type === storedPreferences.outputType);
    if (forcedCandidate) {
      selected = forcedCandidate;
      notes.push(`已按手动配置强制选择 ${forcedCandidate.type} 输出`);
    } else {
      notes.push(`手动指定了 ${storedPreferences.outputType}，但当前未能生成对应候选，已回退到 ${selected.type}`);
    }
  }
  notes.push(`本次自动选择的音频输出为 ${selected.type} (${selected.name})`);

  return {
    selected,
    candidates,
    supportedTypes,
    notes,
    env,
    preferences: storedPreferences,
    guidance
  };
}

async function getBinaryItemStatus(
  songloft: SongloftCommandApi,
  kind: "mpd" | "mpc"
): Promise<BinaryItemStatus> {
  const resolved = await resolveBinary(songloft, kind);

  return {
    kind,
    pluginBinExists: resolved.source === "plugin-bin" || resolved.source === "packaged-bin",
    executableAvailable: resolved.executableAvailable,
    source: resolved.source,
    filename: resolved.filename
  };
}

async function createDefaultMpdConfig(songloft: SongloftCommandApi, runtimeFiles: RuntimeFilesSnapshot) {
  const audioDetection = await detectAudioOutput(songloft);
  await writeAudioOutputSnapshot(songloft, {
    selectedType: audioDetection.selected.type,
    selectedName: audioDetection.selected.name,
    notes: audioDetection.notes
  });

  return [
    '# Generated by Songloft MPD plugin',
    '# Local library songs are relayed to MPD through Songloft-hosted /music/... URLs.',
    '# Runtime files are stored in a command-side temp directory because the host fs API is sandboxed.',
    `# Selected audio output: ${audioDetection.selected.type} (${audioDetection.selected.reason})`,
    `playlist_directory "${runtimeFiles.playlistDir}"`,
    `log_file "${runtimeFiles.logPath}"`,
    `pid_file "${runtimeFiles.pidPath}"`,
    `state_file "${runtimeFiles.statePath}"`,
    `sticker_file "${runtimeFiles.stickerPath}"`,
    'bind_to_address "127.0.0.1"',
    'port "6600"',
    'restore_paused "yes"',
    'follow_outside_symlinks "yes"',
    'follow_inside_symlinks "yes"',
    'filesystem_charset "UTF-8"',
    ...audioDetection.selected.lines,
    'input {',
    '  plugin "curl"',
    '}',
    ''
  ].join("\n");
}

async function ensureRuntimeLayout(songloft: SongloftCommandApi) {
  await ensureRuntimeFiles(songloft);
}

async function cleanupManagedRuntimeFiles(songloft: SongloftCommandApi): Promise<void> {
  const runtimeFiles = await readRuntimeFilesSnapshot(songloft);
  if (!runtimeFiles?.rootDir) {
    await clearRuntimeFilesSnapshot(songloft);
    return;
  }

  const cleanupResult = await execShell(
    songloft,
    `if [ -d ${shellQuote(runtimeFiles.rootDir)} ]; then rm -rf ${shellQuote(runtimeFiles.rootDir)}; fi`,
    { timeout: 15_000 }
  ).catch(() => null);

  if (!cleanupResult || cleanupResult.exitCode !== 0) {
    const details = trimToSingleLine(cleanupResult?.stderr || cleanupResult?.stdout || "");
    throw new Error(details || "无法清理 MPD 运行时目录");
  }

  await clearRuntimeFilesSnapshot(songloft);
}

async function stopManagedMpdViaPidFile(
  songloft: SongloftCommandApi,
  runtimeFiles: RuntimeFilesSnapshot | null
): Promise<boolean> {
  if (!runtimeFiles?.pidPath) {
    return false;
  }

  const stopResult = await execShell(
    songloft,
    [
      `if [ ! -f ${shellQuote(runtimeFiles.pidPath)} ]; then exit 2; fi`,
      `pid=$(tr -cd '0-9' < ${shellQuote(runtimeFiles.pidPath)})`,
      'if [ -z "$pid" ]; then exit 2; fi',
      'if ! kill -0 "$pid" >/dev/null 2>&1; then exit 0; fi',
      'kill "$pid" >/dev/null 2>&1 || true',
      'attempts=0',
      'while kill -0 "$pid" >/dev/null 2>&1 && [ "$attempts" -lt 10 ]; do',
      '  sleep 0.2',
      '  attempts=$((attempts + 1))',
      'done',
      'if kill -0 "$pid" >/dev/null 2>&1; then',
      '  kill -9 "$pid" >/dev/null 2>&1 || true',
      'fi',
      'attempts=0',
      'while kill -0 "$pid" >/dev/null 2>&1 && [ "$attempts" -lt 10 ]; do',
      '  sleep 0.1',
      '  attempts=$((attempts + 1))',
      'done',
      'if kill -0 "$pid" >/dev/null 2>&1; then exit 1; fi',
      `rm -f ${shellQuote(runtimeFiles.pidPath)} >/dev/null 2>&1 || true`,
      'exit 0'
    ].join("\n"),
    { timeout: 5_000 }
  ).catch(() => null);

  return !!stopResult && stopResult.exitCode === 0;
}

async function ensureConfigFile(songloft: SongloftCommandApi) {
  const runtimeFiles = await ensureRuntimeFiles(songloft);
  await ensureRuntimeLayout(songloft);
  const configText = await createDefaultMpdConfig(songloft, runtimeFiles);
  const hereDocMarker = "SONGLOFT_MPD_CONFIG_EOF";
  const writeResult = await execShell(
    songloft,
    [
      `mkdir -p ${shellQuote(runtimeFiles.rootDir)}`,
      `mkdir -p ${shellQuote(runtimeFiles.playlistDir || runtimeFiles.rootDir)}`,
      `cat > ${shellQuote(runtimeFiles.configPath)} <<'${hereDocMarker}'`,
      configText,
      hereDocMarker
    ].join("\n"),
    { timeout: 10_000 }
  );
  if (writeResult.exitCode !== 0) {
    throw new Error(writeResult.stderr || writeResult.stdout || "无法写入 MPD 配置文件");
  }
}

function createEmptyPlayerState(): PlayerStatePayload {
  return {
    serviceStatus: "not_installed",
    playbackStatus: "stopped",
    managedByPlugin: false,
    mpdAvailable: false,
    mpcAvailable: false,
    currentSong: null,
    volume: null,
    mode: {
      repeat: false,
      random: false,
      single: false,
      consume: false
    },
    progress: {
      currentSeconds: 0,
      totalSeconds: 0,
      currentLabel: "00:00",
      totalLabel: "00:00"
    },
    lyrics: {
      source: "none",
      available: false,
      lines: []
    },
    raw: {
      current: "",
      status: ""
    }
  };
}

export async function getPlayerState(songloft: SongloftCommandApi): Promise<PlayerStatePayload> {
  const startTime = Date.now(); // v1.0.8优化：添加性能监控
  const state = createEmptyPlayerState();

  const [resolvedMpd, resolvedMpc, managedRunning] = await Promise.all([
    resolveBinary(songloft, "mpd"),
    resolveBinary(songloft, "mpc"),
    songloft.command.isRunning(MPD_PROCESS_NAME).catch(() => false)
  ]);

  state.mpdAvailable = resolvedMpd.executableAvailable;
  state.mpcAvailable = resolvedMpc.executableAvailable;
  state.managedByPlugin = managedRunning;

  if (!resolvedMpd.executableAvailable || !resolvedMpc.executableAvailable) {
    // v1.0.8优化：记录性能指标
    const latency = Date.now() - startTime;
    recordMetrics('getPlayerState', latency, false);
    return state;
  }

  const [currentResult, statusResult] = await Promise.all([
    execResolvedCommand(songloft, resolvedMpc, ["current"]),
    execResolvedCommand(songloft, resolvedMpc, ["status"])
  ]);

  if (!statusResult || statusResult.exitCode !== 0) {
    state.serviceStatus = "stopped";
    // v1.0.8优化：记录性能指标
    const latency = Date.now() - startTime;
    recordMetrics('getPlayerState', latency, false);
    return state;
  }

  state.serviceStatus = "running";
  state.raw.current = currentResult?.stdout || "";
  state.raw.status = statusResult.stdout || "";

  const lines = statusResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const statusLine = lines.find((line) => line.indexOf("[") >= 0) || "";
  const optionLine = lines.find((line) => line.indexOf("volume:") >= 0) || "";

  const parsedStatus = parseStatusLine(statusLine);
  const parsedOptions = parseOptionLine(optionLine);

  state.playbackStatus = parsedStatus.playbackStatus;
  const nowMs = Date.now();
  state.progress = {
    currentSeconds: parsedStatus.currentSeconds,
    totalSeconds: parsedStatus.totalSeconds,
    currentLabel: formatTime(parsedStatus.currentSeconds),
    totalLabel: formatTime(parsedStatus.totalSeconds),
    sampledAt: nowMs
  };
  state.volume = parsedOptions.volume;
  state.mode = {
    repeat: parsedOptions.repeat,
    random: parsedOptions.random,
    single: parsedOptions.single,
    consume: parsedOptions.consume
  };
  state.currentSong = parseCurrentLine(currentResult?.stdout || "");

  const matchedSong = await resolveMatchedSong(songloft, state.currentSong);
  if (state.currentSong && matchedSong.song) {
    state.currentSong.songId = String(matchedSong.song.id);
    state.currentSong.title = String(matchedSong.song.title || state.currentSong.title || "").trim() || state.currentSong.title;
    state.currentSong.artist = String(matchedSong.song.artist || state.currentSong.artist || "").trim() || state.currentSong.artist;
    state.currentSong.album = String(matchedSong.song.album || state.currentSong.album || "").trim() || state.currentSong.album;
  }

  let lyricsText = "";
  let lyricsSource = "none";
  try {
    if (matchedSong.song && matchedSong.song.id) {
      lyricsText = await fetchSongLyricsFromApi(songloft, matchedSong.song.id);
      if (lyricsText) {
        lyricsSource = "api";
      }
    }
  } catch (error) {
    songloft.log.warn("Failed to fetch lyrics: " + String(error));
  }
  if (!lyricsText) {
    lyricsText = readLyricsText(matchedSong.song);
    if (lyricsText) {
      lyricsSource = "library";
    }
  }
  lyricsText = extractLyricContent(lyricsText);
  const parsedLyrics = deduplicateLyricLines(parseLrc(lyricsText));
  const lyricLines = parsedLyrics.length ? parsedLyrics : buildFallbackLyrics(state.currentSong);
  state.lyrics = {
    source: parsedLyrics.length ? lyricsSource : (state.currentSong ? "fallback" : "none"),
    available: lyricLines.length > 0,
    lines: lyricLines
  };

  // v1.0.8优化：记录性能指标
  const latency = Date.now() - startTime;
  recordMetrics('getPlayerState', latency, false);

  state.progress.sampledAt = Date.now();

  return state;
}

export async function getMpdRuntimeStatus(songloft: SongloftCommandApi): Promise<MpdRuntimePayload> {
  const runtimeFiles = await readRuntimeFilesSnapshot(songloft);
  const [playerState, configExists, audioSnapshot, audioDetection, logContent, resolvedMpd] = await Promise.all([
    getPlayerState(songloft),
    runtimeFiles?.configPath ? shellPathExists(songloft, runtimeFiles.configPath) : Promise.resolve(false),
    readAudioOutputSnapshot(songloft),
    detectAudioOutput(songloft),
    readMpdLog(songloft),
    resolveBinary(songloft, "mpd")
  ]);
  const audioPreferences = audioDetection.preferences;

  const notes: string[] = [];
  const recentLogTail = getRecentLogTail(logContent, 12);
  if (!configExists) {
    notes.push("尚未生成托管 MPD 配置文件");
  }
  if (playerState.mpdAvailable && !playerState.mpcAvailable) {
    notes.push("已发现 mpd，但未发现 mpc");
  }
  if (!playerState.mpdAvailable) {
    notes.push("当前环境未发现 mpd 可执行文件");
  }
  if (!playerState.managedByPlugin) {
    notes.push("当前未检测到插件托管的 MPD 进程");
  }
  if (audioSnapshot && audioSnapshot.selectedType) {
    notes.push(`当前托管配置选择的音频输出为 ${audioSnapshot.selectedType} (${audioSnapshot.selectedName || "未命名输出"})`);
    audioSnapshot.notes.forEach((note) => {
      if (note) {
        notes.push(note);
      }
    });
  } else {
    notes.push("当前尚未记录最近一次自动选择的音频输出");
  }
  if (
    runtimeFiles?.configPath &&
    resolvedMpd.executableAvailable &&
    (audioPreferences.outputType === "alsa" || playerState.playbackStatus === "paused")
  ) {
    const probeConfigPath = runtimeFiles ? await writeForegroundProbeConfig(songloft, runtimeFiles).catch(() => "") : "";
    const foregroundProbe = await probeResolvedForegroundLaunch(
      songloft,
      resolvedMpd,
      ["--stderr", "--no-daemon", probeConfigPath || runtimeFiles.configPath]
    ).catch(() => null);
    if (foregroundProbe) {
      const stderrLines = String(foregroundProbe.stderr || foregroundProbe.combined || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 6);
      if (stderrLines.length) {
        if (probeConfigPath) {
          notes.push("前台 MPD 探针已使用临时端口配置，避免与当前托管实例争用 6600");
        }
        notes.push(`前台 MPD 探针 exit=${foregroundProbe.exitCode === null ? "running" : foregroundProbe.exitCode}`);
        stderrLines.forEach((line) => {
          notes.push(`前台 MPD stderr: ${line}`);
        });
      } else if (foregroundProbe.stillRunningAfterDelay) {
        notes.push("前台 MPD 探针在 1 秒后仍保持运行，未立即输出 stderr");
      }
    } else {
      notes.push("前台 MPD 探针未成功返回，暂时无法读取 ALSA 打开设备时报错");
    }
  }
  buildRuntimeHintsFromLog(recentLogTail).forEach((note) => {
    notes.push(note);
  });
  if (recentLogTail.length) {
    notes.push(`已读取最近 ${recentLogTail.length} 行 MPD 日志，可通过独立接口查看完整日志尾部`);
  } else {
    notes.push("当前尚未读取到 MPD 日志内容，可能是 MPD 尚未启动或尚未产生日志");
  }
  notes.push("当前托管模式优先把本地媒体库歌曲转换成 Songloft 宿主的 /music/... 受保护 URL，再交给 MPD 播放");

  return {
    serviceStatus: playerState.serviceStatus,
    managedByPlugin: playerState.managedByPlugin,
    mpdAvailable: playerState.mpdAvailable,
    mpcAvailable: playerState.mpcAvailable,
    configExists,
    configPath: runtimeFiles?.configPath || MPD_CONFIG_PATH,
    logPath: runtimeFiles?.logPath || MPD_LOG_PATH,
    mode: "managed-shell-temp-config",
    audioPreferences,
    audioGuidance: audioDetection.guidance,
    notes
  };
}

export async function getMpdLog(songloft: SongloftCommandApi) {
  const content = await readMpdLog(songloft);
  const tailLines = getRecentLogTail(content, 120);
  return {
    path: (await readRuntimeFilesSnapshot(songloft))?.logPath || MPD_LOG_PATH,
    exists: !!content,
    tailLines,
    tailText: tailLines.join("\n"),
    notes: buildRuntimeHintsFromLog(tailLines)
  };
}

export async function getMpdStartupDiagnostics(songloft: SongloftCommandApi) {
  const runtimeFiles = await readRuntimeFilesSnapshot(songloft);
  const [runtime, player, log, binary, running] = await Promise.all([
    getMpdRuntimeStatus(songloft),
    getPlayerState(songloft),
    getMpdLog(songloft),
    getBinaryStatus(songloft),
    songloft.command.isRunning(MPD_PROCESS_NAME).catch(() => false)
  ]);

  const [resolvedMpd, resolvedMpc] = await Promise.all([
    resolveBinary(songloft, "mpd"),
    resolveBinary(songloft, "mpc")
  ]);

  const mpcStatusResult = resolvedMpc.executableAvailable
    ? await execResolvedCommand(songloft, resolvedMpc, ["status"], 3_000)
    : null;
  const mpcCurrentResult = resolvedMpc.executableAvailable
    ? await execResolvedCommand(songloft, resolvedMpc, ["current"], 3_000)
    : null;
  const configContent = runtimeFiles?.configPath
    ? await readTextFileViaShell(songloft, runtimeFiles.configPath)
    : "";
  const mpdLaunchProbe = (resolvedMpd.executableAvailable && runtimeFiles?.configPath)
    ? await probeResolvedForegroundLaunch(
      songloft,
      resolvedMpd,
      ["--stdout", "--no-daemon", runtimeFiles.configPath],
      runtimeFiles?.configPath ? undefined : undefined
    )
    : null;
  const mpdStderrProbe = (resolvedMpd.executableAvailable && runtimeFiles?.configPath)
    ? await probeResolvedForegroundLaunch(
      songloft,
      resolvedMpd,
      ["--stderr", "--no-daemon", runtimeFiles.configPath]
    )
    : null;
  const startupNotes: string[] = [];
  const startupCombinedOutput = `${mpdLaunchProbe?.combined || ""}\n${mpdStderrProbe?.combined || ""}`.toLowerCase();
  if (startupCombinedOutput.includes("u_init() failed") || startupCombinedOutput.includes("u_file_access_error")) {
    startupNotes.push("MPD 在前台探针阶段即因 ICU 初始化失败退出；这通常不是配置或音频输出问题，而是当前发布的 MPD bundle 运行时依赖 ICU 数据但宿主无法访问。建议重新发布关闭 ICU 的 bundle");
  }

  return {
    processName: MPD_PROCESS_NAME,
    running,
    runtimeFiles,
    runtime,
    player,
    log,
    binary,
    resolved: {
      mpd: resolvedMpd,
      mpc: resolvedMpc
    },
    probes: {
      mpdLaunch: mpdLaunchProbe,
      mpdStderrLaunch: mpdStderrProbe,
      mpcStatus: mpcStatusResult ? {
        exitCode: mpcStatusResult.exitCode,
        stdout: mpcStatusResult.stdout,
        stderr: mpcStatusResult.stderr
      } : null,
      mpcCurrent: mpcCurrentResult ? {
        exitCode: mpcCurrentResult.exitCode,
        stdout: mpcCurrentResult.stdout,
        stderr: mpcCurrentResult.stderr
      } : null
    },
    config: {
      path: runtimeFiles?.configPath || MPD_CONFIG_PATH,
      content: configContent
    },
    startupNotes
  };
}

export async function getBinaryStatus(songloft: SongloftCommandApi): Promise<MpdBinaryPayload> {
  const [platform, binFiles, mpd, mpc] = await Promise.all([
    detectPlatform(songloft),
    songloft.command.listBin().catch(() => []),
    getBinaryItemStatus(songloft, "mpd"),
    getBinaryItemStatus(songloft, "mpc")
  ]);
  const managedDownloadUrl = getManagedBundleUrl(platform);

  const notes: string[] = [];
  notes.push("程序解析顺序为打包进插件的 bin/<platform>/，然后是插件根 bin/，最后才回退到系统 PATH");
  notes.push("设置页的一键下载会根据当前平台自动选择 MPD/MPC bundle，并托管到插件根 bin/，优先级高于系统 PATH");
  notes.push("自动下载要求压缩包内直接包含 mpd、mpc 与 lib/，并使用 .tgz / .tar.gz 自动解压到插件托管目录");
  notes.push("手动上传仅支持 .tgz / .tar.gz，成功后会解压、补权限并执行校验");
  notes.push("当宿主进程的 PATH 不完整时，系统目录探测仅作为最后兜底");
  if (!platform.supported) {
    notes.push("当前宿主平台不在插件计划支持范围内");
  }
  if (platform.supported && !managedDownloadUrl) {
    notes.push(`当前平台 ${platform.platformKey} 的自动下载地址尚未配置`);
  }
  if (mpd.source === "packaged-bin" || mpc.source === "packaged-bin") {
    notes.push("当前已支持把 MPD/MPC 按平台放到插件包内，例如 bin/linux-x86_64-glibc/mpd");
  }
  if (mpd.source === "plugin-bin" || mpc.source === "plugin-bin") {
    notes.push("当前正在使用插件托管二进制，不依赖宿主系统里通过 apt 安装的 mpd/mpc");
  }
  if (platform.supported) {
    notes.push(`当前宿主已识别为 ${platform.platformKey}，手动上传时请尽量使用带同名平台键的 bundle 文件名`);
  }
  if (mpd.source === "system-path") {
    notes.push("当前 mpd 来自系统 PATH；如需稳定复现，建议改为插件托管二进制");
  }
  if (mpc.source === "system-path") {
    notes.push("当前 mpc 来自系统 PATH；如需稳定复现，建议改为插件托管二进制");
  }
  if (!mpd.executableAvailable || !mpc.executableAvailable) {
    notes.push("当前缺少可执行的 mpd/mpc，建议优先下载插件托管二进制，或把对应平台文件直接打进插件包内的 bin/<platform>/");
  }

  return {
    platform,
    binFiles,
    mpd,
    mpc,
    managedDownload: {
      platformKey: platform.platformKey,
      url: managedDownloadUrl,
      configured: !!managedDownloadUrl
    },
    notes
  };
}

function normalizeDownloadUrl(url: string) {
  const trimmed = String(url || "").trim().replace(/^['"`\s]+|['"`\s]+$/g, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("下载地址必须以 http:// 或 https:// 开头");
  }
  return trimmed;
}

function summarizeDownloadDiagnosticOutput(value: string): string {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(" | ");
}

function inferManagedBundleDownloadFailureCause(details: string): string {
  const normalized = String(details || "").toLowerCase();
  if (
    normalized.includes("release-assets.githubusercontent.com") &&
    normalized.includes("[::1]:443")
  ) {
    if (normalized.includes("busybox")) {
      return "当前宿主只有 BusyBox wget，且它在跟随 GitHub Release 跳转后把 release-assets.githubusercontent.com 解析到了本机回环地址 ::1；这已经不是插件 URL 配置错误，而是宿主的 DNS/hosts/IPv6/代理环境问题。请优先检查宿主里的 release-assets.githubusercontent.com 解析结果，或在宿主中补装 curl / python3 后再试";
    }
    return "当前宿主在访问 GitHub Release 资产域名时，把 release-assets.githubusercontent.com 解析到了本机回环地址 ::1；这已经不是插件 URL 配置错误，而是宿主的 DNS/hosts/IPv6/代理环境问题。请优先检查宿主里的 release-assets.githubusercontent.com 解析结果";
  }
  if (normalized.includes("busybox") && normalized.includes("wget: unrecognized option: 4")) {
    return "当前宿主提供的是 BusyBox wget，它不支持 -4 参数，说明宿主里的下载工具能力较弱；如果还伴随 release-assets.githubusercontent.com -> ::1，则应优先修宿主网络解析，或补装 curl / python3";
  }
  return "";
}

function buildManagedBundleDownloadScript(url: string, outputPath: string): string {
  const pythonDownloadCode = "import socket, ssl, sys, urllib.request; _orig=socket.getaddrinfo; socket.getaddrinfo=lambda host, port, family=0, type=0, proto=0, flags=0: _orig(host, port, socket.AF_INET, type, proto, flags); ctx = ssl.create_default_context(); opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ctx)); req = urllib.request.Request(sys.argv[1], headers={'User-Agent':'Songloft-MPD-Plugin'}); response = opener.open(req, timeout=60); data = response.read(); open(sys.argv[2], 'wb').write(data)";
  const pythonInsecureDownloadCode = "import socket, ssl, sys, urllib.request; _orig=socket.getaddrinfo; socket.getaddrinfo=lambda host, port, family=0, type=0, proto=0, flags=0: _orig(host, port, socket.AF_INET, type, proto, flags); ctx = ssl._create_unverified_context(); opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ctx)); req = urllib.request.Request(sys.argv[1], headers={'User-Agent':'Songloft-MPD-Plugin'}); response = opener.open(req, timeout=60); data = response.read(); open(sys.argv[2], 'wb').write(data)";
  return [
    "unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY all_proxy ALL_PROXY no_proxy NO_PROXY 2>/dev/null || true",
    `rm -f ${shellQuote(outputPath)}`,
    'download_ok=""',
    'report_failure() {',
    '  tool_name="$1"',
    '  exit_code="$2"',
    '  log_path="$3"',
    '  printf "__DOWNLOAD_ATTEMPT__ %s exit=%s\\n" "$tool_name" "$exit_code"',
    '  if [ -f "$log_path" ]; then',
    '    sed -n "1,12p" "$log_path"',
    '  fi',
    '}',
    'try_download() {',
    '  tool_name="$1"',
    '  command_line="$2"',
    '  log_file=$(mktemp) || return 1',
    '  if sh -lc "$command_line" >"$log_file" 2>&1; then',
    `    if [ -s ${shellQuote(outputPath)} ]; then`,
    '      printf "__DOWNLOAD_OK__ %s\\n" "$tool_name"',
    '      rm -f "$log_file"',
    '      download_ok="$tool_name"',
    '      return 0',
    '    fi',
    '    report_failure "$tool_name" "empty-file" "$log_file"',
    '    rm -f "$log_file"',
    '    return 1',
    '  fi',
    '  exit_code=$?',
    '  report_failure "$tool_name" "$exit_code" "$log_file"',
    '  rm -f "$log_file"',
    '  return 1',
    '}',
    "if command -v python3 >/dev/null 2>&1; then",
    `  try_download "python3" ${shellQuote(`python3 -c ${shellQuote(pythonDownloadCode)} ${shellQuote(url)} ${shellQuote(outputPath)}`)} && exit 0`,
    "fi",
    "if command -v python >/dev/null 2>&1; then",
    `  try_download "python" ${shellQuote(`python -c ${shellQuote(pythonDownloadCode)} ${shellQuote(url)} ${shellQuote(outputPath)}`)} && exit 0`,
    "fi",
    "if command -v curl >/dev/null 2>&1; then",
    `  try_download "curl-ipv4" ${shellQuote(`curl -4 -LfsS --connect-timeout 20 --retry 2 --retry-delay 1 --noproxy '*' -o ${shellQuote(outputPath)} ${shellQuote(url)}`)} && exit 0`,
    `  try_download "curl" ${shellQuote(`curl -LfsS --connect-timeout 20 --retry 2 --retry-delay 1 --noproxy '*' -o ${shellQuote(outputPath)} ${shellQuote(url)}`)} && exit 0`,
    "fi",
    "if command -v wget >/dev/null 2>&1; then",
    '  if wget --help 2>&1 | grep -q -- " -4"; then',
    `    try_download "wget-ipv4" ${shellQuote(`wget -4 -O ${shellQuote(outputPath)} ${shellQuote(url)}`)} && exit 0`,
    "  fi",
    `  try_download "wget" ${shellQuote(`wget -O ${shellQuote(outputPath)} ${shellQuote(url)}`)} && exit 0`,
    "fi",
    "if command -v curl >/dev/null 2>&1; then",
    `  try_download "curl-insecure-ipv4" ${shellQuote(`curl -4 -k -LfsS --connect-timeout 20 --retry 2 --retry-delay 1 --noproxy '*' -o ${shellQuote(outputPath)} ${shellQuote(url)}`)} && exit 0`,
    `  try_download "curl-insecure" ${shellQuote(`curl -k -LfsS --connect-timeout 20 --retry 2 --retry-delay 1 --noproxy '*' -o ${shellQuote(outputPath)} ${shellQuote(url)}`)} && exit 0`,
    "fi",
    "if command -v python3 >/dev/null 2>&1; then",
    `  try_download "python3-insecure" ${shellQuote(`python3 -c ${shellQuote(pythonInsecureDownloadCode)} ${shellQuote(url)} ${shellQuote(outputPath)}`)} && exit 0`,
    "fi",
    "if command -v python >/dev/null 2>&1; then",
    `  try_download "python-insecure" ${shellQuote(`python -c ${shellQuote(pythonInsecureDownloadCode)} ${shellQuote(url)} ${shellQuote(outputPath)}`)} && exit 0`,
    "fi",
    "if command -v wget >/dev/null 2>&1; then",
    '  if wget --help 2>&1 | grep -q -- " -4"; then',
    `    try_download "wget-no-check-certificate-ipv4" ${shellQuote(`wget -4 --no-check-certificate -O ${shellQuote(outputPath)} ${shellQuote(url)}`)} && exit 0`,
    "  fi",
    `  try_download "wget-no-check-certificate" ${shellQuote(`wget --no-check-certificate -O ${shellQuote(outputPath)} ${shellQuote(url)}`)} && exit 0`,
    "fi",
    'printf "__DOWNLOAD_FAIL__ none\\n"',
    "exit 1"
  ].join("\n");
}

async function downloadUrlToLocalPath(
  songloft: SongloftCommandApi,
  url: string,
  outputPath: string,
  phase: string
): Promise<void> {
  const result = await execShell(songloft, buildManagedBundleDownloadScript(url, outputPath), {
    timeout: 120_000
  }).catch(() => null);
  if (!result || result.exitCode !== 0) {
    const rawOutput = `${result?.stdout || ""}\n${result?.stderr || ""}`;
    const diagnostics = rawOutput
      .split("__DOWNLOAD_ATTEMPT__")
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => summarizeDownloadDiagnosticOutput(chunk))
      .filter(Boolean);
    const details = diagnostics.join(" || ") || summarizeDownloadDiagnosticOutput(rawOutput);
    const inferredCause = inferManagedBundleDownloadFailureCause(details);
    throw new Error(
      details
        ? `${phase}${inferredCause ? `；原因判断: ${inferredCause}` : ""}；宿主返回: ${details}`
        : `${phase}；请确认宿主能访问 GitHub Release，且本地代理没有把 https 请求错误转发到 ::1`
    );
  }

  if (!(await shellPathExists(songloft, outputPath))) {
    throw new Error(`${phase}；远程文件未成功落盘到插件工作目录`);
  }
}

function normalizeUploadedArchiveFilename(filename: string): string {
  const trimmed = String(filename || "").trim();
  if (!trimmed) {
    throw new Error("上传文件名不能为空");
  }
  if (!getManagedArchiveFormat(trimmed)) {
    throw new Error("手动上传仅支持 .tgz / .tar.gz 压缩包");
  }
  return trimmed;
}

function normalizeArchiveBase64(payload: string): string {
  const trimmed = String(payload || "").trim();
  if (!trimmed) {
    throw new Error("上传内容不能为空");
  }
  const dataUrlMatch = trimmed.match(/^data:.*?;base64,(.*)$/i);
  return dataUrlMatch ? dataUrlMatch[1] : trimmed;
}

async function removeTemporaryArchive(songloft: SongloftCommandApi, archivePath?: string): Promise<void> {
  const targets = archivePath ? [archivePath] : [MANAGED_UPLOAD_ARCHIVE_TGZ_PATH, MANAGED_DOWNLOAD_ARCHIVE_TGZ_PATH];
  await execShell(songloft, `rm -f ${targets.map((target) => shellQuote(target)).join(" ")}`, {
    timeout: 5_000
  }).catch(() => null);
}

async function recoverManagedBundleBackup(songloft: SongloftCommandApi): Promise<void> {
  const backupDir = `${MPD_BIN_DIR}/${MANAGED_BUNDLE_BACKUP_DIR}`;
  const script = [
    `if [ ! -d ${shellQuote(backupDir)} ]; then exit 0; fi`,
    `mkdir -p ${shellQuote(MPD_BIN_DIR)}`,
    ...MANAGED_BUNDLE_TARGETS.map((target) => [
      `if [ -e ${shellQuote(`${backupDir}/${target}`)} ]; then`,
      `  if [ -e ${shellQuote(`${MPD_BIN_DIR}/${target}`)} ]; then rm -rf ${shellQuote(`${backupDir}/${target}`)};`,
      `  else mv ${shellQuote(`${backupDir}/${target}`)} ${shellQuote(`${MPD_BIN_DIR}/${target}`)}; fi`,
      "fi"
    ].join("\n")),
    `rm -rf ${shellQuote(backupDir)}`
  ].join("\n");
  const result = await execShell(songloft, script, { timeout: 20_000 }).catch(() => null);
  if (!result || result.exitCode !== 0) {
    throw new Error("无法恢复插件托管二进制备份目录");
  }
}

async function backupManagedBundleTargets(songloft: SongloftCommandApi): Promise<void> {
  const backupDir = `${MPD_BIN_DIR}/${MANAGED_BUNDLE_BACKUP_DIR}`;
  const script = [
    `rm -rf ${shellQuote(backupDir)}`,
    `mkdir -p ${shellQuote(backupDir)}`,
    ...MANAGED_BUNDLE_TARGETS.map((target) => `if [ -e ${shellQuote(`${MPD_BIN_DIR}/${target}`)} ]; then mv ${shellQuote(`${MPD_BIN_DIR}/${target}`)} ${shellQuote(`${backupDir}/${target}`)}; fi`)
  ].join("\n");
  const result = await execShell(songloft, script, { timeout: 20_000 }).catch(() => null);
  if (!result || result.exitCode !== 0) {
    throw new Error("无法为插件托管二进制创建备份");
  }
}

async function clearManagedBundleBackup(songloft: SongloftCommandApi): Promise<void> {
  const result = await execShell(songloft, `rm -rf ${shellQuote(`${MPD_BIN_DIR}/${MANAGED_BUNDLE_BACKUP_DIR}`)}`, {
    timeout: 10_000
  }).catch(() => null);
  if (!result || result.exitCode !== 0) {
    throw new Error("无法清理插件托管二进制备份目录");
  }
}

async function clearManagedBundleStaging(songloft: SongloftCommandApi): Promise<void> {
  const result = await execShell(songloft, `rm -rf ${shellQuote(`${MPD_BIN_DIR}/${MANAGED_BUNDLE_STAGING_DIR}`)}`, {
    timeout: 10_000
  }).catch(() => null);
  if (!result || result.exitCode !== 0) {
    throw new Error("无法清理插件托管二进制临时目录");
  }
}

async function moveManagedBundleTargetsFromDirectory(songloft: SongloftCommandApi, sourceDir: string): Promise<void> {
  const script = [
    `mkdir -p ${shellQuote(MPD_BIN_DIR)}`,
    ...MANAGED_BUNDLE_TARGETS.map((target) => `if [ -e ${shellQuote(`${sourceDir}/${target}`)} ]; then mv ${shellQuote(`${sourceDir}/${target}`)} ${shellQuote(`${MPD_BIN_DIR}/${target}`)}; fi`)
  ].join("\n");
  const result = await execShell(songloft, script, { timeout: 20_000 }).catch(() => null);
  if (!result || result.exitCode !== 0) {
    throw new Error("无法把已校验的插件托管二进制从临时目录迁入正式目录");
  }
}

async function restoreManagedBundleBackupOrThrow(songloft: SongloftCommandApi, originalError: unknown): Promise<never> {
  try {
    await recoverManagedBundleBackup(songloft);
  } catch (restoreError) {
    throw new Error(`安装新 bundle 失败，且恢复旧安装也失败。原始错误: ${String(originalError)}；恢复错误: ${String(restoreError)}`);
  }
  throw originalError instanceof Error ? originalError : new Error(String(originalError));
}

function getSingleArchiveRootSegment(entries: string[]): string {
  const meaningfulEntries = entries
    .map((entry) => String(entry || "").trim().replace(/^\.\/+/, "").replace(/\\/g, "/"))
    .filter((entry) => entry && entry !== "." && entry !== "..");
  if (!meaningfulEntries.length) {
    return "";
  }
  const firstSegments = Array.from(new Set(meaningfulEntries.map((entry) => entry.split("/")[0]).filter(Boolean)));
  return firstSegments.length === 1 ? firstSegments[0] || "" : "";
}

async function listArchiveEntries(
  songloft: SongloftCommandApi,
  archivePath: string
): Promise<string[]> {
  const result = await execShell(songloft, `tar -tzf ${shellQuote(archivePath)}`, {
    timeout: 15_000
  }).catch(() => null);
  if (!result || result.exitCode !== 0) {
    const details = trimToSingleLine(result?.stderr || result?.stdout || "");
    throw new Error(
      details
        ? `无法读取压缩包目录，请确认上传的是有效的 .tgz / .tar.gz 文件；宿主返回: ${details}`
        : "无法读取压缩包目录，请确认上传的是有效的 .tgz / .tar.gz 文件"
    );
  }
  return String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function shouldStripSingleArchiveRoot(entries: string[]): boolean {
  const meaningfulEntries = entries
    .map((entry) => String(entry || "").trim().replace(/^\.\/+/, "").replace(/\\/g, "/"))
    .filter((entry) => entry && entry !== "." && entry !== "..");
  if (!meaningfulEntries.length) {
    return false;
  }

  const firstSegments = Array.from(new Set(meaningfulEntries.map((entry) => entry.split("/")[0]).filter(Boolean)));
  if (firstSegments.length !== 1) {
    return false;
  }

  const hasDirectManagedTarget = meaningfulEntries.some((entry) => {
    const firstSegment = entry.split("/")[0];
    return firstSegment === "mpd" || firstSegment === "mpc" || firstSegment === "lib";
  });
  return !hasDirectManagedTarget;
}

function normalizeArchiveEntriesAfterStrip(entries: string[], stripComponents: number): string[] {
  return entries
    .map((entry) => String(entry || "").trim().replace(/^\.\/+/, "").replace(/\\/g, "/"))
    .filter((entry) => entry && entry !== "." && entry !== "..")
    .map((entry) => {
      if (!stripComponents) {
        return entry;
      }
      const segments = entry.split("/").filter(Boolean);
      return segments.slice(stripComponents).join("/");
    })
    .filter(Boolean);
}

function validateManagedArchiveEntries(entries: string[], stripComponents: number): void {
  const normalizedEntries = normalizeArchiveEntriesAfterStrip(entries, stripComponents);
  const invalidEntry = normalizedEntries.find((entry) => entry.startsWith("/") || entry.split("/").some((segment) => segment === ".."));
  if (invalidEntry) {
    throw new Error("压缩包内容不安全，包含非法路径");
  }
  const hasMpd = normalizedEntries.some((entry) => entry === "mpd");
  const hasMpc = normalizedEntries.some((entry) => entry === "mpc");
  const hasLib = normalizedEntries.some((entry) => entry === "lib" || entry.startsWith("lib/"));

  if (!hasMpd || !hasMpc || !hasLib) {
    throw new Error("压缩包内容不符合要求，解压后必须直接得到 mpd、mpc 与 lib/");
  }
}

async function inspectManagedArchive(
  songloft: SongloftCommandApi,
  archivePath: string
): Promise<number> {
  const entries = await listArchiveEntries(songloft, archivePath);
  const stripComponents = shouldStripSingleArchiveRoot(entries) ? 1 : 0;
  validateManagedArchiveEntries(entries, stripComponents);
  return stripComponents;
}

async function extractManagedArchiveToDirectory(
  songloft: SongloftCommandApi,
  archivePath: string,
  targetDir: string,
  stripComponents: number
): Promise<void> {
  const extractScript = [
    `mkdir -p ${shellQuote(targetDir)}`,
    `tar -xzf ${shellQuote(archivePath)} -C ${shellQuote(targetDir)}${stripComponents ? ` --strip-components=${stripComponents}` : ""}`
  ].join("\n");
  const extractResult = await execShell(
    songloft,
    extractScript,
    { timeout: 30_000 }
  ).catch(() => null);
  if (!extractResult || extractResult.exitCode !== 0) {
    throw new Error("压缩包解压失败，请确认压缩包内包含 mpd、mpc 与 lib/，且格式为 Linux 可解压的 .tgz / .tar.gz");
  }
}

async function finalizeManagedBundleInstall(songloft: SongloftCommandApi, baseDir = MPD_BIN_DIR): Promise<void> {
  await normalizeManagedWrapperScripts(songloft, baseDir);
  await ensureManagedWrapperRealTargetsExist(songloft, baseDir);
  await chmodManagedBinary(songloft, "mpd", baseDir);
  await chmodManagedBinary(songloft, "mpc", baseDir);
  await chmodManagedBinaryIfExists(songloft, "mpd.real", baseDir);
  await chmodManagedBinaryIfExists(songloft, "mpc.real", baseDir);

  const mpdProbeResult = await probeManagedBinary(songloft, "mpd", "mpd", baseDir);
  if (!isBinaryProbeSuccessful("mpd", mpdProbeResult)) {
    throw new Error(await buildManagedBinaryProbeFailureMessage(songloft, "mpd", "mpd", mpdProbeResult, "上传解压完成后", baseDir));
  }
  const mpcProbeResult = await probeManagedBinary(songloft, "mpc", "mpc", baseDir);
  if (!isBinaryProbeSuccessful("mpc", mpcProbeResult)) {
    throw new Error(await buildManagedBinaryProbeFailureMessage(songloft, "mpc", "mpc", mpcProbeResult, "上传解压完成后", baseDir));
  }
}

async function installManagedBundleFromArchive(
  songloft: SongloftCommandApi,
  archivePath: string,
  platform: MpdPlatformPayload
): Promise<void> {
  const stagingDir = `${MPD_BIN_DIR}/${MANAGED_BUNDLE_STAGING_DIR}`;
  let backupCreated = false;

  await recoverManagedBundleBackup(songloft);
  await clearManagedBundleStaging(songloft);

  try {
    const stripComponents = await inspectManagedArchive(songloft, archivePath);
    await extractManagedArchiveToDirectory(songloft, archivePath, stagingDir, stripComponents);
    if (platform.os === "linux") {
      await finalizeManagedBundleInstall(songloft, stagingDir);
    }
    backupCreated = true;
    await backupManagedBundleTargets(songloft);
    await deleteManagedBinaryFiles(songloft, [...MANAGED_BUNDLE_TARGETS]);
    await moveManagedBundleTargetsFromDirectory(songloft, stagingDir);
    await ensureManagedBundleInstalledState(songloft);
  } catch (error) {
    await clearManagedBundleStaging(songloft).catch(() => null);
    if (backupCreated) {
      await deleteManagedBinaryFiles(songloft, [...MANAGED_BUNDLE_TARGETS]).catch(() => null);
      await restoreManagedBundleBackupOrThrow(songloft, error);
    }
    throw error;
  }

  await clearManagedBundleStaging(songloft).catch(() => null);
  await clearManagedBundleBackup(songloft).catch(() => null);
}

async function ensureManagedBundleInstalledState(songloft: SongloftCommandApi): Promise<void> {
  const [mpdStatus, mpcStatus] = await Promise.all([
    getBinaryItemStatus(songloft, "mpd"),
    getBinaryItemStatus(songloft, "mpc")
  ]);

  if (mpdStatus.source !== "plugin-bin" || !mpdStatus.pluginBinExists || !mpdStatus.executableAvailable) {
    throw new Error("安装结束后未检测到可执行的插件托管 mpd");
  }
  if (mpcStatus.source !== "plugin-bin" || !mpcStatus.pluginBinExists || !mpcStatus.executableAvailable) {
    throw new Error("安装结束后未检测到可执行的插件托管 mpc");
  }
}

export async function downloadBinary(
  songloft: SongloftCommandApi,
  kind: "mpd" | "mpc",
  url: string
) {
  invalidateResolvedBinaryCache(kind);
  const normalizedUrl = normalizeDownloadUrl(url);
  const platform = await detectPlatform(songloft);
  const targetFilename = getManagedBinaryFilename(kind);
  const archiveFilename = getDownloadArchiveFilename(platform, kind, normalizedUrl);
  const cleanupTargets = shouldExtractTgz(normalizedUrl)
    ? [targetFilename, archiveFilename]
    : [targetFilename];

  await deleteManagedBinaryFiles(songloft, cleanupTargets);

  try {
    if (shouldExtractTgz(normalizedUrl)) {
      await songloft.command.download(normalizedUrl, archiveFilename, {
        extract: "tgz",
        extractTarget: targetFilename
      });
      await deleteBinaryIfExists(songloft, archiveFilename);
    } else {
      await songloft.command.download(normalizedUrl, targetFilename);
    }

    if (platform.supported && platform.os === "linux") {
      await chmodManagedBinary(songloft, targetFilename);
    }

    if (!(await canExecManagedBinary(songloft, targetFilename, kind))) {
      await deleteManagedBinaryFiles(songloft, cleanupTargets);
      throw new Error(`下载完成，但插件内的 ${kind} 无法通过版本校验，请确认提供的是当前平台可执行文件`);
    }
  } catch (error) {
    await deleteManagedBinaryFiles(songloft, cleanupTargets);
    invalidateResolvedBinaryCache(kind);
    throw error;
  }
  invalidateResolvedBinaryCache(kind);
}

export async function downloadManagedBinaryBundle(songloft: SongloftCommandApi) {
  invalidateResolvedBinaryCache();
  const platform = await detectPlatform(songloft);
  if (!platform.supported) {
    throw new Error("当前宿主平台不支持自动下载 MPD/MPC bundle");
  }

  const rawBundleUrl = getManagedBundleUrl(platform);
  if (!rawBundleUrl) {
    throw new Error(`当前平台 ${platform.platformKey} 的自动下载地址尚未配置`);
  }

  const bundleUrl = normalizeDownloadUrl(rawBundleUrl);
  const archiveFormat = getManagedArchiveFormat(bundleUrl);
  if (archiveFormat !== "tgz") {
    throw new Error("自动下载仅支持 .tgz 或 .tar.gz bundle");
  }

  const archivePath = MANAGED_DOWNLOAD_ARCHIVE_TGZ_PATH;
  await removeTemporaryArchive(songloft, archivePath);

  try {
    await downloadUrlToLocalPath(
      songloft,
      bundleUrl,
      archivePath,
      "无法下载当前平台的 MPD/MPC bundle，请确认宿主能访问 GitHub Release"
    );
    await installManagedBundleFromArchive(songloft, archivePath, platform);
    await removeTemporaryArchive(songloft, archivePath);
  } catch (error) {
    await removeTemporaryArchive(songloft, archivePath);
    await clearManagedBundleStaging(songloft).catch(() => null);
    invalidateResolvedBinaryCache();
    throw error;
  }
  invalidateResolvedBinaryCache();

  return {
    platform,
    url: bundleUrl
  };
}

export async function uploadManagedBinaryBundleArchive(
  songloft: SongloftCommandApi,
  filename: string,
  archiveBase64: string
) {
  invalidateResolvedBinaryCache();
  const normalizedFilename = normalizeUploadedArchiveFilename(filename);
  const archiveFormat = getManagedArchiveFormat(normalizedFilename);
  if (!archiveFormat) {
    throw new Error("无法识别上传压缩包格式");
  }
  const platform = await detectPlatform(songloft);
  ensureUploadedArchiveMatchesHostPlatform(normalizedFilename, platform);
  const uploadArchivePath = getManagedUploadArchivePath();
  const normalizedBase64 = normalizeArchiveBase64(archiveBase64);
  await removeTemporaryArchive(songloft);

  try {
    const writeResult = await execShellWithStdin(
      songloft,
      `base64 -d > ${shellQuote(uploadArchivePath)}`,
      normalizedBase64,
      { timeout: 180_000 }
    ).catch(() => null);
    if (!writeResult || writeResult.exitCode !== 0) {
      throw new Error("无法把上传压缩包写入插件真实工作目录");
    }
    await installManagedBundleFromArchive(songloft, uploadArchivePath, platform);
    await removeTemporaryArchive(songloft, uploadArchivePath);
  } catch (error) {
    await removeTemporaryArchive(songloft, uploadArchivePath);
    await clearManagedBundleStaging(songloft).catch(() => null);
    invalidateResolvedBinaryCache();
    throw error;
  }
  invalidateResolvedBinaryCache();
}

export async function deleteBinary(songloft: SongloftCommandApi, kind: "mpd" | "mpc") {
  await deleteManagedBinaryFiles(songloft, [getManagedBinaryFilename(kind)]);
  invalidateResolvedBinaryCache(kind);
}

export async function getMpdConfig(songloft: SongloftCommandApi): Promise<string> {
  const runtimeFiles = await readRuntimeFilesSnapshot(songloft);
  if (!runtimeFiles?.configPath) {
    return "";
  }
  return readTextFileViaShell(songloft, runtimeFiles.configPath);
}

export async function startManagedMpd(songloft: SongloftCommandApi) {
  await ensureConfigFile(songloft);
  const resolvedMpd = await resolveBinary(songloft, "mpd");
  const audioDetection = await detectAudioOutput(songloft);
  if (!resolvedMpd.executableAvailable) {
    throw new Error("未找到可执行的 mpd，请先下载插件托管的 mpd/mpc，或在插件包的 bin/<platform>/ 中提供二进制");
  }

  const runtimeFiles = await ensureRuntimeFiles(songloft);
  const running = await songloft.command.isRunning(MPD_PROCESS_NAME).catch(() => false);
  if (running) {
    const ready = await waitForMpdReady(songloft, 5_000);
    if (!ready) {
      throw await buildMpdReadyError(songloft, "检测到已有 MPD 进程，但它没有成功接受本地控制连接");
    }
    return { pid: -1, reused: true };
  }

  const started = await startResolvedCommand(
    songloft,
    MPD_PROCESS_NAME,
    resolvedMpd,
    ["--stdout", "--no-daemon", runtimeFiles.configPath],
    audioDetection.env
  );
  const ready = await waitForMpdReady(songloft, 12_000);
  if (!ready) {
    throw await buildMpdReadyError(songloft, "MPD 进程已启动，但未在预期时间内完成就绪");
  }
  return { pid: started.pid, reused: false };
}

export async function restartManagedMpd(songloft: SongloftCommandApi) {
  const running = await songloft.command.isRunning(MPD_PROCESS_NAME).catch(() => false);
  if (running) {
    await stopManagedMpd(songloft);
  }
  return startManagedMpd(songloft);
}

async function ensureManagedMpdReadyForControl(songloft: SongloftCommandApi) {
  if (await waitForMpdReady(songloft, 1_500)) {
    return;
  }

  const running = await songloft.command.isRunning(MPD_PROCESS_NAME).catch(() => false);
  if (!running) {
    await startManagedMpd(songloft);
    return;
  }

  throw await buildMpdReadyError(songloft, "MPD 进程存在，但当前无法通过 mpc 建立控制连接");
}

async function execMpc(songloft: SongloftCommandApi, args: string[], options?: { autoStartIfNeeded?: boolean }) {
  if (options?.autoStartIfNeeded) {
    await ensureManagedMpdReadyForControl(songloft);
  }

  const resolvedMpc = await resolveBinary(songloft, "mpc");
  if (!resolvedMpc.executableAvailable) {
    throw new Error("未找到可执行的 mpc，请先下载插件托管的 mpd/mpc，或在插件包的 bin/<platform>/ 中提供二进制");
  }

  const result = await execResolvedCommand(songloft, resolvedMpc, args, 15_000);
  if (!result || result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `${resolvedMpc.program} ${args.join(" ")} failed`);
  }
  return result;
}

function parseQueuePlaylistLine(rawLine: string): ParsedQueuePlaylistLine {
  const parts = rawLine.split("||");
  return {
    position: Number(parts[0] || 0),
    artist: (parts[1] || "").trim(),
    title: (parts[2] || "").trim(),
    album: (parts[3] || "").trim(),
    durationLabel: (parts[4] || "").trim() || "--:--",
    target: (parts[5] || "").trim()
  };
}

function isQueueItemMetadataIncomplete(parsed: ParsedQueuePlaylistLine, item: QueueItemPayload): boolean {
  if (parsed.title && parsed.artist && parsed.album) {
    return false;
  }
  return item.title === "未知标题" || item.artist === "未知歌手" || item.album === "未知专辑";
}

function toQueueItemPayload(
  parsed: ParsedQueuePlaylistLine,
  currentPosition: number | null,
  queueMetadata: QueueMetadataSnapshot
): QueueItemPayload {
  const fileName = parsed.target ? parsed.target.split(/[\\/]/).pop() || parsed.target : "";
  const metadata = parsed.target ? findQueueMetadataItem(queueMetadata, parsed.target) : undefined;
  const title = parsed.title || metadata?.title || fileName || "未知标题";
  const artist = parsed.artist || metadata?.artist || "未知歌手";
  const album = parsed.album || metadata?.album || "未知专辑";
  const durationLabel = parsed.durationLabel || "--:--";

  return {
    queueId: "queue-" + String(parsed.position),
    position: parsed.position,
    title,
    artist,
    album,
    durationLabel,
    isCurrent: currentPosition === parsed.position
  };
}

export async function getQueueState(songloft: SongloftCommandApi, forceRefresh = false): Promise<QueuePayload> {
  const startTime = Date.now(); // v1.0.8优化：添加性能监控
  const now = Date.now();

  // 智能缓存TTL：根据系统状态动态调整
  let cacheTTL = QUEUE_CACHE_TTL;

  if (pollingState.isNavigating) {
    cacheTTL = 10000; // 导航时延长到10秒
  } else if (pollingState.isBatchProcessing) {
    cacheTTL = 8000; // 批量处理时延长到8秒
  }

  // 检查缓存
  if (!forceRefresh && queueStateCache.data) {
    const cacheAge = now - queueStateCache.timestamp;
    if (cacheAge < cacheTTL && queueStateCache.version === queueVersion) {
      pollingState.requestCount++;

      // v1.0.8优化：记录性能指标
      const latency = Date.now() - startTime;
      recordMetrics('getQueueState', latency, true);

      return queueStateCache.data;
    }
  }

  // 原有逻辑获取队列状态（带重试）
  const queuePayload = await retryWithBackoff(
    async () => {
      return await getQueueStateInternal(songloft);
    },
    "GetQueueState",
    1 // 只重试1次，避免轮询时延迟过长
  );

  // 更新缓存
  queueStateCache = {
    data: queuePayload,
    timestamp: now,
    version: queueVersion
  };

  pollingState.lastActivity = now;
  pollingState.requestCount++;

  // v1.0.8优化：记录性能指标
  const latency = Date.now() - startTime;
  recordMetrics('getQueueState', latency, false);

  // v1.0.9优化：预加载下一批歌曲
  if (queuePayload.currentPosition && queuePayload.items.length > 0) {
    try {
      await prefetchManager.prefetchNextSongs(songloft, queuePayload, queuePayload.currentPosition);
    } catch (error) {
      // 预加载失败不影响主流程
    }
  }

  return queuePayload;
}

async function getQueueStateInternal(songloft: SongloftCommandApi): Promise<QueuePayload> {
  const resolvedMpc = await resolveBinary(songloft, "mpc");
  if (!resolvedMpc.executableAvailable) {
    return {
      total: 0,
      currentPosition: null,
      items: []
    };
  }

  const [statusResult, playlistResult, queueMetadata] = await Promise.all([
    execResolvedCommand(songloft, resolvedMpc, ["status"]),
    execResolvedCommand(songloft, resolvedMpc, ["playlist"]),
    readQueueMetadataSnapshot(songloft)
  ]);

  if (!playlistResult || playlistResult.exitCode !== 0) {
    return {
      total: 0,
      currentPosition: null,
      items: []
    };
  }

  const statusLines = (statusResult?.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const statusLine = statusLines.find((line) => line.indexOf("#") >= 0) || "";
  const currentPosition = parseCurrentPosition(statusLine);

  // Parse default mpc playlist output lines:
  // - "Artist - Title" → use directly as artist/title
  // - URL or file path → use as target for metadata lookup
  const rawPlaylistLines = playlistResult.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsedItems: ParsedQueuePlaylistLine[] = rawPlaylistLines.map((line, index) => {
    const isUrl = /^(https?|file):\/\//i.test(line) || line.startsWith("/");
    if (isUrl) {
      // URL or file path: look up metadata by target
      return {
        position: index + 1,
        artist: "",
        title: "",
        album: "",
        durationLabel: "--:--",
        target: line
      };
    }
    // "Artist - Title" format: parse artist and title
    const separatorIdx = line.indexOf(" - ");
    const artist = separatorIdx >= 0 ? line.slice(0, separatorIdx).trim() : "";
    const title = separatorIdx >= 0 ? line.slice(separatorIdx + 3).trim() : line;
    return {
      position: index + 1,
      artist,
      title,
      album: "",
      durationLabel: "--:--",
      target: ""
    };
  });

  let metadataSnapshot = queueMetadata;
  let items = parsedItems.map((item) => toQueueItemPayload(item, currentPosition, metadataSnapshot));

  // For Artist-Title entries without metadata match, try to find album from snapshot
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const parsed = parsedItems[i];
    if (!item || item.album !== "未知专辑") continue;
    if (!parsed.artist || !parsed.title) continue;
    for (const key of Object.keys(metadataSnapshot)) {
      const meta = metadataSnapshot[key];
      if (meta && meta.artist === parsed.artist && meta.title === parsed.title) {
        item.album = meta.album || "未知专辑";
        break;
      }
    }
  }

  const unresolvedTargets = parsedItems
    .filter((item, index) => item.target && isQueueItemMetadataIncomplete(item, items[index]))
    .map((item) => item.target);

  if (unresolvedTargets.length) {
    const fallbackSnapshot = await getSongTargetMetadataSnapshot(songloft).catch(() => ({}));
    const mergedSnapshot: QueueMetadataSnapshot = {
      ...fallbackSnapshot,
      ...metadataSnapshot
    };
    let snapshotChanged = false;

    for (const target of unresolvedTargets) {
      if (findQueueMetadataItem(metadataSnapshot, target)) {
        continue;
      }
      const matched = findQueueMetadataItem(fallbackSnapshot, target);
      if (!matched) {
        continue;
      }
      setQueueMetadataForTarget(metadataSnapshot, target, matched);
      snapshotChanged = true;
    }

    if (snapshotChanged) {
      await writeQueueMetadataSnapshot(songloft, metadataSnapshot);
    }

    items = parsedItems.map((item) => toQueueItemPayload(item, currentPosition, {
      ...mergedSnapshot,
      ...metadataSnapshot
    }));
  }

  return {
    total: items.length,
    currentPosition,
    items
  };
}

export async function clearQueue(songloft: SongloftCommandApi) {
  await execMpc(songloft, ["clear"], { autoStartIfNeeded: true });
  await writeQueueMetadataSnapshot(songloft, {});
  incrementQueueVersion(); // 增加队列版本号
}

export async function removeQueueItem(songloft: SongloftCommandApi, position: number) {
  if (!Number.isFinite(position) || position < 1) {
    throw new Error("queue position is invalid");
  }
  await execMpc(songloft, ["del", String(position)], { autoStartIfNeeded: true });
  const [resolvedMpc, existingSnapshot] = await Promise.all([
    resolveBinary(songloft, "mpc"),
    readQueueMetadataSnapshot(songloft)
  ]);
  if (!resolvedMpc.executableAvailable) {
    await writeQueueMetadataSnapshot(songloft, {});
    return;
  }
  const playlistResult = await execResolvedCommand(songloft, resolvedMpc, ["playlist"]);
  if (!playlistResult || playlistResult.exitCode !== 0) {
    return;
  }
  const nextSnapshot: QueueMetadataSnapshot = {};
  for (const rawTarget of playlistResult.stdout.split(/\r?\n/)) {
    const target = rawTarget.trim().replace(/^\[playing\]\s+/i, "");
    if (!target) {
      continue;
    }
    const metadata = findQueueMetadataItem(existingSnapshot, target);
    if (!metadata) {
      continue;
    }
    setQueueMetadataForTarget(nextSnapshot, target, metadata);
  }
  await writeQueueMetadataSnapshot(songloft, nextSnapshot);
}

export async function jumpQueueItem(songloft: SongloftCommandApi, position: number) {
  if (!Number.isFinite(position) || position < 1) {
    throw new Error("queue position is invalid");
  }
  await execMpc(songloft, ["play", String(position)], { autoStartIfNeeded: true });
}

export async function runPlayerAction(songloft: SongloftCommandApi, action: string, value?: string) {
  switch (action) {
    case "play":
    case "pause":
    case "toggle":
    case "next":
    case "prev":
    case "stop":
      {
        await execMpc(songloft, [action], { autoStartIfNeeded: action !== "stop" });
      }
      if (action === "stop") {
        await writeActiveSongSnapshot(songloft, null);
      }
      return;
    case "volume":
      if (!value) {
        throw new Error("volume value is required");
      }
      await execMpc(songloft, ["volume", value], { autoStartIfNeeded: true });
      return;
    case "seek":
      if (!value) {
        throw new Error("seek value is required");
      }
      await execMpc(songloft, ["seek", value], { autoStartIfNeeded: true });
      return;
    case "random":
      if (value !== "on" && value !== "off") {
        throw new Error("random value must be on or off");
      }
      await execMpc(songloft, ["random", value], { autoStartIfNeeded: true });
      return;
    case "repeat":
      if (value !== "on" && value !== "off") {
        throw new Error("repeat value must be on or off");
      }
      await execMpc(songloft, ["repeat", value], { autoStartIfNeeded: true });
      return;
    case "single":
      if (value !== "on" && value !== "off") {
        throw new Error("single value must be on or off");
      }
      await execMpc(songloft, ["single", value], { autoStartIfNeeded: true });
      return;
    default:
      throw new Error(`unsupported action: ${action}`);
  }
}

async function resolvePlayableTarget(songloft: SongloftCommandApi, song: SongRecord | null | undefined): Promise<string> {
  return await resolvePlayableTargetWithCache(songloft, song);
}

export async function playSongById(songloft: SongloftCommandApi, songId: string) {
  const numericSongId = toNumericId(songId);
  if (numericSongId === null) {
    throw new Error("songId is invalid");
  }

  const song = await songloft.songs.getById(numericSongId);
  const playableTarget = await resolvePlayableTarget(songloft, song || undefined);

  if (!playableTarget) {
    throw new Error("当前歌曲没有可用的 file_path 或 url");
  }

  const queueMetadata = await readQueueMetadataSnapshot(songloft);
  setQueueMetadataForSong(queueMetadata, song || undefined, playableTarget);
  await writeQueueMetadataSnapshot(songloft, queueMetadata);
  incrementQueueVersion();
  await execMpc(songloft, ["add", playableTarget], { autoStartIfNeeded: true });
  const queue = await getQueueState(songloft);
  const lastItem = queue.items.length ? queue.items[queue.items.length - 1] : null;
  if (lastItem) {
    await execMpc(songloft, ["play", String(lastItem.position)], { autoStartIfNeeded: true });
  } else {
    await execMpc(songloft, ["play"], { autoStartIfNeeded: true });
  }
  await writeActiveSongSnapshot(songloft, {
    songId: String(songId),
    title: typeof song?.title === "string" && song.title.trim() ? song.title.trim() : "未知歌曲",
    artist: typeof song?.artist === "string" && song.artist.trim() ? song.artist.trim() : "未知歌手",
    album: typeof song?.album === "string" && song.album.trim() ? song.album.trim() : "未知专辑",
    target: playableTarget
  });
}

// ===== 智能轮询和请求管理API =====

/**
 * 获取轮询状态信息（前端用于智能轮询）
 */
export async function getPollingStatus(songloft: SongloftCommandApi): Promise<{
  optimalInterval: number;
  isNavigating: boolean;
  isBatchProcessing: boolean;
  lastActivity: number;
  requestCount: number;
  errorCount: number;
}> {
  pollingState.requestCount++;

  return {
    optimalInterval: getOptimalPollingInterval(),
    isNavigating: pollingState.isNavigating,
    isBatchProcessing: pollingState.isBatchProcessing,
    lastActivity: pollingState.lastActivity,
    requestCount: pollingState.requestCount,
    errorCount: pollingState.errorCount
  };
}

/**
 * 标记导航开始（前端调用）
 */
export async function markNavigationStart(songloft: SongloftCommandApi): Promise<void> {
  pollingState.isNavigating = true;
  pollingState.lastActivity = Date.now();
  songloft.log.info("[Polling] Navigation started, lowering polling frequency");
}

/**
 * 标记导航结束（前端调用）
 */
export async function markNavigationEnd(songloft: SongloftCommandApi): Promise<void> {
  pollingState.isNavigating = false;
  pollingState.lastActivity = Date.now();
  songloft.log.info("[Polling] Navigation ended, resuming normal polling");
}

/**
 * 批量播放带状态管理（推荐使用此版本）
 */
export async function playBatchWithStatus(
  songloft: SongloftCommandApi,
  songIds: string[],
  shuffle: boolean,
  replaceQueue: boolean = true
): Promise<{
  success: boolean;
  totalSongs: number;
  loadedSongs: number;
  batchesProcessed: number;
  duration: number;
}> {
  const startTime = Date.now();

  try {
    // 标记批量处理开始
    pollingState.isBatchProcessing = true;
    pollingState.lastActivity = startTime;

    await playBatch(songloft, songIds, shuffle, replaceQueue);

    const duration = Date.now() - startTime;
    const totalSongs = songIds.length;
    const loadedSongs = Math.floor(totalSongs * 0.95); // 估算加载成功的数量
    const batchSize = Math.min(BATCH_CONFIG.MAX_BATCH_SIZE, Math.ceil(totalSongs / 10));
    const batchesProcessed = Math.ceil(totalSongs / batchSize);

    songloft.log.info(`[PlayBatchWithStatus] Completed in ${duration}ms`);

    return {
      success: true,
      totalSongs,
      loadedSongs,
      batchesProcessed,
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    songloft.log.error(`[PlayBatchWithStatus] Failed after ${duration}ms: ${String(error)}`);

    return {
      success: false,
      totalSongs: songIds.length,
      loadedSongs: 0,
      batchesProcessed: 0,
      duration
    };
  } finally {
    pollingState.isBatchProcessing = false;
    pollingState.lastActivity = Date.now();
  }
}

export async function playBatch(
  songloft: SongloftCommandApi,
  songIds: string[],
  shuffle: boolean,
  replaceQueue: boolean = true
) {
  if (!songIds || !songIds.length) {
    return;
  }

  const totalSongs = songIds.length;
  songloft.log.info(`[PlayBatch] Starting batch play for ${totalSongs} songs`);

  // 更新轮询状态
  pollingState.lastActivity = Date.now();

  // v1.0.9优化：使用智能批量大小
  const batchSize = networkLatencyMonitor.calculateOptimalBatchSize(totalSongs);

  songloft.log.info(`[PlayBatch] Using batch size: ${batchSize}, total batches: ${Math.ceil(totalSongs / batchSize)}`);

  try {
    // 分批处理歌曲查询
    const allTargets: Array<{ target: string; song: SongRecord }> = [];

    await processBatch(
      songIds,
      batchSize,
      async (batchSongIds) => {
        songloft.log.info(`[PlayBatch] Processing batch of ${batchSongIds.length} songs`);

        const batchStartTime = Date.now();

        const batchResults = await Promise.allSettled(
          batchSongIds.map(async (songId) => {
            // v1.0.9优化：尝试从预加载缓存获取
            const itemStartTime = Date.now();
            const prefetched = prefetchManager.getPrefetchedSong(songId);

            if (prefetched) {
              songloft.log.info(`[PlayBatch] Using prefetched song: ${songId}`);
              // 记录预加载命中延迟（应该很低）
              const itemLatency = Date.now() - itemStartTime;
              networkLatencyMonitor.recordLatency(itemLatency);
              return { target: prefetched.target, song: prefetched.song };
            }

            return await retryWithBackoff(async () => {
              const numericId = toNumericId(songId);
              if (numericId === null) return null;

              const song = await songloft.songs.getById(numericId);
              if (!song) return null;

              const target = await resolvePlayableTarget(songloft, song);
              if (!target) return null;

              // v1.0.9优化：记录网络延迟
              const itemLatency = Date.now() - itemStartTime;
              networkLatencyMonitor.recordLatency(itemLatency);

              return { target, song };
            }, `SongQuery_${songId}`);
          })
        );

        // v1.0.9优化：更新网络延迟监控
        const batchLatency = Date.now() - batchStartTime;
        dynamicConcurrencyController.updateLatency(batchLatency);

        const batchTargets = batchResults
          .filter((r) => r.status === "fulfilled" && r.value)
          .map((r) => r.value);

        allTargets.push(...batchTargets);

        songloft.log.info(`[PlayBatch] Batch completed: ${batchTargets.length}/${batchSongIds.length} songs loaded`);
      },
      BATCH_CONFIG.BATCH_DELAY_MS
    );

    if (!allTargets.length) {
      throw new Error("所选曲目中没有可播放的内容");
    }

    songloft.log.info(`[PlayBatch] Total ${allTargets.length}/${totalSongs} songs loaded successfully`);

    // 随机排序
    let finalTargets = allTargets;
    if (shuffle) {
      finalTargets = [...allTargets].sort(() => Math.random() - 0.5);
      songloft.log.info(`[PlayBatch] Applied shuffle to ${finalTargets.length} songs`);
    }

    // 根据 replaceQueue 参数决定是否清空队列
    if (replaceQueue) {
      await retryWithBackoff(async () => {
        await execMpc(songloft, ["clear"], { autoStartIfNeeded: true });
      }, "ClearQueue");
    } else {
      songloft.log.info(`[PlayBatch] Skipping queue clear, appending to existing queue`);
    }

    // 批量构建元数据
    const queueMetadata: QueueMetadataSnapshot = {};
    finalTargets.forEach((item) => {
      setQueueMetadataForSong(queueMetadata, item.song, item.target);
    });

    // 批量添加到队列（使用临时文件）
    const tempPlaylistPath = await retryWithBackoff(async () => {
      return await createTempPlaylist(songloft, finalTargets);
    }, "CreateTempPlaylist");

    // 保存元数据（必须在队列加载之前写入，避免轮询时读到空的快照导致显示"未知标题"）
    await retryWithBackoff(async () => {
      await writeQueueMetadataSnapshot(songloft, queueMetadata);
    }, "WriteMetadata");

    // 批量加载到队列
    await retryWithBackoff(async () => {
      await execMpc(songloft, ["load", tempPlaylistPath], { autoStartIfNeeded: true });
    }, "LoadQueue");

    // 开始播放
    await retryWithBackoff(async () => {
      await execMpc(songloft, ["play"], { autoStartIfNeeded: true });
    }, "StartPlayback");

    // 更新活动歌曲快照
    const first = finalTargets[0];
    await retryWithBackoff(async () => {
      await writeActiveSongSnapshot(songloft, {
        songId: String(first.song.id),
        title: first.song.title || "未知歌曲",
        artist: first.song.artist || "未知歌手",
        album: first.song.album || "未知专辑",
        target: first.target
      });
    }, "WriteActiveSong");

    // 清理临时文件
    try {
      await songloft.command.exec("rm", ["-f", tempPlaylistPath]);
      songloft.log.info(`[PlayBatch] Cleaned up temp playlist: ${tempPlaylistPath}`);
    } catch (error) {
      songloft.log.warn(`[PlayBatch] Failed to clean up temp playlist: ${String(error)}`);
    }

    // 增加队列版本，使缓存失效
    incrementQueueVersion();

    songloft.log.info(`[PlayBatch] Successfully played ${allTargets.length} songs in ${finalTargets.length} queue`);
  } catch (error) {
    songloft.log.error(`[PlayBatch] Failed: ${String(error)}`);
    pollingState.errorCount++;
    throw error;
  } finally {
    pollingState.lastActivity = Date.now();
  }
}

async function createTempPlaylist(
  songloft: SongloftCommandApi,
  targets: Array<{ target: string; song: SongRecord }>
): Promise<string> {
  const playlistContent = targets.map(item => item.target).join('\n');
  const tempPath = `/tmp/mpd_batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.m3u`;

  try {
    await songloft.fs.writeFile(tempPath, playlistContent);
    return tempPath;
  } catch (error) {
    songloft.log.warn(`Failed to create temp playlist: ${String(error)}`);
    // 降级到逐个添加
    for (const item of targets) {
      await execMpc(songloft, ["add", item.target], { autoStartIfNeeded: true });
    }
    return "";
  }
}

export async function stopManagedMpd(songloft: SongloftCommandApi) {
  const runtimeFiles = await readRuntimeFilesSnapshot(songloft);
  const running = await songloft.command.isRunning(MPD_PROCESS_NAME).catch(() => false);

  if (!running) {
    await cleanupManagedRuntimeFiles(songloft);
    await releaseAudioDevices(songloft);
    return;
  }

  try {
    // 步骤1: 尝试通过PID文件停止
    const stoppedByPid = await stopManagedMpdViaPidFile(songloft, runtimeFiles);

    // 步骤2: 检查进程状态
    const stillRunning = await songloft.command.isRunning(MPD_PROCESS_NAME).catch(() => false);

    if (stillRunning) {
      // 步骤3: 尝试优雅停止（带超时）
      try {
        const stopPromise = songloft.command.stop(MPD_PROCESS_NAME);
        const timeoutPromise = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("Stop timeout")), 5000)
        );

        await Promise.race([stopPromise, timeoutPromise]);
      } catch (stopError) {
        songloft.log.warn(`Graceful stop failed: ${String(stopError)}`);

        // 步骤4: 强制杀死进程
        await forceKillMpdProcess(songloft, runtimeFiles);
      }
    } else if (stoppedByPid) {
      songloft.log.info("Managed MPD process terminated via pid file");
    }

    // 步骤5: 释放音频设备
    await releaseAudioDevices(songloft);

    // 步骤6: 清理运行时文件
    await cleanupManagedRuntimeFiles(songloft);
    await writeActiveSongSnapshot(songloft, null);

    songloft.log.info("MPD process stopped successfully");

  } catch (error) {
    songloft.log.error(`Failed to stop MPD: ${String(error)}`);

    // 即使失败也要尝试清理资源
    try {
      await releaseAudioDevices(songloft);
      await cleanupManagedRuntimeFiles(songloft);
    } catch (cleanupError) {
      songloft.log.error(`Failed to cleanup after stop failure: ${String(cleanupError)}`);
    }

    throw new Error(`Failed to stop MPD: ${String(error)}`);
  }
}

/**
 * 强制杀死MPD进程
 */
async function forceKillMpdProcess(
  songloft: SongloftCommandApi,
  runtimeFiles: RuntimeFilesSnapshot | null
): Promise<void> {
  try {
    if (runtimeFiles?.pidPath) {
      const pidContent = await songloft.fs.readFile(runtimeFiles.pidPath);
      const pid = parseInt(pidContent.trim());
      if (pid > 0) {
        await songloft.command.exec("kill", ["-9", String(pid)]);
        songloft.log.info(`Force killed MPD process with PID: ${pid}`);

        // 等待进程真正结束
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    songloft.log.warn(`Failed to force kill MPD: ${String(error)}`);
  }
}

/**
 * 释放音频设备资源
 */
async function releaseAudioDevices(songloft: SongloftCommandApi): Promise<void> {
  try {
    // 释放ALSA设备
    try {
      await songloft.command.exec("fuser", ["-k", "/dev/snd/*"], { timeout: 3000 });
    } catch (error) {
      // fuser可能失败，但不影响其他清理
    }

    // 释放PulseAudio设备（如果使用）
    try {
      const pulseServer = await songloft.storage.get(STORAGE_AUDIO_PULSE_SERVER);
      if (pulseServer) {
        await songloft.command.exec("pactl", ["unload-module", "module-alsa-sink"], { timeout: 3000 });
      }
    } catch (error) {
      // PulseAudio可能未使用或失败
    }

    songloft.log.info("Audio devices released successfully");
  } catch (error) {
    songloft.log.warn(`Failed to release audio devices: ${String(error)}`);
  }
}

function getCoverValueExtended(song: SongRecord | null): string {
  if (!song) {
    return "";
  }

  const coverFields = [
    song.coverPath,
    song.coverUrl,
    song.cover_path,
    song.cover_image_path,
    song.album_art,
    song.cover_art,
    song.thumbnail,
    song.poster,
    song.image,
    song.artwork
  ];

  for (const field of coverFields) {
    if (typeof field === "string" && field.trim()) {
      return field.trim();
    }
  }

  return "";
}

function hasValidLyrics(song: SongRecord | null): boolean {
  if (!song) {
    return false;
  }

  const lyricsText = readLyricsText(song);
  if (!lyricsText) {
    return false;
  }

  const parsed = parseLrc(lyricsText);
  return parsed.length > 0;
}

export async function diagnoseSongIssues(songloft: SongloftCommandApi, songId: string): Promise<{
  success: boolean;
  song?: SongRecord;
  issues: {
    noCover: boolean;
    invalidCover: boolean;
    noLyrics: boolean;
    invalidLyrics: boolean;
    missingMetadata: boolean;
    missingFields: string[];
  };
  details: {
    coverFields: Record<string, any>;
    lyricsFields: Record<string, any>;
    parsedLyrics: Array<{timeSeconds: number; text: string}>;
  };
}> {
  try {
    const numericId = toNumericId(songId);
    if (numericId === null) {
      return {
        success: false,
        issues: {
          noCover: false,
          invalidCover: false,
          noLyrics: false,
          invalidLyrics: false,
          missingMetadata: false,
          missingFields: []
        },
        details: {
          coverFields: {},
          lyricsFields: {},
          parsedLyrics: []
        }
      };
    }

    const song = await songloft.songs.getById(numericId);
    
    const issues = {
      noCover: false,
      invalidCover: false,
      noLyrics: false,
      invalidLyrics: false,
      missingMetadata: false,
      missingFields: [] as string[]
    };

    const coverFields: Record<string, any> = {};
    const lyricsFields: Record<string, any> = {};

    coverFields.coverPath = song.coverPath;
    coverFields.coverUrl = song.coverUrl;
    coverFields.cover_path = song.cover_path;
    coverFields.cover_image_path = song.cover_image_path;
    coverFields.album_art = song.album_art;
    coverFields.cover_art = song.cover_art;
    coverFields.thumbnail = song.thumbnail;
    coverFields.poster = song.poster;
    coverFields.image = song.image;
    coverFields.artwork = song.artwork;

    lyricsFields.lyrics = song.lyrics ? song.lyrics.substring(0, 50) + "..." : null;
    lyricsFields.lyric = song.lyric ? song.lyric.substring(0, 50) + "..." : null;
    lyricsFields.lrc = song.lrc ? song.lrc.substring(0, 50) + "..." : null;
    lyricsFields.lyric_text = song.lyric_text ? song.lyric_text.substring(0, 50) + "..." : null;
    lyricsFields.lyrics_text = song.lyrics_text ? song.lyrics_text.substring(0, 50) + "..." : null;
    lyricsFields.rawLyrics = song.rawLyrics ? song.rawLyrics.substring(0, 50) + "..." : null;
    lyricsFields.raw_lyrics = song.raw_lyrics ? song.raw_lyrics.substring(0, 50) + "..." : null;
    lyricsFields.lrc_content = song.lrc_content ? song.lrc_content.substring(0, 50) + "..." : null;
    lyricsFields.lyric_content = song.lyric_content ? song.lyric_content.substring(0, 50) + "..." : null;

    let coverApiUrl = "";
    let lyricsApiUrl = "";
    if (song.id) {
      coverApiUrl = await fetchSongCoverFromApi(songloft, song.id);
      lyricsApiUrl = await fetchSongLyricsFromApi(songloft, song.id);
    }
    coverFields.coverApiUrl = coverApiUrl || null;
    lyricsFields.lyricsApiUrl = lyricsApiUrl || null;

    const coverValue = coverApiUrl || getCoverValueExtended(song);
    if (!coverValue) {
      issues.noCover = true;
    } else {
      issues.invalidCover = true;
    }

    let lyricsText = "";
    try {
      if (song.id) {
        lyricsText = await fetchSongLyricsFromApi(songloft, song.id);
      }
    } catch (error) {
      songloft.log.warn("Failed to fetch lyrics in diagnoseSongIssues: " + String(error));
    }
    if (!lyricsText) {
      lyricsText = readLyricsText(song);
    }
    let parsedLyrics: Array<{timeSeconds: number; text: string}> = [];
    
    if (!lyricsText) {
      issues.noLyrics = true;
    } else {
      parsedLyrics = parseLrc(lyricsText);
      if (parsedLyrics.length === 0) {
        issues.invalidLyrics = true;
      }
    }

    const requiredFields = ['title', 'artist', 'album'];
    for (const field of requiredFields) {
      if (!song[field as keyof SongRecord]) {
        issues.missingFields.push(field);
      }
    }
    
    if (issues.missingFields.length > 0) {
      issues.missingMetadata = true;
    }

    return {
      success: true,
      song,
      issues,
      details: {
        coverFields,
        lyricsFields,
        parsedLyrics
      }
    };
  } catch (error) {
    songloft.log.error("Diagnosis failed: " + String(error));
    return {
      success: false,
      issues: {
        noCover: false,
        invalidCover: false,
        noLyrics: false,
        invalidLyrics: false,
        missingMetadata: false,
        missingFields: []
      },
      details: {
        coverFields: {},
        lyricsFields: {},
        parsedLyrics: []
      }
    };
  }
}

// ===== v1.0.9优化：导出优化相关函数和类 =====
export {
  PrefetchManager,
  prefetchManager,
  ConnectionPool,
  connectionPool,
  DynamicConcurrencyController,
  dynamicConcurrencyController,
  NetworkLatencyMonitor,
  networkLatencyMonitor
};
