import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  checkPassphrase,
  decryptData,
  decryptImageChunk,
  deriveKey,
} from '../src/crypto/ece-decrypt.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/sample');
const load = (name) => readFileSync(join(dir, name));

describe('sample decrypt (test1234)', () => {
  it('rejects a wrong passphrase on verify.bin', async () => {
    const manifest = JSON.parse(load('manifest.json').toString('utf8'));
    const key = await deriveKey('wrong-pass', manifest);
    const ok = await checkPassphrase(key, load('verify.bin').buffer.slice(
      load('verify.bin').byteOffset,
      load('verify.bin').byteOffset + load('verify.bin').byteLength,
    ));
    expect(ok).toBe(false);
  });

  it('unlocks verify.bin, data.bin, and image chunk with the same code path', async () => {
    const manifest = JSON.parse(load('manifest.json').toString('utf8'));
    const key = await deriveKey('test1234', manifest);

    const verifyFile = load('verify.bin');
    const verifyBuf = verifyFile.buffer.slice(verifyFile.byteOffset, verifyFile.byteOffset + verifyFile.byteLength);
    expect(await checkPassphrase(key, verifyBuf)).toBe(true);

    const dataFile = load('data.bin');
    const dataBuf = dataFile.buffer.slice(dataFile.byteOffset, dataFile.byteOffset + dataFile.byteLength);
    const data = await decryptData(key, dataBuf);

    expect(Array.isArray(data.questions)).toBe(true);
    expect(data.questions).toHaveLength(30);
    expect(data.questions.every((q) => q.exam === '필기' || q.exam === '실기')).toBe(true);
    expect(data.image_index['images/sample/placeholder-1.png']).toBe('img-00.bin');
    expect(data.topics.필기).toBeTruthy();
    expect(data.stats.total).toBe(30);

    const imgFile = load('img-00.bin');
    const imgBuf = imgFile.buffer.slice(imgFile.byteOffset, imgFile.byteOffset + imgFile.byteLength);
    const images = await decryptImageChunk(key, imgBuf);
    expect(images.size).toBe(2);
    expect(images.get('images/sample/placeholder-1.png')?.bytes.byteLength).toBeGreaterThan(8);
    expect(images.get('images/sample/placeholder-2.png')?.type).toMatch(/^image\//);
  });
});
