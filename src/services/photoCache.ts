import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  clearProdutoFotoUrl,
  listProdutosComFotoPendente,
  setProdutoFotoLocal,
} from '@/db/repositories/produtos';

const PHOTOS_DIR = `${FileSystem.documentDirectory ?? ''}product-photos/`;

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
  const pending = await listProdutosComFotoPendente(2000);
  const total = pending.length;
  let done = 0;
  let saved = 0;
  let failed = 0;

  for (const p of pending) {
    if (!p.foto_url) {
      done++;
      opts?.onProgress?.(done, total);
      continue;
    }

    const tmpPath = `${FileSystem.cacheDirectory}tmp-${p.holding_id}-${p.cd_produto}.jpg`;
    const finalPath = `${PHOTOS_DIR}${p.holding_id}_${p.cd_produto}.jpg`;

    try {
      const dl = await FileSystem.downloadAsync(p.foto_url, tmpPath);

      if (dl.status !== 200) {
        await safeDelete(tmpPath);
        await clearProdutoFotoUrl(p.cd_produto, p.holding_id);
        failed++;
        continue;
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
        continue;
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
          continue;
        }
        await safeDelete(compressed.uri);
      }
      await safeDelete(tmpPath);

      const finalInfo = await FileSystem.getInfoAsync(finalPath);
      if (!finalInfo.exists) {
        console.warn(`[photoCache] arquivo final NÃO existe após move: ${finalPath}`);
        await clearProdutoFotoUrl(p.cd_produto, p.holding_id);
        failed++;
        continue;
      }

      await setProdutoFotoLocal(p.cd_produto, p.holding_id, finalPath);
      saved++;
    } catch {
      await safeDelete(tmpPath);
      await clearProdutoFotoUrl(p.cd_produto, p.holding_id);
      failed++;
    } finally {
      done++;
      opts?.onProgress?.(done, total);
    }
  }

  return { total, done, saved, failed };
}

export async function clearPhotos() {
  try {
    await FileSystem.deleteAsync(PHOTOS_DIR, { idempotent: true });
  } catch {}
}
