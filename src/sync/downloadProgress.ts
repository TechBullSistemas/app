import type { DownloadProgress } from '@/stores/sync';

export function downloadPercent(progress: DownloadProgress | null): number {
  if (!progress || progress.steps <= 0) return 0;
  const fraction =
    progress.total > 0
      ? Math.min(1, Math.max(0, progress.done / progress.total))
      : 0;
  return Math.min(
    99,
    Math.max(
      0,
      Math.floor(((progress.step + fraction) / progress.steps) * 100),
    ),
  );
}
