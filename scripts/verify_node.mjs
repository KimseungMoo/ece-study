// Same crypto path as the app. Never prints the passphrase or question text.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveKey, checkPassphrase, decryptData, decryptImageChunk } from '../src/crypto/ece-decrypt.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (b) => createHash('sha256').update(b).digest('hex');
let allOk = true;
const r = (label, name, ok) => {
  allOk &&= !!ok;
  console.log(`[node:${label}] ${name}: ${ok ? 'PASS' : 'FAIL'}`);
};

function bufOf(file) {
  const b = readFileSync(file);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

async function checkFiles(label, dir) {
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const dataFile = join(dir, m.files.data);
  r(label, 'data.bin present', existsSync(dataFile));
  r(label, 'data.bin sha256', sha(readFileSync(dataFile)) === m.files.data_sha256);
  r(label, 'verify.bin present', existsSync(join(dir, m.files.verify)));
  for (const c of m.files.images) {
    const p = join(dir, c.name);
    r(label, `${c.name} present`, existsSync(p));
    r(label, `${c.name} sha256`, sha(readFileSync(p)) === c.sha256);
  }
  return m;
}

async function checkDecrypt(label, dir, pw, expectQuestions) {
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const key = await deriveKey(pw, m);
  r(label, 'verify.bin', await checkPassphrase(key, bufOf(join(dir, m.files.verify))));
  r(
    label,
    'wrong passphrase rejected',
    !(await checkPassphrase(await deriveKey(`${pw}x`, m), bufOf(join(dir, m.files.verify)))),
  );
  const data = await decryptData(key, bufOf(join(dir, m.files.data)));
  r(label, 'questions count', data.questions.length === (expectQuestions ?? m.counts.questions));
  const refs = new Set(
    data.questions.flatMap((q) => [...(q.images || []), ...(q.explanation_images || [])]),
  );
  const imgs = new Map();
  for (const c of m.files.images) {
    const chunk = await decryptImageChunk(key, bufOf(join(dir, c.name)));
    for (const [p, v] of chunk) imgs.set(p, v);
  }
  r(label, 'image_index covers refs', [...refs].every((p) => data.image_index?.[p] && imgs.has(p)));
  return data;
}

const realDir = join(ROOT, 'public/data');
const sampleDir = join(ROOT, 'fixtures/sample');
await checkFiles('files', realDir);
const pw = process.env.ECE_APP_PASSPHRASE;
if (pw) {
  const data = await checkDecrypt('real', realDir, pw, 3163);
  const years = new Set(data.questions.filter((q) => q.exam === '필기' && q.year >= 2024).map((q) => `${q.year}-${q.round}`));
  r('real', '필기 2024-2026 rounds present', years.size >= 9);
  r('real', 'has similar_old or explanation_images fields', data.questions.some((q) => q.similar_old || q.explanation_images));
} else {
  console.log('[node:real] SKIP decrypt (ECE_APP_PASSPHRASE not set)');
}
await checkDecrypt('sample', sampleDir, 'test1234', 30);
console.log('OVERALL:', allOk && pw ? 'PASS' : allOk ? 'PASS (files+sample; real decrypt skipped)' : 'FAIL');
process.exit(allOk ? 0 : 1);
