'use strict';
// Tests d'intégration : vraie base PostgreSQL, vrai serveur HTTP.
// Utilise TEST_DATABASE_URL (jamais la base de production !).
const test = require('node:test');
const assert = require('node:assert/strict');
const { SMTPServer } = require('smtp-server');
const { loadConfig } = require('../src/config');
const { createPool, migrate } = require('../src/db');
const { createApp } = require('../src/app');
const { createMailer } = require('../src/mailer');

const URL_DB = process.env.TEST_DATABASE_URL || 'postgresql://masterclass:devpass@127.0.0.1:5432/masterclass_test';
const REAL_LOOKING_GROUP = 'https://chat.whatsapp.com/ABCDEFGHIJKLMNOPQRSTUV'; // valeur de TEST uniquement

function cfg(extra = {}) {
  return { ...loadConfig({ DATABASE_URL: URL_DB, RATE_LIMIT_REGISTER_MAX: '100000', ...extra.env }), ...extra.over };
}

async function boot(extra = {}) {
  const config = cfg(extra);
  const pool = createPool(config);
  await migrate(pool, () => {});
  const mailer = extra.mailer === undefined ? null : extra.mailer;
  const server = createApp({ config, pool, mailer }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, path = '/api/register') =>
    fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { config, pool, server, base, post, close: async () => { server.close(); await pool.end(); } };
}

const person = (n, over = {}) => ({
  fullName: `Mamadou Test${'abcdefghij'[n % 10]}`,
  email: `person${n}@example.com`,
  phone: `66${String(1000000 + n).slice(-7)}`,
  phoneCountry: 'GN',
  consent: true,
  website: '',
  ...over,
});

let ctx;
test.before(async () => {
  ctx = await boot();
});
test.beforeEach(async () => { await ctx.pool.query('TRUNCATE registrations RESTART IDENTITY'); });
test.after(async () => { await ctx.close(); });

const count = async () => Number((await ctx.pool.query('SELECT count(*) FROM registrations')).rows[0].count);

test('inscription valide : 201 et ligne réellement présente en base', async () => {
  const r = await ctx.post(person(1));
  assert.equal(r.status, 201);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.emailSent, false);            // aucun SMTP → on ne prétend pas avoir envoyé d'e-mail
  assert.equal(d.whatsappGroupUrl, null);      // pas de lien configuré → pas de faux lien
  assert.match(d.contactUrl, /^https:\/\/wa\.me\/224660354794$/);
  const row = (await ctx.pool.query('SELECT * FROM registrations')).rows[0];
  assert.equal(row.email_normalized, 'person1@example.com');
  assert.match(row.phone_e164, /^\+224\d{9}$/);
});

test('e-mail déjà utilisé (casse et espaces ignorés) : 409, rien d’ajouté', async () => {
  await ctx.post(person(1));
  const r = await ctx.post(person(2, { email: '  PERSON1@Example.COM ' }));
  assert.equal(r.status, 409);
  const d = await r.json();
  assert.equal(d.code, 'DUPLICATE');
  assert.deepEqual(d.fields, ['email']);
  assert.match(d.message, /e-mail est déjà associée/);
  assert.equal(await count(), 1);
});

test('alias Gmail (points, +étiquette) = même personne', async () => {
  await ctx.post(person(1, { email: 'jean.dupont@gmail.com' }));
  for (const e of ['jeandupont@gmail.com', 'jean.dupont+promo@gmail.com', 'J.E.A.N.dupont@googlemail.com']) {
    const r = await ctx.post(person(Math.floor(Math.random() * 1e5) + 50, { email: e }));
    assert.equal(r.status, 409, e);
  }
  assert.equal(await count(), 1);
});

test('numéro déjà utilisé, quelle que soit la façon de l’écrire : 409', async () => {
  await ctx.post(person(1, { phone: '660354794' }));
  for (const [i, p] of ['+224 660 35 47 94', '00224660354794', '660 35 47 94', '+224-660-354-794'].entries()) {
    const r = await ctx.post(person(10 + i, { phone: p }));
    assert.equal(r.status, 409, p);
    assert.deepEqual((await r.json()).fields, ['phone']);
  }
  assert.equal(await count(), 1);
});

test('e-mail ET numéro déjà utilisés : message indiquant les deux', async () => {
  await ctx.post(person(1));
  const r = await ctx.post(person(1, { fullName: 'Autre Nom' }));
  assert.equal(r.status, 409);
  const d = await r.json();
  assert.deepEqual(d.fields.sort(), ['email', 'phone']);
});

test('deux personnes différentes avec le même nom ne sont pas bloquées', async () => {
  assert.equal((await ctx.post(person(1, { fullName: 'Ibrahima Camara' }))).status, 201);
  assert.equal((await ctx.post(person(2, { fullName: 'Ibrahima Camara' }))).status, 201);
  assert.equal(await count(), 2);
});

test('champs incomplets ou invalides : 422 avec messages par champ, rien d’enregistré', async () => {
  const r = await ctx.post({ fullName: '', email: 'pas-un-mail', phone: '12', phoneCountry: 'GN', consent: false });
  assert.equal(r.status, 422);
  const d = await r.json();
  assert.deepEqual(Object.keys(d.errors).sort(), ['consent', 'email', 'fullName', 'phone']);
  assert.equal(await count(), 0);
  // prénom seul refusé ; consentement obligatoire
  assert.equal((await ctx.post(person(3, { fullName: 'Salim' }))).status, 422);
  assert.equal((await ctx.post(person(4, { consent: false }))).status, 422);
  assert.equal((await ctx.post(person(5, { phone: '+224 123' }))).status, 422);
});

test('numéros étrangers valides acceptés (France avec 0 initial, +indicatif complet)', async () => {
  assert.equal((await ctx.post(person(1, { phone: '06 12 34 56 78', phoneCountry: 'FR' }))).status, 201);
  assert.equal((await ctx.post(person(2, { phone: '+221 77 123 45 67', phoneCountry: 'GN' }))).status, 201);
  const phones = (await ctx.pool.query('SELECT phone_e164 FROM registrations ORDER BY id')).rows.map((r) => r.phone_e164);
  assert.deepEqual(phones, ['+33612345678', '+221771234567']);
});

test('25 soumissions simultanées identiques : une seule inscription créée', async () => {
  const body = person(7);
  const rs = await Promise.all(Array.from({ length: 25 }, () => ctx.post(body)));
  const codes = rs.map((r) => r.status);
  assert.equal(codes.filter((c) => c === 201).length, 1, codes.join(','));
  assert.equal(codes.filter((c) => c === 409).length, 24, codes.join(','));
  assert.equal(await count(), 1);
});

test('soumissions simultanées : même e-mail avec 20 numéros différents → une seule inscription', async () => {
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => ctx.post(person(100 + i, { email: 'meme@example.com' }))));
  assert.equal(rs.filter((r) => r.status === 201).length, 1);
  assert.equal(await count(), 1);
});

test('champ-piège rempli par un robot : refusé, rien enregistré', async () => {
  const r = await ctx.post(person(1, { website: 'http://spam.example' }));
  assert.equal(r.status, 400);
  assert.equal(await count(), 0);
});

test('injection SQL / HTML dans les champs : traité comme du texte, table intacte', async () => {
  const r = await ctx.post(person(1, { fullName: "Robert'); DROP TABLE registrations;-- X" }));
  assert.equal(r.status, 422);
  assert.equal(await count(), 0);
  const ok = await ctx.post(person(2, { fullName: "Aïssatou N'Diaye-Bah" }));
  assert.equal(ok.status, 201);
});

test('aucune route publique ne liste les inscrits', async () => {
  await ctx.post(person(1));
  for (const p of ['/api/registrations', '/api/participants', '/api/admin', '/api/export']) {
    const r = await fetch(ctx.base + p);
    assert.equal(r.status, 404, p);
  }
});

test('JSON invalide ou trop volumineux : erreur propre, pas de plantage', async () => {
  const bad = await fetch(ctx.base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal(bad.status, 400);
  const huge = await fetch(ctx.base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: 'x'.repeat(20000) }) });
  assert.equal(huge.status, 413);
  assert.equal((await fetch(ctx.base + '/api/health')).status, 200);
});

test('page d’accueil : titre exact, Open Graph avec URL absolue, en-têtes de sécurité', async () => {
  const r = await fetch(ctx.base + '/');
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /<meta property="og:title" content="Les 5 erreurs qui font dévier ton avenir">/);
  assert.match(html, new RegExp(`og:image" content="${ctx.base.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/img/og.jpg"`));
  assert.match(html, /gratuite organisée par DIABY Salim/);
  assert.ok(r.headers.get('content-security-policy').includes("script-src 'self'"));
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.doesNotMatch(html, /{{/);
});

test('lien WhatsApp réel configuré : renvoyé après inscription ; lien invalide ignoré', async () => {
  const c = await boot({ env: { WHATSAPP_GROUP_INVITE_URL: REAL_LOOKING_GROUP } });
  try {
    await c.pool.query('TRUNCATE registrations');
    const d = await (await c.post(person(1))).json();
    assert.equal(d.whatsappGroupUrl, REAL_LOOKING_GROUP);
    const dup = await (await c.post(person(1))).json();      // retour d'un inscrit
    assert.equal(dup.code, 'DUPLICATE');
    assert.equal(dup.whatsappGroupUrl, REAL_LOOKING_GROUP);
  } finally { await c.close(); }
  const c2 = await boot({ env: { WHATSAPP_GROUP_INVITE_URL: 'https://example.com/faux' } });
  try { assert.equal(c2.config.whatsappGroupInviteUrl, ''); } finally { await c2.close(); }
});

test('e-mail : envoyé et signalé seulement si le SMTP répond ; échec SMTP n’annule pas l’inscription', async () => {
  const received = [];
  const smtp = new SMTPServer({
    authOptional: true, disabledCommands: ['STARTTLS'],
    onData(stream, _s, cb) { let b = ''; stream.on('data', (c) => (b += c)); stream.on('end', () => { received.push(b); cb(); }); },
  });
  await new Promise((r) => smtp.listen(0, '127.0.0.1', r));
  const port = smtp.server.address().port;
  const env = { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_FROM: 'DIABY Salim <contact@test.local>' };
  const c = await boot({ env, mailer: createMailer(loadConfig({ DATABASE_URL: URL_DB, ...env })) });
  try {
    await c.pool.query('TRUNCATE registrations');
    const d = await (await c.post(person(1))).json();
    assert.equal(d.emailSent, true);
    assert.equal(received.length, 1);
    assert.match(received[0], /Subject:/);
    assert.match(received[0], /Inscription confirm|Inscription=20confirm|=\?UTF-8/i);
    assert.match(received[0], /2026/);
    assert.equal((await c.pool.query('SELECT confirmation_email_sent FROM registrations')).rows[0].confirmation_email_sent, true);
  } finally { await c.close(); }
  await new Promise((r) => smtp.close(r));
  // SMTP à présent injoignable
  const c2 = await boot({ env: { ...env, SMTP_PORT: String(port) }, mailer: createMailer(loadConfig({ DATABASE_URL: URL_DB, ...env })) });
  try {
    const r = await c2.post(person(2));
    assert.equal(r.status, 201);
    assert.equal((await r.json()).emailSent, false);
    assert.equal((await c2.pool.query('SELECT count(*) FROM registrations')).rows[0].count, '2');
  } finally { await c2.close(); }
});

test('base de données injoignable : 503, jamais de faux succès', async () => {
  const config = cfg({ env: {}, over: { databaseUrl: 'postgresql://x:y@127.0.0.1:1/none' } });
  const pool = createPool(config);
  const server = createApp({ config, pool, mailer: null }).listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(person(1)) });
    assert.equal(r.status, 503);
    const d = await r.json();
    assert.equal(d.ok, false);
    assert.match(d.message, /n’a pas été enregistrée/);
  } finally { server.close(); await pool.end().catch(() => {}); }
});

test('persistance : les inscriptions survivent à l’arrêt complet du serveur et du pool', async () => {
  await ctx.post(person(1));
  await ctx.post(person(2));
  const c = await boot();             // « redémarrage » : nouveau pool, nouveau serveur HTTP
  try {
    assert.equal(Number((await c.pool.query('SELECT count(*) FROM registrations')).rows[0].count), 2);
    assert.equal((await c.post(person(1))).status, 409);   // et la détection de doublons fonctionne toujours
  } finally { await c.close(); }
});

test('limitation de débit : au-delà du plafond, réponse 429 claire et rien d’enregistré en plus', async () => {
  const c = await boot({ env: { RATE_LIMIT_REGISTER_MAX: '3' } });
  try {
    await c.pool.query('TRUNCATE registrations');
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await c.post(person(200 + i))).status);
    assert.deepEqual(codes, [201, 201, 201, 429, 429]);
    assert.equal((await c.pool.query('SELECT count(*) FROM registrations')).rows[0].count, '3');
  } finally { await c.close(); }
});
