import { open, save } from "@tauri-apps/plugin-dialog";
import { Command, type Child } from "@tauri-apps/plugin-shell";

export type NativeProgress = {
  percent: number;
  fps?: string;
  speed?: number;
  currentSeconds?: number;
  durationSeconds?: number;
  elapsedSeconds?: number;
  etaSeconds?: number;
  outputBytes?: number;
  outputMegabytes?: number;
  message?: string;
};

export type NativeResult = {
  elapsedSeconds: number;
  outputBytes: number;
  durationSeconds: number | null;
  speed: number | null;
};

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || "video";
}

function outputName(input: string): string {
  const name = basename(input).replace(/\.[^/.]*$/, "");
  return `${name}_TV1080P.mp4`;
}

const LAST_INPUT_DIR_KEY = "tv1080p-last-input-dir";
const LAST_OUTPUT_DIR_KEY = "tv1080p-last-output-dir";

function dirname(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const index = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return index > 0 ? normalized.slice(0, index) : normalized;
}

function getStoredDirectory(key: string): string | undefined {
  try {
    const value = localStorage.getItem(key);
    return value || undefined;
  } catch {
    return undefined;
  }
}

function storeDirectory(key: string, path: string): void {
  try {
    localStorage.setItem(key, path);
  } catch {
    // Persistência é apenas uma melhoria de UX; não deve impedir a conversão.
  }
}

function parseDuration(line: string): number | null {
  const m = line.match(/Duration:\\s*(\\d+):(\\d+):(\\d+(?:\\.\\d+)?)/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function parseTime(line: string): number | null {
  const m = line.match(/out_time_ms=(\\d+)/);
  if (m) return Number(m[1]) / 1_000_000;
  const t = line.match(/time=\\s*(\\d+):(\\d+):(\\d+(?:\\.\\d+)?)/);
  if (!t) return null;
  return Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]);
}

function parseSpeed(line: string): number | null {
  const m = line.match(/speed=\\s*([\\d.]+)x/);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function getNativeFileSize(path: string): Promise<number> {
  try {
    const result = await import("@tauri-apps/api/core");
    const bytes = await result.invoke<number>("file_size", { path });
    return Number(bytes) || 0;
  } catch {
    return 0;
  }
}

export async function pickNativeVideo(): Promise<{ path: string; name: string; sizeBytes: number } | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    defaultPath: getStoredDirectory(LAST_INPUT_DIR_KEY),
    filters: [{ name: "Vídeos", extensions: ["mp4", "mov", "mkv", "avi", "webm", "m4v"] }],
  });
  if (!selected || Array.isArray(selected)) return null;

  storeDirectory(LAST_INPUT_DIR_KEY, dirname(selected));
  return {
    path: selected,
    name: basename(selected),
    sizeBytes: await getNativeFileSize(selected),
  };
}

export async function chooseNativeOutput(inputPath: string): Promise<string | null> {
  const selected = await save({
    defaultPath: getStoredDirectory(LAST_OUTPUT_DIR_KEY) ?? outputName(inputPath),
    filters: [{ name: "MP4", extensions: ["mp4"] }],
  });

  if (selected) storeDirectory(LAST_OUTPUT_DIR_KEY, dirname(selected));
  return selected;
}

export async function convertNative(
  inputPath: string,
  outputPath: string,
  onProgress?: (progress: NativeProgress) => void,
): Promise<{ child: Child; done: Promise<NativeResult> }> {
  let duration: number | null = null;
  let lastFps = "";
  let lastSpeed: number | null = null;
  const startedAt = performance.now();

  const emit = async (p: Omit<NativeProgress, "outputBytes" | "outputMegabytes">) => {
    const outputBytes = await getNativeFileSize(outputPath);
    onProgress?.({
      ...p,
      outputBytes,
      outputMegabytes: outputBytes / (1024 * 1024),
    });
  };

  const command = Command.sidecar("binaries/ffmpeg", [
    "-y", "-nostdin", "-i", inputPath,
    "-vf", "transpose=1,scale=1920:1080",
    "-c:v", "libx264", "-profile:v", "high", "-level:v", "4.0",
    "-pix_fmt", "yuv420p", "-x264-params", "ref=1:bframes=2",
    "-r", "30", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart",
    "-progress", "pipe:1", "-nostats",
    outputPath,
  ]);

  const done = new Promise<NativeResult>((resolve, reject) => {
    command.stderr.on("data", (chunk) => {
      const text = String(chunk);
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        duration ??= parseDuration(line);
        const fps = line.match(/fps=\\s*([\\d.]+)/)?.[1];
        if (fps) lastFps = fps;
        void emit({
          percent: 0,
          fps: lastFps || undefined,
          durationSeconds: duration ?? undefined,
          elapsedSeconds: (performance.now() - startedAt) / 1000,
          message: line.trim(),
        });
      }
    });

    command.stdout.on("data", (chunk) => {
      const text = String(chunk);
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        duration ??= parseDuration(line);
        const current = parseTime(line);
        const speed = parseSpeed(line);
        if (speed != null) lastSpeed = speed;
        if (current == null) continue;

        const elapsedSeconds = (performance.now() - startedAt) / 1000;
        const pct = duration
          ? Math.min(99, Math.max(0, Math.round((current / duration) * 100)))
          : 0;
        const etaSeconds = lastSpeed && duration
          ? Math.max(0, (duration - current) / lastSpeed)
          : pct > 0
            ? Math.max(0, elapsedSeconds * (100 - pct) / pct)
            : undefined;

        const fps = line.match(/fps=\\s*([\\d.]+)/)?.[1];
        if (fps) lastFps = fps;

        void emit({
          percent: pct,
          fps: lastFps || undefined,
          speed: lastSpeed ?? undefined,
          currentSeconds: current,
          durationSeconds: duration ?? undefined,
          elapsedSeconds,
          etaSeconds,
        });
      }
    });

    command.on("error", (error) => reject(new Error(String(error))));
    command.on("close", async (event) => {
      if (event.code === 0) {
        const elapsedSeconds = (performance.now() - startedAt) / 1000;
        const outputBytes = await getNativeFileSize(outputPath);
        onProgress?.({
          percent: 100,
          fps: lastFps || undefined,
          speed: lastSpeed ?? undefined,
          currentSeconds: duration ?? undefined,
          durationSeconds: duration ?? undefined,
          elapsedSeconds,
          etaSeconds: 0,
          outputBytes,
          outputMegabytes: outputBytes / (1024 * 1024),
        });
        resolve({
          elapsedSeconds,
          outputBytes,
          durationSeconds: duration,
          speed: lastSpeed,
        });
      } else {
        reject(new Error(`FFmpeg terminou com código ${event.code ?? "desconhecido"}.`));
      }
    });
  });

  const child = await command.spawn();
  return { child, done };
}
