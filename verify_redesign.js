/* Cold-load stub test for the Mizan CARD redesign (2026-11-21):
   loads web/data.js + web/locations.js + web/app.js in a minimal fake DOM
   twice — once as the main page (index.html ids present) and once as the
   unverified page (unverified.html ids present) — and asserts the split:
   main page = 37 verified findings only, 0 unverified; unverified page =
   26 differs/cannot_verify only. Table renderers became card renderers, so
   every structural assertion counts cards (.hero-stat, .fact-card,
   .corpus-card, .surah-card, .finding-card, .mizan-card), not <tr> rows.
   Also checks the counting-traditions note byte-for-byte, the 7 Mizan verse
   cards byte-identical to the v1 backup, tallies, filters, palette, links,
   data integrity (data.js/locations.js untouched, no new findings, no
   Harun Yahya) and that the v1 backup itself is intact.
   Supersedes the table-based verify_redesign.js (2026-11-08).
   Usage: node verify_redesign.js */
const vm = require('vm');
const fs = require('fs');
const crypto = require('crypto');

const MAIN_IDS = new Set(['stats', 'tally-line', 'facts-table', 'corpus-table',
  'surah-search', 'surah-type', 'surahs-list', 'surahs-tally', 'surahs-totals',
  'assumption-table', 'pair-search', 'pair-equal-only', 'pairs-list', 'extras-list',
  'name-search', 'name-filter', 'graph-scope', 'graph-edges', 'graph', 'graph-detail',
  'names-list', 'name-detail', 'more-names', 'verified-search', 'verified-cat', 'verified-tally',
  'verified-list']);
const UNV_IDS = new Set(['unverified-search', 'unverified-cat', 'unverified-status',
  'unverified-tally', 'unverified-list']);

class El {
  constructor(id) {
    this.id = id;
    this.innerHTML = '';
    this.textContent = '';
    this.value = /-search$/.test(id) ? '' : 'all';
    this.checked = false;
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.style = {};
    this.width = 800;
    this.height = 600;
    this._listeners = {};
  }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  _fire(type, ev) { (this._listeners[type] || []).forEach((fn) => fn(ev || {})); }
  getAttribute() { return ''; }
  getContext() {
    return new Proxy({}, {
      get: (t, k) => {
        if (k === 'measureText') return () => ({ width: 10 });
        if (k === 'canvas') return this;
        return () => {};
      },
      set: () => true,
    });
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
  scrollIntoView() {}
}

function runPage(idSet) {
  const els = {};
  // Static HTML already carries the graph placeholder text; seed it like the
  // real page does so drawGraph() must not clobber it.
  if (idSet.has('graph-detail')) {
    els['graph-detail'] = new El('graph-detail');
    els['graph-detail'].textContent = 'Select a Name in the graph to see its strongest partners.';
  }
  const document = {
    getElementById: (id) => {
      if (!idSet.has(id)) return null;
      if (!els[id]) els[id] = new El(id);
      return els[id];
    },
    querySelectorAll: () => [],
  };
  const windowObj = {};
  const sandbox = { window: windowObj, document, console };
  vm.createContext(sandbox);
  const errors = [];
  try {
    for (const f of ['web/data.js', 'web/locations.js', 'web/app.js']) {
      vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });
    }
  } catch (e) { errors.push('LOAD ERROR: ' + e.stack); }
  return { els, data: windowObj.MIRACLE_DATA || {}, locs: windowObj.MIRACLE_LOCATIONS || {}, errors };
}

function count(re, s) { return (s.match(re) || []).length; }
function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }
const checks = [];
function check(name, ok, detail) {
  checks.push([name, !!ok, detail || '']);
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  (' + detail + ')' : ''));
}

const data = JSON.parse(fs.readFileSync('data/scholar_findings.json', 'utf8'));
const dataJsRaw = fs.readFileSync('web/data.js', 'utf8');
const locJsRaw = fs.readFileSync('web/locations.js', 'utf8');
const appJs = fs.readFileSync('web/app.js', 'utf8');
const indexHtml = fs.readFileSync('web/index.html', 'utf8');
const unvHtmlRaw = fs.readFileSync('web/unverified.html', 'utf8');
const css = fs.readFileSync('web/styles.css', 'utf8');
const findings = data.findings;
const confirmed = findings.filter((f) => f.our_status === 'confirmed');
const unverified = findings.filter((f) => f.our_status !== 'confirmed');
console.log('source data: confirmed=' + confirmed.length + ' unverified=' + unverified.length +
  ' (scholarly confirmed ' + confirmed.filter((f) => f.section === 'scholarly').length +
  ', site confirmed ' + confirmed.filter((f) => f.section === 'site').length +
  ', popular confirmed ' + confirmed.filter((f) => f.section === 'popular').length + ')');
console.log('source data sections: scholarly=' + findings.filter((f) => f.section === 'scholarly').length +
  ' site=' + findings.filter((f) => f.section === 'site').length +
  ' popular=' + findings.filter((f) => f.section === 'popular').length);

/* ================= DATA INTEGRITY (no new findings, untouched payloads) ================= */
console.log('\n--- data integrity ---');
check('data: findings still 63 in data/scholar_findings.json', findings.length === 63, 'got ' + findings.length);
check('data: split still 37 confirmed / 17 differs / 9 cannot_verify',
  confirmed.length === 37 && unverified.filter((f) => f.our_status === 'differs').length === 17 &&
  unverified.filter((f) => f.our_status === 'cannot_verify').length === 9,
  'confirmed=' + confirmed.length + ' differs=' + unverified.filter((f) => f.our_status === 'differs').length +
  ' cannot_verify=' + unverified.filter((f) => f.our_status === 'cannot_verify').length);
check('data: sections still 35 scholarly / 21 site / 7 popular',
  findings.filter((f) => f.section === 'scholarly').length === 35 &&
  findings.filter((f) => f.section === 'site').length === 21 &&
  findings.filter((f) => f.section === 'popular').length === 7);
const today = new Date().toISOString().slice(0, 10);
const jsonFiles = fs.readdirSync('data').filter((f) => f.endsWith('.json'));
const modifiedToday = jsonFiles.filter((f) =>
  fs.statSync('data/' + f).mtime.toISOString().slice(0, 10) === today);
check('data: no data/*.json modified today (' + today + ')',
  modifiedToday.length === 0, modifiedToday.join(', ') || 'none modified today');
check('data: web/data.js md5-identical to web-v1-backup/data.js (untouched)',
  md5(dataJsRaw) === md5(fs.readFileSync('web-v1-backup/data.js', 'utf8')),
  md5(dataJsRaw));
check('data: web/locations.js md5-identical to web-v1-backup/locations.js (untouched)',
  md5(locJsRaw) === md5(fs.readFileSync('web-v1-backup/locations.js', 'utf8')),
  md5(locJsRaw));

/* ================= BACKUP INTACT ================= */
console.log('\n--- v1 backup intact ---');
const expectedBackup = {
  'index.html': '0bd8863e80c92dae32de18e2158038fc',
  'app.js': '11c09360d980830beb0a9c761733db61',
  'styles.css': '3932a17fa7adec2ae7338e2647f2e670',
  'unverified.html': '6e64eda2959a11dee2c966315f67d956',
  'data.js': '9fdf3bed7a849b69a37acd8cd730c961',
  'locations.js': '45c6b34577d45853e091cee24ead2c4a',
};
for (const [file, hash] of Object.entries(expectedBackup)) {
  check('backup: web-v1-backup/' + file + ' md5 matches v1 hash',
    md5(fs.readFileSync('web-v1-backup/' + file, 'utf8')) === hash,
    md5(fs.readFileSync('web-v1-backup/' + file, 'utf8')));
}

/* ================= MAIN PAGE ================= */
console.log('\n--- main page (index.html) ---');
const main = runPage(MAIN_IDS);
const vHtml = () => (main.els['verified-list'] ? main.els['verified-list'].innerHTML : '');
check('main: no load errors', main.errors.length === 0, main.errors.join(' | '));
check('main: MIRACLE_DATA findings = 63', (main.data.findings || []).length === 63);
check('main: MIRACLE_LOCATIONS entries = 63', Object.keys(main.locs).length === 63);
check('main: data.js embeds quran_facts + corpus_numbers',
  Array.isArray(main.data.quran_facts) && Array.isArray(main.data.corpus_numbers),
  'facts=' + (main.data.quran_facts || []).length + ' numbers=' + (main.data.corpus_numbers || []).length);
check('main: all DOM ids from the old page still present in index.html',
  [...MAIN_IDS].every((id) => indexHtml.includes('id="' + id + '"')),
  'missing: ' + [...MAIN_IDS].filter((id) => !indexHtml.includes('id="' + id + '"')).join(', '));

// Hero stat cards (derived from D.corpus_numbers by id)
const heroHtml = main.els['stats'] ? main.els['stats'].innerHTML : '';
check('main: hero renders 4 .hero-stat cards', count(/class="hero-stat"/g, heroHtml) === 4,
  'got ' + count(/class="hero-stat"/g, heroHtml));
check('main: hero card 114 surahs', heroHtml.includes('<b>114</b><span>surahs</span>'));
check('main: hero card 6,236 verses', heroHtml.includes('<b>6,236</b><span>verses</span>'));
check('main: hero card 77,429 words', heroHtml.includes('<b>77,429</b><span>words</span>'));
check('main: hero card 325,386 letters', heroHtml.includes('<b>325,386</b><span>letters (excl. unnumbered basmalahs)</span>'));
check('main: hero no longer the old 6-item strip (no "verified counts" in hero)',
  !heroHtml.includes('verified counts') && !heroHtml.includes('Names of God'));
check('main: tally-line exact',
  (main.els['tally-line'] || {}).textContent ===
  '37 confirmed · 17 differ · 9 cannot verify — this page shows verified counts only; the 26 unverified claims are on a separate page.',
  (main.els['tally-line'] || {}).textContent);

// About the Quran fact cards
const factsHtml = main.els['facts-table'] ? main.els['facts-table'].innerHTML : '';
const factsJson = JSON.parse(fs.readFileSync('data/quran_facts.json', 'utf8'));
const factsRows = factsJson.sample ? factsJson.facts : factsJson.facts || factsJson;
check('main: facts render 11 .fact-card cards (' + factsRows.length + ' facts)',
  count(/class="fact-card"/g, factsHtml) === factsRows.length,
  'got ' + count(/class="fact-card"/g, factsHtml));
check('main: facts render as cards, not a table', !factsHtml.includes('<table'));
check('main: every fact value + label renders',
  factsRows.every((f) => factsHtml.includes(f.value) && factsHtml.includes(f.label || f.id || '')),
  'checked ' + factsRows.length + ' facts');
check('main: every fact card carries its source',
  factsRows.every((f) => factsHtml.includes(f.source.split('—')[0].trim()) || factsHtml.includes(f.source)),
  'checked ' + factsRows.length + ' sources');
if (main.data.quran_facts_sample)
  check('main: SAMPLE facts flagged in-page (not silent)',
    factsHtml.includes('Sample data'), 'sample flag present in data.js');
else
  check('main: real (non-sample) facts — no sample flag', !factsHtml.includes('Sample data'));

// Corpus number cards
const corpHtml = main.els['corpus-table'] ? main.els['corpus-table'].innerHTML : '';
const numsJson = JSON.parse(fs.readFileSync('data/corpus_numbers.json', 'utf8'));
const numsRows = numsJson.sample ? numsJson.numbers : numsJson.numbers || numsJson;
check('main: corpus renders 15 .corpus-card cards (' + numsRows.length + ' numbers)',
  count(/class="corpus-card"/g, corpHtml) === numsRows.length,
  'got ' + count(/class="corpus-card"/g, corpHtml));
check('main: corpus renders as cards, not a table', !corpHtml.includes('<table'));
check('main: corpus cards match JSON values',
  numsRows.every((n) => corpHtml.includes(Number(n.value).toLocaleString('en-US'))),
  'checked ' + numsRows.length + ' values');
check('main: corpus cards carry labels + counting rules',
  numsRows.every((n) => corpHtml.includes(n.label || n.id || '') && corpHtml.includes(n.rule || '')),
  'checked ' + numsRows.length + ' rules');
if (main.data.corpus_numbers_sample)
  check('main: SAMPLE corpus numbers flagged in-page (not silent)',
    corpHtml.includes('Sample data'), 'sample flag present in data.js');
else
  check('main: real (non-sample) corpus numbers — no sample flag', !corpHtml.includes('Sample data'));

// Surahs section (2026-11-09): renders from data/surahs.json when present,
// degrades to a "list coming" note when absent — never a crash.
const surahsJsonPath = 'data/surahs.json';
const surahsExist = fs.existsSync(surahsJsonPath);
const surahsHtml = main.els['surahs-list'] ? main.els['surahs-list'].innerHTML : '';
if (surahsExist) {
  const sj = JSON.parse(fs.readFileSync(surahsJsonPath, 'utf8'));
  const sRows = Array.isArray(sj) ? sj : (sj.surahs || []);
  check('main: surahs payload = 114 rows', (main.data.surahs || []).length === 114,
    'got ' + (main.data.surahs || []).length);
  check('main: surah section renders 114 .surah-card cards', count(/class="surah-card"/g, surahsHtml) === 114,
    'got ' + count(/class="surah-card"/g, surahsHtml));
  check('main: surah cards render, not a table', !surahsHtml.includes('<table'));
  check('main: surah verse counts match data/surahs.json',
    sRows.every((s) => surahsHtml.includes(s.verses + ' verses')),
    'checked ' + sRows.length + ' verse counts');
  check('main: every surah card has a Recite link to quran.com/<n>',
    count(/href="https:\/\/quran\.com\/\d+"/g, surahsHtml) === 114,
    'got ' + count(/href="https:\/\/quran\.com\/\d+"/g, surahsHtml));
  check('main: every surah card shows Meccan or Medinan type-tag',
    count(/type-tag/g, surahsHtml) === 114, 'got ' + count(/type-tag/g, surahsHtml));
  const facts604 = (JSON.parse(fs.readFileSync('data/quran_facts.json', 'utf8')).facts || [])
    .some((f) => /604/.test(String(f.value || '')));
  check('main: surah totals line shows 114 surahs · 30 juz' + (facts604 ? ' · 604 pages' : ''),
    (main.els['surahs-totals'] || {}).textContent ===
    (facts604 ? '114 surahs · 30 juz · 604 pages' : '114 surahs · 30 juz'),
    (main.els['surahs-totals'] || {}).textContent);
  check('main: surah tally says Showing 114 of 114 surahs',
    (main.els['surahs-tally'] || {}).textContent === 'Showing 114 of 114 surahs.',
    (main.els['surahs-tally'] || {}).textContent);
  // Search + filter behaviour on the surah cards
  function resetSurahs() {
    main.els['surah-search'].value = ''; main.els['surah-type'].value = 'all';
    main.els['surah-search']._fire('input');
  }
  resetSurahs();
  main.els['surah-search'].value = 'yasin';
  main.els['surah-search']._fire('input');
  check('main surah filter: "yasin" narrows to 1 card',
    count(/class="surah-card"/g, main.els['surahs-list'].innerHTML) === 1,
    'got ' + count(/class="surah-card"/g, main.els['surahs-list'].innerHTML));
  resetSurahs();
  main.els['surah-search'].value = '36';
  main.els['surah-search']._fire('input');
  check('main surah filter: number "36" finds Yâsîn',
    main.els['surahs-list'].innerHTML.includes('Yâsîn') &&
    count(/class="surah-card"/g, main.els['surahs-list'].innerHTML) === 1,
    'got ' + count(/class="surah-card"/g, main.els['surahs-list'].innerHTML));
  resetSurahs();
  main.els['surah-type'].value = 'Meccan';
  main.els['surah-type']._fire('change');
  const meccanExpected = sRows.filter((s) => s.type === 'Meccan').length;
  check('main surah filter: Meccan shows ' + meccanExpected + ' cards',
    count(/class="surah-card"/g, main.els['surahs-list'].innerHTML) === meccanExpected,
    'got ' + count(/class="surah-card"/g, main.els['surahs-list'].innerHTML));
  resetSurahs();
  main.els['surah-type'].value = 'Medinan';
  main.els['surah-type']._fire('change');
  const medinanExpected = sRows.filter((s) => s.type === 'Medinan').length;
  check('main surah filter: Medinan shows ' + medinanExpected + ' cards',
    count(/class="surah-card"/g, main.els['surahs-list'].innerHTML) === medinanExpected,
    'got ' + count(/class="surah-card"/g, main.els['surahs-list'].innerHTML));
  resetSurahs();
  check('main surah filter: reset restores 114 cards',
    count(/class="surah-card"/g, main.els['surahs-list'].innerHTML) === 114);
} else {
  check('main: surahs.json absent — payload falls back to empty array',
    Array.isArray(main.data.surahs) && main.data.surahs.length === 0);
  check('main: surahs.json absent — "list coming" note renders, no crash',
    surahsHtml.includes('being verified') && !surahsHtml.includes('<table'));
  console.log('NOTE: data/surahs.json not present — surah cards will appear after ' +
    "Agent A's file lands and build.py is re-run.");
}

// "More than 99" note (2026-11-09): renders only when data/more_names.json exists.
const moreJsonPath = 'data/more_names.json';
const moreExist = fs.existsSync(moreJsonPath);
const moreHtml = main.els['more-names'] ? main.els['more-names'].innerHTML : '';
if (moreExist) {
  const mj = JSON.parse(fs.readFileSync(moreJsonPath, 'utf8'));
  const mRows = Array.isArray(mj) ? mj : (mj.verified_additional || mj.more_names || mj.names || []);
  check('main: more_names payload = ' + mRows.length + ' rows',
    (main.data.more_names || []).length === mRows.length,
    'got ' + (main.data.more_names || []).length);
  check('main: "More than 99" note renders with Arabic + verse refs',
    moreHtml.includes('More than 99') &&
    mRows.every((m) => moreHtml.includes(m.arabic_printed || m.arabic || m.name_ar || m.name || '∅') ||
      moreHtml.includes(m.transliteration || '')),
    'checked ' + mRows.length + ' entries');
  check('main: "More than 99" note lists each entry\'s verse refs',
    mRows.every((m) => (m.verses || []).every((v) => moreHtml.includes(v))),
    'checked ' + mRows.length + ' entries');
} else {
  check('main: more_names.json absent — payload falls back to empty array, note hidden',
    Array.isArray(main.data.more_names) && main.data.more_names.length === 0 && moreHtml === '');
  console.log('NOTE: data/more_names.json not present — "More than 99" note will ' +
    "appear after Agent A's file lands and build.py is re-run.");
}

// Verified counts — the core guarantee, now as cards
check('main: verified section renders exactly 37 .finding-card cards', count(/class="finding-card"/g, vHtml()) === 37,
  'got ' + count(/class="finding-card"/g, vHtml()));
check('main: verified cards render, not a table', !vHtml().includes('<table'));
check('main: all 37 cards carry Confirmed badges', count(/badge ok/g, vHtml()) === 37,
  'got ' + count(/badge ok/g, vHtml()));
check('main: ZERO differs badges on verified cards', count(/badge bad/g, vHtml()) === 0, 'got ' + count(/badge bad/g, vHtml()));
check('main: ZERO cannot_verify badges on verified cards', count(/badge warn/g, vHtml()) === 0, 'got ' + count(/badge warn/g, vHtml()));
const unvClaims = unverified.map((f) => f.claim);
check('main: no unverified claim text appears among verified cards',
  !unvClaims.some((c) => vHtml().includes(c)), 'checked ' + unvClaims.length + ' claims');
check('main: verified tally 37 — 16 scholarly · 21 site · 0 popular',
  (main.els['verified-tally'] || {}).textContent ===
  '37 verified findings — 16 scholarly · 21 counted by this site · 0 popular. Showing 37.',
  (main.els['verified-tally'] || {}).textContent);
check('main: 21 site-verified cards carry a "Counted by this site" tag',
  count(/Counted by this site · /g, vHtml()) === 21, 'got ' + count(/Counted by this site · /g, vHtml()));
check('main: method <details> on all 37 verified cards',
  count(/<details class="method">/g, vHtml()) === 37, 'got ' + count(/<details class="method">/g, vHtml()));
check('main: allah locations render (1821 verses)', vHtml().includes('Locations (1821 verses)'));
check('main: no "location data not loaded" fallback', !vHtml().includes('location data not loaded'));
check('main: assumption labels render (A1–A7)', /A\d/.test(vHtml()) && vHtml().includes('assume-label'));
check('main: pairs render 13 pair cards', count(/<article class="pair">/g, main.els['pairs-list'].innerHTML) === 13,
  'got ' + count(/<article class="pair">/g, main.els['pairs-list'].innerHTML));
check('main: extras render 10 single counts', count(/class="extra"/g, main.els['extras-list'].innerHTML) === 10,
  'got ' + count(/class="extra"/g, main.els['extras-list'].innerHTML));
check('main: names render 99 name cards', count(/class="name-card/g, main.els['names-list'].innerHTML) === 99,
  'got ' + count(/class="name-card/g, main.els['names-list'].innerHTML));
check('main: graph detail placeholder intact',
  main.els['graph-detail'] && main.els['graph-detail'].textContent.includes('Select a Name'));
check('main: assumption sets table renders in methodology',
  main.els['assumption-table'] && main.els['assumption-table'].innerHTML.includes('<table'));

// Filter tests on the verified cards
function resetMain() {
  main.els['verified-search'].value = ''; main.els['verified-cat'].value = 'all';
  main.els['verified-search']._fire('input');
}
resetMain();
main.els['verified-search'].value = 'dunya';
main.els['verified-search']._fire('input');
check('main filter: "dunya" narrows verified cards',
  count(/class="finding-card"/g, vHtml()) >= 1 && count(/class="finding-card"/g, vHtml()) < 37,
  'got ' + count(/class="finding-card"/g, vHtml()) + ' cards');
resetMain();
main.els['verified-cat'].value = 'code19';
main.els['verified-cat']._fire('change');
const code19Expected = confirmed.filter((f) => f.category === 'code19').length;
check('main filter: code19 shows ' + code19Expected + ' verified cards',
  count(/class="finding-card"/g, vHtml()) === code19Expected, 'got ' + count(/class="finding-card"/g, vHtml()));
resetMain();
check('main filter: reset restores 37 cards', count(/class="finding-card"/g, vHtml()) === 37);

// Static HTML checks for the main page
check('main html: link to unverified.html present', indexHtml.includes('href="unverified.html"'));
check('main html: sections in order About → Corpus → Surahs → Verified → Pairs → Names → About Mizan → Method',
  ['id="about"', 'id="corpus"', 'id="surahs"', 'id="verified"', 'id="pairs"', 'id="names"', 'id="about-mizan"', 'id="method"']
    .every((s, i, a) => i === 0 || indexHtml.indexOf(s) > indexHtml.indexOf(a[i - 1])));
check('main html: old Scholar/Popular tabs gone',
  !indexHtml.includes('id="tab-findings"') && !indexHtml.includes('id="tab-popular"') &&
  !indexHtml.includes('finding-search') && !indexHtml.includes('popular-search'));
check('main html: no status filter on verified section',
  !indexHtml.includes('verified-status') && !indexHtml.includes('id="finding-status"'));
check('main html: humble intro above About the Quran (2–3 sentences)',
  indexHtml.indexOf('class="intro"') > indexHtml.indexOf('<main>') &&
  indexHtml.indexOf('class="intro"') < indexHtml.indexOf('id="about"') &&
  indexHtml.replace(/\s+/g, ' ').includes('humble attempt') &&
  indexHtml.replace(/\s+/g, ' ').includes('not a claim of authority'));
check('main html: surah section sits between corpus and verified',
  indexHtml.indexOf('id="surahs"') > indexHtml.indexOf('id="corpus"') &&
  indexHtml.indexOf('id="surahs"') < indexHtml.indexOf('id="verified"'));
check('main html: surah search + Meccan/Medinan filter present',
  indexHtml.includes('id="surah-search"') && indexHtml.includes('id="surah-type"') &&
  indexHtml.includes('value="Meccan"') && indexHtml.includes('value="Medinan"'));
check('main html: Names reframe — hadith cited, 99 not a ceiling',
  indexHtml.includes('Sahih al-Bukhari 7392') && indexHtml.includes('Sahih Muslim 2677') &&
  indexHtml.includes('not a ceiling') && indexHtml.includes('more names and attributes') &&
  indexHtml.includes('id="more-names"'));
check('mizan: title, logo + favicon, About Mizan after Names, concise line up top, closing line in footer',
  indexHtml.includes('<title>Mizan — The Quran in numbers</title>') &&
  indexHtml.includes('src="images/mizan-logo.png"') &&
  indexHtml.includes('href="images/mizan-favicon.png"') &&
  indexHtml.includes('is Arabic for the Balance') &&
  indexHtml.includes('id="about-mizan"') &&
  indexHtml.indexOf('id="names"') < indexHtml.indexOf('id="about-mizan"') &&
  indexHtml.indexOf('id="about-mizan"') < indexHtml.indexOf('id="method"') &&
  indexHtml.includes('Named for the Balance'));
check('mizan: no miracleMath display text left (repo URLs excepted)',
  !indexHtml.replace(/github\.com\/mindsyourai\/mizan/g, '').includes('miracleMath'));

// Counting-traditions note: exact approved text once link markup is stripped.
const APPROVED_NOTE = 'Counting traditions: this site counts the Kufi division used in the Hafs mushaf — 6,236 verses. Other traditions divide the same text differently. One example, observed on Quranpedia\'s Warsh text of Al-Baqarah (https://quranpedia.net/surah/4/2): its verse 1 joins what Hafs counts as verses 1 and 2 (الم + ذَٰلِكَ الْكِتَابُ … لِلْمُتَّقِينَ), so the same surah numbers 1–285 there while the header quotes the Kufi total of 286. The words are the same; the division differs.';
const noteMatch = indexHtml.match(/<div class="counting-note">([\s\S]*?)<\/div>/);
const noteStripped = noteMatch
  ? noteMatch[1].replace(/<a href="[^"]*">([^<]*)<\/a>/g, '$1')
  : 'COUNTING NOTE NOT FOUND';
check('main html: counting-note present with the exact approved text (link markup stripped)',
  noteStripped === APPROVED_NOTE,
  'stripped len ' + noteStripped.length + ' vs approved len ' + APPROVED_NOTE.length +
  '; stripped: ' + JSON.stringify(noteStripped.slice(200, 260)));
check('main html: no other counting-tradition claims — Kufi/Warsh/Hafs/Quranpedia/tradition/division occur only in the note',
  count(/Kufi/g, indexHtml) === 2 && count(/Warsh/g, indexHtml) === 1 &&
  count(/Hafs/g, indexHtml) === 2 && count(/Quranpedia/g, indexHtml) === 1 &&
  count(/tradition/gi, indexHtml) === 2 && count(/division/g, indexHtml) === 2 &&
  !/Kufi|Warsh|Hafs|Quranpedia|quranpedia/.test(unvHtmlRaw) && !/Kufi|Warsh|Hafs|Quranpedia|quranpedia/.test(appJs),
  'index Kufi=' + count(/Kufi/g, indexHtml) + ' Warsh=' + count(/Warsh/g, indexHtml) +
  ' Hafs=' + count(/Hafs/g, indexHtml) + ' Quranpedia=' + count(/Quranpedia/g, indexHtml) +
  ' tradition=' + count(/tradition/gi, indexHtml) + ' division=' + count(/division/g, indexHtml));

// Mizan verse cards: byte-identical to the backup's table rows
function parseBackupMizan(html) {
  const rows = [];
  const re = /<tr><td><b><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/b><\/td><td class="ar">([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g;
  let m;
  while ((m = re.exec(html))) rows.push({ href: m[1], ref: m[2], ar: m[3], en: m[4] });
  return rows;
}
function parseNewMizan(html) {
  const cards = [];
  const re = /<article class="mizan-card"><b><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/b><div class="ar">([^<]*)<\/div><p>([^<]*)<\/p><\/article>/g;
  let m;
  while ((m = re.exec(html))) cards.push({ href: m[1], ref: m[2], ar: m[3], en: m[4] });
  return cards;
}
const backupHtml = fs.readFileSync('web-v1-backup/index.html', 'utf8');
const backupMizan = parseBackupMizan(backupHtml);
const newMizan = parseNewMizan(indexHtml);
check('mizan: 7 .mizan-card cards', newMizan.length === 7, 'got ' + newMizan.length);
check('mizan: backup has 7 table rows to compare against', backupMizan.length === 7, 'got ' + backupMizan.length);
check('mizan: every card href + link text + Arabic + English byte-identical to the backup rows',
  backupMizan.length === 7 && newMizan.length === 7 &&
  backupMizan.every((b, i) => newMizan[i] && b.href === newMizan[i].href && b.ref === newMizan[i].ref &&
    b.ar === newMizan[i].ar && b.en === newMizan[i].en),
  backupMizan.map((b, i) => {
    const n = newMizan[i];
    if (!n) return b.ref + ': MISSING CARD';
    const diffs = ['href', 'ref', 'ar', 'en'].filter((k) => b[k] !== n[k]);
    return diffs.length ? b.ref + ' differs in ' + diffs.join(',') : b.ref + ': ok';
  }).join(' | '));
check('mizan: all 7 verse refs present (55:7–9, 57:25, 42:17, 21:47, 101:6–9, 17:35, 15:19)',
  ['55:7–9', '57:25', '42:17', '21:47', '101:6–9', '17:35', '15:19']
    .every((r) => indexHtml.includes('>' + r + '</a>')));
check('mizan: "occurs in 9 verses" count line kept', indexHtml.includes('occurs in 9 verses'));

// Methodology / sources links intact
check('main html: methodology repo links intact (data folder, DATA_SOURCES, RECONCILIATION, METHODS)',
  indexHtml.includes('https://github.com/mindsyourai/mizan/tree/main/data') &&
  indexHtml.includes('https://github.com/mindsyourai/mizan/blob/main/DATA_SOURCES.md') &&
  indexHtml.includes('https://github.com/mindsyourai/mizan/blob/main/RECONCILIATION.md') &&
  indexHtml.includes('https://github.com/mindsyourai/mizan/blob/main/METHODS.md'));
check('main html: source links intact (corpus.quran.com, tanzil.net, repo)',
  indexHtml.includes('href="https://corpus.quran.com"') && indexHtml.includes('href="https://tanzil.net"') &&
  indexHtml.includes('href="https://github.com/mindsyourai/mizan"'));
check('main html: all 7 mizan verse links are quran.com links',
  count(/href="https:\/\/quran\.com\/(55\/7|57\/25|42\/17|21\/47|101\/6|17\/35|15\/19)"/g, indexHtml) === 7,
  'got ' + count(/href="https:\/\/quran\.com\/(55\/7|57\/25|42\/17|21\/47|101\/6|17\/35|15\/19)"/g, indexHtml));

// Recolor checks: light palette on both pages (shared styles.css), no dark-theme leftovers.
check('recolor: light beige background + gold-brown accents in palette',
  css.includes('--bg:#f7f2e8') && css.includes('--gold:#8a6d1f') && css.includes('--green:#166b2d'));
check('recolor: no leftover dark-theme background colors',
  !css.includes('#0b1220') && !css.includes('#0e1729') && !css.includes('#111c31') &&
  !css.includes('#0d1526') && !css.includes('#e8eef7') && !css.includes('#22d3ee'));
check('recolor: scroll-padding-top layout fix kept (124px, clears two-row sticky nav)',
  css.includes('scroll-padding-top:124px') && css.includes('scroll-margin-top:124px'));
check('recolor: .table-scroll overflow-x fix kept', css.includes('.table-scroll{overflow-x:auto}'));
check('recolor: card CSS present for all new card classes',
  css.includes('.hero-stat') && css.includes('.fact-card') && css.includes('.corpus-card') &&
  css.includes('.surah-card') && css.includes('.finding-card') && css.includes('.mizan-card') &&
  css.includes('.counting-note'));
check('recolor: graph label colors are light-theme (dark ink on light canvas)',
  appJs.includes('"#2b2118"') && !appJs.includes('#e8eef7') && !appJs.includes('#22d3ee'));
check('recolor: graph geometry code untouched (radius + label clamping intact)',
  appJs.includes('Math.min(W, H) / 2 - 70 - maxR - 16') &&
  appJs.includes('Math.min(ox, W - tw - 6)') && appJs.includes('Math.max(ox, tw + 6)'));
check('app.js: card renderers present, table renderers gone for findings/surahs/facts/corpus',
  appJs.includes('findingCard') && appJs.includes('class="finding-card"') &&
  appJs.includes('class="surah-card"') && appJs.includes('class="fact-card"') &&
  appJs.includes('class="corpus-card"') && appJs.includes('class="hero-stat"') &&
  !appJs.includes('class="frow"') && appJs.includes('<table class="data-table">'));

/* ================= UNVERIFIED PAGE ================= */
console.log('\n--- unverified page (unverified.html) ---');
const unv = runPage(UNV_IDS);
const uHtml = () => (unv.els['unverified-list'] ? unv.els['unverified-list'].innerHTML : '');
check('unverified: no load errors', unv.errors.length === 0, unv.errors.join(' | '));
check('unverified: all DOM ids from the old page still present in unverified.html',
  [...UNV_IDS].every((id) => unvHtmlRaw.includes('id="' + id + '"')),
  'missing: ' + [...UNV_IDS].filter((id) => !unvHtmlRaw.includes('id="' + id + '"')).join(', '));
check('unverified: Mizan title + favicon, no miracleMath display text',
  unvHtmlRaw.includes('<title>Unverified claims — Mizan</title>') &&
  unvHtmlRaw.includes('href="images/mizan-favicon.png"') &&
  !unvHtmlRaw.replace(/github\.com\/mindsyourai\/mizan/g, '').includes('miracleMath'));
check('unverified: brand logo added to header (restyle)',
  unvHtmlRaw.includes('src="images/mizan-logo.png"') && unvHtmlRaw.includes('class="brand-logo"'));
check('unverified: renders exactly 26 .finding-card cards', count(/class="finding-card"/g, uHtml()) === 26,
  'got ' + count(/class="finding-card"/g, uHtml()));
check('unverified: cards render, not a table', !uHtml().includes('<table'));
check('unverified: 17 differs badges', count(/badge bad/g, uHtml()) === 17, 'got ' + count(/badge bad/g, uHtml()));
check('unverified: 9 cannot_verify badges', count(/badge warn/g, uHtml()) === 9, 'got ' + count(/badge warn/g, uHtml()));
check('unverified: ZERO confirmed badges', count(/badge ok/g, uHtml()) === 0, 'got ' + count(/badge ok/g, uHtml()));
check('unverified: Scholar group header (19 unverified)',
  uHtml().includes('Scholar findings — 19 unverified'), 'header present');
check('unverified: Popular group header (7 unverified)',
  uHtml().includes('Popular claims — 7 unverified'), 'header present');
const mindLight = findings.find((x) => x.id === 'mind-light-49');
check('unverified: mind-light-49 present as differs',
  mindLight && mindLight.our_status === 'differs' && uHtml().includes(mindLight.claim),
  mindLight ? mindLight.claim : 'finding missing from data');
const benefitCorrupt = findings.find((x) => x.id === 'benefit-corrupt-50');
check('unverified: benefit-corrupt-50 still differs (flip NOT applied)',
  benefitCorrupt && benefitCorrupt.our_status === 'differs' && uHtml().includes(benefitCorrupt.claim),
  benefitCorrupt ? benefitCorrupt.claim + ' / status=' + benefitCorrupt.our_status : 'finding missing from data');
check('unverified: tally 26 — 17 differ · 9 cannot verify',
  (unv.els['unverified-tally'] || {}).textContent ===
  '26 unverified claims — 17 differ from our recount · 9 cannot verify. Showing 26.',
  (unv.els['unverified-tally'] || {}).textContent);
check('unverified: method <details> on all 26 cards',
  count(/<details class="method">/g, uHtml()) === 26, 'got ' + count(/<details class="method">/g, uHtml()));
check('unverified: no "location data not loaded" fallback', !uHtml().includes('location data not loaded'));
check('unverified: no confirmed claim text appears',
  !confirmed.some((f) => uHtml().includes(f.claim)), 'checked ' + confirmed.length + ' claims');
check('unverified html: "Not verified" banner present', unvHtmlRaw.includes('Not verified'));
check('unverified html: back-link to index.html present', unvHtmlRaw.includes('href="index.html"'));
check('unverified html: loads same data.js + locations.js + app.js',
  unvHtmlRaw.includes('src="data.js"') && unvHtmlRaw.includes('src="locations.js"') && unvHtmlRaw.includes('src="app.js"'));
check('unverified html: status filter (differs vs cannot_verify) present',
  unvHtmlRaw.includes('id="unverified-status"') && unvHtmlRaw.includes('value="differs"') &&
  unvHtmlRaw.includes('value="cannot_verify"'));
check('unverified html: links intact (method on main page, RECONCILIATION, repo)',
  unvHtmlRaw.includes('href="index.html#method"') &&
  unvHtmlRaw.includes('https://github.com/mindsyourai/mizan/blob/main/RECONCILIATION.md') &&
  unvHtmlRaw.includes('href="https://github.com/mindsyourai/mizan"'));

// Filter tests on the unverified page
function resetUnv() {
  unv.els['unverified-search'].value = ''; unv.els['unverified-cat'].value = 'all';
  unv.els['unverified-status'].value = 'all';
  unv.els['unverified-search']._fire('input');
}
resetUnv();
unv.els['unverified-status'].value = 'differs';
unv.els['unverified-status']._fire('change');
check('unverified filter: status differs shows 17 cards',
  count(/class="finding-card"/g, uHtml()) === 17, 'got ' + count(/class="finding-card"/g, uHtml()));
resetUnv();
unv.els['unverified-status'].value = 'cannot_verify';
unv.els['unverified-status']._fire('change');
check('unverified filter: status cannot_verify shows 9 cards',
  count(/class="finding-card"/g, uHtml()) === 9, 'got ' + count(/class="finding-card"/g, uHtml()));
resetUnv();
unv.els['unverified-search'].value = 'sea';
unv.els['unverified-search']._fire('input');
check('unverified filter: "sea" narrows cards',
  count(/class="finding-card"/g, uHtml()) >= 1 && count(/class="finding-card"/g, uHtml()) < 26,
  'got ' + count(/class="finding-card"/g, uHtml()) + ' cards');
resetUnv();
check('unverified filter: reset restores 26 cards', count(/class="finding-card"/g, uHtml()) === 26);

/* ================= GRID STRUCTURE (2026-11-21 nested-grid fix) =================
   The redesign shipped a nested-grid bug: each render wrapped its cards in an
   inner grid div inside a host that CSS also made a grid, so the inner grid
   collapsed to a single track (~250–330px) at desktop width. Fix: cards are
   direct children of the grid host; the inner wrappers are gone. These checks
   pin that structure so it cannot regress silently. */
console.log('\n--- grid structure (nested-grid fix) ---');
const WRAPPERS = ['hero-stats', 'fact-grid', 'corpus-grid', 'surah-grid', 'finding-grid', 'name-grid'];
const renderedHosts = {
  '#stats': heroHtml,
  '#facts-table': factsHtml,
  '#corpus-table': corpHtml,
  '#surahs-list': surahsHtml,
  '#verified-list': vHtml(),
  '#names-list': main.els['names-list'] ? main.els['names-list'].innerHTML : '',
  '#unverified-list': uHtml(),
};
Object.entries(renderedHosts).forEach(([host, html]) => {
  check('grid: no inner wrapper divs in rendered ' + host,
    !WRAPPERS.some((w) => html.includes('class="' + w + '"')),
    WRAPPERS.filter((w) => html.includes('class="' + w + '"')).join(', ') || 'cards are direct children');
});
check('grid: hosts are grids in CSS, inner wrappers are not',
  /\.stats\{display:grid/.test(css) &&
  /#facts-table,#corpus-table\{display:grid/.test(css) &&
  /#surahs-list\{display:grid/.test(css) &&
  /#verified-list,#unverified-list\{display:grid/.test(css) &&
  /#names-list\{display:grid/.test(css) &&
  !/\.hero-stats\{display:grid/.test(css) &&
  !/\.fact-grid\{display:grid/.test(css) &&
  !/\.corpus-grid\{display:grid/.test(css) &&
  !/\.surah-grid\{display:grid/.test(css) &&
  !/\.finding-grid\{display:grid/.test(css) &&
  !/\.name-grid\{display:grid/.test(css),
  'hosts grid; wrappers not');
const mq = (css.split('@media (max-width:640px)').pop() || '');
check('grid: mobile single-column rule lists the hosts, none of the removed wrappers',
  mq.includes('#names-list') && mq.includes('#verified-list') &&
  !WRAPPERS.some((w) => mq.includes('.' + w)),
  'mobile rule covers hosts, no wrappers');
check('grid: bare <p> children of the grids span the full width (empty states)',
  css.includes('#facts-table>p') && css.includes('#names-list>p') &&
  css.includes('grid-column:1/-1'));
check('copy: Verified intro says cards, not "one table"',
  !indexHtml.includes('in one table') && !indexHtml.includes('on every row') &&
  indexHtml.includes('each as a card') && indexHtml.includes('on every card'));
check('graph: canvas sits in a horizontal-scroll wrapper in index.html',
  indexHtml.includes('<div class="graph-scroll"><canvas id="graph"'));
check('graph: CSS gives the scroll wrapper overflow-x:auto and the canvas a readable min-width',
  css.includes('.graph-scroll{overflow-x:auto}') && css.includes('min-width:860px'));
check('graph: desktop width rule unchanged (width:100%)',
  /#graph\{[^}]*width:100%/.test(css));
check('graph: hint tells small-screen users to scroll sideways',
  indexHtml.includes('scroll sideways to see the whole graph'));

/* ================= NO HARUN YAHYA ================= */
console.log('\n--- no Harun Yahya ---');
const scholarJsonRaw = fs.readFileSync('data/scholar_findings.json', 'utf8');
check('site: no "Harun Yahya" name or harunyahya link anywhere rendered or in web files',
  !vHtml().includes('Harun Yahya') && !uHtml().includes('Harun Yahya') &&
  !dataJsRaw.includes('Harun Yahya') && !dataJsRaw.includes('harunyahya') &&
  !locJsRaw.includes('Harun Yahya') && !locJsRaw.includes('harunyahya') &&
  !appJs.includes('Harun Yahya') && !appJs.includes('harunyahya') &&
  !indexHtml.includes('Harun Yahya') && !unvHtmlRaw.includes('Harun Yahya') &&
  !scholarJsonRaw.includes('Harun Yahya') && !scholarJsonRaw.includes('harunyahya'));
check('site: only "Yahya" left is Yahya ibn al-Harith, the classical transmitter (1× in data.js, 1× in scholar_findings.json, 0 elsewhere)',
  count(/Yahya ibn al-Harith/g, dataJsRaw) === 1 &&
  count(/Yahya ibn al-Harith/g, scholarJsonRaw) === 1 &&
  count(/Yahya ibn al-Harith/g, locJsRaw) === 0 &&
  count(/Yahya ibn al-Harith/g, appJs) === 0 &&
  count(/Yahya ibn al-Harith/g, indexHtml) === 0 &&
  count(/Yahya ibn al-Harith/g, unvHtmlRaw) === 0 &&
  dataJsRaw.includes('Classical counts (al-Suyuti via Yahya ibn al-Harith and others)'),
  'data.js=' + count(/Yahya ibn al-Harith/g, dataJsRaw) +
  ' scholar_findings.json=' + count(/Yahya ibn al-Harith/g, scholarJsonRaw));

const failed = checks.filter((c) => !c[1]);
console.log('\n' + (failed.length === 0 ? 'ALL CHECKS PASSED (' + checks.length + ')' : 'FAILURES: ' + failed.length + ' of ' + checks.length));
if (failed.length) {
  console.log('FAILED CHECKS:');
  failed.forEach((c) => console.log('  - ' + c[0] + (c[2] ? '  (' + c[2] + ')' : '')));
}
if (main.data.quran_facts_sample || main.data.corpus_numbers_sample)
  console.log('NOTE: facts/corpus tables currently use SAMPLE data (Agent A files not landed) — replace data/quran_facts.json and data/corpus_numbers.json with Agent A\'s files and re-run build.py + this verifier before any push.');
process.exit(failed.length === 0 ? 0 : 1);
