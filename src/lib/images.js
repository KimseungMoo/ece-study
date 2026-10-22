import { decryptImageChunk } from '../crypto/ece-decrypt.mjs';

export function createImageStore(opts) {
  const { key, imageIndex, dataBase } = opts;
  const chunkCache = new Map();
  const urlCache = new Map();
  const inflight = new Map();

  async function loadChunk(name) {
    if (chunkCache.has(name)) return chunkCache.get(name);
    if (inflight.has(name)) return inflight.get(name);
    const job = (async () => {
      const res = await fetch(`${dataBase}${name}`);
      if (!res.ok) throw new Error(`이미지 청크 실패 ${name}`);
      const map = await decryptImageChunk(key, await res.arrayBuffer());
      chunkCache.set(name, map);
      return map;
    })();
    inflight.set(name, job);
    try {
      return await job;
    } finally {
      inflight.delete(name);
    }
  }

  async function getUrl(path) {
    if (urlCache.has(path)) return urlCache.get(path);
    const chunkName = imageIndex?.[path];
    if (!chunkName) throw new Error(`image_index 없음: ${path}`);
    const map = await loadChunk(chunkName);
    const entry = map.get(path);
    if (!entry) throw new Error(`청크에 이미지 없음: ${path}`);
    const blob = new Blob([entry.bytes], { type: entry.type || 'image/png' });
    const url = URL.createObjectURL(blob);
    urlCache.set(path, url);
    return url;
  }

  function revokeAll() {
    for (const url of urlCache.values()) URL.revokeObjectURL(url);
    urlCache.clear();
    chunkCache.clear();
  }

  return { getUrl, revokeAll };
}
