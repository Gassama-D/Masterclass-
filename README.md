# Site d'inscription — Masterclass « Les 5 erreurs qui font dévier ton avenir »

Organisée par **DIABY Salim** · samedi 5 décembre 2026, 20 h 30 (Conakry) · 100 % en ligne (Google Meet) · gratuite.

Site complet : page d'accueil, formulaire, **vrai backend** (Node.js + Express) et **vraie base PostgreSQL**.
Les inscriptions ne sont jamais gardées dans le navigateur : si elles ne sont pas enregistrées en base, le site n'affiche pas de succès.

## Ce que fait le site

- Page premium responsive avec tes photos, compte à rebours (calculé sur 20 h 30 à Conakry, UTC+0) et aperçu de partage WhatsApp/Facebook (Open Graph).
- Formulaire : nom et prénom, e-mail, téléphone avec indicatif international, case de consentement. Validation côté navigateur **et** côté serveur.
- **Anti-doublons** : e-mail normalisé (majuscules, espaces, alias Gmail à points ou `+étiquette`), téléphone normalisé au format international (`+224660354794`, quelle que soit la façon de l'écrire), contraintes `UNIQUE` en base (valables même pour deux envois simultanés). Deux personnes qui portent le même nom ne sont pas bloquées.
- Confirmation à l'écran + bouton **REJOINDRE LE GROUPE WHATSAPP** + bouton « Ajouter à mon agenda ».
- E-mail de confirmation **optionnel** : envoyé seulement si SMTP est configuré, et le site ne le mentionne que s'il est réellement parti.
- Sécurité : requêtes SQL paramétrées, en-têtes de sécurité (Helmet, CSP stricte), limitation de débit, champ-piège anti-robots, aucune route publique qui liste les inscrits, aucune clé secrète dans le code du navigateur.

## Contenu du dossier

```
src/            serveur (app.js, db.js, normalize.js, mailer.js, config.js, server.js)
db/migrations/  schéma SQL (001_init.sql)
public/         site (index.html, css, js, images, polices)
scripts/        migrate.js (migrations), export-csv.js (liste des inscrits)
netlify/        fonction d'inscription pour Netlify (+ netlify.toml, NETLIFY.md)
test/           api.test.js (20 tests serveur), netlify.test.js (4 tests fonction), e2e.py (21 tests navigateur)
.env.example    modèle de configuration
```

> **Hébergement sur Netlify ?** Suis `NETLIFY.md` (le projet contient une version prête pour Netlify : fonction serverless + base PostgreSQL externe).

## 1. Installation en local

Prérequis : **Node.js 20 ou plus** et une base **PostgreSQL**.

```bash
npm install
cp .env.example .env        # puis édite .env (DATABASE_URL au minimum)
npm start                   # crée la table au premier démarrage (AUTO_MIGRATE=true)
```

Ouvre http://localhost:3000. Pour appliquer les migrations à la main : `npm run migrate`.

## 2. Configurer le groupe WhatsApp (important)

Ton numéro `+224 660 35 47 94` n'est **pas** un lien de groupe. Le site ne fabrique jamais de faux lien.

1. Dans WhatsApp, crée le groupe de la masterclass.
2. Ouvre le groupe → **Infos du groupe** → **Inviter via un lien** → copie le lien (`https://chat.whatsapp.com/…`).
3. Colle-le dans `.env` : `WHATSAPP_GROUP_INVITE_URL=https://chat.whatsapp.com/XXXXXXXX`
4. Redémarre le site (ou change la variable d'environnement chez ton hébergeur).

Tant que cette variable est vide, le bouton devient « ÉCRIRE À DIABY SALIM SUR WHATSAPP » (lien `wa.me` vers ton numéro) avec une mention honnête que le groupe n'est pas encore ouvert. Le lien du groupe n'est renvoyé qu'après une inscription réussie (ou à une personne déjà inscrite qui revient).

Astuce WhatsApp : pense à activer l'approbation des nouveaux membres si tu veux contrôler qui entre.

## 3. E-mail de confirmation (optionnel)

Il faut un compte chez un service d'envoi SMTP (celui de ton hébergeur e-mail, ou un service d'envoi transactionnel). Renseigne `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Sans cela, rien n'est envoyé et le site ne dit rien d'un e-mail. Pour de bons taux de réception, utilise une adresse d'expédition sur ton propre domaine.

## 4. Mise en production (étapes)

Il te faut deux services : **un hébergeur Node.js** et **une base PostgreSQL** (souvent proposée par le même hébergeur, ou par un fournisseur de PostgreSQL géré). Vérifie les conditions et les limites actuelles du forfait choisi. Important : choisis une base avec **stockage permanent** et, si possible, des sauvegardes automatiques.

1. Crée la base PostgreSQL et copie sa chaîne de connexion (`DATABASE_URL`). Si le fournisseur exige le chiffrement, mets `DATABASE_SSL=true`.
2. Dépose le dossier du projet sur un dépôt Git (GitHub…), puis crée un « Web Service » Node.js relié à ce dépôt.
   - Commande d'installation : `npm install --omit=dev`
   - Commande de démarrage : `npm start`
3. Dans les variables d'environnement de l'hébergeur, renseigne : `DATABASE_URL`, `DATABASE_SSL` si besoin, `WHATSAPP_GROUP_INVITE_URL`, `SITE_URL` (l'adresse finale du site, sans `/` à la fin), et si tu veux les e-mails les variables `SMTP_*`. `PORT` est en général fourni par l'hébergeur.
4. Au premier démarrage, la table est créée automatiquement.
5. Branche ton nom de domaine, active le HTTPS (automatique chez la plupart des hébergeurs) et renseigne `SITE_URL` : l'URL canonique et l'image d'aperçu en dépendent.
6. **Teste en conditions réelles** : fais une inscription avec un numéro et un e-mail à toi, vérifie le bouton WhatsApp, puis réessaie les mêmes informations (tu dois voir « déjà inscrit »). Partage le lien dans WhatsApp pour vérifier l'aperçu.

Alternative VPS : `npm install --omit=dev`, un gestionnaire de processus (pm2 ou systemd), un proxy inverse (Nginx ou Caddy) devant le port de l'application, et un certificat HTTPS (Let's Encrypt).

## 5. Récupérer la liste des inscrits

Il n'existe volontairement **aucune page publique ni API** qui liste les inscrits. Pour les exporter, exécute sur ton serveur (ou ta machine, avec la bonne `DATABASE_URL`) :

```bash
npm run export            # crée inscrits.csv (séparateur « ; », lisible dans Excel)
```

Tu peux aussi utiliser l'interface de ton fournisseur PostgreSQL. Garde ce fichier privé.

## 6. Modifier la date, l'heure ou les textes

- Date/heure : variable `EVENT_START_ISO` (en UTC, Conakry = UTC+0) **et** les libellés « Samedi 5 décembre 2026 / 20 h 30 » dans `public/index.html`, `public/js/app.js` (fichier agenda) et `src/mailer.js`.
- Textes et design : `public/index.html`, `public/css/style.css`.
- Photos : `public/img/` (images optimisées en WebP ; l'aperçu de partage est `og.jpg`, 1200×630).

## 7. Tests

```bash
# Tests serveur (nécessitent une base de TEST, jamais celle de production)
TEST_DATABASE_URL=postgresql://utilisateur:motdepasse@localhost:5432/masterclass_test npm test

# Tests navigateur (Playwright, Python) : lancer le site sur une base VIDE avec un lien WhatsApp de test
WHATSAPP_GROUP_INVITE_URL=https://chat.whatsapp.com/TESTLINKABCDEFGHIJKL PORT=3101 npm start
python3 test/e2e.py http://localhost:3101/
```

Les 20 tests serveur couvrent : inscription valide, e-mail ou numéro déjà utilisés (et leurs variantes d'écriture), alias Gmail, homonymes, champs incomplets, 25 envois simultanés, robot, injection SQL, limitation de débit, lien WhatsApp valide et invalide, e-mail avec SMTP réel de test puis en panne, base injoignable (aucun faux succès), et conservation des données après redémarrage.

Checklist manuelle avant lancement :
- [ ] Inscription valide sur téléphone, puis bouton WhatsApp ouvre bien le **vrai** groupe
- [ ] Même e-mail ou même numéro → message « déjà associée »
- [ ] Aperçu du lien collé dans WhatsApp (titre exact + image)
- [ ] Compte à rebours = 20 h 30 à Conakry
- [ ] Export CSV fonctionne et la liste correspond

## 8. Données personnelles

Tu collectes des noms, e-mails et numéros : ne les publie pas, ne les transmets pas à des tiers sans consentement, et limite l'accès à la base. Selon les pays des participants, des règles de protection des données peuvent s'appliquer : fais relire la mention de consentement par une personne compétente si tu envisages d'utiliser ces contacts au-delà de la masterclass.

## 9. Mention sur le livre

Sous le formulaire, une phrase indique qu'à la fin de la masterclass tu présenteras ton livre « Pourquoi la plupart des jeunes échouent », disponible à la vente, sans achat obligatoire. Elle garantit que la masterclass est présentée honnêtement comme gratuite. Tu peux la modifier ou la retirer dans `public/index.html` (classe `fine`).
