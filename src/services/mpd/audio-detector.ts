/**
 * 优化的音频检测模块
 * 减少检测频率，提高性能，避免蓝牙设备冲突
 */

import type { SongloftCommandApi, MpdAudioOutputDetection, AudioPreferencePayload } from "./types";
import { readAudioPreferences, readUserId, detectSupportedAudioOutputTypes } from "./mpd-core";
import { readEnvVar, tryExec, execShell } from "./mpd-core";

const AUDIO_DETECTION_CACHE_TTL = 300000; // 5分钟缓存

interface CachedDetection {
  data: MpdAudioOutputDetection;
  timestamp: number;
}

class OptimizedAudioDetector {
  private cache: Map<string, CachedDetection> = new Map();

  async detect(songloft: SongloftCommandApi): Promise<MpdAudioOutputDetection> {
    const cacheKey = "audio_detection";
    const cached = this.cache.get(cacheKey);

    // 使用缓存
    if (cached && (Date.now() - cached.timestamp) < AUDIO_DETECTION_CACHE_TTL) {
      songloft.log.info("Using cached audio detection result");
      return cached.data;
    }

    songloft.log.info("Performing optimized audio detection...");

    // 执行优化的检测
    const result = await this.performOptimizedDetection(songloft);

    // 缓存结果
    this.cache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    return result;
  }

  private async performOptimizedDetection(songloft: SongloftCommandApi): Promise<MpdAudioOutputDetection> {
    // 分阶段检测，减少系统负载
    const stage1 = await this.collectBasicInfo(songloft);
    const stage2 = await this.collectAudioInfo(songloft, stage1);

    return this.combineResults(songloft, stage1, stage2);
  }

  private async collectBasicInfo(songloft: SongloftCommandApi) {
    const [supportInfo, storedPreferences, xdgRuntimeDir, pulseServer, pipewireRemote] = await Promise.all([
      detectSupportedAudioOutputTypes(songloft),
      readAudioPreferences(songloft),
      readEnvVar(songloft, "XDG_RUNTIME_DIR"),
      readEnvVar(songloft, "PULSE_SERVER"),
      readEnvVar(songloft, "PIPEWIRE_REMOTE")
    ]);

    return {
      supportInfo,
      storedPreferences,
      xdgRuntimeDir,
      pulseServer,
      pipewireRemote
    };
  }

  private async collectAudioInfo(songloft: SongloftCommandApi, basicInfo: any) {
    const userId = await readUserId(songloft);

    // 根据用户配置决定检测哪些音频系统
    const detectionTasks: Promise<any>[] = [];

    // 只检测必要的音频系统
    if (basicInfo.storedPreferences.outputType === "pulse" || basicInfo.storedPreferences.outputType === "auto") {
      detectionTasks.push(this.detectPulseAudio(songloft));
    }

    if (basicInfo.storedPreferences.outputType === "alsa" || basicInfo.storedPreferences.outputType === "auto") {
      detectionTasks.push(this.detectAlsa(songloft));
    }

    if (basicInfo.storedPreferences.outputType === "pipewire") {
      detectionTasks.push(this.detectPipeWire(songloft));
    }

    // 如果没有明确配置，执行基本检测
    if (detectionTasks.length === 0) {
      detectionTasks.push(this.detectPulseAudio(songloft));
      detectionTasks.push(this.detectAlsa(songloft));
    }

    const results = await Promise.allSettled(detectionTasks);

    return {
      userId,
      pulse: results[0]?.status === "fulfilled" ? results[0].value : null,
      alsa: results[1]?.status === "fulfilled" ? results[1].value : null
    };
  }

  private async detectPulseAudio(songloft: SongloftCommandApi) {
    try {
      const pactlInfo = await tryExec(songloft, "pactl", ["info"]);

      if (pactlInfo?.exitCode === 0) {
        const defaultSink = pactlInfo.stdout?.match(/Default Sink: (.+)/)?.[1];
        return {
          available: true,
          defaultSink: defaultSink || "unknown"
        };
      }

      return { available: false };
    } catch (error) {
      return { available: false };
    }
  }

  private async detectAlsa(songloft: SongloftCommandApi) {
    try {
      const aplayList = await tryExec(songloft, "aplay", ["-l"]);

      if (aplayList?.exitCode === 0) {
        const devices = this.parseAplayDevices(aplayList.stdout || "");
        return {
          available: devices.length > 0,
          devices: devices.slice(0, 3) // 只取前3个设备
        };
      }

      return { available: false };
    } catch (error) {
      return { available: false };
    }
  }

  private async detectPipeWire(songloft: SongloftCommandApi) {
    try {
      const pwInfo = await tryExec(songloft, "pw-cli", ["info"]);

      return {
        available: pwInfo?.exitCode === 0
      };
    } catch (error) {
      return { available: false };
    }
  }

  private parseAplayDevices(output: string): Array<{ card: number; device: number; name: string }> {
    const devices: Array<{ card: number; device: number; name: string }> = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/card (\d+): ([^[]+) \[.*?\], device (\d+):/);
      if (match) {
        devices.push({
          card: parseInt(match[1]),
          device: parseInt(match[3]),
          name: match[2].trim()
        });
      }
    }

    return devices;
  }

  private combineResults(
    songloft: SongloftCommandApi,
    stage1: any,
    stage2: any
  ): MpdAudioOutputDetection {
    const notes: string[] = [];
    const candidates: any[] = [];
    const env: Record<string, string> = {};

    // PulseAudio
    if (stage2.pulse?.available) {
      candidates.push({
        type: "pulse",
        name: "PulseAudio Output",
        priority: 100,
        available: true
      });

      if (stage1.pulseServer) {
        env.PULSE_SERVER = stage1.pulseServer;
        notes.push(`PulseAudio 可用，服务器: ${stage1.pulseServer}`);
      }
    }

    // ALSA
    if (stage2.alsa?.available && stage2.alsa.devices.length > 0) {
      stage2.alsa.devices.forEach((device: any, index: number) => {
        candidates.push({
          type: "alsa",
          name: `ALSA Device ${index + 1}: ${device.name}`,
          priority: 80 - index * 10,
          available: true,
          device: `hw:${device.card},${device.device}`
        });
      });

      notes.push(`ALSA 可用，检测到 ${stage2.alsa.devices.length} 个设备`);
    }

    // 按优先级排序
    candidates.sort((a, b) => b.priority - a.priority);

    return {
      preferences: stage1.storedPreferences,
      guidance: {
        outputType: stage1.storedPreferences.outputType || "auto",
        socketPath: "",
        notes
      },
      candidates,
      env
    } as any;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// 导出单例实例
export const audioDetector = new OptimizedAudioDetector();

// 保持向后兼容的函数
export async function detectAudioOutput(songloft: SongloftCommandApi): Promise<MpdAudioOutputDetection> {
  return await audioDetector.detect(songloft);
}