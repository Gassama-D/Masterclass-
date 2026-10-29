'use strict';
// Logique d'inscription partagée par le serveur Express (src/app.js) et la fonction Netlify.
const { cleanName, validateName, cleanEmail, validateEmail, normalizeEmail, normalizePhone } = require('./normalize');
const { insertRegistration, DuplicateError } = require('./db');

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('délai dépassé')), ms))]);

async function processRegistration(body, { config, pool, mailer }) {
  body = body && typeof body === 'object' ? body : {};
  const contactUrl = `https://wa.me/${config.contactWhatsappNumber}`;
  const event = { title: config.event.title, startIso: config.event.startIso, organizer: config.event.organizer };

  // Champ-piège invisible pour les robots : toute requête qui le remplit est refusée, rien n'est enregistré.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return { status: 400, json: { ok: false, code: 'REJECTED', message: 'Requête refusée.' } };
  }

  const fullName = cleanName(body.fullName);
  const email = cleanEmail(body.email);
  const errors = {};
  const nameErr = validateName(fullName);
  if (nameErr) errors.fullName = nameErr;
  const emailErr = validateEmail(email);
  if (emailErr) errors.email = emailErr;
  const phone = normalizePhone(body.phone, body.phoneCountry);
  if (phone.error) errors.phone = phone.error;
  if (body.consent !== true) errors.consent = 'Coche cette case pour continuer.';
  if (Object.keys(errors).length) {
    return { status: 422, json: { ok: false, code: 'VALIDATION', message: 'Certaines informations sont à corriger.', errors } };
  }

  try {
    const id = await insertRegistration(pool, {
      fullName,
      email,
      emailNormalized: normalizeEmail(email),
      phoneE164: phone.e164,
      phoneCountry: phone.country,
    });

    // L'inscription est enregistrée à ce stade. L'e-mail est un bonus : son échec n'annule rien.
    let emailSent = false;
    if (mailer) {
      try {
        await withTimeout(mailer.sendConfirmation({ to: email, fullName }), 4500);
        emailSent = true;
        await pool.query('UPDATE registrations SET confirmation_email_sent = TRUE WHERE id = $1', [id]);
      } catch (e) {
        console.error('[mail] confirmation non envoyée :', e.message);
      }
    }
    return { status: 201, json: { ok: true, event, whatsappGroupUrl: config.whatsappGroupInviteUrl || null, contactUrl, emailSent } };
  } catch (e) {
    if (e instanceof DuplicateError) {
      const f = e.fields;
      const message =
        f.length === 2
          ? 'Cette adresse e-mail et ce numéro de téléphone sont déjà associés à une inscription.'
          : f[0] === 'email'
          ? 'Cette adresse e-mail est déjà associée à une inscription.'
          : 'Ce numéro de téléphone est déjà associé à une inscription.';
      return { status: 409, json: { ok: false, code: 'DUPLICATE', fields: f, message, event, whatsappGroupUrl: config.whatsappGroupInviteUrl || null, contactUrl } };
    }
    console.error('[register] erreur serveur :', e.code || '', e.message);
    return { status: 503, json: { ok: false, code: 'SERVER', message: 'Le service est momentanément indisponible. Ton inscription n’a pas été enregistrée : réessaie dans un instant.' } };
  }
}

module.exports = { processRegistration };
