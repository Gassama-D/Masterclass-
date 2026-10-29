'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { processRegistration } = require('./registration');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function createApp({ config, pool, mailer }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'font-src': ["'self'"],
          'connect-src': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'self'"],
          'object-src': ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(express.json({ limit: '10kb' }));

  // --- Page d'accueil (gabarit : URL absolue pour Open Graph / canonique) ---
  const template = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  function renderIndex(req) {
    const base = config.siteUrl || `${req.protocol}://${req.get('host')}`;
    const canonical = config.siteUrl ? `<link rel="canonical" href="${config.siteUrl}/">` : '';
    return template
      .replace(/{{SITE_URL}}/g, base)
      .replace('{{CANONICAL}}', canonical)
      .replace(/{{EVENT_ISO}}/g, config.event.startIso)
      .replace(/{{CONTACT_NUMBER}}/g, config.contactWhatsappNumber);
  }
  app.get(['/', '/index.html'], (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(renderIndex(req));
  });
  app.use(express.static(PUBLIC_DIR, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (/\.(woff2|webp|jpg|png|svg)$/.test(p)) res.set('Cache-Control', 'public, max-age=604800'); } }));

  // --- API ---
  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch (_) {
      res.status(503).json({ ok: false });
    }
  });

  const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.rateLimitRegisterMax, // volontairement large : beaucoup d'abonnés mobiles partagent une même IP
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ ok: false, code: 'RATE_LIMIT', message: 'Trop de tentatives depuis ce réseau. Patiente quelques minutes puis réessaie.' }),
  });

  app.post('/api/register', registerLimiter, async (req, res) => {
    const { status, json } = await processRegistration(req.body, { config, pool, mailer });
    res.status(status).json(json);
  });

  app.use('/api', (_req, res) => res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Route introuvable.' }));

  // Gestion d'erreurs (JSON invalide, corps trop gros…)
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status && err.status < 500 ? err.status : 500;
    res.status(status).json({ ok: false, code: 'BAD_REQUEST', message: status === 500 ? 'Erreur interne.' : 'Requête invalide.' });
  });

  return app;
}

module.exports = { createApp };
