# RCC CO Redesign

Copie independante du site du Racing Club Cubzaguais, preparee pour tester la
direction visuelle du laboratoire CO sans modifier le site de production.

## Perimetre copie

La copie contient les 142 fichiers suivis du projet d'origine :

- 24 pages HTML, dont les pages publiques, les redirections et les outils admin ;
- les feuilles de style, scripts publics et scripts du Studio RCC ;
- les 18 fichiers JSON et les medias RCC ;
- Pages CMS et les 12 Pages Functions Cloudflare ;
- la PWA, le service worker, le manifest, le sitemap, robots.txt et les headers ;
- les workflows GitHub, la configuration Cloudflare et la documentation.

Le theme CO est ajoute par `co-theme.css` et `co-theme.js`. Le CSS d'origine
reste charge en premier, ce qui conserve les composants et comportements
existants. Les outils d'administration ne sont pas redesignés : leur logique et
leur interface restent celles de la version actuelle.

## Lancement local

Depuis PowerShell, si Python est installe :

```powershell
cd "C:\Users\Clement\Documents\Codex\2026-06-30\cr\rcc-co-redesign"
python -m http.server 4195 --bind 127.0.0.1
```

Si `python`/`node` ne sont pas disponibles sur la machine, un petit serveur
statique en PowerShell pur (sans dependance) est fourni :

```powershell
cd "C:\Users\Clement\Documents\Codex\2026-06-30\cr\rcc-co-redesign"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-server.ps1
```

Ouvrir ensuite `http://127.0.0.1:4195/`.

Il faut servir le dossier avec HTTP : l'ouverture directe de `index.html`
(`file://`) ne permet pas au navigateur de charger les fichiers JSON.

## Direction visuelle

Inspiree du site de reference `castres-olympique.com` : canevas clair et
corporate plutot que sombre, typographie condensee en majuscules, cartes
blanches nettes, blocs marine/bordeaux reserves aux zones d'accent.

- header fin, transparent sur le hero puis bleu marine au defilement ;
- menu plein ecran (marine fonce) construit a partir de la navigation RCC
  existante ;
- hero editorial utilisant automatiquement les trois actualites publiees les
  plus recentes, avec rotation de six secondes et controles accessibles ;
- pages interieures : fond blanc/gris tres clair, cartes et grilles (actus,
  boutique, galerie, partenaires, roster...) en cartes blanches a bordure
  fine avec ombre douce, titres bleu marine, kickers bordeaux ;
- quelques blocs volontairement sombres (bleu marine + diagonale bordeaux)
  conserves comme accents de marque : bandeau "prochain match"/stats,
  bandeau senior, bandeau "nous rejoindre", pied de page ;
- palette RCC (bordeaux, blanc, bleu marine) conservee, sans reprendre les
  couleurs propres de Castres Olympique ;
- animations limitees a `transform` et `opacity`, desactivees avec
  `prefers-reduced-motion`.

Les donnees restent lues depuis les fichiers JSON d'origine. Aucun contenu
fictif, chemin absolu local, framework ou dependance externe n'a ete ajoute.

## Validation locale

```powershell
cd "C:\Users\Clement\Documents\Codex\2026-06-30\cr\rcc-co-redesign"
npm run validate
npm test
```

Verifier visuellement au minimum l'accueil, les actualites, le calendrier, les
equipes, les pages Club, la galerie, les partenaires, la boutique, le Studio RCC
et Pages CMS aux largeurs 390, 768, 1366 et 1920 px.

## Deploiement sur une URL de test

Ne pas rattacher ce dossier au projet Cloudflare Pages de production. Creer un
nouveau projet Pages nomme `rcc-co-redesign`, avec :

- commande de build : `npm run build` ;
- dossier de sortie : `.` ;
- domaine de test Pages distinct ;
- protection Cloudflare Access recommandee pendant la validation.

Avant le premier deploiement, creer des ressources de test distinctes. Le fichier
`wrangler.toml` copie encore l'identifiant KV de production afin de conserver la
configuration d'origine : il faut remplacer cet identifiant par celui d'un KV de
test avant tout deploiement. Ne jamais tester les notifications avec le KV ou les
abonnements de production.

Variables et bindings a configurer selon les fonctions testees :

- administration obligatoire : `PAGES_CMS_PASSWORD` et
  `ADMIN_SESSION_SECRET` (au moins 32 caracteres) ;
- notifications : binding KV `RCC_PUSH_SUBSCRIPTIONS`, `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_ADMIN_TOKEN` ;
- publication Studio : `RCC_GITHUB_TOKEN`, `RCC_GITHUB_REPOSITORY` et
  `RCC_GITHUB_BRANCH` vers un depot ou une branche de test ;
- vote logo : binding KV `RCC_LOGO_VOTES` et `RCC_LOGO_VOTE_SALT`.

Les anciens noms `CMS_PASSWORD`, `ADMIN_PASSWORD` et `STUDIO_PASSWORD` restent
des fallbacks de compatibilite, mais `PAGES_CMS_PASSWORD` est le nom recommande.
Ne copier aucune valeur secrete dans le depot.

Commande de deploiement direct apres configuration et validation :

```powershell
npx wrangler pages deploy . --project-name rcc-co-redesign
```

Cette commande n'est volontairement pas executee dans ce chantier.

## Remplacement futur de la version actuelle

1. Valider la copie sur son URL de test, y compris CMS, Studio, PWA, formulaires
   et notifications avec des ressources de test.
2. Faire une sauvegarde et creer une branche dediee dans le depot officiel.
3. Reporter uniquement `co-theme.css`, `co-theme.js`, les inclusions dans les
   pages publiques, le hero de `index.html` et la nouvelle version de cache PWA.
4. Executer les validations et une recette complete sur une preview Cloudflare.
5. Fusionner la branche puis rattacher le domaine officiel uniquement apres
   accord explicite.

Aucun remplacement, commit, push ou deploiement n'est realise automatiquement.
