# Mettre le site en ligne sur Netlify (étape par étape)

Netlify héberge le site (pages) et la fonction d'inscription (`netlify/functions/register.js`). Il ne fournit pas la base de données dans ce projet : il te faut **une base PostgreSQL gérée** à part.

> ⚠️ Le « glisser-déposer » de Netlify (Netlify Drop) ne convient **pas** : il ne publie que des fichiers statiques, sans fonctions, donc sans inscriptions. Utilise le déploiement depuis GitHub (ci-dessous) ou Netlify CLI.

## Étape 1 — Créer la base PostgreSQL

1. Crée un compte chez un fournisseur de PostgreSQL géré (par exemple Neon ou Supabase) et crée un projet/une base. Vérifie ses conditions et limites actuelles.
2. Copie la **chaîne de connexion** (elle commence par `postgresql://…`). Si le fournisseur propose une version « pooled / pooler », prends-la : elle convient mieux aux fonctions serverless.
3. Tu n'as **rien à créer à la main** : la table est créée automatiquement au premier appel de la fonction.

## Étape 2 — Mettre le projet sur GitHub

1. Crée un compte GitHub et un **dépôt privé**.
2. Envoie-y le contenu du dossier du projet (sans `node_modules` ni `.env` : le `.gitignore` s'en occupe).

## Étape 3 — Créer le site sur Netlify

1. Sur Netlify : **Add new project → Import an existing project → GitHub**, puis choisis ton dépôt.
2. Les réglages (commande de build, dossier `dist`, fonctions) sont déjà dans `netlify.toml` : ne change rien.
3. Avant de lancer, ouvre **Environment variables** et ajoute :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | la chaîne de connexion de l'étape 1 |
| `DATABASE_SSL` | `true` |
| `WHATSAPP_GROUP_INVITE_URL` | `https://chat.whatsapp.com/FEgeP2iy7Ac4xWQy7mNhBf` |

(Optionnel : `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` pour l'e-mail de confirmation.)

4. Clique sur **Deploy**.

## Étape 4 — Ton lien

Quand le déploiement est terminé, Netlify affiche l'adresse du site, de la forme **`https://nom-du-site.netlify.app`**. C'est ton lien direct.

- Pour le personnaliser : **Site configuration → Change site name** (par exemple `masterclass-diaby`, si le nom est libre).
- Ensuite, ajoute la variable `SITE_URL` = `https://masterclass-diaby.netlify.app` (ton adresse finale, sans `/` à la fin) puis relance un déploiement : l'URL canonique et l'aperçu de partage en dépendent.

## Étape 5 — Vérifier avant de communiquer

- [ ] Ouvre le lien sur ton téléphone.
- [ ] Fais une inscription avec tes vraies informations : tu dois voir la confirmation, puis le bouton WhatsApp doit ouvrir le **vrai** groupe.
- [ ] Refais l'inscription avec les mêmes informations : « déjà associée à une inscription ».
- [ ] Vérifie que les inscriptions apparaissent bien dans ta base (interface de ton fournisseur, ou `npm run export`).
- [ ] Colle le lien dans WhatsApp : l'aperçu doit afficher le titre « Les 5 erreurs qui font dévier ton avenir » et ta photo.

## Limites de la version Netlify (à connaître)

- **Pas de limitation de débit** intégrée à la fonction : les doublons restent impossibles (contraintes de la base), mais des envois massifs ne sont pas freinés par le code. Active les protections de ton fournisseur si besoin.
- Une fonction « endormie » peut mettre quelques secondes à répondre au premier appel. Si la base ne répond pas, le site affiche une erreur claire et **n'annonce jamais un faux succès**.
- Pour changer la date ou les textes, modifie les fichiers puis pousse le changement sur GitHub : Netlify redéploie automatiquement.
