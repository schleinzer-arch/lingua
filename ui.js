/* ============================================================
   lingua — Oberfläche (Version 19)
   ============================================================ */
'use strict';

const APP_VERSION = '19';
const DB = { vocab: [], sentences: [], phrases: [], grammar: [], practice: { chapters: {} }, topics: { topics: [] }, byId: {}, sentById: {} };

/* Die Übungsdatei ist ein Zusatz: fehlt sie, laufen Wörter, Sätze und
   Phrasen weiter, nur die Grammatikübungen sind dann leer. */
async function loadPractice(code) {
  try {
    const r = await fetch('data/' + code + '/practice.json');
    const d = await r.json();
    return d && d.chapters ? d : { chapters: {} };
  } catch (e) {
    return { chapters: {} };
  }
}

/* Auch die Themen sind ein Zusatz: fehlt die Datei, fällt nur der
   Themen-Eintrag auf der Startseite weg. */
async function loadTopics(code) {
  try {
    const r = await fetch('data/' + code + '/topics.json');
    const d = await r.json();
    return d && Array.isArray(d.topics) ? d : { topics: [] };
  } catch (e) {
    return { topics: [] };
  }
}

const App = {
  screen: 'home',
  session: null,
  el: null,

  async boot() {
    this.el = document.getElementById('app');
    dropVoiceLeftovers();
    Store.load();
    try {
      const L = currentLang();
      applyTheme(L);
      const [v, s, p, g] = await Promise.all([
        fetch('data/' + L + '/vocab.json').then(r => r.json()),
        fetch('data/' + L + '/sentences.json').then(r => r.json()),
        fetch('data/' + L + '/phrases.json').then(r => r.json()),
        fetch('data/' + L + '/grammar.json').then(r => r.json()),
      ]);
      DB.vocab = v; DB.sentences = s; DB.phrases = p; DB.grammar = g;
      v.forEach(x => DB.byId[x.id] = x);
      s.forEach(x => DB.sentById[x.id] = x);
      DB.practice = await loadPractice(L);
      DB.topics = await loadTopics(L);
    } catch (e) {
      this.el.innerHTML =
        '<div style="padding:40px 24px;text-align:center;">' +
        '<div class="title" style="margin-bottom:8px;">Daten nicht geladen</div>' +
        '<div class="sub">Die Dateien im Ordner <b>data/</b> konnten nicht gelesen werden. ' +
        'Beim Öffnen als lokale Datei blockiert der Browser das — die App muss über eine ' +
        'Adresse aufgerufen werden.</div></div>';
      return;
    }
    this.go('home');
    // Beim Oeffnen still abgleichen, wenn verbunden
    if (Sync.on) Sync.run(true).then(r => { if (r.ok && App.screen === 'home') App.render(); });
  },

  /* Sprache wechseln: Daten neu laden, Farben umstellen, Stand der
     anderen Sprache aus ihrem eigenen Speicher holen. */
  async switchLang(code) {
    if (!LANGS[code] || code === currentLang()) return;
    setLang(code);
    applyTheme(code);
    Store.load();
    try {
      const [v, s, p, g] = await Promise.all([
        fetch('data/' + code + '/vocab.json').then(r => r.json()),
        fetch('data/' + code + '/sentences.json').then(r => r.json()),
        fetch('data/' + code + '/phrases.json').then(r => r.json()),
        fetch('data/' + code + '/grammar.json').then(r => r.json()),
      ]);
      DB.vocab = v; DB.sentences = s; DB.phrases = p; DB.grammar = g;
      DB.byId = {}; DB.sentById = {};
      v.forEach(x => DB.byId[x.id] = x);
      s.forEach(x => DB.sentById[x.id] = x);
      DB.practice = await loadPractice(code);
      DB.topics = await loadTopics(code);
    } catch (e) { /* Daten fehlen: Anzeige bleibt, Meldung folgt beim Start */ }
    this.go('home');
    if (Sync.on) Sync.run(true).then(r => { if (r.ok && App.screen === 'home') App.render(); });
  },

  go(screen, arg) {
    Focus.open = null;           // ein offenes Blatt schließt beim Seitenwechsel
    Ask.q = null;
    if (screen !== 'profile') Profile.syncMsg = null;
    this.screen = screen;
    this.arg = arg;
    this.render();
    const v = this.el.querySelector('.view');
    if (v) v.scrollTop = 0;
  },

  render() {
    const s = this.screen;
    let html = '';
    if (s === 'home') html = Home.view();
    else if (s === 'session') html = Run.view();
    else if (s === 'drill') html = Drill.view();
    else if (s === 'library') html = Library.view();
    else if (s === 'profile') html = Profile.view();
    else if (s === 'legal') html = Legal.view();
    else if (s === 'grammar') html = Library.chapter(this.arg);
    else if (s === 'words') html = Library.wordList(this.arg);
    else if (s === 'levels') html = Levels.view();
    this.el.innerHTML = html + Ask.view() + Toast.view();
    bindAll();
  },
};

/* ---------- Rückfrage als Blatt (statt Browser-Dialog) ---------- */
const Ask = {
  q: null,        // { title, text, yes, no, danger, onYes }
  open(q) { this.q = q; App.render(); },
  close() { this.q = null; App.render(); },
  view() {
    const q = this.q;
    if (!q) return '';
    return '<div class="sheet-bg" data-ask-no></div>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ask-t">' +
      '<div class="sheet-grip"></div><div class="view-pad">' +
        '<div class="title" id="ask-t">' + esc(q.title) + '</div>' +
        (q.text ? '<div class="sub">' + esc(q.text) + '</div>' : '') +
        '<button class="' + (q.danger ? 'btn-danger solid' : 'btn') + '" data-ask-yes>' + esc(q.yes) + '</button>' +
        '<button class="btn-line" data-ask-no>' + esc(q.no || 'Abbrechen') + '</button>' +
      '</div></div>';
  },
};

/* ---------- Kurzmeldung (statt Browser-Hinweis) ---------- */
const Toast = {
  text: '', timer: null,
  show(t) {
    this.text = t;
    clearTimeout(this.timer);
    App.render();
    // Nur die Meldung entfernen, nicht neu zeichnen: sonst ginge eine
    // gerade getippte Antwort verloren.
    this.timer = setTimeout(() => {
      this.text = '';
      const el = App.el && App.el.querySelector('.toast');
      if (el) el.remove();
    }, 3200);
  },
  view() { return this.text ? '<div class="toast" role="status">' + esc(this.text) + '</div>' : ''; },
};

/* ---------- Bausteine ---------- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Diakritika im Wort hervorheben
function marked(word) {
  return esc(word).replace(/[ďťňľšččžáéíóúýôäĺŕ]/gi,
    m => '<span class="dia">' + m + '</span>');
}

// Einzahl oder Mehrzahl
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

function ring(pct, size, stroke) {
  size = size || 64; stroke = stroke || 6;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(pct, 100) / 100);
  return '<svg width="' + size + '" height="' + size + '" aria-hidden="true">' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r +
    '" fill="none" stroke="var(--cobalt-wash)" stroke-width="' + stroke + '"/>' +
    '<circle class="ring-arc" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r +
    '" fill="none" stroke="var(--cobalt)" stroke-width="' + stroke +
    '" stroke-dasharray="' + c + '" stroke-dashoffset="' + off +
    '" stroke-linecap="round"/></svg>';
}

const svg = (w, body, sw) => '<svg width="' + w + '" height="' + w + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="' + (sw || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';

const ICON = {
  home: svg(24, '<path d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5"/>'),
  book: svg(24, '<path d="M4 4h6a3 3 0 0 1 2 3v14a2.5 2.5 0 0 0-2.5-2H4z"/><path d="M20 4h-6a3 3 0 0 0-2 3v14a2.5 2.5 0 0 1 2.5-2H20z"/>'),
  user: svg(24, '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.4-3.7 4.1-5.5 7.5-5.5s6.1 1.8 7.5 5.5"/>'),
  close: svg(20, '<path d="M6 6l12 12M18 6 6 18"/>', 2),
  skip: svg(20, '<path d="M5 5l7 7-7 7M13 5l7 7-7 7"/>', 2),
  back: svg(22, '<path d="M15 18l-6-6 6-6"/>', 2.2),
  chev: svg(16, '<path d="M9 6l6 6-6 6"/>', 2),
  check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="richtig"><path d="M5 12.5 10 17l9-10"/></svg>',
  cross: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" role="img" aria-label="falsch"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  done: svg(26, '<path d="M5 12.5 10 17l9-10"/>', 2.4),
  cards: svg(22, '<rect x="3" y="6" width="14" height="14" rx="2.5"/><path d="M7 3h11.5A2.5 2.5 0 0 1 21 5.5V17"/>'),
  talk: svg(22, '<path d="M4 5h16v11H9l-5 4z"/>'),
  grid: svg(22, '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'),
  rules: svg(22, '<path d="M4 19 9 5l5 14M6 14h6"/><path d="M16 12.5c0-1.4 1-2.5 2.5-2.5S21 11 21 12.5V19M16 16.5c0 1.5 1 2.5 2.5 2.5S21 18 21 16.5"/>'),
};

function navbar(active) {
  const item = (id, label, icon) =>
    '<button data-go="' + id + '" class="' + (active === id ? 'on' : '') + '"' +
    (active === id ? ' aria-current="page"' : '') + '>' +
    icon + '<span>' + label + '</span></button>';
  return '<nav class="nav" aria-label="Hauptbereiche">' +
    item('home', 'Lernen', ICON.home) +
    item('library', 'Bibliothek', ICON.book) +
    item('profile', 'Profil', ICON.user) +
    '</nav>';
}

/* Zurück-Knopf wie unter iOS: Pfeil und Name der vorigen Seite */
function backbtn(target, label) {
  return '<button class="backbtn" data-go="' + target + '">' + ICON.back + '<span>' + esc(label) + '</span></button>';
}

/* Seitenkopf einer Unterseite: Zurück, großer Titel, Unterzeile */
function pagehead(target, label, title, sub) {
  return '<div class="pagehead">' + backbtn(target, label) +
    '<h1 class="t-large">' + esc(title) + '</h1>' +
    (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
}

/* Abzeichen als Zahl im Kreis */
function medal(b, size) {
  return '<span class="medal' + (b.earned ? '' : ' open') + (String(b.short).length > 3 ? ' wide' : '') + '"' +
    (size ? ' style="width:' + size + 'px;height:' + size + 'px;"' : '') + ' aria-hidden="true">' +
    esc(b.short) + '</span>';
}

/* ---------- Start ---------- */
const Home = {
  view() {
    const d = Store.day();
    const goal = Store.data.settings.goal;
    const done = d.sessions > 0;
    const pct = done ? 100 : Math.min(100, Math.round(d.seen / goal * 100));
    const streak = Stats.streak();
    const lvl = Session.level(DB);
    const L = LANGS[currentLang()] || LANGS.sk;
    const counts = this.preview();

    const seg = '<div class="seg" role="group" aria-label="Sprache">' +
      LANG_ORDER.map(code => {
        const on = code === L.code;
        return '<button data-lang="' + code + '" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '">' +
          esc(LANGS[code].name) + '</button>';
      }).join('') + '</div>';

    const status = done ? 'Für heute erledigt' : d.seen ? 'Session läuft' : 'Noch nichts geübt';
    const under = streak > 0 ? plural(streak, 'Tag', 'Tage') + ' in Folge' : 'Tagesziel: ' + goal + ' Übungen';
    const row = (label, n) => '<div class="row"><span class="row-main body">' + label + '</span>' +
      '<span class="row-val">' + n + '</span></div>';

    return '<div class="safe-top"></div><div class="view fade"><div class="home">' +
      seg +
      '<h1 class="t-large greet" lang="' + L.code + '">' + esc(L.hello) + '</h1>' +
      '<div class="sub">' + esc(L.helloDe) + ' &middot; Stufe ' + lvl + '</div>' +

      '<section class="card today" aria-label="Heute">' +
        '<div class="today-top">' +
          '<div class="ring">' + ring(pct, 64, 6) +
            '<div class="ring-in">' + (done
              ? '<span style="color:var(--good);">' + ICON.done + '</span>'
              : '<span class="ring-n">' + d.seen + '</span><span class="ring-of">von ' + goal + '</span>') +
            '</div></div>' +
          '<div><div class="head">' + status + '</div><div class="sub">' + under + '</div></div>' +
        '</div>' +
        '<div class="today-rows">' +
          row('Neue Wörter', counts.fresh) +
          row('Wiederholungen', counts.due) +
          row('Redewendungen', counts.phrases) +
        '</div>' +
        '<button class="btn" data-start>' + (done ? 'Noch eine Session' : 'Session starten') + '</button>' +
      '</section>' +

      Focus.section() +
      '<div class="spacer"></div></div></div>' +
      navbar('home') + Focus.view();
  },

  preview() {
    const W = Store.data.words;
    const rank = LVL_RANK[Session.level(DB)];
    const due = DB.vocab.filter(v => Leitner.seen(W, v.id) && Leitner.isDue(W[v.id])).length;
    const fresh = DB.vocab.filter(v => !Leitner.seen(W, v.id) && LVL_RANK[v.level] <= rank).length;
    return {
      due: Math.min(due, 10),
      fresh: Math.min(fresh, 7),
      phrases: 3,
    };
  },
};

/* ---------- Gezielt üben ----------
   Macht auf der Startseite sichtbar, was es in der Bibliothek schon gibt:
   endloses Vokabelüben, Phrasen nach Situation, Wörter nach Thema, dazu ein
   Grammatik-Vorschlag. Nichts davon ändert die Session. */
const Focus = {
  open: null,          // null | 'ctx' | 'topic'

  // Situationen mit genug Phrasen, in fester Reihenfolge
  contexts() {
    const ctx = [];
    DB.phrases.forEach(p => { if (!ctx.includes(p.context)) ctx.push(p.context); });
    const ord = Practice.CTX_ORDER;
    ctx.sort((a, b) => {
      const ia = ord.indexOf(a), ib = ord.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return ctx.map(c => ({ c, n: DB.phrases.filter(p => p.context === c).length }))
      .filter(x => x.n >= 4);
  },

  tile(attr, icon, label, sub, warn) {
    return '<button class="ftile" ' + attr + '>' + icon +
      '<span class="ftile-t">' + label + '</span>' +
      '<span class="ftile-d' + (warn ? ' warn' : '') + '">' + sub + '</span></button>';
  },

  section() {
    const tiles = [this.tile('data-drill', ICON.cards, 'Vokabeln', 'endlos, gemischt')];
    const ctx = this.contexts();
    if (ctx.length) tiles.push(this.tile('data-focus="ctx"', ICON.talk, 'Situationen', plural(ctx.length, 'Situation', 'Situationen')));
    const tl = Topics.list();
    if (tl.length) {
      const ready = tl.filter(t => Topics.ready(t.key)).length;
      tiles.push(this.tile('data-focus="topic"', ICON.grid, 'Themen',
        ready ? plural(ready, 'Thema', 'Themen') + ' bereit' : 'füllt sich mit jeder Session'));
    }
    const sg = Practice.suggest();
    if (sg) {
      const g = Practice.chapter(sg.id), rc = Practice.recent(sg.id);
      const why = sg.why === 'schwach' ? 'zuletzt ' + rc.r + ' von ' + rc.n + ' richtig'
        : sg.why === 'neu' ? 'noch nicht geübt' : 'länger nicht geübt';
      tiles.push(this.tile('data-practice="grammar:' + esc(sg.id) + '"', ICON.rules, 'Grammatik',
        esc(g.title) + ' · ' + why, sg.why === 'schwach'));
    }
    return '<section class="focus" aria-labelledby="focus-t"><h2 class="title" id="focus-t">Gezielt üben</h2>' +
      '<div class="focus-grid">' + tiles.join('') + '</div></section>';
  },

  view() {
    if (!this.open) return '';
    let title, body;
    if (this.open === 'ctx') {
      title = 'Situationen';
      body = this.contexts().map(x =>
        '<button class="row rowbtn" data-practice="phrases:' + esc(x.c) + '">' +
          '<div class="row-main"><div class="row-sk">' + esc(x.c) + '</div></div>' +
          '<span class="chip">' + x.n + '</span>' +
          '<span class="rowchev">' + ICON.chev + '</span></button>').join('');
    } else {
      title = 'Themen';
      body = '<div class="sub">Geübt werden nur Wörter, die du schon begonnen hast. ' +
        'Neue kommen weiter über die Session.</div>' +
        Topics.list().map(t => {
          const n = Topics.started(t.key).length, all = Topics.words(t.key).length;
          const ok = n >= Topics.MIN;
          return '<button class="row rowbtn' + (ok ? '' : ' off') + '"' +
            (ok ? ' data-drill-set="topic:' + esc(t.key) + '"' : ' disabled') + '>' +
            '<div class="row-main"><div class="row-sk">' + esc(t.label) + '</div>' +
            '<div class="row-de">' + n + ' von ' + all + ' begonnen' +
              (ok ? '' : ' · ab ' + Topics.MIN + ' übbar') + '</div></div>' +
            (ok ? '<span class="rowchev">' + ICON.chev + '</span>' : '') + '</button>';
        }).join('');
    }
    return '<div class="sheet-bg" data-focus-close></div>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-t"><div class="sheet-grip"></div>' +
      '<div class="view-pad">' +
        '<h2 class="title" id="sheet-t">' + title + '</h2>' + body +
        '<button class="btn-line" style="margin-top:16px;" data-focus-close>Schließen</button>' +
      '</div></div>';
  },
};

/* ---------- Session ---------- */
const Run = {
  items: [], i: 0, phase: 'q', picked: null, built: [], verdict: null,
  right: 0, wrong: 0, skipped: 0,
  matched: [], pick1: null, missPair: null,
  practice: null,      // null = Session, sonst { type, arg } einer Übungsrunde
  newBadges: [],        // seit dieser Runde neu verdiente Abzeichen

  start() {
    this.items = Session.build(DB);
    this.i = 0; this.right = 0; this.wrong = 0; this.skipped = 0;
    this.practice = null;
    this.newBadges = [];
    this.reset();
    if (!this.items.length) { App.go('home'); return; }
    this.prep();
    App.go('session');
  },

  /* Übungsrunde aus der Bibliothek: dieselbe Maschine, andere Wertung */
  begin(items, practice) {
    this.items = items;
    this.i = 0; this.right = 0; this.wrong = 0; this.skipped = 0;
    this.practice = practice || null;
    this.newBadges = [];
    this.reset();
    this.prep();
    App.go('session');
  },

  reset() {
    this.phase = 'q'; this.picked = null; this.built = []; this.verdict = null; this.hit = null;
    this.matched = []; this.pick1 = null; this.missPair = null;
  },

  cur() { return this.items[this.i]; },

  prep() {
    const it = this.cur();
    if (!it) return;
    if (it.kind === 'choice') it.q = Make.choice(it.word, DB, it.dir);
    if (it.kind === 'match') it.q = Make.pairs(it.words);
    if (it.kind === 'phrasechoice' && !it.preset) {
      const others = sample(DB.phrases.filter(x => x.id !== it.phrase.id), 3);
      it.opts = shuffle(others.map(x => x.de).concat([it.phrase.de]));
    }
    if (it.kind === 'build') it.q = Make.build(it.sent, DB);
    if (it.kind === 'read') it.q = Make.read(it.sent, DB);
  },

  answer(ok, id, map, level) {
    const m = map || Store.data.words;
    if (ok) { this.right++; Leitner.promote(m, id); Leitner.raise(m, id, level); }
    else { this.wrong++; Leitner.demote(m, id); }
    const d = Store.day();
    d.seen++; if (ok) d.right++;
    Store.save();
  },

  next() {
    this.i++;
    this.reset();
    if (this.i >= this.items.length) {
      // Nur eine Session zählt für die Serie, eine Übungsrunde nicht
      if (!this.practice) Store.day().sessions++;
      Store.save();
      this.newBadges = Badges.checkNew(DB);
      if (Sync.on) Sync.run(true);   // still abgleichen, ohne zu blockieren
      App.go('session');
      return;
    }
    this.prep();
    App.render();
  },

  view() {
    if (this.i >= this.items.length) return this.done();
    const it = this.cur();
    const n = this.items.length;
    const pct = Math.round(this.i / n * 100);

    // Ueberspringen nur, solange noch nicht geantwortet wurde
    const canSkip = this.phase !== 'a';
    const top = '<div class="safe-top"></div>' +
      '<div class="sess-top">' +
        '<button class="icon-tap" data-quit aria-label="' + (this.practice ? 'Runde' : 'Session') + ' beenden">' + ICON.close + '</button>' +
        '<span class="track" role="progressbar" aria-label="Fortschritt" aria-valuemin="0" aria-valuemax="' + n +
          '" aria-valuenow="' + this.i + '"><i style="width:' + pct + '%"></i></span>' +
        '<span class="count">' + (this.i + 1) + ' / ' + n + '</span>' +
        (canSkip ? '<button class="icon-tap" data-skip aria-label="Übung überspringen">' + ICON.skip + '</button>'
                 : '<span class="icon-tap" aria-hidden="true"></span>') +
      '</div>';

    let body = '';
    if (it.kind === 'intro') body = this.intro(it);
    else if (it.kind === 'match' || it.kind === 'gpairs') body = this.match(it);
    else if (it.kind === 'cloze') body = this.cloze(it);
    else if (it.kind === 'gtype') body = this.gtype(it);
    else if (it.kind === 'phrasechoice') body = this.phraseChoice(it);
    else if (it.kind === 'choice') body = this.choice(it);
    else if (it.kind === 'type') body = this.type(it);
    else if (it.kind === 'build') body = this.build(it);
    else if (it.kind === 'read') body = this.read(it);
    else if (it.kind === 'write') body = this.write(it);
    else body = this.phrase(it);

    return top + body;
  },

  /* Eine Antwortmöglichkeit; nach der Antwort richtig, falsch oder neutral */
  opt(attr, value, label, right) {
    const shown = this.phase === 'a';
    let cls = 'opt', icon = '';
    if (shown) {
      if (value === right) { cls += ' right'; icon = ICON.check; }
      else if (value === this.picked) { cls += ' wrong'; icon = ICON.cross; }
      else cls += ' dim';
    }
    return '<button class="' + cls + '" ' + attr + '="' + esc(value) + '">' +
      '<span class="opt-in"><span>' + label + '</span>' + icon + '</span></button>';
  },

  /* Rückmeldeleiste unten mit „Weiter" */
  bar(kind, title, detail, note) {
    return '<div class="answer ' + kind + '" role="status"><div>' +
      '<div class="answer-t">' + title + '</div>' +
      (detail ? '<div class="answer-d">' + detail + '</div>' : '') +
      (note ? '<div class="answer-n">' + note + '</div>' : '') +
      '</div><button class="btn" data-next>Weiter</button></div>';
  },

  /* Auswahlaufgaben: richtig oder nicht, dazu Wort und Bedeutung */
  choiceBar(ok, pair) {
    return this.bar(ok ? 'good' : 'bad', ok ? 'Richtig' : 'Noch nicht', pair);
  },

  /* Eintippen und Satzbau: fünf Stufen von exakt bis falsch */
  verdictBar(verdict, said, target, gloss, note) {
    const tail = gloss ? ' — ' + esc(gloss) : '';
    if (verdict === 'exact') return this.bar('good', 'Richtig', marked(target) + tail, note);
    if (verdict === 'diacritics') {
      const marks = Text.missedMarks(said, target);
      const tips = marks.filter(m => SOUNDS[m]).map(m => '<b>' + m + '</b> ' + SOUNDS[m]).join(' &middot; ');
      return this.bar('warn', 'Fast — die Zeichen fehlen', 'Richtig ist <b>' + esc(target) + '</b>.',
        [tips, note].filter(Boolean).join('<br>'));
    }
    if (verdict === 'typo') return this.bar('warn', 'Fast — ein Buchstabe daneben',
      'Richtig ist <b>' + esc(target) + '</b>' + tail, note);
    if (verdict === 'close') return this.bar('warn', 'Fast richtig',
      'Richtig ist <b>' + esc(target) + '</b>' + tail, note);
    return this.bar('bad', 'Noch nicht', 'Richtig ist <b>' + esc(target) + '</b>' + tail, note);
  },

  // Feld und Bausteinfläche: grün nur bei exakt, ocker bei „fast"
  look(verdict) {
    return verdict === 'exact' ? ' right' : verdict === 'wrong' ? ' wrong' : ' warn';
  },

  tip(chapterId) {
    const t = chapterId ? (Practice.chapter(chapterId) || {}).tip : '';
    return t ? '<div class="tipbox"><div class="tipbox-t">Merkhilfe</div><div class="tipbox-d">' + esc(t) + '</div></div>' : '';
  },

  /* --- neue Vokabel vorstellen --- */
  intro(it) {
    const v = it.word;
    const ex = v.ex ? DB.sentById[v.ex] : null;
    const long = v.w.length > 13 ? ' long' : '';
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="ask">Neues Wort</div>' +
      '<div class="wordcard tall">' +
        '<span class="chip">' + esc(v.level) + '</span>' +
        '<div class="word' + long + '" style="margin-top:12px;">' + marked(v.w) + '</div>' +
        '<div class="gloss">' + esc(v.de) + '</div>' +
      '</div>' +
      (ex ? '<div class="card" style="margin-top:12px;">' +
        '<div class="card-label">Im Satz</div>' +
        '<div class="body" style="font-weight:600;">' + marked(ex.w) + '</div>' +
        '<div class="sub" style="margin-top:2px;">' + esc(ex.de) + '</div></div>' : '') +
      '<div class="spacer"></div></div></div>' +
      '<div class="bottom"><button class="btn" data-intro-ok>Verstanden</button></div>';
  },

  /* --- Paare zuordnen --- */
  match(it) {
    const q = it.q;
    const cell = (side, o) => {
      const done = this.matched.indexOf(o.id) !== -1;
      const sel = this.pick1 && this.pick1.side === side && this.pick1.id === o.id;
      const miss = this.missPair && this.missPair.indexOf(side + ':' + o.id) !== -1;
      let cls = 'pairbtn';
      if (done) cls += ' done';
      else if (miss) cls += ' miss';
      else if (sel) cls += ' sel';
      return '<button class="' + cls + '" ' + (done ? 'disabled' : '') +
        (sel ? ' aria-pressed="true"' : '') +
        ' data-pair="' + side + ':' + o.id + '">' + esc(o.text) + '</button>';
    };
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="ask">Was gehört zusammen?</div>' +
      (it.title ? '<div style="margin:-4px 0 12px;text-align:center;"><span class="chip">' + esc(it.title) + '</span></div>' : '') +
      '<div class="pairgrid">' +
        '<div class="paircol">' + q.left.map(o => cell('l', o)).join('') + '</div>' +
        '<div class="paircol">' + q.right.map(o => cell('r', o)).join('') + '</div>' +
      '</div>' +
      '<div class="foot center" style="margin-top:16px;">' +
        this.matched.length + ' von ' + q.total + ' gefunden</div>' +
      '<div class="spacer"></div></div></div>';
  },

  /* --- Phrase als Auswahl ---
     Richtung 'w2de' (Standard): Phrase zeigen, Bedeutung wählen.
     Richtung 'de2w' (Übungsrunde): Bedeutung zeigen, Phrase wählen. */
  phraseChoice(it) {
    const p = it.phrase, shown = this.phase === 'a';
    const rev = it.dir === 'de2w';
    const right = rev ? p.w : p.de;
    const opts = it.opts.map(o => this.opt('data-pickphrase', o, rev ? marked(o) : esc(o), right)).join('');
    const shownText = rev ? p.de : p.w;
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="ask">' + (rev ? 'Wie sagt man das?' : 'Was bedeutet das?') + '</div>' +
      '<div class="wordcard">' +
        '<span class="chip">' + esc(p.context) + '</span>' +
        '<div class="word' + (shownText.length > 15 ? ' long' : '') + '" style="margin-top:12px;">' +
          (rev ? esc(p.de) : marked(p.w)) + '</div>' +
      '</div>' +
      '<div class="opts">' + opts + '</div>' +
      '<div class="spacer"></div></div></div>' +
      (shown ? this.choiceBar(this.picked === right, marked(p.w) + ' — ' + esc(p.de)) : '');
  },

  /* --- Lückensatz: Sätze (Wort fehlt) und Grammatik (Form fehlt) --- */
  cloze(it) {
    const q = it.q, shown = this.phase === 'a';
    const ok = shown && this.picked === q.answer;
    const opts = q.options.map(o => this.opt('data-pickcloze', o, marked(o), q.answer)).join('');
    const parts = q.text.split('___');
    const gap = '<span class="gap' + (shown ? ' right' : '') + '">' +
      (shown ? marked(q.answer) : '<span class="sr">Lücke</span>&nbsp;') + '</span>';
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="ask">' + (q.chapter ? 'Welche Form passt?' : 'Welches Wort fehlt?') + '</div>' +
      '<div class="wordcard flat">' +
        (q.title ? '<span class="chip">' + esc(q.title) + '</span>' : '') +
        '<div class="clozeline" style="margin-top:' + (q.title ? 12 : 0) + 'px;">' +
          marked(parts[0]) + gap + marked(parts[1] || '') + '</div>' +
        (q.hint ? '<div class="foot" style="margin-top:8px;">' + esc(q.hint) + '</div>' : '') +
        '<div class="gloss small">' + esc(q.de) + '</div>' +
      '</div>' +
      '<div class="opts">' + opts + '</div>' +
      (shown ? this.tip(q.chapter) : '') +
      '<div class="spacer"></div></div></div>' +
      (shown ? this.bar(ok ? 'good' : 'bad', ok ? 'Richtig' : 'Noch nicht',
        (ok ? '' : 'Richtig ist <b>' + esc(q.answer) + '</b>: ') + marked(q.full)) : '');
  },

  /* --- Form eintippen (Grammatik) --- */
  gtype(it) {
    const q = it.q, shown = this.phase === 'a';
    const okv = this.verdict === 'exact' || this.verdict === 'diacritics';
    const eff = okv ? this.verdict : 'wrong';
    const name = LANGS[currentLang()].name;
    const note = this.verdict === 'typo' || this.verdict === 'close' ? 'Bei Endungen zählt jeder Buchstabe.' : '';
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="ask">Schreib die Form auf ' + name + '</div>' +
      '<div class="wordcard">' +
        '<span class="chip">' + esc(q.title) + '</span>' +
        '<div class="word' + (q.de.length > 13 ? ' long' : '') + '" style="margin-top:12px;">' +
          esc(q.de) + '</div>' +
      '</div>' +
      '<label class="sr" for="typed">Antwort auf ' + name + '</label>' +
      '<input class="field' + (shown ? this.look(eff) : '') + '" id="typed" lang="' + currentLang() + '" ' +
        'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" ' +
        'placeholder="' + name.toLowerCase() + '…" ' +
        (shown ? 'disabled value="' + esc(this.picked || '') + '"' : '') + '>' +
      (shown ? this.tip(q.chapter) : '') +
      '<div class="spacer"></div></div></div>' +
      (shown ? this.verdictBar(eff, this.picked, okv ? (this.hit || q.target) : q.target, q.de, note)
             : '<div class="bottom"><button class="btn" data-check-gtype>Prüfen</button></div>');
  },

  /* --- Mehrfachauswahl --- */
  choice(it) {
    const q = it.q, shown = this.phase === 'a';
    const opts = q.options.map(o => this.opt('data-pick', o, esc(o), q.answer)).join('');
    const pair = q.dir === 'de2sk' ? marked(q.answer) + ' — ' + esc(q.ask) : marked(q.ask) + ' — ' + esc(q.answer);
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="ask">' +
        (q.dir === 'de2sk' ? 'Wie heißt das auf ' + LANGS[currentLang()].name + '?' : 'Was bedeutet das?') + '</div>' +
      '<div class="wordcard">' +
        '<div class="word' + (q.ask.length > 13 ? ' long' : '') + '">' + marked(q.ask) + '</div>' +
      '</div>' +
      '<div class="opts">' + opts + '</div>' +
      '<div class="spacer"></div></div></div>' +
      (shown ? this.choiceBar(this.picked === q.answer, pair) : '');
  },

  /* --- frei eintippen --- */
  type(it) {
    const v = it.word, shown = this.phase === 'a';
    const name = LANGS[currentLang()].name;
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="ask">Schreib das Wort auf ' + name + '</div>' +
      '<div class="wordcard">' +
        '<div class="word' + (v.de.length > 13 ? ' long' : '') + '">' + esc(v.de) + '</div>' +
      '</div>' +
      '<label class="sr" for="typed">Antwort auf ' + name + '</label>' +
      '<input class="field' + (shown ? this.look(this.verdict) : '') + '" id="typed" lang="' + currentLang() + '" ' +
        'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" ' +
        'placeholder="' + name.toLowerCase() + '…" ' + (shown ? 'disabled value="' + esc(this.picked || '') + '"' : '') + '>' +
      '<div class="spacer"></div></div></div>' +
      (shown ? this.verdictBar(this.verdict, this.picked, v.w, v.de)
             : '<div class="bottom"><button class="btn" data-check-type>Prüfen</button></div>');
  },

  /* --- Wortbausteine --- */
  build(it) {
    const q = it.q, shown = this.phase === 'a';
    // „Fast richtig" zählt beim Satzbau als Fehler und wird auch so gezeigt
    const eff = this.verdict === 'close' ? 'wrong' : this.verdict;
    const slots = this.built.map((w, i) =>
      '<button class="slot" data-unslot="' + i + '" aria-label="' + esc(w) + ' entfernen">' + esc(w) + '</button>').join('');
    const used = this.built.slice();
    const bank = q.bank.map(w => {
      const k = used.indexOf(w);
      const isUsed = k >= 0;
      if (isUsed) used.splice(k, 1);
      return '<button class="bankword' + (isUsed ? ' used' : '') + '" ' +
        (isUsed ? 'disabled' : 'data-slot="' + esc(w) + '"') + '>' + esc(w) + '</button>';
    }).join('');

    return '<div class="view fade"><div class="view-pad">' +
      '<div class="ask left">Bau den Satz</div>' +
      '<div class="prompt">' + esc(it.sent.de) + '</div>' +
      '<div class="slots' + (shown ? this.look(eff) : '') + '" aria-label="Dein Satz">' +
        (slots || '<span class="sub" style="padding:10px 4px;">Tippe die Wörter in der richtigen Reihenfolge an.</span>') + '</div>' +
      (shown ? '' : '<div class="bank">' + bank + '</div>') +
      '<div class="spacer"></div></div></div>' +
      (shown ? this.verdictBar(eff, this.built.join(' '), q.target, it.sent.de)
             : '<div class="bottom"><button class="btn" data-check-build ' +
                 (this.built.length ? '' : 'disabled') + '>Prüfen</button></div>');
  },

  /* --- Satz lesen, Bedeutung wählen --- */
  read(it) {
    const q = it.q, shown = this.phase === 'a';
    const opts = q.options.map(o => this.opt('data-pickread', o, esc(o), q.answer)).join('');
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="ask">Was bedeutet das?</div>' +
      '<div class="wordcard flat">' +
        '<div class="clozeline">' + marked(it.sent.w) + '</div>' +
      '</div>' +
      '<div class="opts">' + opts + '</div>' +
      '<div class="spacer"></div></div></div>' +
      (shown ? this.choiceBar(this.picked === q.answer, marked(it.sent.w) + ' — ' + esc(it.sent.de)) : '');
  },

  /* --- Bedeutung sehen, Phrase eintippen --- */
  write(it) {
    const shown = this.phase === 'a';
    const eff = this.verdict === 'close' ? 'wrong' : this.verdict;
    const name = LANGS[currentLang()].name;
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="ask">Schreib das auf ' + name + '</div>' +
      '<div class="wordcard">' +
        '<div class="word' + (it.sent.de.length > 15 ? ' long' : '') + '">' + esc(it.sent.de) + '</div>' +
      '</div>' +
      '<label class="sr" for="typed">Antwort auf ' + name + '</label>' +
      '<input class="field' + (shown ? this.look(eff) : '') + '" id="typed" lang="' + currentLang() + '" ' +
        'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" ' +
        'placeholder="' + name.toLowerCase() + '…" ' +
        (shown ? 'disabled value="' + esc(this.picked || '') + '"' : '') + '>' +
      '<div class="spacer"></div></div></div>' +
      (shown ? this.verdictBar(eff, this.picked, it.sent.w, it.sent.de)
             : '<div class="bottom"><button class="btn" data-check-write>Prüfen</button></div>');
  },

  /* --- Redewendung ansehen (Rückfall für unbekannte Aufgabenarten) --- */
  phrase(it) {
    const p = it.phrase || { w: '', de: '', context: '' };
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="ask">Redewendung</div>' +
      '<div class="wordcard tall">' +
        '<span class="chip">' + esc(p.context) + '</span>' +
        '<div class="word' + (p.w.length > 15 ? ' long' : '') + '" style="margin-top:12px;">' +
          marked(p.w) + '</div>' +
        '<div class="gloss">' + esc(p.de) + '</div>' +
      '</div><div class="spacer"></div></div></div>' +
      '<div class="bottom"><button class="btn" data-phrase-ok>Verstanden</button></div>';
  },

  /* --- Abschluss --- */
  done() {
    const total = this.right + this.wrong;
    const pct = total ? Math.round(this.right / total * 100) : 0;
    const newly = Stats.learnedToday();
    const row = (label, val) => '<div class="row"><span class="row-main body">' + label + '</span>' +
      '<span class="row-val">' + val + '</span></div>';

    const rows = [row('Richtig beantwortet', this.right + ' von ' + total)];
    if (this.skipped) rows.push(row('Übersprungen', this.skipped));
    if (!this.practice) {
      rows.push(row('Heute ins Langzeitgedächtnis', plural(newly, 'Wort', 'Wörter')));
      rows.push(row('Serie', plural(Stats.streak(), 'Tag', 'Tage')));
    }
    const note = this.practice ? this.practiceNote() : '';
    if (note) rows.push(note);

    const badges = this.newBadges.length
      ? '<section class="card" aria-label="Neue Abzeichen">' +
          this.newBadges.map(b => '<div class="badge-new' + '" style="padding:4px 0;">' +
            medal({ short: b.short, earned: true }) +
            '<div><div class="foot">Neues Abzeichen</div><div class="head">' + esc(b.title) + '</div></div></div>').join('') +
        '</section>'
      : '';

    return '<div class="safe-top"></div><div class="view fade"><div class="result">' +
      '<div class="ring" role="img" aria-label="' + pct + ' Prozent richtig">' + ring(pct, 156, 10) +
        '<div class="ring-in"><span class="t-large">' + pct + ' %</span><span class="foot">richtig</span></div></div>' +
      '<h1 class="title">' + (this.practice ? 'Runde beendet' : 'Session beendet') + '</h1>' +
      '<section class="card flush">' + rows.join('') + '</section>' +
      badges +
      '</div><div class="spacer"></div></div>' +
      '<div class="bottom"><div class="btn-row">' +
        (this.practice
          ? '<button class="btn-line" data-go="' + (this.practice.from || 'library') + '">Fertig</button>' +
            '<button class="btn wide" data-practice-again>Noch eine Runde</button>'
          : '<button class="btn-line" data-go="home">Fertig</button>' +
            '<button class="btn wide" data-start>Noch eine Session</button>') +
      '</div></div>';
  },

  /* Unter dem Ergebnis einer Übungsrunde: bei einer einzelnen Regel ihr Stand */
  practiceNote() {
    const P = this.practice;
    if (!P || P.type !== 'grammar' || !P.arg) return '';
    const rc = Practice.recent(P.arg);
    if (!rc) return '';
    return '<div class="row"><span class="row-main body">Diese Regel: zuletzt</span>' +
      '<span class="row-val">' + rc.r + ' von ' + rc.n + ' richtig</span></div>';
  },
};


/* ---------- Vokabeln üben ----------
   Endlos, immer gemischte Richtung, kein Ende, kein Ergebnisbildschirm. */
const Drill = {
  q: null, picked: null, right: 0, wrong: 0, key: 0,
  letzte: [],            // zuletzt gefragte Wörter, gegen Wiederholungen
  set: null,             // auf eine Gruppe beschränkt?

  start(set) {
    this.set = set || null;      // 'lang' | 'arbeit' | 'topic:<key>' | null
    this.right = 0; this.wrong = 0; this.key = 0;
    this.picked = null;
    this.letzte = [];
    this.next();
    App.go('drill');
  },

  // Themenrunde? Dann gilt sie als Probelauf: keine Kastenänderung.
  topic() {
    return this.set && this.set.indexOf('topic:') === 0 ? this.set.slice(6) : null;
  },

  pool() {
    const W = Store.data.words;
    const tk = this.topic();
    if (tk) return Topics.started(tk);
    if (this.set === 'lang')
      return DB.vocab.filter(v => W[v.id] && W[v.id].box >= MASTER_BOX);
    if (this.set === 'arbeit')
      return DB.vocab.filter(v => W[v.id] && W[v.id].box < MASTER_BOX);
    let p = DB.vocab.filter(v => W[v.id]);
    if (p.length < 8) {
      const rank = LVL_RANK[Session.level(DB)];
      p = p.concat(DB.vocab.filter(v => !W[v.id] && LVL_RANK[v.level] <= rank).slice(0, 20));
    }
    return p;
  },

  next() {
    const p = this.pool();
    if (p.length < 4) { this.q = null; return; }
    // Die zuletzt gefragten Wörter aussparen, damit nicht dieselben
    // paar Vokabeln hintereinander kommen.
    const sperre = Math.min(this.letzte.length, Math.max(0, p.length - 4));
    const frei = p.filter(x => this.letzte.slice(0, sperre).indexOf(x.id) === -1);
    const aus = frei.length ? frei : p;
    const v = aus[Math.floor(Math.random() * aus.length)];
    this.letzte.unshift(v.id);
    if (this.letzte.length > 8) this.letzte.pop();
    this.q = Make.choice(v, DB);   // Richtung zufällig, also gemischt
    this.q.word = v;
    this.picked = null;
    this.key++;
  },

  answer(opt) {
    if (this.picked !== null) return;
    this.picked = opt;
    const ok = opt === this.q.answer;
    const id = this.q.word.id;
    const W = Store.data.words;
    const st = W[id];

    const frei = !!this.topic();   // Themenrunde: Kästen bleiben, wie sie sind

    if (ok) {
      this.right++;
      // Nur ein fälliges Wort rückt vor — sonst liesse sich der
      // Wiederholungsabstand durch Pauken aushebeln.
      if (frei) { /* nichts */ }
      else if (st && Leitner.isDue(st)) Leitner.promote(W, id);
      else if (!st) Leitner.state(W, id).due = Store.dayKey(1);
    } else {
      this.wrong++;
      if (!frei) Leitner.demote(W, id);       // Ein Fehler zählt immer
    }
    const d = Store.day();
    d.drill = (d.drill || 0) + 1;            // getrennt von der Session
    d.drillRight = (d.drillRight || 0) + (ok ? 1 : 0);
    Store.save();
    App.render();
    setTimeout(() => {
      if (App.screen !== 'drill') return;
      this.next();
      App.render();
    }, ok ? 650 : 1500);
  },

  title() {
    const tk = this.topic();
    if (tk) { const t = Topics.get(tk); return t ? t.label : 'Thema'; }
    return this.set === 'lang' ? 'Langzeitgedächtnis üben'
      : this.set === 'arbeit' ? 'Wörter in Arbeit' : 'Vokabeln üben';
  },

  view() {
    if (!this.q) {
      return '<div class="safe-top"></div>' +
        pagehead('home', 'Lernen', this.title()) +
        '<div class="view"><div class="view-pad"><div class="card center" style="margin-top:20px;">' +
        '<div class="head">Dafür braucht es ein paar Wörter mehr.</div>' +
        '<div class="sub" style="margin-top:6px;">' + (this.topic()
          ? 'In diesem Thema sind noch zu wenige Wörter begonnen.'
          : 'Mach zuerst eine Session.') + '</div>' +
        '</div></div></div>';
    }
    const q = this.q, shown = this.picked !== null;
    const opts = q.options.map(o => {
      let cls = 'opt', icon = '';
      if (shown) {
        if (o === q.answer) { cls += ' right'; icon = ICON.check; }
        else if (o === this.picked) { cls += ' wrong'; icon = ICON.cross; }
        else cls += ' dim';
      }
      return '<button class="' + cls + '" data-drillpick="' + esc(o) + '">' +
        '<span class="opt-in"><span>' + esc(o) + '</span>' + icon + '</span></button>';
    }).join('');

    return '<div class="safe-top"></div>' +
      '<div class="sess-top">' +
        '<button class="icon-tap" data-go="home" aria-label="Üben beenden">' + ICON.close + '</button>' +
        '<span class="drill-title">' + esc(this.title()) + '</span>' +
        '<span class="drillscore"><span class="dg">' + this.right + ' ✓<span class="sr"> richtig</span></span>' +
        '<span class="dr">' + this.wrong + ' ✗<span class="sr"> falsch</span></span></span>' +
      '</div>' +
      '<div class="view" key="' + this.key + '"><div class="view-pad">' +
        '<div class="wordcard fade" style="margin-top:8px;">' +
          '<span class="chip">' + esc(q.dir === 'de2sk' ? 'auf ' + LANGS[currentLang()].name : 'auf Deutsch') + '</span>' +
          '<div class="word' + (q.ask.length > 14 ? ' long' : '') + '" style="margin-top:12px;">' +
            marked(q.ask) + '</div>' +
        '</div>' +
        '<div class="opts">' + opts + '</div>' +
        '<div class="foot center" style="margin-top:18px;">' + (this.topic()
          ? 'Probelauf, ändert keine Kästen'
          : 'Endlos. Beenden mit dem Kreuz oben links.') + '</div>' +
        '<div class="spacer"></div>' +
      '</div></div>';
  },
};

/* ---------- Bibliothek ---------- */
const Library = {
  tab: 'woerter',

  view() {
    const t = this.tab;
    return '<div class="safe-top"></div>' +
      '<div class="libhead"><h1 class="t-large">Bibliothek</h1>' +
        '<div class="seg" role="tablist" aria-label="Bereiche">' +
          ['woerter', 'saetze', 'phrasen', 'grammatik'].map(k =>
            '<button role="tab" data-tab="' + k + '" class="' + (t === k ? 'on' : '') + '" aria-selected="' + (t === k) + '">' +
            ({ woerter: 'Wörter', saetze: 'Sätze', phrasen: 'Phrasen', grammatik: 'Grammatik' })[k] +
            '</button>').join('') +
        '</div>' +
      '</div>' +
      '<div class="view"><div class="view-pad">' +
        (t === 'woerter' ? this.words() :
         t === 'saetze' ? this.sentences() :
         t === 'phrasen' ? this.phrases() : this.grammar()) +
        '<div class="spacer"></div></div></div>' + navbar('library');
  },

  words() {
    const W = Store.data.words;
    const groups = [
      ['lang',   'Im Langzeitgedächtnis', v => W[v.id] && W[v.id].box >= MASTER_BOX],
      ['arbeit', 'In Arbeit',             v => W[v.id] && W[v.id].box < MASTER_BOX],
      ['offen',  'Noch nicht begonnen',   v => !W[v.id]],
    ];
    let out = '<button class="tile" data-words="alle" style="margin-bottom:12px;">' +
      '<span class="head">Alle Wörter durchsehen</span>' +
      '<span class="sub">' + DB.vocab.length + ' Einträge, durchsuchbar</span></button>';
    out += '<div class="card flush">';
    groups.forEach(([key, label, fn]) => {
      const n = DB.vocab.filter(fn).length;
      out += '<button class="row rowbtn" data-words="' + key + '">' +
        '<div class="row-main"><div class="row-sk">' + label + '</div></div>' +
        '<span class="chip">' + n + '</span>' +
        '<span class="rowchev">' + ICON.chev + '</span></button>';
    });
    out += '</div>';
    const b = Stats.byBox();
    out += '<h2 class="title sechead-l">Verteilung nach Kasten</h2><div class="card">';
    for (let i = 1; i <= 5; i++) {
      const pct = Stats.touched() ? Math.round(b[i] / Stats.touched() * 100) : 0;
      out += '<div style="margin-bottom:' + (i < 5 ? 12 : 0) + 'px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;">' +
        '<span class="body">Kasten ' + i + ' <span class="foot">· alle ' + plural(INTERVALS[i], 'Tag', 'Tage') + '</span></span>' +
        '<span class="row-val">' + b[i] + '</span></div>' +
        '<div class="tile-bar"><i style="width:' + pct + '%"></i></div></div>';
    }
    out += '</div>';
    return out;
  },

  wordList(filter) {
    const W = Store.data.words;
    const F = {
      alle:   { titel: 'Alle Wörter',           test: () => true },
      lang:   { titel: 'Im Langzeitgedächtnis', test: v => W[v.id] && W[v.id].box >= MASTER_BOX },
      arbeit: { titel: 'In Arbeit',             test: v => W[v.id] && W[v.id].box < MASTER_BOX },
      offen:  { titel: 'Noch nicht begonnen',   test: v => !W[v.id] },
    }[filter] || { titel: 'Alle Wörter', test: () => true };

    const liste = DB.vocab.filter(F.test);
    const rows = liste.map(v => {
      const st = W[v.id];
      const cls = st ? (st.box >= MASTER_BOX ? '' : ' ochre') : ' plain';
      const lab = st ? 'Kasten ' + st.box : v.level;
      return '<div class="row" data-word="' + esc(v.w) + '">' +
        '<div class="row-main"><div class="row-sk">' + marked(v.w) + '</div>' +
        '<div class="row-de">' + esc(v.de) + '</div></div>' +
        '<span class="chip' + cls + '">' + lab + '</span></div>';
    }).join('');

    // Gezielt üben lohnt nur, wenn genug Wörter für Antwortmöglichkeiten da sind.
    const uebbar = filter && filter !== 'offen' && liste.length >= 4;

    return '<div class="safe-top"></div>' +
      pagehead('library', 'Bibliothek', F.titel, plural(liste.length, 'Wort', 'Wörter')) +
      '<div style="padding:12px var(--pad) 10px;">' +
        (uebbar ? '<button class="btn" style="margin-bottom:10px;" data-drill-set="' + filter +
          '">Diese ' + liste.length + ' Wörter üben</button>' : '') +
        '<label class="sr" for="wsearch">Wörter suchen</label>' +
        '<input class="search" id="wsearch" type="search" placeholder="Suchen" autocomplete="off"></div>' +
      '<div class="view"><div class="view-pad">' +
      (rows ? '<div class="card flush" id="wlist">' + rows + '</div>'
            : '<div class="card center" id="wlist"><div class="sub">Hier ist noch nichts.</div></div>') +
      '<div class="spacer"></div></div></div>' + navbar('library');
  },

  sentences() {
    const open = DB.sentences.filter(s => Session.unlocked(s));
    let out = '<div class="sub" style="margin-bottom:12px;">' + open.length +
      ' von ' + DB.sentences.length + ' Sätzen freigeschaltet. Ein Satz erscheint, ' +
      'sobald du seine Wörter kennst.</div>';
    if (open.length >= 4) {
      out += '<button class="btn" data-practice="sentences" style="margin-bottom:12px;">Sätze üben</button>';
    }
    if (open.length) {
      out += '<div class="card flush">' + open.slice(0, 120).map(s =>
        '<div class="row"><div class="row-main">' +
        '<div class="row-sk">' + marked(s.w) + '</div>' +
        '<div class="row-de">' + esc(s.de) + '</div></div></div>').join('') + '</div>';
    } else {
      out += '<div class="card center"><div class="sub">' +
        'Noch keine Sätze frei. Lerne ein paar Wörter, dann erscheinen sie hier.</div></div>';
    }
    return out;
  },

  /* Phrasen haben Kästen wie Wörter. Jede Zeile zeigt ihren Kasten,
     jede Situation, wie viele begonnen und wie viele gefestigt sind
     (ab Kasten 4, dieselbe Grenze wie beim Langzeitgedächtnis). */
  phrases() {
    const P = Store.data.phrases || {};
    const ctx = [];
    DB.phrases.forEach(p => { if (!ctx.includes(p.context)) ctx.push(p.context); });
    // Bekannte Situationen in fester Reihenfolge, unbekannte dahinter
    const ord = Practice.CTX_ORDER;
    ctx.sort((a, b) => {
      const ia = ord.indexOf(a), ib = ord.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const any = DB.phrases.some(p => P[p.id]);
    const top = (DB.phrases.length >= 4
      ? '<button class="btn" data-practice="phrases">Alle Phrasen üben</button>' : '') +
      (any ? '<div class="foot" style="margin-top:8px;">Der Kasten zeigt, wie sicher eine ' +
        'Phrase sitzt. Ab Kasten ' + MASTER_BOX + ' gilt sie als gefestigt.</div>' : '');
    return top + ctx.map(c => {
      const list = DB.phrases.filter(p => p.context === c);
      const begun = list.filter(p => P[p.id]).length;
      const fest = list.filter(p => P[p.id] && P[p.id].box >= MASTER_BOX).length;
      const stand = begun
        ? begun + ' von ' + list.length + ' begonnen &middot; ' + fest + ' gefestigt'
        : list.length + ' Phrasen, noch keine begonnen';
      return '<div class="sechead"><div><h2 class="head">' + esc(c) + '</h2>' +
        '<div class="foot" style="margin-top:2px;">' + stand + '</div></div>' +
        (list.length >= 4
          ? '<button class="chipbtn" data-practice="phrases:' + esc(c) + '" aria-label="' + esc(c) + ' üben">üben</button>' : '') +
        '</div>' +
        list.map(p => {
          const st = P[p.id];
          const chip = st
            ? '<span class="chip' + (st.box >= MASTER_BOX ? '' : ' ochre') + '">Kasten ' + st.box + '</span>'
            : '';
          return '<div class="row"><div class="row-main">' +
            '<div class="row-sk">' + marked(p.w) + '</div>' +
            '<div class="row-de">' + esc(p.de) + '</div></div>' + chip + '</div>';
        }).join('');
    }).join('');
  },

  grammar() {
    const can = DB.grammar.filter(g => Practice.available(g.id)).length >= 2;
    const any = DB.grammar.some(g => Practice.recent(g.id));
    return (can ? '<button class="btn" data-practice="grammar">Grammatik üben</button>' : '') +
      (any ? '<div class="foot" style="margin:8px 0 12px;">Die Zahl zeigt, wie viele deiner letzten ' +
        'Antworten zu einer Regel richtig waren.</div>' : '<div style="height:12px;"></div>') +
      DB.grammar.map(g => {
        const rc = Practice.recent(g.id);
        return '<button class="tile" data-chapter="' + esc(g.id) + '" style="margin-bottom:10px;">' +
          '<span style="display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;">' +
          '<span style="min-width:0;"><span class="head" style="display:block;">' + esc(g.title) + '</span>' +
          '<span class="sub" style="display:block;">' + esc(g.description) + '</span></span>' +
          '<span style="display:flex;gap:6px;align-items:center;flex:none;">' +
            (rc ? '<span class="chip' + (rc.r / rc.n >= 0.8 ? '' : ' ochre') + '">' + rc.r + '/' + rc.n + '</span>' : '') +
            '<span class="chip plain">' + esc(g.level) + '</span>' +
            '<span class="rowchev">' + ICON.chev + '</span></span></span></button>';
      }).join('');
  },

  chapter(id) {
    const g = DB.grammar.find(x => x.id === id) || DB.grammar[0];
    const rc = Practice.recent(g.id);
    const rows = g.table.map(r =>
      '<tr><td>' + esc(r[0]) + '</td>' +
      '<td>' + marked(r[1]) + '</td></tr>').join('');
    return '<div class="safe-top"></div>' +
      '<div class="view fade">' +
      pagehead('library', 'Bibliothek', g.title, esc(g.description) + ' &middot; ' + esc(g.level)) +
      '<div class="view-pad" style="padding-top:16px;">' +
        '<div class="card flush"><table class="gtable">' + rows + '</table></div>' +
        (g.tip ? '<div class="tipbox"><div class="tipbox-t">Merkhilfe</div><div class="tipbox-d">' + esc(g.tip) + '</div></div>' : '') +
        (Practice.available(g.id)
          ? '<button class="btn" data-practice="grammar:' + esc(g.id) + '" style="margin-top:18px;">Diese Regel üben</button>' +
            (rc ? '<div class="foot center" style="margin-top:8px;">Zuletzt ' + rc.r + ' von ' + rc.n + ' richtig</div>' : '')
          : '') +
        '<div class="spacer"></div></div></div>' + navbar('library');
  },
};

/* ---------- Profil ---------- */
/* "vor 3 Minuten" statt einer rohen Uhrzeit */
function relTime(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return 'vor ' + plural(m, 'Minute', 'Minuten');
  const h = Math.round(m / 60);
  if (h < 24) return 'vor ' + plural(h, 'Stunde', 'Stunden');
  const d = Math.round(h / 24);
  return 'vor ' + plural(d, 'Tag', 'Tagen');
}

/* Abzeichen nach Gruppe: erreichte mit vollem Ring, offene gestrichelt. */
function badgesGrid() {
  const list = Badges.list(DB);
  const earned = list.filter(b => b.earned).length;
  const groups = [];
  list.forEach(b => {
    let g = groups.find(x => x.name === b.group);
    if (!g) { g = { name: b.group, items: [] }; groups.push(g); }
    g.items.push(b);
  });
  return '<div class="sub" style="margin:-4px 0 10px;">' + earned + ' von ' + list.length + ' erreicht</div>' +
    '<section class="card badge-card" aria-label="Abzeichen">' +
    groups.map(g => '<div class="badge-group"><div class="badge-group-t">' + esc(g.name) + '</div>' +
      '<div class="badge-grid">' + g.items.map(b =>
        '<div class="badge">' + medal(b) +
        '<span class="badge-t">' + esc(b.title) + '<span class="sr">' + (b.earned ? ', erreicht' : ', noch offen') + '</span></span></div>'
      ).join('') + '</div></div>').join('') +
    '</section>';
}

/* ---------- Niveau-Fortschritt ---------- */
const Levels = {
  view() {
    const c = Stats.cefr();
    const pct = Math.round(c.at / c.next * 100);
    const rows = Stats.levelBreakdown(DB);
    const nextLevel = c.label === 'A1 in Arbeit' ? 'A2' : c.label === 'A2 in Arbeit' ? 'B1' : null;

    let missing = 'Du lernst schon auf B1-Niveau.';
    if (nextLevel) {
      const r = rows.find(x => x.level === nextLevel);
      const bits = [];
      const part = (n, one, many) => n + ' ' + nextLevel + '-' + (n === 1 ? one : many);
      if (r) {
        if (r.vocab - r.vocabDone > 0) bits.push(part(r.vocab - r.vocabDone, 'Wort', 'Wörter'));
        if (r.gram - r.gramDone > 0) bits.push(part(r.gram - r.gramDone, 'Grammatikkapitel', 'Grammatikkapitel'));
        if (r.phrases - r.phrasesDone > 0) bits.push(part(r.phrases - r.phrasesDone, 'Phrase', 'Phrasen'));
      }
      missing = bits.length
        ? 'Für ' + nextLevel + ' fehlen dir noch: ' + bits.join(', ') + '.'
        : 'Du hast alles für ' + nextLevel + ' beisammen, es muss nur noch sitzen.';
    }

    const block = (key, doneKey, useLock) => rows.filter(r => r[key] > 0).map(r => {
      const total = r[key], done = r[doneKey];
      const locked = useLock && !r.unlocked;
      const pct2 = Math.round(done / total * 100);
      const cls = locked ? ' locked' : (done >= total ? ' done' : '');
      return '<div class="lvl-block">' +
        '<div class="lvl-row"><span class="body">' + r.level + '</span>' +
        '<span class="sub num">' + done + ' / ' + total + (locked ? ' &middot; noch gesperrt' : '') +
        '</span></div>' +
        '<div class="lvl-bar' + cls + '"><i style="width:' + (locked ? 0 : pct2) + '%"></i></div>' +
      '</div>';
    }).join('');

    return '<div class="safe-top"></div>' +
      '<div class="view fade">' + pagehead('profile', 'Profil', 'Niveau') +
      '<div class="view-pad" style="padding-top:16px;">' +

      '<div class="panel" style="display:flex;align-items:center;gap:16px;">' +
        '<div class="ring">' + ring(pct, 72, 7) +
        '<div class="ring-in"><span class="ring-n">' + c.at + '</span></div></div>' +
        '<div style="flex:1;">' +
          '<div class="head">' + c.label + '</div>' +
          '<div class="sub" style="margin-top:2px;">' + c.at + ' von ' + c.next +
          ' Wörtern im Langzeitgedächtnis</div></div></div>' +

      '<div class="sub" style="margin-top:12px;">' + esc(missing) + '</div>' +

      '<h2 class="title sechead-l">Wortschatz</h2>' + block('vocab', 'vocabDone', true) +
      '<h2 class="title sechead-l">Grammatik</h2>' + block('gram', 'gramDone', false) +
      '<h2 class="title sechead-l">Phrasen</h2>' + block('phrases', 'phrasesDone', false) +

      '<div class="spacer"></div></div></div>' + navbar('profile');
  },
};

const Profile = {
  syncMsg: null,      // Fehlermeldung des Abgleichs, steht unter dem Knopf

  view() {
    const sy = Sync.cfg();
    const m = Stats.mastered(), t = Stats.touched();
    const c = Stats.cefr();
    const pct = Math.round(c.at / c.next * 100);
    const L = LANGS[currentLang()] || LANGS.sk;
    const heat = [];
    for (let i = 29; i >= 0; i--) {
      const k = Store.dayKey(-i);
      const d = Store.data.days[k];
      const q = !d ? 0 : d.seen >= Store.data.settings.goal ? 3 : d.seen >= 10 ? 2 : 1;
      heat.push('<i class="q' + q + (i === 0 ? ' today' : '') + '"></i>');
    }
    const row = (label, val) => '<div class="row"><span class="row-main body">' + label + '</span>' +
      '<span class="row-val">' + val + '</span></div>';
    const msg = this.syncMsg ? '<div class="field-error" role="alert">' + esc(this.syncMsg) + '</div>' : '';

    return '<div class="safe-top"></div>' +
      '<div class="view"><div class="pagehead"><h1 class="t-large">Profil</h1></div>' +
      '<div class="view-pad" style="padding-top:14px;">' +

      '<button class="panel rowbtn" data-go="levels" ' +
        'style="display:flex;align-items:center;gap:14px;width:100%;text-align:left;">' +
        '<div class="ring">' + ring(pct, 64, 6) +
        '<div class="ring-in"><span class="ring-n">' + m + '</span></div></div>' +
        '<div style="flex:1;">' +
          '<div class="head">' + c.label + '</div>' +
          '<div class="sub" style="margin-top:2px;">' + m + ' von ' + c.next +
          ' Wörtern im Langzeitgedächtnis</div></div>' +
        '<span class="rowchev">' + ICON.chev + '</span></button>' +

      '<div class="stat-row">' +
        '<div class="stat"><b>' + Stats.streak() + '</b><span class="foot">Tage in Folge</span></div>' +
        '<div class="stat"><b>' + Stats.learnedToday() + '</b><span class="foot">heute gefestigt</span></div>' +
        '<div class="stat"><b>' + Stats.accuracy() + ' %</b><span class="foot">Treffer</span></div>' +
      '</div>' +

      '<h2 class="title sechead-l">Letzte 30 Tage</h2>' +
      '<div class="heat" role="img" aria-label="Lerntage der letzten 30 Tage">' + heat.join('') + '</div>' +
      '<div class="heat-legend"><span class="foot">vor 30 Tagen</span><span class="foot">heute</span></div>' +

      '<h2 class="title sechead-l">Wortschatz</h2>' +
      '<div class="card flush">' +
        row('Begonnen', t) +
        row('Im Langzeitgedächtnis', m) +
        row('Insgesamt verfügbar', DB.vocab.length) +
      '</div>' +

      '<h2 class="title sechead-l">Abzeichen</h2>' +
      badgesGrid() +

      '<h2 class="title sechead-l">Geräte verbinden</h2>' +
      (Sync.on
        ? '<div class="card">' +
            '<div class="row" style="padding-top:0;"><div class="row-main">' +
              '<div class="row-sk">Verbunden</div>' +
              '<div class="row-de">' + (sy.last
                ? 'Zuletzt abgeglichen ' + relTime(sy.last)
                : 'Noch nicht abgeglichen') + '</div></div>' +
            '<span class="chip' + (sy.state === 'offline' ? ' ochre' : '') + '">' +
              (sy.state === 'offline' ? 'offline' : 'aktiv') + '</span></div>' +
            '<div class="btn-row" style="margin-top:12px;">' +
              '<button class="btn-line" data-sync-off>Trennen</button>' +
              '<button class="btn-line" data-sync-now>Jetzt abgleichen</button>' +
            '</div>' + msg + '</div>'
        : '<div class="card">' +
            '<div class="sub" style="margin-bottom:12px;">Dasselbe Codewort auf jedem Gerät ' +
            'eintragen, dann teilen sie sich den Lernstand. Beide Sprachen werden getrennt ' +
            'abgeglichen.</div>' +
            '<label class="sr" for="synccode">Codewort</label>' +
            '<input class="search" id="synccode" placeholder="Codewort" autocomplete="off" ' +
              'autocapitalize="characters" spellcheck="false"/>' + msg +
            '<button class="btn" style="margin-top:10px;" data-sync-on>Verbinden</button>' +
          '</div>') +

      '<h2 class="title sechead-l">Fortschritt sichern</h2>' +
      '<div class="btn-row">' +
        '<button class="btn-line" data-export>Exportieren</button>' +
        '<button class="btn-line" data-import>Importieren</button></div>' +

      '<h2 class="title sechead-l">Rechtliches</h2>' +
      '<div class="card flush"><button class="row rowbtn" data-go="legal">' +
        '<div class="row-main"><div class="row-sk" style="font-weight:400;">Impressum und Datenschutz</div></div>' +
        '<span class="rowchev">' + ICON.chev + '</span></button></div>' +

      '<h2 class="title sechead-l">Zurücksetzen</h2>' +
      '<div class="sub" style="margin-bottom:12px;">Löscht Kästen, Serien und Statistiken für ' +
        esc(L.name) + '. Nicht umkehrbar.</div>' +
      '<button class="btn-danger" data-reset>Alle Daten löschen</button>' +

      '<div class="foot center" style="margin-top:24px;">Version ' + APP_VERSION +
      ' &middot; ' + esc(L.name) +
      ' &middot; ' + DB.vocab.length + ' Wörter, ' + DB.sentences.length + ' Sätze</div>' +
      '<div class="spacer"></div></div></div>' + navbar('profile');
  },
};

/* ---------- Impressum ---------- */
const Legal = {
  view() {
    const y = new Date().getFullYear();
    const block = (t, b) => '<h2 class="head" style="margin:22px 0 8px;">' + t + '</h2>' + b;
    return '<div class="safe-top"></div>' +
      '<div class="view">' + pagehead('profile', 'Profil', 'Impressum', 'Angaben gemäß § 25 Mediengesetz') +
      '<div class="view-pad" style="padding-top:4px;">' +

      block('Medieninhaber', '<div class="card"><div class="head">Clemens Schleinzer</div>' +
        '<div class="sub" style="margin-top:5px;line-height:1.6;">Enzersdorfer Straße 9/2/2<br>' +
        '2401 Fischamend<br>Österreich</div>' +
        '<a href="mailto:schleinzer@gmail.com" style="display:inline-flex;align-items:center;min-height:44px;' +
        'color:var(--cobalt);text-decoration:none;">schleinzer@gmail.com</a></div>') +

      block('Zweck', '<div class="sub">Nicht-kommerzielle Privatanwendung zum Erlernen der ' +
        'slowakischen und italienischen Sprache, ohne Erwerbsabsicht.</div>') +

      block('Datenschutz',
        '<div class="sub" style="margin-bottom:10px;">Verantwortlicher im Sinne der DSGVO: ' +
        'Clemens Schleinzer, Enzersdorfer Straße 9/2/2, 2401 Fischamend, schleinzer@gmail.com</div>' +
        '<div class="sub" style="margin-bottom:10px;">Der Lernfortschritt wird lokal im Browser ' +
        'gespeichert. Er verlässt das Gerät nur, wenn Sie den Abgleich zwischen Geräten einschalten ' +
        '(siehe unten). Es werden keine Cookies gesetzt, kein Tracking durchgeführt und keine ' +
        'Analysedienste eingesetzt. Die App verwendet weder Mikrofon noch Sprachausgabe.</div>' +
        '<div class="sub">Beim Aufruf der Seite wird Ihre IP-Adresse an den Hosting-Anbieter ' +
        'übertragen. Externe Programmbibliotheken werden nicht geladen.</div>') +

      block('Abgleich zwischen Geräten',
        '<div class="card">' +
        '<div class="sub" style="margin-bottom:10px;">Wer den Abgleich einschaltet, überträgt ' +
        'seinen Lernfortschritt an einen Speicher bei Cloudflare, der zu dieser Seite gehört. ' +
        'Übertragen werden ausschließlich Lernstände — keine Namen, keine Kennungen und keine ' +
        'Inhalte Ihrer Eingaben:</div>' +
        '<div class="sub" style="margin-bottom:10px;">Für jedes Wort und jede Phrase der ' +
        'Wiederholungskasten, der Termin der nächsten Wiederholung, die erreichte Übungsstufe ' +
        'und der Zeitpunkt der letzten Änderung. Für jede Grammatikregel die Zahl der Antworten ' +
        'und ob die zuletzt gegebenen richtig waren. Für jeden Tag die Zahl der Übungen, der ' +
        'richtigen Antworten, der neuen Wörter und der abgeschlossenen Sitzungen. Dazu das ' +
        'Tagesziel und das Startdatum.</div>' +
        '<div class="sub">Das Codewort wird nicht im Klartext abgelegt, sondern nur als ' +
        'Prüfsumme. Ohne Einschalten verlässt nichts das Gerät.</div></div>') +

      block('Hosting',
        '<div class="sub">Cloudflare Pages, betrieben von Cloudflare, Inc., 101 Townsend St, ' +
        'San Francisco, CA 94107, USA. Beim Seitenaufruf wird die IP-Adresse an Cloudflare ' +
        'übertragen. Cloudflare ist nach dem EU-US Data Privacy Framework zertifiziert.</div>') +

      block('Beschwerderecht',
        '<div class="sub">Sie haben das Recht, Beschwerde bei der österreichischen ' +
        'Datenschutzbehörde einzulegen:</div>' +
        '<a class="textlink" href="https://www.dsb.gv.at" target="_blank" rel="noopener">www.dsb.gv.at</a>') +

      '<div class="foot center" style="margin-top:28px;">Stand ' + y + '</div>' +
      '<div class="spacer"></div></div></div>' + navbar('profile');
  },
};
