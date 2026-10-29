'use strict';
// Prépare le dossier « dist » publié par Netlify : copie public/ et remplit les balises du gabarit index.html.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'public');
const dist = path.join(root, 'dist');

const siteUrl = (process.env.SITE_URL || process.env.URL || '').replace(/\/+$/, '');
if (!siteUrl) {
  console.warn('⚠️  SITE_URL / URL non défini : les aperçus de partage (Open Graph) auront besoin de SITE_URL.');
}
const eventIso = process.env.EVENT_START_ISO || '2026-12-05T20:30:00Z';
const contact = (process.env.CONTACT_WHATSAPP_NUMBER || '224660354794').replace(/\D/g, '');

fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(src, dist, { recursive: true });

const file = path.join(dist, 'index.html');
const html = fs
  .readFileSync(file, 'utf8')
  .replace(/{{SITE_URL}}/g, siteUrl)
  .replace('{{CANONICAL}}', process.env.SITE_URL ? `<link rel="canonical" href="${siteUrl}/">` : '')
  .replace(/{{EVENT_ISO}}/g, eventIso)
  .replace(/{{CONTACT_NUMBER}}/g, contact);
if (/{{/.test(html)) throw new Error('Des balises {{…}} n’ont pas été remplacées.');
fs.writeFileSync(file, html);
console.log(`Site statique prêt dans dist/ (URL : ${siteUrl || 'non définie'})`);
