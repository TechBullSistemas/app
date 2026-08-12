import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  clearProdutoFotoUrl,
  listProdutosComFotoPendente,
  type ProdutoFotoPendente,
  setProdutoFotoLocal,
} from '@/db/repositories/produtos';

const PHOTOS_DIR = `${FileSystem.documentDirectory ?? ''}product-photos/`;
const PHOTO_DOWNLOAD_CONCURRENCY = 4;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
  }
}

async function safeDelete(path: string) {
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {}
}

export async function downloadPendingPhotos(opts?: {
  onProgress?: (done: number, total: number) => void;
}) {
  await ensureDir();
  const pending = await listProdutosComFotoPendente();
  const total = pending.length;
  let done = 0;
  let saved = 0;
  let failed = 0;
  let nextIndex = 0;
  opts?.onProgress?.(0, total);

  async function downloadOne(p: ProdutoFotoPendente) {
    if (!p.foto_url) {
      return;
    }

    const tmpPath = `${FileSystem.cacheDirectory}tmp-${p.holding_id}-${p.cd_produto}.jpg`;
    const finalPath = `${PHOTOS_DIR}${p.holding_id}_${p.cd_produto}.jpg`;

    try {
      const dl = await FileSystem.downloadAsync(p.foto_url, tmpPath);

      if (dl.status !== 200) {
        await safeDelete(tmpPath);
        await clearProdutoFotoUrl(p.cd_produto, p.holding_id);
        failed++;
        return;
      }

      let compressed: { uri: string };
      try {
        compressed = await ImageManipulator.manipulateAsync(
          dl.uri,
          [{ resize: { width: 400 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
        );
      } catch {
        await safeDelete(tmpPath);
        await clearProdutoFotoUrl(p.cd_produto, p.holding_id);
        failed++;
        return;
      }

      await safeDelete(finalPath);
      try {
        await FileSystem.moveAsync({ from: compressed.uri, to: finalPath });
      } catch (moveErr) {
        console.warn(`[photoCache] moveAsync falhou para ${p.cd_produto}:`, moveErr);
        try {
          await FileSystem.copyAsync({ from: compressed.uri, to: finalPath });
        } catch (copyErr) {
          console.warn(`[photoCache] copyAsync também falhou para ${p.cd_produto}:`, copyErr);
          await safeDelete(compressed.uri);
          await safeDelete(tmpPath);
          await clearProdutoFotoUrl(p.cd_produto, p.holding_id);
          failed++;
          return;
        }
        await safeDelete(compressed.uri);
      }
      await safeDelete(tmpPath);

      const finalInfo = await FileSystem.getInfoAsync(finalPath);
      if (!finalInfo.exists) {
        console.warn(`[photoCache] arquivo final NÃO existe após move: ${finalPath}`);
        await clearProdutoFotoUrl(p.cd_produto, p.holding_id);
        failed++;
        return;
      }

      await setProdutoFotoLocal(p.cd_produto, p.holding_id, finalPath);
      saved++;
    } catch {
      await safeDelete(tmpPath);
      await clearProdutoFotoUrl(p.cd_produto, p.holding_id);
      failed++;
    }
  }

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= total) return;

      await downloadOne(pending[index]);
      done++;
      opts?.onProgress?.(done, total);
    }
  }

  const workerCount = Math.min(PHOTO_DOWNLOAD_CONCURRENCY, total);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { total, done, saved, failed };
}

export async function clearPhotos() {
  try {
    await FileSystem.deleteAsync(PHOTOS_DIR, { idempotent: true });
  } catch {}
}
