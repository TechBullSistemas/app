import { create } from 'zustand';

export type EntityStatus = 'idle' | 'running' | 'done' | 'error';

export interface EntityProgress {
  label: string;
  status: EntityStatus;
  downloaded: number;
  total: number;
  message?: string | null;
}

export interface UploadItemProgress {
  clientId: string;
  kind: 'venda' | 'visita' | 'cliente';
  label: string;
  status: 'pending' | 'sending' | 'sent' | 'error';
  message?: string | null;
}

interface SyncState {
  downloadRunning: boolean;
  downloadFinishedAt: string | null;
  downloadError: string | null;
  entities: Record<string, EntityProgress>;
  uploadRunning: boolean;
  uploadItems: UploadItemProgress[];
  uploadError: string | null;
  uploadFinishedAt: string | null;

  startDownload: () => void;
  setEntityProgress: (key: string, patch: Partial<EntityProgress>) => void;
  finishDownload: (success: boolean, error?: string | null) => void;

  startUpload: (items: UploadItemProgress[]) => void;
  setUploadItem: (clientId: string, patch: Partial<UploadItemProgress>) => void;
  finishUpload: (success: boolean, error?: string | null) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  downloadRunning: false,
  downloadFinishedAt: null,
  downloadError: null,
  entities: {},
  uploadRunning: false,
  uploadItems: [],
  uploadError: null,
  uploadFinishedAt: null,

  startDownload: () =>
    set({
      downloadRunning: true,
      downloadError: null,
      downloadFinishedAt: null,
      entities: {},
    }),
  setEntityProgress: (key, patch) =>
    set((s) => {
      const prev: EntityProgress = s.entities[key] || {
        label: patch.label || key,
        status: 'idle',
        downloaded: 0,
        total: 0,
      };
      return {
        entities: {
          ...s.entities,
          [key]: { ...prev, ...patch },
        },
      };
    }),
  finishDownload: (success, error) =>
    set({
      downloadRunning: false,
      downloadError: success ? null : error || 'Erro durante o download',
      downloadFinishedAt: new Date().toISOString(),
    }),

  startUpload: (items) =>
    set({
      uploadRunning: true,
      uploadError: null,
      uploadFinishedAt: null,
      uploadItems: items,
    }),
  setUploadItem: (clientId, patch) =>
    set((s) => ({
      uploadItems: s.uploadItems.map((it) =>
        it.clientId === clientId ? { ...it, ...patch } : it,
      ),
    })),
  finishUpload: (success, error) =>
    set({
      uploadRunning: false,
      uploadError: success ? null : error || 'Erro durante o envio',
      uploadFinishedAt: new Date().toISOString(),
    }),
}));
