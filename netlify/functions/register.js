'use strict';
// Fonction Netlify : POST /api/register  (redirigée depuis netlify.toml)
const { loadConfig } = require('../../src/config');
const { createPool, ensureSchema } = require('../../src/db');
const { createMailer } = require('../../src/mailer');
const { processRegistration } = require('../../src/registration');

let state; // réutilisé tant que l'instance de la fonction reste « chaude »

async function init() {
  if (state) return state;
  const config = loadConfig();
  const pool = createPool(config, { max: 1, connectionTimeoutMillis: 7000 });
  pool.on('error', () => { state = undefined; });
  await ensureSchema(pool); // idempotent : crée la table au premier appel (sans verrou, compatible pooler)
  state = { config, pool, mailer: createMailer(config) };
  return state;
}

const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, code: 'METHOD', message: 'Méthode non autorisée.' });
  if ((event.body || '').length > 10000) return json(413, { ok: false, code: 'BAD_REQUEST', message: 'Requête invalide.' });

  let body;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
    body = JSON.parse(raw);
  } catch (_) {
    return json(400, { ok: false, code: 'BAD_REQUEST', message: 'Requête invalide.' });
  }

  let ctx;
  try {
    ctx = await init();
  } catch (e) {
    console.error('[init] ÉCHEC base de données :', e.code || '', e.message);
    state = undefined;
    return json(503, { ok: false, code: 'SERVER', message: 'Le service est momentanément indisponible. Ton inscription n’a pas été enregistrée : réessaie dans un instant.' });
  }
  const { status, json: out } = await processRegistration(body, ctx);
  return json(status, out);
};
