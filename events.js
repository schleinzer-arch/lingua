/* ============================================================
   Slovenčina — Ereignisse
   ============================================================ */
'use strict';

function on(sel, fn) {
  App.el.querySelectorAll(sel).forEach(el => el.addEventListener('click', ev => {
    ev.preventDefault();
    fn(el, ev);
  }));
}

function bindAll() {
  /* --- Navigation --- */
  on('[data-go]', el => App.go(el.getAttribute('data-go')));
  on('[data-tab]', el => { Library.tab = el.getAttribute('data-tab'); App.render(); });
  on('[data-chapter]', el => App.go('grammar', el.getAttribute('data-chapter')));
  on('[data-start]', () => Run.start());
  on('[data-drill]', () => Drill.start());
  on('[data-drillpick]', el => Drill.answer(el.getAttribute('data-drillpick')));
  on('[data-quit]', () => {
    if (Run.i > 0 && Run.i < Run.items.length) {
      if (!confirm('Session abbrechen? Der bisherige Fortschritt bleibt gespeichert.')) return;
    }
    Listen.stop();
    App.go('home');
  });

  /* --- Vorlesen --- */
  on('[data-say]', el => {
    Voice.say(el.getAttribute('data-say'));
    el.classList.add('on');
    setTimeout(() => el.classList.remove('on'), 550);
  });

  /* --- Neue Vokabel / Phrase bestätigen --- */
  on('[data-intro-ok]', () => {
    const it = Run.cur();
    const st = Leitner.state(Store.data.words, it.word.id);
    st.box = 1;
    st.due = Store.dayKey(1);
    Store.day().seen++;
    Store.save();
    Run.next();
  });

  on('[data-phrase-ok]', () => {
    const it = Run.cur();
    Leitner.promote(Store.data.phrases, it.phrase.id);
    Store.day().seen++;
    Store.save();
    Run.next();
  });

  /* --- Mehrfachauswahl --- */
  on('[data-pick]', el => {
    if (Run.phase === 'a') return;
    const it = Run.cur();
    const choice = el.getAttribute('data-pick');
    Run.picked = choice;
    Run.phase = 'a';
    const ok = choice === it.q.answer;
    Run.verdict = ok ? 'exact' : 'wrong';

    if (it.fresh) {
      // Sofortabfrage direkt nach der Einführung: zählt als geübt,
      // bewegt den Kasten aber nicht. Das Wort ist morgen wieder dran.
      const st = Leitner.state(Store.data.words, it.word.id);
      st.due = Store.dayKey(1);
      if (ok) { Run.right++; Leitner.raise(Store.data.words, it.word.id, 1); }
      else Run.wrong++;
      const d = Store.day(); d.seen++; if (ok) d.right++;
      Store.save();
    } else {
      Run.answer(ok, it.word.id, Store.data.words, it.dir === 'de2sk' ? 2 : 1);
    }
    App.render();
  });

  on('[data-pickphrase]', el => {
    if (Run.phase === 'a') return;
    const it = Run.cur();
    const choice = el.getAttribute('data-pickphrase');
    Run.picked = choice;
    Run.phase = 'a';
    const ok = choice === it.phrase.de;
    Run.verdict = ok ? 'exact' : 'wrong';
    if (ok) { Run.right++; Leitner.promote(Store.data.phrases, it.phrase.id); }
    else { Run.wrong++; Leitner.demote(Store.data.phrases, it.phrase.id); }
    const d = Store.day(); d.seen++; if (ok) d.right++;
    Store.save();
    App.render();
  });

  /* --- Paare zuordnen --- */
  on('[data-pair]', el => {
    const val = el.getAttribute('data-pair');
    const side = val.slice(0, 1), id = val.slice(2);
    if (Run.matched.indexOf(id) !== -1) return;

    if (!Run.pick1) { Run.pick1 = { side, id }; Run.missPair = null; App.render(); return; }
    if (Run.pick1.side === side) { Run.pick1 = { side, id }; App.render(); return; }

    const it = Run.cur();
    if (Run.pick1.id === id) {
      Run.matched.push(id);
      Run.pick1 = null; Run.missPair = null;
      Leitner.raise(Store.data.words, id, 1);
      if (Run.matched.length >= it.q.total) {
        Run.right++;
        const d = Store.day(); d.seen++; d.right++;
        Store.save();
        App.render();
        setTimeout(() => { if (App.screen === 'session') Run.next(); }, 550);
        return;
      }
    } else {
      Run.missPair = [Run.pick1.side + ':' + Run.pick1.id, side + ':' + id];
      Run.pick1 = null;
      setTimeout(() => { Run.missPair = null; if (App.screen === 'session') App.render(); }, 550);
    }
    App.render();
  });

  /* --- Eintippen --- */
  on('[data-check-type]', () => {
    const inp = App.el.querySelector('#typed');
    if (!inp) return;
    const it = Run.cur();
    const said = inp.value;
    Run.picked = said;
    Run.verdict = Text.compare(said, it.word.w);
    Run.phase = 'a';
    Run.answer(Run.verdict !== 'wrong', it.word.id, Store.data.words, 3);
    App.render();
  });

  /* --- Diktat --- */
  on('[data-check-dict]', () => {
    const inp = App.el.querySelector('#typed');
    if (!inp) return;
    const it = Run.cur();
    Run.picked = inp.value;
    Run.verdict = Text.compare(inp.value, it.sent.w);
    Run.phase = 'a';
    const ok = Run.verdict !== 'wrong';
    it.sent.words.forEach(w => {
      if (ok) { Leitner.promote(Store.data.words, w); Leitner.raise(Store.data.words, w, 3); }
    });
    if (ok) Run.right++; else Run.wrong++;
    const d = Store.day(); d.seen++; if (ok) d.right++;
    Store.save();
    App.render();
  });

  /* --- Wortbausteine --- */
  on('[data-slot]', el => {
    if (Run.phase === 'a') return;
    Run.built.push(el.getAttribute('data-slot'));
    App.render();
  });

  on('[data-unslot]', el => {
    if (Run.phase === 'a') return;
    Run.built.splice(parseInt(el.getAttribute('data-unslot'), 10), 1);
    App.render();
  });

  on('[data-check-build]', () => {
    const it = Run.cur();
    const said = Run.built.join(' ');
    Run.verdict = Text.compare(said, it.q.target);
    Run.phase = 'a';
    const ok = Run.verdict === 'exact' || Run.verdict === 'diacritics';
    it.sent.words.forEach(w => {
      if (ok) { Leitner.promote(Store.data.words, w); Leitner.raise(Store.data.words, w, 2); }
      else Leitner.demote(Store.data.words, w);
    });
    if (ok) Run.right++; else Run.wrong++;
    const d = Store.day(); d.seen++; if (ok) d.right++;
    Store.save();
    App.render();
  });

  /* --- Nachsprechen --- */
  on('[data-listen]', () => {
    if (Run.phase === 'a') return;
    if (Listen.active) { Listen.stop(); return; }
    const it = Run.cur();
    Run.heard = '';
    App.render();

    Listen.start(
      partial => {
        Run.heard = partial;
        const h = App.el.querySelector('.heard');
        if (h) h.textContent = partial;
      },
      final => {
        Run.heard = final || Run.heard;
        if (!Run.heard) { App.render(); return; }
        Run.verdict = Text.compare(Run.heard, it.phrase.w);
        Run.phase = 'a';
        const ok = Run.verdict === 'exact' || Run.verdict === 'diacritics';
        Leitner[ok ? 'promote' : 'demote'](Store.data.phrases, it.phrase.id);
        if (ok) Leitner.raise(Store.data.phrases, it.phrase.id, 4);
        if (ok) Run.right++; else Run.wrong++;
        const d = Store.day(); d.seen++; if (ok) d.right++;
        Store.save();
        App.render();
      },
      err => {
        Run.heard = err === 'not-allowed' || err === 'service-not-allowed'
          ? 'Mikrofon nicht freigegeben'
          : err === 'no-speech' ? 'Nichts gehört — nochmal versuchen'
          : err === 'language-not-supported' ? 'Slowakisch wird nicht unterstützt'
          : 'Erkennung fehlgeschlagen';
        App.render();
      }
    );
    setTimeout(() => App.render(), 40);
  });

  /* Übung überspringen — bleibt ungewertet.
     Kein Kastenwechsel, keine Statistik, das Wort kommt wieder. */
  on('[data-skip]', () => {
    Listen.stop();
    Run.skipped++;
    Run.next();
  });

  on('[data-next]', () => Run.next());

  /* --- Sprache wechseln --- */
  on('[data-lang]', el => App.switchLang(el.getAttribute('data-lang')));

  /* --- Abgleich --- */
  on('[data-sync-on]', () => {
    const inp = App.el.querySelector('#synccode');
    const code = inp ? inp.value.trim() : '';
    if (code.length < 3) { alert('Bitte ein Codewort mit mindestens drei Zeichen eingeben.'); return; }
    Sync.connect(code);
    App.render();
    Sync.run().then(r => {
      if (!r.ok) alert(syncFehler(r.grund));
      App.render();
    });
  });

  on('[data-sync-now]', el => {
    el.textContent = 'Gleiche ab…';
    Sync.run().then(r => {
      if (!r.ok) alert(syncFehler(r.grund));
      App.render();
    });
  });

  on('[data-sync-off]', () => {
    if (!confirm('Verbindung trennen? Der Lernstand auf diesem Gerät bleibt erhalten.')) return;
    Sync.disconnect();
    App.render();
  });

  on('[data-speech-toggle]', () => {
    Store.data.settings.speech = Store.data.settings.speech === false;
    Store.save();
    App.render();
  });

  /* --- Suche in der Wortliste --- */
  const search = App.el.querySelector('#wsearch');
  if (search) {
    search.addEventListener('input', () => {
      // Diakritika ignorieren: „velky" findet auch „veľký"
      const q = Text.flat(search.value);
      App.el.querySelectorAll('#wlist .row').forEach(row => {
        const t = Text.flat((row.getAttribute('data-word') || '') + ' ' + row.textContent);
        row.style.display = !q || t.includes(q) ? '' : 'none';
      });
    });
  }

  /* --- Eingabefeld: Enter prüft --- */
  const typed = App.el.querySelector('#typed');
  if (typed && !typed.disabled) {
    typed.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      const btn = App.el.querySelector('[data-check-type],[data-check-dict]');
      if (btn) btn.click();
    });
  }

  /* --- Sichern --- */
  on('[data-export]', () => {
    const blob = new Blob([JSON.stringify(Store.data, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'slovencina-fortschritt.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  on('[data-import]', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const d = JSON.parse(r.result);
          if (!d || !d.words) throw new Error('Format');
          Store.data = d;
          Store.save();
          alert('Fortschritt übernommen.');
          App.go('profile');
        } catch (e) {
          alert('Diese Datei konnte nicht gelesen werden.');
        }
      };
      r.readAsText(f);
    });
    document.body.appendChild(inp);
    inp.click();
    document.body.removeChild(inp);
  });

  on('[data-reset]', () => {
    if (!confirm('Wirklich alle Daten löschen? Kästen, Serien und Statistiken gehen verloren.')) return;
    Store.reset();
    App.go('home');
  });
}

/* Fehlermeldungen des Abgleichs in Klartext */
function syncFehler(grund) {
  if (grund === 'offline') return 'Keine Verbindung. Der Abgleich läuft beim nächsten Mal automatisch.';
  if (grund === 'kv-fehlt') return 'Auf dem Server fehlt der Speicher. Im Cloudflare-Dashboard den ' +
    'KV-Namespace als FORTSCHRITT mit dem Pages-Projekt verbinden und neu bereitstellen.';
  if (grund === 'code-fehlt') return 'Das Codewort fehlt oder ist zu kurz.';
  if (grund === 'zu-gross') return 'Der Lernstand ist zu groß für den Abgleich.';
  return 'Abgleich fehlgeschlagen (' + grund + ').';
}

/* ---------- Start ---------- */
document.addEventListener('DOMContentLoaded', () => App.boot());
