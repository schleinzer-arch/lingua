/* ============================================================
   Sloven\u010dina — Abgleich zwischen Ger\u00e4ten
   Cloudflare Pages Function. Liegt unter functions/sync.js und ist
   dadurch als https://<deine-domain>/sync erreichbar.

   Voraussetzung: Im Pages-Projekt unter Einstellungen -> Bindings
   ein KV-Namespace mit dem Variablennamen FORTSCHRITT verbinden.

   Gespeichert wird ausschliesslich der Lernfortschritt: welches Wort
   in welchem Kasten steht. Keine Namen, keine Kennungen, keine
   IP-Adressen. Der Code wird nie im Klartext abgelegt, sondern nur
   als Pruefsumme, die den Datensatz benennt.
   ============================================================ */

const MAX_BYTES = 2 * 1024 * 1024;   // 2 MB reichen weit ueber ein Jahr hinaus

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/* Aus dem Code einen Schluessel machen. Der Code selbst wird nicht
   gespeichert, nur sein Hash — wer den Speicher einsieht, kann daraus
   nicht auf den Code zurueckschliessen. */
async function keyFor(code) {
  const norm = String(code || '').trim().toLowerCase();
  if (norm.length < 3) return null;
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('slovencina:' + norm)
  );
  return 'p_' + [...new Uint8Array(buf)]
    .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.FORTSCHRITT) {
    return json({ error: 'kv-fehlt',
      hinweis: 'Im Pages-Projekt unter Einstellungen \u2192 Bindings einen ' +
               'KV-Namespace mit dem Variablennamen FORTSCHRITT verbinden ' +
               'und das Projekt neu bereitstellen.' }, 500);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  /* ---- Holen ---- */
  if (request.method === 'GET') {
    const code = new URL(request.url).searchParams.get('code');
    const key = await keyFor(code);
    if (!key) return json({ error: 'code-fehlt' }, 400);

    const stored = await env.FORTSCHRITT.get(key);
    if (!stored) return json({ leer: true });
    try {
      return json({ leer: false, data: JSON.parse(stored) });
    } catch (e) {
      return json({ error: 'defekt' }, 500);
    }
  }

  /* ---- Schreiben ---- */
  if (request.method === 'PUT' || request.method === 'POST') {
    let body;
    try { body = await request.json(); }
    catch (e) { return json({ error: 'kein-json' }, 400); }

    const key = await keyFor(body && body.code);
    if (!key) return json({ error: 'code-fehlt' }, 400);
    if (!body.data || typeof body.data !== 'object') {
      return json({ error: 'keine-daten' }, 400);
    }

    const text = JSON.stringify(body.data);
    if (text.length > MAX_BYTES) return json({ error: 'zu-gross' }, 413);

    await env.FORTSCHRITT.put(key, text);
    return json({ ok: true, groesse: text.length });
  }

  return json({ error: 'methode' }, 405);
}
