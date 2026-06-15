/**
 * 认证工具模块
 * 提供统一的认证凭证获取和管理功能
 */

import type { SongloftCommandApi } from "./types";

/**
 * 认证凭证接口
 */
export interface AuthCredentials {
  hostUrl: string;
  accessToken: string;
}

/**
 * 获取认证凭证
 * 统一获取 hostUrl 和 accessToken，避免重复代码
 * 
 * @param songloft - Songloft API 实例
 * @returns 认证凭证，失败时返回空字符串
 * 
 * @example
 * const credentials = await getAuthCredentials(songloft);
 * if (credentials.hostUrl) {
 *   // 使用凭证访问受保护的 API
 * }
 */
export async function getAuthCredentials(
  songloft: SongloftCommandApi
): Promise<AuthCredentials> {
  try {
    const [hostUrl, accessToken] = await Promise.all([
      songloft.plugin.getHostUrl().catch(() => ""),
      songloft.plugin.getToken().catch(() => "")
    ]);
    
    return {
      hostUrl: hostUrl || "",
      accessToken: accessToken || ""
    };
  } catch (error) {
    songloft.log.error(`获取认证凭证失败: ${String(error)}`);
    return {
      hostUrl: "",
      accessToken: ""
    };
  }
}

/**
 * 构建带认证的完整 URL
 * 
 * @param baseUrl - 基础 URL
 * @param path - 路径
 * @param accessToken - 访问令牌
 * @returns 完整的带认证的 URL
 * 
 * @example
 * const url = buildAuthenticatedUrl("http://localhost:58091", "/api/songs/1", "token123");
 * // 返回: "http://localhost:58091/api/songs/1?access_token=token123"
 */
export function buildAuthenticatedUrl(
  baseUrl: string,
  path: string,
  accessToken: string
): string {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  
  if (!accessToken) {
    return `${normalizedBaseUrl}${normalizedPath}`;
  }
  
  return `${normalizedBaseUrl}${normalizedPath}?access_token=${accessToken}`;
}

/**
 * 验证认证凭证是否有效
 * 
 * @param credentials - 认证凭证
 * @returns 是否有效
 */
export function isValidCredentials(credentials: AuthCredentials): boolean {
  return !!credentials.hostUrl && !!credentials.accessToken;
}

/**
 * 从 Songloft API 获取歌曲封面 URL
 * 
 * @param songloft - Songloft API 实例
 * @param songId - 歌曲ID
 * @returns 封面 URL，失败时返回空字符串
 */
export async function getSongCoverUrl(
  songloft: SongloftCommandApi,
  songId: number | string
): Promise<string> {
  try {
    const credentials = await getAuthCredentials(songloft);
    if (!isValidCredentials(credentials)) {
      return "";
    }

    const numericId = typeof songId === "string" ? parseInt(songId, 10) : songId;
    if (!numericId || isNaN(numericId)) {
      return "";
    }

    return buildAuthenticatedUrl(
      credentials.hostUrl,
      `/api/v1/songs/${numericId}/cover`,
      credentials.accessToken
    );
  } catch (error) {
    songloft.log.warn(`获取歌曲 ${songId} 封面 URL 失败: ${String(error)}`);
    return "";
  }
}

/**
 * 从 Songloft API 获取歌单封面 URL
 * 
 * @param songloft - Songloft API 实例
 * @param playlistId - 歌单ID
 * @returns 封面 URL，失败时返回空字符串
 */
export async function getPlaylistCoverUrl(
  songloft: SongloftCommandApi,
  playlistId: number | string
): Promise<string> {
  try {
    const credentials = await getAuthCredentials(songloft);
    if (!isValidCredentials(credentials)) {
      return "";
    }

    const numericId = typeof playlistId === "string" ? parseInt(playlistId, 10) : playlistId;
    if (!numericId || isNaN(numericId)) {
      return "";
    }

    return buildAuthenticatedUrl(
      credentials.hostUrl,
      `/api/v1/playlists/${numericId}/cover`,
      credentials.accessToken
    );
  } catch (error) {
    songloft.log.warn(`获取歌单 ${playlistId} 封面 URL 失败: ${String(error)}`);
    return "";
  }
}

/**
 * 从 Songloft API 获取歌词内容
 * 
 * @param songloft - Songloft API 实例
 * @param songId - 歌曲ID
 * @returns 歌词内容，失败时返回空字符串
 */
export async function getSongLyrics(
  songloft: SongloftCommandApi,
  songId: number | string
): Promise<string> {
  try {
    const credentials = await getAuthCredentials(songloft);
    if (!isValidCredentials(credentials)) {
      return "";
    }

    const numericId = typeof songId === "string" ? parseInt(songId, 10) : songId;
    if (!numericId || isNaN(numericId)) {
      return "";
    }

    const url = buildAuthenticatedUrl(
      credentials.hostUrl,
      `/api/v1/songs/${numericId}/lyric`,
      credentials.accessToken
    );

    const response = await fetch(url);
    if (!response.ok) {
      return "";
    }

    return await response.text();
  } catch (error) {
    songloft.log.warn(`获取歌曲 ${songId} 歌词失败: ${String(error)}`);
    return "";
  }
}