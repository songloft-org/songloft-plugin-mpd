/**
 * 错误处理工具模块
 * 提供统一的错误处理和响应格式化功能
 */

import type { ApiResponse, ApiError, SongloftCommandApi } from "./types";
import { API_CODES, ERROR_MESSAGES, LOG_LEVELS } from "./constants";

/**
 * 自定义错误类
 */
export class PluginError extends Error {
  constructor(
    message: string,
    public code: number = API_CODES.INTERNAL_ERROR,
    public details?: unknown
  ) {
    super(message);
    this.name = "PluginError";
  }
}

/**
 * 参数验证错误
 */
export class ValidationError extends PluginError {
  constructor(message: string, public field?: string) {
    super(message, API_CODES.BAD_REQUEST);
    this.name = "ValidationError";
  }
}

/**
 * 资源未找到错误
 */
export class NotFoundError extends PluginError {
  constructor(resource: string) {
    super(`${resource} 不存在`, API_CODES.NOT_FOUND);
    this.name = "NotFoundError";
  }
}

/**
 * 操作超时错误
 */
export class TimeoutError extends PluginError {
  constructor(operation: string) {
    super(`${operation} 超时`, API_CODES.SERVICE_UNAVAILABLE);
    this.name = "TimeoutError";
  }
}

/**
 * 安全执行异步操作，失败时返回默认值
 * 
 * @param operation - 要执行的异步操作
 * @param fallback - 失败时的默认返回值
 * @param errorMessage - 错误消息前缀
 * @param songloft - Songloft API 实例（用于记录日志）
 * @returns 操作结果或默认值
 * 
 * @example
 * const result = await safeExecute(
 *   () => fetchSomeData(),
 *   null,
 *   "获取数据",
 *   songloft
 * );
 */
export async function safeExecute<T>(
  operation: () => Promise<T>,
  fallback: T,
  errorMessage: string,
  songloft?: SongloftCommandApi
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const fullMessage = `${errorMessage}: ${String(error)}`;
    if (songloft) {
      songloft.log.warn(fullMessage);
    }
    return fallback;
  }
}

/**
 * 包装异步函数，使其在失败时不会抛出异常
 * 
 * @param fn - 异步函数
 * @param songloft - Songloft API 实例（用于记录日志）
 * @returns 包装后的函数，总是返回 Promise，不会抛出异常
 * 
 * @example
 * const safeFetch = safeWrap(fetch, songloft);
 * const result = await safeFetch(url); // 不会抛出异常
 */
export function safeWrap<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  songloft?: SongloftCommandApi
): (...args: Parameters<T>) => Promise<ReturnType<T> | null> {
  return async (...args: Parameters<T>): Promise<ReturnType<T> | null> => {
    try {
      return await fn(...args);
    } catch (error) {
      const fnName = fn.name || "anonymous function";
      const errorMessage = `${fnName} 执行失败: ${String(error)}`;
      if (songloft) {
        songloft.log.warn(errorMessage);
      }
      return null as ReturnType<T> | null;
    }
  };
}

/**
 * 标准化错误对象
 * 
 * @param error - 错误对象
 * @param context - 错误上下文信息
 * @returns 标准化的错误对象
 */
export function normalizeError(
  error: unknown,
  context?: string
): { message: string; code: number; details?: unknown } {
  if (error instanceof PluginError) {
    return {
      message: error.message,
      code: error.code,
      details: error.details
    };
  }

  if (error instanceof Error) {
    return {
      message: context ? `${context}: ${error.message}` : error.message,
      code: API_CODES.INTERNAL_ERROR,
      details: error.stack
    };
  }

  return {
    message: context || String(error),
    code: API_CODES.INTERNAL_ERROR,
    details: error
  };
}

/**
 * 创建成功响应
 * 
 * @param data - 响应数据
 * @returns 标准化的成功响应
 */
export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    code: API_CODES.SUCCESS,
    message: "ok",
    data,
    timestamp: new Date().toISOString()
  };
}

/**
 * 创建错误响应
 * 
 * @param error - 错误对象或错误消息
 * @param code - 错误码
 * @param details - 错误详情
 * @returns 标准化的错误响应
 */
export function createErrorResponse(
  error: string | Error | PluginError,
  code: number = API_CODES.INTERNAL_ERROR,
  details?: unknown
): ApiError {
  let message: string;
  let actualCode: number = code;
  let actualDetails: unknown = details;

  if (error instanceof PluginError) {
    message = error.message;
    actualCode = error.code;
    actualDetails = error.details;
  } else if (error instanceof Error) {
    message = error.message;
    actualDetails = error.stack;
  } else {
    message = String(error);
  }

  return {
    code: actualCode,
    message,
    details: actualDetails,
    timestamp: new Date().toISOString()
  };
}

/**
 * 参数验证工具
 * 
 * @param params - 参数对象
 * @param schema - 验证规则
 * @throws ValidationError 当验证失败时
 * 
 * @example
 * validateParams(
 *   { songId: "123", name: "test" },
 *   {
 *     songId: (val) => !isNaN(parseInt(val)),
 *     name: (val) => typeof val === "string" && val.length > 0
 *   }
 * );
 */
export function validateParams<T extends Record<string, unknown>>(
  params: T,
  schema: Record<keyof T, (value: unknown) => boolean>
): void {
  for (const [key, validator] of Object.entries(schema)) {
    if (!validator(params[key])) {
      throw new ValidationError(`参数 ${String(key)} 无效`, String(key));
    }
  }
}

/**
 * 批量验证参数
 * 
 * @param paramsArray - 参数数组
 * @param schema - 验证规则
 * @returns 验证失败的参数索引数组
 * 
 * @example
 * const failedIndices = validateBatchParams(
 *   [{ songId: "123" }, { songId: "invalid" }],
 *   { songId: (val) => !isNaN(parseInt(val)) }
 * );
 */
export function validateBatchParams<T extends Record<string, unknown>>(
  paramsArray: T[],
  schema: Record<keyof T, (value: unknown) => boolean>
): number[] {
  const failedIndices: number[] = [];
  
  for (let i = 0; i < paramsArray.length; i++) {
    try {
      validateParams(paramsArray[i], schema);
    } catch (error) {
      if (error instanceof ValidationError) {
        failedIndices.push(i);
      }
    }
  }
  
  return failedIndices;
}

/**
 * 重试机制
 * 
 * @param operation - 要执行的操作
 * @param maxRetries - 最大重试次数
 * @param delayMs - 重试间隔（毫秒）
 * @param backoff - 是否使用指数退避
 * @returns 操作结果
 * 
 * @example
 * const result = await retryOperation(
 *   () => fetchWithTimeout(url),
 *   3,
 *   1000,
 *   true
 * );
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
  backoff: boolean = false
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        const currentDelay = backoff ? delayMs * Math.pow(2, attempt) : delayMs;
        await new Promise(resolve => setTimeout(resolve, currentDelay));
      }
    }
  }
  
  throw lastError;
}

/**
 * 超时包装器
 *
 * @param promise - 要执行的 Promise
 * @param timeoutMs - 超时时间（毫秒）
 * @param timeoutMessage - 超时错误消息
 * @returns 带 timeout 的 Promise
 *
 * @example
 * const result = await withTimeout(
 *   fetch(url),
 *   10000,
 *   "获取数据超时"
 * );
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string = "操作超时"
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new TimeoutError(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * 错误消息映射表
 * 将技术错误消息翻译为用户友好的中文提示
 */
const ERROR_MESSAGE_MAP: Record<string, string> = {
  // MPD 相关错误
  "MPD not running": "MPD 服务未运行，请先启动服务",
  "Connection refused": "无法连接到 MPD 服务",
  "MPD connection failed": "MPD 连接失败，请检查服务状态",
  "MPD not responding": "MPD 服务无响应，请稍后重试",

  // 文件相关错误
  "File not found": "文件未找到",
  "ENOENT": "文件或目录不存在",
  "Permission denied": "权限不足，无法访问",
  "EACCES": "权限不足",

  // 网络相关错误
  "Network error": "网络连接错误",
  "ETIMEDOUT": "连接超时，请检查网络",
  "ENOTFOUND": "无法解析主机名",
  "ECONNREFUSED": "连接被拒绝",

  // 数据相关错误
  "Invalid data": "数据格式错误",
  "Parse error": "数据解析失败",
  "Validation failed": "数据验证失败",

  // 操作相关错误
  "Operation failed": "操作失败，请稍后重试",
  "Command failed": "命令执行失败",
  "Service unavailable": "服务暂时不可用"
};

/**
 * 格式化用户友好的错误消息
 *
 * @param error - 错误对象或错误消息
 * @param context - 错误上下文（操作名称）
 * @returns 用户友好的错误消息
 */
export function formatUserFriendlyError(
  error: unknown,
  context: string = "操作"
): string {
  // 处理已知的错误类型
  if (error instanceof ValidationError) {
    return `参数错误: ${error.message}`;
  }

  if (error instanceof NotFoundError) {
    return error.message;
  }

  if (error instanceof TimeoutError) {
    return `${context}超时，请稍后重试`;
  }

  if (error instanceof PluginError) {
    return error.message;
  }

  // 处理普通 Error 对象
  if (error instanceof Error) {
    const errorMsg = error.message;

    // 查找匹配的错误消息
    for (const [pattern, friendlyMsg] of Object.entries(ERROR_MESSAGE_MAP)) {
      if (errorMsg.includes(pattern)) {
        return friendlyMsg;
      }
    }

    // 默认返回原始消息
    return `${context}失败: ${errorMsg}`;
  }

  // 处理字符串错误
  const strError = String(error);
  for (const [pattern, friendlyMsg] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (strError.includes(pattern)) {
      return friendlyMsg;
    }
  }

  // 默认消息
  return `${context}失败，请稍后重试`;
}

/**
 * 创建用户友好的错误响应
 *
 * @param error - 错误对象或错误消息
 * @param context - 错误上下文（操作名称）
 * @param code - 错误码（可选）
 * @returns 用户友好的错误响应
 */
export function createUserFriendlyErrorResponse(
  error: unknown,
  context: string = "操作",
  code?: number
): ApiError {
  const friendlyMessage = formatUserFriendlyError(error, context);
  const actualCode = code ?? (error instanceof PluginError ? error.code : API_CODES.INTERNAL_ERROR);

  return createErrorResponse(friendlyMessage, actualCode);
}

/**
 * 包装 API 请求，自动处理错误并返回用户友好的响应
 *
 * @param operation - 要执行的操作
 * @param context - 操作上下文（用于错误消息）
 * @returns 操作结果或错误响应
 *
 * @example
 * const result = await handleApiRequest(
 *   () => startManagedMpd(songloft),
 *   "启动 MPD 服务"
 * );
 */
export async function handleApiRequest<T>(
  operation: () => Promise<T>,
  context: string = "操作"
): Promise<{ success: boolean; data?: T; error?: ApiError }> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    const friendlyError = createUserFriendlyErrorResponse(error, context);
    return { success: false, error: friendlyError };
  }
}