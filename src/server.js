'use strict';
const { loadConfig } = require('./config');
const { createPool, migrate } = require('./db');
const { createMailer } = require('./mailer');
const { createApp } = require('./app');

async function main() {
  const config = loadConfig();
  const pool = createPool(config);
  pool.on('error', (e) => console.error('[pg] erreur sur une connexion inactive :', e.message));
  if (config.autoMigrate) await migrate(pool);

  const mailer = createMailer(config);
  const app = createApp({ config, pool, mailer });

  console.log(`E-mail de confirmation : ${mailer ? 'activé (SMTP configuré)' : 'désactivé (SMTP non configuré)'}`);
  console.log(`Groupe WhatsApp : ${config.whatsappGroupInviteUrl ? 'lien configuré' : 'WHATSAPP_GROUP_INVITE_URL non configuré → bouton de contact affiché à la place'}`);

  const server = app.listen(config.port, () => console.log(`Site en ligne sur http://localhost:${config.port}`));
  const stop = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => {
  console.error('Démarrage impossible :', e.message);
  process.exit(1);
});
