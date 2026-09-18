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
      words: {}, phrases: {}, days: {},
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
      core.push({ kind: canSpeak ? 'speak' : 'phrasechoice', phrase: p });
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
};
