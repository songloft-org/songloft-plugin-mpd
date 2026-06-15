(function () {
  var AUDIO_GUIDE_SUPPRESS_REMINDER_STORAGE_KEY = "songloft-mpd:audio-guide:suppress-reminder";
  var AUDIO_ADVANCED_EXPANDED_STORAGE_KEY = "songloft-mpd:audio-advanced:expanded";
  var QUEUE_STATE_STORAGE_KEY = "songloft-mpd:queue-state";
  var QUEUE_STATE_CACHE_VERSION = 2;
  if (window.__SONGLOFT_MPD_APP_BOOTED__) {
    return;
  }
  window.__SONGLOFT_MPD_APP_BOOTED__ = true;

  var state = {
    bootstrap: null,
    libraryHome: null,
    libraryHomeFetchedAt: 0,
    librarySongs: null,
    librarySongsFetchedAt: 0,
    libraryArtists: null,
    libraryArtistsFetchedAt: 0,
    libraryAlbums: null,
    libraryAlbumsFetchedAt: 0,
    artistDetailsByName: {},
    artistDetailFetchedAtByName: {},
    albumDetailsByKey: {},
    albumDetailFetchedAtByKey: {},
    libraryRefreshPending: false,
    currentLibrarySection: "home",
    currentView: "home",
    explorerPlaylistId: "",
    explorerPlaylistDetail: null,
    playlistDetailFetchedAtById: {},
    songFilterText: "",
    songSortMode: "title-asc",
    currentArtistName: "",
    currentAlbumArtist: "",
    currentAlbumName: "",
    libraryHistory: [],
    playerState: null,
    runtimeState: null,
    audioPreferences: null,
    audioGuidance: null,
    audioAdvancedVisible: false,
    audioAdvancedPreferenceInitialized: false,
    audioPreferencesDirty: false,
    audioPreferencesEditing: false,
    audioTemplateDefaultsInitialized: false,
    audioGuideReminderSuppressed: false,
    binaryState: null,
    binaryActionNotice: "",
    binaryActionNoticeType: "",
    autostartState: null,
    queueState: null,
    queueLastSyncedAt: 0,
    queueSyncInFlight: false,
    searchDropdownOpen: false,
    playerSheetOpen: false,
    playerSheetPage: "playback",
    playerSheetHideTimer: 0,
    playerSheetPointerId: null,
    playerSheetTouchId: null,
    playerSheetDragSource: "",
    playerSheetDragReady: false,
    playerSheetDragActive: false,
    playerSheetDragStartX: 0,
    playerSheetDragStartY: 0,
    playerSheetDragOffset: 0,
    playerVolumePopoverOpen: false,
    playerVolumePopoverTimer: 0,
    playerModePopoverOpen: false,
    playerQueueDrawerOpen: false,
    playerQueueDrawerPointerId: null,
    playerQueueDrawerTouchId: null,
    playerQueueDrawerDragReady: false,
    playerQueueDrawerDragActive: false,
    playerQueueDrawerDragStartX: 0,
    playerQueueDrawerDragStartY: 0,
    playerQueueDrawerDragOffset: 0,
    playerPollTimer: 0,
    progressTickTimer: 0,
    lastPlayerStateAt: 0,
isSeeking: false,
    isAdjustingVolume: false,
    lastLyricsSignature: "",
    activeLyricsIndex: -2,
    isBatchProcessing: false,  // 批量处理状态标识
    searchDebounceTimer: 0,    // 搜索防抖定时器
    domCache: {},              // DOM元素缓存
    eventListeners: []         // 事件监听器列表，用于清理
  };

  /* ==================== 缓存和轮询配置常量 ==================== */
  /* 缓存过期时间配置 */
  var LIBRARY_CACHE_TTL_MS = 30 * 60 * 1000;      // 媒体库缓存：30分钟
  var QUEUE_CACHE_TTL_MS = 10 * 60 * 1000;       // 队列缓存：10分钟
  var METADATA_CACHE_TTL_MS = 60 * 60 * 1000;    // 元数据缓存：60分钟

  /* 播放器轮询间隔配置（根据播放状态动态调整） - 已优化 */
  var PLAYER_POLL_INTERVAL_PLAYING_MS = 5000;    // 播放中：5秒（从2.5秒优化）
  var PLAYER_POLL_INTERVAL_PAUSED_MS = 10000;    // 暂停：10秒（从5秒优化）
  var PLAYER_POLL_INTERVAL_IDLE_MS = 30000;      // 空闲：30秒（从9秒优化）
  var PLAYER_POLL_INTERVAL_BATCH_MS = 8000;      // 批量处理时：8秒（新增）

  /* ==================== 工具函数 ==================== */

  /**
   * 显示加载状态
   * @param {string} message - 加载提示信息
   */
  function showLoading(message) {
    var loadingIndicator = document.getElementById("loadingIndicator");
    if (!loadingIndicator) {
      // 创建加载指示器
      loadingIndicator = document.createElement("div");
      loadingIndicator.id = "loadingIndicator";
      loadingIndicator.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;pointer-events:none;opacity:0;transition:opacity 0.3s ease;";
      loadingIndicator.innerHTML = '<div style="background:#fff;padding:20px 30px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.1);display:flex;flex-direction:column;align-items:center;gap:12px;"><div class="loading-spinner" style="width:32px;height:32px;border:3px solid #f3f3f3;border-top:3px solid #1f7aff;border-radius:50%;animation:spin 1s linear infinite;"></div><span class="loading-text" style="color:#333;font-size:14px;font-weight:500;"></span></div>';
      document.body.appendChild(loadingIndicator);
      
      // 添加旋转动画样式
      if (!document.getElementById("loadingSpinnerStyle")) {
        var style = document.createElement("style");
        style.id = "loadingSpinnerStyle";
        style.textContent = "@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }";
        document.head.appendChild(style);
      }
    }
    
    var textElement = loadingIndicator.querySelector(".loading-text");
    if (textElement) {
      textElement.textContent = message || "加载中...";
    }
    
    loadingIndicator.style.pointerEvents = "auto";
    loadingIndicator.style.opacity = "1";
  }

  /**
   * 隐藏加载状态
   */
  function hideLoading() {
    var loadingIndicator = document.getElementById("loadingIndicator");
    if (loadingIndicator) {
      loadingIndicator.style.opacity = "0";
      loadingIndicator.style.pointerEvents = "none";
    }
  }

  /**
   * DOM操作优化 - 使用文档片段批量更新
   * @param {HTMLElement} container - 容器元素
   * @param {Function} itemCreator - 元素创建函数
   * @param {Array} items - 数据项数组
   */
  function batchUpdateDOM(container, itemCreator, items) {
    var fragment = document.createDocumentFragment();
    items.forEach(function(item) {
      var element = itemCreator(item);
      if (element) {
        fragment.appendChild(element);
      }
    });
    
    // 清空容器并一次性添加所有元素
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(fragment);
  }

  /**
   * 错误处理优化 - 友好的错误提示
   * @param {Error} error - 错误对象
   * @param {Function} retryCallback - 重试回调函数（可选）
   */
  function showErrorWithRetry(error, retryCallback) {
    var errorMessage = {
      'NETWORK_ERROR': {
        title: '网络连接失败',
        message: '请检查网络连接后重试',
        action: '重试'
      },
      'TIMEOUT_ERROR': {
        title: '请求超时',
        message: '请稍后重试',
        action: '重试'
      },
      'MPD_ERROR': {
        title: '播放器连接失败',
        message: '请检查MPD服务是否正常运行',
        action: '重新连接'
      }
    };
    
    var errorInfo = errorMessage[error.code] || {
      title: '操作失败',
      message: String(error.message || error),
      action: '重试'
    };
    
    var fullMessage = errorInfo.title + ': ' + errorInfo.message;
    showToast(fullMessage, 'error');
    
    // 如果提供了重试回调，添加重试选项
    if (typeof retryCallback === 'function') {
      setTimeout(function() {
        if (confirm(errorInfo.message + '\n\n是否要' + errorInfo.action + '?')) {
          retryCallback();
        }
      }, 500);
    }
  }

  /**
   * 防抖函数 - 延迟执行函数，避免频繁调用
   * @param {Function} func - 要防抖的函数
   * @param {number} wait - 等待时间（毫秒）
   * @returns {Function} 防抖后的函数
   */
  function debounce(func, wait) {
    return function(...args) {
      if (state.searchDebounceTimer) {
        clearTimeout(state.searchDebounceTimer);
      }
      state.searchDebounceTimer = setTimeout(() => {
        func.apply(this, args);
        state.searchDebounceTimer = 0;
      }, wait);
    };
  }

  /**
   * 节流函数 - 限制函数执行频率
   * @param {Function} func - 要节流的函数
   * @param {number} limit - 时间间隔（毫秒）
   * @returns {Function} 节流后的函数
   */
  function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * DOM缓存 - 缓存DOM元素引用，减少查询开销
   * @param {string} id - 元素ID
   * @returns {HTMLElement|null} 缓存的DOM元素
   */
  function getCachedElement(id) {
    if (!state.domCache[id]) {
      state.domCache[id] = document.getElementById(id);
    }
    return state.domCache[id];
  }

  /**
   * 清空DOM缓存
   */
  function clearDOMCache() {
    state.domCache = {};
  }

  /**
   * 事件监听器管理 - 添加可管理的监听器
   * @param {HTMLElement} element - 目标元素
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   * @param {Object|boolean} options - 事件选项
   */
  function addManagedListener(element, event, handler, options) {
    element.addEventListener(event, handler, options);
    state.eventListeners.push({ element, event, handler, options });
  }

  /**
   * 清理所有事件监听器
   */
  function cleanupEventListeners() {
    state.eventListeners.forEach(({ element, event, handler, options }) => {
      element.removeEventListener(event, handler, options);
    });
    state.eventListeners = [];
  }

  /**
   * 获取API基础路径
   * @returns {string} API基础路径
   */
  function getApiBase() {
    return "./api";
  }

  /**
   * 生成专辑详情缓存键
   * @param {string} artistName - 艺术家名称
   * @param {string} albumName - 专辑名称
   * @returns {string} 缓存键
   */
  function getAlbumDetailCacheKey(artistName, albumName) {
    return String(artistName || "") + "::" + String(albumName || "");
  }

  /**
   * 格式化轮询间隔标签
   * @param {number} intervalMs - 轮询间隔（毫秒）
   * @returns {string} 格式化的标签文本
   */
  function formatPollingIntervalLabel(intervalMs) {
    var seconds = Math.max(0, Number(intervalMs) || 0) / 1000;
    var label = Number.isInteger(seconds) ? String(seconds) : String(Math.round(seconds * 10) / 10);
    return label + " 秒轮询";
  }

  function syncPollingIndicators() {
    var playbackStatus = state.playerState && state.playerState.playbackStatus
      ? String(state.playerState.playbackStatus)
      : "";
    var intervalMs = getPlayerPollIntervalMs();
    var prefix = playbackStatus === "playing"
      ? "播放中 "
      : playbackStatus === "paused"
        ? "暂停时 "
        : "空闲时 ";
    updateText("pollingBadge", prefix + formatPollingIntervalLabel(intervalMs));
}

  /**
   * 设置媒体库重新扫描通知
   * @param {string} message - 通知消息
   * @param {string} type - 通知类型（success/error/info）
   */
  function setLibraryRescanNotice(message, type) {
    var element = document.getElementById("libraryRescanNotice");
    if (!(element instanceof HTMLElement)) {
      return;
    }
    if (!message) {
      element.hidden = true;
      element.textContent = "";
      element.className = "binary-action-notice";
      return;
    }
    element.hidden = false;
    element.textContent = message;
    element.className = "binary-action-notice" + (type ? " " + type : "");
  }

  /**
   * 检查设置视图是否激活
   * @returns {boolean} 设置视图是否激活
   */
  function isSettingsViewActive() {
    return state.currentView === "settings";
  }

  /**
   * 停止实时更新（轮询和进度条）
   * 用于页面隐藏或暂停时节省资源
   */
  function stopRealtimeUpdates() {
    if (state.playerPollTimer) {
      window.clearTimeout(state.playerPollTimer);
      state.playerPollTimer = 0;
    }
    if (state.progressTickTimer) {
      window.clearInterval(state.progressTickTimer);
      state.progressTickTimer = 0;
    }
  }

  /**
   * 恢复实时更新
   * 用于页面可见或需要实时更新时
   */
  function resumeRealtimeUpdates() {
    if (document.hidden) {
      return;
    }
    startPlayerPolling();
    startProgressTicker();
  }

/* ==================== 认证和授权相关函数 ==================== */

  /**
   * 从URL查询参数中读取访问令牌
   * @returns {string} 访问令牌
   */
  function readAccessTokenFromLocation() {
    var search = String(window.location.search || "");
    var match = search.match(/[?&](?:access_token|token)=([^&]+)/i);
    return match ? decodeURIComponent(match[1]) : "";
  }

  /**
   * 从本地存储中读取访问令牌
   * 支持多种存储格式以确保兼容性
   * @returns {string} 访问令牌
   */
  function readAccessTokenFromStorage() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem("songloft-auth") : "";
      if (!raw) {
        return "";
      }

      if (raw.charAt(0) !== "{") {
        return "";
      }

      var payload = JSON.parse(raw);
      if (payload && typeof payload.accessToken === "string" && payload.accessToken) {
        return payload.accessToken;
      }

      if (
        payload &&
        payload.auth &&
        typeof payload.auth.accessToken === "string" &&
        payload.auth.accessToken
      ) {
        return payload.auth.accessToken;
      }

      if (
        payload &&
        payload.data &&
        typeof payload.data.accessToken === "string" &&
        payload.data.accessToken
      ) {
        return payload.data.accessToken;
      }
    } catch (error) {}

    return "";
  }

  function getAccessToken() {
    var locationToken = readAccessTokenFromLocation();
    if (locationToken) {
      return locationToken;
    }

    var storageToken = readAccessTokenFromStorage();
    if (storageToken) {
      return storageToken;
    }

    if (
      state.bootstrap &&
      state.bootstrap.auth &&
typeof state.bootstrap.auth.accessToken === "string" &&
      state.bootstrap.auth.accessToken
    ) {
      return state.bootstrap.auth.accessToken;
    }

    return "";
  }

  /* ==================== API请求相关函数 ==================== */

  /**
   * 构建API请求URL，自动添加访问令牌
   * @param {string} path - API路径
   * @returns {string} 完整的请求URL
   */
  function buildRequestUrl(path) {
    var baseUrl = getApiBase() + path;
    var token = getAccessToken();
    if (!token) {
      return baseUrl;
    }

    return baseUrl + (baseUrl.indexOf("?") >= 0 ? "&" : "?") + "access_token=" + encodeURIComponent(token);
  }

  /**
   * 带超时控制的fetch请求
   * @param {string} url - 请求URL
   * @param {RequestInit} options - 请求选项
   * @param {number} timeout - 超时时间（毫秒），默认10000ms
   * @returns {Promise<Response>} fetch响应
   */
  async function fetchWithTimeout(url, options, timeout = 10000) {
    var controller = new AbortController();
    var timeoutId = setTimeout(function() {
      controller.abort();
    }, timeout);

    try {
      var response = await fetch(url, Object.assign({}, options, {
        signal: controller.signal
      }));
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('请求超时');
      }
      throw error;
    }
  }

  /**
   * 发起HTTP请求的通用函数
   * 自动处理认证、错误处理、超时控制和响应解析
   * @param {string} path - API路径
   * @param {RequestInit} options - 请求选项
   * @param {number} timeout - 超时时间（毫秒），可选
   * @returns {Promise<any>} 响应数据
   */
  async function request(path, options, timeout) {
    var requestOptions = options ? Object.assign({}, options) : {};
    var headers = Object.assign({}, requestOptions.headers || {});
    var token = getAccessToken();

    // 自动添加Authorization头
    if (token && !headers.Authorization && !headers.authorization) {
      headers.Authorization = "Bearer " + token;
    }

    requestOptions.headers = headers;
    requestOptions.credentials = "same-origin";
    var requestUrl = buildRequestUrl(path);

    // 使用带超时的fetch
    var response = await fetchWithTimeout(requestUrl, requestOptions, timeout);
    var responseText = await response.text();
    var payload = null;

    // 尝试解析JSON响应
    if (responseText) {
      try {
        payload = JSON.parse(responseText);
      } catch (error) {
        payload = null;
      }
    }
    if (!response.ok) {
      throw new Error(payload && payload.message ? String(payload.message) : "HTTP " + response.status);
    }

    return payload || {
      code: 0,
      message: "ok",
      data: null
    };
  }

function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error("无法读取上传文件"));
      };
      reader.onload = function () {
        if (typeof reader.result !== "string") {
          reject(new Error("上传文件读取结果无效"));
          return;
        }
        var commaIndex = reader.result.indexOf(",");
        resolve(commaIndex >= 0 ? reader.result.slice(commaIndex + 1) : reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * 图片懒加载 - 使用IntersectionObserver实现图片懒加载
   * @param {string} selector - 图片选择器，默认为'img[data-src]'
   */
  function setupLazyLoading(selector) {
    if (typeof selector === "undefined") {
      selector = "img[data-src]";
    }

    if (!("IntersectionObserver" in window)) {
      // 浏览器不支持IntersectionObserver，直接加载所有图片
      var images = document.querySelectorAll(selector);
      images.forEach(function(img) {
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute("data-src");
        }
      });
      return;
    }

    var imageObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute("data-src");
            imageObserver.unobserve(img);
          }
        }
      });
    }, {
      rootMargin: "50px 0px",
      threshold: 0.01
    });

    var images = document.querySelectorAll(selector);
    images.forEach(function(img) {
      imageObserver.observe(img);
    });
  }

  function updateText(id, value) {
    var element = getCachedElement(id);
    if (element) {
      element.textContent = value;
    }
  }

function updatePlayerTrackText(title, meta) {
    updateText("trackTitle", title);
    updateText("trackMeta", meta);
    updateText("lyricsTrackTitle", title);
    updateText("lyricsTrackMeta", meta);
  }

function updatePlayerCover(currentSong) {
    var coverImage = document.getElementById("coverImage");
    if (!coverImage) {
      return;
    }

    if (!currentSong) {
      coverImage.style.backgroundImage = "";
      return;
    }

    var songId = currentSong.songId;

    if (!songId) {
      coverImage.style.backgroundImage = "";
      return;
    }

    var accessToken = getAccessToken();

    var coverUrl = "/api/v1/songs/" + String(songId) + "/cover";
    if (accessToken) {
      coverUrl += "?access_token=" + encodeURIComponent(accessToken);
    }

    coverImage.style.backgroundImage = "url('" + escapeHtml(coverUrl) + "')";
  }

function setMiniProgressRatio(ratio) {
    var fill = getCachedElement("miniProgressFill");
    if (!fill) {
      return;
    }
    var safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
    fill.style.width = String(safeRatio * 100) + "%";
  }

  function setBinaryActionNotice(message, type) {
    state.binaryActionNotice = String(message || "");
    state.binaryActionNoticeType = String(type || "");
    renderBinaryActionNotice();
  }

  function setAudioPreferenceNotice(message, type) {
    var element = document.getElementById("audioPreferenceNotice");
    var scenarioElement = document.getElementById("audioScenarioNotice");
    [element, scenarioElement].forEach(function (target) {
      if (!target) {
        return;
      }
      target.textContent = String(message || "");
      target.hidden = !message;
      target.className = "binary-action-notice" + (type ? " " + type : "");
    });
  }

  function renderBinaryActionNotice() {
    var element = document.getElementById("binaryActionNotice");
    if (!element) {
      return;
    }

    element.textContent = state.binaryActionNotice || "";
    element.hidden = !state.binaryActionNotice;
    element.className = "binary-action-notice" + (state.binaryActionNoticeType ? " " + state.binaryActionNoticeType : "");
  }

  function isInstalledBinaryState(payload) {
    return !!(
      payload &&
      payload.mpd &&
      payload.mpc &&
      payload.mpd.source === "plugin-bin" &&
      payload.mpc.source === "plugin-bin" &&
      payload.mpd.executableAvailable &&
      payload.mpc.executableAvailable
    );
  }

  function renderStackList(containerId, items, renderer, emptyText) {
    var element = document.getElementById(containerId);
    if (!element) {
      return;
    }

    if (!items || !items.length) {
      element.innerHTML = '<p class="empty-text">' + emptyText + "</p>";
      return;
    }

    element.innerHTML = items.map(renderer).join("");
  }

  function setSearchDropdownOpen(open) {
    state.searchDropdownOpen = !!open;
    var dropdown = document.getElementById("searchDropdown");
    if (!dropdown) {
      return;
    }
    dropdown.hidden = !state.searchDropdownOpen;
  }

  function closeSearchDropdown() {
    setSearchDropdownOpen(false);
  }

  function openSearchDropdown() {
    setSearchDropdownOpen(true);
  }

  function hasSearchResultsContent() {
    var results = document.getElementById("searchResults");
    return !!(results && String(results.innerHTML || "").trim());
  }

  function clearPlayerSheetHideTimer() {
    if (state.playerSheetHideTimer) {
      window.clearTimeout(state.playerSheetHideTimer);
      state.playerSheetHideTimer = 0;
    }
  }

  function applyPullDownResistance(offset, softLimit, factor) {
    var safeOffset = Math.max(0, Number(offset) || 0);
    var limit = Math.max(24, Number(softLimit) || 0);
    var softFactor = Math.max(0.12, Math.min(0.7, Number(factor) || 0.35));
    if (safeOffset <= limit) {
      return safeOffset;
    }
    return limit + (safeOffset - limit) * softFactor;
  }

  function setPlayerSheetDragOffset(offset) {
    var overlay = document.getElementById("playerSheetOverlay");
    var sheet = document.querySelector(".player-sheet");
    var safeOffset = Math.max(0, Number(offset) || 0);
    state.playerSheetDragOffset = safeOffset;
    var visualOffset = applyPullDownResistance(safeOffset, Math.max(window.innerHeight * 0.22, 120), 0.36);
    if (sheet instanceof HTMLElement) {
      sheet.style.setProperty("--player-sheet-drag-offset", String(visualOffset) + "px");
    }
    if (overlay instanceof HTMLElement) {
      var progress = Math.max(0, Math.min(1, visualOffset / Math.max(window.innerHeight * 0.38, 1)));
      overlay.style.setProperty("--player-sheet-backdrop-opacity", String(1 - progress * 0.75));
    }
  }

  function resetPlayerSheetDragState() {
    var overlay = document.getElementById("playerSheetOverlay");
    state.playerSheetPointerId = null;
    state.playerSheetTouchId = null;
    state.playerSheetDragSource = "";
    state.playerSheetDragReady = false;
    state.playerSheetDragActive = false;
    setPlayerSheetDragOffset(0);
    if (overlay instanceof HTMLElement) {
      overlay.classList.remove("is-dragging");
      overlay.style.removeProperty("--player-sheet-backdrop-opacity");
    }
  }

  function canStartPlayerSheetPullDown(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (target.closest("button, input, select, textarea, label, .player-volume-wrap, .player-queue-drawer")) {
      return false;
    }
    var page = target.closest(".player-sheet-page");
    if (page instanceof HTMLElement && page.scrollTop > 0) {
      return false;
    }
    return true;
  }

  function startPlayerSheetDrag(source, identifier, clientX, clientY) {
    state.playerSheetDragSource = source;
    state.playerSheetPointerId = source === "pointer" ? identifier : null;
    state.playerSheetTouchId = source === "touch" ? identifier : null;
    state.playerSheetDragReady = true;
    state.playerSheetDragActive = false;
    state.playerSheetDragStartX = clientX;
    state.playerSheetDragStartY = clientY;
    state.playerSheetDragOffset = 0;
  }

  function movePlayerSheetDrag(clientX, clientY) {
    if (!state.playerSheetDragReady) {
      return false;
    }
    var deltaX = clientX - state.playerSheetDragStartX;
    var deltaY = clientY - state.playerSheetDragStartY;
    if (!state.playerSheetDragActive) {
      if (deltaY <= 8 || Math.abs(deltaY) <= Math.abs(deltaX)) {
        return false;
      }
      state.playerSheetDragActive = true;
      var overlay = document.getElementById("playerSheetOverlay");
      if (overlay instanceof HTMLElement) {
        overlay.classList.add("is-dragging");
      }
    }
    setPlayerSheetDragOffset(deltaY);
    return true;
  }

  function findTrackedTouch(event) {
    var touches = event && event.changedTouches ? event.changedTouches : [];
    for (var index = 0; index < touches.length; index += 1) {
      if (touches[index].identifier === state.playerSheetTouchId) {
        return touches[index];
      }
    }
    return null;
  }

  function setPlayerSheetOpen(open) {
    state.playerSheetOpen = !!open;
    var overlay = document.getElementById("playerSheetOverlay");
    if (!overlay) {
      return;
    }
    clearPlayerSheetHideTimer();
    if (state.playerSheetOpen) {
      overlay.hidden = false;
      resetPlayerSheetDragState();
      document.body.classList.add("player-sheet-open");
      window.requestAnimationFrame(function () {
        overlay.classList.add("is-open");
        setPlayerSheetPage(state.playerSheetPage || "playback", {
          instant: true
        });
      });
      return;
    }

    overlay.classList.remove("is-open");
    resetPlayerSheetDragState();
    document.body.classList.remove("player-sheet-open");
    state.playerSheetHideTimer = window.setTimeout(function () {
      overlay.hidden = true;
      state.playerSheetHideTimer = 0;
    }, 260);
  }

  function openPlayerSheet() {
    setPlayerSheetOpen(true);
  }

  function closePlayerSheet() {
    closePlayerVolumePopover();
    closePlayerQueueDrawer();
    setPlayerSheetOpen(false);
  }

  function setPlayerVolumePopoverOpen(open) {
    state.playerVolumePopoverOpen = !!open;
    var popover = document.getElementById("playerVolumePopover");
    if (!popover) {
      return;
    }
    popover.hidden = !state.playerVolumePopoverOpen;
  }

  function clearPlayerVolumePopoverTimer() {
    if (state.playerVolumePopoverTimer) {
      window.clearTimeout(state.playerVolumePopoverTimer);
      state.playerVolumePopoverTimer = 0;
    }
  }

  function schedulePlayerVolumePopoverAutoClose() {
    clearPlayerVolumePopoverTimer();
    if (!state.playerVolumePopoverOpen) {
      return;
    }
    state.playerVolumePopoverTimer = window.setTimeout(function () {
      closePlayerVolumePopover();
    }, 3000);
  }

  function openPlayerVolumePopover() {
    closePlayerQueueDrawer();
    setPlayerVolumePopoverOpen(true);
    schedulePlayerVolumePopoverAutoClose();
  }

  function closePlayerVolumePopover() {
    clearPlayerVolumePopoverTimer();
    setPlayerVolumePopoverOpen(false);
  }

  function togglePlayerVolumePopover() {
    if (state.playerVolumePopoverOpen) {
      closePlayerVolumePopover();
      return;
    }
    openPlayerVolumePopover();
  }

  function pausePlayerVolumePopoverAutoClose() {
    clearPlayerVolumePopoverTimer();
  }

  function resumePlayerVolumePopoverAutoClose() {
    if (!state.playerVolumePopoverOpen) {
      return;
    }
    schedulePlayerVolumePopoverAutoClose();
  }

  function setPlayerQueueDrawerOpen(open) {
    state.playerQueueDrawerOpen = !!open;
    var overlay = document.getElementById("playerQueueDrawerOverlay");
    if (!overlay) {
      return;
    }
    overlay.hidden = !state.playerQueueDrawerOpen;
    overlay.classList.toggle("is-open", state.playerQueueDrawerOpen);
    if (!state.playerQueueDrawerOpen) {
      resetPlayerQueueDrawerDragState();
    }
  }

  function openPlayerQueueDrawer() {
    closePlayerVolumePopover();
    setPlayerQueueDrawerOpen(true);
    if (!state.queueState) {
      restoreCachedQueueState();
    }
    void maybeRefreshQueueState(false);
  }

  function closePlayerQueueDrawer() {
    setPlayerQueueDrawerOpen(false);
  }

  function togglePlayerQueueDrawer() {
    if (state.playerQueueDrawerOpen) {
      closePlayerQueueDrawer();
      return;
    }
    openPlayerQueueDrawer();
  }

  function setPlayerQueueDrawerDragOffset(offset) {
    var overlay = document.getElementById("playerQueueDrawerOverlay");
    var safeOffset = Math.max(0, Number(offset) || 0);
    state.playerQueueDrawerDragOffset = safeOffset;
    var visualOffset = applyPullDownResistance(safeOffset, Math.max(window.innerHeight * 0.14, 84), 0.4);
    if (overlay instanceof HTMLElement) {
      overlay.style.setProperty("--player-queue-drag-offset", String(visualOffset) + "px");
    }
  }

  function resetPlayerQueueDrawerDragState() {
    var overlay = document.getElementById("playerQueueDrawerOverlay");
    state.playerQueueDrawerPointerId = null;
    state.playerQueueDrawerTouchId = null;
    state.playerQueueDrawerDragReady = false;
    state.playerQueueDrawerDragActive = false;
    setPlayerQueueDrawerDragOffset(0);
    if (overlay instanceof HTMLElement) {
      overlay.style.removeProperty("--player-queue-drag-offset");
    }
  }

  function canStartPlayerQueueDrawerPullDown(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (target.closest("button, input, select, textarea, label")) {
      return false;
    }
    var list = target.closest(".queue-drawer-list");
    if (list instanceof HTMLElement && list.scrollTop > 0) {
      return false;
    }
    return !!target.closest(".player-queue-drawer");
  }

  function startPlayerQueueDrawerDrag(source, identifier, clientX, clientY) {
    state.playerQueueDrawerPointerId = source === "pointer" ? identifier : null;
    state.playerQueueDrawerTouchId = source === "touch" ? identifier : null;
    state.playerQueueDrawerDragReady = true;
    state.playerQueueDrawerDragActive = false;
    state.playerQueueDrawerDragStartX = clientX;
    state.playerQueueDrawerDragStartY = clientY;
    state.playerQueueDrawerDragOffset = 0;
  }

  function movePlayerQueueDrawerDrag(clientX, clientY) {
    if (!state.playerQueueDrawerDragReady) {
      return false;
    }
    var deltaX = clientX - state.playerQueueDrawerDragStartX;
    var deltaY = clientY - state.playerQueueDrawerDragStartY;
    if (!state.playerQueueDrawerDragActive) {
      if (deltaY <= 8 || Math.abs(deltaY) <= Math.abs(deltaX)) {
        return false;
      }
      state.playerQueueDrawerDragActive = true;
    }
    setPlayerQueueDrawerDragOffset(deltaY);
    return true;
  }

  function findTrackedQueueDrawerTouch(event) {
    var touches = event && event.changedTouches ? event.changedTouches : [];
    for (var index = 0; index < touches.length; index += 1) {
      if (touches[index].identifier === state.playerQueueDrawerTouchId) {
        return touches[index];
      }
    }
    return null;
  }

  function finishPlayerQueueDrawerDrag(target) {
    if (target instanceof HTMLElement && state.playerQueueDrawerPointerId !== null && target.hasPointerCapture(state.playerQueueDrawerPointerId)) {
      target.releasePointerCapture(state.playerQueueDrawerPointerId);
    }
    var shouldClose = state.playerQueueDrawerDragOffset > Math.max(96, window.innerHeight * 0.13);
    resetPlayerQueueDrawerDragState();
    if (shouldClose) {
      closePlayerQueueDrawer();
    }
  }

  function getPlayerSheetTargetId(pageId) {
    return pageId === "lyrics" ? "playerSheetLyricsPage" : "playerSheetPlaybackPage";
  }

  function syncPlayerSheetTabs() {
    var buttons = document.querySelectorAll("[data-player-page]");
    Array.prototype.forEach.call(buttons, function (button) {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      var isActive = button.getAttribute("data-player-page") === state.playerSheetPage;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  function setPlayerSheetPage(pageId, options) {
    state.playerSheetPage = pageId === "lyrics" ? "lyrics" : "playback";
    syncPlayerSheetTabs();

    if (options && options.skipScroll) {
      return;
    }

    var pages = document.getElementById("playerSheetPages");
    var target = document.getElementById(getPlayerSheetTargetId(state.playerSheetPage));
    if (!pages || !target) {
      return;
    }

    pages.scrollTo({
      left: target.offsetLeft,
      behavior: options && options.instant ? "auto" : "smooth"
    });
  }

  function syncPlayerSheetPageFromScroll() {
    var pages = document.getElementById("playerSheetPages");
    if (!pages) {
      return;
    }
    var nextPage = pages.scrollLeft >= pages.clientWidth / 2 ? "lyrics" : "playback";
    if (nextPage !== state.playerSheetPage) {
      state.playerSheetPage = nextPage;
      syncPlayerSheetTabs();
    }
  }

  function finishPlayerSheetDrag(target) {
    var overlay = document.getElementById("playerSheetOverlay");
    if (!(overlay instanceof HTMLElement)) {
      return;
    }
    var shouldClose = state.playerSheetDragOffset > Math.max(120, window.innerHeight * 0.18);
    if (target instanceof HTMLElement && state.playerSheetPointerId !== null && target.hasPointerCapture(state.playerSheetPointerId)) {
      target.releasePointerCapture(state.playerSheetPointerId);
    }
    if (shouldClose) {
      resetPlayerSheetDragState();
      closePlayerSheet();
      return;
    }
    overlay.classList.remove("is-dragging");
    state.playerSheetDragActive = false;
    state.playerSheetDragReady = false;
    state.playerSheetPointerId = null;
    setPlayerSheetDragOffset(0);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderBootstrap(payload) {
    state.bootstrap = payload;

    updateText("serviceStatus", "服务状态: " + payload.mpd.serviceStatus);
    updatePlayerTrackText(
      payload.ui.libraryEnabled ? "Songloft 数据层已接通" : "当前宿主暂无媒体库数据",
      "当前页面: " + payload.ui.currentPage + " | Host: " + window.location.origin
    );
    updateText("miniTrackTitle", "当前状态: " + payload.mpd.playbackStatus);
    updateText(
      "miniTrackMeta",
      "轮询配置 " +
        formatPollingIntervalLabel(PLAYER_POLL_INTERVAL_PLAYING_MS) +
        " / " +
        formatPollingIntervalLabel(PLAYER_POLL_INTERVAL_PAUSED_MS) +
        " / " +
        formatPollingIntervalLabel(PLAYER_POLL_INTERVAL_IDLE_MS)
    );
    syncPollingIndicators();
  }

  function actionLabelFromState(payload) {
    return payload && payload.playbackStatus === "playing" ? "暂停" : "播放";
  }

  function actionIconNameFromState(payload) {
    return payload && payload.playbackStatus === "playing" ? "pause" : "play";
  }

  function playerButtonIconSvg(name) {
    switch (name) {
      case "home":
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5L12 4l8 6.5"></path><path d="M6.5 9.5V20h11V9.5"></path></svg>';
      case "library":
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5.5h10.5a2 2 0 012 2V19H8a2 2 0 00-2 2z"></path><path d="M6 5.5a2 2 0 00-2 2V19a2 2 0 012-2h12.5"></path></svg>';
      case "play":
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"></path></svg>';
      case "pause":
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"></path></svg>';
      case "prev":
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6h2v12H7zM18 6v12l-8-6z"></path></svg>';
      case "next":
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6h2v12h-2zM6 6l8 6-8 6z"></path></svg>';
      case "queue":
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10v2H4zM4 11h10v2H4zM4 15h7v2H4zM16.5 10l3.5 2.5-3.5 2.5z"></path></svg>';
      case "volume-muted":
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h4l5-4v14l-5-4H5zM17.4 9.4l-1.4 1.4 1.2 1.2-1.2 1.2 1.4 1.4 1.2-1.2 1.2 1.2 1.4-1.4-1.2-1.2 1.2-1.2-1.4-1.4-1.2 1.2z"></path></svg>';
      case "volume-low":
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h4l5-4v14l-5-4H5zM17 9.5a3.5 3.5 0 010 5"></path></svg>';
      case "volume-high":
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h4l5-4v14l-5-4H5zM16.5 8a5.5 5.5 0 010 8M18.5 5.5a8.5 8.5 0 010 13"></path></svg>';
      case "shuffle":
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l4 5-4 5H4M13 7h2.5L20 11.5M20 11.5V8.5M13 17h2.5L20 12.5M20 12.5v3"></path></svg>';
      case "settings":
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z"></path><path d="M19.4 15a1 1 0 00.2 1.1l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1 1 0 00-1.1-.2 1 1 0 00-.6.9V21a2 2 0 01-4 0v-.2a1 1 0 00-.7-.9 1 1 0 00-1 .2l-.2.1a2 2 0 01-2.8-2.8l.1-.1a1 1 0 00.2-1.1 1 1 0 00-.9-.6H3a2 2 0 010-4h.2a1 1 0 00.9-.7 1 1 0 00-.2-1l-.1-.2a2 2 0 012.8-2.8l.1.1a1 1 0 001.1.2 1 1 0 00.6-.9V3a2 2 0 014 0v.2a1 1 0 00.7.9 1 1 0 001-.2l.2-.1a2 2 0 012.8 2.8l-.1.1a1 1 0 00-.2 1.1 1 1 0 00.9.6H21a2 2 0 010 4h-.2a1 1 0 00-.9.7"></path></svg>';
      case "mode":
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v2H4zM4 11h16v2H4zM4 16h16v2H4z"></path></svg>';
      case "sequence":
      default:
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14v2H5zM5 11h10v2H5zM5 15h8v2H5zM17 15l2 2 2-2"></path></svg>';
    }
  }

  function volumeIconNameFromValue(value) {
    if (value === null) {
      return "volume-high";
    }
    if (value <= 0) {
      return "volume-muted";
    }
    if (value < 50) {
      return "volume-low";
    }
    return "volume-high";
  }

  function setButtonSvgIcon(id, iconName) {
    var element = document.getElementById(id);
    if (!(element instanceof HTMLElement)) {
      return;
    }
    element.innerHTML = '<span class="player-button-icon">' + playerButtonIconSvg(iconName) + '</span>';
  }

  function setMiniButtonSvgIcon(id, iconName) {
    var element = document.getElementById(id);
    if (!(element instanceof HTMLElement)) {
      return;
    }
    element.innerHTML = '<span class="mini-button-icon">' + playerButtonIconSvg(iconName) + '</span>';
  }

  function setTabSvgIcon(tabId, iconName) {
    var element = document.querySelector('.tab-item[data-tab="' + tabId + '"] .tab-icon');
    if (!(element instanceof HTMLElement)) {
      return;
    }
    element.innerHTML = '<span class="tab-icon-svg">' + playerButtonIconSvg(iconName) + '</span>';
  }

  function syncNavigationIcons() {
    setTabSvgIcon("home", "home");
    setTabSvgIcon("library", "library");
    setTabSvgIcon("queue", "queue");
    setTabSvgIcon("settings", "settings");
  }

  function syncMiniPlayerIcons(payload) {
    setMiniButtonSvgIcon("miniPrevButton", "prev");
    setMiniButtonSvgIcon("miniPlayButton", actionIconNameFromState(payload));
    setMiniButtonSvgIcon("miniNextButton", "next");
  }

  function syncPlayerControlIcons(payload) {
    var volumeValue = payload && typeof payload.volume === "number"
      ? Math.max(0, Math.min(100, payload.volume))
      : null;
    setButtonSvgIcon("playerModeButton", "mode");
    setButtonSvgIcon("heroPrevButton", "prev");
    setButtonSvgIcon("heroPlayButton", payload && payload.playbackStatus === "playing" ? "pause" : "play");
    setButtonSvgIcon("heroNextButton", "next");
    setButtonSvgIcon("playerVolumeToggleButton", volumeIconNameFromValue(volumeValue));
    updatePlayerModeOptions(payload);
  }

  function updatePlayerModeOptions(payload) {
    var mode = payload && payload.mode;
    var currentMode = "sequence";
    if (mode) {
      if (mode.random) {
        currentMode = "random";
      } else if (mode.single) {
        currentMode = "single";
      } else if (mode.repeat) {
        currentMode = "repeat";
      }
    }
    var popover = document.getElementById("playerModePopover");
    if (!popover) return;
    popover.querySelectorAll(".player-mode-option").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-mode") === currentMode);
    });
  }

  function setPlayerModePopoverOpen(open) {
    state.playerModePopoverOpen = !!open;
    var popover = document.getElementById("playerModePopover");
    if (!popover) return;
    popover.hidden = !state.playerModePopoverOpen;
  }

  function openPlayerModePopover() {
    closePlayerVolumePopover();
    closePlayerQueueDrawer();
    setPlayerModePopoverOpen(true);
  }

  function closePlayerModePopover() {
    setPlayerModePopoverOpen(false);
  }

  function togglePlayerModePopover() {
    if (state.playerModePopoverOpen) {
      closePlayerModePopover();
      return;
    }
    openPlayerModePopover();
  }

  function applyPlayerMode(mode) {
    var actions = {
      sequence: { random: "off", single: "off", repeat: "off" },
      repeat: { random: "off", single: "off", repeat: "on" },
      single: { random: "off", single: "on", repeat: "on" },
      random: { random: "on", single: "off", repeat: "off" }
    };
    var action = actions[mode];
    if (!action) return;
    void sendPlayerAction("random", action.random);
    void sendPlayerAction("single", action.single);
    void sendPlayerAction("repeat", action.repeat);
  }

  function formatTime(totalSeconds) {
    var safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    var minutes = Math.floor(safe / 60);
    var seconds = safe % 60;
    return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  }

function setElementValue(id, value) {
    var element = getCachedElement(id);
    if (element) {
      element.value = String(value);
    }
  }

  function getElementValue(id) {
    var element = getCachedElement(id);
    if (!element) {
      return "";
    }
    return typeof element.value === "string" ? element.value : "";
  }

  function getBrowserStorage() {
    try {
      if (window.localStorage) {
        return window.localStorage;
      }
    } catch (error) {}
    return null;
  }

  function readPersistentBoolean(key) {
    var storage = getBrowserStorage();
    if (!storage) {
      return false;
    }
    var value = String(storage.getItem(key) || "").trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes" || value === "on";
  }

  function writePersistentBoolean(key, value) {
    var storage = getBrowserStorage();
    if (!storage) {
      return;
    }
    if (value) {
      storage.setItem(key, "true");
    } else {
      storage.removeItem(key);
    }
  }

  function readPersistentJson(key) {
    var storage = getBrowserStorage();
    if (!storage) {
      return null;
    }
    try {
      var raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writePersistentJson(key, value) {
    var storage = getBrowserStorage();
    if (!storage) {
      return;
    }
    if (value === null || typeof value === "undefined") {
      storage.removeItem(key);
      return;
    }
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch (error) {}
  }

  function normalizeLookupText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isFreshTimestamp(timestamp, ttlMs) {
    var value = Number(timestamp) || 0;
    return value > 0 && Date.now() - value < (Number(ttlMs) || 0);
  }

  function isLibraryCollectionFresh(section) {
    if (section === "home") {
      return !!state.libraryHome && isFreshTimestamp(state.libraryHomeFetchedAt, LIBRARY_CACHE_TTL_MS);
    }
    if (section === "songs") {
      return !!state.librarySongs && isFreshTimestamp(state.librarySongsFetchedAt, LIBRARY_CACHE_TTL_MS);
    }
    if (section === "artists") {
      return !!state.libraryArtists && isFreshTimestamp(state.libraryArtistsFetchedAt, LIBRARY_CACHE_TTL_MS);
    }
    if (section === "albums") {
      return !!state.libraryAlbums && isFreshTimestamp(state.libraryAlbumsFetchedAt, LIBRARY_CACHE_TTL_MS);
    }
    return false;
  }

  function isPlaylistDetailFresh(playlistId) {
    var id = String(playlistId || "");
    return !!(
      state.explorerPlaylistDetail &&
      String(state.explorerPlaylistDetail.id || "") === id &&
      isFreshTimestamp(state.playlistDetailFetchedAtById[id], LIBRARY_CACHE_TTL_MS)
    );
  }

  function isArtistDetailFresh(artistName) {
    var name = String(artistName || "");
    return !!state.artistDetailsByName[name] && isFreshTimestamp(state.artistDetailFetchedAtByName[name], LIBRARY_CACHE_TTL_MS);
  }

  function isAlbumDetailFresh(cacheKey) {
    return !!state.albumDetailsByKey[cacheKey] && isFreshTimestamp(state.albumDetailFetchedAtByKey[cacheKey], LIBRARY_CACHE_TTL_MS);
  }

function getPlayerPollIntervalMs() {
    var playbackStatus = state.playerState && state.playerState.playbackStatus
      ? String(state.playerState.playbackStatus)
      : "";
    
    // 批量处理时使用更长的轮询间隔
    if (state.isBatchProcessing) {
      return PLAYER_POLL_INTERVAL_BATCH_MS;
    }
    
    if (playbackStatus === "playing") {
      return PLAYER_POLL_INTERVAL_PLAYING_MS;
    }
    if (playbackStatus === "paused") {
      return PLAYER_POLL_INTERVAL_PAUSED_MS;
    }
    return PLAYER_POLL_INTERVAL_IDLE_MS;
  }

  function normalizeQueueItem(item, index) {
    var position = Number(item && item.position);
    var normalizedPosition = Number.isFinite(position) && position > 0 ? Math.floor(position) : index + 1;
    return {
      queueId: String(item && item.queueId ? item.queueId : "queue-" + String(normalizedPosition)),
      position: normalizedPosition,
      title: String(item && item.title ? item.title : "未知标题"),
      artist: String(item && item.artist ? item.artist : "未知歌手"),
      album: String(item && item.album ? item.album : "未知专辑"),
      durationLabel: String(item && item.durationLabel ? item.durationLabel : "--:--"),
      isCurrent: !!(item && item.isCurrent)
    };
  }

  function normalizeQueueState(payload) {
    var items = Array.isArray(payload && payload.items)
      ? payload.items.map(function (item, index) {
          return normalizeQueueItem(item, index);
        })
      : [];
    return {
      total: Number(payload && payload.total) || items.length,
      items: items
    };
  }

  function readCachedQueueState() {
    var payload = readPersistentJson(QUEUE_STATE_STORAGE_KEY);
    if (!payload) {
      return null;
    }
    if (Number(payload.version) !== QUEUE_STATE_CACHE_VERSION) {
      return null;
    }
    var normalized = normalizeQueueState(payload);
    normalized.cachedAt = Number(payload.cachedAt) || 0;
    return normalized;
  }

  function writeCachedQueueState(payload) {
    var normalized = normalizeQueueState(payload);
    writePersistentJson(QUEUE_STATE_STORAGE_KEY, {
      cachedAt: Date.now(),
      version: QUEUE_STATE_CACHE_VERSION,
      total: normalized.total,
      items: normalized.items
    });
  }

  function normalizeAudioPreferences(payload) {
    var source = payload || {};
    return {
      outputType: String(source.outputType || "auto"),
      xdgRuntimeDir: String(source.xdgRuntimeDir || ""),
      pulseServer: String(source.pulseServer || ""),
      pipewireRemote: String(source.pipewireRemote || ""),
      alsaDevice: String(source.alsaDevice || "")
    };
  }

  function normalizeAudioGuidance(payload) {
    var source = payload || {};
    return {
      summary: String(source.summary || ""),
      hints: Array.isArray(source.hints) ? source.hints.map(function (item) { return String(item || ""); }).filter(Boolean) : [],
      recommendedOutputType: String(source.recommendedOutputType || "auto"),
      recommendedOutputLabel: String(source.recommendedOutputLabel || "自动选择（推荐）"),
      recommendedAlsaDevice: String(source.recommendedAlsaDevice || ""),
      recommendedAlsaLabel: String(source.recommendedAlsaLabel || ""),
      alsaDeviceOptions: Array.isArray(source.alsaDeviceOptions) ? source.alsaDeviceOptions.map(function (item) {
        return {
          value: String(item && item.value || ""),
          label: String(item && item.label || ""),
          description: String(item && item.description || ""),
          transport: String(item && item.transport || "other"),
          recommended: !!(item && item.recommended)
        };
      }) : []
    };
  }

  function getAudioDeviceMatchKey(value) {
    var normalized = String(value || "").trim().toLowerCase();
    var match = normalized.match(/^(?:plug)?hw:(\d+),(\d+)$/i);
    return match ? match[1] + "," + match[2] : normalized;
  }

  function findMatchingAudioDeviceOptionValue(deviceValue, options) {
    var normalizedKey = getAudioDeviceMatchKey(deviceValue);
    if (!normalizedKey) {
      return "";
    }
    for (var index = 0; index < (options || []).length; index += 1) {
      var option = options[index];
      if (getAudioDeviceMatchKey(option.value) === normalizedKey) {
        return option.value;
      }
    }
    return "";
  }

  function getSelectedAudioDeviceValue() {
    var selectValue = getElementValue("audioAlsaDeviceSelect");
    if (!selectValue) {
      return "";
    }
    if (selectValue === "__custom__") {
      return getElementValue("audioAlsaDeviceInput");
    }
    return selectValue;
  }

  function serializeAudioPreferences(payload) {
    var normalized = normalizeAudioPreferences(payload);
    return JSON.stringify({
      outputType: normalized.outputType,
      xdgRuntimeDir: normalized.xdgRuntimeDir,
      pulseServer: normalized.pulseServer,
      pipewireRemote: normalized.pipewireRemote,
      alsaDevice: normalized.alsaDevice
    });
  }

  function readAudioPreferenceFormValues() {
    return normalizeAudioPreferences({
      outputType: getElementValue("audioOutputTypeSelect") || "auto",
      xdgRuntimeDir: getElementValue("audioXdgRuntimeDirInput"),
      pulseServer: getElementValue("audioPulseServerInput"),
      pipewireRemote: getElementValue("audioPipewireRemoteInput"),
      alsaDevice: getSelectedAudioDeviceValue()
    });
  }

  function updateAudioPreferenceDirtyState() {
    state.audioPreferencesDirty =
      serializeAudioPreferences(readAudioPreferenceFormValues()) !== serializeAudioPreferences(state.audioPreferences || null);
    if (state.audioPreferencesDirty) {
      setAudioPreferenceNotice("音频设置已变更，需要点击“保存并重启 MPD”后才会生效。", "");
    } else {
      setAudioPreferenceNotice("", "");
    }
  }

  function updateAudioPreferenceEditingState() {
    var panel = document.getElementById("audioPreferencePanel");
    state.audioPreferencesEditing = !!(panel && document.activeElement && panel.contains(document.activeElement));
  }

  function syncAudioManualDeviceVisibility() {
    var manualSection = document.getElementById("audioManualDeviceSection");
    if (!manualSection) {
      return;
    }
    manualSection.hidden = getElementValue("audioAlsaDeviceSelect") !== "__custom__";
  }

  function hasAudioAdvancedOverrides(preferences) {
    var normalized = normalizeAudioPreferences(preferences);
    return !!(normalized.xdgRuntimeDir || normalized.pulseServer || normalized.pipewireRemote);
  }

  function shouldShowAudioAdvancedSection(preferences) {
    return !!state.audioAdvancedVisible;
  }

  function syncAudioAdvancedPreference() {
    if (state.audioAdvancedPreferenceInitialized) {
      return;
    }
    var saved = window.localStorage ? window.localStorage.getItem(AUDIO_ADVANCED_EXPANDED_STORAGE_KEY) : null;
    if (saved === "true" || saved === "false") {
      state.audioAdvancedVisible = saved === "true";
      state.audioAdvancedPreferenceInitialized = true;
      return;
    }
    var preferences = normalizeAudioPreferences(state.audioPreferences || null);
    state.audioAdvancedVisible =
      preferences.outputType === "pulse" ||
      preferences.outputType === "pipewire" ||
      hasAudioAdvancedOverrides(preferences);
    state.audioAdvancedPreferenceInitialized = true;
  }

  function writeAudioAdvancedPreference(open) {
    state.audioAdvancedVisible = !!open;
    state.audioAdvancedPreferenceInitialized = true;
    try {
      if (window.localStorage) {
        window.localStorage.setItem(AUDIO_ADVANCED_EXPANDED_STORAGE_KEY, open ? "true" : "false");
      }
    } catch (error) {}
  }

  function setAudioAdvancedVisibility(open) {
    writeAudioAdvancedPreference(open);
    syncAudioAdvancedVisibility();
  }

  function inferAudioScenario(preferences, guidancePayload) {
    var normalized = normalizeAudioPreferences(preferences);
    var outputType = normalized.outputType || "auto";
    if (outputType === "pulse" || outputType === "pipewire") {
      return "bluetooth";
    }
    if (outputType === "alsa") {
      return "wired";
    }
    return "";
  }

  function getAudioScenarioSummary(scenario, guidancePayload) {
    var guidance = normalizeAudioGuidance(guidancePayload);
    if (scenario === "bluetooth") {
      return "适合蓝牙音箱或桌面音频。插件会优先使用 PulseAudio / PipeWire，并在下方生成可复制的 Docker 部署模板。";
    }
    if (scenario === "wired") {
      return guidance.recommendedAlsaLabel
        ? "适合有线耳机、内置喇叭和 HDMI。可直接使用 ALSA 设备下拉，不要求你手填底层参数。"
        : "适合有线耳机、内置喇叭和 HDMI。优先使用 ALSA 直连。";
    }
    return "当前保持默认设置；如果你明确知道自己接的是有线或蓝牙，可以直接切到对应场景。";
  }

  function updateAudioScenarioButtons(activeScenario) {
    [
      ["audioScenarioWiredButton", "wired"],
      ["audioScenarioBluetoothButton", "bluetooth"]
    ].forEach(function (entry) {
      var element = document.getElementById(entry[0]);
      if (!element) {
        return;
      }
      if (entry[1] === activeScenario) {
        element.classList.add("active");
      } else {
        element.classList.remove("active");
      }
    });
  }

  function getDefaultTemplatePort() {
    var port = String(window.location.port || "").trim();
    return port || "58091";
  }

  function getDefaultTemplateImage() {
    return "songloft/songloft:latest";
  }

  function syncAudioGuideReminderPreference() {
    state.audioGuideReminderSuppressed = readPersistentBoolean(AUDIO_GUIDE_SUPPRESS_REMINDER_STORAGE_KEY);
    var checkbox = document.getElementById("audioGuideSuppressReminderCheckbox");
    if (checkbox) {
      checkbox.checked = state.audioGuideReminderSuppressed;
    }
  }

  function setAudioGuideReminderSuppressed(suppressed) {
    state.audioGuideReminderSuppressed = !!suppressed;
    writePersistentBoolean(AUDIO_GUIDE_SUPPRESS_REMINDER_STORAGE_KEY, state.audioGuideReminderSuppressed);
  }

  function setAudioGuideModalOpen(open) {
    var modal = document.getElementById("audioGuideModal");
    if (!modal) {
      return;
    }
    var shouldOpen = !!open;
    modal.hidden = !shouldOpen;
    modal.style.display = shouldOpen ? "flex" : "none";
    modal.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
    if (shouldOpen) {
      modal.classList.add("is-open");
    } else {
      modal.classList.remove("is-open");
    }
  }

  function initializeBluetoothTemplateDefaults() {
    if (state.audioTemplateDefaultsInitialized) {
      return;
    }
    if (!getElementValue("audioTemplateHostUserInput")) {
      setElementValue("audioTemplateHostUserInput", "admin");
    }
    if (!getElementValue("audioTemplateMusicDirInput")) {
      setElementValue("audioTemplateMusicDirInput", "/path/to/music");
    }
    if (!getElementValue("audioTemplateDataDirInput")) {
      setElementValue("audioTemplateDataDirInput", "/path/to/data");
    }
    if (!getElementValue("audioTemplatePasswordInput")) {
      setElementValue("audioTemplatePasswordInput", "your_strong_password");
    }
    state.audioTemplateDefaultsInitialized = true;
  }

  function buildBluetoothDockerRunTemplate() {
    initializeBluetoothTemplateDefaults();
    var hostUser = getElementValue("audioTemplateHostUserInput");
    var musicDir = getElementValue("audioTemplateMusicDirInput");
    var dataDir = getElementValue("audioTemplateDataDirInput");
    var port = getDefaultTemplatePort();
    var password = getElementValue("audioTemplatePasswordInput");
    var image = getDefaultTemplateImage();
    return [
      "docker run -d \\",
      "  --name songloft \\",
      "  -p " + port + ":58091 \\",
      "  -v " + musicDir + ":/app/music \\",
      "  -v " + dataDir + ":/app/data \\",
      "  --device /dev/snd:/dev/snd \\",
      "  --group-add 29 \\",
      "  -e ADMIN_USERNAME=admin \\",
      "  -e ADMIN_PASSWORD='" + password.replace(/'/g, "'\"'\"'") + "' \\",
      "  -e XDG_RUNTIME_DIR=/run/user/1000 \\",
      "  -e PULSE_SERVER=unix:/run/user/1000/pulse/native \\",
      "  -e PULSE_COOKIE=/root/.config/pulse/cookie \\",
      "  -v /run/user/1000/pulse:/run/user/1000/pulse \\",
      "  -v /home/" + hostUser + "/.config/pulse/cookie:/root/.config/pulse/cookie:ro \\",
      "  " + image
    ].join("\n");
  }

  function buildBluetoothDockerComposeTemplate() {
    initializeBluetoothTemplateDefaults();
    var hostUser = getElementValue("audioTemplateHostUserInput");
    var musicDir = getElementValue("audioTemplateMusicDirInput");
    var dataDir = getElementValue("audioTemplateDataDirInput");
    var port = getDefaultTemplatePort();
    var password = getElementValue("audioTemplatePasswordInput");
    var image = getDefaultTemplateImage();
    return [
      "services:",
      "  songloft:",
      "    image: " + image,
      "    container_name: songloft",
      "    restart: unless-stopped",
      "    ports:",
      "      - \"" + port + ":58091\"",
      "    environment:",
      "      ADMIN_USERNAME: admin",
      "      ADMIN_PASSWORD: \"" + password.replace(/"/g, '\\"') + "\"",
      "      XDG_RUNTIME_DIR: /run/user/1000",
      "      PULSE_SERVER: unix:/run/user/1000/pulse/native",
      "      PULSE_COOKIE: /root/.config/pulse/cookie",
      "    devices:",
      "      - /dev/snd:/dev/snd",
      "    group_add:",
      "      - \"29\"",
      "    volumes:",
      "      - " + musicDir + ":/app/music",
      "      - " + dataDir + ":/app/data",
      "      - /run/user/1000/pulse:/run/user/1000/pulse",
      "      - /home/" + hostUser + "/.config/pulse/cookie:/root/.config/pulse/cookie:ro"
    ].join("\n");
  }

  function updateBluetoothTemplateOutputs() {
    initializeBluetoothTemplateDefaults();
    setElementValue("audioDockerRunTemplateOutput", buildBluetoothDockerRunTemplate());
    setElementValue("audioDockerComposeTemplateOutput", buildBluetoothDockerComposeTemplate());
  }

  function openAudioGuideModal() {
    initializeBluetoothTemplateDefaults();
    syncAudioGuideReminderPreference();
    if (!getElementValue("audioDockerRunTemplateOutput") || !getElementValue("audioDockerComposeTemplateOutput")) {
      updateBluetoothTemplateOutputs();
    }
    setAudioGuideModalOpen(true);
  }

  function closeAudioGuideModal() {
    setAudioGuideModalOpen(false);
    switchView("settings", {
      preserveScroll: true
    });
  }

  async function copyTextContent(text, successMessage) {
    var value = String(text || "");
    if (!value) {
      setAudioPreferenceNotice("当前没有可复制的内容。", "error");
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        var helper = document.createElement("textarea");
        helper.value = value;
        helper.setAttribute("readonly", "readonly");
        helper.style.position = "fixed";
        helper.style.left = "-9999px";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        document.body.removeChild(helper);
      }
      setAudioPreferenceNotice(successMessage || "已复制。", "success");
    } catch (error) {
      setAudioPreferenceNotice("复制失败，请手动复制文本框中的内容。", "error");
    }
  }

  function applyAudioScenarioPreset(scenario) {
    if (scenario === "wired") {
      setElementValue("audioOutputTypeSelect", "alsa");
      if (!getElementValue("audioAlsaDeviceSelect")) {
        setElementValue("audioAlsaDeviceSelect", "");
      }
    } else if (scenario === "bluetooth") {
      setElementValue("audioOutputTypeSelect", "pulse");
      if (!getElementValue("audioXdgRuntimeDirInput")) {
        setElementValue("audioXdgRuntimeDirInput", "/run/user/1000");
      }
      if (!getElementValue("audioPulseServerInput")) {
        setElementValue("audioPulseServerInput", "unix:/run/user/1000/pulse/native");
      }
      setAudioAdvancedVisibility(true);
    } else {
      setElementValue("audioOutputTypeSelect", "auto");
    }
    syncAudioAdvancedVisibility();
    renderAudioScenarioCard(readAudioPreferenceFormValues(), state.audioGuidance || null);
    updateAudioPreferenceDirtyState();
  }

  function renderAudioScenarioCard(preferences, guidancePayload) {
    var scenario = inferAudioScenario(preferences, guidancePayload);
    var card = document.querySelector(".audio-scene-card");
    var title = scenario === "bluetooth"
      ? "蓝牙音箱"
      : scenario === "wired"
        ? "有线 / HDMI"
        : "默认设置";
    if (card) {
      card.classList.remove("is-auto", "is-wired", "is-bluetooth");
      if (scenario) {
        card.classList.add("is-" + scenario);
      } else {
        card.classList.add("is-auto");
      }
    }
    updateText("audioScenarioTitle", title);
    updateText("audioScenarioSummary", getAudioScenarioSummary(scenario, guidancePayload));
    updateAudioScenarioButtons(scenario);
  }

  function syncAudioAdvancedVisibility(preferences) {
    var card = document.getElementById("audioAdvancedCard");
    var visible = shouldShowAudioAdvancedSection(preferences || readAudioPreferenceFormValues());
    if (card && card.open !== visible) {
      card.open = visible;
    }
  }

  function renderAudioGuidance(payload, preferences) {
    var guidance = normalizeAudioGuidance(payload);
    updateText(
      "audioAlsaDeviceSummary",
      guidance.recommendedAlsaLabel
      ? "当前检测到的默认 ALSA 设备: " + guidance.recommendedAlsaLabel + (guidance.recommendedAlsaDevice ? "（" + guidance.recommendedAlsaDevice + "）" : "")
      : "如果你不确定怎么填，可以先保持留空。"
    );
    renderStackList(
      "audioGuidanceHints",
      guidance.hints || [],
      function (item) {
        return '<article class="list-row compact"><div class="list-row-main"><span>' + escapeHtml(item) + "</span></div></article>";
      },
      "当前暂无额外音频建议"
    );
    renderAudioScenarioCard(preferences, guidance);
  }

  function renderAudioDeviceOptions(guidancePayload, preferences) {
    var guidance = normalizeAudioGuidance(guidancePayload);
    var selectElement = document.getElementById("audioAlsaDeviceSelect");
    if (!selectElement) {
      return;
    }

    var currentPreference = String(preferences && preferences.alsaDevice || "");
    var matchedOptionValue = findMatchingAudioDeviceOptionValue(currentPreference, guidance.alsaDeviceOptions);
    var selectedValue = "";
    if (currentPreference && matchedOptionValue) {
      selectedValue = matchedOptionValue;
    } else if (currentPreference) {
      selectedValue = "__custom__";
    }

    var optionHtml = [
      '<option value="">留空（不手动指定）</option>'
    ];

    guidance.alsaDeviceOptions.forEach(function (item) {
      var transportLabel = item.transport === "analog"
        ? "模拟输出"
        : item.transport === "hdmi"
          ? "HDMI"
          : "ALSA";
      optionHtml.push(
        '<option value="' + escapeHtml(item.value) + '">' +
        escapeHtml(item.label + " · " + transportLabel + (item.recommended ? "（默认）" : "")) +
        "</option>"
      );
    });

    optionHtml.push('<option value="__custom__">手动输入设备名</option>');
    selectElement.innerHTML = optionHtml.join("");
    setElementValue("audioAlsaDeviceSelect", selectedValue);
    setElementValue("audioAlsaDeviceInput", selectedValue === "__custom__" ? currentPreference : "");
    syncAudioManualDeviceVisibility();
  }

  function getVisualCurrentSeconds() {
    if (!state.playerState || !state.playerState.progress) {
      return 0;
    }

    var currentSeconds = Number(state.playerState.progress.currentSeconds) || 0;
    var totalSeconds = Number(state.playerState.progress.totalSeconds) || 0;
    var now = Date.now();

    if (state.playerState.playbackStatus !== "playing" || state.isSeeking) {
      state._visualSeconds = currentSeconds;
      state._lastTickAt = now;
      return currentSeconds;
    }

    var sampledAt = state.playerState.progress.sampledAt || now;
    var inferred = currentSeconds + (now - sampledAt) / 1000;

    if (typeof state._visualSeconds !== "number") {
      state._visualSeconds = inferred;
    } else if (inferred < state._visualSeconds - 1) {
      state._visualSeconds = inferred;
    } else if (inferred > state._visualSeconds + 0.5) {
      state._visualSeconds = inferred;
    } else if (inferred > state._visualSeconds) {
      state._visualSeconds += (now - state._lastTickAt) / 1000;
    } else {
      state._visualSeconds += (now - state._lastTickAt) / 1000;
    }

    state._lastTickAt = now;

    if (totalSeconds > 0) {
      state._visualSeconds = Math.min(totalSeconds, state._visualSeconds);
    }
    return Math.max(0, state._visualSeconds);
  }

  function getActiveLyricsIndex(lines, currentSeconds) {
    var index = -1;
    (lines || []).forEach(function (line, lineIndex) {
      if ((Number(line.timeSeconds) || 0) <= currentSeconds) {
        index = lineIndex;
      }
    });
    return index;
  }

  function lyricsSourceLabel(source, available) {
    if (!available) {
      return "无歌词";
    }
    if (source === "api") {
      return "媒体库匹配";
    }
    if (source === "library") {
      return "缓存匹配";
    }
    if (source === "fallback") {
      return "占位歌词";
    }
    return "已同步";
  }

  function getLyricsSignature(lines) {
    return (lines || []).map(function (item) {
      return String(item.timeSeconds || 0) + "::" + String(item.text || "");
    }).join("\n");
  }

  function scrollActiveLyricsIntoView(activeIndex) {
    if (activeIndex < 0) {
      return;
    }

    var activeLine = document.querySelector("#lyricsList .lyrics-line.current");
    if (!activeLine) {
      return;
    }

    var panel = document.querySelector(".lyrics-panel-full");
    if (!panel) {
      return;
    }

    var panelRect = panel.getBoundingClientRect();
    var lineRect = activeLine.getBoundingClientRect();
    var scrollTarget = panel.scrollTop + (lineRect.top - panelRect.top) - (panelRect.height / 2) + (lineRect.height / 2);

    panel.scrollTo({
      top: Math.max(0, scrollTarget),
      behavior: "auto"
    });
  }

  function findClosestWithAttribute(target, attributeName) {
    var current = target;
    while (current && current instanceof HTMLElement) {
      if (current.hasAttribute(attributeName)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function extractRawLrc(text) {
    if (!text) return "";
    if (text.charAt(0) === "{" && text.indexOf('"lyric"') >= 0) {
      try {
        var parsed = JSON.parse(text);
        text = parsed.lyric || text;
      } catch (e) {}
    }
    return text.replace(/\\n/g, "\n").replace(/\r/g, "");
  }

  function expandLyricsLines(lines, totalSeconds) {
    if (!lines || !lines.length) return lines;

    totalSeconds = Math.max(1, Number(totalSeconds) || 240);

    // 提取每行的纯文本内容
    var rawTexts = lines.map(function(item) { return extractRawLrc(item.text || ""); });

    // 检测是否所有行的文本都相同（后端 bug：每行都填充了整首歌词）
    var allSame = true;
    var firstText = rawTexts[0] || "";
    for (var k = 1; k < rawTexts.length; k++) {
      if (rawTexts[k] !== firstText) { allSame = false; break; }
    }

    if (allSame && rawTexts.length > 1) {
      // 后端 bug：所有行内容相同，只取第一行拆分
      var subLines = firstText.split("\n").filter(function(s) { return s.trim(); });
      return subLines.map(function(txt, idx) {
        return {
          text: escapeHtml(txt),
          timeSeconds: Math.round((idx / Math.max(1, subLines.length)) * totalSeconds)
        };
      });
    }

    // 正常情况：每行内容不同，直接使用（已有时间戳）
    // 检查是否有合理的时间戳分布
    var hasTimeStamps = false;
    var lastTime = -1;
    for (var i = 0; i < lines.length; i++) {
      var t = Number(lines[i].timeSeconds) || 0;
      if (t > lastTime) { hasTimeStamps = true; lastTime = t; }
    }

    if (hasTimeStamps) {
      return lines.map(function(item) {
        var raw = extractRawLrc(item.text || "");
        var htmlText = raw.replace(/\n/g, "<br>");
        return { text: escapeHtml(item.text || "").replace(/\\n/g, "<br>"), timeSeconds: item.timeSeconds };
      });
    }

    // 没有时间戳：按行拆分并估算时间
    var allSegments = [];
    var totalLines = 0;
    var splitResults = [];
    for (var j = 0; j < rawTexts.length; j++) {
      var sub = rawTexts[j].split("\n").filter(function(s) { return s.trim(); });
      splitResults.push(sub);
      totalLines += sub.length;
    }

    var lineIdx = 0;
    for (var m = 0; m < splitResults.length; m++) {
      for (var n = 0; n < splitResults[m].length; n++) {
        allSegments.push({
          text: escapeHtml(splitResults[m][n]),
          timeSeconds: Math.round((lineIdx / Math.max(1, totalLines)) * totalSeconds)
        });
        lineIdx++;
      }
    }
    return allSegments.length ? allSegments : lines;
  }

  function renderLyricsState(payload, currentSeconds) {
    var lyrics = payload && payload.lyrics ? payload.lyrics : null;
    var rawLines = lyrics && lyrics.lines ? lyrics.lines : [];
    var totalSeconds = (payload && payload.progress && payload.progress.totalSeconds) || 240;
    var lines = expandLyricsLines(rawLines, totalSeconds);
    var activeIndex = getActiveLyricsIndex(lines, currentSeconds);
    var signature = getLyricsSignature(lines);
    var lyricsChanged = signature !== state.lastLyricsSignature;
    var activeChanged = activeIndex !== state.activeLyricsIndex;
    var sourceLabel = lyricsSourceLabel(lyrics ? lyrics.source : "", !!(lyrics && lyrics.available));

    updateText("lyricsSourceBadge", state.isSeeking ? sourceLabel + " · 预览中" : sourceLabel);

    if (lyricsChanged) {
      renderStackList(
        "lyricsList",
        lines,
        function (item, itemIndex) {
          var distance = activeIndex < 0 ? 99 : Math.abs(itemIndex - activeIndex);
          var toneClass = distance === 0 ? " current" : distance === 1 ? " nearby" : distance <= 3 ? " soft" : " distant";
          return (
            '<article class="lyrics-line' + toneClass + '">' +
            '<span>' + (item.text || "") + "</span>" +
            "</article>"
          );
        },
        "等待歌曲或歌词数据..."
      );
      if (activeIndex >= 0) {
        scrollActiveLyricsIntoView(activeIndex);
      }
      state.lastLyricsSignature = signature;
      state.activeLyricsIndex = activeIndex;
    } else if (activeChanged && activeIndex >= 0) {
      var lyricsList = document.getElementById("lyricsList");
      if (lyricsList) {
        var children = lyricsList.children;
        for (var ci = 0; ci < children.length; ci++) {
          if (children[ci]) children[ci].className = "lyrics-line distant";
        }
        var ws = Math.max(0, activeIndex - 4);
        var we = Math.min(children.length - 1, activeIndex + 4);
        for (var wi = ws; wi <= we; wi++) {
          var child = children[wi];
          if (!child) continue;
          var dist = Math.abs(wi - activeIndex);
          var tc = dist === 0 ? " current" : dist === 1 ? " nearby" : dist <= 3 ? " soft" : " distant";
          child.className = "lyrics-line" + tc;
        }
        scrollActiveLyricsIntoView(activeIndex);
      }
      state.activeLyricsIndex = activeIndex;
    }
  }

  function syncPlayerProgressUI(previewSeconds) {
    if (!state.playerState || !state.playerState.progress) {
      return;
    }

    var totalSeconds = Number(state.playerState.progress.totalSeconds) || 0;
    var currentSeconds = typeof previewSeconds === "number"
      ? Math.max(0, Math.floor(previewSeconds))
      : getVisualCurrentSeconds();

    if (totalSeconds > 0) {
      currentSeconds = Math.min(totalSeconds, currentSeconds);
    }

    setMiniProgressRatio(totalSeconds > 0 ? currentSeconds / totalSeconds : 0);

    updateText("playerProgress", formatTime(currentSeconds) + " / " + formatTime(totalSeconds));
    updateText("progressCurrentLabel", formatTime(currentSeconds));
    updateText("progressTotalLabel", formatTime(totalSeconds));
    if (!state.isSeeking || typeof previewSeconds === "number") {
      setElementValue("progressSlider", currentSeconds);
    }

    var progressSlider = document.getElementById("progressSlider");
    if (progressSlider) {
      progressSlider.max = String(totalSeconds);
      progressSlider.disabled = totalSeconds <= 0;
    }

    var volumeValue = typeof state.playerState.volume === "number"
      ? Math.max(0, Math.min(100, state.playerState.volume))
      : null;

    if (!state.isAdjustingVolume && volumeValue !== null) {
      setElementValue("volumeSlider", volumeValue);
    }

    var volumeSlider = document.getElementById("volumeSlider");
    if (volumeSlider) {
      volumeSlider.disabled = volumeValue === null;
    }
    updateText("volumeValue", volumeValue === null ? "--%" : String(volumeValue) + "%");
    renderLyricsState(state.playerState, currentSeconds);
  }

  function renderPlayerState(payload) {
    var previousPlaybackStatus = state.playerState && state.playerState.playbackStatus
      ? String(state.playerState.playbackStatus)
      : "";
    var previousTitle = state.playerState && state.playerState.currentSong
      ? String(state.playerState.currentSong.title || "")
      : "";
    state.playerState = payload;
    state.lastPlayerStateAt = Date.now();

    var newTitle = payload.currentSong ? String(payload.currentSong.title || "") : "";
    if (newTitle !== previousTitle) {
      state._visualSeconds = Number(payload.progress && payload.progress.currentSeconds) || 0;
      state._lastTickAt = Date.now();
    }

    var isPlaying = payload.playbackStatus === "playing";
    var heroCard = document.querySelector(".hero-card");
    if (heroCard) {
      heroCard.classList.toggle("is-playing", isPlaying);
    }

    updateText("serviceStatus", "服务状态: " + payload.serviceStatus);
    updateText("miniTrackTitle", payload.currentSong ? payload.currentSong.title : "未开始播放");
    updateText(
      "miniTrackMeta",
      payload.currentSong
        ? [payload.currentSong.artist, payload.currentSong.album].filter(Boolean).join(" · ")
        : "等待 MPD / MPC 就绪"
    );
updatePlayerTrackText(
      payload.currentSong ? payload.currentSong.title : "等待 MPD 当前曲目",
      payload.currentSong
        ? [payload.currentSong.artist, payload.currentSong.album].filter(Boolean).join(" · ")
        : "当前还没有可播放曲目"
    );

    // 更新封面图片
    updatePlayerCover(payload.currentSong);

    syncMiniPlayerIcons(payload);
    syncPlayerControlIcons(payload);
    var miniPlayButton = document.getElementById("miniPlayButton");
    if (miniPlayButton) {
      miniPlayButton.setAttribute("aria-label", actionLabelFromState(payload));
      miniPlayButton.setAttribute("title", actionLabelFromState(payload));
    }
    var heroPlayButton = document.getElementById("heroPlayButton");
    if (heroPlayButton) {
      heroPlayButton.setAttribute("aria-label", actionLabelFromState(payload));
      heroPlayButton.setAttribute("title", actionLabelFromState(payload));
    }
    var playerModeButton = document.getElementById("playerModeButton");
    if (playerModeButton) {
      var modeLabel = payload.mode && payload.mode.random ? "随机播放" : "顺序播放";
      playerModeButton.setAttribute("aria-label", "切换播放模式，当前" + modeLabel);
      playerModeButton.setAttribute("title", "切换播放模式，当前" + modeLabel);
    }
    var playerVolumeToggleButton = document.getElementById("playerVolumeToggleButton");
    if (playerVolumeToggleButton) {
      var volumeValue = typeof payload.volume === "number" ? Math.max(0, Math.min(100, payload.volume)) : null;
      playerVolumeToggleButton.setAttribute("title", volumeValue === null ? "音量控制" : "音量 " + String(volumeValue) + "%");
      playerVolumeToggleButton.setAttribute("aria-label", volumeValue === null ? "音量控制" : "音量 " + String(volumeValue) + "%");
    }
    syncQueueCurrentFromPlayerState(payload);
    syncPlayerProgressUI();
    syncPollingIndicators();
    if (previousPlaybackStatus !== String(payload.playbackStatus || "") && !document.hidden) {
      startPlayerPolling();
    }
  }

  function renderRuntimeState(payload) {
    state.runtimeState = payload;
    state.audioPreferences = payload.audioPreferences || null;
    state.audioGuidance = payload.audioGuidance || null;

    updateText("runtimeServiceStatus", payload.serviceStatus);
    updateText("runtimeManagedStatus", payload.managedByPlugin ? "true" : "false");
    updateText("runtimeMpdBinaryStatus", (payload.mpdAvailable ? "MPD" : "缺 MPD") + " / " + (payload.mpcAvailable ? "MPC" : "缺 MPC"));
    updateText("runtimeConfigStatus", payload.configExists ? "已生成" : "未生成");
    updateText("runtimeModeBadge", payload.mode);
    renderAudioFallbackWarning(payload);
    renderAudioBluetoothChecklist(payload);
    renderAudioPreferences(payload.audioPreferences || null, payload.audioGuidance || null);
  }

  function noteIncludes(notes, text) {
    return (notes || []).some(function (item) {
      return item.indexOf(text) >= 0;
    });
  }

  function buildAudioChecklistEntry(title, detail) {
    return '<article class="list-row compact"><div class="list-row-main"><strong>' +
      escapeHtml(title) +
      '</strong><span>' +
      escapeHtml(detail) +
      "</span></div></article>";
  }

  function renderAudioBluetoothChecklist(runtimePayload) {
    var summaryElement = document.getElementById("audioBluetoothCheckSummary");
    var checklistElement = document.getElementById("audioBluetoothChecklist");
    if (!summaryElement || !checklistElement) {
      return;
    }

    var payload = runtimePayload || {};
    var preferences = normalizeAudioPreferences(payload.audioPreferences || null);
    var guidance = normalizeAudioGuidance(payload.audioGuidance || null);
    var notes = Array.isArray(payload.notes) ? payload.notes.map(function (item) { return String(item || ""); }) : [];
    var manualBluetoothRequested = preferences.outputType === "pulse" || preferences.outputType === "pipewire";
    var pulseSocketMissing = noteIncludes(notes, "Pulse 探针找到的 socket: <missing>");
    var pipewireSocketMissing = noteIncludes(notes, "PipeWire 探针找到的 socket: <missing>");
    var pulseServerUnreachable = notes.some(function (item) {
      return item.indexOf("当前 PULSE_SERVER 指向") >= 0 && item.indexOf("不可达") >= 0;
    });
    var pulseAvailable = !pulseSocketMissing && (
      noteIncludes(notes, "Pulse 探针找到的 socket:") ||
      noteIncludes(notes, "检测到 PULSE_SERVER") ||
      noteIncludes(notes, "宿主可执行 pactl info")
    );
    var pipewireAvailable = !pipewireSocketMissing && (
      noteIncludes(notes, "PipeWire 探针找到的 socket:") ||
      noteIncludes(notes, "检测到 MPD 支持 PipeWire") ||
      noteIncludes(notes, "已从宿主音频 socket 自动识别到 PipeWire Remote")
    );
    var fellBackToAlsa = notes.some(function (item) {
      return item.indexOf("已回退到 alsa") >= 0 || item.indexOf("当前托管配置选择的音频输出为 alsa") >= 0;
    });
    var selectedPulse = noteIncludes(notes, "当前托管配置选择的音频输出为 pulse") || noteIncludes(notes, "本次自动选择的音频输出为 pulse");
    var selectedPipewire = noteIncludes(notes, "当前托管配置选择的音频输出为 pipewire") || noteIncludes(notes, "本次自动选择的音频输出为 pipewire");
    var hasBluetoothSignals = notes.some(function (item) {
      return item.indexOf("Pulse") >= 0 || item.indexOf("PipeWire") >= 0 || item.indexOf("PULSE_SERVER") >= 0;
    });
    var shouldShow = manualBluetoothRequested || hasBluetoothSignals;
    var items = [];
    var summary = "";

    if (!shouldShow) {
      summaryElement.textContent = "";
      summaryElement.hidden = true;
      checklistElement.innerHTML = "";
      checklistElement.hidden = true;
      return;
    }

    if (pulseServerUnreachable || pulseSocketMissing) {
      items.push(buildAudioChecklistEntry(
        "PulseAudio 会话未接通",
        "插件当前没有看到可访问的 Pulse socket。蓝牙音箱常见依赖这条链路；如果你在 Docker 里运行，通常需要挂载 /run/user/1000/pulse 和 Pulse cookie。"
      ));
    } else if (pulseAvailable) {
      items.push(buildAudioChecklistEntry(
        "PulseAudio 会话已看到",
        "插件已经能看到 Pulse 服务地址或 socket，蓝牙场景可以优先继续尝试 PulseAudio。"
      ));
    }

    if (pipewireSocketMissing) {
      items.push(buildAudioChecklistEntry(
        "PipeWire 会话未接通",
        "当前没有看到 PipeWire 用户态 socket。如果宿主蓝牙是靠 PipeWire 提供的，需要把对应用户会话也暴露给插件进程。"
      ));
    } else if (pipewireAvailable) {
      items.push(buildAudioChecklistEntry(
        "PipeWire 会话已看到",
        "插件已经能看到 PipeWire 线索；如果宿主蓝牙走 PipeWire，可以继续优先尝试该输出。"
      ));
    }

    if (fellBackToAlsa) {
      items.push(buildAudioChecklistEntry(
        "当前已回退到 ALSA 有线输出",
        "这说明有线耳机、内置喇叭或 HDMI 仍能工作，但蓝牙桌面音频链路还没有真正接通。"
      ));
    } else if (selectedPipewire) {
      items.push(buildAudioChecklistEntry(
        "当前实际输出为 PipeWire",
        "插件当前已经在尝试 PipeWire 输出，蓝牙链路更接近桌面会话模式。"
      ));
    } else if (selectedPulse) {
      items.push(buildAudioChecklistEntry(
        "当前实际输出为 PulseAudio",
        "插件当前已经在尝试 PulseAudio 输出，蓝牙链路更接近桌面会话模式。"
      ));
    }

    if (pulseServerUnreachable || pulseSocketMissing || pipewireSocketMissing) {
      items.push(buildAudioChecklistEntry(
        "下一步建议",
        "先用下方“蓝牙部署模板”把 XDG_RUNTIME_DIR、Pulse socket 和 cookie 一起挂进去；如果宿主蓝牙主要走 PipeWire，也要把 PipeWire 用户态 socket 暴露给插件。"
      ));
    }

    if (manualBluetoothRequested && fellBackToAlsa) {
      summary = "蓝牙链路检查结果：你当前手动选择了蓝牙输出，但插件运行环境里还没有看到可用的桌面音频会话，所以已经回退到 ALSA 有线输出。";
    } else if (pulseServerUnreachable || pulseSocketMissing || pipewireSocketMissing) {
      summary = "蓝牙链路检查结果：插件没有在当前运行环境里看到完整的 PulseAudio / PipeWire 会话，蓝牙输出暂时还不能直接打通。";
    } else if (selectedPulse || selectedPipewire || pulseAvailable || pipewireAvailable) {
      summary = "蓝牙链路检查结果：插件已经看到部分桌面音频会话线索，可以继续优先尝试蓝牙输出。";
    } else {
      summary = "蓝牙链路检查结果：当前还没有足够证据证明桌面音频会话已完整接通，建议优先核对下方检查项。";
    }

    summaryElement.textContent = summary;
    summaryElement.hidden = !summary;
    checklistElement.innerHTML = items.join("");
    checklistElement.hidden = !items.length;
  }

  function renderAudioFallbackWarning(runtimePayload) {
    var element = document.getElementById("audioFallbackWarning");
    if (!element) {
      return;
    }
    var payload = runtimePayload || {};
    var preferences = normalizeAudioPreferences(payload.audioPreferences || null);
    var notes = Array.isArray(payload.notes) ? payload.notes.map(function (item) { return String(item || ""); }) : [];
    var manualBluetoothRequested = preferences.outputType === "pulse" || preferences.outputType === "pipewire";
    var fellBackToAlsa = notes.some(function (item) {
      return item.indexOf("已回退到 alsa") >= 0 || item.indexOf("当前托管配置选择的音频输出为 alsa") >= 0;
    });
    if (manualBluetoothRequested && fellBackToAlsa) {
      element.textContent = "蓝牙链路未接通，当前已回退到 ALSA 有线输出。";
      element.hidden = false;
      return;
    }
    element.textContent = "";
    element.hidden = true;
  }

  function renderAudioPreferences(payload, guidancePayload) {
    var preferences = normalizeAudioPreferences(payload);
    var isEditingAudioPreferences = isSettingsViewActive() && (state.audioPreferencesDirty || state.audioPreferencesEditing);
    var displayPreferences = isEditingAudioPreferences ? readAudioPreferenceFormValues() : preferences;
    renderAudioGuidance(guidancePayload, displayPreferences);
    if (isEditingAudioPreferences) {
      return;
    }
    setElementValue("audioOutputTypeSelect", preferences.outputType || "auto");
    setElementValue("audioXdgRuntimeDirInput", preferences.xdgRuntimeDir || "");
    setElementValue("audioPulseServerInput", preferences.pulseServer || "");
    setElementValue("audioPipewireRemoteInput", preferences.pipewireRemote || "");
    renderAudioDeviceOptions(guidancePayload, preferences);
    state.audioPreferences = preferences;
    syncAudioAdvancedPreference();
    syncAudioAdvancedVisibility(preferences);
    state.audioPreferencesDirty = false;
  }

  function renderAutostartState(payload) {
    state.autostartState = payload;

    updateText("autostartEnabledStatus", payload.enabled ? "已开启" : "已关闭");
    updateText("toggleAutostartButton", payload.enabled ? "关闭自启动" : "开启自启动");
  }

  function renderBinaryState(payload) {
    state.binaryState = payload;
    var downloadButton = document.getElementById("downloadManagedBundleButton");
    var uploadButton = document.getElementById("uploadManagedBundleButton");
    var installActions = document.getElementById("binaryInstallActions");
    var installedButton = document.getElementById("managedBundleInstalledButton");
    var managedDownload = payload.managedDownload || {};
    var configured = !!managedDownload.configured;
    var downloaded = isInstalledBinaryState(payload);
    var summaryText = !configured
      ? "当前平台的一键下载地址尚未配置，等后续填入 GitHub 资产链接后即可直接使用。"
      : downloaded
        ? "当前平台的 MPD/MPC bundle 已安装完成，并已通过执行校验。你仍可再次在线下载或重新上传覆盖。"
        : "点击“在线下载”，或手动上传 .tgz / .tar.gz，都会直接解压到当前插件真实工作目录的 bin/。";

    updateText("binaryPlatformBadge", payload.platform.platformKey);
    updateText(
      "binaryHostSummary",
      payload.platform.os + " / " + payload.platform.arch + " / " + (payload.platform.libc || "unknown") + (payload.platform.supported ? "" : " / unsupported")
    );
    updateText("binaryDownloadConfigStatus", !configured ? "未配置" : downloaded ? "已安装" : "可下载");
    updateText("binaryDownloadSummary", summaryText);
    if (installActions) {
      installActions.hidden = false;
    }
    if (installedButton) {
      installedButton.hidden = !downloaded;
      installedButton.disabled = true;
    }
    var notInstalledButton = document.getElementById("managedBundleNotInstalledButton");
    if (notInstalledButton) {
      notInstalledButton.hidden = downloaded;
    }
    if (downloadButton) {
      downloadButton.disabled = !configured || !payload.platform.supported;
      downloadButton.textContent = "在线下载";
    }
    if (uploadButton) {
      uploadButton.disabled = false;
      uploadButton.textContent = "手动上传";
    }
    renderBinaryActionNotice();
  }

  function renderQueueState(payload) {
    var normalized = normalizeQueueState(payload);
    state.queueState = normalized;
    state.queueLastSyncedAt = Date.now();
    writeCachedQueueState(normalized);
    updateText("queueBadge", String(normalized.total || 0) + " 首");
    updateText("playerQueueDrawerBadge", String(normalized.total || 0) + " 首");

    var renderQueueItem = function (item) {
      var indexHtml = item.isCurrent
        ? '<div class="playing-bars"><span></span><span></span><span></span></div>'
        : '<span class="queue-index">' + String(item.position) + '</span>';

      return (
        '<article class="queue-item' + (item.isCurrent ? " current" : "") + '">' +
        '<div class="queue-index-container">' + indexHtml + '</div>' +
        '<div class="queue-info">' +
        '<div class="queue-title">' + escapeHtml(item.title) + '</div>' +
        '<div class="queue-meta">' + escapeHtml(item.artist + " · " + item.album) + '</div>' +
        '</div>' +
        '<div class="queue-actions">' +
        '<button class="inline-action" data-queue-jump="' + String(item.position) + '" title="播放">▶</button>' +
        '<button class="inline-action danger" data-queue-remove="' + String(item.position) + '" title="删除">✕</button>' +
        '</div>' +
        '<div class="queue-duration">' + escapeHtml(item.durationLabel) + '</div>' +
        '</article>'
      );
    };

    renderStackList("queueList", normalized.items || [], renderQueueItem, "当前队列为空");
    renderStackList("queueDrawerList", normalized.items || [], renderQueueItem, "当前队列为空");
  }

  function restoreCachedQueueState() {
    var cached = readCachedQueueState();
    if (!cached) {
      return false;
    }
    state.queueState = normalizeQueueState(cached);
    state.queueLastSyncedAt = Number(cached.cachedAt) || 0;
    updateText("queueBadge", String(state.queueState.total || 0) + " 首");
    updateText("playerQueueDrawerBadge", String(state.queueState.total || 0) + " 首");
    renderQueueState(state.queueState);
    state.queueLastSyncedAt = Number(cached.cachedAt) || state.queueLastSyncedAt;
    return true;
  }

  function getQueueItemTrackSignature(item) {
    return [
      normalizeLookupText(item && item.title),
      normalizeLookupText(item && item.artist),
      normalizeLookupText(item && item.album)
    ].join("||");
  }

  function syncQueueCurrentFromPlayerState(payload) {
    if (!state.queueState || !state.queueState.items || !state.queueState.items.length) {
      return false;
    }
    var currentSong = payload && payload.currentSong ? payload.currentSong : null;
    if (!currentSong) {
      return false;
    }
    var currentSignature = getQueueItemTrackSignature(currentSong);
    var matchedIndex = -1;
    state.queueState.items.some(function (item, index) {
      if (getQueueItemTrackSignature(item) === currentSignature) {
        matchedIndex = index;
        return true;
      }
      return false;
    });
    if (matchedIndex < 0) {
      return false;
    }
    var changed = false;
    var nextItems = state.queueState.items.map(function (item, index) {
      var isCurrent = index === matchedIndex;
      if (!!item.isCurrent !== isCurrent) {
        changed = true;
      }
      return {
        queueId: item.queueId,
        position: item.position,
        title: item.title,
        artist: item.artist,
        album: item.album,
        durationLabel: item.durationLabel,
        isCurrent: isCurrent
      };
    });
    if (!changed) {
      return false;
    }
    renderQueueState({
      total: state.queueState.total,
      items: nextItems
    });
    return true;
  }

  function getExplorerListElement() {
    return document.getElementById("librarySectionList");
  }

  function renderExplorerHtml(html, emptyText) {
    var element = getExplorerListElement();
    if (!element) {
      return;
    }

    element.innerHTML = html || ('<p class="empty-text">' + (emptyText || "暂无内容") + "</p>");
  }

  function renderSongEntriesHtml(items) {
    return (items || []).map(function (item) {
      return renderSongEntry(item);
    }).join("");
  }

  function groupSongsByAlbum(items) {
    var groups = [];
    var groupMap = {};

    (items || []).forEach(function (item) {
      var albumName = String(item && item.album ? item.album : "未知专辑");
      if (!groupMap[albumName]) {
        groupMap[albumName] = {
          name: albumName,
          artist: String(item && item.artist ? item.artist : "未知歌手"),
          songs: []
        };
        groups.push(groupMap[albumName]);
      }

      groupMap[albumName].songs.push(item);
    });

    return groups;
  }

  function scrollExplorerIntoView() {
    if (typeof window.scrollTo === "function") {
      window.scrollTo(0, 0);
    }
  }

  function pushLibraryHistory() {
    var snapshot = {
      section: String(state.currentLibrarySection || "home"),
      playlistId: String(state.explorerPlaylistId || ""),
      artistName: String(state.currentArtistName || ""),
      albumArtist: String(state.currentAlbumArtist || ""),
      albumName: String(state.currentAlbumName || "")
    };
    var lastSnapshot = state.libraryHistory.length ? state.libraryHistory[state.libraryHistory.length - 1] : null;
    var isSame = lastSnapshot &&
      lastSnapshot.section === snapshot.section &&
      lastSnapshot.playlistId === snapshot.playlistId &&
      lastSnapshot.artistName === snapshot.artistName &&
      lastSnapshot.albumArtist === snapshot.albumArtist &&
      lastSnapshot.albumName === snapshot.albumName;

    if (!isSame) {
      state.libraryHistory.push(snapshot);
    }
  }

  function resetLibraryHistory() {
    state.libraryHistory = [];
  }

  function setExplorerActiveTarget(target) {
    var buttons = document.querySelectorAll("[data-explorer-target]");
    Array.prototype.forEach.call(buttons, function (button) {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      if (button.getAttribute("data-explorer-target") === target) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    });
  }

  function updateExplorerHeader(title, description, badge, activeTarget) {
    setExplorerActiveTarget(activeTarget);

    var homeSections = document.getElementById("libraryHomeSections");
    if (homeSections) {
      homeSections.style.display = activeTarget === "home" ? "block" : "none";
    }

    var sectionList = document.getElementById("librarySectionList");
    if (sectionList) {
      sectionList.style.display = activeTarget === "home" ? "none" : "block";
    }

    var detailSection = document.getElementById("playlistDetailSection");
    if (detailSection && activeTarget !== "playlists") {
      detailSection.style.display = "none";
    }
  }

  function renderSongEntry(item) {
    return (
      '<article class="list-row clickable" data-song-id="' + escapeHtml(item.id) + '">' +
      renderAlbumIcon(item, "small") +
      '<div class="list-row-main">' +
      '<strong>' + escapeHtml(item.title) + "</strong>" +
      '<span>' + escapeHtml(item.artist + " · " + item.album) + "</span>" +
      "</div>" +
      '<small>' + escapeHtml(item.durationLabel) + "</small>" +
      "</article>"
    );
  }

  function renderArtistAlbumEntry(item) {
    return (
      '<article class="album-shortcut-card" data-album-name="' + escapeHtml(item.name) + '" data-album-artist="' + escapeHtml(item.artist) + '">' +
      '<strong>' + escapeHtml(item.name) + "</strong>" +
      '<span>' + escapeHtml(item.artist + " · 专辑") + "</span>" +
      '<small>' + String(item.songCount) + " 首</small>" +
      "</article>"
    );
  }

  function renderAlbumSongGroup(group) {
    return (
      '<section class="subsection">' +
      '<div class="explorer-section-header">' +
      '<h4>' + escapeHtml(group.name) + "</h4>" +
      '<span class="badge">' + String(group.songs.length) + " 首</span>" +
      "</div>" +
      '<div class="stack-list compact">' + renderSongEntriesHtml(group.songs) + "</div>" +
      "</section>"
    );
  }

  function renderExplorerSection(title, badgeText, bodyHtml) {
    return (
      '<section class="explorer-section">' +
      '<div class="explorer-section-header">' +
      '<h4>' + escapeHtml(title) + "</h4>" +
      '<span class="badge">' + escapeHtml(badgeText) + "</span>" +
      "</div>" +
      bodyHtml +
      "</section>"
    );
  }

  function renderLibraryPanelHeaderActions(badgeText) {
    var html = '<div class="panel-header-actions">';
    if (badgeText) {
      html += '<span class="badge">' + escapeHtml(badgeText) + "</span>";
    }
    html += '<button class="panel-header-action" type="button" data-library-refresh="current">刷新</button>';
    html += "</div>";
    return html;
  }

  function renderLibraryDirectoryPanel(title, badgeText, bodyHtml) {
    return (
      '<section class="panel library-directory-panel">' +
      '<div class="panel-header">' +
      '<h3>' + escapeHtml(title) + "</h3>" +
      renderLibraryPanelHeaderActions(badgeText) +
      "</div>" +
      bodyHtml +
      "</section>"
    );
  }

  function compareText(left, right) {
    return String(left || "").localeCompare(String(right || ""), "zh-CN");
  }

  function scrollWindowToTopIfNeeded() {
    if (typeof window.scrollTo !== "function" || window.scrollY <= 8) {
      return;
    }
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(function () {
        window.scrollTo({
          top: 0,
          left: 0,
          behavior: "auto"
        });
      });
      return;
    }
    window.scrollTo(0, 0);
  }

  function getMediaUrl(value) {
    var raw = String(value || "").trim();
    if (!raw) {
      return "";
    }

    if (/^(https?:|data:|blob:|file:)/i.test(raw)) {
      return encodeURI(raw);
    }

    if (/^[a-zA-Z]:[\\/]/.test(raw)) {
      return encodeURI("file:///" + raw.replace(/\\/g, "/"));
    }

    try {
      var resolved = new URL(raw, window.location.href);
      var token = getAccessToken();
      if (
        token &&
        resolved.origin === window.location.origin &&
        /^(https?:)$/i.test(resolved.protocol) &&
        !resolved.searchParams.has("access_token")
      ) {
        resolved.searchParams.set("access_token", token);
      }
      return resolved.toString();
    } catch (error) {}

    return encodeURI(raw);
  }

/**
   * 统一的封面ID匹配函数（复用媒体库的方法）
   * @param {string} type - 类型：'artist' 或 'album'
   * @param {Object} item - 歌手或专辑对象
   * @param {Array} allSongs - 所有歌曲的数组
   * @returns {string|null} 匹配到的歌曲ID
   */
  function findCoverSongId(type, item, allSongs) {
    if (!item || !allSongs || !allSongs.length) {
      return null;
    }

    if (type === 'artist') {
      // 复用媒体库的歌手匹配逻辑
      if (item.topSong) {
        for (var i = 0; i < allSongs.length; i++) {
          var song = allSongs[i];
          if (song.title === item.topSong && song.artist === item.name) {
            return song.id;
          }
        }
      }
      // 如果没有通过 topSong 匹配到，通过歌手名称匹配
      for (var i = 0; i < allSongs.length; i++) {
        var song = allSongs[i];
        if (song.artist === item.name) {
          return song.id;
        }
      }
    } else if (type === 'album') {
      // 复用媒体库的专辑匹配逻辑
      for (var i = 0; i < allSongs.length; i++) {
        var song = allSongs[i];
        if (song.album === item.name && song.artist === item.artist) {
          return song.id;
        }
      }
    }

    return null;
  }

  /**
   * 缓存封面匹配结果
   * @param {string} cacheKey - 缓存键
   * @param {string} songId - 歌曲ID
   */
  function cacheCoverSongId(cacheKey, songId) {
    try {
      var cache = {};
      var cached = window.localStorage.getItem('songloft-cover-cache');
      if (cached) {
        cache = JSON.parse(cached);
      }
      cache[cacheKey] = {
        songId: songId,
        timestamp: Date.now()
      };
      window.localStorage.setItem('songloft-cover-cache', JSON.stringify(cache));
    } catch (error) {
      // 忽略缓存错误
    }
  }

  /**
   * 获取缓存的封面匹配结果
   * @param {string} cacheKey - 缓存键
   * @param {number} maxAge - 最大缓存时间（毫秒），默认1小时
   * @returns {string|null} 缓存的歌曲ID
   */
  function getCachedCoverSongId(cacheKey, maxAge) {
    if (typeof maxAge === "undefined") {
      maxAge = 60 * 60 * 1000; // 1小时
    }

    try {
      var cached = window.localStorage.getItem('songloft-cover-cache');
      if (cached) {
        var cache = JSON.parse(cached);
        var item = cache[cacheKey];
        if (item && (Date.now() - item.timestamp) < maxAge) {
          return item.songId;
        }
      }
    } catch (error) {
      // 忽略缓存错误
    }
    return null;
  }

  function getCoverValue(payload) {
    if (!payload || typeof payload !== "object") {
      return "";
    }

    // 首先检查原有的封面字段
    var existingCover = String(payload.coverPath || payload.coverUrl || payload.cover_path || "").trim();
    if (existingCover) {
      // 跳过浏览器无法加载的本地文件路径
      if (!/^(file:\/\/|[a-zA-Z]:[\\/])/i.test(existingCover)) {
        return existingCover;
      }
    }

    // 判断是否是歌曲对象（有title字段且不是播放列表）
    var isSong = payload.title && !payload.playlistId && !payload.isPlaylist;

    // 如果是歌曲对象且有歌曲ID，则构建API封面URL
    if (isSong) {
      var songId = payload.id || payload.song_id || payload.songId;
      if (songId) {
        return "/api/v1/songs/" + String(songId) + "/cover";
      }
    }

    // 对于专辑对象，如果有第一首歌的ID，使用歌曲封面API
    if (payload.name && payload.artist && !payload.title && payload.firstSongId) {
      return "/api/v1/songs/" + String(payload.firstSongId) + "/cover";
    }

    return "";
  }

  function getSongFilterKeyword() {
    return String(state.songFilterText || "").trim().toLowerCase();
  }

  function getFilteredSortedSongs(items) {
    var keyword = getSongFilterKeyword();
    var result = (items || []).filter(function (item) {
      if (!keyword) {
        return true;
      }

      var haystack = [
        item.title || "",
        item.artist || "",
        item.album || ""
      ].join(" ").toLowerCase();

      return haystack.indexOf(keyword) >= 0;
    });

    result.sort(function (left, right) {
      if (state.songSortMode === "artist-asc") {
        var artistDiff = compareText(left.artist, right.artist);
        return artistDiff || compareText(left.title, right.title);
      }

      if (state.songSortMode === "album-asc") {
        var albumDiff = compareText(left.album, right.album);
        return albumDiff || compareText(left.title, right.title);
      }

      return compareText(left.title, right.title);
    });

    return result;
  }

  function renderSongBrowserToolbar(totalCount, filteredCount) {
    return (
      '<section class="explorer-section song-browser-toolbar">' +
      '<div class="explorer-section-header">' +
      '<h4>浏览控制</h4>' +
      '<div class="header-actions">' +
      '<button class="inline-action" type="button" data-batch-context="songs" data-batch-replace="false">全部加入队列</button>' +
      '<span id="librarySongFilterCount" class="badge">' + String(filteredCount) + " / " + String(totalCount) + "</span>" +
      "</div>" +
      "</div>" +
      '<div class="song-browser-controls">' +
      '<label class="song-browser-field">' +
      '<span>筛选曲目</span>' +
      '<input id="librarySongFilterInput" class="search-input song-browser-input" type="search" placeholder="输入名称、歌手或专辑..." value="' + escapeHtml(state.songFilterText || "") + '">' +
      "</label>" +
      '<label class="song-browser-field">' +
      '<span>排序方式</span>' +
      '<select id="librarySongSortSelect" class="search-input song-browser-select">' +
      '<option value="title-asc"' + (state.songSortMode === "title-asc" ? " selected" : "") + '>按歌曲名称</option>' +
      '<option value="artist-asc"' + (state.songSortMode === "artist-asc" ? " selected" : "") + '>按歌手分组</option>' +
      '<option value="album-asc"' + (state.songSortMode === "album-asc" ? " selected" : "") + '>按专辑分组</option>' +
      "</select>" +
      "</label>" +
      "</div>" +
      "</section>"
    );
  }

  function renderBatchActionBar(context, playLabel, countLabel) {
    return (
      '<section class="explorer-section">' +
      '<div class="explorer-section-header">' +
      '<h4>播放控制</h4>' +
      '<div class="header-actions">' +
      '<button class="inline-action" type="button" data-batch-context="' + escapeHtml(context) + '" data-batch-replace="false">' + escapeHtml(playLabel) + "</button>" +
      '<span class="badge">' + escapeHtml(countLabel) + "</span>" +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  function renderSongsDirectoryResults(items) {
    if (!items.length) {
      return '<p class="empty-text">没有匹配到歌曲</p>';
    }

    if (state.songSortMode === "artist-asc") {
      var groups = groupSongsByArtist(items);
      return groups.map(function (group) {
        return (
          '<section class="subsection">' +
          '<div class="explorer-section-header">' +
          '<h4>' + escapeHtml(group.name) + "</h4>" +
          '<span class="badge">' + String(group.songs.length) + " 首</span>" +
          "</div>" +
          '<div class="stack-list compact">' + renderSongEntriesHtml(group.songs) + "</div>" +
          "</section>"
        );
      }).join("");
    }

    if (state.songSortMode === "album-asc") {
      var groups = groupSongsByAlbum(items);
      return groups.map(function (group) {
        return (
          '<section class="subsection">' +
          '<div class="explorer-section-header">' +
          '<h4>' + escapeHtml(group.name) + "</h4>" +
          '<span class="badge">' + String(group.songs.length) + " 首</span>" +
          "</div>" +
          '<div class="stack-list compact">' + renderSongEntriesHtml(group.songs) + "</div>" +
          "</section>"
        );
      }).join("");
    }

    return renderExplorerSection(
      "歌曲列表",
      String(items.length) + " 首",
      '<div class="stack-list compact">' + renderSongEntriesHtml(items) + "</div>"
    );
  }

  function groupSongsByArtist(items) {
    var groups = [];
    var groupMap = {};

    (items || []).forEach(function (item) {
      var artistName = String(item && item.artist ? item.artist : "未知歌手");
      if (!groupMap[artistName]) {
        groupMap[artistName] = {
          name: artistName,
          songs: []
        };
        groups.push(groupMap[artistName]);
      }
      groupMap[artistName].songs.push(item);
    });

    return groups;
  }

  function renderAlbumIcon(payload, sizeClass) {
    var coverUrl = getMediaUrl(getCoverValue(payload));
    var albumName = payload.album || payload.name || payload.title || "";
    var initials = escapeHtml((albumName || "AL").slice(0, 2).toUpperCase());
    var size = sizeClass || "medium";

    return (
      '<div class="album-icon is-placeholder ' + size + '">' +
      '<div class="album-icon-placeholder">' +
      '<div class="album-icon-glow"></div>' +
      '<div class="album-icon-cover-card">' +
      '<div class="album-icon-cover-shine"></div>' +
      '<div class="album-icon-initials">' + initials + "</div>" +
      '<div class="album-icon-caption">ALBUM</div>' +
      "</div>" +
      "</div>" +
      (coverUrl ? '<img class="album-icon-image" src="' + escapeHtml(coverUrl) + '" alt="" onerror="this.style.display=\'none\'">' : "") +
      "</div>"
    );
  }

function renderArtistIcon(payload, sizeClass) {
    var initials = escapeHtml((payload.name || "AR").slice(0, 2).toUpperCase());
    var size = sizeClass || "medium";

    // 只使用topSongId获取封面
    var coverUrl = "";
    if (payload.topSongId) {
      coverUrl = getMediaUrl("/api/v1/songs/" + String(payload.topSongId) + "/cover");
    }

    return (
      '<div class="album-icon artist is-placeholder ' + size + '">' +
      '<div class="album-icon-placeholder">' +
      '<div class="album-icon-glow"></div>' +
      '<div class="album-icon-cover-card">' +
      '<div class="album-icon-cover-shine"></div>' +
      '<div class="album-icon-initials">' + initials + "</div>" +
      '<div class="album-icon-caption">ARTIST</div>' +
      "</div>" +
      "</div>" +
      (coverUrl ? '<img class="album-icon-image" src="' + escapeHtml(coverUrl) + '" alt="" onerror="this.style.display=\'none\'">' : "") +
      "</div>"
    );
  }

  function renderPlaylistIcon(payload, sizeClass) {
    var coverUrl = getMediaUrl(getCoverValue(payload));
    var initials = escapeHtml(((payload && (payload.title || payload.name)) || "PL").slice(0, 2).toUpperCase());
    var size = sizeClass || "medium";

    return (
      '<div class="album-icon playlist is-placeholder ' + size + '">' +
      '<div class="album-icon-placeholder">' +
      '<div class="album-icon-glow"></div>' +
      '<div class="album-icon-cover-card">' +
      '<div class="album-icon-cover-shine"></div>' +
      '<div class="album-icon-initials">' + initials + "</div>" +
      '<div class="album-icon-caption">PLAYLIST</div>' +
      "</div>" +
      "</div>" +
      (coverUrl ? '<img class="album-icon-image" src="' + escapeHtml(coverUrl) + '" alt="" onerror="this.style.display=\'none\'">' : "") +
      "</div>"
    );
  }

  function renderPlaylistDirectory() {
    state.currentLibrarySection = "playlists";
    state.explorerPlaylistId = "";
    state.explorerPlaylistDetail = null;
    state.currentArtistName = "";
    state.currentAlbumArtist = "";
    state.currentAlbumName = "";
    updateExplorerHeader("全部歌单", "按歌单浏览 Songloft 媒体库内容。", String(state.libraryHome ? state.libraryHome.playlists.length : 0) + " 个歌单", "playlists");
    var html = renderLibraryDirectoryPanel(
      "全部歌单",
      String(state.libraryHome ? state.libraryHome.playlists.length : 0) + " 个歌单",
      '<div class="stack-list library-directory-list">' +
      (state.libraryHome ? state.libraryHome.playlists.map(function (item) {
        return (
          '<article class="list-row library-directory-row playlist-directory-row clickable" data-playlist-id="' + escapeHtml(item.id) + '">' +
          renderPlaylistIcon(item, "small") +
          '<div class="list-row-main">' +
          '<strong>' + escapeHtml(item.title) + "</strong>" +
          '<span>' + escapeHtml(item.description) + "</span>" +
          "</div>" +
          '<small>' + String(item.songCount) + " 首</small>" +
          "</article>"
        );
      }).join("") : '<p class="empty-text">未读取到歌单数据</p>') +
      "</div>"
    );
    renderExplorerHtml(html, "未读取到歌单数据");
  }

  function renderPlaylistDetail(payload) {
    state.currentLibrarySection = "playlists";
    state.explorerPlaylistId = payload.id || "";
    state.explorerPlaylistDetail = payload;
    state.currentArtistName = "";
    state.currentAlbumArtist = "";
    state.currentAlbumName = "";
    updateExplorerHeader(
      payload.title || "歌单详情",
      payload.description || "按歌单浏览 Songloft 媒体库内容。",
      String(payload.songCount || 0) + " 首",
      "playlists"
    );
    var html = "";
    if ((payload.songs || []).length) {
      html += renderBatchActionBar(
        "playlist",
        "全部加入队列",
        String(payload.songCount || (payload.songs || []).length) + " 首"
      );
      html += renderExplorerSection(
        "歌单曲目",
        String(payload.songCount || (payload.songs || []).length) + " 首",
        '<div class="stack-list compact">' + renderSongEntriesHtml(payload.songs || []) + "</div>"
      );
    }
    renderExplorerHtml(
      renderLibraryDirectoryPanel(
        payload.title || "歌单详情",
        String(payload.songCount || (payload.songs || []).length) + " 首",
        html || '<p class="empty-text">当前歌单暂无歌曲</p>'
      ),
      "当前歌单暂无歌曲"
    );
  }

  function updateSongsDirectoryResults(payload) {
    var items = getFilteredSortedSongs(payload.songs || []);
    updateText("librarySongFilterCount", String(items.length) + " / " + String((payload.songs || []).length));

    var resultContainer = document.getElementById("librarySongResultSection");
    if (resultContainer) {
      resultContainer.innerHTML = renderSongsDirectoryResults(items);
      return;
    }

    renderSongsDirectory(payload);
  }

  function renderLibraryWelcome() {
    state.currentLibrarySection = "home";
    state.currentArtistName = "";
    state.currentAlbumArtist = "";
    state.currentAlbumName = "";
    state.explorerPlaylistId = "";
    state.explorerPlaylistDetail = null;
    updateExplorerHeader("媒体库", "浏览并播放你的音乐收藏", "最近", "home");
    renderExplorerHtml("", "");
  }

  function renderSongsDirectory(payload) {
    state.currentLibrarySection = "songs";
    state.currentArtistName = "";
    state.currentAlbumArtist = "";
    state.currentAlbumName = "";
    state.librarySongs = payload;
    updateExplorerHeader(payload.title || "全部歌曲", "按歌曲浏览媒体库，可直接点击播放。", String(payload.total || 0) + " 首", "songs");
    var items = getFilteredSortedSongs(payload.songs || []);
    var html = renderLibraryDirectoryPanel(
      payload.title || "全部歌曲",
      String(payload.total || 0) + " 首",
      renderSongBrowserToolbar((payload.songs || []).length, items.length) +
      '<div id="librarySongResultSection">' + renderSongsDirectoryResults(items) + "</div>"
    );
    renderExplorerHtml(html, "未读取到歌曲数据");
  }

function renderArtistsDirectory(payload) {
    state.currentLibrarySection = "artists";
    state.currentArtistName = "";
    state.currentAlbumArtist = "";
    state.currentAlbumName = "";
    state.libraryArtists = payload;
    updateExplorerHeader(payload.title || "全部歌手", "按歌手进入二级歌曲列表。", String(payload.total || 0) + " 位", "artists");

    // 尝试为每位歌手找到代表作的歌曲ID（使用缓存）
    var allSongs = state.librarySongs && state.librarySongs.songs ? state.librarySongs.songs : [];

    var html = renderLibraryDirectoryPanel(
      "全部歌手",
      String(payload.total || 0) + " 位",
      '<div class="stack-list library-directory-list">' +
      (payload.artists || []).map(function (item) {
        var artistItem = Object.assign({}, item);

        // 尝试从缓存获取
        var cacheKey = 'artist:' + item.name;
        var cachedSongId = getCachedCoverSongId(cacheKey);
        
        if (cachedSongId) {
          artistItem.topSongId = cachedSongId;
        } else {
          // 使用媒体库的匹配逻辑
          var topSongId = findCoverSongId('artist', item, allSongs);
          if (topSongId) {
            artistItem.topSongId = topSongId;
            cacheCoverSongId(cacheKey, topSongId);
          }
        }

        return (
          '<article class="list-row library-directory-row artist-directory-row clickable" data-artist-name="' + escapeHtml(item.name) + '">' +
          renderArtistIcon(artistItem, "small") +
          '<div class="list-row-main">' +
          '<strong>' + escapeHtml(item.name) + "</strong>" +
          '<span>' + escapeHtml("代表作: " + item.topSong) + "</span>" +
          "</div>" +
          '<small>' + String(item.songCount) + " 首 · " + String(item.albumCount) + " 张</small>" +
          "</article>"
        );
      }).join("") +
      "</div>"
    );
    renderExplorerHtml(html, "未读取到歌手数据");
  }

  function renderArtistHero(payload) {
    return (
      '<section class="album-hero-card compact">' +
      renderArtistIcon(payload, "hero") +
      '<div class="album-hero-main">' +
      '<p class="eyebrow">Artist</p>' +
      '<h4>' + escapeHtml(payload.name || "未知歌手") + "</h4>" +
      '<div class="album-hero-meta">' +
      '<span class="badge">' + String(payload.songCount || 0) + " 首歌曲</span>" +
      '<span class="badge">' + String(payload.albumCount || 0) + " 张专辑</span>" +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

function renderArtistDetail(payload) {
    state.currentLibrarySection = "artists";
    state.currentArtistName = payload.name || "";
    state.currentAlbumArtist = "";
    state.currentAlbumName = "";

    // 为歌手对象添加第一首歌ID（用于封面显示）
    var artistWithSongId = Object.assign({}, payload);
    if (payload.songs && payload.songs.length > 0) {
      artistWithSongId.topSongId = payload.songs[0].id;
    }

    updateExplorerHeader(payload.name, "歌手歌曲列表", String(payload.songCount || 0) + " 首 · " + String(payload.albumCount || 0) + " 张专辑", "artists");
    var html = "";
    var albums = payload.albums || [];
    var groups = groupSongsByAlbum(payload.songs || []);

    // 添加歌手英雄卡片
    html += renderArtistHero(artistWithSongId);

    if (albums.length) {
      html += renderExplorerSection(
        "专辑入口",
        String(albums.length) + " 张",
        '<div class="album-shortcut-grid">' + albums.map(function (item) {
          return renderArtistAlbumEntry(item);
        }).join("") + "</div>"
      );
    }

    if (groups.length) {
      html += renderExplorerSection(
        "按专辑分组",
        String(payload.songCount || 0) + " 首",
        groups.map(function (group) {
          return renderAlbumSongGroup(group);
        }).join("")
      );
    }

    renderExplorerHtml(
      renderLibraryDirectoryPanel(
        payload.name || "歌手详情",
        String(payload.songCount || 0) + " 首 · " + String(payload.albumCount || 0) + " 张专辑",
        html || '<p class="empty-text">当前歌手暂无歌曲</p>'
      ),
      "当前歌手暂无歌曲"
    );
  }

function renderAlbumsDirectory(payload) {
    state.currentLibrarySection = "albums";
    state.currentAlbumArtist = "";
    state.currentAlbumName = "";
    state.libraryAlbums = payload;
    updateExplorerHeader(payload.title || "全部专辑", "按专辑进入二级歌曲列表。", String(payload.total || 0) + " 张", "albums");

    // 尝试为每张专辑找到第一首歌的封面ID（使用缓存）
    var allSongs = state.librarySongs && state.librarySongs.songs ? state.librarySongs.songs : [];

    var html = renderLibraryDirectoryPanel(
      "全部专辑",
      String(payload.total || 0) + " 张",
      '<div class="stack-list library-directory-list">' +
      (payload.albums || []).map(function (item) {
        var albumItem = Object.assign({}, item);

        // 尝试从缓存获取
        var cacheKey = 'album:' + item.artist + ':' + item.name;
        var cachedSongId = getCachedCoverSongId(cacheKey);
        
        if (cachedSongId) {
          albumItem.firstSongId = cachedSongId;
        } else {
          // 使用媒体库的匹配逻辑
          var firstSongId = findCoverSongId('album', item, allSongs);
          if (firstSongId) {
            albumItem.firstSongId = firstSongId;
            cacheCoverSongId(cacheKey, firstSongId);
          }
        }

        return (
          '<article class="list-row library-directory-row album-directory-row clickable" data-album-name="' + escapeHtml(item.name) + '" data-album-artist="' + escapeHtml(item.artist) + '">' +
          renderAlbumIcon(albumItem, "small") +
          '<div class="list-row-main">' +
          '<strong>' + escapeHtml(item.name) + "</strong>" +
          '<span>' + escapeHtml(item.artist) + "</span>" +
          "</div>" +
          '<small>' + String(item.songCount) + " 首</small>" +
          "</article>"
        );
      }).join("") +
      "</div>"
    );
    renderExplorerHtml(html, "未读取到专辑数据");
  }

  function renderAlbumDetail(payload) {
    state.currentLibrarySection = "albums";
    state.currentAlbumArtist = payload.artist || "";
    state.currentAlbumName = payload.name || "";
    updateExplorerHeader(payload.name, payload.artist, String(payload.songCount || 0) + " 首", "albums");
    var html = "";
    if ((payload.songs || []).length) {
      html += renderBatchActionBar(
        "album",
        "全部加入队列",
        String(payload.songCount || 0) + " 首"
      );
      html += renderExplorerSection(
        "专辑曲目",
        String(payload.songCount || 0) + " 首",
        '<div class="stack-list compact">' + renderSongEntriesHtml(payload.songs || []) + "</div>"
      );
    }
    renderExplorerHtml(
      renderLibraryDirectoryPanel(
        payload.name || "专辑详情",
        String(payload.songCount || 0) + " 首",
        html || '<p class="empty-text">当前专辑暂无歌曲</p>'
      ),
      "当前专辑暂无歌曲"
    );
  }

  function invalidateLibraryCaches() {
    state.libraryHome = null;
    state.libraryHomeFetchedAt = 0;
    state.librarySongs = null;
    state.librarySongsFetchedAt = 0;
    state.libraryArtists = null;
    state.libraryArtistsFetchedAt = 0;
    state.libraryAlbums = null;
    state.libraryAlbumsFetchedAt = 0;
    state.artistDetailsByName = {};
    state.artistDetailFetchedAtByName = {};
    state.albumDetailsByKey = {};
    state.albumDetailFetchedAtByKey = {};
    state.explorerPlaylistDetail = null;
    state.playlistDetailFetchedAtById = {};
  }

  async function refreshCurrentLibraryView(options) {
    var forceReload = !!(options && options.forceReload);
    if (state.currentLibrarySection === "home") {
      await loadHomeData(forceReload);
      return;
    }
    if (state.currentLibrarySection === "songs") {
      await openLibrarySection("songs", { skipHistory: true, forceReload: forceReload });
      return;
    }
    if (state.currentLibrarySection === "playlists" && state.explorerPlaylistId) {
      await openPlaylistDetail(state.explorerPlaylistId, { skipHistory: true, forceReload: forceReload });
      return;
    }
    if (state.currentLibrarySection === "playlists") {
      await openLibrarySection("playlists", { skipHistory: true, forceReload: forceReload });
      return;
    }
    if (state.currentLibrarySection === "artists" && state.currentArtistName) {
      await openArtistDetail(state.currentArtistName, { skipHistory: true, forceReload: forceReload });
      return;
    }
    if (state.currentLibrarySection === "artists") {
      await openLibrarySection("artists", { skipHistory: true, forceReload: forceReload });
      return;
    }
    if (state.currentLibrarySection === "albums" && state.currentAlbumArtist && state.currentAlbumName) {
      await openAlbumDetail(state.currentAlbumArtist, state.currentAlbumName, { skipHistory: true, forceReload: forceReload });
      return;
    }
    if (state.currentLibrarySection === "albums") {
      await openLibrarySection("albums", { skipHistory: true, forceReload: forceReload });
      return;
    }
    await openLibrarySection("home", { skipHistory: true, forceReload: forceReload });
  }

  function switchView(viewId, options) {
    var views = document.querySelectorAll(".page-view");
    var targetView = document.getElementById("view-" + viewId);
    state.currentView = viewId;

    if (targetView && targetView.classList.contains("active")) {
      if (!(options && options.skipCache)) {
        if (viewId === "library") {
          void cacheCurrentPage(state.currentLibrarySection === "home" ? "library" : (state.currentLibrarySection || "library"));
        } else if (viewId === "home" || viewId === "queue" || viewId === "settings") {
          void cacheCurrentPage(viewId);
        }
      }
      if (viewId === "queue") {
        void maybeRefreshQueueState(false);
      }
      if (viewId === "settings") {
        void refreshSettingsState(true);
      }
      return;
    }

    Array.prototype.forEach.call(views, function (view) {
      view.classList.remove("active");
    });

    if (targetView) {
      targetView.classList.add("active");
    }

    var tabs = document.querySelectorAll(".tab-item");
    Array.prototype.forEach.call(tabs, function (tab) {
      if (tab.getAttribute("data-tab") === viewId) {
        tab.classList.add("active");
      } else {
        tab.classList.remove("active");
      }
    });

    if (!(options && options.preserveScroll)) {
      scrollWindowToTopIfNeeded();
    }
    if (!(options && options.skipCache)) {
      if (viewId === "library") {
        void cacheCurrentPage(state.currentLibrarySection === "home" ? "library" : (state.currentLibrarySection || "library"));
      } else if (viewId === "home" || viewId === "queue" || viewId === "settings") {
        void cacheCurrentPage(viewId);
      }
    }
    if (viewId === "queue") {
      if (!state.queueState) {
        restoreCachedQueueState();
      }
      void maybeRefreshQueueState(false);
    }
    if (viewId === "library" && state.libraryRefreshPending) {
      state.libraryRefreshPending = false;
      void refreshCurrentLibraryView({
        forceReload: true
      });
    }
    if (viewId === "settings") {
      void refreshSettingsState(true);
    }
  }

  async function openLibrarySection(target, options) {
    var section = String(target || "home");
    switchView("library", {
      skipCache: true
    }); // Switch to library view when opening any library section

    if (!(options && options.skipHistory)) {
      if (section === "home") {
        resetLibraryHistory();
      } else {
        pushLibraryHistory();
      }
    }
    if (section === "home") {
      void cacheCurrentPage("library");
      renderLibraryWelcome();
      scrollExplorerIntoView();
      return;
    }

    if (section === "songs") {
      void cacheCurrentPage("songs");
      if (isLibraryCollectionFresh("songs") && !(options && options.forceReload)) {
        renderSongsDirectory(state.librarySongs);
      } else {
        updateExplorerHeader("全部歌曲", "正在同步全部歌曲...", "加载中", "songs");
        renderStackList("librarySectionList", [], null, "正在同步全部歌曲...");
        var songResult = await request("/library/songs");
        state.librarySongsFetchedAt = Date.now();
        renderSongsDirectory(songResult.data);
      }
      scrollExplorerIntoView();
      return;
    }

    if (section === "playlists") {
      void cacheCurrentPage("playlists");
      if (isLibraryCollectionFresh("home") && !(options && options.forceReload)) {
        renderPlaylistDirectory();
      } else {
        updateExplorerHeader("全部歌单", "正在同步全部歌单...", "加载中", "playlists");
        renderStackList("librarySectionList", [], null, "正在同步全部歌单...");
        await loadHomeData(true);
        renderPlaylistDirectory();
      }
      scrollExplorerIntoView();
      return;
    }

    if (section === "artists") {
      void cacheCurrentPage("artists");
      if (isLibraryCollectionFresh("artists") && !(options && options.forceReload)) {
        renderArtistsDirectory(state.libraryArtists);
      } else {
        updateExplorerHeader("全部歌手", "正在同步全部歌手...", "加载中", "artists");
        renderStackList("librarySectionList", [], null, "正在同步全部歌手...");
        var artistResult = await request("/library/artists");
        state.libraryArtistsFetchedAt = Date.now();
        renderArtistsDirectory(artistResult.data);
      }
      scrollExplorerIntoView();
      return;
    }

    if (section === "albums") {
      void cacheCurrentPage("albums");
      if (isLibraryCollectionFresh("albums") && !(options && options.forceReload)) {
        renderAlbumsDirectory(state.libraryAlbums);
      } else {
        updateExplorerHeader("全部专辑", "正在同步全部专辑...", "加载中", "albums");
        renderStackList("librarySectionList", [], null, "正在同步全部专辑...");
        var albumResult = await request("/library/albums");
        state.libraryAlbumsFetchedAt = Date.now();
        renderAlbumsDirectory(albumResult.data);
      }
      scrollExplorerIntoView();
    }
  }

  async function openPlaylistDetail(playlistId, options) {
    var id = String(playlistId || "").trim();
    if (!id) {
      return;
    }
    switchView("library", {
      skipCache: true
    });
    if (!(options && options.skipHistory)) {
      pushLibraryHistory();
    }
    void cacheCurrentPage("playlists");
    if (isPlaylistDetailFresh(id) && !(options && options.forceReload)) {
      renderPlaylistDetail(state.explorerPlaylistDetail);
    } else {
      updateExplorerHeader("歌单详情", "正在同步歌单歌曲...", "加载中", "playlists");
      renderStackList("librarySectionList", [], null, "正在同步歌单歌曲...");
      var result = await request("/library/playlists/" + encodeURIComponent(id));
      state.playlistDetailFetchedAtById[id] = Date.now();
      renderPlaylistDetail(result.data);
    }
    scrollExplorerIntoView();
  }

  async function openArtistDetail(artistName, options) {
    var name = String(artistName || "").trim();
    if (!name) {
      return;
    }
    switchView("library", {
      skipCache: true
    });
    if (!(options && options.skipHistory)) {
      pushLibraryHistory();
    }
    void cacheCurrentPage("artists");
    if (isArtistDetailFresh(name) && !(options && options.forceReload)) {
      renderArtistDetail(state.artistDetailsByName[name]);
    } else {
      updateExplorerHeader(name, "正在同步歌手歌曲...", "加载中", "artists");
      renderStackList("librarySectionList", [], null, "正在同步歌手歌曲...");
      var result = await request("/library/artists/detail?name=" + encodeURIComponent(name));
      state.artistDetailsByName[name] = result.data;
      state.artistDetailFetchedAtByName[name] = Date.now();
      renderArtistDetail(result.data);
    }
    scrollExplorerIntoView();
  }

  async function openAlbumDetail(artistName, albumName, options) {
    var artist = String(artistName || "").trim();
    var album = String(albumName || "").trim();
    if (!artist || !album) {
      return;
    }
    switchView("library", {
      skipCache: true
    });
    if (!(options && options.skipHistory)) {
      pushLibraryHistory();
    }
    void cacheCurrentPage("albums");
    var cacheKey = getAlbumDetailCacheKey(artist, album);
    if (isAlbumDetailFresh(cacheKey) && !(options && options.forceReload)) {
      renderAlbumDetail(state.albumDetailsByKey[cacheKey]);
    } else {
      updateExplorerHeader(album, "正在同步专辑歌曲...", "加载中", "albums");
      renderStackList("librarySectionList", [], null, "正在同步专辑歌曲...");
      var result = await request(
        "/library/albums/detail?artist=" + encodeURIComponent(artist) + "&name=" + encodeURIComponent(album)
      );
      state.albumDetailsByKey[cacheKey] = result.data;
      state.albumDetailFetchedAtByKey[cacheKey] = Date.now();
      renderAlbumDetail(result.data);
    }
    scrollExplorerIntoView();
  }

function renderHomeData(payload) {
    state.libraryHome = payload;

    updateText("playlistCount", String(payload.summary.playlistCount));
    updateText("songCount", String(payload.summary.songCount));
    updateText("artistCount", String(payload.summary.artistCount));
    updateText("albumCount", String(payload.summary.albumCount));

    renderStackList(
      "songList",
      payload.recentSongs,
      function (item) {
        return renderSongEntry(item);
      },
      "未读取到歌曲数据"
    );

    // 直接复用媒体库的方法：使用 state.librarySongs 进行封面匹配
    var allSongs = state.librarySongs && state.librarySongs.songs ? state.librarySongs.songs : [];

    // 为首页歌手添加ID匹配（完全复用媒体库的方法）
    var artistHighlightsWithIds = (payload.artistHighlights || []).map(function (item) {
      var artistItem = Object.assign({}, item);

      // 尝试从缓存获取
      var cacheKey = 'artist:' + item.name;
      var cachedSongId = getCachedCoverSongId(cacheKey);
      
      if (cachedSongId) {
        artistItem.topSongId = cachedSongId;
      } else {
        // 复用媒体库的匹配逻辑
        var topSongId = findCoverSongId('artist', item, allSongs);
        if (topSongId) {
          artistItem.topSongId = topSongId;
          cacheCoverSongId(cacheKey, topSongId);
        }
      }

      return artistItem;
    });

    renderStackList(
      "artistHighlights",
      artistHighlightsWithIds,
      function (item) {
        return (
          '<article class="pill-item clickable" data-artist-name="' + escapeHtml(item.name) + '">' +
          renderArtistIcon(item, "medium") +
          '<div class="pill-item-content">' +
          '<strong>' + escapeHtml(item.name) + '</strong>' +
          '<span>' + String(item.songCount) + ' 首歌曲</span>' +
          '</div>' +
          '</article>'
        );
      },
      "暂无歌手摘要"
    );

    // 为首页专辑添加ID匹配（完全复用媒体库的方法）
    var albumHighlightsWithIds = (payload.albumHighlights || []).map(function (item) {
      var albumItem = Object.assign({}, item);

      // 尝试从缓存获取
      var cacheKey = 'album:' + item.artist + ':' + item.name;
      var cachedSongId = getCachedCoverSongId(cacheKey);
      
      if (cachedSongId) {
        albumItem.firstSongId = cachedSongId;
      } else {
        // 复用媒体库的匹配逻辑
        var firstSongId = findCoverSongId('album', item, allSongs);
        if (firstSongId) {
          albumItem.firstSongId = firstSongId;
          cacheCoverSongId(cacheKey, firstSongId);
        }
      }

      return albumItem;
    });

    renderStackList(
      "albumHighlights",
      albumHighlightsWithIds,
      function (item) {
        return (
          '<article class="album-highlight-card clickable" data-album-name="' + escapeHtml(item.name) + '" data-album-artist="' + escapeHtml(item.artist) + '">' +
          renderAlbumIcon(item, "large") +
          '<div class="album-highlight-info">' +
          '<div class="album-highlight-title">' + escapeHtml(item.name) + '</div>' +
          '<div class="album-highlight-artist">' + escapeHtml(item.artist) + '</div>' +
          '</div>' +
          '</article>'
        );
      },
      "暂无专辑摘要"
    );

    if (state.currentLibrarySection === "home") {
      renderLibraryWelcome();
    }
  }

  async function loadBootstrap() {
    updateText("serviceStatus", "服务状态: 拉取中");

    try {
      var result = await request("/ui/bootstrap");
      renderBootstrap(result.data);
    } catch (error) {
      updateText("serviceStatus", "服务状态: 接口异常");
      updatePlayerTrackText("插件接口访问失败", String(error));
    }
  }

async function loadHomeData(forceReload) {
    // 首先加载歌曲数据，用于封面匹配
    try {
      if (!state.librarySongs || forceReload) {
        var songResult = await request("/library/songs");
        state.librarySongs = songResult.data;
        state.librarySongsFetchedAt = Date.now();
      }
    } catch (error) {
      console.error("加载歌曲数据失败:", error);
      // 即使歌曲数据加载失败，也继续加载首页数据
    }

    try {
      if (!state.libraryHome || forceReload) {
        var result = await request("/library/home");
        state.libraryHomeFetchedAt = Date.now();
        renderHomeData(result.data);
      } else {
        renderHomeData(state.libraryHome);
      }
      if (state.currentLibrarySection === "songs") {
        await openLibrarySection("songs", { skipHistory: true });
      } else if (state.currentLibrarySection === "playlists" && state.explorerPlaylistId) {
        await openPlaylistDetail(state.explorerPlaylistId, { skipHistory: true });
      } else if (state.currentLibrarySection === "playlists") {
        await openLibrarySection("playlists", { skipHistory: true });
      } else if (state.currentLibrarySection === "artists" && state.currentArtistName) {
        await openArtistDetail(state.currentArtistName, { skipHistory: true });
      } else if (state.currentLibrarySection === "artists") {
        await openLibrarySection("artists", { skipHistory: true });
      } else if (state.currentLibrarySection === "albums" && state.currentAlbumArtist && state.currentAlbumName) {
        await openAlbumDetail(state.currentAlbumArtist, state.currentAlbumName, { skipHistory: true });
      } else if (state.currentLibrarySection === "albums") {
        await openLibrarySection("albums", { skipHistory: true });
      }
    } catch (error) {
      renderStackList("songList", [], null, "首页数据读取失败: " + String(error));
      renderStackList("artistHighlights", [], null, "首页数据读取失败");
      renderStackList("albumHighlights", [], null, "首页数据读取失败");
      renderStackList("librarySectionList", [], null, "二级浏览数据读取失败: " + String(error));
    }
  }

  async function rescanLibraryData() {
    var button = document.getElementById("rescanLibraryButton");
    if (button) {
      button.disabled = true;
      button.textContent = "重新扫描中...";
    }
    setLibraryRescanNotice("正在重新扫描媒体库，请稍候...", "");
    try {
      await request("/library/rescan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: "{}"
      });
      invalidateLibraryCaches();
      if (state.currentView === "library") {
        state.libraryRefreshPending = false;
        await refreshCurrentLibraryView({
          forceReload: true
        });
      } else {
        state.libraryRefreshPending = true;
      }
      setLibraryRescanNotice("媒体库已重新扫描。返回媒体库时会看到最新数据。", "success");
    } catch (error) {
      setLibraryRescanNotice("重新扫描媒体库失败: " + String(error), "error");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "重新扫描媒体库";
      }
    }
  }

  async function loadPlayerState() {
    try {
      var result = await request("/player/state");
      renderPlayerState(result.data);
    } catch (error) {
      updateText("serviceStatus", "服务状态: MPD 接口异常");
      updateText("miniTrackMeta", String(error));
    }
  }

  async function loadRuntimeState() {
    try {
      var result = await request("/mpd/status");
      renderRuntimeState(result.data);
    } catch (error) {
      renderStackList("runtimeNotes", [], null, "运行时状态读取失败: " + String(error));
    }
  }

  async function loadBinaryState() {
    try {
      var result = await request("/mpd/binaries");
      renderBinaryState(result.data);
    } catch (error) {
      setBinaryActionNotice("", "");
      renderStackList("binaryNotes", [], null, "二进制状态读取失败: " + String(error));
    }
  }

  async function loadAutostartState() {
    try {
      var result = await request("/mpd/autostart");
      renderAutostartState(result.data);
    } catch (error) {
      renderStackList("autostartNotes", [], null, "自启动状态读取失败: " + String(error));
    }
  }

  async function loadQueueState() {
    if (state.queueSyncInFlight) {
      return;
    }
    state.queueSyncInFlight = true;
    try {
      var result = await request("/queue");
      renderQueueState(result.data);
    } catch (error) {
      if (!state.queueState) {
        renderStackList("queueList", [], null, "队列读取失败: " + String(error));
        renderStackList("queueDrawerList", [], null, "队列读取失败: " + String(error));
      }
    } finally {
      state.queueSyncInFlight = false;
    }
  }

  function getCurrentAlbumDetail() {
    if (!state.currentAlbumArtist || !state.currentAlbumName) {
      return null;
    }
    return state.albumDetailsByKey[getAlbumDetailCacheKey(state.currentAlbumArtist, state.currentAlbumName)] || null;
  }

  function getBatchSongIds(context) {
    if (context === "songs") {
      return getFilteredSortedSongs((state.librarySongs && state.librarySongs.songs) || []).map(function (item) {
        return String(item.id || "");
      }).filter(Boolean);
    }
    if (context === "playlist") {
      return ((state.explorerPlaylistDetail && state.explorerPlaylistDetail.songs) || []).map(function (item) {
        return String(item.id || "");
      }).filter(Boolean);
    }
    if (context === "album") {
      var albumDetail = getCurrentAlbumDetail();
      return ((albumDetail && albumDetail.songs) || []).map(function (item) {
        return String(item.id || "");
      }).filter(Boolean);
    }
    return [];
  }

function shouldRefreshQueueState(forceRefresh) {
    if (forceRefresh || !state.queueState) {
      return true;
    }
    // 优化队列刷新间隔 - 减少不必要请求
    if (state.currentView === "queue" || state.playerQueueDrawerOpen) {
      return Date.now() - state.queueLastSyncedAt > 5000;  // 从1.8秒优化到5秒
    }
    return Date.now() - state.queueLastSyncedAt > 15000;  // 从12秒优化到15秒
  }

  function maybeRefreshQueueState(forceRefresh) {
    if (!shouldRefreshQueueState(forceRefresh)) {
      return Promise.resolve();
    }
    return loadQueueState();
  }

  async function refreshCoreState(forceQueueRefresh) {
    var tasks = [loadPlayerState()];
    if (shouldRefreshQueueState(forceQueueRefresh)) {
      tasks.push(loadQueueState());
    }
    await Promise.all(tasks);
  }

  async function refreshSettingsState(forceFullRefresh) {
    var shouldRefresh = isSettingsViewActive() || !!forceFullRefresh;
    if (!shouldRefresh) {
      return;
    }
    var tasks = [loadRuntimeState(), loadBinaryState(), loadAutostartState()];
    await Promise.all(tasks);
  }

  async function sendPlayerAction(action, value) {
    try {
      var result = await request("/player/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: action,
          value: value
        })
      });
      renderPlayerState(result.data);
      await maybeRefreshQueueState(true);
    } catch (error) {
      updateText("serviceStatus", "服务状态: 控制失败");
      updateText("miniTrackMeta", String(error));
    }
  }

  async function playSong(songId) {
    try {
      var result = await request("/player/play-song", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          songId: songId
        })
      });
      renderPlayerState(result.data);
      await maybeRefreshQueueState(true);
    } catch (error) {
      updateText("serviceStatus", "服务状态: 播放失败");
      updateText("miniTrackMeta", String(error));
    }
  }

  async function sendMpdAction(path) {
    stopRealtimeUpdates();
    try {
      var result = await request(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: "{}"
      });

      if (result.data.runtime) {
        renderRuntimeState(result.data.runtime);
      } else {
        await loadRuntimeState();
      }

      if (result.data.player) {
        renderPlayerState(result.data.player);
      } else {
        await loadPlayerState();
      }
      await loadQueueState();
      if (isSettingsViewActive()) {
        await refreshSettingsState(true);
      }
    } catch (error) {
      updateText("serviceStatus", "服务状态: MPD 管理失败");
      updateText("miniTrackMeta", String(error));
    } finally {
      resumeRealtimeUpdates();
    }
  }

  async function downloadManagedBinaryBundle() {
    stopRealtimeUpdates();
    var downloadButton = document.getElementById("downloadManagedBundleButton");
    var uploadButton = document.getElementById("uploadManagedBundleButton");
    if (downloadButton) {
      downloadButton.disabled = true;
      downloadButton.textContent = "在线下载中...";
    }
    if (uploadButton) {
      uploadButton.disabled = true;
    }
    setBinaryActionNotice("正在为当前宿主在线下载并校验 MPD/MPC bundle，请稍候...", "");
    try {
      var result = await request("/mpd/binaries/download-managed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: "{}"
      });
      setBinaryActionNotice("在线下载成功，已完成执行校验。", "success");
      renderBinaryState(result.data);
      await loadRuntimeState();
      await loadPlayerState();
    } catch (error) {
      setBinaryActionNotice("在线下载失败: " + String(error) + ' 尝试手动安装 https://github.com/huaimi123/mympd/releases/tag/v1.0.0', "error");
      renderStackList("binaryNotes", [], null, "在线下载失败: " + String(error));
      await loadBinaryState();
    } finally {
      if (downloadButton) {
        downloadButton.disabled = false;
        downloadButton.textContent = "在线下载";
      }
      if (uploadButton) {
        uploadButton.disabled = false;
      }
      resumeRealtimeUpdates();
    }
  }

  function inferManagedBundlePlatformKeyFromFilename(filename) {
    var normalized = String(filename || "").trim().toLowerCase();
    if (!normalized) {
      return "";
    }
    var supportedPlatformKeys = [
      "linux-x86_64-glibc",
      "linux-x86_64-musl",
      "linux-arm64-glibc",
      "linux-arm64-musl",
      "linux-armv7-glibc",
      "linux-armv7-musl"
    ];
    for (var i = 0; i < supportedPlatformKeys.length; i += 1) {
      if (normalized.indexOf(supportedPlatformKeys[i]) >= 0) {
        return supportedPlatformKeys[i];
      }
    }
    if (normalized.indexOf("linux-amd64") >= 0) {
      return "linux-x86_64-glibc";
    }
    if (normalized.indexOf("linux-arm64") >= 0) {
      return "linux-arm64-glibc";
    }
    if (normalized.indexOf("linux-armv7") >= 0) {
      return "linux-armv7-glibc";
    }
    return "";
  }

  function validateManagedBundleFileBeforeUpload(file) {
    if (!file) {
      return "";
    }
    if (!/(\.tgz|\.tar\.gz)$/i.test(String(file.name || ""))) {
      return "手动上传仅支持 .tgz / .tar.gz 压缩包";
    }
    var platform = state.binaryState && state.binaryState.platform ? state.binaryState.platform : null;
    var inferredPlatformKey = inferManagedBundlePlatformKeyFromFilename(file.name);
    if (platform && platform.supported && inferredPlatformKey && inferredPlatformKey !== platform.platformKey) {
      return "当前宿主是 " + platform.platformKey + "，但你选择的压缩包文件名看起来属于 " + inferredPlatformKey + "，请先换成匹配当前宿主的平台包。";
    }
    return "";
  }

  async function uploadManagedBinaryBundle(file, inputElement) {
    var uploadButton = document.getElementById("uploadManagedBundleButton");
    var downloadButton = document.getElementById("downloadManagedBundleButton");
    var validationError = "";

    if (!file) {
      return;
    }

    validationError = validateManagedBundleFileBeforeUpload(file);
    if (validationError) {
      setBinaryActionNotice(validationError, "error");
      renderStackList("binaryNotes", [], null, validationError);
      if (inputElement) {
        inputElement.value = "";
      }
      return;
    }

    if (uploadButton) {
      uploadButton.disabled = true;
      uploadButton.textContent = "上传中...";
    }
    if (downloadButton) {
      downloadButton.disabled = true;
    }

    stopRealtimeUpdates();
    setBinaryActionNotice("正在读取压缩包并检查是否适配当前宿主，请稍候...", "");
    try {
      if (uploadButton) {
        uploadButton.textContent = "读取压缩包中...";
      }
      var archiveBase64 = await readFileAsBase64(file);
      if (uploadButton) {
        uploadButton.textContent = "上传并校验中...";
      }
      setBinaryActionNotice("压缩包已读取完成，正在上传并校验可执行性，请稍候...", "");
      var result = await request("/mpd/binaries/upload-managed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          filename: file.name || "bundle.tar.gz",
          archiveBase64: archiveBase64
        })
      });
      setBinaryActionNotice("手动上传成功，已解压到真实插件目录并完成执行校验。", "success");
      renderBinaryState(result.data);
      await loadRuntimeState();
      await loadPlayerState();
    } catch (error) {
      setBinaryActionNotice("手动上传失败: " + String(error), "error");
      renderStackList("binaryNotes", [], null, "手动上传失败: " + String(error));
      await loadBinaryState();
    } finally {
      if (inputElement) {
        inputElement.value = "";
      }
      if (uploadButton) {
        uploadButton.disabled = false;
        uploadButton.textContent = "手动上传";
      }
      resumeRealtimeUpdates();
    }
  }

  async function toggleAutostart() {
    try {
      var enabled = !(state.autostartState && state.autostartState.enabled);
      var result = await request("/mpd/autostart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          enabled: enabled
        })
      });
      renderAutostartState(result.data);
      await loadRuntimeState();
    } catch (error) {
      renderStackList("autostartNotes", [], null, "切换自启动失败: " + String(error));
    }
  }

  async function saveAudioPreferences(useAutoDefaults) {
    stopRealtimeUpdates();
    try {
      var formValues = readAudioPreferenceFormValues();
      var payload = useAutoDefaults ? {
        outputType: "auto",
        xdgRuntimeDir: "",
        pulseServer: "",
        pipewireRemote: "",
        alsaDevice: "",
        restart: true
      } : {
        outputType: formValues.outputType || "auto",
        xdgRuntimeDir: formValues.xdgRuntimeDir,
        pulseServer: formValues.pulseServer,
        pipewireRemote: formValues.pipewireRemote,
        alsaDevice: formValues.alsaDevice,
        restart: true
      };
      var result = await request("/mpd/audio/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      state.audioPreferencesDirty = false;
      state.audioPreferencesEditing = false;
      setAudioPreferenceNotice(useAutoDefaults ? "已恢复默认音频设置，并重启 MPD。" : "音频设置已保存，并重启 MPD。", "success");
      if (result.data && result.data.runtime) {
        renderRuntimeState(result.data.runtime);
      } else {
        await loadRuntimeState();
      }
      if (result.data && result.data.player) {
        renderPlayerState(result.data.player);
      } else {
        await loadPlayerState();
      }
    } catch (error) {
      setAudioPreferenceNotice("音频设置保存失败: " + String(error), "error");
    } finally {
      resumeRealtimeUpdates();
    }
  }

  async function sendQueueAction(path, payload) {
    try {
      var result = await request(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload || {})
      });

      if (result.data.queue) {
        renderQueueState(result.data.queue);
      } else {
        await loadQueueState();
      }

      if (result.data.player) {
        renderPlayerState(result.data.player);
      } else {
        await loadPlayerState();
      }
    } catch (error) {
      renderStackList("queueList", [], null, "队列操作失败: " + String(error));
      renderStackList("queueDrawerList", [], null, "队列操作失败: " + String(error));
    }
  }

async function playBatch(songIds, replaceQueue) {
    if (!songIds || !songIds.length) {
      return;
    }

    state.isBatchProcessing = true;
    var isAppend = replaceQueue !== true;
    showLoading(`正在将 ${songIds.length} 首歌曲${isAppend ? '追加到' : '替换'}队列...`);

    try {
      var result = await request("/player/play-batch-with-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          songIds: songIds,
          shuffle: false,
          replaceQueue: replaceQueue === true
        })
      });
      
      hideLoading();
      var data = result.data;
      if (data && data.success) {
        var msg = isAppend
          ? `已将 ${data.totalSongs || songIds.length} 首歌曲追加到队列`
          : `已将 ${data.totalSongs || songIds.length} 首歌曲加入队列`;
        showToast(msg, 'success');
      } else {
        showToast(isAppend ? '已追加到队列，后端正在处理' : '已加入队列，后端正在处理', 'success');
      }
      
      await maybeRefreshQueueState(true);
    } catch (error) {
      hideLoading();
      showToast('操作失败: ' + String(error), 'error');
      updateText("serviceStatus", "服务状态: 批量操作失败");
      updateText("miniTrackMeta", String(error));
    } finally {
      state.isBatchProcessing = false;
      startPlayerPolling();
    }
  }

  async function performSearch(query) {
    switchView("home", {
      skipCache: true
    });
    var summary = document.getElementById("searchSummary");
    if (summary) {
      summary.textContent = query ? "搜索中..." : "请输入关键词后再搜索";
    }

    if (!query) {
      renderStackList("searchResults", [], null, "请输入关键词后再搜索");
      closeSearchDropdown();
      return;
    }

    openSearchDropdown();

    try {
      var result = await request("/library/search?q=" + encodeURIComponent(query));
      if (summary) {
        summary.textContent = "关键词 “" + result.data.query + "” 共返回 " + result.data.songs.length + " 首歌曲";
      }
      renderStackList(
        "searchResults",
        result.data.songs,
        function (item) {
          return renderSongEntry(item);
        },
        "没有找到匹配歌曲"
      );
      if (hasSearchResultsContent()) {
        openSearchDropdown();
      }
    } catch (error) {
      if (summary) {
        summary.textContent = "搜索失败";
      }
      renderStackList("searchResults", [], null, "搜索失败: " + String(error));
      openSearchDropdown();
    }
  }

  async function cacheCurrentPage(pageName) {
    var payload = {
      currentPage: String(pageName || "home")
    };
    try {
      await request("/session/cache", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.warn("cacheCurrentPage failed:", error);
    }
  }

  function bindEvents() {
    syncNavigationIcons();
    syncMiniPlayerIcons(state.playerState);

    var searchForm = document.getElementById("searchForm");
    var searchInput = document.getElementById("searchInput");
if (searchForm && searchInput) {
      searchForm.addEventListener("submit", function (event) {
        event.preventDefault();
        void performSearch(searchInput.value.trim());
      });
      
      // 添加搜索输入防抖处理
      searchInput.addEventListener("input", debounce(function(event) {
        var query = event.target.value.trim();
        if (query.length >= 1) {  // 至少输入1个字符才开始搜索
          void performSearch(query);
        } else {
          closeSearchDropdown();
        }
      }, 300));  // 300ms防抖延迟
      
      searchInput.addEventListener("focus", function () {
        if (searchInput.value.trim() && hasSearchResultsContent()) {
          openSearchDropdown();
        }
      });
    }

    var tabItems = document.querySelectorAll(".tab-item");
    Array.prototype.forEach.call(tabItems, function (tab) {
      if (!(tab instanceof HTMLElement)) {
        return;
      }
      tab.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var tabName = tab.getAttribute("data-tab") || "home";
        if (tabName === "settings") {
          if (!state.audioGuideReminderSuppressed) {
            openAudioGuideModal();
          } else {
            switchView("settings", {
              preserveScroll: true
            });
          }
        } else {
          switchView(tabName, {
            preserveScroll: true
          });
        }
      });
    });

var playerSheetPages = document.getElementById("playerSheetPages");
    if (playerSheetPages) {
      playerSheetPages.addEventListener("scroll", throttle(function () {
        syncPlayerSheetPageFromScroll();
      }, 100));
    }

    var playerSheet = document.querySelector(".player-sheet");
    if (playerSheet instanceof HTMLElement) {
      playerSheet.addEventListener("pointerdown", function (event) {
        if (event.pointerType && event.pointerType !== "mouse") {
          return;
        }
        if (!state.playerSheetOpen || !canStartPlayerSheetPullDown(event.target)) {
          return;
        }
        startPlayerSheetDrag("pointer", event.pointerId, event.clientX, event.clientY);
        playerSheet.setPointerCapture(event.pointerId);
      });

      playerSheet.addEventListener("pointermove", function (event) {
        if (!state.playerSheetOpen || state.playerSheetDragSource !== "pointer" || state.playerSheetPointerId !== event.pointerId || !state.playerSheetDragReady) {
          return;
        }
        if (movePlayerSheetDrag(event.clientX, event.clientY)) {
          event.preventDefault();
        }
      });

      ["pointerup", "pointercancel"].forEach(function (eventName) {
        playerSheet.addEventListener(eventName, function (event) {
          if (state.playerSheetDragSource !== "pointer" || state.playerSheetPointerId !== event.pointerId) {
            return;
          }
          finishPlayerSheetDrag(playerSheet);
        });
      });

      playerSheet.addEventListener("touchstart", function (event) {
        var firstTouch = event.changedTouches && event.changedTouches[0];
        if (!firstTouch || !state.playerSheetOpen || !canStartPlayerSheetPullDown(event.target)) {
          return;
        }
        startPlayerSheetDrag("touch", firstTouch.identifier, firstTouch.clientX, firstTouch.clientY);
      }, { passive: true });

      playerSheet.addEventListener("touchmove", function (event) {
        if (state.playerSheetDragSource !== "touch" || !state.playerSheetDragReady) {
          return;
        }
        var trackedTouch = findTrackedTouch(event);
        if (!trackedTouch) {
          return;
        }
        if (movePlayerSheetDrag(trackedTouch.clientX, trackedTouch.clientY)) {
          event.preventDefault();
        }
      }, { passive: false });

      ["touchend", "touchcancel"].forEach(function (eventName) {
        playerSheet.addEventListener(eventName, function (event) {
          var trackedTouch = findTrackedTouch(event);
          if (state.playerSheetDragSource !== "touch" || !trackedTouch) {
            return;
          }
          finishPlayerSheetDrag(playerSheet);
        });
      });
    }

    document.addEventListener("input", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.id === "librarySongFilterInput") {
        state.songFilterText = String(target.value || "");
        if (state.currentLibrarySection === "songs" && state.librarySongs) {
          updateSongsDirectoryResults(state.librarySongs);
        }
      }
    });

    document.addEventListener("change", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.id === "librarySongSortSelect") {
        state.songSortMode = String(target.value || "title-asc");
        if (state.currentLibrarySection === "songs" && state.librarySongs) {
          updateSongsDirectoryResults(state.librarySongs);
        }
      }
    });

    var progressSlider = document.getElementById("progressSlider");
    if (progressSlider) {
      progressSlider.addEventListener("input", function () {
        state.isSeeking = true;
        syncPlayerProgressUI(Number(progressSlider.value || 0));
      });
      progressSlider.addEventListener("change", function () {
        state.isSeeking = false;
        void sendPlayerAction("seek", String(progressSlider.value || 0));
      });
    }

    var volumeSlider = document.getElementById("volumeSlider");
    if (volumeSlider) {
      ["pointerdown", "touchstart", "mousedown"].forEach(function (eventName) {
        volumeSlider.addEventListener(eventName, function (event) {
          event.stopPropagation();
          state.isAdjustingVolume = true;
          pausePlayerVolumePopoverAutoClose();
        });
      });
      volumeSlider.addEventListener("input", function () {
        state.isAdjustingVolume = true;
        updateText("volumeValue", String(volumeSlider.value || 0) + "%");
      });
      volumeSlider.addEventListener("change", function () {
        state.isAdjustingVolume = false;
        void sendPlayerAction("volume", String(volumeSlider.value || 0));
        resumePlayerVolumePopoverAutoClose();
      });
      ["pointerup", "touchend", "mouseup"].forEach(function (eventName) {
        volumeSlider.addEventListener(eventName, function (event) {
          event.stopPropagation();
          state.isAdjustingVolume = false;
          resumePlayerVolumePopoverAutoClose();
        });
      });
    }

    var playerModeButton = document.getElementById("playerModeButton");
    if (playerModeButton) {
      playerModeButton.addEventListener("click", function (event) {
        event.stopPropagation();
        togglePlayerModePopover();
      });
    }

    var playerModePopover = document.getElementById("playerModePopover");
    if (playerModePopover) {
      ["pointerdown", "touchstart", "mousedown", "click"].forEach(function (eventName) {
        playerModePopover.addEventListener(eventName, function (event) {
          event.stopPropagation();
        });
      });
      playerModePopover.querySelectorAll(".player-mode-option").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var mode = btn.getAttribute("data-mode");
          applyPlayerMode(mode);
          closePlayerModePopover();
        });
      });
    }

    var playerVolumeToggleButton = document.getElementById("playerVolumeToggleButton");
    if (playerVolumeToggleButton) {
      playerVolumeToggleButton.addEventListener("click", function (event) {
        event.stopPropagation();
        togglePlayerVolumePopover();
      });
    }

    var playerVolumePopover = document.getElementById("playerVolumePopover");
    if (playerVolumePopover) {
      ["pointerdown", "touchstart", "mousedown"].forEach(function (eventName) {
        playerVolumePopover.addEventListener(eventName, function (event) {
          event.stopPropagation();
          pausePlayerVolumePopoverAutoClose();
        });
      });
      ["pointerup", "touchend", "mouseup"].forEach(function (eventName) {
        playerVolumePopover.addEventListener(eventName, function (event) {
          event.stopPropagation();
          if (!state.isAdjustingVolume) {
            resumePlayerVolumePopoverAutoClose();
          }
        });
      });
      playerVolumePopover.addEventListener("click", function (event) {
        event.stopPropagation();
      });
    }

    var playerQueueDrawer = document.querySelector(".player-queue-drawer");
    if (playerQueueDrawer instanceof HTMLElement) {
      playerQueueDrawer.addEventListener("pointerdown", function (event) {
        if (event.pointerType && event.pointerType !== "mouse") {
          return;
        }
        if (!state.playerQueueDrawerOpen || !canStartPlayerQueueDrawerPullDown(event.target)) {
          return;
        }
        startPlayerQueueDrawerDrag("pointer", event.pointerId, event.clientX, event.clientY);
        playerQueueDrawer.setPointerCapture(event.pointerId);
      });

      playerQueueDrawer.addEventListener("pointermove", function (event) {
        if (!state.playerQueueDrawerOpen || state.playerQueueDrawerPointerId !== event.pointerId || !state.playerQueueDrawerDragReady) {
          return;
        }
        if (movePlayerQueueDrawerDrag(event.clientX, event.clientY)) {
          event.preventDefault();
        }
      });

      ["pointerup", "pointercancel"].forEach(function (eventName) {
        playerQueueDrawer.addEventListener(eventName, function (event) {
          if (state.playerQueueDrawerPointerId !== event.pointerId) {
            return;
          }
          finishPlayerQueueDrawerDrag(playerQueueDrawer);
        });
      });

      playerQueueDrawer.addEventListener("touchstart", function (event) {
        var firstTouch = event.changedTouches && event.changedTouches[0];
        if (!firstTouch || !state.playerQueueDrawerOpen || !canStartPlayerQueueDrawerPullDown(event.target)) {
          return;
        }
        startPlayerQueueDrawerDrag("touch", firstTouch.identifier, firstTouch.clientX, firstTouch.clientY);
      }, { passive: true });

      playerQueueDrawer.addEventListener("touchmove", function (event) {
        if (!state.playerQueueDrawerOpen || !state.playerQueueDrawerDragReady) {
          return;
        }
        var trackedTouch = findTrackedQueueDrawerTouch(event);
        if (!trackedTouch) {
          return;
        }
        if (movePlayerQueueDrawerDrag(trackedTouch.clientX, trackedTouch.clientY)) {
          event.preventDefault();
        }
      }, { passive: false });

      ["touchend", "touchcancel"].forEach(function (eventName) {
        playerQueueDrawer.addEventListener(eventName, function (event) {
          var trackedTouch = findTrackedQueueDrawerTouch(event);
          if (!trackedTouch) {
            return;
          }
          finishPlayerQueueDrawerDrag(playerQueueDrawer);
        });
      });
    }

    [
      ["startMpdButton", "/mpd/start"],
      ["restartMpdButton", "/mpd/restart"],
      ["stopMpdButton", "/mpd/stop"]
    ].forEach(function (entry) {
      var element = document.getElementById(entry[0]);
      if (element) {
        element.addEventListener("click", function () {
          void sendMpdAction(entry[1]);
        });
      }
    });

    var toggleAutostartButton = document.getElementById("toggleAutostartButton");
    if (toggleAutostartButton) {
      toggleAutostartButton.addEventListener("click", function () {
        void toggleAutostart();
      });
    }

    var rescanLibraryButton = document.getElementById("rescanLibraryButton");
    if (rescanLibraryButton) {
      rescanLibraryButton.addEventListener("click", function () {
        void rescanLibraryData();
      });
    }

    var closeAudioGuideModalButton = document.getElementById("closeAudioGuideModalButton");
    if (closeAudioGuideModalButton) {
      closeAudioGuideModalButton.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        closeAudioGuideModal();
      });
    }

    syncPlayerControlIcons(state.playerState);


    var closeAudioGuideModalFooterButton = document.getElementById("closeAudioGuideModalFooterButton");
    if (closeAudioGuideModalFooterButton) {
      closeAudioGuideModalFooterButton.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        closeAudioGuideModal();
      });
    }

    var audioGuideSuppressReminderCheckbox = document.getElementById("audioGuideSuppressReminderCheckbox");
    if (audioGuideSuppressReminderCheckbox) {
      audioGuideSuppressReminderCheckbox.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      audioGuideSuppressReminderCheckbox.addEventListener("change", function () {
        setAudioGuideReminderSuppressed(!!audioGuideSuppressReminderCheckbox.checked);
      });
    }

    var saveAudioPreferencesInlineButton = document.getElementById("saveAudioPreferencesInlineButton");
    if (saveAudioPreferencesInlineButton) {
      saveAudioPreferencesInlineButton.addEventListener("click", function () {
        void saveAudioPreferences(false);
      });
    }

    var resetAudioPreferencesInlineButton = document.getElementById("resetAudioPreferencesInlineButton");
    if (resetAudioPreferencesInlineButton) {
      resetAudioPreferencesInlineButton.addEventListener("click", function () {
        void saveAudioPreferences(true);
      });
    }

    var audioAdvancedCard = document.getElementById("audioAdvancedCard");
    if (audioAdvancedCard) {
      audioAdvancedCard.addEventListener("toggle", function () {
        writeAudioAdvancedPreference(!!audioAdvancedCard.open);
      });
    }

    [
      ["audioScenarioWiredButton", "wired"],
      ["audioScenarioBluetoothButton", "bluetooth"]
    ].forEach(function (entry) {
      var element = document.getElementById(entry[0]);
      if (!element) {
        return;
      }
      element.addEventListener("click", function () {
        applyAudioScenarioPreset(entry[1]);
      });
    });

    ["audioOutputTypeSelect", "audioAlsaDeviceSelect", "audioAlsaDeviceInput", "audioXdgRuntimeDirInput", "audioPulseServerInput", "audioPipewireRemoteInput"].forEach(function (id) {
      var element = document.getElementById(id);
      if (!element) {
        return;
      }
      element.addEventListener("focus", function () {
        state.audioPreferencesEditing = true;
      });
      element.addEventListener("blur", function () {
        window.setTimeout(updateAudioPreferenceEditingState, 0);
      });
      element.addEventListener("input", updateAudioPreferenceDirtyState);
      element.addEventListener("change", function () {
        if (id === "audioAlsaDeviceSelect") {
          if (element.value !== "__custom__") {
            setElementValue("audioAlsaDeviceInput", "");
          }
          syncAudioManualDeviceVisibility();
        }
        if (id === "audioOutputTypeSelect" || id === "audioXdgRuntimeDirInput" || id === "audioPulseServerInput" || id === "audioPipewireRemoteInput") {
          syncAudioAdvancedVisibility();
        }
        renderAudioScenarioCard(readAudioPreferenceFormValues(), state.audioGuidance || null);
        updateAudioPreferenceDirtyState();
      });
    });

    ["audioTemplateHostUserInput", "audioTemplateMusicDirInput", "audioTemplateDataDirInput", "audioTemplatePasswordInput"].forEach(function (id) {
      var element = document.getElementById(id);
      if (!element) {
        return;
      }
      element.addEventListener("input", function () {
        updateBluetoothTemplateOutputs();
      });
    });

    var copyAudioDockerRunButton = document.getElementById("copyAudioDockerRunButton");
    if (copyAudioDockerRunButton) {
      copyAudioDockerRunButton.addEventListener("click", function () {
        void copyTextContent(getElementValue("audioDockerRunTemplateOutput"), "已复制 docker run 模板。");
      });
    }

    var copyAudioDockerComposeButton = document.getElementById("copyAudioDockerComposeButton");
    if (copyAudioDockerComposeButton) {
      copyAudioDockerComposeButton.addEventListener("click", function () {
        void copyTextContent(getElementValue("audioDockerComposeTemplateOutput"), "已复制 docker-compose 模板。");
      });
    }

    var refreshQueueButton = document.getElementById("refreshQueueButton");
    if (refreshQueueButton) {
      refreshQueueButton.addEventListener("click", function () {
        void maybeRefreshQueueState(true);
      });
    }

    var clearQueueButton = document.getElementById("clearQueueButton");
    if (clearQueueButton) {
      clearQueueButton.addEventListener("click", function () {
        void sendQueueAction("/queue/clear");
      });
    }

    var downloadManagedBundleButton = document.getElementById("downloadManagedBundleButton");
    if (downloadManagedBundleButton) {
      downloadManagedBundleButton.addEventListener("click", function () {
        void downloadManagedBinaryBundle();
      });
    }

    var uploadManagedBundleButton = document.getElementById("uploadManagedBundleButton");
    var uploadManagedBundleInput = document.getElementById("uploadManagedBundleInput");
    if (uploadManagedBundleButton && uploadManagedBundleInput) {
      uploadManagedBundleButton.addEventListener("click", function () {
        uploadManagedBundleInput.click();
      });
      uploadManagedBundleInput.addEventListener("change", function () {
        var selectedFile = uploadManagedBundleInput.files && uploadManagedBundleInput.files[0];
        if (selectedFile) {
          void uploadManagedBinaryBundle(selectedFile, uploadManagedBundleInput);
        }
      });
    }

    [
      ["heroPrevButton", "prev"],
      ["heroPlayButton", "toggle"],
      ["heroNextButton", "next"],
      ["miniPrevButton", "prev"],
      ["miniPlayButton", "toggle"],
      ["miniNextButton", "next"]
    ].forEach(function (entry) {
      var element = document.getElementById(entry[0]);
      if (element) {
        element.addEventListener("click", function () {
          void sendPlayerAction(entry[1]);
        });
      }
    });

    ["playerPagePlaybackButton", "playerPageLyricsButton"].forEach(function (id) {
      var element = document.getElementById(id);
      if (!element) {
        return;
      }
      element.addEventListener("click", function () {
        setPlayerSheetPage(element.getAttribute("data-player-page") || "playback");
      });
    });

    document.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      var clickedInsideSearch = !!target.closest(".search-strip");
      if (!clickedInsideSearch && state.searchDropdownOpen) {
        closeSearchDropdown();
      }

      if (target.closest("#closeAudioGuideModalButton")) {
        closeAudioGuideModal();
        return;
      }

      if (target.closest("#closeAudioGuideModalFooterButton")) {
        closeAudioGuideModal();
        return;
      }

      if (target.id === "audioGuideModal") {
        closeAudioGuideModal();
        return;
      }

      if (target.closest("#playerSheetOverlay .player-sheet-backdrop")) {
        closePlayerSheet();
        return;
      }

      if (target.closest("#playerQueueDrawerOverlay .player-queue-drawer-backdrop")) {
        closePlayerQueueDrawer();
        return;
      }

      if (!target.closest(".player-volume-wrap") && state.playerVolumePopoverOpen) {
        closePlayerVolumePopover();
      }

      if (!target.closest(".player-mode-wrap") && state.playerModePopoverOpen) {
        closePlayerModePopover();
      }

      var miniPlayerMain = target.closest(".mini-player-main");
      if (miniPlayerMain) {
        openPlayerSheet();
        return;
      }

      var explorerTarget = findClosestWithAttribute(target, "data-explorer-target");
      var explorerSection = explorerTarget ? explorerTarget.getAttribute("data-explorer-target") : "";
      if (explorerSection) {
        void openLibrarySection(explorerSection);
        return;
      }

      var libraryRefreshTrigger = findClosestWithAttribute(target, "data-library-refresh");
      var libraryRefreshMode = libraryRefreshTrigger ? libraryRefreshTrigger.getAttribute("data-library-refresh") : "";
      if (libraryRefreshMode === "current") {
        void refreshCurrentLibraryView({
          forceReload: true
        });
        return;
      }

      var batchTrigger = findClosestWithAttribute(target, "data-batch-context");
      var batchContext = batchTrigger ? batchTrigger.getAttribute("data-batch-context") : "";
      if (batchContext) {
        void playBatch(
          getBatchSongIds(batchContext),
          batchTrigger && batchTrigger.getAttribute("data-batch-replace") === "true"
        );
        return;
      }

      var tabTarget = findClosestWithAttribute(target, "data-tab");
      var tabId = tabTarget ? tabTarget.getAttribute("data-tab") : "";
      if (tabId) {
        switchView(tabId, {
          preserveScroll: true
        });
        return;
      }

      var songTrigger = findClosestWithAttribute(target, "data-song-id");
      var songId = songTrigger ? songTrigger.getAttribute("data-song-id") : "";
      if (songId) {
        closeSearchDropdown();
        void playSong(songId);
        return;
      }

      var artistTrigger = findClosestWithAttribute(target, "data-artist-name");
      var artistName = artistTrigger ? artistTrigger.getAttribute("data-artist-name") : "";
      if (artistName) {
        void openArtistDetail(artistName);
        return;
      }

      var albumTrigger = findClosestWithAttribute(target, "data-album-name");
      var albumName = albumTrigger ? albumTrigger.getAttribute("data-album-name") : "";
      var albumArtist = albumTrigger ? albumTrigger.getAttribute("data-album-artist") : "";
      if (albumName && albumArtist) {
        void openAlbumDetail(albumArtist, albumName);
        return;
      }

      var playlistTrigger = findClosestWithAttribute(target, "data-playlist-id");
      var playlistId = playlistTrigger ? playlistTrigger.getAttribute("data-playlist-id") : "";
      if (playlistId) {
        void openPlaylistDetail(playlistId);
        return;
      }

      var queueJump = target.getAttribute("data-queue-jump");
      if (queueJump) {
        void sendQueueAction("/queue/jump", {
          position: Number(queueJump)
        });
        return;
      }

      var queueRemove = target.getAttribute("data-queue-remove");
      if (queueRemove) {
        void sendQueueAction("/queue/remove", {
          position: Number(queueRemove)
        });
        return;
      }

      var queueItem = target.closest(".queue-item");
      if (queueItem && window.innerWidth <= 768 && !target.closest(".inline-action")) {
        var wasOpen = queueItem.classList.contains("show-actions");
        document.querySelectorAll(".queue-item.show-actions").forEach(function(item) {
          item.classList.remove("show-actions");
        });
        if (!wasOpen) {
          queueItem.classList.add("show-actions");
        }
      }
    });

    ["pointerdown", "touchstart"].forEach(function (eventName) {
      document.addEventListener(eventName, function (event) {
        var target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        if (state.playerVolumePopoverOpen && !target.closest(".player-volume-wrap")) {
          closePlayerVolumePopover();
        }
        if (window.innerWidth <= 768 && !target.closest(".queue-item")) {
          document.querySelectorAll(".queue-item.show-actions").forEach(function(item) {
            item.classList.remove("show-actions");
          });
        }
      });
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stopRealtimeUpdates();
        return;
      }
      resumeRealtimeUpdates();
      void refreshCoreState(true);
      if (isSettingsViewActive()) {
        void refreshSettingsState(true);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closePlayerQueueDrawer();
        closePlayerVolumePopover();
        closePlayerSheet();
        closeSearchDropdown();
        closeAudioGuideModal();
      }
    });

window.addEventListener("pagehide", function () {
       stopRealtimeUpdates();
       // 清理事件监听器，避免内存泄漏
       cleanupEventListeners();
       // 清空DOM缓存
       clearDOMCache();
     });

     // 初始化图片懒加载
     setupLazyLoading();
   }

/* ==================== 事件处理和轮询管理 ==================== */

  /**
   * 启动播放器状态轮询
   * 根据播放状态动态调整轮询频率
   */
  function startPlayerPolling() {
    if (document.hidden) {
      return;
    }
    if (state.playerPollTimer) {
      window.clearTimeout(state.playerPollTimer);
    }

    state.playerPollTimer = window.setTimeout(function () {
      state.playerPollTimer = 0;
      void refreshCoreState(false).finally(function () {
        if (isSettingsViewActive()) {
          void refreshSettingsState(false);
        }
        startPlayerPolling();
      });
}, getPlayerPollIntervalMs());
  }

  /**
   * 启动进度条定时器
   * 每秒更新一次播放进度UI
   */
  function startProgressTicker() {
    if (document.hidden) {
      return;
    }
    if (state.progressTickTimer) {
      window.clearInterval(state.progressTickTimer);
    }
    state.progressTickTimer = window.setInterval(function () {
      syncPlayerProgressUI();
    }, 250);
  }

  /**
   * 应用启动函数
   * 初始化所有组件和状态
   */
  async function start() {
    // 同步用户偏好设置
    syncAudioGuideReminderPreference();
    restoreCachedQueueState();

    // 绑定事件监听器
    bindEvents();
    updateBluetoothTemplateOutputs();
    applyAudioScenarioPreset("bluetooth");

    // 初始化UI
    switchView("home", {
      skipCache: true
    });
    renderLibraryWelcome();

    // 并行加载初始数据
    await Promise.all([
      loadBootstrap(),
      loadHomeData(false),
      refreshCoreState(true),
      refreshSettingsState(false)
    ]);
    startPlayerPolling();
    startProgressTicker();
  }

  window.__songloftCloseAudioGuideModal = closeAudioGuideModal;

  void start().catch(function (error) {
    window.__SONGLOFT_MPD_APP_BOOTED__ = false;
updateText("serviceStatus", "服务状态: 前端启动失败");
    updateText("trackMeta", String(error));
    console.error("Songloft MPD app start failed:", error);
  });

  // ===== 新增：Toast 消息系统 =====
  var ToastManager = (function() {
    var container = null;
    var toasts = [];

    function createContainer() {
      if (container) {
        return;
      }
      container = document.createElement("div");
      container.id = "toastContainer";
      container.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none;";
      document.body.appendChild(container);
    }

    function show(message, type) {
      if (type === void 0) {
        type = "info";
      }
      createContainer();

      var colors = {
        info: "#1f7aff",
        success: "#52c41a",
        warning: "#faad14",
        error: "#f5222d"
      };

      var toast = document.createElement("div");
      toast.className = "toast toast-" + type;
      toast.textContent = message;
      toast.style.cssText = "padding:12px 24px;border-radius:8px;background:" + colors[type] + ";color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:14px;opacity:0;transform:translateY(-20px);transition:all 0.3s ease;pointer-events:auto;max-width:80vw;";

      container.appendChild(toast);

      requestAnimationFrame(function() {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
      });

      var duration = type === "error" ? 4000 : 3000;

      setTimeout(function() {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-20px)";
        setTimeout(function() {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        }, 300);
      }, duration);

      return toast;
    }

    return {
      show: show,
      info: function(message) {
        return show(message, "info");
      },
      success: function(message) {
        return show(message, "success");
      },
      warning: function(message) {
        return show(message, "warning");
      },
      error: function(message) {
        return show(message, "error");
      }
    };
  })();

  window.showToast = ToastManager.show;

  // ===== 新增：加载状态管理器 =====
  var LoadingManager = (function() {
    var overlay = null;
    var isLoading = false;

    function createOverlay() {
      if (overlay) {
        return;
      }
      overlay = document.createElement("div");
      overlay.id = "globalLoadingOverlay";
      overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10000;opacity:0;pointer-events:none;transition:opacity 0.3s ease;";
      overlay.innerHTML = '<div class="loading-spinner"></div><div class="loading-text">加载中...</div>';
      document.body.appendChild(container);
    }

    function show(message) {
      if (message === void 0) {
        message = "加载中...";
      }
      createOverlay();
      var textElement = overlay.querySelector(".loading-text");
      if (textElement) {
        textElement.textContent = message;
      }
      overlay.style.opacity = "1";
      overlay.style.pointerEvents = "auto";
      isLoading = true;
    }

    function hide() {
      if (overlay) {
        overlay.style.opacity = "0";
        overlay.style.pointerEvents = "none";
      }
      isLoading = false;
    }

    return {
      show: show,
      hide: hide,
      isLoading: function() {
        return isLoading;
      }
    };
  })();

  // ===== 新增：空状态组件 =====
  function renderEmptyState(type) {
    if (type === void 0) {
      type = "default";
    }

    var emptyStates = {
      queue: {
        icon: "🎵",
        title: "播放列表为空",
        description: "去添加一些歌曲开始播放吧"
      },
      playlists: {
        icon: "📝",
        title: "暂无播放列表",
        description: "创建你的第一个播放列表"
      },
      search: {
        icon: "🔍",
        title: "没有找到结果",
        description: "试试其他关键词"
      },
      default: {
        icon: "📭",
        title: "暂无内容",
        description: "这里什么都没有"
      }
    };

    var state = emptyStates[type] || emptyStates.default;

    return '<div class="empty-state">' +
      '<div class="empty-state-icon">' + state.icon + '</div>' +
      '<h3 class="empty-state-title">' + state.title + '</h3>' +
      '<p class="empty-state-description">' + state.description + '</p>' +
      '</div>';
  }

  // ===== 新增：改进的进度更新器 =====
  function createProgressUpdater() {
    var timer = null;
    var lastUpdateTime = 0;
    var isPlaying = false;
    var updateInterval = 1000;

    function detectDeviceType() {
      var ua = navigator.userAgent;
      return /iPhone|iPad|iPod|Android/i.test(ua);
    }

    function isLowPowerMode() {
      if (navigator.getBattery) {
        return navigator.getBattery().then(function(battery) {
          return battery.level < 0.2;
        });
      }
      return Promise.resolve(false);
    }

    function adjustInterval() {
      if (!isPlaying) {
        updateInterval = 5000;
        return;
      }

      var isMobile = detectDeviceType();
      isLowPowerMode().then(function(lowPower) {
        if (lowPower) {
          updateInterval = 3000;
        } else if (isMobile) {
          updateInterval = 1500;
        } else {
          updateInterval = 1000;
        }
      });
    }

    function start(updateCallback) {
      isPlaying = true;
      adjustInterval();
      scheduleUpdate(updateCallback);
    }

    function stop() {
      isPlaying = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function scheduleUpdate(updateCallback) {
      if (!isPlaying) return;

      var now = Date.now();
      var timeSinceLastUpdate = now - lastUpdateTime;

      if (timeSinceLastUpdate >= updateInterval) {
        lastUpdateTime = now;
        updateCallback();
      }

      requestAnimationFrame(function() {
        scheduleUpdate(updateCallback);
      });
    }

    return {
      start: start,
      stop: stop,
      setPlayingState: function(playing) {
        isPlaying = playing;
        adjustInterval();
      }
    };
  }

  // 创建全局进度更新器实例
  window.__progressUpdater = createProgressUpdater();

  // ===== 全局错误处理 =====
  window.addEventListener("error", function(event) {
    console.error("全局错误:", event.error);
    if (window.showToast) {
      window.showToast("发生错误，请刷新页面重试", "error");
    }
  });

  window.addEventListener("unhandledrejection", function(event) {
    console.error("未处理的 Promise 错误:", event.reason);
    if (window.showToast) {
      window.showToast("网络请求失败，请检查连接", "error");
    }
  });

})();
