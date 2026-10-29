'use strict';
const nodemailer = require('nodemailer');

// Retourne null si aucun service d'e-mail n'est correctement configuré :
// dans ce cas le site ne prétend jamais qu'un e-mail a été envoyé.
function createMailer(config) {
  const s = config.smtp;
  if (!s.host || !s.from) return null;
  const transport = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: s.user ? { user: s.user, pass: s.pass } : undefined,
    connectionTimeout: 6000,
    greetingTimeout: 6000,
    socketTimeout: 8000,
  });

  return {
    async sendConfirmation({ to, fullName }) {
      const dateTxt = 'samedi 5 décembre 2026 à 20 h 30 (heure de Conakry)';
      const wa = config.whatsappGroupInviteUrl;
      const text = [
        `Bonjour ${fullName},`,
        '',
        `Ton inscription à la masterclass « ${config.event.title} » est bien enregistrée.`,
        '',
        `Date : ${dateTxt}`,
        'Format : 100 % en ligne, sur Google Meet',
        'Participation : gratuite',
        '',
        wa ? `Rejoins le groupe WhatsApp : ${wa}` : `Une question ? Écris à ${config.event.organizer} sur WhatsApp : https://wa.me/${config.contactWhatsappNumber}`,
        '',
        `À samedi,`,
        config.event.organizer,
      ].join('\n');
      await transport.sendMail({ from: s.from, to, subject: `Inscription confirmée — ${config.event.title}`, text });
    },
  };
}

module.exports = { createMailer };
