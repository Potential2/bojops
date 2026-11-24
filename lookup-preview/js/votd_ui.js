/* Look Up v1.10.6 — Verse of the Day (Reader home).
   One verse for every day of the year, chosen locally by the phone's date
   from ./data/votd.json — references only; the text is read from the app's
   packaged KJV through the integrity-checked loader. Same day, same verse;
   no server, no download. Tapping the card opens the passage in the reader
   through the app's own session goto, the same route a Strong's entry uses.
   Any failure leaves the card hidden and the reader untouched. */
import {KjvChapterLoader} from './kjv_loader.mjs';

(async function () {
  const card = document.getElementById('votdCard');
  if (!card) return;
  try {
    const r = await fetch('./data/votd.json');
    if (!r.ok) return;
    const doc = await r.json();
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    let doy = Math.floor((now - start) / 86400000);
    if (doy < 1) doy = 1;
    if (doy > 366) doy = 366;
    const entry = doc.days[doy - 1];
    if (!entry) return;
    document.getElementById('votdRef').textContent = entry.ref;
    const loader = new KjvChapterLoader({onStatus() {}});
    const st = await loader.openChapter(entry.book, entry.chapter);
    if (!st || st.kind !== 'ready' || !st.chapter) return;
    const v = st.chapter.verses.find(x => x.verse === entry.verse);
    if (!v) return;
    document.getElementById('votdText').textContent = v.text;
    card.hidden = false;
    function openInReader() {
      try {
        sessionStorage.setItem('lookup.goto.v1', JSON.stringify({book: entry.book, chapter: entry.chapter, verse: entry.verse}));
      } catch (e) {}
      const bookEl = document.getElementById('book');
      const chapEl = document.getElementById('chapter');
      const loadBtn = document.getElementById('load');
      if (bookEl && chapEl && loadBtn) {
        bookEl.value = entry.book;
        chapEl.value = entry.chapter;
        loadBtn.click();
        card.scrollIntoView({block: 'start'});
      }
    }
    card.addEventListener('click', openInReader);
    card.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openInReader(); }
    });
  } catch (e) { /* fail quiet: the reader is unaffected */ }
})();
