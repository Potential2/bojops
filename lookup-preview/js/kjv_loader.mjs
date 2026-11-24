/** PRL App Shell v1 / Look Up L-016 and L-059 reference chapter loader.
 * Offline-only packaged assets. One chapter in memory; nothing loads at startup.
 * Placement: www/js/kjv_loader.mjs with www/data/kjv_manifest.json,
 *            www/data/kjv_hashes.json and www/data/kjv/{Book}_{CCC}.json.
 * Validated on Node 22 local HTTP test; Moto G Play runtime NOT claimed.
 * Signature: ChatGPT — 2026-10-21.
 */
export class KjvChapterLoader {
  constructor({
    fetchImpl = (...args) => fetch(...args),
    cryptoImpl = globalThis.crypto,
    assetBase = new URL('../data/', import.meta.url),
    onStatus = () => {},
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.cryptoImpl = cryptoImpl;
    this.assetBase = new URL(assetBase);
    this.onStatus = onStatus;
    this.manifest = null;
    this.hashes = null;
    this.current = null;
    this.currentRequest = null;
    this.ticket = 0;
    this.status = { kind: 'idle', message: 'Select a book and chapter.' };
  }

  setStatus(kind, message, chapter = null) {
    this.status = { kind, message, chapter };
    this.onStatus(this.status);
    return this.status;
  }

  asset(file) { return new URL(file, this.assetBase); }

  async loadJSON(file, signal) {
    const response = await this.fetchImpl(this.asset(file), { signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Packaged file unavailable: ${file} (HTTP ${response.status})`);
    return response.json();
  }

  async getManifest(signal) {
    if (this.manifest) return this.manifest;
    const m = await this.loadJSON('kjv_manifest.json', signal);
    if (!m || !Array.isArray(m.books) || m.books.length !== 66 ||
        m.totals?.chapters !== 1189 || m.totals?.verses !== 31102 ||
        m.books.some(b => !b || typeof b.name !== 'string' ||
                          !Number.isInteger(b.chapters) || b.chapters < 1)) {
      throw new Error('The packaged KJV manifest failed structural checks.');
    }
    this.manifest = m;
    return m;
  }

  async getHashes(signal) {
    if (this.hashes) return this.hashes;
    const h = await this.loadJSON('kjv_hashes.json', signal);
    if (!h || typeof h !== 'object' || Array.isArray(h)) {
      throw new Error('The packaged KJV hash manifest is invalid.');
    }
    this.hashes = h; // ~100 KiB; loaded on first requested chapter only.
    return h;
  }

  async openChapter(bookQuery, chapterNumber) {
    ++this.ticket;
    const ownTicket = this.ticket;
    if (this.currentRequest) this.currentRequest.abort();
    this.currentRequest = new AbortController();
    const signal = this.currentRequest.signal;
    this.current = null; // retain at most one chapter worth of verses
    this.setStatus('loading', 'Loading chapter from offline package…');

    try {
      const manifest = await this.getManifest(signal);
      const book = manifest.books.find(b => b.name.toLowerCase() ===
          String(bookQuery).trim().toLowerCase());
      if (!book || !Number.isInteger(chapterNumber) || chapterNumber < 1 ||
          chapterNumber > book.chapters) throw new Error('Invalid book or chapter selection.');

      // Derive path from the canonical manifest, not unsanitized user input.
      const file = `${book.name.replaceAll(' ', '_')}_${String(chapterNumber).padStart(3,'0')}.json`;
      const hashes = await this.getHashes(signal);
      const declaredHash = hashes[file];
      if (!/^[a-f0-9]{64}$/i.test(declaredHash || '')) {
        throw new Error(`Integrity record missing for ${file}.`);
      }
      const target = `kjv/${file}`;
      const response = await this.fetchImpl(this.asset(target), { signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`Offline chapter file is missing: ${file} (HTTP ${response.status}).`);
      const bytes = await response.arrayBuffer();
      if (!this.cryptoImpl?.subtle) throw new Error('Secure SHA-256 hashing is unavailable in this WebView.');
      const bytesHash = Array.from(new Uint8Array(await this.cryptoImpl.subtle.digest('SHA-256', bytes)))
        .map(n => n.toString(16).padStart(2,'0')).join('');
      if (bytesHash !== declaredHash.toLowerCase()) throw new Error(`Corrupt chapter data: ${file} failed SHA-256.`);
      const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (data.schema !== 'prl.kjv.chapter.v1' || data.translation !== 'KJV' ||
          data.book !== book.name || data.chapter !== chapterNumber ||
          !Array.isArray(data.verses) || data.verses.length === 0 ||
          data.verses.some((v, i) => !v || v.verse !== i + 1 ||
                              typeof v.text !== 'string' || !v.text.trim())) {
        throw new Error(`Invalid chapter schema or verse sequence: ${file}.`);
      }
      if (ownTicket !== this.ticket) return { kind: 'superseded', chapter: null };
      this.current = data;
      return this.setStatus('ready', `${book.name} ${chapterNumber} — KJV`, data);
    } catch (err) {
      if (ownTicket !== this.ticket) return { kind: 'superseded', chapter: null };
      return this.setStatus('error', err?.name === 'AbortError' ? 'Reading canceled.' :
           (err?.message || 'Unable to load offline chapter.'), null);
    } finally {
      if (ownTicket === this.ticket) this.currentRequest = null;
    }
  }
}
