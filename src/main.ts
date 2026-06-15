/**
 * MPD 播放控制插件 - 主入口文件
 * 使用新的工具模块重构，提高代码质量和可维护性
 */

import {
  getAlbumDetail,
  getArtistDetail,
  getLibraryHome,
  getPlaylistDetail,
  listAlbums,
  listPlaylists,
  listArtists,
  listSongs,
  searchSongs
} from "./services/library";

// 导入 MPD 核心功能
import {
  clearQueue,
  deleteBinary,
  downloadBinary,
  downloadManagedBinaryBundle,
  getBinaryStatus,
  getMpdConfig,
  getMpdLog,
  getMpdRuntimeStatus,
  getMpdStartupDiagnostics,
  getPlayerState,
  getPollingStatus,
  getQueueState,
  jumpQueueItem,
  markNavigationEnd,
  markNavigationStart,
  playBatch,
  playBatchWithStatus,
  playSongById,
  removeQueueItem,
  restartManagedMpd,
  runPlayerAction,
  saveAudioPreferences,
  startManagedMpd,
  stopManagedMpd,
  uploadManagedBinaryBundleArchive,
  diagnoseSongIssues,
  // v1.0.9优化：导入优化相关函数
  prefetchManager,
  connectionPool,
  dynamicConcurrencyController,
  networkLatencyMonitor
} from "./services/mpd-core";

// 导入新的工具模块
import {
  getAuthCredentials,
  getSongCoverUrl,
  getPlaylistCoverUrl,
  getSongLyrics
} from "./services/mpd/auth";

import {
  PluginError,
  ValidationError,
  NotFoundError,
  safeExecute,
  createSuccessResponse,
  createErrorResponse,
  validateParams,
  withTimeout
} from "./services/mpd/errors";

import {
  getLyricsCache,
  cleanupAllCaches
} from "./services/mpd/cache";

import {
  PLUGIN_NAME,
  ENTRY_PATH,
  VERSION,
  STORAGE_KEYS,
  API_CODES,
  ENV_VARS,
  DIAGNOSTIC_THRESHOLDS,
  DEFAULTS
} from "./services/mpd/constants";

import type { SongloftCommandApi } from "./services/mpd/types";

// ===== 类型定义 =====

declare const songloft: SongloftCommandApi;

type HTTPRequest = {
  method: string;
  path: string;
  query?: string;
  headers?: Record<string, string>;
  body?: string;
};

type HTTPResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

type BootstrapPayload = {
  app: {
    name: string;
    version: string;
    entryPath: string;
  };
  auth: {
    hostUrl: string;
    accessToken: string;
  };
  mpd: {
    serviceStatus: string;
    playbackStatus: string;
    platform: string;
    pollingIntervalMs: number;
  };
  ui: {
    currentPage: string;
    lastVisitedAt: string;
    libraryEnabled: boolean;
  };
};

// ===== 工具函数 =====

/**
 * 创建 JSON 响应
 */
function jsonResponse<T>(body: T, statusCode = 200): HTTPResponse {
  const bodyMessage = (body && typeof body === "object" && "message" in body)
    ? String((body as Record<string, unknown>).message)
    : "";
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify({
      code: statusCode === 200 ? API_CODES.SUCCESS : statusCode,
      message: statusCode === 200 ? "ok" : (bodyMessage || "error"),
      data: body,
      timestamp: new Date().toISOString()
    })
  };
}

/**
 * 创建文本响应
 */
function textResponse(body: string, statusCode = 200): HTTPResponse {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body
  };
}

/**
 * 创建错误响应
 */
function errorResponse(message: string, statusCode = 500): HTTPResponse {
  const errorResponse = createErrorResponse(message, statusCode);
  return jsonResponse(errorResponse, statusCode);
}

/**
 * 解析查询参数
 */
function parseQuery(raw: string | undefined): Record<string, string> {
  const query: Record<string, string> = {};
  if (!raw) {
    return query;
  }

  const parts = raw.split("&");
  for (const part of parts) {
    if (!part) {
      continue;
    }
    const [key, value = ""] = part.split("=");
    if (!key) {
      continue;
    }
    query[decodeURIComponent(key)] = decodeURIComponent(value);
  }

  return query;
}

/**
 * 解析 JSON 请求体
 */
function parseJson<T>(raw: string | undefined): T | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    songloft.log.warn("解析 JSON 失败: " + String(error));
    return null;
  }
}

/**
 * 读取布尔值存储
 */
async function readBooleanStorage(key: string): Promise<boolean> {
  const value = ((await songloft.storage.get(key)) || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

/**
 * 检查是否为开发模式
 */
function isDevelopmentMode(): boolean {
  return ENV_VARS.NODE_ENV === ENV_VARS.DEVELOPMENT;
}

/**
 * 开发模式日志
 */
function debugLog(message: string): void {
  if (isDevelopmentMode()) {
    songloft.log.info(`[DEBUG] ${message}`);
  }
}

// ===== 业务函数 =====

/**
 * 读取引导数据
 */
async function readBootstrapPayload(): Promise<BootstrapPayload> {
  const [hostUrl, accessToken, currentPage, lastVisitedAt] = await Promise.all([
    songloft.plugin.getHostUrl(),
    songloft.plugin.getToken(),
    songloft.storage.get(STORAGE_KEYS.LAST_PAGE),
    songloft.storage.get(STORAGE_KEYS.LAST_VISITED_AT)
  ]);

  return {
    app: {
      name: PLUGIN_NAME,
      version: VERSION,
      entryPath: ENTRY_PATH
    },
    auth: {
      hostUrl,
      accessToken
    },
    mpd: {
      serviceStatus: "not_installed",
      playbackStatus: "stopped",
      platform: "linux-x86_64-glibc/linux-x86_64-musl/linux-arm64-glibc/linux-arm64-musl/linux-armv7-glibc",
      pollingIntervalMs: DEFAULTS.POLLING_INTERVAL_MS
    },
    ui: {
      currentPage: currentPage || "home",
      lastVisitedAt: lastVisitedAt || new Date(0).toISOString(),
      libraryEnabled: true
    }
  };
}

/**
 * 获取自动启动状态
 */
async function getAutostartStatus() {
  const enabled = await readBooleanStorage(STORAGE_KEYS.MPD_AUTOSTART);
  const binaries = await getBinaryStatus(songloft);

  let selectedSource = "missing";
  if (binaries.mpd.source === "packaged-bin" && binaries.mpc.source === "packaged-bin") {
    selectedSource = "packaged-bin";
  } else if (binaries.mpd.source === "plugin-bin" && binaries.mpc.source === "plugin-bin") {
    selectedSource = "plugin-bin";
  } else if (binaries.mpd.executableAvailable && binaries.mpc.executableAvailable) {
    selectedSource = binaries.mpd.source === binaries.mpc.source ? binaries.mpd.source : "mixed";
  }

  const notes: string[] = [
    "Songloft SDK 的命令解析顺序为打包进插件的 bin/<platform>/，然后是插件 bin/，最后才是系统 PATH",
    "当前插件暂不支持手动切换可执行文件优先级"
  ];

  if (!enabled) {
    notes.push("当前未启用插件初始化时自动拉起 MPD");
  }
  if (selectedSource === "missing") {
    notes.push("当前未发现可用于启动的 mpd/mpc 组合");
  } else if (selectedSource === "mixed") {
    notes.push("当前 mpd 和 mpc 来源不一致，建议统一为 packaged-bin、plugin-bin 或 system-path");
  }

  return {
    enabled,
    strategy: "packaged-bin-first-then-plugin-bin-then-system-path",
    selectedSource,
    eligible: selectedSource === "packaged-bin" || selectedSource === "plugin-bin" || selectedSource === "system-path",
    notes
  };
}

/**
 * 读取二进制文件偏好设置
 */
async function readBinaryPreferences() {
  const [mpdUrl, mpcUrl] = await Promise.all([
    songloft.storage.get(STORAGE_KEYS.MPD_URL),
    songloft.storage.get(STORAGE_KEYS.MPC_URL)
  ]);

  return {
    mpdUrl: mpdUrl || "",
    mpcUrl: mpcUrl || ""
  };
}

/**
 * 读取二进制文件状态响应
 */
async function readBinaryStateResponse() {
  const [binaryStatus, preferences] = await Promise.all([
    getBinaryStatus(songloft),
    readBinaryPreferences()
  ]);

  return {
    ...binaryStatus,
    preferences
  };
}

// ===== 生命周期钩子 =====

/**
 * 插件初始化
 */
async function onInit(): Promise<void> {
  songloft.log.info(`[${ENTRY_PATH}] 插件初始化开始`);

  // 清理过期缓存
  const cleanedCount = await cleanupAllCaches();
  if (cleanedCount > 0) {
    songloft.log.info(`[${ENTRY_PATH}] 清理了 ${cleanedCount} 个过期缓存项`);
  }

  await songloft.storage.set(STORAGE_KEYS.LAST_VISITED_AT, new Date().toISOString());

  if (await readBooleanStorage(STORAGE_KEYS.MPD_AUTOSTART)) {
    try {
      await startManagedMpd(songloft);
      songloft.log.info(`[${ENTRY_PATH}] 自动启动 MPD 成功`);
    } catch (error) {
      songloft.log.warn(`[${ENTRY_PATH}] 自动启动 MPD 失败: ${String(error)}`);
    }
  }
  
  songloft.log.info(`[${ENTRY_PATH}] 插件初始化完成`);
}

/**
 * 插件卸载
 */
async function onDeinit(): Promise<void> {
  songloft.log.info(`[${ENTRY_PATH}] 插件卸载开始`);
  
  try {
    await stopManagedMpd(songloft);
  } catch (error) {
    songloft.log.warn(`[${ENTRY_PATH}] 卸载时停止 MPD 失败: ${String(error)}`);
  }
  
  // 清理所有缓存
  clearAllCaches();
  
  songloft.log.info(`[${ENTRY_PATH}] 插件卸载完成`);
}

// ===== HTTP 请求处理 =====

/**
 * HTTP 请求处理器
 */
async function onHTTPRequest(req: HTTPRequest): Promise<HTTPResponse> {
  try {
    const method = (req.method || "GET").toUpperCase();
    const path = req.path || "/";
    const query = parseQuery(req.query);

    debugLog(`处理请求: ${method} ${path}`);

    // ===== 健康检查 =====
    if (method === "GET" && path === "/api/health") {
      const hostUrl = await songloft.plugin.getHostUrl();
      return jsonResponse({
        status: "ok",
        plugin: ENTRY_PATH,
        version: VERSION,
        hostUrl,
        mode: isDevelopmentMode() ? "development" : "production"
      });
    }

    // ===== 引导数据 =====
    if (method === "GET" && path === "/api/ui/bootstrap") {
      try {
        const playerState = await getPlayerState(songloft);
        const bootstrapPayload = await readBootstrapPayload();
        return jsonResponse({
          ...bootstrapPayload,
          mpd: {
            serviceStatus: playerState.serviceStatus,
            playbackStatus: playerState.playbackStatus,
            platform: "linux-x86_64-glibc/linux-x86_64-musl/linux-arm64-glibc/linux-arm64-musl/linux-armv7-glibc",
            pollingIntervalMs: DEFAULTS.POLLING_INTERVAL_MS
          }
        });
      } catch (error) {
        songloft.log.error(`[/api/ui/bootstrap] 错误: ${String(error)}`);
        const bootstrapPayload = await readBootstrapPayload().catch(() => ({
          app: { name: PLUGIN_NAME, version: VERSION, entryPath: ENTRY_PATH },
          auth: { hostUrl: "", accessToken: "" },
          mpd: { serviceStatus: "error", playbackStatus: "stopped", platform: "", pollingIntervalMs: DEFAULTS.POLLING_INTERVAL_MS },
          ui: { currentPage: "home", lastVisitedAt: new Date(0).toISOString(), libraryEnabled: true }
        }));
      }
    }

  // ===== 库 API =====
  if (method === "GET" && path === "/api/library/home") {
    return jsonResponse(await getLibraryHome(songloft));
  }

  if (method === "GET" && path === "/api/library/playlists") {
    return jsonResponse(await listPlaylists(songloft));
  }

  if (method === "GET" && path === "/api/library/songs") {
    return jsonResponse(await listSongs(songloft));
  }

  if (method === "GET" && path === "/api/library/artists") {
    return jsonResponse(await listArtists(songloft));
  }

  if (method === "GET" && path === "/api/library/albums") {
    return jsonResponse(await listAlbums(songloft));
  }

  if (method === "GET" && path === "/api/library/artists/detail") {
    const detail = await getArtistDetail(songloft, query.name || "");
    if (!detail) {
      return errorResponse("艺术家未找到", API_CODES.NOT_FOUND);
    }
    return jsonResponse(detail);
  }

  if (method === "GET" && path === "/api/library/albums/detail") {
    const detail = await getAlbumDetail(songloft, query.artist || "", query.name || "");
    if (!detail) {
      return errorResponse("专辑未找到", API_CODES.NOT_FOUND);
    }
    return jsonResponse(detail);
  }

  if (method === "GET" && path === "/api/library/search") {
    return jsonResponse(await searchSongs(songloft, query.q || ""));
  }

  // ===== MPD API =====
  if (method === "GET" && path === "/api/mpd/status") {
    try {
      return jsonResponse(await getMpdRuntimeStatus(songloft));
    } catch (error) {
      songloft.log.error(`[/api/mpd/status] 错误: ${String(error)}`);
      return jsonResponse({
        serviceStatus: "error",
        playbackStatus: "stopped",
        notes: [`获取 MPD 状态时出错: ${String(error)}`],
        playerState: null,
        audio: { outputType: "unknown", outputName: "未知", preferences: {} },
        configExists: false,
        binaryStatus: { mpd: { source: "unknown" }, mpc: { source: "unknown" } },
        log: "",
        error: String(error)
      });
    }
  }

  if (method === "GET" && path === "/api/mpd/platform") {
    const binaryStatus = await getBinaryStatus(songloft);
    return jsonResponse(binaryStatus.platform);
  }

  if (method === "GET" && path === "/api/mpd/binaries") {
    return jsonResponse(await readBinaryStateResponse());
  }

  if (method === "GET" && path === "/api/mpd/autostart") {
    return jsonResponse(await getAutostartStatus());
  }

  if (method === "GET" && path === "/api/mpd/config") {
    return jsonResponse({
      path: "mpd.conf",
      content: await getMpdConfig(songloft)
    });
  }

  if (method === "GET" && path === "/api/mpd/log") {
    return jsonResponse(await getMpdLog(songloft));
  }

  if (method === "GET" && path === "/api/mpd/start-diagnostics") {
    return jsonResponse(await getMpdStartupDiagnostics(songloft));
  }

  // ===== MPD 控制操作 =====
  if (method === "POST" && path === "/api/mpd/start") {
    try {
      const result = await startManagedMpd(songloft);
      return jsonResponse({
        runtime: await getMpdRuntimeStatus(songloft),
        start: result,
        player: await getPlayerState(songloft)
      });
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const diagnostics = await safeExecute(
        () => getMpdStartupDiagnostics(songloft),
        { failed: true, message: "诊断信息获取失败" },
        "获取诊断信息",
        songloft
      );
      return jsonResponse({
        error: errorObj.message,
        diagnostics
      }, API_CODES.INTERNAL_ERROR);
    }
  }

  if (method === "POST" && path === "/api/mpd/autostart") {
    const payload = parseJson<{ enabled?: boolean }>(req.body);
    if (payload?.enabled === undefined) {
      throw new ValidationError("缺少 enabled 参数");
    }
    await songloft.storage.set(STORAGE_KEYS.MPD_AUTOSTART, payload.enabled ? "true" : "false");
    return jsonResponse(await getAutostartStatus());
  }

  if (method === "POST" && path === "/api/mpd/audio/preferences") {
    const payload = parseJson<{
      outputType?: "auto" | "pulse" | "alsa" | "pipewire" | "null";
      xdgRuntimeDir?: string;
      pulseServer?: string;
      pipewireRemote?: string;
      alsaDevice?: string;
      restart?: boolean;
    }>(req.body) || {};

    try {
      const preferences = await saveAudioPreferences(songloft, payload);
      let restartResult: unknown = null;
      if (payload.restart) {
        restartResult = await restartManagedMpd(songloft);
      }
      return jsonResponse({
        preferences,
        restart: restartResult,
        runtime: await getMpdRuntimeStatus(songloft),
        player: await getPlayerState(songloft)
      });
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  if (method === "POST" && path === "/api/mpd/binaries/preferences") {
    const payload = parseJson<{ mpdUrl?: string; mpcUrl?: string }>(req.body) || {};
    await songloft.storage.set(STORAGE_KEYS.MPD_URL, payload.mpdUrl || "");
    await songloft.storage.set(STORAGE_KEYS.MPC_URL, payload.mpcUrl || "");
    return jsonResponse(await readBinaryPreferences());
  }

  if (method === "POST" && path === "/api/mpd/binaries/download") {
    const payload = parseJson<{ kind?: "mpd" | "mpc"; url?: string }>(req.body);
    
    validateParams(payload, {
      kind: (val) => val === "mpd" || val === "mpc",
      url: (val) => typeof val === "string" && val.length > 0
    });

    try {
      await downloadBinary(songloft, payload.kind!, payload.url!);
      if (payload.kind === "mpd") {
        await songloft.storage.set(STORAGE_KEYS.MPD_URL, payload.url!);
      } else {
        await songloft.storage.set(STORAGE_KEYS.MPC_URL, payload.url!);
      }
      return jsonResponse(await readBinaryStateResponse());
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  if (method === "POST" && path === "/api/mpd/binaries/download-managed") {
    try {
      await downloadManagedBinaryBundle(songloft);
      return jsonResponse(await getBinaryStatus(songloft));
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  if (method === "POST" && path === "/api/mpd/binaries/upload-managed") {
    const payload = parseJson<{ filename?: string; archiveBase64?: string }>(req.body);
    
    validateParams(payload, {
      filename: (val) => typeof val === "string" && val.length > 0,
      archiveBase64: (val) => typeof val === "string" && val.length > 0
    });

    try {
      await uploadManagedBinaryBundleArchive(songloft, payload.filename!, payload.archiveBase64!);
      return jsonResponse(await getBinaryStatus(songloft));
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  if (method === "POST" && path === "/api/mpd/binaries/delete") {
    const payload = parseJson<{ kind?: "mpd" | "mpc" }>(req.body);
    
    validateParams(payload, {
      kind: (val) => val === "mpd" || val === "mpc"
    });

    try {
      await deleteBinary(songloft, payload.kind!);
      return jsonResponse(await readBinaryStateResponse());
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  if (method === "POST" && path === "/api/mpd/restart") {
    try {
      const result = await restartManagedMpd(songloft);
      return jsonResponse({
        runtime: await getMpdRuntimeStatus(songloft),
        restart: result,
        player: await getPlayerState(songloft)
      });
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  // ===== 播放器 API =====
  if (method === "GET" && path === "/api/player/state") {
    try {
      return jsonResponse(await getPlayerState(songloft));
    } catch (error) {
      songloft.log.error(`[/api/player/state] 错误: ${String(error)}`);
      return jsonResponse({
        serviceStatus: "error",
        playbackStatus: "stopped",
        mpdAvailable: false,
        mpcAvailable: false,
        managedByPlugin: false,
        progress: { currentSeconds: 0, totalSeconds: 0, currentLabel: "00:00", totalLabel: "00:00" },
        volume: null,
        mode: { repeat: false, random: false, single: false, consume: false },
        currentSong: null,
        lyrics: { source: "none", available: false, lines: [] },
        raw: { current: "", status: "" },
        error: String(error)
      });
    }
  }

  if (method === "GET" && path === "/api/queue") {
    return jsonResponse(await getQueueState(songloft));
  }

  if (method === "POST" && path === "/api/player/action") {
    const payload = parseJson<{ action?: string; value?: string }>(req.body);
    
    if (!payload?.action) {
      throw new ValidationError("缺少 action 参数");
    }

    try {
      await runPlayerAction(songloft, payload.action, payload.value);
      return jsonResponse(await getPlayerState(songloft));
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  if (method === "POST" && path === "/api/queue/clear") {
    try {
      await clearQueue(songloft);
      return jsonResponse({
        queue: await getQueueState(songloft),
        player: await getPlayerState(songloft)
      });
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  if (method === "POST" && path === "/api/queue/remove") {
    const payload = parseJson<{ position?: number }>(req.body);
    
    validateParams(payload, {
      position: (val) => typeof val === "number" && val > 0
    });

    try {
      await removeQueueItem(songloft, payload.position!);
      return jsonResponse({
        queue: await getQueueState(songloft),
        player: await getPlayerState(songloft)
      });
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  if (method === "POST" && path === "/api/queue/jump") {
    const payload = parseJson<{ position?: number }>(req.body);
    
    validateParams(payload, {
      position: (val) => typeof val === "number" && val > 0
    });

    try {
      await jumpQueueItem(songloft, payload.position!);
      return jsonResponse({
        queue: await getQueueState(songloft),
        player: await getPlayerState(songloft)
      });
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  if (method === "POST" && path === "/api/player/play-batch") {
    const payload = parseJson<{ songIds?: string[]; shuffle?: boolean; replaceQueue?: boolean }>(req.body);
    
    validateParams(payload, {
      songIds: (val) => Array.isArray(val) && val.length > 0,
      shuffle: (val) => typeof val === "boolean",
      replaceQueue: (val) => typeof val === "boolean"
    });

    try {
      await playBatch(songloft, payload.songIds!, !!payload.shuffle, payload.replaceQueue !== false);
      return jsonResponse(await getPlayerState(songloft));
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  if (method === "POST" && path === "/api/player/play-batch-with-status") {
    const payload = parseJson<{ songIds?: string[]; shuffle?: boolean; replaceQueue?: boolean }>(req.body);
    
    validateParams(payload, {
      songIds: (val) => Array.isArray(val) && val.length > 0,
      shuffle: (val) => typeof val === "boolean",
      replaceQueue: (val) => typeof val === "boolean"
    });

    // 启动后台批量处理，不阻塞 HTTP 响应
    playBatchWithStatus(songloft, payload.songIds!, !!payload.shuffle, payload.replaceQueue !== false)
      .then((result) => {
        songloft.log.info(`[PlayBatch] 后台批量加载完成: ${result.loadedSongs}/${result.totalSongs}`);
      })
      .catch((err) => {
        songloft.log.error(`[PlayBatch] 后台批量加载失败: ${String(err)}`);
      });

    return jsonResponse({
      success: true,
      message: "批量加载已启动，后端陆续处理中",
      totalSongs: payload.songIds!.length
    });
  }

  if (method === "POST" && path === "/api/player/navigation-start") {
    try {
      await markNavigationStart(songloft);
      return jsonResponse({
        success: true,
        message: "Navigation started, polling frequency adjusted"
      });
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  if (method === "POST" && path === "/api/player/navigation-end") {
    try {
      await markNavigationEnd(songloft);
      return jsonResponse({
        success: true,
        message: "Navigation ended, polling frequency restored"
      });
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  if (method === "GET" && path === "/api/player/polling-status") {
    try {
      const status = await getPollingStatus(songloft);
      return jsonResponse({
        polling: status
      });
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  // v1.0.8优化：性能报告API
  if (method === "GET" && path === "/api/player/performance-report") {
    try {
      const report = getPerformanceReport();
      return jsonResponse({
        performance: report
      });
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  // v1.0.8优化：重置性能指标API
  if (method === "POST" && path === "/api/player/performance-reset") {
    try {
      resetPerformanceMetrics();
      return jsonResponse({
        success: true,
        message: "Performance metrics reset"
      });
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  // v1.0.9优化：优化状态监控API
  if (method === "GET" && path === "/api/player/optimization-stats") {
    try {
      return jsonResponse({
        optimization: {
          prefetch: prefetchManager.getStats(),
          connectionPool: connectionPool.getStats(),
          dynamicConcurrency: dynamicConcurrencyController.getStats(),
          networkLatency: networkLatencyMonitor.getStats()
        }
      });
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  // v1.0.9优化：重置优化统计API
  if (method === "POST" && path === "/api/player/optimization-reset") {
    try {
      prefetchManager.clearCache();
      dynamicConcurrencyController.reset();
      networkLatencyMonitor.reset();
      connectionPool.clear();
      return jsonResponse({
        success: true,
        message: "Optimization stats reset"
      });
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  if (method === "POST" && path === "/api/player/play-song") {
    const payload = parseJson<{ songId?: string }>(req.body);
    
    validateParams(payload, {
      songId: (val) => typeof val === "string" && val.length > 0
    });

    try {
      await playSongById(songloft, payload.songId!);
      return jsonResponse(await getPlayerState(songloft));
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  if (method === "POST" && path === "/api/mpd/stop") {
    try {
      await stopManagedMpd(songloft);
      return jsonResponse(await getPlayerState(songloft));
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  // ===== 歌单详情 =====
  if (method === "GET" && path.indexOf("/api/library/playlists/") === 0) {
    const playlistId = path.slice("/api/library/playlists/".length);
    const detail = await getPlaylistDetail(songloft, playlistId);
    if (!detail) {
      return errorResponse("歌单未找到", API_CODES.NOT_FOUND);
    }
    return jsonResponse(detail);
  }

  // ===== 库重新扫描 =====
  if (method === "POST" && path === "/api/library/rescan") {
    try {
      const home = await getLibraryHome(songloft);
      return jsonResponse({
        rescannedAt: new Date().toISOString(),
        summary: home.summary
      });
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  // ===== 会话缓存 =====
  if (method === "POST" && path === "/api/session/cache") {
    const payload = parseJson<{ currentPage?: string }>(req.body);
    const currentPage = payload?.currentPage || "home";
    await songloft.storage.set(STORAGE_KEYS.LAST_PAGE, currentPage);
    await songloft.storage.set(STORAGE_KEYS.LAST_VISITED_AT, new Date().toISOString());

    return jsonResponse({
      currentPage
    });
  }

  // ===== 诊断 API =====
  if (method === "GET" && path === "/api/debug/diagnose") {
    const songId = query.id;
    if (!songId) {
      throw new ValidationError("缺少 songId 参数");
    }

    try {
      const diagnosis = await diagnoseSongIssues(songloft, songId);
      return jsonResponse(diagnosis);
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  if (method === "GET" && path === "/api/debug/batch-diagnose") {
    const limit = Math.min(
      parseInt(query.limit || String(DIAGNOSTIC_THRESHOLDS.BATCH_DIAGNOSIS_DEFAULT_LIMIT)),
      DIAGNOSTIC_THRESHOLDS.MAX_BATCH_DIAGNOSIS_LIMIT
    );
    
    try {
      const songs = await songloft.songs.list({ limit }) || [];
      
      // 并行处理批量诊断，提升性能
      const results = await Promise.all(
        songs.map(song => diagnoseSongIssues(songloft, String(song.id)))
      );
      
      return jsonResponse({
        results,
        total: results.length,
        issues: {
          noCover: results.filter(r => r.issues.noCover).length,
          invalidCover: results.filter(r => r.issues.invalidCover).length,
          noLyrics: results.filter(r => r.issues.noLyrics).length,
          invalidLyrics: results.filter(r => r.issues.invalidLyrics).length,
          missingMetadata: results.filter(r => r.issues.missingMetadata).length
        }
      });
    } catch (error) {
      return errorResponse(String(error));
    }
  }

  // ===== 404 响应 =====
  return jsonResponse({
    code: API_CODES.NOT_FOUND,
    message: "未找到"
  }, API_CODES.NOT_FOUND);
  } catch (error) {
    songloft.log.error(`[onHTTPRequest] 未捕获的错误: ${String(error)}`);
    return jsonResponse({
      code: 500,
      message: "服务器内部错误",
      error: String(error)
    }, 500);
  }
}

// ===== 全局导出 =====

globalThis.onInit = onInit;
globalThis.onDeinit = onDeinit;
globalThis.onHTTPRequest = onHTTPRequest;