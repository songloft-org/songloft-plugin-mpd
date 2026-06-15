export type SongRecord = {
  id: number | string;
  type?: string;
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
  lrc_content?: string;
  lyric_content?: string;
  text?: string;
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

export type LibraryHomePayload = {
  summary: {
    playlistCount: number;
    songCount: number;
    artistCount: number;
    albumCount: number;
  };
  playlists: Array<{
    id: string;
    title: string;
    description: string;
    songCount: number;
    coverPath: string;
  }>;
  recentSongs: Array<{
    id: string;
    title: string;
    artist: string;
    album: string;
    durationLabel: string;
    coverPath: string;
  }>;
  artistHighlights: Array<{
    name: string;
    songCount: number;
  }>;
  albumHighlights: Array<{
    name: string;
    artist: string;
    songCount: number;
    coverPath: string;
  }>;
};

export type SongListItem = {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationLabel: string;
  coverPath: string;
};

export type PlaylistDetailPayload = {
  id: string;
  title: string;
  description: string;
  songCount: number;
  coverPath: string;
  songs: SongListItem[];
};

export type SongListPayload = {
  title: string;
  total: number;
  songs: SongListItem[];
};

export type ArtistListPayload = {
  title: string;
  total: number;
  artists: Array<{
    id: string;
    name: string;
    songCount: number;
    albumCount: number;
    topSong: string;
  }>;
};

export type ArtistDetailPayload = {
  name: string;
  songCount: number;
  albumCount: number;
  albums: Array<{
    id: string;
    name: string;
    artist: string;
    songCount: number;
    coverPath: string;
  }>;
  songs: SongListItem[];
};

export type AlbumListPayload = {
  title: string;
  total: number;
  albums: Array<{
    id: string;
    name: string;
    artist: string;
    songCount: number;
    coverPath: string;
  }>;
};

export type AlbumDetailPayload = {
  name: string;
  artist: string;
  songCount: number;
  coverPath: string;
  coverSource: string;
  coverSongCount: number;
  songs: SongListItem[];
};

export type SearchPayload = {
  query: string;
  songs: SongListItem[];
};

type SongloftApi = {
  songs: {
    list(options?: { limit?: number; offset?: number }): Promise<SongRecord[] | null | undefined>;
    getById(id: number | string): Promise<SongRecord | null | undefined>;
    search(keyword: string): Promise<SongRecord[] | null | undefined>;
  };
  playlists: {
    list(): Promise<PlaylistRecord[] | null | undefined>;
    getById(id: number | string): Promise<PlaylistRecord | null | undefined>;
    getSongs(id: number | string, options?: { limit?: number; offset?: number }): Promise<SongRecord[] | null | undefined>;
  };
  log: {
    warn(message: string): void;
  };
};

// 歌曲缓存
interface SongsCache {
  data: SongRecord[] | null;
  timestamp: number;
  version: string;
}

let songsCache: SongsCache = {
  data: null,
  timestamp: 0,
  version: "v1"
};

const SONGS_CACHE_TTL = 60000; // 1分钟
const SONGS_CACHE_VERSION = "v1";

function toArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function toText(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function toId(value: unknown, fallbackPrefix: string, index: number): string {
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }
  return `${fallbackPrefix}-${index + 1}`;
}

function getCoverValue(value: { coverPath?: string; coverUrl?: string; cover_path?: string; cover_image_path?: string; album_art?: string; cover_art?: string; thumbnail?: string; poster?: string; image?: string; artwork?: string } | null | undefined): string {
  if (!value) {
    return "";
  }

  const coverFields = [
    value.coverPath,
    value.coverUrl,
    value.cover_path,
    value.cover_image_path,
    value.album_art,
    value.cover_art,
    value.thumbnail,
    value.poster,
    value.image,
    value.artwork
  ];

  for (const field of coverFields) {
    if (typeof field === "string" && field.trim()) {
      return field.trim();
    }
  }

  return "";
}

function getCoverInfo(value: { coverPath?: string; coverUrl?: string; cover_path?: string; cover_image_path?: string; album_art?: string; cover_art?: string; thumbnail?: string; poster?: string; image?: string; artwork?: string } | null | undefined) {
  if (!value) {
    return {
      value: "",
      source: "none"
    };
  }

  const coverPath = toText(value.coverPath, "");
  if (coverPath) {
    return {
      value: coverPath,
      source: "coverPath"
    };
  }

  const coverUrl = toText(value.coverUrl, "");
  if (coverUrl) {
    return {
      value: coverUrl,
      source: "coverUrl"
    };
  }

  const legacyCoverPath = toText(value.cover_path, "");
  if (legacyCoverPath) {
    return {
      value: legacyCoverPath,
      source: "cover_path"
    };
  }

  for (const [field, source] of [
    ["cover_image_path", "cover_image_path"],
    ["album_art", "album_art"],
    ["cover_art", "cover_art"],
    ["thumbnail", "thumbnail"],
    ["poster", "poster"],
    ["image", "image"],
    ["artwork", "artwork"]
  ] as const) {
    const fieldValue = toText(value[field as keyof typeof value] as string, "");
    if (fieldValue) {
      return {
        value: fieldValue,
        source
      };
    }
  }

  return {
    value: "",
    source: "none"
  };
}

function toNumericId(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDuration(durationSeconds: unknown): string {
  const totalSeconds = typeof durationSeconds === "number" && isFinite(durationSeconds)
    ? Math.max(0, Math.floor(durationSeconds))
    : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function sortByCountThenName<T extends { songCount: number; name: string }>(items: T[]): T[] {
  return items.sort((left, right) => {
    if (right.songCount !== left.songCount) {
      return right.songCount - left.songCount;
    }
    return left.name.localeCompare(right.name, "zh-CN");
  });
}

function uniqueCount(values: string[]): number {
  const map: Record<string, true> = {};
  for (const value of values) {
    if (value) {
      map[value] = true;
    }
  }
  return Object.keys(map).length;
}

function pickRecentSongs(items: SongRecord[], limit = 8): SongRecord[] {
  const ranked = items
    .map((song, index) => {
      const numericId = toNumericId(String(song.id ?? ""));
      return {
        song,
        index,
        numericId
      };
    })
    .sort((left, right) => {
      if (left.numericId !== null && right.numericId !== null && left.numericId !== right.numericId) {
        return right.numericId - left.numericId;
      }
      return right.index - left.index;
    });

  return ranked.slice(0, limit).map((entry) => entry.song);
}

function normalizeSong(song: SongRecord, index: number): SongListItem {
  return {
    id: toId(song.id, "song", index),
    title: toText(song.title, "未命名歌曲"),
    artist: toText(song.artist, "未知歌手"),
    album: toText(song.album, "未知专辑"),
    durationLabel: formatDuration(song.duration),
    coverPath: getCoverValue(song)
  };
}

function normalizePlaylist(playlist: PlaylistRecord, index: number) {
  return {
    id: toId(playlist.id, "playlist", index),
    title: toText(playlist.name || playlist.title, "未命名歌单"),
    description: toText(playlist.description, "来自 Songloft 的歌单数据"),
    songCount: typeof playlist.songCount === "number"
      ? playlist.songCount
      : typeof playlist.song_count === "number"
        ? playlist.song_count
        : 0,
    coverPath: getCoverValue(playlist)
  };
}

function resolveCoverFromSongs(songs: SongRecord[]) {
  for (const song of songs) {
    const coverPath = getCoverValue(song);
    if (coverPath) {
      return coverPath;
    }
  }
  return "";
}

async function resolvePlaylistCoverPath(songloft: SongloftApi, playlistId: string, fallbackCoverPath?: string) {
  if (fallbackCoverPath) {
    return fallbackCoverPath;
  }

  const songs = await getPlaylistSongsPage(songloft, playlistId, 0, 24);
  return resolveCoverFromSongs(songs);
}

async function normalizePlaylistWithCover(songloft: SongloftApi, playlist: PlaylistRecord, index: number) {
  const normalized = normalizePlaylist(playlist, index);
  if (normalized.coverPath) {
    return normalized;
  }

  return {
    ...normalized,
    coverPath: await resolvePlaylistCoverPath(songloft, normalized.id)
  };
}

async function getAllSongs(songloft: SongloftApi, forceRefresh = false): Promise<SongRecord[]> {
  // 检查缓存
  if (!forceRefresh && songsCache.data && songsCache.timestamp) {
    const cacheAge = Date.now() - songsCache.timestamp;
    if (cacheAge < SONGS_CACHE_TTL && songsCache.version === SONGS_CACHE_VERSION) {
      return songsCache.data;
    }
  }

  const pageSize = 200;
  const maxOffset = 10000;
  const songs: SongRecord[] = [];

  // 并行查询所有页
  const pagePromises = [];
  for (let offset = 0; offset < maxOffset; offset += pageSize) {
    pagePromises.push(
      songloft.songs.list({ limit: pageSize, offset }).then(toArray).catch(() => [])
    );
  }

  const pages = await Promise.all(pagePromises);

  // 合并结果
  for (const page of pages) {
    if (!page.length) break;
    songs.push(...page);
    if (page.length < pageSize) break;
  }

  // 更新缓存
  songsCache = {
    data: songs,
    timestamp: Date.now(),
    version: SONGS_CACHE_VERSION
  };

  return songs;
}

function invalidateSongsCache(): void {
  songsCache.data = null;
  songsCache.timestamp = 0;
}

async function getPlaylistSongsPage(songloft: SongloftApi, playlistId: string, offset: number, limit: number) {
  const numericPlaylistId = toNumericId(playlistId);
  if (numericPlaylistId === null) {
    return [];
  }

  return toArray(await songloft.playlists.getSongs(numericPlaylistId, { limit, offset }));
}

async function getAllPlaylistSongs(songloft: SongloftApi, playlistId: string) {
  const pageSize = 200;
  const songs: SongRecord[] = [];

  for (let offset = 0; offset < 10_000; offset += pageSize) {
    const page = await getPlaylistSongsPage(songloft, playlistId, offset, pageSize);
    if (!page.length) {
      break;
    }
    songs.push(...page);
    if (page.length < pageSize) {
      break;
    }
  }

  return songs;
}

function buildArtistDirectory(songs: SongRecord[]) {
  const artistMap: Record<string, { name: string; songCount: number; albumMap: Record<string, true>; songs: SongRecord[] }> = {};

  for (const song of songs) {
    const artistName = toText(song.artist, "未知歌手");
    const albumName = toText(song.album, "未知专辑");

    if (!artistMap[artistName]) {
      artistMap[artistName] = {
        name: artistName,
        songCount: 0,
        albumMap: {},
        songs: []
      };
    }

    artistMap[artistName].songCount += 1;
    artistMap[artistName].albumMap[albumName] = true;
    artistMap[artistName].songs.push(song);
  }

  return sortByCountThenName(
    Object.keys(artistMap).map((name) => ({
      id: name,
      name,
      songCount: artistMap[name].songCount,
      albumCount: Object.keys(artistMap[name].albumMap).length,
      topSong: toText(artistMap[name].songs[0]?.title, "未命名歌曲"),
      songs: artistMap[name].songs
    }))
  );
}

function buildAlbumDirectory(songs: SongRecord[]) {
  const albumMap: Record<string, { id: string; name: string; artist: string; songCount: number; coverPath: string; songs: SongRecord[] }> = {};

  for (const song of songs) {
    const artistName = toText(song.artist, "未知歌手");
    const albumName = toText(song.album, "未知专辑");
    const albumKey = `${artistName}::${albumName}`;

    if (!albumMap[albumKey]) {
      albumMap[albumKey] = {
        id: albumKey,
        name: albumName,
        artist: artistName,
        songCount: 0,
        coverPath: "",
        songs: []
      };
    }

    albumMap[albumKey].songCount += 1;
    if (!albumMap[albumKey].coverPath) {
      albumMap[albumKey].coverPath = getCoverValue(song);
    }
    albumMap[albumKey].songs.push(song);
  }

  return sortByCountThenName(
    Object.keys(albumMap).map((key) => ({
      id: albumMap[key].id,
      name: albumMap[key].name,
      artist: albumMap[key].artist,
      songCount: albumMap[key].songCount,
      coverPath: albumMap[key].coverPath,
      songs: albumMap[key].songs
    }))
  );
}

export async function getLibraryHome(songloft: SongloftApi): Promise<LibraryHomePayload> {
  const [songs, playlistsResult] = await Promise.all([
    getAllSongs(songloft),
    songloft.playlists.list()
  ]);
  const playlists = toArray(playlistsResult);
  const normalizedPlaylists = await Promise.all(
    playlists.map((playlist, index) => normalizePlaylistWithCover(songloft, playlist, index))
  );
  const artistHighlights = buildArtistDirectory(songs)
    .slice(0, 6)
    .map((item) => ({
      name: item.name,
      songCount: item.songCount
    }));
  const albumHighlights = buildAlbumDirectory(songs)
    .slice(0, 6)
    .map((item) => ({
      name: item.name,
      artist: item.artist,
      songCount: item.songCount,
      coverPath: item.coverPath
    }));

  return {
    summary: {
      playlistCount: playlists.length,
      songCount: songs.length,
      artistCount: uniqueCount(songs.map((song) => toText(song.artist, ""))),
      albumCount: uniqueCount(songs.map((song) => toText(song.album, "")))
    },
    playlists: normalizedPlaylists,
    recentSongs: pickRecentSongs(songs).map(normalizeSong),
    artistHighlights,
    albumHighlights
  };
}

export async function searchSongs(songloft: SongloftApi, query: string): Promise<SearchPayload> {
  const keyword = query.trim();
  if (!keyword) {
    return {
      query: "",
      songs: []
    };
  }

  let results: SongRecord[] = [];
  try {
    results = toArray(await songloft.songs.search(keyword));
  } catch (error) {
    songloft.log.warn("songloft.songs.search failed: " + String(error));
  }

  return {
    query: keyword,
    songs: results.slice(0, 12).map(normalizeSong)
  };
}

export async function listPlaylists(songloft: SongloftApi) {
  const playlists = toArray(await songloft.playlists.list());
  return Promise.all(
    playlists.map((playlist, index) => normalizePlaylistWithCover(songloft, playlist, index))
  );
}

export async function listSongs(songloft: SongloftApi): Promise<SongListPayload> {
  const songs = await getAllSongs(songloft);
  return {
    title: "全部歌曲",
    total: songs.length,
    songs: songs.map(normalizeSong)
  };
}

export async function listArtists(songloft: SongloftApi): Promise<ArtistListPayload> {
  const songs = await getAllSongs(songloft);
  const artists = buildArtistDirectory(songs).map((item) => ({
    id: item.id,
    name: item.name,
    songCount: item.songCount,
    albumCount: item.albumCount,
    topSong: item.topSong
  }));

  return {
    title: "全部歌手",
    total: artists.length,
    artists
  };
}

export async function getArtistDetail(songloft: SongloftApi, artistName: string): Promise<ArtistDetailPayload | null> {
  const targetName = toText(artistName, "");
  if (!targetName) {
    return null;
  }

  const songs = await getAllSongs(songloft);
  const artists = buildArtistDirectory(songs);
  const matched = artists.find((item) => item.name === targetName);
  if (!matched) {
    return null;
  }

  return {
    name: matched.name,
    songCount: matched.songCount,
    albumCount: matched.albumCount,
    albums: buildAlbumDirectory(matched.songs).map((item) => ({
      id: item.id,
      name: item.name,
      artist: item.artist,
      songCount: item.songCount,
      coverPath: item.coverPath
    })),
    songs: matched.songs.map(normalizeSong)
  };
}

export async function listAlbums(songloft: SongloftApi): Promise<AlbumListPayload> {
  const songs = await getAllSongs(songloft);
  const albums = buildAlbumDirectory(songs).map((item) => ({
    id: item.id,
    name: item.name,
    artist: item.artist,
    songCount: item.songCount,
    coverPath: item.coverPath
  }));

  return {
    title: "全部专辑",
    total: albums.length,
    albums
  };
}

export async function getAlbumDetail(songloft: SongloftApi, artistName: string, albumName: string): Promise<AlbumDetailPayload | null> {
  const targetArtist = toText(artistName, "");
  const targetAlbum = toText(albumName, "");
  if (!targetArtist || !targetAlbum) {
    return null;
  }

  const songs = await getAllSongs(songloft);
  const albums = buildAlbumDirectory(songs);
  const matched = albums.find((item) => item.artist === targetArtist && item.name === targetAlbum);
  if (!matched) {
    return null;
  }

  const coverSongs = matched.songs.filter((song) => getCoverValue(song));
  const firstCoverSong = coverSongs[0];
  const coverInfo = getCoverInfo(firstCoverSong);

  return {
    name: matched.name,
    artist: matched.artist,
    songCount: matched.songCount,
    coverPath: coverInfo.value,
    coverSource: coverInfo.source,
    coverSongCount: coverSongs.length,
    songs: matched.songs.map(normalizeSong)
  };
}

export async function getPlaylistDetail(songloft: SongloftApi, playlistId: string): Promise<PlaylistDetailPayload | null> {
  const numericPlaylistId = toNumericId(playlistId);
  if (numericPlaylistId === null) {
    return null;
  }

  const playlist = await songloft.playlists.getById(numericPlaylistId);
  if (!playlist) {
    return null;
  }

  const songs = await getAllPlaylistSongs(songloft, playlistId);
  const normalizedPlaylist = normalizePlaylist(playlist, 0);
  const derivedCoverPath = normalizedPlaylist.coverPath || resolveCoverFromSongs(songs);

  return {
    ...normalizedPlaylist,
    coverPath: derivedCoverPath,
    songCount: normalizedPlaylist.songCount || songs.length,
    songs: songs.map(normalizeSong)
  };
}
