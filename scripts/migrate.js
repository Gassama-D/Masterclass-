'use strict';
const { loadConfig } = require('../src/config');
const { createPool, migrate } = require('../src/db');
(async () => {
  const pool = createPool(loadConfig());
  try { await migrate(pool); console.log('Base de données à jour.'); } finally { await pool.end(); }
})().catch((e) => { console.error(e.message); process.exit(1); });
