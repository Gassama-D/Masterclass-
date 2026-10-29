'use strict';
const { parsePhoneNumberFromString } = require('libphonenumber-js/max');

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.\-]{1,118}[\p{L}\p{M}.]$/u;
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function cleanName(raw) {
  return String(raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

function validateName(name) {
  if (!name) return 'Indique ton prénom et ton nom.';
  if (name.length < 3 || name.length > 120 || !NAME_RE.test(name)) return 'Ce nom ne semble pas valide. Utilise uniquement des lettres.';
  if (name.split(' ').filter((p) => p.replace(/[^\p{L}]/gu, '').length >= 1).length < 2) return 'Indique ton prénom et ton nom.';
  return null;
}

function cleanEmail(raw) {
  return String(raw ?? '').normalize('NFKC').trim();
}

function validateEmail(email) {
  if (!email) return 'Indique ton adresse e-mail.';
  if (email.length > 254 || !EMAIL_RE.test(email) || email.includes('..')) return 'Cette adresse e-mail ne semble pas valide. Vérifie-la.';
  return null;
}

// Forme canonique servant à détecter les doublons.
// - minuscules ; - pour Gmail : points et « +alias » ignorés (même boîte de réception).
function normalizeEmail(email) {
  const lower = email.toLowerCase();
  const at = lower.lastIndexOf('@');
  let local = lower.slice(0, at);
  let domain = lower.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') {
    local = local.split('+')[0].replace(/\./g, '');
  }
  return `${local}@${domain}`;
}

function normalizePhone(raw, countryIso2) {
  const input = String(raw ?? '').trim();
  if (!input) return { error: 'Indique ton numéro de téléphone.' };
  const country = /^[A-Z]{2}$/.test(String(countryIso2 || '')) ? countryIso2 : undefined;
  const cleaned = input.startsWith('00') ? '+' + input.slice(2) : input;
  let parsed;
  try {
    parsed = parsePhoneNumberFromString(cleaned, country);
  } catch (_) {
    parsed = undefined;
  }
  if (!parsed || !parsed.isValid()) {
    return { error: 'Ce numéro n’est pas valide pour le pays choisi. Vérifie l’indicatif et le numéro.' };
  }
  return { e164: parsed.number, country: parsed.country || null };
}

module.exports = { cleanName, validateName, cleanEmail, validateEmail, normalizeEmail, normalizePhone };
