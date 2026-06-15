/**
 * MPD 服务模块入口
 * 导出所有 MPD 相关功能
 */

// 导出类型
export * from "./types";

// 导出常量
export * from "./constants";

// 导出工具模块
export * from "./auth";
export * from "./errors";
export * from "./cache";

// 导出 MPD 核心功能（从原始 mpd.ts 提取）
// 注意：由于原始文件太大，这里只导出关键的公开接口
// 实际实现需要从原始 mpd.ts 中逐步迁移到各个子模块

// 临时导出原始 mpd.ts 的核心功能
// 这些后续会被拆分到对应的子模块中

export { getPlayerState } from "../mpd-core";
export { startManagedMpd, stopManagedMpd, restartManagedMpd } from "../mpd-core";
export { runPlayerAction } from "../mpd-core";
export { playSongById, playBatch } from "../mpd-core";
export { getQueueState, clearQueue, removeQueueItem, jumpQueueItem } from "../mpd-core";
export { getMpdRuntimeStatus, getMpdConfig, getMpdLog } from "../mpd-core";
export { getMpdStartupDiagnostics, diagnoseSongIssues } from "../mpd-core";
export { getBinaryStatus, downloadBinary, deleteBinary } from "../mpd-core";
export { saveAudioPreferences } from "../mpd-core";
export { downloadManagedBinaryBundle, uploadManagedBinaryBundleArchive } from "../mpd-core";