/**
 * 常量定义模块
 * 定义 MPD 插件使用的所有常量
 */

// ===== 插件元数据 =====

export const PLUGIN_NAME = "MPD Playback Controller";
export const ENTRY_PATH = "mpd-player";
export const VERSION = "1.1.1";

// ===== 存储键名 =====

export const STORAGE_KEYS = {
  LAST_PAGE: "ui:last-page",
  LAST_VISITED_AT: "ui:last-visited-at",
  MPD_URL: "mpd:bin:mpd-url",
  MPC_URL: "mpd:bin:mpc-url",
  MPD_AUTOSTART: "mpd:settings:autostart",
  ACTIVE_SONG_SNAPSHOT: "mpd:active-song:snapshot",
  QUEUE_METADATA_SNAPSHOT: "mpd:queue-metadata:snapshot",
  AUDIO_OUTPUT_SNAPSHOT: "mpd:audio-output:snapshot",
  RUNTIME_FILES_SNAPSHOT: "mpd:runtime-files:snapshot"
} as const;

// ===== 进程名称 =====

export const PROCESS_NAMES = {
  MPD: "songloft-managed-mpd"
} as const;

// ===== 文件名 =====

export const FILE_NAMES = {
  MPD_CONFIG: "mpd.conf",
  MPD_PID: "mpd.pid",
  MPD_LOG: "mpd.log"
} as const;

// ===== 缓存配置 =====

export const CACHE_CONFIG = {
  PLATFORM_CACHE_TTL_MS: 300000, // 5 分钟（从10秒延长）
  RESOLVED_BINARY_CACHE_TTL_MS: 600000, // 10 分钟（从10秒延长）
  LYRICS_CACHE_TTL_MS: 3600000, // 1 小时
  COVER_CACHE_TTL_MS: 3600000, // 1 小时
  SONG_TARGET_METADATA_TTL_MS: 300000 // 5 分钟
} as const;

// ===== 轮询间隔 =====

export const POLLING_INTERVALS = {
  MPD_STATUS: 3000, // 3 秒
  PLAYER_STATE: 1000, // 1 秒
  BINARY_STATUS: 10000 // 10 秒
} as const;

// ===== 超时配置 =====

export const TIMEOUTS = {
  MPD_STARTUP: 10000, // 10 秒
  MPD_STOP: 5000, // 5 秒
  COMMAND_EXEC: 10000, // 10 秒
  API_REQUEST: 30000, // 30 秒
  BINARY_DOWNLOAD: 120000 // 2 分钟
} as const;

// ===== 平台支持 =====

export const SUPPORTED_PLATFORMS = [
  "linux-x86_64-glibc",
  "linux-x86_64-musl",
  "linux-arm64-glibc",
  "linux-arm64-musl",
  "linux-armv7-glibc"
] as const;

// ===== 音频输出优先级 =====

export const AUDIO_OUTPUT_PRIORITY = {
  pulse: 100,
  pipewire: 90,
  alsa: 80,
  null: 10,
  auto: 0
} as const;

// ===== API 响应码 =====

export const API_CODES = {
  SUCCESS: 0,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
} as const;

// ===== 错误消息 =====

export const ERROR_MESSAGES = {
  MISSING_PARAM: "缺少必需参数",
  INVALID_PARAM: "参数无效",
  OPERATION_FAILED: "操作失败",
  NOT_FOUND: "资源不存在",
  UNAUTHORIZED: "未授权",
  TIMEOUT: "操作超时",
  BINARY_NOT_FOUND: "未找到可执行文件",
  CONFIG_ERROR: "配置错误",
  AUDIO_ERROR: "音频输出错误"
} as const;

// ===== 日志级别 =====

export const LOG_LEVELS = {
  INFO: "info",
  WARN: "warn",
  ERROR: "error"
} as const;

// ===== 诊断阈值 =====

export const DIAGNOSTIC_THRESHOLDS = {
  BATCH_DIAGNOSIS_DEFAULT_LIMIT: 5,
  MAX_BATCH_DIAGNOSIS_LIMIT: 50
} as const;

// ===== 默认值 =====

export const DEFAULTS = {
  POLLING_INTERVAL_MS: 3000,
  MAX_QUEUE_SIZE: 10000,
  LYRICS_SYNC_OFFSET_MS: 0,
  VOLUME_STEP: 5
} as const;

// ===== 环境变量 =====

export const ENV_VARS = {
  NODE_ENV: "NODE_ENV",
  DEVELOPMENT: "development",
  PRODUCTION: "production"
} as const;

// ===== 文件路径模板 =====

export const PATH_TEMPLATES = {
  MPD_RUNTIME_DIR: "/tmp/songloft-mpd-{random}",
  MPD_CONFIG_TEMPLATE: `root_dir \\$(mktemp -d /tmp/songloft-mpd-XXXXXX) || exit 1\\nprintf '%s\\\\n' "\\$root_dir"`
} as const;

// ===== 允许的文件扩展名 =====

export const ALLOWED_EXTENSIONS = {
  AUDIO: [".mp3", ".flac", ".ogg", ".m4a", ".wav", ".wma"],
  IMAGE: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
  ARCHIVE: [".tar.gz", ".tgz", ".zip"]
} as const;