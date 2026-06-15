/**
 * 类型定义模块
 * 定义 MPD 插件使用的所有 TypeScript 类型
 */

// ===== 基础类型 =====

export type CommandExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type SongRecord = {
  id: number | string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  file_path?: string;
  filePath?: string;
  url?: string;
  cover_path?: string;
  coverPath?: string;
  coverUrl?: string;
  cover_image_path?: string;
  album_art?: string;
  cover_art?: string;
  thumbnail?: string;
  poster?: string;
  image?: string;
  artwork?: string;
  lyric?: string;
  lyrics?: string;
  lrc?: string;
  lyric_text?: string;
  lyrics_text?: string;
  rawLyrics?: string;
  raw_lyrics?: string;
};

export type PlaylistRecord = {
  id: number | string;
  name?: string;
  title?: string;
  description?: string;
  cover_path?: string;
  coverPath?: string;
  coverUrl?: string;
  cover_image_path?: string;
  album_art?: string;
  cover_art?: string;
  thumbnail?: string;
  poster?: string;
  image?: string;
  song_count?: number;
  songCount?: number;
};

// ===== 音频相关类型 =====

export type MpdAudioOutputType = "auto" | "pulse" | "alsa" | "pipewire" | "null";

export type MpdAudioOutputCandidate = {
  type: MpdAudioOutputType;
  name: string;
  priority: number;
  available: boolean;
  socketPath?: string;
  device?: string;
};

export type AudioPreferencePayload = {
  outputType: MpdAudioOutputType;
  xdgRuntimeDir?: string;
  pulseServer?: string;
  pipewireRemote?: string;
  alsaDevice?: string;
};

export type AudioGuidancePayload = {
  outputType: string;
  socketPath: string;
  notes: string[];
};

export type AudioDetectionPayload = {
  preferences: AudioPreferencePayload;
  guidance: AudioGuidancePayload;
  candidates: MpdAudioOutputCandidate[];
};

// ===== MPD 相关类型 =====

export type MpdServiceStatus = "not_installed" | "stopped" | "running" | "error";

export type PlaybackStatus = "playing" | "paused" | "stopped";

export type PlayerMode = {
  repeat: boolean;
  random: boolean;
  single: boolean;
  consume: boolean;
};

export type ProgressInfo = {
  currentSeconds: number;
  totalSeconds: number;
  currentLabel: string;
  totalLabel: string;
  sampledAt: number;
};

export type CurrentSongInfo = {
  position: number;
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  file: string;
  songId?: string;
};

export type LyricsInfo = {
  source: string;
  available: boolean;
  lines: Array<{ timeSeconds: number; text: string }>;
};

export type PlayerStatePayload = {
  serviceStatus: MpdServiceStatus;
  playbackStatus: PlaybackStatus;
  managedByPlugin: boolean;
  mpdAvailable: boolean;
  mpcAvailable: boolean;
  currentSong: CurrentSongInfo | null;
  volume: number | null;
  mode: PlayerMode;
  progress: ProgressInfo;
  lyrics: LyricsInfo;
  raw: {
    current: string;
    status: string;
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

export type QueueMetadataItem = {
  target: string;
  songId: string;
  title: string;
  artist: string;
  album: string;
  filePath: string;
  position: number;
  addedAt: string;
};

export type QueueMetadataSnapshot = Record<string, QueueMetadataItem>;

export type ActiveSongSnapshot = {
  songId: string;
  title: string;
  artist: string;
  album: string;
  target: string;
  lastUpdated: string;
};

export type BinaryItemStatus = {
  kind: "mpd" | "mpc";
  pluginBinExists: boolean;
  executableAvailable: boolean;
  source: string;
  filename: string;
};

export type ResolvedBinary = {
  executableAvailable: boolean;
  source: string;
  executablePath: string;
  platformKey: string;
  version?: string;
};

export type BinaryStatusPayload = {
  mpd: BinaryItemStatus;
  mpc: BinaryItemStatus;
  platform: MpdPlatformPayload;
};

// ===== 缓存相关类型 =====

export type TimedCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

// ===== API 响应类型 =====

export type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
  timestamp: string;
};

export type ApiError = {
  code: number;
  message: string;
  details?: unknown;
  timestamp: string;
};

// ===== Songloft API 类型 =====

export type SongloftCommandApi = {
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
    delete(key: string): Promise<void>;
    keys(): Promise<string[]>;
  };
  log: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
};