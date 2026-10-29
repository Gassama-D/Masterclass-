
'use strict';
require('dotenv').config();

const bool = (v, d = false) =>
  v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v));

function loadConfig(env = process.env) {
  const whatsapp = (env.WHATSAPP_GROUP_INVITE_URL || '').trim();

  return {
    port: parseInt(env.PORT || '3000', 10),
    nodeEnv: env.NODE_ENV || 'development',
    databaseUrl: env.DATABASE_URL || env.NETLIFY_DB_URL || '',
    databaseSsl: bool(env.DATABASE_SSL, false),
    autoMigrate: bool(env.AUTO_MIGRATE, true),
    siteUrl: (env.SITE_URL || '').replace(/\/+$/, ''),
    event: {
      title: 'Les 5 erreurs qui font dévier ton avenir',
      startIso: env.EVENT_START_ISO || '2026-12-05T20:30:00Z',
      organizer: 'DIABY Salim',
    },
    contactWhatsappNumber: (env.CONTACT_WHATSAPP_NUMBER || '224660354794').replace(/\D/g, ''),
    whatsappGroupInviteUrl: /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{10,}/.test(whatsapp)
      ? whatsapp
      : '',
    smtp: {
      host: env.SMTP_HOST || '',
      port: parseInt(env.SMTP_PORT || '587', 10),
      secure: bool(env.SMTP_SECURE, false),
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
      from: env.SMTP_FROM || '',
    },
    rateLimitRegisterMax: parseInt(env.RATE_LIMIT_REGISTER_MAX || '30', 10),
  };
}

module.exports = { loadConfig };

