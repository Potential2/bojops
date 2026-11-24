/* Look Up v1.10.6 — Ephod & Signs sections (Colors page family).
   Builds the breastplate grid, the camp diagram, the woven colours and the
   Signs and Answers cards from ./data/ephod.json, and reads every verse
   from the app's packaged KJV through the same integrity-checked loader
   the Reader uses. Verse text is inserted with textContent only. Fully
   offline; no external requests; the bottom bar is untouched. */
import {KjvChapterLoader} from './kjv_loader.mjs';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function textOn(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#241d17' : '#f7f2e4';
}

/* One verse kit per scope: a shared loader + chapter cache, and the page's
   own panel behaviour — one panel open at a time inside the scope. */
function makeKit(scopeEl) {
  const loader = new KjvChapterLoader({onStatus() {}});
  const cache = new Map();
  function chapterData(book, chapter) {
    const key = book + '|' + chapter;
    if (!cache.has(key)) {
      cache.set(key, loader.openChapter(book, chapter).then(st => {
        if (!st || st.kind !== 'ready' || !st.chapter) throw new Error('unavailable');
        return new Map(st.chapter.verses.map(v => [v.verse, v.text]));
      }));
    }
    return cache.get(key);
  }
  function addRef(refsParent, panelsParent, ref) {
    const btn = el('button', 'refbtn', ref.label);
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    const panel = el('div', 'vpanel');
    panel.hidden = true;
    panel.appendChild(el('p', 'vload', 'Loading from the offline package…'));
    btn.addEventListener('click', async () => {
      const show = panel.hidden;
      scopeEl.querySelectorAll('.vpanel').forEach(p => { p.hidden = true; });
      scopeEl.querySelectorAll('.refbtn').forEach(b => b.setAttribute('aria-expanded', 'false'));
      if (!show) return;
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      panel.scrollIntoView({block: 'nearest'});
      if (panel.dataset.loaded) return;
      try {
        const map = await chapterData(ref.book, ref.chapter);
        panel.replaceChildren();
        panel.appendChild(el('p', 'vref', ref.label + ' · King James Version'));
        for (const n of ref.verses) {
          const text = map.get(n);
          if (typeof text !== 'string') continue;
          const row = el('p', 'vrow');
          const num = el('span', 'vnum', String(n));
          row.append(num, document.createTextNode(text));
          panel.appendChild(row);
        }
        panel.dataset.loaded = '1';
      } catch (e) {
        panel.replaceChildren();
        panel.appendChild(el('p', 'vload', 'This chapter could not be read from the offline package.'));
      }
    });
    refsParent.appendChild(btn);
    panelsParent.appendChild(panel);
  }
  function addRefSet(parent, refs) {
    const refsRow = el('div', 'refs');
    const panelsBox = el('div');
    parent.append(refsRow, panelsBox);
    for (const r of refs) addRef(refsRow, panelsBox, r);
  }
  return {addRefSet};
}

async function init() {
  const grid = document.getElementById('ephodGrid');
  let data;
  try {
    const r = await fetch('./data/ephod.json');
    if (!r.ok) throw new Error('data');
    data = await r.json();
  } catch (e) {
    if (grid) grid.replaceChildren(el('p', 'vload', 'The Ephod data could not be read from the offline package.'));
    return;
  }

  const ephodArticle = document.getElementById('ephod-sec');
  const signsArticle = document.getElementById('signs-sec');
  const ephodKit = makeKit(ephodArticle);
  const signsKit = makeKit(signsArticle);

  /* ---- Panel A: the breastplate grid + one shared detail panel ---- */
  const panel = document.getElementById('stonePanel');
  let openPos = null;
  for (const s of data.stones) {
    const b = el('button', 'stone');
    b.type = 'button';
    b.style.background = `linear-gradient(135deg, ${s.gradient[0]}, ${s.gradient[1]})`;
    b.style.color = s.dark_text ? '#241d17' : '#f7f2e4';
    b.setAttribute('aria-label', s.label + ' — ' + s.tribe);
    b.setAttribute('aria-expanded', 'false');
    b.append(el('span', 'sk', s.kjv), el('span', 'st', s.tribe), el('span', 'sc', s.colour_name));
    b.addEventListener('click', () => {
      const closing = openPos === s.pos;
      grid.querySelectorAll('.stone').forEach(x => x.setAttribute('aria-expanded', 'false'));
      if (closing) { panel.hidden = true; openPos = null; return; }
      openPos = s.pos;
      b.setAttribute('aria-expanded', 'true');
      panel.replaceChildren();
      panel.appendChild(el('p', 'vref', `${s.kjv.toUpperCase()} · ROW ${s.row} OF 4 · STONE ${s.pos} OF 12 · DEPICTION`));
      const name = el('p', 'sline');
      const heb = el('b', null, s.hebrew);
      name.append(heb, document.createTextNode(` (${s.translit}) — Strong's `));
      const link = el('a', null, s.strongs);
      link.href = './strongs.html#entry=' + s.strongs;
      name.append(link, document.createTextNode(` · the KJV renders it “${s.gloss}”`));
      panel.appendChild(name);
      const tribe = el('p', 'sline');
      tribe.append(document.createTextNode('Tribe: '));
      tribe.appendChild(el('b', null, s.tribe));
      tribe.append(document.createTextNode(' — tribe–stone pairing: tradition, the commonly printed chart.'));
      panel.appendChild(tribe);
      if (s.colour_note) panel.appendChild(el('p', 'sline', 'Colour: ' + s.colour_name + ' — ' + s.colour_note));
      else panel.appendChild(el('p', 'sline', 'Colour: ' + s.colour_name + '.'));
      if (s.dispute) {
        const d = el('div', 'hint');
        d.appendChild(el('b', null, 'Disputed identification. '));
        d.append(document.createTextNode(s.dispute));
        panel.appendChild(d);
      }
      const refsLabel = el('p', 'refslabel', 'Read the verses — KJV, from this device');
      panel.appendChild(refsLabel);
      makeKit(panel).addRefSet(panel, s.refs);
      panel.hidden = false;
      panel.scrollIntoView({block: 'nearest'});
    });
    grid.appendChild(b);
  }

  /* ---- Panel B: the camp ---- */
  const camp = document.getElementById('campBox');
  const bySide = side => data.camp.filter(c => c.side === side);
  function chip(c) {
    const d = el('div', 'cchip');
    d.style.background = c.tint;
    d.style.color = textOn(c.tint);
    d.setAttribute('aria-label', c.label + ' — emblem: ' + c.emblem);
    d.append(el('b', null, c.tribe), el('span', 'cem', c.emblem), el('span', 'cflag', 'Flag: ' + c.flag_colour + ' · tradition'));
    return d;
  }
  function sideRow(side) {
    const row = el('div', 'crow');
    bySide(side).forEach(c => row.appendChild(chip(c)));
    return row;
  }
  camp.appendChild(el('div', 'cside', 'North — the camp of Dan · Numbers 2:25–31'));
  camp.appendChild(sideRow('north'));
  const mid = el('div', 'cmid');
  const west = el('div', 'ccol');
  west.appendChild(el('div', 'cside', 'West — camp of Ephraim'));
  bySide('west').forEach(c => west.appendChild(chip(c)));
  const center = el('div', 'ccenter');
  center.append(el('b', null, 'THE TABERNACLE'), el('span', null, 'The camp of the Levites, in the midst of the camps — Numbers 2:17 · Scripture. Levi carries no standard here; his place is the breastplate, Panel A.'));
  const east = el('div', 'ccol');
  east.appendChild(el('div', 'cside', 'East — camp of Judah'));
  bySide('east').forEach(c => east.appendChild(chip(c)));
  mid.append(west, center, east);
  camp.appendChild(mid);
  camp.appendChild(sideRow('south'));
  camp.appendChild(el('div', 'cside', 'South — the camp of Reuben · Numbers 2:10–16'));
  ephodKit.addRefSet(document.getElementById('campRefs'), data.camp_refs);

  /* ---- Panel C: the woven colours ---- */
  const wovenBox = document.getElementById('wovenBox');
  for (const w of data.woven) {
    const row = el('div', 'wband');
    const sw = el('span', 'wsw');
    sw.style.background = w.hex;
    const meta = el('span', 'wmeta');
    meta.appendChild(el('span', 'wn', w.name));
    meta.append(document.createTextNode(' — '));
    const link = el('a', null, w.strongs);
    link.href = './strongs.html#entry=' + w.strongs;
    meta.append(link, document.createTextNode(' · ' + w.note));
    row.append(sw, meta);
    wovenBox.appendChild(row);
  }
  ephodKit.addRefSet(document.getElementById('wovenRefs'), data.woven_refs);

  /* ---- Urim and Thummim refs ---- */
  ephodKit.addRefSet(document.getElementById('urimRefs'), data.urim.refs);

  /* ---- Signs and Answers ----
     Owner's pattern (2026-11-24 18:28): every entry carries the sign itself,
     the question or decision it answered, and its chapter and verse.
     Owner's ruling (2026-11-24 18:29): the caution heads the whole section. */
  signsKit.addRefSet(document.getElementById('signsCautionRefs'), data.signs_caution_refs);
  const signsBox = document.getElementById('signsBox');
  for (const f of data.signs) {
    const card = el('div', 'signcard');
    card.appendChild(el('h4', null, f.form));
    card.appendChild(el('p', 'sline', f.line));
    if (f.decided) {
      const d = el('p', 'sline');
      d.appendChild(el('b', null, 'What it settled: '));
      d.append(document.createTextNode(f.decided));
      card.appendChild(d);
    }
    if (f.fed) {
      const box = el('div', 'hint');
      box.appendChild(el('b', null, f.fed.title + '. '));
      box.append(document.createTextNode(f.fed.text));
      card.appendChild(box);
    }
    card.appendChild(el('p', 'refslabel', 'Read the verses — KJV, from this device'));
    signsKit.addRefSet(card, f.refs);
    signsBox.appendChild(card);
  }
}

init();
