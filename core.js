/* ============================================================
   Slovenčina — Kern
   Datenhaltung, Leitner-Kästen, Sessionaufbau, Übungserzeugung
   ============================================================ */
'use strict';

/* ---------- Sprachen ----------
   Alles Sprachspezifische steht hier. Eine weitere Sprache braucht
   einen Eintrag und einen Ordner unter data/. */
const LANGS = {
  sk: {
    code: 'sk', name: 'Slowakisch', flag: '\uD83C\uDDF8\uD83C\uDDF0',
    hello: 'Dnes', helloDe: 'heute',
    speech: 'sk-SK', fallback: 'cs-CZ',
    accent: '#1E4FA3', tint: '#EDF2FA', wash: '#DFE6F1', warm: '#C8892B',
    warmWash: '#FBF3E4', warmInk: '#8A6420',
  },
  it: {
    code: 'it', name: 'Italienisch', flag: '\uD83C\uDDEE\uD83C\uDDF9',
    hello: 'Oggi', helloDe: 'heute',
    speech: 'it-IT', fallback: 'it-IT',
    accent: '#2F6B4A', tint: '#EAF2EC', wash: '#D8E7DD', warm: '#C0562E',
    warmWash: '#FBF1EA', warmInk: '#A0451F',
  },
};
const LANG_ORDER = ['sk', 'it'];

/* Die aktive Sprache steht ausserhalb des Lernstands — sie ist eine
   Eigenschaft des Geraets, nicht des Fortschritts. */
const LKEY = 'lingua_lang';
function currentLang() {
  try {
    const v = localStorage.getItem(LKEY);
    if (v && LANGS[v]) return v;
  } catch (e) {}
  return 'sk';
}
function setLang(code) {
  if (!LANGS[code]) return;
  try { localStorage.setItem(LKEY, code); } catch (e) {}
}
function otherLang(code) {
  const i = LANG_ORDER.indexOf(code || currentLang());
  return LANG_ORDER[(i + 1) % LANG_ORDER.length];
}
function applyTheme(code) {
  const L = LANGS[code] || LANGS.sk;
  const r = document.documentElement.style;
  r.setProperty('--cobalt', L.accent);
  r.setProperty('--tint', L.tint);
  r.setProperty('--cobalt-wash', L.wash);
  r.setProperty('--ochre', L.warm);
  r.setProperty('--ochre-wash', L.warmWash);
  r.setProperty('--ochre-ink', L.warmInk);
}

/* ---------- Speicher ---------- */
function storeKey() { return 'lingua_' + currentLang(); }

const Store = {
  data: null,

  blank() {
    return {
      v: 2,
      words: {},        // id -> {box, due, strength, learned}
      phrases: {},      // id -> {box, due, strength}
      grammar: {},      // kapitel-id -> {seen, right, last, t}
      days: {},         // 'YYYY-MM-DD' -> {seen, right, newWords, sessions}
      settings: { goal: 24, speech: true },
      started: Store.today(),
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(storeKey());
      this.data = raw ? JSON.parse(raw) : this.blank();
    } catch (e) {
      this.data = this.blank();
    }
    if (!this.data.words) this.data = this.blank();
    if (!this.data.grammar) this.data.grammar = {};
    if (!this.data.settings) this.data.settings = { goal: 24, speech: true };
    if (this.data.settings.speech === undefined) this.data.settings.speech = true;
    return this.data;
  },

  save() {
    try { localStorage.setItem(storeKey(), JSON.stringify(this.data)); }
    catch (e) { /* Speicher voll oder gesperrt — Sitzung läuft weiter */ }
  },

  today() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  },

  dayKey(offset) {
    const d = new Date();
    d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  },

  day(key) {
    const k = key || this.today();
    if (!this.data.days[k]) this.data.days[k] =
      { seen: 0, right: 0, newWords: 0, sessions: 0, drill: 0, drillRight: 0 };
    const d = this.data.days[k];
    if (d.sessions === undefined) d.sessions = 0;
    if (d.drill === undefined) d.drill = 0;
    if (d.drillRight === undefined) d.drillRight = 0;
    return this.data.days[k];
  },

  reset() {
    this.data = this.blank();
    this.save();
  },
};

/* ---------- Leitner ---------- */
// Kasten 1..5, Intervalle in Tagen
const INTERVALS = [0, 1, 3, 7, 14, 35];
const MASTER_BOX = 4;   // ab hier gilt ein Wort als im Langzeitgedächtnis

const Leitner = {
  state(map, id) {
    if (!map[id]) map[id] = { box: 1, due: null, strength: 0, learned: null, t: Date.now() };
    return map[id];
  },

  // Jede Aenderung bekommt einen Zeitstempel — daran entscheidet sich
  // beim Abgleich zweier Geraete, welcher Stand der juengere ist.
  touch(map, id) {
    const st = this.state(map, id);
    st.t = Date.now();
    return st;
  },

  isDue(st) {
    if (!st || st.due === null) return true;
    return st.due <= Store.today();
  },

  // seen=false → Wort war noch nie dran
  seen(map, id) { return !!map[id]; },

  promote(map, id) {
    const st = this.touch(map, id);
    const before = st.box;
    st.box = Math.min(5, st.box + 1);
    st.due = Store.dayKey(INTERVALS[st.box]);
    if (before < MASTER_BOX && st.box >= MASTER_BOX && !st.learned) {
      st.learned = Store.today();
      Store.day().newWords++;
    }
    return st;
  },

  demote(map, id) {
    const st = this.touch(map, id);
    st.box = 1;
    st.due = Store.dayKey(1);
    st.learned = null;
    return st;
  },

  // Übungsstufe: 0 neu · 1 erkennen · 2 zusammensetzen · 3 tippen · 4 sprechen
  raise(map, id, level) {
    const st = this.state(map, id);
    if (level > st.strength) { st.strength = level; st.t = Date.now(); }
  },
};

/* ---------- Textvergleich ---------- */
const Text = {
  norm(s) {
    return (s || '')
      .toLowerCase()
      .replace(/[.,!?;:„"“”'`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  },

  // ohne Diakritika — für die Zwischenstufe „fast richtig"
  flat(s) {
    return this.norm(s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/ľ/g, 'l').replace(/ď/g, 'd')
      .replace(/ť/g, 't').replace(/ň/g, 'n');
  },

  // Abstand nach Levenshtein — fuer die Toleranz bei einem Tippfehler
  dist(a, b) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 2) return 99;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  },

  // 'exact' | 'diacritics' | 'typo' | 'close' | 'wrong'
  compare(said, target) {
    const a = this.norm(said), b = this.norm(target);
    if (!a) return 'wrong';
    if (a === b) return 'exact';
    if (this.flat(a) === this.flat(b)) return 'diacritics';
    // Ein einzelner falscher Buchstabe soll kein ganzer Fehler sein —
    // es geht ums Hoeren und Verstehen, nicht um Rechtschreibung.
    const erlaubt = b.length > 12 ? 2 : 1;
    if (this.dist(this.flat(a), this.flat(b)) <= erlaubt) return 'typo';
    const aw = a.split(' '), bw = b.split(' ');
    let hit = 0;
    const pool = bw.slice();
    aw.forEach(w => {
      const i = pool.findIndex(x => this.flat(x) === this.flat(w));
      if (i >= 0) { hit++; pool.splice(i, 1); }
    });
    return (hit / Math.max(bw.length, 1)) >= 0.7 ? 'close' : 'wrong';
  },

  // Welche Zeichen mit Diakritikum wurden verschluckt?
  missedMarks(said, target) {
    const marks = [];
    const t = this.norm(target), s = this.norm(said);
    if (this.flat(t) !== this.flat(s)) return marks;
    for (let i = 0; i < t.length && i < s.length; i++) {
      if (t[i] !== s[i] && this.flat(t[i]) === this.flat(s[i])) {
        if (!marks.includes(t[i])) marks.push(t[i]);
      }
    }
    return marks;
  },
};

/* ---------- Ausspracheerklärungen ---------- */
const SOUNDS = {
  'ď': 'weiches d, etwa wie „dj“',
  'ť': 'weiches t, etwa wie „tj“',
  'ň': 'weiches n, wie in „Cognac“',
  'ľ': 'weiches l, Zunge am Gaumen',
  'š': 'wie „sch“',
  'č': 'wie „tsch“',
  'ž': 'wie das „g“ in „Garage“',
  'á': 'langes a',
  'é': 'langes e',
  'í': 'langes i',
  'ó': 'langes o',
  'ú': 'langes u',
  'ý': 'langes i',
  'ô': 'wie „uo“',
  'ä': 'offenes ä',
  'ĺ': 'langes l',
  'ŕ': 'langes r',
};

/* ---------- Sprachausgabe ---------- */
const Voice = {
  ready: false,
  pick: null,

  /* Alle Stimmen der aktiven Sprache — fuer die Auswahl im Profil. */
  list(lang) {
    if (!window.speechSynthesis) return [];
    const L = LANGS[lang || currentLang()] || LANGS.sk;
    const main = L.speech.slice(0, 2).toLowerCase();
    const back = L.fallback.slice(0, 2).toLowerCase();
    const vs = window.speechSynthesis.getVoices();
    const a = vs.filter(v => v.lang.toLowerCase().startsWith(main));
    return a.length ? a : vs.filter(v => v.lang.toLowerCase().startsWith(back));
  },

  /* Die selbst gewaehlte Stimme steht pro Sprache im Geraetespeicher,
     nicht im Lernstand — sie gehoert zum Geraet. */
  chosenKey() { return 'lingua_voice_' + currentLang(); },
  chosen() {
    try { return localStorage.getItem(this.chosenKey()) || ''; } catch (e) { return ''; }
  },
  choose(uri) {
    try { localStorage.setItem(this.chosenKey(), uri || ''); } catch (e) {}
    this.resolve();
  },

  rate() {
    try {
      const v = parseFloat(localStorage.getItem('lingua_rate'));
      return isNaN(v) ? 0.8 : v;
    } catch (e) { return 0.8; }
  },
  setRate(v) { try { localStorage.setItem('lingua_rate', String(v)); } catch (e) {} },

  resolve() {
    const vs = this.list();
    if (!vs.length) { this.pick = null; return; }
    const want = this.chosen();
    this.pick = (want && vs.find(v => v.voiceURI === want)) || vs[0];
    this.ready = true;
  },

  init() {
    if (!window.speechSynthesis) return;
    const load = () => { if (window.speechSynthesis.getVoices().length) this.resolve(); };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    setTimeout(load, 700);
  },

  /* Auf iOS vergeht zwischen speak() und dem tatsaechlichen Beginn je nach
     Geraet bis zu zwei Sekunden. Wer frueher nachfasst, wuergt die Ausgabe ab. */
  say(text, opts) {
    if (!window.speechSynthesis || !text) return;
    opts = opts || {};
    const SS = window.speechSynthesis;

    this.unlock();

    // Nur abbrechen, wenn wirklich etwas laeuft — ein cancel() auf eine
    // leere Warteschlange kann die Ausgabe auf iOS blockieren.
    if (SS.speaking || SS.pending) SS.cancel();

    // Einzelne Woerter klingen ohne Satzzeichen abgehackt.
    let t = String(text).trim();
    if (!/[.?!\u2026]$/.test(t) && t.split(/\s+/).length <= 2) t += '.';

    const conf = LANGS[currentLang()] || LANGS.sk;
    const rate = opts.rate || this.rate();
    const mk = (withVoice) => {
      const u = new SpeechSynthesisUtterance(t);
      if (withVoice && this.pick) u.voice = this.pick;
      u.lang = conf.speech;
      u.rate = rate;
      return u;
    };

    let lief = false;
    const u = mk(true);
    u.onstart = () => { lief = true; };
    SS.speak(u);

    if (opts.retry === false) return;
    // Grosszuegig warten und nur eingreifen, wenn die Warteschlange
    // nachweislich leer ist — sonst unterbricht man das Anlaufen.
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      if (lief || SS.speaking || SS.pending) return;
      SS.speak(mk(false));
    }, 1800);
  },

  /* Der Klingelschalter legt reine Web-Audio-Ausgabe still. Eine einmal
     angestossene stille Tonspur stuft die Sitzung als echte Wiedergabe ein. */
  unlock() {
    if (this._unlocked) return;
    this._unlocked = true;
    try {
      const a = document.createElement('audio');
      a.setAttribute('x-webkit-airplay', 'deny');
      a.preload = 'auto';
      a.loop = true;
      a.volume = 0.001;
      a.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ohne Freigabe geht es meist trotzdem */ }
  },

  /* Nach dem Zurueckkehren aus dem Hintergrund bleibt die Ausgabe auf iOS
     gelegentlich haengen. Ein Aufwecken raeumt das auf. */
  wake() {
    if (!window.speechSynthesis) return;
    // Nur aufwecken, nicht abbrechen: ein cancel() auf eine leere
    // Warteschlange kann die Ausgabe auf iOS selbst stilllegen.
    try { window.speechSynthesis.resume(); } catch (e) {}
  },

};

/* ---------- Spracherkennung ---------- */
const Listen = {
  SR: window.SpeechRecognition || window.webkitSpeechRecognition || null,
  rec: null,
  active: false,

  get available() { return !!this.SR; },

  start(onPartial, onDone, onError) {
    if (!this.SR || this.active) return;
    let rec;
    try { rec = new this.SR(); }
    catch (e) { onError && onError('start-failed'); return; }

    this.rec = rec;
    this.active = true;
    let last = '';

    rec.lang = (LANGS[currentLang()] || LANGS.sk).speech;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    rec.onresult = ev => {
      const r = ev.results[ev.results.length - 1];
      last = r[0].transcript;
      onPartial && onPartial(last, r.isFinal);
    };
    rec.onerror = ev => {
      this.active = false;
      onError && onError(ev.error || 'unknown');
    };
    rec.onend = () => {
      this.active = false;
      this.rec = null;
      onDone && onDone(last);
    };

    try { rec.start(); }
    catch (e) { this.active = false; onError && onError('start-failed'); }
  },

  stop() {
    if (this.rec) { try { this.rec.stop(); } catch (e) { /* schon beendet */ } }
  },
};

/* ---------- Hilfsfunktionen ---------- */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample(arr, n) { return shuffle(arr).slice(0, n); }

const LVL_RANK = { A1: 1, A2: 2, B1: 3 };


/* ---------- Abgleich zwischen Geraeten ----------
   Der Code steht bewusst ausserhalb des Lernstands: Er ist eine
   Einstellung des Geraets und wird nie mit uebertragen. */
const SKEY = 'lingua_sync';

const Sync = {
  cfg() {
    try {
      const raw = localStorage.getItem(SKEY);
      return raw ? JSON.parse(raw) : { code: '', last: null, state: 'aus' };
    } catch (e) { return { code: '', last: null, state: 'aus' }; }
  },

  save(cfg) { try { localStorage.setItem(SKEY, JSON.stringify(cfg)); } catch (e) {} },

  get on() { return !!this.cfg().code; },

  connect(code) {
    const c = this.cfg();
    c.code = String(code || '').trim();
    c.state = c.code ? 'bereit' : 'aus';
    this.save(c);
  },

  disconnect() { this.save({ code: '', last: null, state: 'aus' }); },

  /* Zwei Staende zusammenfuehren.
     Je Wort gewinnt der juengere Zeitstempel. Fehlt einer — etwa bei
     Staenden aus der Zeit vor dem Abgleich — gewinnt der hoehere Kasten,
     damit nichts verloren geht. */
  merge(mine, theirs) {
    if (!theirs || !theirs.words) return mine;
    const out = {
      v: 2,
      words: {}, phrases: {}, grammar: {}, days: {},
      settings: mine.settings || { goal: 24, speech: true },
      started: [mine.started, theirs.started].filter(Boolean).sort()[0] || Store.today(),
    };
    ['words', 'phrases'].forEach(kind => {
      const a = mine[kind] || {}, b = theirs[kind] || {};
      Object.keys(a).concat(Object.keys(b)).forEach(id => {
        if (out[kind][id]) return;
        const x = a[id], y = b[id];
        if (!x) { out[kind][id] = y; return; }
        if (!y) { out[kind][id] = x; return; }
        if (typeof x.t === 'number' && typeof y.t === 'number') {
          out[kind][id] = x.t >= y.t ? x : y;
        } else {
          out[kind][id] = (x.box || 1) >= (y.box || 1) ? x : y;
        }
      });
    });
    // Stand je Grammatikkapitel: der jüngere Zeitstempel gewinnt
    const ga = mine.grammar || {}, gb = theirs.grammar || {};
    Object.keys(ga).concat(Object.keys(gb)).forEach(id => {
      if (out.grammar[id]) return;
      const x = ga[id], y = gb[id];
      if (!x) { out.grammar[id] = y; return; }
      if (!y) { out.grammar[id] = x; return; }
      out.grammar[id] = (x.t || 0) >= (y.t || 0) ? x : y;
    });
    const da = mine.days || {}, db = theirs.days || {};
    Object.keys(da).concat(Object.keys(db)).forEach(k => {
      if (out.days[k]) return;
      const x = da[k] || {}, y = db[k] || {};
      out.days[k] = {
        seen: Math.max(x.seen || 0, y.seen || 0),
        right: Math.max(x.right || 0, y.right || 0),
        newWords: Math.max(x.newWords || 0, y.newWords || 0),
        sessions: Math.max(x.sessions || 0, y.sessions || 0),
        drill: Math.max(x.drill || 0, y.drill || 0),
        drillRight: Math.max(x.drillRight || 0, y.drillRight || 0),
      };
    });
    return out;
  },

  url() { return 'sync?code=' + encodeURIComponent(this.cfg().code + ':' + currentLang()); },

  /* Holen, zusammenfuehren, zurueckschreiben. */
  async run(silent) {
    const cfg = this.cfg();
    if (!cfg.code) return { ok: false, grund: 'kein-code' };
    try {
      const res = await fetch(this.url(), { cache: 'no-store' });
      const got = await res.json();
      if (got.error) return { ok: false, grund: got.error };

      const merged = got.leer ? Store.data : this.merge(Store.data, got.data);
      Store.data = merged;
      Store.save();

      const put = await fetch('sync', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: cfg.code + ':' + currentLang(), data: merged }),
      });
      const res2 = await put.json();
      if (res2.error) return { ok: false, grund: res2.error };

      cfg.last = Date.now(); cfg.state = 'bereit';
      this.save(cfg);
      return { ok: true };
    } catch (e) {
      const c = this.cfg(); c.state = 'offline'; this.save(c);
      return { ok: false, grund: 'offline' };
    }
  },
};

/* ---------- Ablenker ----------
   Falsche Antwortmöglichkeiten kommen nur aus Wörtern, die schon
   begonnen wurden. Sonst liesse sich jede Frage durch Ausschliessen
   lösen: was man noch nie gesehen hat, ist selten die richtige Antwort. */
function distractorPool(DB, v) {
  const W = Store.data.words;
  let pool = DB.vocab.filter(x => x.id !== v.id && W[x.id] && x.pos === v.pos);
  if (pool.length < 3) pool = DB.vocab.filter(x => x.id !== v.id && W[x.id]);
  if (pool.length < 3) {
    // Am Anfang sind noch zu wenige Wörter begonnen: die nächsten der Liste
    const near = DB.vocab.filter(x => x.id !== v.id && x.level === v.level);
    const i = Math.max(0, near.findIndex(x => x.ord >= v.ord) - 6);
    pool = pool.concat(near.slice(i, i + 14));
  }
  return pool;
}

/* ---------- Sessionaufbau ---------- */
const Session = {
  // Sprechübungen nur, wenn der Browser sie unterstützt UND sie eingeschaltet sind
  speechOn() {
    return Listen.available && Store.data.settings.speech !== false;
  },

  // Aktuelles Niveau aus dem Langzeitwortschatz ableiten
  level(DB) {
    const n = this.masteredCount(DB);
    if (n < 300) return 'A1';
    if (n < 800) return 'A2';
    return 'B1';
  },

  masteredCount(DB) {
    let n = 0;
    for (const id in Store.data.words) {
      if (Store.data.words[id].box >= MASTER_BOX) n++;
    }
    return n;
  },

  // Wie viele Wörter eines Satzes sind bekannt?
  coverage(sent) {
    if (!sent.words.length) return 1;
    let known = 0;
    sent.words.forEach(w => {
      const st = Store.data.words[w];
      if (st && st.box >= 2) known++;
    });
    return known / sent.words.length;
  },

  // Ein Satz ist frei, wenn genug seiner Wörter sitzen.
  // Die Nachsicht "ein unbekanntes Wort ist erlaubt" gilt erst ab drei
  // verknüpften Wörtern — sonst wäre ein Satz mit einer einzigen
  // Verknüpfung von Anfang an offen, ohne dass man ihn lösen könnte.
  unlocked(sent) {
    const n = sent.words.length;
    if (n < 2) return false;
    let unknown = 0;
    sent.words.forEach(w => {
      const st = Store.data.words[w];
      if (!st || st.box < 2) unknown++;
    });
    if (n >= 3 && unknown <= 1) return true;
    return this.coverage(sent) >= 0.8;
  },

  // Wie lang darf ein Satz auf dieser Stufe sein?
  maxTokens(level) {
    return level === 'A1' ? 6 : level === 'A2' ? 10 : 99;
  },

  // Satzübungen erst, wenn überhaupt ein Grundstock sitzt
  sentencesReady() {
    let n = 0;
    for (const id in Store.data.words) if (Store.data.words[id].box >= 2) n++;
    return n >= 30;
  },

  /* Baut die Übungsliste für heute.
     Ein neues Wort wird eingeführt und noch in derselben Session einmal
     abgefragt. Diese Sofortabfrage bewegt den Kasten NICHT — der Abstand
     soll erst nach einer Nacht wirken. Das Wort ist morgen wieder fällig. */
  build(DB) {
    const lvl = this.level(DB);
    const rank = LVL_RANK[lvl];
    const W = Store.data.words;
    const goal = Store.data.settings.goal;
    const core = [];

    // 1 · Fällige Wiederholungen
    const due = DB.vocab.filter(v => Leitner.seen(W, v.id) && Leitner.isDue(W[v.id]));
    const dueTake = sample(due, 10);
    dueTake.forEach(v => core.push({ kind: exerciseFor(W[v.id]), word: v }));

    // 2 · Sätze
    if (this.sentencesReady()) {
      const cap = this.maxTokens(lvl);
      const max = Math.max(1, Math.floor(goal / 6));
      const open = DB.sentences.filter(s =>
        LVL_RANK[s.reqLevel] <= rank && s.tokens <= cap && this.unlocked(s));
      sample(open, max).forEach(s => {
        // Haelfte Satzbau nach Vorlage, Haelfte Hoerverstehen in der
        // Stufe, die zum Stand der Woerter passt.
        core.push(Math.random() < 0.5
          ? { kind: 'build', sent: s }
          : { kind: listenStage(s), sent: s });
      });
    }

    // 3 · Phrasen der Reihe nach
    const P = Store.data.phrases;
    const canSpeak = this.speechOn();
    const ready = DB.phrases.filter(p => LVL_RANK[p.level] <= rank);
    const pDue = ready.filter(p => !P[p.id] || Leitner.isDue(P[p.id]));
    pDue.slice(0, canSpeak ? 3 : 2).forEach(p => {
      core.push({ kind: canSpeak && isPlainPhrase(p.w) ? 'speak' : 'phrasechoice', phrase: p });
    });

    // 4 · Neue Wörter — so viele, dass die Session voll wird.
    //     In den ersten Tagen gibt es nichts zu wiederholen; dann ist mehr
    //     Neues besser, als dieselben paar Wörter durchzukauen.
    const space = Math.max(0, goal - core.length - 1);   // 1 Platz für die Paare
    const count = Math.min(10, Math.max(3, Math.floor(space / 2)));
    const next = DB.vocab.filter(v => !Leitner.seen(W, v.id) && LVL_RANK[v.level] <= rank);
    const newOnes = next.slice(0, count);
    const fresh = newOnes.map(v => ([
      { kind: 'intro',  word: v },
      { kind: 'choice', word: v, dir: 'sk2de', fresh: true },
    ]));

    // 5 · Paare: neue und bekannte Wörter mischen
    if (newOnes.length >= 3) {
      const known = dueTake.length ? dueTake : DB.vocab.filter(v => Leitner.seen(W, v.id));
      const mix = newOnes.slice(0, 3).concat(sample(known, 3));
      if (mix.length >= 4) core.push({ kind: 'match', words: mix });
    }

    return this.weave(core, fresh, goal);
  },

  /* Verteilt so, dass zwischen zwei Begegnungen mit demselben Wort
     mindestens drei andere Aufgaben liegen. Passt keine Stelle, entfällt
     die Sofortabfrage lieber, als sie direkt anzuhängen. */
  weave(core, fresh, goal) {
    const base = shuffle(core);
    const out = [];
    const n = fresh.length || 1;
    const step = Math.max(2, Math.round((base.length + n) / n));

    let bi = 0;
    fresh.forEach(pair => {
      out.push(pair[0]);
      for (let k = 0; k < step - 1 && bi < base.length; k++) out.push(base[bi++]);
    });
    while (bi < base.length) out.push(base[bi++]);

    fresh.forEach(pair => {
      const id = pair[1].word.id;
      const at = out.findIndex(x => x.kind === 'intro' && x.word && x.word.id === id);
      if (at < 0) return;
      let placed = false;
      for (let j = at + 4; j <= out.length; j++) {
        if (touches(out[j - 1], id) || touches(out[j], id)) continue;
        out.splice(j, 0, pair[1]);
        placed = true;
        break;
      }
      if (!placed && out.length && !touches(out[out.length - 1], id)) out.push(pair[1]);
    });

    return out.slice(0, goal);
  },
};

/* Kommt dieses Wort in der Aufgabe vor? */
function touches(item, id) {
  if (!item) return false;
  if (item.word) return item.word.id === id;
  if (item.words) return item.words.some(v => v.id === id);
  if (item.sent) return item.sent.words.indexOf(id) !== -1;
  return false;
}

/* Welche Übungsform ist dran?
   Je sicherer ein Wort sitzt, desto mehr wird verlangt:
   Kasten 1 erkennen, ab Kasten 2 auch selbst schreiben. */
function exerciseFor(st) {
  const box = (st && st.box) || 1;
  // Selbst schreiben erst, wenn ein Wort wirklich sitzt. Frueher ist es
  // eine Rechtschreibpruefung, keine Vokabeluebung.
  if (box < 4) return 'choice';
  return Math.random() < 0.6 ? 'type' : 'choice';
}

/* Welche Hoerverstehens-Stufe passt zu diesem Satz?
   Die Anforderung waechst mit den Kaesten seiner Woerter. */
function listenStage(sent) {
  const W = Store.data.words;
  if (!sent.words.length) return 'listen';
  let min = 9;
  sent.words.forEach(id => { min = Math.min(min, (W[id] && W[id].box) || 1); });

  // Zwei Bedingungen muessen zusammenkommen: Die Woerter dieses Satzes
  // muessen sitzen UND man muss insgesamt weit genug sein. Sonst kaeme
  // freies Schreiben schon in der zweiten Woche, nur weil ein kurzer
  // Satz aus drei gut geuebten Woertern besteht.
  const gesamt = Stats.mastered();
  if (min >= 5 && gesamt >= 150) return 'dictation';    // frei eintippen
  if (min >= 3 && gesamt >= 40) return 'listenbuild';   // aus Bausteinen bauen
  return 'listen';                                      // Bedeutung waehlen
}

/* ---------- Aufgaben erzeugen ---------- */
const Make = {
  // Mehrfachauswahl über eine Vokabel
  choice(v, DB, forceDir) {
    const dir = forceDir || (Math.random() < 0.5 ? 'de2sk' : 'sk2de');
    const wrong = sample(distractorPool(DB, v), 3);
    const key = dir === 'de2sk' ? 'w' : 'de';
    return {
      dir,
      ask: dir === 'de2sk' ? v.de : v.w,
      answer: v[key],
      options: shuffle(wrong.map(x => x[key]).concat([v[key]])),
    };
  },

  // Paare zuordnen: fünf deutsche und fünf slowakische Wörter
  pairs(words) {
    const pick = sample(words, Math.min(5, words.length));
    return {
      left:  shuffle(pick.map(v => ({ id: v.id, text: v.de }))),
      right: shuffle(pick.map(v => ({ id: v.id, text: v.w }))),
      total: pick.length,
    };
  },

  // Satz anhoeren, Bedeutung waehlen — die erste Stufe des Hoerverstehens.
  listen(sent, DB) {
    const pool = DB.sentences.filter(x => x.id !== sent.id && x.de !== sent.de);
    const wrong = sample(pool, 3).map(x => x.de);
    return { answer: sent.de, options: shuffle(wrong.concat([sent.de])) };
  },

  // Wortbausteine aus einem Satz.
  // Ablenker kommen aus denselben Wortarten wie der Satz — sonst
  // liesse sich die Aufgabe durch blosses Ausschliessen loesen.
  build(s, DB) {
    const target = s.w.replace(/\s+/g, ' ').trim();
    const parts = target.split(' ');
    const low = target.toLowerCase();
    const kinds = s.words.map(id => DB.byId[id] && DB.byId[id].pos).filter(Boolean);
    let pool = DB.vocab.filter(v =>
      kinds.indexOf(v.pos) !== -1 && low.indexOf(v.w.toLowerCase()) === -1);
    if (pool.length < 4) {
      pool = DB.vocab.filter(v => low.indexOf(v.w.toLowerCase()) === -1);
    }
    const want = Math.min(3, Math.max(2, 6 - parts.length));
    const extras = sample(pool, want).map(v => v.w);
    return { target, parts, bank: shuffle(parts.concat(extras)) };
  },
};

/* ---------- Phrasen ohne Platzhalter ----------
   „Mi chiamo…", „Come si dice … in italiano?" und Formen mit Schrägstrich
   („allergico / allergica") lassen sich weder eintippen noch nachsprechen. */
function isPlainPhrase(text) {
  return !/\.\.\.|\u2026|\s\/\s|___/.test(String(text || ''));
}

/* ---------- Üben aus der Bibliothek ----------
   Sätze, Phrasen und Grammatik laufen über dieselbe Aufgabenmaschine wie die
   Session (Run). Hier entstehen nur die Aufgabenlisten und die Regeln,
   was eine Antwort bewirkt.

   Regeln wie beim Vokabel-Üben:
   - zählt getrennt (drill), nie auf das Tagesziel und nie auf die Serie
   - eine richtige Antwort rückt nur ein FÄLLIGES Wort oder eine fällige
     Phrase vor, sonst liesse sich der Wiederholungsabstand aushebeln
   - ein Fehler stuft nur das zurück, was sich eindeutig zuordnen lässt:
     beim Lückensatz das Zielwort, bei Phrasen die Phrase. Beim Satzbau
     oder Diktat bleibt alles stehen — dort ist unklar, welches Wort schuld war
   - Grammatik hat keine Kästen, nur einen Stand je Kapitel */
const Practice = {
  ROUND: 10,
  last: null,
  CTX_ORDER: ['Begrüßung', 'Kennenlernen', 'Höflichkeit', 'Verständigung',
              'Orientierung', 'Einkaufen', 'Restaurant', 'Hotel & Reise', 'Notfall'],

  /* ---- Hilfen ---- */
  pickWeighted(list) {
    let sum = 0;
    list.forEach(x => { sum += x[1]; });
    let r = Math.random() * sum;
    for (let i = 0; i < list.length; i++) {
      r -= list[i][1];
      if (r <= 0) return list[i][0];
    }
    return list[list.length - 1][0];
  },

  conf(id) {
    const P = DB.practice;
    return (P && P.chapters && P.chapters[id]) || null;
  },

  // Wörter eines Satzes samt Satzzeichen davor und dahinter
  words(text) {
    return String(text || '').trim().split(/\s+/).filter(Boolean).map(raw => {
      const m = raw.match(/^([„"“‘'(¿¡]*)(.*?)([.,!?;:…"”’')]*)$/);
      return { raw, pre: m[1], core: m[2], post: m[3] };
    });
  },

  likeCase(ref, s) {
    const big = ref && ref[0] !== ref[0].toLowerCase();
    return big ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  },

  /* Grundformen der Vokabeln: ohne Artikel, mehrere Schreibweisen getrennt.
     Mehrwortausdrücke bleiben draussen, sie stehen selten als Ganzes im Satz. */
  lemmasOf(v) {
    if (!/^(noun|adj|adv|verb)$/.test(v.pos)) return [];
    const out = [];
    String(v.w).split(/\s*\/\s*/).forEach(part => {
      let w = part.toLowerCase().trim();
      w = w.replace(/^(?:(?:il|lo|la|i|gli|le|un|una|uno)\s+|l'|un')/, '');
      if (w && !/\s/.test(w)) out.push(w);
    });
    return out;
  },

  /* Deutsche Bedeutungen einer Vokabel ohne Artikel und Klammern. Zwei Wörter
     mit gleicher Bedeutung (camera/stanza, ísť/chodiť) dürfen nicht als
     Ablenker füreinander dienen — sonst wäre beides richtig. */
  meanings(v) {
    return String(v.de).toLowerCase().split(/\s*[,\/;]\s*/)
      .map(d => d.replace(/\(.*?\)/g, '').trim().replace(/^(?:der|die|das|ein|eine|einen|zu|sich)\s+/, ''))
      .filter(Boolean);
  },

  sameMeaning(a, b) {
    const m = this.meanings(a);
    return this.meanings(b).some(x => m.indexOf(x) !== -1);
  },

  lemmas() {
    if (this._lemFor === DB.vocab) return this._lem;
    const idx = {};
    DB.vocab.forEach(v => this.lemmasOf(v).forEach(l => { if (!idx[l]) idx[l] = v; }));
    this._lemFor = DB.vocab;
    this._lem = idx;
    return idx;
  },

  /* ---------- Sätze ---------- */
  pool() { return DB.sentences.filter(s => Session.unlocked(s)); },

  sentenceRound() {
    const pool = this.pool();
    if (pool.length < 4) return [];
    const canSpeak = Session.speechOn();
    return sample(pool, Math.min(this.ROUND, pool.length))
      .map(s => this.sentenceItem(s, canSpeak));
  },

  sentenceItem(s, canSpeak) {
    const long = s.w.split(/\s+/).length > 9;   // lange Sätze nicht als Bausteine
    const r = Math.random();
    const fx = { words: s.words };
    if (r < 0.30) {
      const cz = this.clozeFromSentence(s);
      if (cz) return cz;
    }
    if (r < 0.55 && !long) return { kind: 'build', sent: s, fx };
    if (canSpeak && r > 0.85) {
      return { kind: 'speak', phrase: { id: s.id, w: s.w, de: s.de, context: '' }, fx: {} };
    }
    let kind = listenStage(s);
    if (long && kind === 'listenbuild') kind = 'listen';
    return { kind, sent: s, fx };
  },

  /* Ein Inhaltswort ausblenden. Ablenker stammen aus derselben Wortart und
     aus bereits begonnenen Wörtern; der deutsche Satz steht als Hilfe darüber. */
  clozeFromSentence(s) {
    const W = Store.data.words, idx = this.lemmas();
    const toks = this.words(s.w);
    if (toks.length < 3) return null;
    const count = {};
    toks.forEach(t => { const k = t.core.toLowerCase(); count[k] = (count[k] || 0) + 1; });
    const cands = [];
    toks.forEach((t, i) => {
      const k = t.core.toLowerCase();
      if (count[k] === 1 && idx[k]) cands.push({ i, v: idx[k] });
    });
    if (!cands.length) return null;
    const known = cands.filter(c => W[c.v.id]);
    const pick = sample(known.length ? known : cands, 1)[0];
    const t = toks[pick.i], v = pick.v;
    const here = {};
    toks.forEach(x => { here[x.core.toLowerCase()] = 1; });
    let forms = DB.vocab
      .filter(x => x.id !== v.id && x.pos === v.pos && W[x.id] && !this.sameMeaning(x, v))
      .map(x => this.lemmasOf(x)[0]).filter(Boolean);
    forms = forms.filter((f, i) => forms.indexOf(f) === i && !here[f]);
    if (forms.length < 3) return null;
    const wrong = sample(forms, 3).map(f => this.likeCase(t.core, f));
    return {
      kind: 'cloze',
      q: {
        de: s.de,
        text: toks.map((x, i) => i === pick.i ? x.pre + '___' + x.post : x.raw).join(' '),
        answer: t.core, options: shuffle(wrong.concat([t.core])),
        hint: '', full: s.w, title: '', chapter: null,
      },
      fx: { words: s.words, demoteWord: W[v.id] ? v.id : null },
    };
  },

  /* ---------- Phrasen ---------- */
  phraseRound(ctx) {
    const pool = DB.phrases.filter(p => !ctx || p.context === ctx);
    if (pool.length < 4) return [];
    const canSpeak = Session.speechOn();
    return sample(pool, Math.min(this.ROUND, pool.length))
      .map(p => this.phraseItem(p, ctx, canSpeak));
  },

  phraseItem(p, ctx, canSpeak) {
    const plain = isPlainPhrase(p.w);
    const bag = [['w2de', 3], ['de2w', 3]];
    if (plain) {
      bag.push(['build', 2], ['dictation', 1.5]);
      if (canSpeak) bag.push(['speak', 1.5]);
    }
    const what = this.pickWeighted(bag);
    const fx = { phrase: p.id };
    const flat = { id: p.id, w: p.w, de: p.de, words: [] };
    if (what === 'build') return { kind: 'build', sent: flat, fx };
    if (what === 'dictation') return { kind: 'dictation', sent: flat, fx };
    if (what === 'speak') return { kind: 'speak', phrase: p, fx };

    // Ablenker bevorzugt aus derselben Situation — sonst ist es leicht
    const key = what === 'w2de' ? 'de' : 'w';
    const right = p[key];
    const near = DB.phrases.filter(x => x.id !== p.id && x.context === p.context);
    const far = DB.phrases.filter(x => x.id !== p.id && x.context !== p.context);
    const seen = {}; seen[right] = 1;
    const wrong = [];
    sample(near, near.length).concat(sample(far, far.length)).forEach(x => {
      if (wrong.length < 3 && !seen[x[key]]) { seen[x[key]] = 1; wrong.push(x[key]); }
    });
    return {
      kind: 'phrasechoice', dir: what, phrase: p, preset: true, fx,
      opts: shuffle(wrong.concat([right])),
    };
  },

  /* ---------- Grammatik ---------- */
  chapter(id) { return DB.grammar.find(g => g.id === id) || null; },

  // Nur Zeilen, deren Lösung eine einzelne Form ist, taugen zum Eintippen
  typable(r) {
    const t = String(r[1] || '');
    return !!t && !!r[0] && !/[\/()]|\s—\s/.test(t) && t.length <= 26;
  },

  // Slowakisch: mit oder ohne Fürwort — „ja som" und „som" gelten beide
  accept(t) {
    const list = [t];
    const bare = t.replace(/^(?:ja|ty|on\/ona|my|vy|oni)\s+/i, '');
    if (bare && bare !== t) list.push(bare);
    return list;
  },

  /* Beim Eintippen einer Endung zählt jeder Buchstabe: „parli" statt „parla"
     ist genau der Fehler, den man üben will. Deshalb keine Tippfehler-Toleranz,
     nur fehlende Zeichen (č, ľ, á …) werden nachgesehen. */
  judge(said, list) {
    const rank = { exact: 4, diacritics: 3, typo: 2, close: 1, wrong: 0 };
    let best = 'wrong', target = list[0];
    list.forEach(t => {
      const v = Text.compare(said, t);
      if (rank[v] > rank[best]) { best = v; target = t; }
    });
    return { verdict: best, target };
  },

  available(id) {
    const conf = this.conf(id), ch = this.chapter(id);
    if (!conf || !ch) return false;
    const n = (conf.items || []).length +
      (conf.forms === 'both' ? ch.table.filter(r => this.typable(r)).length : 0);
    return n >= 4;
  },

  authored(x, ch) {
    return {
      kind: 'cloze',
      q: { de: x.de, text: x.s, answer: x.a, options: shuffle(x.opts.slice()),
           hint: x.hint || '', full: x.s.replace('___', x.a), title: ch.title, chapter: ch.id },
      fx: { chapter: ch.id },
    };
  },

  /* Sätze aus dem Bestand, in denen genau eine Form des Kapitels steht.
     Die Ablenker sind die übrigen Formen derselben Tabelle. */
  autoCloze(ch, auto) {
    if (!auto || !auto.forms || !auto.forms.length) return [];
    const set = {};
    auto.forms.forEach(f => { set[f.toLowerCase()] = 1; });
    const rank = LVL_RANK[Session.level(DB)];
    const need = auto.requireDe ? new RegExp(auto.requireDe, 'i') : null;
    const skip = auto.excludeDe ? new RegExp(auto.excludeDe, 'i') : null;
    const src = DB.sentences.filter(s => LVL_RANK[s.reqLevel] <= rank)
      .concat(DB.phrases.filter(p => LVL_RANK[p.level] <= rank && isPlainPhrase(p.w)));
    const out = [];
    src.forEach(x => {
      if (need && !need.test(x.de)) return;
      if (skip && skip.test(x.de)) return;
      const toks = this.words(x.w);
      if (toks.length < 2) return;
      const hits = [];
      toks.forEach((t, i) => { if (set[t.core.toLowerCase()]) hits.push(i); });
      if (hits.length !== 1) return;
      const t = toks[hits[0]], ans = t.core.toLowerCase();
      const wrong = sample(auto.forms.filter(f => f.toLowerCase() !== ans), 3);
      out.push({
        kind: 'cloze',
        q: { de: x.de, text: toks.map((y, i) => i === hits[0] ? y.pre + '___' + y.post : y.raw).join(' '),
             answer: t.core, options: shuffle(wrong.map(f => this.likeCase(t.core, f)).concat([t.core])),
             hint: '', full: x.w, title: ch.title, chapter: ch.id },
        fx: { chapter: ch.id },
      });
    });
    return sample(out, 8);
  },

  typeItem(r, ch) {
    return {
      kind: 'gtype',
      q: { de: r[0], target: r[1], accept: this.accept(r[1]), title: ch.title, chapter: ch.id },
      fx: { chapter: ch.id },
    };
  },

  // Formen zuordnen; Zeilen mit gleicher Lösung oder gleichem Wort nur einmal
  pairsItem(ch) {
    const seenR = {}, seenL = {};
    const rows = ch.table.filter(r => {
      const a = String(r[0]).toLowerCase(), b = String(r[1]).toLowerCase();
      if (!a || !b || a.length > 42 || b.length > 28 || seenL[a] || seenR[b]) return false;
      seenL[a] = 1; seenR[b] = 1;
      return true;
    });
    if (rows.length < 4) return null;
    const pick = sample(rows, Math.min(5, rows.length));
    return {
      kind: 'gpairs', grammar: true, title: ch.title,
      q: {
        left:  shuffle(pick.map((r, i) => ({ id: 'g' + i, text: r[0] }))),
        right: shuffle(pick.map((r, i) => ({ id: 'g' + i, text: r[1] }))),
        total: pick.length,
      },
      fx: { chapter: ch.id },
    };
  },

  grammarPool(id) {
    const ch = this.chapter(id);
    if (!ch) return null;
    const conf = this.conf(id) || {};
    const seen = {};
    const clozes = shuffle((conf.items || []).map(x => this.authored(x, ch))
      .concat(this.autoCloze(ch, conf.auto)))
      .filter(it => {
        const k = it.q.full.toLowerCase();
        if (seen[k]) return false;
        seen[k] = 1;
        return true;
      });
    const types = conf.forms === 'both'
      ? shuffle(ch.table.filter(r => this.typable(r)).map(r => this.typeItem(r, ch))) : [];
    return { ch, clozes, types, pairs: conf.forms ? this.pairsItem(ch) : null };
  },

  grammarRound(id) {
    const p = this.grammarPool(id);
    if (!p) return [];
    let items = [];
    if (p.pairs) items.push(p.pairs);
    items = items.concat(p.types.slice(0, 3));
    items = items.concat(p.clozes.slice(0, this.ROUND - items.length));
    if (items.length < this.ROUND) {
      items = items.concat(p.types.slice(3, 3 + this.ROUND - items.length));
    }
    return items.length >= 4 ? shuffle(items) : [];
  },

  /* Quer durch alle Kapitel. Kapitel ohne Übung oder mit schwachem Stand
     kommen häufiger dran, aber keines dominiert die Runde. */
  mixedGrammarRound() {
    const chs = DB.grammar.filter(g => this.available(g.id));
    if (chs.length < 2) return [];
    const wt = chs.map(g => {
      const r = this.recent(g.id);
      return [g, r ? 1 + (1 - r.r / r.n) : 2];
    });
    const pools = {}, items = [];
    let guard = 0;
    while (items.length < this.ROUND && guard++ < 80) {
      const pair = this.pickWeightedPair(wt);
      const g = pair[0];
      const p = pools[g.id] || (pools[g.id] = this.grammarPool(g.id));
      const roll = Math.random();
      let it = null;
      if (roll < 0.12 && p.pairs) { it = p.pairs; p.pairs = null; }
      else if (roll < 0.45 && p.types.length) it = p.types.shift();
      else if (p.clozes.length) it = p.clozes.shift();
      else if (p.types.length) it = p.types.shift();
      if (it) { items.push(it); pair[1] *= 0.35; }
    }
    return items.length >= 4 ? items : [];
  },

  pickWeightedPair(wt) {
    let sum = 0;
    wt.forEach(x => { sum += x[1]; });
    let r = Math.random() * sum;
    for (let i = 0; i < wt.length; i++) {
      r -= wt[i][1];
      if (r <= 0) return wt[i];
    }
    return wt[wt.length - 1];
  },

  /* ---------- Stand je Kapitel ---------- */
  record(id, ok) {
    if (!Store.data.grammar) Store.data.grammar = {};
    const G = Store.data.grammar;
    const st = G[id] || (G[id] = { seen: 0, right: 0, last: '', t: 0 });
    st.seen++;
    if (ok) st.right++;
    st.last = (String(st.last || '') + (ok ? '1' : '0')).slice(-10);
    st.t = Date.now();
  },

  // Die letzten (bis zu zehn) Antworten: { r: richtig, n: gezählt } oder null
  recent(id) {
    const st = Store.data.grammar && Store.data.grammar[id];
    if (!st || !st.last) return null;
    const n = st.last.length;
    return { n, r: (st.last.match(/1/g) || []).length };
  },

  /* ---------- Antwort werten ---------- */
  score(it, ok) {
    if (ok) Run.right++; else Run.wrong++;
    const d = Store.day();
    d.drill = (d.drill || 0) + 1;
    d.drillRight = (d.drillRight || 0) + (ok ? 1 : 0);
    const fx = it.fx || {};
    const W = Store.data.words, P = Store.data.phrases;
    if (ok) {
      (fx.words || []).forEach(id => {
        const st = W[id];
        if (st && Leitner.isDue(st)) Leitner.promote(W, id);
      });
      if (fx.phrase) {
        const st = P[fx.phrase];
        if (st && Leitner.isDue(st)) Leitner.promote(P, fx.phrase);
      }
    } else {
      if (fx.demoteWord && W[fx.demoteWord]) Leitner.demote(W, fx.demoteWord);
      if (fx.phrase && P[fx.phrase]) Leitner.demote(P, fx.phrase);
    }
    if (fx.chapter) this.record(fx.chapter, ok);
    Store.save();
  },

  /* ---------- Start ---------- */
  start(spec) {
    spec = String(spec || '');
    const i = spec.indexOf(':');
    const type = i < 0 ? spec : spec.slice(0, i);
    const arg = i < 0 ? '' : spec.slice(i + 1);
    let items = [];
    if (type === 'sentences') items = this.sentenceRound();
    else if (type === 'phrases') items = this.phraseRound(arg);
    else if (type === 'grammar') items = arg ? this.grammarRound(arg) : this.mixedGrammarRound();
    if (!items.length) return false;
    this.last = spec;
    Run.begin(items, { type, arg });
    return true;
  },

  again() { if (this.last) this.start(this.last); },
};

/* ---------- Statistik ---------- */
const Stats = {
  // Eine Serie zaehlt Tage mit mindestens einer abgeschlossenen Session.
  // Der laufende Tag unterbricht die Serie nicht, solange er noch offen ist.
  streak() {
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const d = Store.data.days[Store.dayKey(-i)];
      const done = d && d.sessions > 0;
      if (done) { n++; continue; }
      if (i === 0) continue;
      break;
    }
    return n;
  },

  mastered() {
    let n = 0;
    for (const id in Store.data.words) if (Store.data.words[id].box >= MASTER_BOX) n++;
    return n;
  },

  touched() { return Object.keys(Store.data.words).length; },

  learnedToday() {
    const d = Store.data.days[Store.today()];
    return d ? d.newWords : 0;
  },

  /* Trefferquote über Session und Pauken zusammen.
     Das Pauken zaehlt getrennt, damit es den Tagesring nicht aufblaeht —
     in die Quote gehoert es aber hinein. */
  accuracy() {
    let ok = 0, all = 0;
    for (const k in Store.data.days) {
      const d = Store.data.days[k];
      ok += (d.right || 0) + (d.drillRight || 0);
      all += (d.seen || 0) + (d.drill || 0);
    }
    return all ? Math.round(ok / all * 100) : 0;
  },

  byBox() {
    const b = [0, 0, 0, 0, 0, 0];
    for (const id in Store.data.words) b[Store.data.words[id].box]++;
    return b;
  },

  cefr() {
    const m = this.mastered();
    if (m >= 800) return { label: 'B1 in Arbeit', next: 1200, at: m };
    if (m >= 300) return { label: 'A2 in Arbeit', next: 800, at: m };
    return { label: 'A1 in Arbeit', next: 300, at: m };
  },

  /* Wortschatz, Grammatik und Phrasen je Niveau — für die Fortschrittsansicht.
     „unlocked" heisst: die Session führt auf diesem Niveau schon neue
     Wörter ein. Grammatik und Phrasen sind in der Bibliothek immer frei
     übbar, unabhängig vom Niveau — dafür gilt „unlocked" nicht. */
  levelBreakdown(DB) {
    const W = Store.data.words, P = Store.data.phrases;
    const rank = LVL_RANK[Session.level(DB)];
    return ['A1', 'A2', 'B1'].map(L => {
      const vocab = DB.vocab.filter(v => v.level === L);
      const vocabDone = vocab.filter(v => W[v.id] && W[v.id].box >= MASTER_BOX).length;
      const phrases = DB.phrases.filter(p => p.level === L);
      const phrasesDone = phrases.filter(p => P[p.id] && P[p.id].box >= MASTER_BOX).length;
      const gram = DB.grammar.filter(g => g.level === L && Practice.available(g.id));
      const gramDone = gram.filter(g => solidChapter(g.id)).length;
      return {
        level: L, unlocked: LVL_RANK[L] <= rank,
        vocab: vocab.length, vocabDone,
        phrases: phrases.length, phrasesDone,
        gram: gram.length, gramDone,
      };
    });
  },
};

/* Ein Grammatikkapitel gilt als sicher, wenn von mindestens vier der
   letzten Antworten vier Fünftel richtig waren. Dieselbe Schwelle
   verwendet auch die Anzeige in der Bibliothek (Practice.recent). */
function solidChapter(id) {
  const r = Practice.recent(id);
  return !!(r && r.n >= 4 && r.r / r.n >= 0.8);
}

/* ---------- Abzeichen ----------
   Rein aus dem vorhandenen Lernstand abgeleitet, nichts davon wird
   gespeichert oder abgeglichen — der Lernstand selbst (Wörter, Kästen,
   Grammatikstand, Serie) ist ja schon da und entscheidet. Nur, WELCHE
   Abzeichen auf diesem Gerät schon als „neu" gezeigt wurden, steht lokal
   ausserhalb des Lernstands, genau wie Sprache, Stimme oder Tempo. */
const BADGES = [
  { id: 'streak-3',    group: 'Serie',      icon: '\u{1F525}', title: '3 Tage in Folge',
    check: () => Stats.streak() >= 3 },
  { id: 'streak-7',    group: 'Serie',      icon: '\u{1F525}', title: 'Eine Woche Serie',
    check: () => Stats.streak() >= 7 },
  { id: 'streak-30',   group: 'Serie',      icon: '\u{1F525}', title: 'Ein Monat Serie',
    check: () => Stats.streak() >= 30 },
  { id: 'streak-100',  group: 'Serie',      icon: '\u{1F525}', title: '100 Tage Serie',
    check: () => Stats.streak() >= 100 },
  { id: 'streak-365',  group: 'Serie',      icon: '\u{1F525}', title: 'Ein Jahr Serie',
    check: () => Stats.streak() >= 365 },

  { id: 'words-50',    group: 'Wortschatz', icon: '\u{1F4D8}', title: '50 Wörter gemeistert',
    check: () => Stats.mastered() >= 50 },
  { id: 'words-100',   group: 'Wortschatz', icon: '\u{1F4D8}', title: '100 Wörter gemeistert',
    check: () => Stats.mastered() >= 100 },
  { id: 'words-500',   group: 'Wortschatz', icon: '\u{1F4D8}', title: '500 Wörter gemeistert',
    check: () => Stats.mastered() >= 500 },
  { id: 'words-1200',  group: 'Wortschatz', icon: '\u{1F4D8}', title: '1200 Wörter gemeistert',
    check: () => Stats.mastered() >= 1200 },

  { id: 'level-a1',    group: 'Niveau',     icon: '\u{1F3C5}', title: 'Niveau A1 erreicht',
    check: () => Stats.mastered() >= 300 },
  { id: 'level-a2',    group: 'Niveau',     icon: '\u{1F3C5}', title: 'Niveau A2 erreicht',
    check: () => Stats.mastered() >= 800 },

  { id: 'grammar-first', group: 'Grammatik', icon: '\u270F\uFE0F', title: 'Erste Regel sicher',
    check: (DB) => DB.grammar.some(g => solidChapter(g.id)) },
  { id: 'grammar-a1',    group: 'Grammatik', icon: '\u270F\uFE0F', title: 'Alle A1-Regeln sicher',
    check: (DB) => grammarLevelDone(DB, 'A1') },
  { id: 'grammar-a2',    group: 'Grammatik', icon: '\u270F\uFE0F', title: 'Alle A2-Regeln sicher',
    check: (DB) => grammarLevelDone(DB, 'A2') },

  { id: 'both-langs', group: 'Sprachen', icon: '\u{1F30D}', title: 'Beide Sprachen begonnen',
    check: () => Badges.otherStarted() },
];

function grammarLevelDone(DB, level) {
  const chs = DB.grammar.filter(g => g.level === level && Practice.available(g.id));
  if (!chs.length) return false;
  return chs.every(g => solidChapter(g.id));
}

const Badges = {
  all: BADGES,

  /* Merkt sich pro Gerät und Sprache, welche Abzeichen schon als „neu"
     gezeigt wurden — bewusst ausserhalb von Store.data, damit der
     Abgleich zwischen Geräten unverändert bleibt. */
  key() { return 'lingua_badges_' + currentLang(); },

  seen() {
    try {
      const raw = localStorage.getItem(this.key());
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  },

  markSeen(map) { try { localStorage.setItem(this.key(), JSON.stringify(map)); } catch (e) {} },

  otherStarted() {
    try {
      const other = otherLang(currentLang());
      const raw = localStorage.getItem('lingua_' + other);
      if (!raw) return false;
      const d = JSON.parse(raw);
      return !!(d && d.words && Object.keys(d.words).length > 0);
    } catch (e) { return false; }
  },

  /* Aktueller Stand aller Abzeichen — für die Anzeige im Profil. */
  list(DB) {
    return BADGES.map(b => ({ id: b.id, group: b.group, icon: b.icon, title: b.title,
      earned: !!b.check(DB) }));
  },

  /* Seit dem letzten Aufruf neu verdiente Abzeichen — merkt sie sich
     sofort, damit dieselbe Runde nicht zweimal als „neu" zählt. */
  checkNew(DB) {
    const have = this.seen();
    const fresh = [];
    BADGES.forEach(b => {
      if (have[b.id]) return;
      if (b.check(DB)) { have[b.id] = 1; fresh.push(b); }
    });
    if (fresh.length) this.markSeen(have);
    return fresh;
  },
};
