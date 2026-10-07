import { convertFileSrc } from "@tauri-apps/api/core";
import {
  chooseNativeOutput,
  convertNative,
  isTauri,
  pickNativeVideo,
} from "./native";
import type { NativeProgress } from "./native";

export type RuntimeInput = {
  name: string;
  sizeBytes: number;
  path?: string;
  file?: File;
};

export type RuntimeProgress = {
  percent: number;
  fps?: string;
  speed?: number;
  currentSeconds?: number;
  durationSeconds?: number;
  elapsedSeconds?: number;
  etaSeconds?: number;
  outputMegabytes?: number;
};

export type RuntimeResult = {
  outputBytes: number;
  elapsedSeconds: number;
  durationSeconds: number | null;
  speed: number | null;
  previewUrl: string;
  outputPath?: string;
  fileName: string;
  blob?: Blob;
};

export type Runtime = "desktop" | "web";

export function getRuntime(): Runtime {
  return isTauri() ? "desktop" : "web";
}

export function runtimeLabel(): string {
  return getRuntime() === "desktop" ? "FFmpeg nativo" : "FFmpeg.wasm";
}

function nativeProgress(p: NativeProgress, onProgress?: (p: RuntimeProgress) => void) {
  onProgress?.({
    percent: p.percent,
    fps: p.fps,
    speed: p.speed,
    currentSeconds: p.currentSeconds,
    durationSeconds: p.durationSeconds,
    elapsedSeconds: p.elapsedSeconds,
    etaSeconds: p.etaSeconds,
    outputMegabytes: p.outputMegabytes,
  });
}

export async function pickInput(): Promise<RuntimeInput | null> {
  if (getRuntime() === "desktop") {
    const selected = await pickNativeVideo();
    if (!selected) return null;
    return selected;
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi";
    input.style.display = "none";

    const cleanup = () => {
      input.remove();
    };

    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }
      resolve({
        name: file.name,
        sizeBytes: file.size,
        file,
      });
    }, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}

async function getVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.remove();
      resolve(value);
    };

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      finish(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => finish(null);
    window.setTimeout(() => finish(null), 5000);
    video.src = url;
  });
}

export async function convertInput(
  input: RuntimeInput,
  onProgress?: (p: RuntimeProgress) => void,
): Promise<RuntimeResult> {
  if (getRuntime() === "desktop") {
    if (!input.path) throw new Error("Caminho do vídeo não disponível.");

    const outputPath = await chooseNativeOutput(input.path);
    if (!outputPath) throw new Error("Conversão cancelada.");

    const { done } = await convertNative(
      input.path,
      outputPath,
      (p) => nativeProgress(p, onProgress),
    );
    const result = await done;

    return {
      outputBytes: result.outputBytes,
      elapsedSeconds: result.elapsedSeconds,
      durationSeconds: result.durationSeconds,
      speed: result.speed,
      previewUrl: convertFileSrc(outputPath),
      outputPath,
      fileName: outputPath.split(/[\\/]/).pop() || "video_TV1080P.mp4",
    };
  }

  if (!input.file) throw new Error("Arquivo de entrada não disponível.");

  const { convertVideoForTV1080p } = await import("./ffmpeg");
  const durationSeconds = await getVideoDuration(input.file);
  const startedAt = performance.now();
  let lastSpeed: number | null = null;
  let estimatedMegabytes = 0;

  const blob = await convertVideoForTV1080p(input.file, {
    onProgress: (percent) => {
      const elapsedSeconds = (performance.now() - startedAt) / 1000;
      if (durationSeconds && elapsedSeconds > 0) {
        lastSpeed = durationSeconds / elapsedSeconds;
      }
      onProgress?.({
        percent,
        speed: lastSpeed ?? undefined,
        durationSeconds: durationSeconds ?? undefined,
        elapsedSeconds,
        outputMegabytes: estimatedMegabytes || undefined,
      });
    },
    onLog: (message) => {
      const fps = message.match(/fps=\s*([\d.]+)/)?.[1];
      const bitrate = message.match(/bitrate=\s*([\d.]+)kbits\/s/i)?.[1];
      const time = message.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);

      let currentSeconds: number | undefined;
      if (time) {
        currentSeconds =
          Number(time[1]) * 3600 +
          Number(time[2]) * 60 +
          Number(time[3]);
      }

      if (bitrate && currentSeconds != null) {
        estimatedMegabytes =
          (Number(bitrate) * 1000 * currentSeconds) / 8 / (1024 * 1024);
      }

      if (fps || currentSeconds != null || bitrate) {
        const elapsedSeconds = (performance.now() - startedAt) / 1000;
        const speed =
          durationSeconds && elapsedSeconds > 0
            ? durationSeconds / elapsedSeconds
            : undefined;

        onProgress?.({
          percent: currentSeconds != null && durationSeconds
            ? Math.min(97, Math.round((currentSeconds / durationSeconds) * 100))
            : 0,
          fps,
          speed,
          currentSeconds,
          durationSeconds: durationSeconds ?? undefined,
          elapsedSeconds,
          outputMegabytes: estimatedMegabytes || undefined,
        });
      }
    },
  });

  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  const speed = durationSeconds && elapsedSeconds > 0
    ? durationSeconds / elapsedSeconds
    : null;

  return {
    outputBytes: blob.size,
    elapsedSeconds,
    durationSeconds,
    speed,
    previewUrl: URL.createObjectURL(blob),
    blob,
    fileName: input.name.replace(/\.[^/.]*$/, "") + "_TV1080P.mp4",
  };
}

export function downloadWebResult(result: RuntimeResult): void {
  if (!result.blob) return;
  const url = result.previewUrl;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
