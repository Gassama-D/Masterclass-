'use strict';
// Teste la fonction Netlify (netlify/functions/register.js) avec de vrais événements Lambda et une vraie base.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://masterclass:devpass@127.0.0.1:5432/masterclass_test';
process.env.WHATSAPP_GROUP_INVITE_URL = 'https://chat.whatsapp.com/ABCDEFGHIJKLMNOPQRSTUV'; // valeur de TEST
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { handler } = require('../netlify/functions/register');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const call = (body, method = 'POST') => handler({ httpMethod: method, body: typeof body === 'string' ? body : JSON.stringify(body), isBase64Encoded: false });
const person = (n, o = {}) => ({ fullName: `Fatoumata Test${'abcdefghij'[n % 10]}`, email: `fn${n}@example.com`, phone: `65${String(1000000 + n).slice(-7)}`, phoneCountry: 'GN', consent: true, website: '', ...o });
const count = async () => Number((await pool.query('SELECT count(*) FROM registrations')).rows[0].count);

test.before(async () => { await call(person(0)); await pool.query('TRUNCATE registrations'); });
test.after(async () => { await pool.end(); setTimeout(() => process.exit(0), 100); });
test.beforeEach(async () => { await pool.query('TRUNCATE registrations'); });

test('Netlify : inscription valide → 201, enregistrée en base, lien WhatsApp renvoyé', async () => {
  const r = await call(person(1));
  assert.equal(r.statusCode, 201);
  const d = JSON.parse(r.body);
  assert.equal(d.ok, true);
  assert.equal(d.whatsappGroupUrl, process.env.WHATSAPP_GROUP_INVITE_URL);
  assert.equal(d.emailSent, false);
  assert.equal(await count(), 1);
});

test('Netlify : doublons e-mail et téléphone refusés (409)', async () => {
  await call(person(1));
  assert.equal((await call(person(2, { email: 'FN1@Example.com' }))).statusCode, 409);
  assert.equal((await call(person(3, { phone: '00224 651 000 001' }))).statusCode, 409);
  assert.equal(await count(), 1);
});

test('Netlify : 20 appels simultanés identiques → une seule inscription', async () => {
  const rs = await Promise.all(Array.from({ length: 20 }, () => call(person(5))));
  assert.equal(rs.filter((r) => r.statusCode === 201).length, 1);
  assert.equal(await count(), 1);
});

test('Netlify : validation, robot, JSON invalide, mauvaise méthode', async () => {
  assert.equal((await call({ fullName: '', email: 'x', phone: '1', consent: false })).statusCode, 422);
  assert.equal((await call(person(1, { website: 'spam' }))).statusCode, 400);
  assert.equal((await call('{oops')).statusCode, 400);
  assert.equal((await call(person(1), 'GET')).statusCode, 405);
  assert.equal((await call('x'.repeat(20000))).statusCode, 413);
  assert.equal(await count(), 0);
});

test('Netlify : création du schéma sans verrou, même avec 10 démarrages simultanés sur base vierge', async () => {
  const { ensureSchema, connectionStringFor } = require('../src/db');
  await pool.query('DROP TABLE registrations');
  const p2 = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  try {
    await Promise.all(Array.from({ length: 10 }, () => ensureSchema(p2)));
    assert.ok((await p2.query("SELECT to_regclass('public.registrations') t")).rows[0].t);
  } finally { await p2.end(); }
  // l'URL est nettoyée quand DATABASE_SSL=true
  assert.equal(connectionStringFor({ databaseSsl: true, databaseUrl: 'postgresql://u:p@h/db?sslmode=require&channel_binding=require' }), 'postgresql://u:p@h/db?channel_binding=require');
  assert.equal(connectionStringFor({ databaseSsl: false, databaseUrl: 'postgresql://u:p@h/db?sslmode=require' }), 'postgresql://u:p@h/db?sslmode=require');
});
