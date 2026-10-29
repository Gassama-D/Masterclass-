'use strict';
// Exporte la liste des inscrits vers un fichier CSV local (à exécuter sur ta machine / ton serveur).
// Usage : npm run export            → inscrits.csv
//         npm run export -- liste.csv
const fs = require('fs');
const { loadConfig } = require('../src/config');
const { createPool } = require('../src/db');

const esc = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise l'injection de formules Excel
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

(async () => {
  const out = process.argv[2] || 'inscrits.csv';
  const pool = createPool(loadConfig());
  try {
    const { rows } = await pool.query('SELECT id, full_name, email, phone_e164, phone_country, confirmation_email_sent, created_at FROM registrations ORDER BY id');
    const head = ['id', 'nom', 'email', 'telephone', 'pays', 'email_confirmation_envoye', 'inscrit_le'];
    const lines = [head.join(';')].concat(rows.map((r) => [r.id, r.full_name, r.email, r.phone_e164, r.phone_country, r.confirmation_email_sent, r.created_at.toISOString()].map(esc).join(';')));
    fs.writeFileSync(out, '\ufeff' + lines.join('\n') + '\n', { mode: 0o600 });
    console.log(`${rows.length} inscription(s) exportée(s) dans ${out}`);
  } finally { await pool.end(); }
})().catch((e) => { console.error(e.message); process.exit(1); });
