import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import {
  listEmpresasComLogoPendente,
  setEmpresaLogoLocal,
} from '@/db/repositories/empresas';

const LOGOS_DIR = `${FileSystem.documentDirectory ?? ''}company-logos/`;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(LOGOS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(LOGOS_DIR, { intermediates: true });
  }
}

async function safeDelete(path: string) {
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {}
}

export async function downloadPendingCompanyLogos(opts?: {
  onProgress?: (done: number, total: number) => void;
}) {
  await ensureDir();
  const pending = await listEmpresasComLogoPendente();
  const total = pending.length;
  opts?.onProgress?.(0, total);
  let done = 0;
  let saved = 0;
  let failed = 0;

  for (const empresa of pending) {
    const tmpPath = `${FileSystem.cacheDirectory}tmp-logo-${empresa.holding_id}-${empresa.cd_empresa}`;
    const finalPath = `${LOGOS_DIR}${empresa.holding_id}_${empresa.cd_empresa}.png`;

    try {
      const download = await FileSystem.downloadAsync(
        empresa.logo_url as string,
        tmpPath,
      );
      if (download.status !== 200) {
        failed++;
        continue;
      }

      const normalized = await ImageManipulator.manipulateAsync(
        download.uri,
        [{ resize: { width: 600 } }],
        { compress: 1, format: ImageManipulator.SaveFormat.PNG },
      );

      await safeDelete(finalPath);
      try {
        await FileSystem.moveAsync({ from: normalized.uri, to: finalPath });
      } catch {
        await FileSystem.copyAsync({ from: normalized.uri, to: finalPath });
        await safeDelete(normalized.uri);
      }

      const finalInfo = await FileSystem.getInfoAsync(finalPath);
      if (!finalInfo.exists) {
        failed++;
        continue;
      }

      await setEmpresaLogoLocal(
        empresa.cd_empresa,
        empresa.holding_id,
        finalPath,
      );
      saved++;
    } catch (error) {
      console.warn(
        `[companyLogoCache] falha ao baixar logo da empresa ${empresa.cd_empresa}:`,
        error,
      );
      failed++;
    } finally {
      await safeDelete(tmpPath);
      done++;
      opts?.onProgress?.(done, total);
    }
  }

  return { total, done, saved, failed };
}
