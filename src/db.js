'use strict';
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Si DATABASE_SSL=true, on impose nous-mêmes le chiffrement SSL et on retire « sslmode » de l'URL :
// sinon certains fournisseurs (Supabase, certains « poolers ») provoquent une erreur de certificat.
function connectionStringFor(config) {
  if (!config.databaseSsl) return config.databaseUrl;
  try {
    const u = new URL(config.databaseUrl);
    ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'].forEach((k) => u.searchParams.delete(k));
    return u.toString();
  } catch (_) {
    return config.databaseUrl;
  }
}

function createPool(config, opts = {}) {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL est manquant (variable d’environnement non définie ou non disponible pour les fonctions).');
  }
  return new Pool({
    connectionString: connectionStringFor(config),
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
    max: opts.max || 10,
    connectionTimeoutMillis: opts.connectionTimeoutMillis || 5000,
    idleTimeoutMillis: 30000,
  });
}

// Création du schéma SANS verrou ni suivi : compatible avec les « poolers » (PgBouncer, mode transaction)
// qui ne supportent pas les verrous de session. Tous les scripts de migration sont idempotents (IF NOT EXISTS).
async function ensureSchema(pool) {
  const dir = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      await pool.query(sql);
    } catch (e) {
      // Course possible entre deux démarrages simultanés : on vérifie que la table existe bien.
      const chk = await pool.query("SELECT to_regclass('public.registrations') AS t");
      if (!chk.rows[0].t) throw e;
    }
  }
}

async function migrate(pool, log = console.log) {
  const dir = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    // Verrou consultatif : évite deux migrations simultanées au démarrage de plusieurs instances.
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    for (const f of files) {
      const done = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [f]);
      if (done.rowCount) continue;
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        await client.query('COMMIT');
        log(`Migration appliquée : ${f}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    client.release();
  }
}

class DuplicateError extends Error {
  constructor(fields) {
    super('duplicate');
    this.fields = fields;
  }
}

// Insère l'inscription. L'unicité est garantie par PostgreSQL (contraintes UNIQUE) :
// même deux requêtes strictement simultanées ne peuvent pas créer de doublon.
async function insertRegistration(pool, r) {
  try {
    const res = await pool.query(
      `INSERT INTO registrations (full_name, email, email_normalized, phone_e164, phone_country, consent_at)
       VALUES ($1, $2, $3, $4, $5, now()) RETURNING id`,
      [r.fullName, r.email, r.emailNormalized, r.phoneE164, r.phoneCountry]
    );
    return res.rows[0].id;
  } catch (e) {
    if (e.code === '23505') {
      const found = await pool.query(
        'SELECT (email_normalized = $1) AS e, (phone_e164 = $2) AS p FROM registrations WHERE email_normalized = $1 OR phone_e164 = $2',
        [r.emailNormalized, r.phoneE164]
      );
      const fields = new Set();
      for (const row of found.rows) {
        if (row.e) fields.add('email');
        if (row.p) fields.add('phone');
      }
      if (!fields.size) fields.add(/phone/.test(e.constraint || '') ? 'phone' : 'email');
      throw new DuplicateError([...fields]);
    }
    throw e;
  }
}

module.exports = { createPool, migrate, ensureSchema, connectionStringFor, insertRegistration, DuplicateError };
