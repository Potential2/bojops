/** Look Up v1.8 — word-tagged chapter loader (Leg A).
 * Loads the SIGNED tagged corpus (schema prl.kjv.tagged.v1): the app-facing
 * `w` layer only. The auxiliary offset-bearing layer is not shipped.
 * Fail-closed by contract: ANY failure (missing file, SHA-256 mismatch,
 * schema drift, or a verse whose w segments do not join byte-exactly to its
 * text) throws, and the reader falls back to the plain KJV loader, exactly
 * as v1.7 behaved. A broken tagged chapter must never reach the screen.
 * Data provenance: candidate SHA-256 080b46c5…f91ece, signed by Peet
 * 2026-10-30 (PEET-VERDICT_2026-10-30_tagged-candidate-signed.md).
 */
export class TaggedChapterLoader {
  constructor({
    fetchImpl = (...args) => fetch(...args),
    cryptoImpl = globalThis.crypto,
    assetBase = new URL('../data/', import.meta.url),
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.cryptoImpl = cryptoImpl;
    this.assetBase = new URL(assetBase);
    this.hashes = null;
  }

  asset(file) { return new URL(file, this.assetBase); }

  async getHashes(signal) {
    if (this.hashes) return this.hashes;
    const r = await this.fetchImpl(this.asset('kjv_tagged_hashes.json'), { signal, cache: 'no-store' });
    if (!r.ok) throw new Error('Tagged hash manifest unavailable.');
    const h = await r.json();
    if (!h || typeof h !== 'object' || Array.isArray(h)) throw new Error('Tagged hash manifest invalid.');
    this.hashes = h;
    return h;
  }

  /** Returns the tagged chapter, or throws (caller falls back to plain). */
  async openChapter(bookName, chapterNumber, signal) {
    const file = `${bookName.replaceAll(' ', '_')}_${String(chapterNumber).padStart(3, '0')}.json`;
    const hashes = await this.getHashes(signal);
    const declared = hashes[file];
    if (!/^[a-f0-9]{64}$/i.test(declared || '')) throw new Error(`No integrity record for tagged ${file}.`);
    const response = await this.fetchImpl(this.asset(`kjv_tagged/${file}`), { signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Tagged chapter missing: ${file}.`);
    const bytes = await response.arrayBuffer();
    if (!this.cryptoImpl?.subtle) throw new Error('SHA-256 unavailable in this WebView.');
    const digest = Array.from(new Uint8Array(await this.cryptoImpl.subtle.digest('SHA-256', bytes)))
      .map(n => n.toString(16).padStart(2, '0')).join('');
    if (digest !== declared.toLowerCase()) throw new Error(`Tagged chapter failed SHA-256: ${file}.`);
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (data.schema !== 'prl.kjv.tagged.v1' || data.translation !== 'KJV' ||
        data.book !== bookName || data.chapter !== chapterNumber ||
        !Array.isArray(data.verses) || data.verses.length === 0) {
      throw new Error(`Tagged chapter schema invalid: ${file}.`);
    }
    for (let i = 0; i < data.verses.length; i++) {
      const v = data.verses[i];
      if (!v || v.verse !== i + 1 || typeof v.text !== 'string' || !Array.isArray(v.w)) {
        throw new Error(`Tagged verse sequence invalid: ${file}.`);
      }
      let joined = '';
      for (const seg of v.w) {
        if (!Array.isArray(seg) || typeof seg[0] !== 'string') throw new Error(`Tagged segment invalid: ${file}.`);
        if (seg.length >= 2 && seg[1] !== undefined &&
            (!Array.isArray(seg[1]) || seg[1].some(id => typeof id !== 'string' || !/^[HG]\d{1,5}$/.test(id)))) {
          throw new Error(`Tagged segment id invalid: ${file}.`);
        }
        joined += seg[0];
      }
      if (joined !== v.text) throw new Error(`Tagged verse text mismatch: ${file} v${v.verse}.`);
    }
    return data;
  }
}
