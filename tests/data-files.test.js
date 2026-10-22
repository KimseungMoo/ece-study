import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../public/data');
const sha = (b) => createHash('sha256').update(b).digest('hex');

describe('public/data v2 files', () => {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));

  it('declares 3163 questions and 12 image chunks', () => {
    expect(manifest.counts.questions).toBe(3163);
    expect(manifest.files.images).toHaveLength(12);
    expect(manifest.files.images.map((c) => c.name)).toEqual(
      Array.from({ length: 12 }, (_, i) => `img-${String(i).padStart(2, '0')}.bin`),
    );
  });

  it('matches sha256 of ciphertext files', () => {
    const data = readFileSync(join(dir, manifest.files.data));
    expect(sha(data)).toBe(manifest.files.data_sha256);
    expect(existsSync(join(dir, manifest.files.verify))).toBe(true);
    for (const c of manifest.files.images) {
      expect(sha(readFileSync(join(dir, c.name)))).toBe(c.sha256);
    }
  });
});
