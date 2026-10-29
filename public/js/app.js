(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var COUNTRIES = [
    ['GN', 'Guinée', '224'], ['SN', 'Sénégal', '221'], ['ML', 'Mali', '223'], ['CI', 'Côte d’Ivoire', '225'],
    ['SL', 'Sierra Leone', '232'], ['LR', 'Libéria', '231'], ['GW', 'Guinée-Bissau', '245'], ['MR', 'Mauritanie', '222'],
    ['BF', 'Burkina Faso', '226'], ['NE', 'Niger', '227'], ['TG', 'Togo', '228'], ['BJ', 'Bénin', '229'],
    ['GH', 'Ghana', '233'], ['NG', 'Nigéria', '234'], ['CM', 'Cameroun', '237'], ['GA', 'Gabon', '241'],
    ['CG', 'Congo', '242'], ['CD', 'RD Congo', '243'], ['MA', 'Maroc', '212'], ['DZ', 'Algérie', '213'],
    ['TN', 'Tunisie', '216'], ['FR', 'France', '33'], ['BE', 'Belgique', '32'], ['CH', 'Suisse', '41'],
    ['CA', 'Canada', '1'], ['US', 'États-Unis', '1'], ['GB', 'Royaume-Uni', '44'], ['DE', 'Allemagne', '49'],
    ['ES', 'Espagne', '34'], ['IT', 'Italie', '39'], ['TR', 'Turquie', '90'], ['AE', 'Émirats arabes unis', '971'],
    ['SA', 'Arabie saoudite', '966'], ['CN', 'Chine', '86']
  ];

  var form = $('form'), done = $('done'), statusBox = $('status'), submitBtn = $('submit');
  var state = { submitting: false, lastData: null };
  var EVENT_START = new Date($('countdown').getAttribute('data-start'));

  /* ── Indicatifs ─────────────────────────────────────────── */
  var sel = $('phoneCountry');
  COUNTRIES.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c[0];
    o.textContent = c[1] + ' (+' + c[2] + ')';
    sel.appendChild(o);
  });
  sel.value = 'GN';

  /* ── Validation côté navigateur (le serveur revalide tout) ─ */
  var NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.\-]{1,118}[\p{L}\p{M}.]$/u;
  var EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

  function validate(v) {
    var e = {};
    var name = v.fullName.replace(/\s+/g, ' ').trim();
    if (!name) e.fullName = 'Indique ton prénom et ton nom.';
    else if (!NAME_RE.test(name)) e.fullName = 'Ce nom ne semble pas valide. Utilise uniquement des lettres.';
    else if (name.split(' ').length < 2) e.fullName = 'Indique ton prénom et ton nom.';
    var mail = v.email.trim();
    if (!mail) e.email = 'Indique ton adresse e-mail.';
    else if (!EMAIL_RE.test(mail) || mail.indexOf('..') !== -1) e.email = 'Cette adresse e-mail ne semble pas valide. Vérifie-la.';
    var digits = v.phone.replace(/\D/g, '');
    if (!v.phone.trim()) e.phone = 'Indique ton numéro de téléphone.';
    else if (digits.length < 6) e.phone = 'Ce numéro est trop court. Vérifie-le.';
    if (!v.consent) e.consent = 'Coche cette case pour continuer.';
    return e;
  }

  function readValues() {
    return {
      fullName: $('fullName').value,
      email: $('email').value,
      phone: $('phone').value,
      phoneCountry: sel.value,
      consent: $('consent').checked,
      website: $('website').value
    };
  }

  function clearErrors() {
    ['fullName', 'email', 'phone', 'consent'].forEach(function (k) {
      $('err-' + k).textContent = '';
      var f = form.querySelector('[data-field="' + k + '"]');
      f.classList.remove('has-error');
      var inp = f.querySelector('input,select');
      if (inp) inp.removeAttribute('aria-invalid');
    });
    statusBox.hidden = true;
    statusBox.textContent = '';
  }

  function showErrors(errs) {
    var first = null;
    ['fullName', 'email', 'phone', 'consent'].forEach(function (k) {
      if (!errs[k]) return;
      $('err-' + k).textContent = errs[k];
      var f = form.querySelector('[data-field="' + k + '"]');
      f.classList.add('has-error');
      var inp = f.querySelector('input');
      if (inp) { inp.setAttribute('aria-invalid', 'true'); if (!first) first = inp; }
    });
    if (first) first.focus();
  }

  function setStatus(msg) {
    statusBox.textContent = msg;
    statusBox.hidden = false;
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.classList.toggle('is-loading', on);
    submitBtn.querySelector('.btn__label').textContent = on ? 'ENREGISTREMENT EN COURS…' : 'JE M’INSCRIS GRATUITEMENT';
    submitBtn.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  /* ── Envoi ──────────────────────────────────────────────── */
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (state.submitting) return; // protège contre le double clic / la double touche
    clearErrors();
    var v = readValues();
    var errs = validate(v);
    if (Object.keys(errs).length) { showErrors(errs); return; }

    state.submitting = true;
    setLoading(true);

    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 15000);

    fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(v),
      signal: ctrl.signal
    })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) { return { status: res.status, data: data }; });
      })
      .then(function (r) {
        var d = r.data;
        if (r.status === 201 && d && d.ok === true) return showDone(d, false);
        if (r.status === 409 && d && d.code === 'DUPLICATE') return showDone(d, true);
        if (r.status === 422 && d && d.errors) return showErrors(d.errors);
        setStatus((d && d.message) || 'Ton inscription n’a pas pu être enregistrée. Réessaie dans un instant.');
      })
      .catch(function () {
        setStatus('Connexion impossible : ton inscription n’a pas été enregistrée. Vérifie ta connexion Internet puis appuie de nouveau sur le bouton.');
      })
      .then(function () {
        clearTimeout(timer);
        state.submitting = false;
        setLoading(false);
      });
  });

  ['fullName', 'email', 'phone'].forEach(function (k) {
    $(k).addEventListener('input', function () {
      var f = form.querySelector('[data-field="' + k + '"]');
      if (f.classList.contains('has-error')) { $('err-' + k).textContent = ''; f.classList.remove('has-error'); $(k).removeAttribute('aria-invalid'); }
    });
  });
  $('consent').addEventListener('change', function () { $('err-consent').textContent = ''; });

  /* ── Confirmation ───────────────────────────────────────── */
  function showDone(d, already) {
    state.lastData = d;
    $('done-title').textContent = already ? 'Tu es déjà inscrit(e).' : 'Ton inscription est enregistrée.';
    $('done-msg').textContent = already
      ? d.message + ' Aucune nouvelle inscription n’a été créée : tu as déjà ta place.'
      : 'Ta place pour la masterclass est réservée.';
    $('done-mail').hidden = !(d.emailSent === true);

    var btn = $('wa-btn'), note = $('wa-note');
    if (d.whatsappGroupUrl) {
      btn.href = d.whatsappGroupUrl;
      btn.textContent = 'REJOINDRE LE GROUPE WHATSAPP';
      note.textContent = 'Rejoins le groupe pour recevoir les informations de dernière minute.';
    } else {
      btn.href = d.contactUrl;
      btn.textContent = 'ÉCRIRE À DIABY SALIM SUR WHATSAPP';
      note.textContent = 'Le groupe WhatsApp n’est pas encore ouvert. Écris à DIABY Salim pour être prévenu(e) dès son ouverture.';
    }

    form.hidden = true;
    done.hidden = false;
    done.classList.remove('is-in');
    void done.offsetWidth;
    done.classList.add('is-in');
    done.parentNode.scrollIntoView({ block: 'start' });
    done.focus({ preventScroll: true });
  }

  /* ── Ajouter à l'agenda (.ics) ──────────────────────────── */
  $('ics-btn').addEventListener('click', function () {
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var fmt = function (d) { return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z'; };
    var end = new Date(EVENT_START.getTime() + 90 * 60000);
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DIABY Salim//Masterclass//FR', 'BEGIN:VEVENT',
      'UID:masterclass-5-erreurs-' + fmt(EVENT_START) + '@diaby-salim',
      'DTSTAMP:' + fmt(new Date()), 'DTSTART:' + fmt(EVENT_START), 'DTEND:' + fmt(end),
      'SUMMARY:Masterclass : Les 5 erreurs qui font dévier ton avenir',
      'DESCRIPTION:Masterclass gratuite en ligne animée par DIABY Salim. Rejoins le groupe WhatsApp pour les informations de dernière minute.',
      'LOCATION:En ligne (Google Meet)', 'END:VEVENT', 'END:VCALENDAR'
    ];
    var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'masterclass-5-erreurs.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });

  /* ── Compte à rebours ───────────────────────────────────── */
  var cd = { d: $('cd-d'), h: $('cd-h'), m: $('cd-m'), s: $('cd-s'), label: $('cd-label'), box: $('countdown') };
  function tick() {
    var diff = EVENT_START.getTime() - Date.now();
    if (diff <= 0) {
      var since = -diff;
      cd.box.classList.add('is-over');
      cd.label.textContent = since < 3 * 3600 * 1000 ? 'La masterclass a commencé.' : 'La masterclass est terminée.';
      return false;
    }
    var s = Math.floor(diff / 1000);
    var days = Math.floor(s / 86400); s -= days * 86400;
    var hrs = Math.floor(s / 3600); s -= hrs * 3600;
    var mins = Math.floor(s / 60); s -= mins * 60;
    cd.d.textContent = String(days);
    cd.h.textContent = String(hrs).padStart(2, '0');
    cd.m.textContent = String(mins).padStart(2, '0');
    cd.s.textContent = String(s).padStart(2, '0');
    return true;
  }
  if (tick()) {
    var iv = setInterval(function () { if (!tick()) clearInterval(iv); }, 1000);
  }

  /* Heure locale du visiteur s'il n'est pas à l'heure de Conakry (UTC+0) */
  try {
    if (new Date().getTimezoneOffset() !== 0 || Intl.DateTimeFormat().resolvedOptions().timeZone !== 'Africa/Conakry') {
      if (EVENT_START.getTimezoneOffset() !== 0) {
        var txt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(EVENT_START);
        var lt = $('localtime');
        lt.textContent = 'Chez toi : ' + txt.replace(':', ' h ') + '.';
        lt.hidden = false;
      }
    }
  } catch (e) { /* sans importance */ }

  /* ── Bouton d'inscription flottant (téléphone) ──────────── */
  var sticky = $('sticky');
  if ('IntersectionObserver' in window) {
    var visible = { hero: true, form: false };
    var upd = function () { sticky.hidden = visible.hero || visible.form; };
    new IntersectionObserver(function (en) { visible.hero = en[0].isIntersecting; upd(); }).observe($('hero-cta'));
    new IntersectionObserver(function (en) { visible.form = en[0].isIntersecting; upd(); }, { threshold: 0.15 }).observe($('inscription'));
  }
})();
