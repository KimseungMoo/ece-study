// ECE encrypted dataset loader — identical code runs in browser (iOS Safari 16.4+) and Node 20+.
// Uses only WebCrypto (crypto.subtle), DecompressionStream('gzip'), Response, TextDecoder.
const subtle = globalThis.crypto.subtle;

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function deriveKey(passphrase, manifest) {
  const { kdf } = manifest;
  const base = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64ToBytes(kdf.salt_b64), iterations: kdf.iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// blob layout: IV(12) || AES-GCM ciphertext || tag(16)
export async function decryptFile(key, buf) {
  const u8 = new Uint8Array(buf);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(0, 12) }, key, u8.subarray(12));
  return gunzip(new Uint8Array(pt));
}

export async function checkPassphrase(key, verifyBuf) {
  try { return new TextDecoder().decode(await decryptFile(key, verifyBuf)) === 'ece-ok'; }
  catch { return false; } // OperationError => wrong passphrase
}

export async function decryptData(key, dataBuf) {
  return JSON.parse(new TextDecoder().decode(await decryptFile(key, dataBuf)));
}

// Image chunk container: "ECEIMG1\0"(8) | u32 BE headerLen | header JSON | bytes
// header = {v:1, entries:[{path, offset, length, type}]}, offset relative to end of header
export async function decryptImageChunk(key, chunkBuf) {
  const buf = await decryptFile(key, chunkBuf);
  const magic = new TextDecoder().decode(buf.subarray(0, 8));
  if (magic !== 'ECEIMG1\0') throw new Error('bad image chunk');
  const hl = new DataView(buf.buffer, buf.byteOffset).getUint32(8, false);
  const header = JSON.parse(new TextDecoder().decode(buf.subarray(12, 12 + hl)));
  const base = 12 + hl, out = new Map();
  for (const e of header.entries) {
    out.set(e.path, { type: e.type, bytes: buf.subarray(base + e.offset, base + e.offset + e.length) });
  }
  return out; // path -> {type, bytes}; browser: URL.createObjectURL(new Blob([bytes], {type}))
}
