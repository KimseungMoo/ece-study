import { deriveKey, checkPassphrase, decryptData } from './ece-decrypt.mjs';

self.onmessage = async (event) => {
  const { passphrase, manifest, verifyBuf, dataBuf } = event.data;
  try {
    self.postMessage({ stage: 'derive' });
    const key = await deriveKey(passphrase, manifest);
    self.postMessage({ stage: 'verify' });
    const ok = await checkPassphrase(key, verifyBuf);
    if (!ok) {
      self.postMessage({ ok: false });
      return;
    }
    self.postMessage({ stage: 'data' });
    const data = await decryptData(key, dataBuf);
    try {
      self.postMessage({ ok: true, key, data });
    } catch {
      self.postMessage({ ok: true, key: null, data, needRedrive: true });
    }
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message ? err.message : err) });
  }
};
