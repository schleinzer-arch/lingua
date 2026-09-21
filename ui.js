/* ============================================================
   Slovenčina — Oberfläche
   ============================================================ */
'use strict';

const APP_VERSION = '9';
const DB = { vocab: [], sentences: [], phrases: [], grammar: [], practice: { chapters: {} }, byId: {}, sentById: {} };

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

const App = {
  screen: 'home',
  session: null,
  el: null,

  async boot() {
    this.el = document.getElementById('app');
    Store.load();
    Voice.init();
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
    } catch (e) {
      this.el.innerHTML =
        '<div style="padding:40px 24px;text-align:center;">' +
        '<div class="title" style="margin-bottom:8px;">Daten nicht geladen</div>' +
        '<div class="small">Die Dateien im Ordner <b>data/</b> konnten nicht gelesen werden. ' +
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
    } catch (e) { /* Daten fehlen: Anzeige bleibt, Meldung folgt beim Start */ }
    Voice.init();
    this.go('home');
    if (Sync.on) Sync.run(true).then(r => { if (r.ok && App.screen === 'home') App.render(); });
  },

  go(screen, arg) {
    this.screen = screen;
    this.arg = arg;
    this.render();
    const v = this.el.querySelector('.view');
    if (v) v.scrollTop = 0;
  },

  render() {
    const s = this.screen;
    if (s === 'home') this.el.innerHTML = Home.view();
    else if (s === 'session') this.el.innerHTML = Run.view();
    else if (s === 'drill') this.el.innerHTML = Drill.view();
    else if (s === 'library') this.el.innerHTML = Library.view();
    else if (s === 'profile') this.el.innerHTML = Profile.view();
    else if (s === 'legal') this.el.innerHTML = Legal.view();
    else if (s === 'grammar') this.el.innerHTML = Library.chapter(this.arg);
    else if (s === 'words') this.el.innerHTML = Library.wordList(this.arg);
    bindAll();
  },
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

function ring(pct, size, stroke) {
  size = size || 78; stroke = stroke || 6;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(pct, 100) / 100);
  return '<svg width="' + size + '" height="' + size + '">' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r +
    '" fill="none" stroke="var(--cobalt-wash)" stroke-width="' + stroke + '"/>' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r +
    '" fill="none" stroke="var(--cobalt)" stroke-width="' + stroke +
    '" stroke-dasharray="' + c + '" stroke-dashoffset="' + off +
    '" stroke-linecap="round" style="transition:stroke-dashoffset .6s"/></svg>';
}

const ICON = {
  speak: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
  micSmall: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg>',
  mic: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg>',
  home: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5"/></svg>',
  book: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4h6a3 3 0 0 1 2 3v14a2.5 2.5 0 0 0-2.5-2H4z"/><path d="M20 4h-6a3 3 0 0 0-2 3v14a2.5 2.5 0 0 1 2.5-2H20z"/></svg>',
  user: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.4-3.7 4.1-5.5 7.5-5.5s6.1 1.8 7.5 5.5"/></svg>',
  skip: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l7 7-7 7M13 5l7 7-7 7"/></svg>',
  back: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>',
  down: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>',
};

function navbar(active) {
  const item = (id, label, icon) =>
    '<button data-go="' + id + '" class="' + (active === id ? 'on' : '') + '">' +
    icon + '<span>' + label + '</span></button>';
  return '<div class="nav">' +
    item('home', 'Lernen', ICON.home) +
    item('library', 'Bibliothek', ICON.book) +
    item('profile', 'Profil', ICON.user) +
    '</div>';
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
    const O = LANGS[otherLang()] || LANGS.it;

    const counts = this.preview();

    return '<div class="safe-top"></div><div class="view fade">' +
      // Feste Plätze: Slowakisch links, Italienisch rechts. Aktiv gross und
      // dunkel, das andere kleiner und grau. Die Unterzeile steht unter dem
      // aktiven Wort, damit klar ist, wozu sie gehoert.
      '<div class="hero">' +
        '<div class="greets">' +
          LANG_ORDER.map(function (code) {
            const G = LANGS[code];
            const on = code === L.code;
            return on
              ? '<span class="greet on">' + esc(G.hello) + '</span>'
              : '<button class="greet off" data-lang="' + code + '">' + esc(G.hello) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="small greetsub' + (L.code === LANG_ORDER[0] ? '' : ' right') + '">' +
          esc(L.helloDe) + ' &middot; Stufe ' + lvl + '</div>' +
      '</div>' +
      '<div class="plan"><div class="panel">' +
        '<div class="plan-row"><span class="dot"></span>' + counts.fresh + ' neue Wörter</div>' +
        '<div class="plan-row"><span class="dot soft"></span>' + counts.due + ' Wiederholungen</div>' +
        (counts.speak
          ? '<div class="plan-row"><span class="dot ochre"></span>' + counts.speak + ' zum Sprechen</div>'
          : '<div class="plan-row"><span class="dot ochre"></span>' + counts.phrases + ' Redewendungen</div>') +
      '</div></div>' +

      '<div style="padding:20px var(--pad) 0;display:flex;align-items:center;gap:18px;">' +
        '<div class="ring">' + ring(pct, 74, 6) +
          '<div class="ring-in">' + (done
            ? '<div style="font-size:22px;color:var(--good);">&#10003;</div>'
            : '<div style="font-size:19px;font-weight:680;">' + d.seen + '</div>' +
              '<div class="tiny">von ' + goal + '</div>') + '</div></div>' +
        '<div style="flex:1;">' +
          '<div class="small">Heute geübt</div>' +
          '<div class="body" style="font-weight:600;margin-top:2px;">' +
            (done ? 'Für heute erledigt' : d.seen ? 'Session läuft' : 'Noch nichts geübt') + '</div>' +
          (streak > 0 ? '<div class="tiny" style="color:var(--ochre);margin-top:4px;">' +
            streak + (streak === 1 ? ' Tag' : ' Tage') + ' in Folge</div>' : '') +
        '</div>' +
      '</div>' +

      '<div class="spacer"></div></div>' +

      '<div class="bottom">' +
        '<button class="btn" data-start>Session starten</button>' +
        '<button class="btn-quiet" data-drill>Vokabeln üben</button>' +
      '</div>' + navbar('home');
  },

  preview() {
    const W = Store.data.words;
    const rank = LVL_RANK[Session.level(DB)];
    const due = DB.vocab.filter(v => Leitner.seen(W, v.id) && Leitner.isDue(W[v.id])).length;
    const fresh = DB.vocab.filter(v => !Leitner.seen(W, v.id) && LVL_RANK[v.level] <= rank).length;
    return {
      due: Math.min(due, 10),
      fresh: Math.min(fresh, 7),
      speak: Session.speechOn() ? 3 : 0,
      phrases: 3,
    };
  },
};

/* ---------- Session ---------- */
const Run = {
  items: [], i: 0, phase: 'q', picked: null, built: [], heard: '', verdict: null,
  right: 0, wrong: 0, skipped: 0,
  matched: [], pick1: null, missPair: null,
  practice: null,      // null = Session, sonst { type, arg } einer Übungsrunde

  start() {
    this.items = Session.build(DB);
    this.i = 0; this.right = 0; this.wrong = 0; this.skipped = 0;
    this.practice = null;
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
    this.reset();
    this.prep();
    App.go('session');
  },

  reset() {
    this.phase = 'q'; this.picked = null; this.built = []; this.heard = ''; this.verdict = null; this.hit = null;
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
    if (it.kind === 'build' || it.kind === 'listenbuild') it.q = Make.build(it.sent, DB);
    if (it.kind === 'listen') it.q = Make.listen(it.sent, DB);
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
    const pct = Math.round(this.i / this.items.length * 100);

    // Ueberspringen nur, solange noch nicht geantwortet wurde
    const canSkip = this.phase !== 'a';
    const top = '<div class="safe-top"></div>' +
      '<div class="sess-top"><button class="sess-x" data-quit>&times;</button>' +
      '<span class="track"><i style="width:' + pct + '%"></i></span>' +
      '<span class="tiny num">' + (this.i + 1) + '/' + this.items.length + '</span>' +
      (canSkip ? '<button class="skip" data-skip title="Übung überspringen">' +
        ICON.skip + '</button>' : '<span style="width:26px;"></span>') +
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
    else if (it.kind === 'listen') body = this.listen(it);
    else if (it.kind === 'listenbuild') body = this.build(it, true);
    else if (it.kind === 'dictation') body = this.dictation(it);
    else if (it.kind === 'speak') body = this.speak(it);
    else body = this.phrase(it);

    return top + body;
  },

  /* --- neue Vokabel vorstellen --- */
  intro(it) {
    const v = it.word;
    const ex = v.ex ? DB.sentById[v.ex] : null;
    const long = v.w.length > 13 ? ' long' : '';
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="muted center" style="margin:6px 0 14px;">Neues Wort</div>' +
      '<div class="wordcard">' +
        '<button class="speak" data-say="' + esc(v.w) + '">' + ICON.speak + '</button>' +
        '<span class="chip">' + esc(v.level) + '</span>' +
        '<div class="word' + long + '" style="margin-top:14px;">' + marked(v.w) + '</div>' +
        '<div class="gloss">' + esc(v.de) + '</div>' +
      '</div>' +
      (ex ? '<div class="card" style="margin-top:12px;">' +
        '<div class="tiny" style="margin-bottom:5px;">Im Satz</div>' +
        '<div class="body" style="font-weight:560;">' + esc(ex.w) + '</div>' +
        '<div class="small" style="margin-top:2px;">' + esc(ex.de) + '</div></div>' : '') +
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
        ' data-pair="' + side + ':' + o.id + '">' + esc(o.text) + '</button>';
    };
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="muted" style="margin:6px 0 ' + (it.title ? '8' : '16') + 'px;">Was gehört zusammen?</div>' +
      (it.title ? '<div style="margin-bottom:14px;"><span class="chip">' + esc(it.title) + '</span></div>' : '') +
      '<div class="pairgrid">' +
        '<div class="paircol">' + q.left.map(o => cell('l', o)).join('') + '</div>' +
        '<div class="paircol">' + q.right.map(o => cell('r', o)).join('') + '</div>' +
      '</div>' +
      '<div class="tiny center" style="margin-top:16px;">' +
        this.matched.length + ' von ' + q.total + ' gefunden</div>' +
      '<div class="spacer"></div></div></div>';
  },

  /* --- Phrase als Auswahl, wenn nicht gesprochen wird ---
     Richtung 'w2de' (Standard): Phrase zeigen, Bedeutung wählen.
     Richtung 'de2w' (Übungsrunde): Bedeutung zeigen, Phrase wählen. */
  phraseChoice(it) {
    const p = it.phrase, shown = this.phase === 'a';
    const rev = it.dir === 'de2w';
    const right = rev ? p.w : p.de;
    const opts = it.opts.map(o => {
      let cls = 'opt';
      if (shown) {
        if (o === right) cls += ' right';
        else if (o === this.picked) cls += ' wrong';
        else cls += ' dim';
      }
      return '<button class="' + cls + '" data-pickphrase="' + esc(o) + '">' +
        '<span class="opt-in"><span>' + (rev ? marked(o) : esc(o)) + '</span>' +
        (shown && o === right ? '<span>&#10003;</span>' : '') + '</span></button>';
    }).join('');
    const card = rev
      ? '<div class="wordcard" style="min-height:140px;">' +
          (shown ? '<button class="speak" data-say="' + esc(p.w) + '">' + ICON.speak + '</button>' : '') +
          '<span class="chip">' + esc(p.context) + '</span>' +
          '<div class="word' + (p.de.length > 15 ? ' long' : '') + '" style="margin-top:14px;">' +
            esc(p.de) + '</div>' +
        '</div>'
      : '<div class="wordcard" style="min-height:140px;">' +
          '<button class="speak" data-say="' + esc(p.w) + '">' + ICON.speak + '</button>' +
          '<span class="chip">' + esc(p.context) + '</span>' +
          '<div class="word' + (p.w.length > 15 ? ' long' : '') + '" style="margin-top:14px;">' +
            marked(p.w) + '</div>' +
        '</div>';
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="muted center" style="margin:6px 0 16px;">' +
        (rev ? 'Wie sagt man das?' : 'Was bedeutet das?') + '</div>' +
      card +
      '<div class="opts" style="margin-top:16px;">' + opts + '</div>' +
      '<div class="spacer"></div></div></div>' +
      (shown ? '<div class="bottom"><button class="btn" data-next>Weiter</button></div>' : '');
  },

  /* --- Lückensatz: Sätze (Wort fehlt) und Grammatik (Form fehlt) --- */
  cloze(it) {
    const q = it.q, shown = this.phase === 'a';
    const ok = shown && this.picked === q.answer;
    const opts = q.options.map(o => {
      let cls = 'opt';
      if (shown) {
        if (o === q.answer) cls += ' right';
        else if (o === this.picked) cls += ' wrong';
        else cls += ' dim';
      }
      return '<button class="' + cls + '" data-pickcloze="' + esc(o) + '">' +
        '<span class="opt-in"><span>' + marked(o) + '</span>' +
        (shown && o === q.answer ? '<span>&#10003;</span>' : '') + '</span></button>';
    }).join('');
    const parts = q.text.split('___');
    const gap = '<span class="gap' + (shown ? ' right' : '') + '">' +
      (shown ? marked(q.answer) : '&nbsp;') + '</span>';
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="muted center" style="margin:6px 0 12px;">' +
        (q.chapter ? 'Welche Form passt?' : 'Welches Wort fehlt?') + '</div>' +
      '<div class="wordcard" style="min-height:0;padding:26px 20px;">' +
        (shown ? '<button class="speak" data-say="' + esc(q.full) + '">' + ICON.speak + '</button>' : '') +
        (q.title ? '<span class="chip">' + esc(q.title) + '</span>' : '') +
        '<div class="clozeline" style="margin-top:' + (q.title ? 14 : 0) + 'px;">' +
          marked(parts[0]) + gap + marked(parts[1] || '') + '</div>' +
        (q.hint ? '<div class="tiny" style="margin-top:10px;">' + esc(q.hint) + '</div>' : '') +
        '<div class="gloss" style="font-size:16px;margin-top:12px;">' + esc(q.de) + '</div>' +
      '</div>' +
      '<div class="opts" style="margin-top:16px;">' + opts + '</div>' +
      (shown
        ? '<div class="fb ' + (ok ? 'good' : 'bad') + '" style="margin-top:14px;">' +
            '<div class="fb-t">' + (ok ? 'Richtig' : 'Noch nicht') + '</div>' +
            '<div class="fb-d">' + (ok ? '' : 'Richtig ist <b>' + esc(q.answer) + '</b> — ') +
            esc(q.full) + '</div></div>'
        : '') +
      '<div class="spacer"></div></div></div>' +
      (shown ? '<div class="bottom"><button class="btn" data-next>Weiter</button></div>' : '');
  },

  /* --- Form eintippen (Grammatik) --- */
  gtype(it) {
    const q = it.q, shown = this.phase === 'a';
    const okv = this.verdict === 'exact' || this.verdict === 'diacritics';
    const cls = shown ? (okv ? ' right' : ' wrong') : '';
    const name = LANGS[currentLang()].name;
    const fb = !shown ? '' :
      this.feedback(okv ? this.verdict : 'wrong', this.picked, okv ? (this.hit || q.target) : q.target, q.de) +
      (this.verdict === 'typo' || this.verdict === 'close'
        ? '<div class="tiny" style="margin-top:8px;">Bei Endungen zählt jeder Buchstabe.</div>' : '');
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="muted center" style="margin:6px 0 16px;">Schreib die Form auf ' + name + '</div>' +
      '<div class="wordcard" style="min-height:130px;">' +
        '<span class="chip">' + esc(q.title) + '</span>' +
        '<div class="word' + (q.de.length > 13 ? ' long' : '') + '" style="margin-top:12px;">' +
          esc(q.de) + '</div>' +
      '</div>' +
      '<input class="field' + cls + '" id="typed" style="margin-top:16px;" ' +
        'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ' +
        'placeholder="' + name.toLowerCase() + '…" ' +
        (shown ? 'disabled value="' + esc(this.picked || '') + '"' : '') + '>' +
      fb +
      '<div class="spacer"></div></div></div>' +
      '<div class="bottom">' +
        (shown ? '<button class="btn" data-next>Weiter</button>'
               : '<button class="btn" data-check-gtype>Prüfen</button>') +
      '</div>';
  },

  /* --- Mehrfachauswahl --- */
  choice(it) {
    const q = it.q, v = it.word, shown = this.phase === 'a';
    const opts = q.options.map(o => {
      let cls = 'opt';
      if (shown) {
        if (o === q.answer) cls += ' right';
        else if (o === this.picked) cls += ' wrong';
        else cls += ' dim';
      }
      return '<button class="' + cls + '" data-pick="' + esc(o) + '">' +
        '<span class="opt-in"><span>' + esc(o) + '</span>' +
        (shown && o === q.answer ? '<span>&#10003;</span>' : '') + '</span></button>';
    }).join('');

    return '<div class="view fade"><div class="view-pad">' +
      '<div class="muted center" style="margin:6px 0 16px;">' +
        (q.dir === 'de2sk' ? 'Wie heißt das auf ' + LANGS[currentLang()].name + '?' : 'Was bedeutet das?') + '</div>' +
      '<div class="wordcard" style="min-height:150px;">' +
        (q.dir === 'sk2de' ? '<button class="speak" data-say="' + esc(v.w) + '">' + ICON.speak + '</button>' : '') +
        '<div class="word' + (q.ask.length > 13 ? ' long' : '') + '">' + marked(q.ask) + '</div>' +
      '</div>' +
      '<div class="opts" style="margin-top:16px;">' + opts + '</div>' +
      '<div class="spacer"></div></div></div>' +
      (shown ? '<div class="bottom"><button class="btn" data-next>Weiter</button></div>' : '');
  },

  /* --- frei eintippen --- */
  type(it) {
    const v = it.word, shown = this.phase === 'a';
    const cls = shown ? (this.verdict === 'wrong' ? ' wrong' : ' right') : '';
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="muted center" style="margin:6px 0 16px;">Schreib das Wort auf ' +
        LANGS[currentLang()].name + '</div>' +
      '<div class="wordcard" style="min-height:130px;">' +
        '<div class="word' + (v.de.length > 13 ? ' long' : '') + '">' + esc(v.de) + '</div>' +
      '</div>' +
      '<input class="field' + cls + '" id="typed" style="margin-top:16px;" ' +
        'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ' +
        'placeholder="' + LANGS[currentLang()].name.toLowerCase() + '…" ' + (shown ? 'disabled value="' + esc(this.picked || '') + '"' : '') + '>' +
      (shown ? this.feedback(this.verdict, this.picked, v.w, v.de) : '') +
      '<div class="spacer"></div></div></div>' +
      '<div class="bottom">' +
        (shown ? '<button class="btn" data-next>Weiter</button>'
               : '<button class="btn" data-check-type>Prüfen</button>') +
      '</div>';
  },

  /* --- Wortbausteine --- */
  build(it, hoeren) {
    const q = it.q, shown = this.phase === 'a';
    const slotCls = shown ? (this.verdict === 'wrong' ? ' wrong' : ' right') : '';
    const slots = this.built.map((w, i) =>
      '<button class="slot" data-unslot="' + i + '">' + esc(w) + '</button>').join('');
    const used = this.built.slice();
    const bank = q.bank.map((w, i) => {
      const k = used.indexOf(w);
      const isUsed = k >= 0;
      if (isUsed) used.splice(k, 1);
      return '<button class="bankword' + (isUsed ? ' used' : '') + '" ' +
        (isUsed ? 'disabled' : 'data-slot="' + esc(w) + '"') + '>' + esc(w) + '</button>';
    }).join('');

    return '<div class="view fade"><div class="view-pad">' +
      '<div class="muted" style="margin:6px 0 14px;">' +
        (hoeren ? 'Hör zu und bau den Satz' : 'Bau den Satz') + '</div>' +
      (hoeren
        ? '<div class="center" style="margin:4px 0 14px;">' +
            '<button class="mic" data-say="' + esc(it.sent.w) + '">' + ICON.mic + '</button>' +
            '<div class="tiny" style="margin-top:10px;">Antippen zum Anhören</div></div>' +
          (shown ? '<div class="prompt">' + esc(it.sent.de) + '</div>' : '')
        : '<div class="prompt">' + esc(it.sent.de) + '</div>') +
      '<div class="slots' + slotCls + '">' + slots + '</div>' +
      (shown ? this.feedback(this.verdict, this.built.join(' '), q.target, it.sent.de)
             : '<div class="bank" style="margin-top:18px;">' + bank + '</div>') +
      '<div class="spacer"></div></div></div>' +
      '<div class="bottom">' +
        (shown ? '<button class="btn" data-next>Weiter</button>'
               : '<button class="btn" data-check-build ' +
                 (this.built.length ? '' : 'disabled') + '>Prüfen</button>') +
      '</div>';
  },

  /* --- Satz anhören, Bedeutung wählen --- */
  listen(it) {
    const q = it.q, shown = this.phase === 'a';
    const opts = q.options.map(o => {
      let cls = 'opt';
      if (shown) {
        if (o === q.answer) cls += ' right';
        else if (o === this.picked) cls += ' wrong';
        else cls += ' dim';
      }
      return '<button class="' + cls + '" data-picklisten="' + esc(o) + '">' +
        '<span class="opt-in"><span>' + esc(o) + '</span>' +
        (shown && o === q.answer ? '<span>&#10003;</span>' : '') + '</span></button>';
    }).join('');
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="muted center" style="margin:6px 0 16px;">Was bedeutet das?</div>' +
      '<div class="center" style="margin-bottom:10px;">' +
        '<button class="mic" data-say="' + esc(it.sent.w) + '">' + ICON.mic + '</button></div>' +
      '<div class="tiny center" style="margin-bottom:18px;">Antippen zum Anhören</div>' +
      (shown ? '<div class="card" style="margin-bottom:12px;text-align:center;">' +
        '<div class="body" style="font-weight:560;">' + esc(it.sent.w) + '</div></div>' : '') +
      '<div class="opts">' + opts + '</div>' +
      '<div class="spacer"></div></div></div>' +
      (shown ? '<div class="bottom"><button class="btn" data-next>Weiter</button></div>' : '');
  },

  /* --- Diktat --- */
  dictation(it) {
    const shown = this.phase === 'a';
    const cls = shown ? (this.verdict === 'wrong' ? ' wrong' : ' right') : '';
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="muted center" style="margin:6px 0 18px;">Hör zu und schreib mit</div>' +
      '<div class="center" style="margin-bottom:8px;">' +
        '<button class="mic" data-say="' + esc(it.sent.w) + '">' + ICON.mic + '</button></div>' +
      '<div class="tiny center" style="margin-bottom:16px;">Antippen zum Anhören</div>' +
      '<input class="field' + cls + '" id="typed" autocomplete="off" autocapitalize="off" ' +
        'autocorrect="off" spellcheck="false" placeholder="was du hörst…" ' +
        (shown ? 'disabled value="' + esc(this.picked || '') + '"' : '') + '>' +
      (shown ? this.feedback(this.verdict, this.picked, it.sent.w, it.sent.de) : '') +
      '<div class="spacer"></div></div></div>' +
      '<div class="bottom">' +
        (shown ? '<button class="btn" data-next>Weiter</button>'
               : '<button class="btn" data-check-dict>Prüfen</button>') +
      '</div>';
  },

  /* --- Nachsprechen --- */
  speak(it) {
    const p = it.phrase, shown = this.phase === 'a';
    const live = Listen.active;
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="muted center" style="margin:6px 0 16px;">Sprich nach</div>' +
      '<div class="wordcard" style="min-height:140px;">' +
        '<button class="speak" data-say="' + esc(p.w) + '">' + ICON.speak + '</button>' +
        '<div class="word' + (p.w.length > 15 ? ' long' : '') + '">' + marked(p.w) + '</div>' +
        '<div class="gloss" style="font-size:16px;">' + esc(p.de) + '</div>' +
      '</div>' +
      '<div class="heard" style="margin-top:18px;">' + esc(this.heard) + '</div>' +
      '<div class="center" style="margin-top:14px;">' +
        '<button class="mic' + (live ? ' live' : '') + '" data-listen ' +
          (Listen.available ? '' : 'disabled') + '>' + ICON.mic + '</button></div>' +
      '<div class="tiny center" style="margin-top:12px;">' +
        (Listen.available
          ? (live ? 'Ich höre zu…' : 'Antippen und sprechen')
          : 'Spracherkennung steht auf diesem Gerät nicht bereit') + '</div>' +
      (shown ? this.feedback(this.verdict, this.heard, p.w, p.de) : '') +
      '<div class="spacer"></div></div></div>' +
      '<div class="bottom">' +
        (shown ? '<button class="btn" data-next>Weiter</button>'
               : '<button class="btn-soft" data-say="' + esc(p.w) + '">Nochmal anhören</button>') +
      '</div>';
  },

  /* --- Phrase ohne Mikrofon --- */
  phrase(it) {
    const p = it.phrase;
    return '<div class="view fade"><div class="view-pad">' +
      '<div class="muted center" style="margin:6px 0 16px;">Redewendung</div>' +
      '<div class="wordcard">' +
        '<button class="speak" data-say="' + esc(p.w) + '">' + ICON.speak + '</button>' +
        '<span class="chip">' + esc(p.context) + '</span>' +
        '<div class="word' + (p.w.length > 15 ? ' long' : '') + '" style="margin-top:14px;">' +
          marked(p.w) + '</div>' +
        '<div class="gloss" style="font-size:17px;">' + esc(p.de) + '</div>' +
      '</div><div class="spacer"></div></div></div>' +
      '<div class="bottom"><button class="btn" data-phrase-ok>Verstanden</button></div>';
  },

  /* --- Rückmeldung --- */
  feedback(verdict, said, target, gloss) {
    if (verdict === 'exact') {
      return '<div class="fb good" style="margin-top:14px;">' +
        '<div class="fb-t">Richtig</div>' +
        '<div class="fb-d">' + esc(target) + ' — ' + esc(gloss) + '</div></div>';
    }
    if (verdict === 'diacritics') {
      const marks = Text.missedMarks(said, target);
      const tips = marks.filter(m => SOUNDS[m])
        .map(m => '<b>' + m + '</b> ' + SOUNDS[m]).join(' &middot; ');
      return '<div class="fb warn" style="margin-top:14px;">' +
        '<div class="fb-t">Fast — die Zeichen fehlen</div>' +
        '<div class="fb-d">Richtig ist <b>' + esc(target) + '</b>.' +
        (tips ? '<br>' + tips : '') + '</div></div>';
    }
    if (verdict === 'typo') {
      return '<div class="fb warn" style="margin-top:14px;">' +
        '<div class="fb-t">Fast — ein Buchstabe daneben</div>' +
        '<div class="fb-d">Richtig ist <b>' + esc(target) + '</b> — ' + esc(gloss) + '</div></div>';
    }
    if (verdict === 'close') {
      return '<div class="fb warn" style="margin-top:14px;">' +
        '<div class="fb-t">Fast richtig</div>' +
        '<div class="fb-d">Richtig ist <b>' + esc(target) + '</b> — ' + esc(gloss) + '</div></div>';
    }
    return '<div class="fb bad" style="margin-top:14px;">' +
      '<div class="fb-t">Noch nicht</div>' +
      '<div class="fb-d">Richtig ist <b>' + esc(target) + '</b> — ' + esc(gloss) + '</div></div>';
  },

  /* --- Abschluss --- */
  done() {
    const total = this.right + this.wrong;
    const pct = total ? Math.round(this.right / total * 100) : 0;
    const mark = pct === 100 ? '&#11088;' : pct >= 80 ? '&#127881;' : pct >= 60 ? '&#128077;' : '&#128218;';
    const newly = Stats.learnedToday();
    return '<div class="safe-top"></div><div class="view pop"><div class="result">' +
      '<div class="result-mark">' + mark + '</div>' +
      '<div class="title" style="margin-bottom:10px;">' + (this.practice ? 'Runde beendet' : 'Session beendet') + '</div>' +
      '<div class="result-pct" style="color:' +
        (pct >= 80 ? 'var(--good)' : pct >= 60 ? 'var(--ochre)' : 'var(--bad)') + '">' + pct + '%</div>' +
      '<div class="small" style="margin-top:4px;">' + this.right + ' von ' + total + ' richtig' +
        (this.skipped ? ', ' + this.skipped + ' übersprungen' : '') + '</div>' +
      (this.practice ? this.practiceNote() : '') +
      (newly && !this.practice ? '<div class="panel" style="margin-top:24px;text-align:left;">' +
        '<div class="body"><b>' + newly + '</b> ' +
        (newly === 1 ? 'Wort ist' : 'Wörter sind') + ' heute ins Langzeitgedächtnis gewandert.</div>' +
        '</div>' : '') +
      '</div></div>' +
      '<div class="bottom"><div class="btn-row">' +
        (this.practice
          ? '<button class="btn-line" data-go="library">Schluss</button>' +
            '<button class="btn wide" data-practice-again>Noch eine Runde</button>'
          : '<button class="btn-line" data-go="home">Schluss</button>' +
            '<button class="btn wide" data-start>Noch eine</button>') +
      '</div></div>';
  },

  /* Unter dem Ergebnis einer Übungsrunde: bei einer einzelnen Regel ihr Stand */
  practiceNote() {
    const P = this.practice;
    if (!P || P.type !== 'grammar' || !P.arg) return '';
    const rc = Practice.recent(P.arg);
    if (!rc) return '';
    return '<div class="panel" style="margin-top:24px;text-align:left;">' +
      '<div class="body">Diese Regel: zuletzt <b>' + rc.r + ' von ' + rc.n + '</b> richtig.</div></div>';
  },
};


/* ---------- Vokabeln üben ----------
   Endlos, immer gemischte Richtung, kein Ende, kein Ergebnisbildschirm. */
const Drill = {
  q: null, picked: null, right: 0, wrong: 0, key: 0,
  letzte: [],            // zuletzt gefragte Wörter, gegen Wiederholungen
  set: null,             // auf eine Gruppe beschränkt?

  start(set) {
    this.set = set || null;      // 'lang' | 'arbeit' | null
    this.right = 0; this.wrong = 0; this.key = 0;
    this.picked = null;
    this.letzte = [];
    this.next();
    App.go('drill');
  },

  pool() {
    const W = Store.data.words;
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

    if (ok) {
      this.right++;
      // Nur ein fälliges Wort rückt vor — sonst liesse sich der
      // Wiederholungsabstand durch Pauken aushebeln.
      if (st && Leitner.isDue(st)) Leitner.promote(W, id);
      else if (!st) Leitner.state(W, id).due = Store.dayKey(1);
    } else {
      this.wrong++;
      Leitner.demote(W, id);       // Ein Fehler zählt immer
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

  view() {
    if (!this.q) {
      return '<div class="safe-top"></div>' +
        '<div class="appbar"><button class="iconbtn" data-go="home">' + ICON.back + '</button>' +
        '<div class="head">Vokabeln üben</div><div style="width:38px;"></div></div>' +
        '<div class="view"><div class="view-pad"><div class="card center" style="margin-top:30px;">' +
        '<div class="body">Dafür braucht es ein paar Wörter mehr.</div>' +
        '<div class="small" style="margin-top:6px;">Mach zuerst eine Session.</div>' +
        '</div></div></div>';
    }
    const q = this.q, shown = this.picked !== null;
    const opts = q.options.map(o => {
      let cls = 'opt';
      if (shown) {
        if (o === q.answer) cls += ' right';
        else if (o === this.picked) cls += ' wrong';
        else cls += ' dim';
      }
      return '<button class="' + cls + '" data-drillpick="' + esc(o) + '">' +
        '<span class="opt-in"><span>' + esc(o) + '</span>' +
        (shown && o === q.answer ? '<span>&#10003;</span>' : '') + '</span></button>';
    }).join('');

    return '<div class="safe-top"></div>' +
      '<div class="sess-top">' +
        '<button class="sess-x" data-go="home">&times;</button>' +
        '<span class="body" style="font-weight:560;flex:1;">' +
          (this.set === 'lang' ? 'Langzeitgedächtnis üben'
           : this.set === 'arbeit' ? 'Wörter in Arbeit' : 'Vokabeln üben') + '</span>' +
        '<span class="drillscore"><span class="dg">' + this.right + ' &#10003;</span>' +
        '<span class="dr">' + this.wrong + ' &#10007;</span></span>' +
      '</div>' +
      '<div class="view" key="' + this.key + '"><div class="view-pad">' +
        '<div class="wordcard fade" style="min-height:132px;">' +
          (q.dir === 'sk2de' ? '<button class="speak" data-say="' + esc(q.ask) + '">' +
            ICON.speak + '</button>' : '') +
          '<span class="chip">' + esc(q.dir === 'de2sk' ? 'auf ' + LANGS[currentLang()].name : 'auf Deutsch') + '</span>' +
          '<div class="word' + (q.ask.length > 14 ? ' long' : '') + '" style="margin-top:12px;">' +
            marked(q.ask) + '</div>' +
        '</div>' +
        '<div class="opts" style="margin-top:16px;">' + opts + '</div>' +
        '<div class="tiny center" style="margin-top:18px;">Endlos &mdash; beenden mit &times;</div>' +
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
      '<div class="appbar"><div class="title">Bibliothek</div></div>' +
      '<div style="padding:14px var(--pad) 12px;">' +
        '<div class="seg">' +
          ['woerter', 'saetze', 'phrasen', 'grammatik'].map(k =>
            '<button data-tab="' + k + '" class="' + (t === k ? 'on' : '') + '">' +
            ({ woerter: 'Wörter', saetze: 'Sätze', phrasen: 'Phrasen', grammatik: 'Grammatik' })[k] +
            '</button>').join('') +
        '</div>' +
      '</div>' +
      '<div class="view"><div class="view-pad">' +
        (t === 'woerter' ? this.words() :
         t === 'saetze' ? this.sentences() :
         t === 'phrasen' ? this.phrases() : this.grammar()) +
        '<div class="spacer"></div></div></div>' + navbar('library') + Repeat.view();
  },

  words() {
    const W = Store.data.words;
    const groups = [
      ['lang',   'Im Langzeitgedächtnis', v => W[v.id] && W[v.id].box >= MASTER_BOX],
      ['arbeit', 'In Arbeit',             v => W[v.id] && W[v.id].box < MASTER_BOX],
      ['offen',  'Noch nicht begonnen',   v => !W[v.id]],
    ];
    let out = '<button class="tile" data-words="alle" style="margin-bottom:14px;">' +
      '<div class="head">Alle Wörter durchsehen</div>' +
      '<div class="small">' + DB.vocab.length + ' Einträge, durchsuchbar</div></button>';
    groups.forEach(([key, label, fn]) => {
      const n = DB.vocab.filter(fn).length;
      out += '<button class="row rowbtn" data-words="' + key + '">' +
        '<div class="row-main"><div class="row-sk">' + label + '</div></div>' +
        '<span class="chip">' + n + '</span>' +
        '<span class="rowchev">\u203A</span></button>';
    });
    const b = Stats.byBox();
    out += '<div class="head" style="margin:26px 0 10px;">Verteilung nach Kasten</div>';
    for (let i = 1; i <= 5; i++) {
      const pct = Stats.touched() ? Math.round(b[i] / Stats.touched() * 100) : 0;
      out += '<div style="margin-bottom:11px;">' +
        '<div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:4px;">' +
        '<span>Kasten ' + i + '<span class="tiny"> &middot; alle ' + INTERVALS[i] + ' Tage</span></span>' +
        '<span class="num" style="color:var(--ink-3);">' + b[i] + '</span></div>' +
        '<div class="tile-bar"><i style="width:' + pct + '%"></i></div></div>';
    }
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
        '<span class="chip' + cls + '">' + lab + '</span>' +
        '<button class="speak" style="position:static;width:36px;height:36px;" ' +
        'data-say="' + esc(v.w) + '">' + ICON.speak + '</button></div>';
    }).join('');

    // Gezielt üben lohnt nur, wenn genug Wörter für Antwortmöglichkeiten da sind.
    const uebbar = filter && filter !== 'offen' && liste.length >= 4;

    return '<div class="safe-top"></div>' +
      '<div class="appbar"><button class="iconbtn" data-go="library">' + ICON.back + '</button>' +
      '<div class="head">' + esc(F.titel) + '</div><div style="width:38px;"></div></div>' +
      '<div style="padding:14px var(--pad) 10px;">' +
        (uebbar ? '<button class="btn" style="margin-bottom:10px;" data-drill-set="' + filter +
          '">Diese ' + liste.length + ' Wörter üben</button>' : '') +
        '<input class="search" id="wsearch" placeholder="Suchen…" autocomplete="off"></div>' +
      '<div class="view"><div class="view-pad" id="wlist">' +
      (rows || '<div class="card center"><div class="small">Hier ist noch nichts.</div></div>') +
      '<div class="spacer"></div></div></div>';
  },
  sentences() {
    const open = DB.sentences.filter(s => Session.unlocked(s));
    let out = '<div class="small" style="margin-bottom:14px;">' + open.length +
      ' von ' + DB.sentences.length + ' Sätzen freigeschaltet. Ein Satz erscheint, ' +
      'sobald du seine Wörter kennst.</div>';
    if (open.length >= 4) {
      out += '<button class="btn" data-practice="sentences" style="margin-bottom:14px;">Sätze üben</button>';
    }
    const sprechbar = Session.speechOn();
    out += open.slice(0, 120).map(s =>
      '<div class="row"><div class="row-main">' +
      '<div class="row-sk" style="font-weight:560;">' + esc(s.w) + '</div>' +
      '<div class="row-de">' + esc(s.de) + '</div></div>' +
      '<button class="speak" style="position:static;width:36px;height:36px;" ' +
      'data-say="' + esc(s.w) + '">' + ICON.speak + '</button>' +
      (sprechbar ? '<button class="speak" style="position:static;width:36px;height:36px;' +
        'margin-left:6px;" data-repeat="' + esc(s.w) + '">' + ICON.micSmall + '</button>' : '') +
      '</div>').join('');
    if (!open.length) out += '<div class="card center"><div class="small">' +
      'Noch keine Sätze frei. Lerne ein paar Wörter, dann erscheinen sie hier.</div></div>';
    return out;
  },

  phrases() {
    const ctx = [];
    DB.phrases.forEach(p => { if (!ctx.includes(p.context)) ctx.push(p.context); });
    // Bekannte Situationen in fester Reihenfolge, unbekannte dahinter
    const ord = Practice.CTX_ORDER;
    ctx.sort((a, b) => {
      const ia = ord.indexOf(a), ib = ord.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const top = DB.phrases.length >= 4
      ? '<button class="btn" data-practice="phrases" style="margin-bottom:4px;">Alle Phrasen üben</button>' : '';
    return top + ctx.map(c => {
      const list = DB.phrases.filter(p => p.context === c);
      return '<div class="sechead"><div class="head">' + esc(c) + '</div>' +
        (list.length >= 4
          ? '<button class="chipbtn" data-practice="phrases:' + esc(c) + '">üben</button>' : '') +
        '</div>' +
        list.map(p =>
          '<div class="row"><div class="row-main">' +
          '<div class="row-sk" style="font-weight:560;">' + marked(p.w) + '</div>' +
          '<div class="row-de">' + esc(p.de) + '</div></div>' +
          '<button class="speak" style="position:static;width:36px;height:36px;" ' +
          'data-say="' + esc(p.w) + '">' + ICON.speak + '</button></div>').join('');
    }).join('');
  },

  grammar() {
    const can = DB.grammar.filter(g => Practice.available(g.id)).length >= 2;
    const any = DB.grammar.some(g => Practice.recent(g.id));
    return (can ? '<button class="btn" data-practice="grammar" style="margin-bottom:6px;">Grammatik üben</button>' : '') +
      (any ? '<div class="tiny" style="margin:0 2px 12px;">Die Zahl zeigt, wie viele deiner letzten ' +
        'Antworten zu einer Regel richtig waren.</div>' : '<div style="height:8px;"></div>') +
      DB.grammar.map(g => {
        const rc = Practice.recent(g.id);
        return '<button class="tile" data-chapter="' + esc(g.id) + '" style="margin-bottom:9px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
          '<div><div class="head">' + esc(g.title) + '</div>' +
          '<div class="small">' + esc(g.description) + '</div></div>' +
          '<span style="display:flex;gap:6px;align-items:center;flex:none;">' +
            (rc ? '<span class="chip' + (rc.r / rc.n >= 0.8 ? '' : ' ochre') + '">' + rc.r + '/' + rc.n + '</span>' : '') +
            '<span class="chip">' + esc(g.level) + '</span></span></div></button>';
      }).join('');
  },

  chapter(id) {
    const g = DB.grammar.find(x => x.id === id) || DB.grammar[0];
    const rc = Practice.recent(g.id);
    const rows = g.table.map(r =>
      '<tr><td style="color:var(--ink-2);">' + esc(r[0]) + '</td>' +
      '<td>' + marked(r[1]) + '</td></tr>').join('');
    return '<div class="safe-top"></div>' +
      '<div class="appbar"><button class="iconbtn" data-go="library">' + ICON.back + '</button>' +
      '<div class="head">Grammatik</div><div style="width:38px;"></div></div>' +
      '<div class="view fade"><div class="view-pad" style="padding-top:16px;">' +
        '<div class="title">' + esc(g.title) + '</div>' +
        '<div class="small" style="margin-top:3px;">' + esc(g.description) + '</div>' +
        '<div class="card" style="margin-top:16px;padding:4px 18px 10px;">' +
          '<table class="gtable">' + rows + '</table></div>' +
        '<div class="tipbox">' + esc(g.tip) + '</div>' +
        (Practice.available(g.id)
          ? '<button class="btn" data-practice="grammar:' + esc(g.id) + '" style="margin-top:18px;">Diese Regel üben</button>' +
            (rc ? '<div class="tiny center" style="margin-top:8px;">Zuletzt ' + rc.r + ' von ' + rc.n + ' richtig</div>' : '')
          : '') +
        '<div class="spacer"></div></div></div>';
  },
};

/* ---------- Nachsprechen aus der Bibliothek ----------
   Ein Blatt über der Liste, damit man nicht die Seite verlässt. */
const Repeat = {
  text: '', heard: '', verdict: null,

  open(t) { this.text = t; this.heard = ''; this.verdict = null; App.render(); },
  close() { Listen.stop(); this.text = ''; App.render(); },

  view() {
    if (!this.text) return '';
    const live = Listen.active;
    return '<div class="sheet-bg" data-repeat-close></div>' +
      '<div class="sheet"><div class="sheet-grip"></div>' +
      '<div class="view-pad" style="padding-bottom:10px;">' +
        '<div class="muted center" style="margin-bottom:14px;">Sprich nach</div>' +
        '<div class="wordcard" style="min-height:120px;">' +
          '<button class="speak" data-say="' + esc(this.text) + '">' + ICON.speak + '</button>' +
          '<div class="word' + (this.text.length > 18 ? ' long' : '') + '">' +
            marked(this.text) + '</div>' +
        '</div>' +
        '<div class="heard" style="margin-top:16px;">' + esc(this.heard) + '</div>' +
        '<div class="center" style="margin-top:12px;">' +
          '<button class="mic' + (live ? ' live' : '') + '" data-repeat-listen>' +
            ICON.mic + '</button></div>' +
        '<div class="tiny center" style="margin-top:12px;">' +
          (live ? 'Ich höre zu…' : 'Antippen und sprechen') + '</div>' +
        (this.verdict ? Run.feedback(this.verdict, this.heard, this.text, '') : '') +
        '<button class="btn-line" style="margin-top:18px;" data-repeat-close>Schließen</button>' +
      '</div></div>';
  },
};

/* ---------- Profil ---------- */
/* "vor 3 Minuten" statt einer rohen Uhrzeit */
function relTime(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return 'vor ' + m + ' Minuten';
  const h = Math.round(m / 60);
  if (h < 24) return 'vor ' + h + (h === 1 ? ' Stunde' : ' Stunden');
  const d = Math.round(h / 24);
  return 'vor ' + d + (d === 1 ? ' Tag' : ' Tagen');
}

const Profile = {
  view() {
    const sy = Sync.cfg();
    const vs = Voice.list();
    const m = Stats.mastered(), t = Stats.touched();
    const c = Stats.cefr();
    const pct = Math.round(c.at / c.next * 100);
    const heat = [];
    for (let i = 29; i >= 0; i--) {
      const k = Store.dayKey(-i);
      const d = Store.data.days[k];
      const q = !d ? 0 : d.seen >= Store.data.settings.goal ? 3 : d.seen >= 10 ? 2 : 1;
      heat.push('<i class="q' + q + (i === 0 ? ' today' : '') + '"></i>');
    }
    return '<div class="safe-top"></div>' +
      '<div class="appbar"><div class="title">Profil</div>' +
      '<button class="iconbtn" data-go="legal"><span style="font-size:16px;">&sect;</span></button></div>' +
      '<div class="view"><div class="view-pad" style="padding-top:18px;">' +

      '<div class="panel" style="display:flex;align-items:center;gap:18px;">' +
        '<div class="ring">' + ring(pct, 84, 7) +
        '<div class="ring-in"><div style="font-size:18px;font-weight:680;">' + m + '</div></div></div>' +
        '<div style="flex:1;">' +
          '<div class="head">' + c.label + '</div>' +
          '<div class="small" style="margin-top:2px;">' + m + ' von ' + c.next +
          ' Wörtern im Langzeitgedächtnis</div></div></div>' +

      '<div class="stat-row" style="margin-top:12px;">' +
        '<div class="stat"><b>' + Stats.streak() + '</b><span class="tiny">Tage in Folge</span></div>' +
        '<div class="stat"><b>' + Stats.learnedToday() + '</b><span class="tiny">heute gefestigt</span></div>' +
        '<div class="stat"><b>' + Stats.accuracy() + '%</b><span class="tiny">Treffer</span></div>' +
      '</div>' +

      '<div class="head" style="margin:26px 0 10px;">Letzte 30 Tage</div>' +
      '<div class="heat">' + heat.join('') + '</div>' +

      '<div class="head" style="margin:26px 0 10px;">Wortschatz</div>' +
      '<div class="card">' +
        '<div class="row"><div class="row-main"><div class="row-sk">Begonnen</div></div>' +
        '<span class="chip">' + t + '</span></div>' +
        '<div class="row"><div class="row-main"><div class="row-sk">Im Langzeitgedächtnis</div></div>' +
        '<span class="chip">' + m + '</span></div>' +
        '<div class="row"><div class="row-main"><div class="row-sk">Insgesamt verfügbar</div></div>' +
        '<span class="chip plain">' + DB.vocab.length + '</span></div>' +
      '</div>' +

      '<div class="head" style="margin:26px 0 10px;">Sprachausgabe</div>' +
      '<div class="card">' +
        '<div class="small" style="margin-bottom:12px;">Tempo</div>' +
        '<input type="range" class="slider" id="rate" min="0.5" max="1.1" step="0.05" value="' +
          Voice.rate() + '"/>' +
        '<div class="tiny" style="display:flex;justify-content:space-between;margin-top:2px;">' +
          '<span>langsam</span><span id="ratev">' + Voice.rate().toFixed(2) + '</span><span>normal</span></div>' +
        (vs.length
          ? '<div class="small" style="margin:18px 0 8px;">Stimme</div>' +
            vs.map(function (v, i) {
              const on = Voice.pick && Voice.pick.voiceURI === v.voiceURI;
              return '<div class="row"><div class="row-main">' +
                '<div class="row-sk">' + esc(v.name) +
                  (i > 0 ? ' <span class="chip plain">Variante ' + (i + 1) + '</span>' : '') + '</div>' +
                '<div class="row-de">' + esc(v.lang) + '</div></div>' +
                '<button class="btn-mini" data-voice-try="' + esc(v.voiceURI) + '">Hören</button>' +
                '<button class="btn-mini' + (on ? ' on' : '') + '" data-voice-pick="' +
                  esc(v.voiceURI) + '">' + (on ? 'gewählt' : 'wählen') + '</button></div>';
            }).join('')
          : '<div class="small" style="margin-top:14px;">Für diese Sprache ist keine Stimme ' +
            'installiert. Unter Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen ' +
            'nachladen.</div>') +
      '</div>' +

      '<div class="head" style="margin:26px 0 10px;">Sprechübungen</div>' +
      '<div class="card">' +
        '<div class="row"><div class="row-main">' +
          '<div class="row-sk">Nachsprechen</div>' +
          '<div class="row-de">' + (Listen.available
            ? 'Braucht das Mikrofon. Aus, wenn du still üben willst.'
            : 'Dieser Browser bietet keine Spracherkennung.') + '</div></div>' +
        (Listen.available
          ? '<button class="toggle' + (Store.data.settings.speech !== false ? ' on' : '') +
            '" data-speech-toggle><i></i></button>'
          : '<span class="chip plain">nicht verfügbar</span>') +
        '</div></div>' +

      '<div class="head" style="margin:26px 0 10px;">Geräte verbinden</div>' +
      (Sync.on
        ? '<div class="card">' +
            '<div class="row"><div class="row-main">' +
              '<div class="row-sk">Verbunden</div>' +
              '<div class="row-de">' + (sy.last
                ? 'Zuletzt abgeglichen ' + relTime(sy.last)
                : 'Noch nicht abgeglichen') + '</div></div>' +
            '<span class="chip' + (sy.state === 'offline' ? ' ochre' : '') + '">' +
              (sy.state === 'offline' ? 'offline' : 'aktiv') + '</span></div>' +
            '<div class="btn-row" style="margin-top:12px;">' +
              '<button class="btn-line" data-sync-off>Trennen</button>' +
              '<button class="btn-line" data-sync-now>Jetzt abgleichen</button>' +
            '</div></div>'
        : '<div class="card">' +
            '<div class="small" style="margin-bottom:12px;">Dasselbe Codewort auf jedem Gerät ' +
            'eintragen — dann teilen sie sich den Lernstand. Beide Sprachen werden getrennt ' +
            'abgeglichen.</div>' +
            '<input class="search" id="synccode" placeholder="Codewort" autocomplete="off" ' +
              'autocapitalize="characters" spellcheck="false"/>' +
            '<button class="btn" style="margin-top:10px;" data-sync-on>Verbinden</button>' +
          '</div>') +

      '<div class="head" style="margin:26px 0 10px;">Fortschritt sichern</div>' +
      '<div class="btn-row">' +
        '<button class="btn-line" data-export>Exportieren</button>' +
        '<button class="btn-line" data-import>Importieren</button></div>' +

      '<div class="head" style="margin:26px 0 8px;">Zurücksetzen</div>' +
      '<div class="small" style="margin-bottom:12px;">Löscht alle Kästen, Serien und Statistiken. ' +
      'Nicht umkehrbar.</div>' +
      '<button class="btn-danger" data-reset>Alle Daten löschen</button>' +

      '<div class="tiny center" style="margin-top:26px;">Version ' + APP_VERSION +
      ' &middot; ' + (LANGS[currentLang()] || LANGS.sk).name +
      ' &middot; ' + DB.vocab.length + ' Wörter, ' + DB.sentences.length + ' Sätze</div>' +
      '<div class="spacer"></div></div></div>' + navbar('profile');
  },
};

/* ---------- Impressum ---------- */
const Legal = {
  view() {
    const y = new Date().getFullYear();
    const block = (t, b) => '<div class="head" style="margin:24px 0 8px;">' + t + '</div>' + b;
    return '<div class="safe-top"></div>' +
      '<div class="appbar"><button class="iconbtn" data-go="profile">' + ICON.back + '</button>' +
      '<div class="head">Impressum</div><div style="width:38px;"></div></div>' +
      '<div class="view"><div class="view-pad" style="padding-top:14px;">' +
      '<div class="small">Angaben gemäß § 25 Mediengesetz</div>' +

      block('Medieninhaber', '<div class="card"><div class="body" style="font-weight:600;">Clemens Schleinzer</div>' +
        '<div class="small" style="margin-top:5px;line-height:1.7;">Enzersdorfer Straße 9/2/2<br>' +
        '2401 Fischamend<br>Österreich</div>' +
        '<a href="mailto:schleinzer@gmail.com" style="display:block;margin-top:9px;font-size:14px;' +
        'color:var(--cobalt);text-decoration:none;">schleinzer@gmail.com</a></div>') +

      block('Zweck', '<div class="small">Nicht-kommerzielle Privatanwendung zum Erlernen der ' +
        'slowakischen und italienischen Sprache, ohne Erwerbsabsicht.</div>') +

      block('Datenschutz',
        '<div class="small" style="margin-bottom:10px;">Verantwortlicher im Sinne der DSGVO: ' +
        'Clemens Schleinzer, Enzersdorfer Straße 9/2/2, 2401 Fischamend, schleinzer@gmail.com</div>' +
        '<div class="small" style="margin-bottom:10px;">Der Lernfortschritt wird ausschließlich ' +
        'lokal im Browser gespeichert und verlässt das Gerät nicht. Es werden keine Cookies gesetzt, ' +
        'kein Tracking durchgeführt und keine Analysedienste eingesetzt.</div>' +
        '<div class="small">Beim Aufruf der Seite wird Ihre IP-Adresse an den Hosting-Anbieter ' +
        'übertragen. Externe Programmbibliotheken werden nicht geladen.</div>') +

      block('Spracherkennung',
        '<div class="card" style="background:var(--ochre-wash);">' +
        '<div class="small" style="color:var(--ochre-ink);">Die Sprechübungen sind freiwillig und ' +
        'starten nur, wenn Sie das Mikrofon ausdrücklich freigeben. Dabei wird die Aufnahme zur ' +
        'Erkennung an den Sprachdienst des Geräteherstellers (Apple bzw. Google) übertragen und ' +
        'dort verarbeitet. Ohne Freigabe bleibt die Funktion inaktiv, die App ist vollständig ' +
        'ohne sie nutzbar.</div></div>') +

      block('Abgleich zwischen Geräten',
        '<div class="card" style="background:var(--tint);">' +
        '<div class="small">Wer den Abgleich einschaltet, überträgt seinen Lernfortschritt ' +
        'an einen Speicher bei Cloudflare, der zu dieser Seite gehört. Übertragen wird ' +
        'ausschließlich, welches Wort in welchem Wiederholungskasten steht — keine Namen, ' +
        'keine Kennungen, keine Inhalte. Das Codewort wird nicht im Klartext abgelegt, ' +
        'sondern nur als Prüfsumme. Ohne Einschalten verlässt nichts das Gerät.</div></div>') +

      block('Sprachausgabe',
        '<div class="small">Das Vorlesen erfolgt über die Sprachausgabe des Betriebssystems. ' +
        'Es werden dabei keine Daten an externe Server übertragen.</div>') +

      block('Hosting',
        '<div class="small">GitHub Pages, betrieben von GitHub, Inc., 88 Colin P Kelly Jr St, ' +
        'San Francisco, CA 94107, USA. Beim Seitenaufruf wird die IP-Adresse an GitHub übertragen.</div>') +

      block('Beschwerderecht',
        '<div class="small">Sie haben das Recht, Beschwerde bei der österreichischen ' +
        'Datenschutzbehörde einzulegen: <a href="https://www.dsb.gv.at" target="_blank" ' +
        'rel="noopener" style="color:var(--cobalt);text-decoration:none;">www.dsb.gv.at</a></div>') +

      '<div class="tiny center" style="margin-top:28px;">Stand ' + y + ' — Slovenčina</div>' +
      '<div class="spacer"></div></div></div>';
  },
};
