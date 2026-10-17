# Images du carrousel — Preview du 17 octobre 2026

Preview : https://3f71dc55.rccnew.pages.dev
Alias : https://codex-carousel-images.rccnew.pages.dev
Production inchangée : Pages048d0271-774d-43f1-8866-49b242cb6e99.

## Cause et correction

Le hero chargeait uniquement news.json et ne trouvait aucun élément
data-co-hero-image dans le HTML cinématique actuel. Le texte et les images
génériques pilotées séparément par script.js n'étaient donc pas associés.

- co-theme.js lit les actualités manuelles et /api/facebook-news, fusionne et
  trie les trois dernières. L'API existante transmet déjà image depuis image_url
  dans D1 : aucune modification d'API ni appel Meta nécessaire.
- Le carrousel prend en charge les couches data-cinematic-slide existantes.
  script.js n'effectue plus sa rotation indépendante quand ce pilotage est actif.
- Chaque article utilise sa propre image ; préchargement no-referrer pour les
  photos, repli seulement si absent/invalide/inaccessible, protection contre
  les réponses d'images retardées d'une ancienne sélection.
- URL Facebook validée (CDN HTTPS, pas de credentials/paramètres token), signature
  complète conservée. API lue sans cache et rafraîchie au retour d'onglet/bfcache.
  Une nouvelle URL signée conserve sa clé de cache distincte ; pas de suppression
  des signatures, de proxy ni téléchargement d'image côté serveur.
- Même priorité pour les images manuelles. Dates ISO Facebook affichées.
- index.html versionne uniquement les deux scripts corrigés pour les caches JS.
  Aucun CSS, cadrage object-fit:cover, gradient ou design modifié.

## Périmètre de publication

Paquet isolé construit depuis le dernier paquet officiel SportEasy ; seuls
co-theme.js, script.js et index.html sont remplacés. Pas de déploiement depuis
le worktree sale : prototypes Google et modifications _headers exclus.
La Preview utilise le binding Facebook Preview existant. Ni D1 ni Worker
Facebook/Meta, SportEasy, push, DNS ou Production ne sont modifiés.

## Tests

npm test, npm run validate, node --check co-theme.js et git diff --check.
scripts/test-carousel-images.cjs teste le vrai contenu API Preview sur desktop
1440x1000 et mobile390x844 : affiche du CHAMPIONNAT R3 chargée,
URL exactement égale au champ image API, navigation et maintien après un cycle
de l'ancienne rotation, pas d'erreur JS, pas d'appel Graph ni POST push.

Fixtures navigateur distinctes : image manuelle propre, absence d'image,
URL inaccessible et renouvellement de signature sur pageshow.
Ces simulations ne constituent pas une observation d'expiration réelle Meta.
Captures locales : dist/carousel-images-desktop.png et mobile.png.

Le repli reste une photo RCC générique, utilisée seulement après absence/échec.
Une panne du flux Facebook ne masque pas les actualités manuelles.
La publication Production exige une autorisation supplémentaire.
