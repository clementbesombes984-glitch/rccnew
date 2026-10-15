# Classements RCC — nouvelle version uniquement

La page `classements.html` présente les trois tableaux officiels sur une page.
Le lien est ajouté sous Calendrier par le script de navigation commun.
Les données sont lues sans authentification sur l'API GraphQL FFR, avec
l'autorisation confirmée par le responsable du projet. Conserver la preuve
de cette autorisation et respecter les conditions convenues avec la FFR.

Les compétitions sont fixées à 2026-2027 : Seniors 23947, Cadets 24012,
Cadettes 24051. La structure RCC est 1472. La phase et la saison sont
vérifiées ; la poule doit être la seule contenant la structure RCC.
Les classements restent officiels : aucun recalcul des points, aucune
modification des positions ex aequo ou suppression des clubs exempts.

## Configuration AVANT publication (aucune ressource créée automatiquement)

1. Créer un namespace KV dédié à rccnew, nommé par exemple `rccnew-standings`.
2. Dans le projet Pages **rccnew uniquement**, ajouter le binding KV
   `RCC_STANDINGS` vers ce namespace. Ne pas réutiliser le KV des notifications.
3. Dans `workers/standings-sync.toml`, décommenter le binding et renseigner
   le même identifiant KV. Le Worker doit partager ce namespace avec Pages.
4. Après accord de publication, déployer le Worker avec
   `npx wrangler deploy --config workers/standings-sync.toml`.
5. Publier la nouvelle version Pages uniquement sur `rccnew.pages.dev`,
   après vérification de la branche et de la configuration Cloudflare.

Le Cron s'exécute le lundi à 07:00 UTC (08:00 hiver / 09:00 été à Paris).
Le premier accès à `/api/standings` initialise le cache. Un accès à un cache
de plus de sept jours déclenche également une récupération en arrière-plan.
Chaque catégorie garde sa dernière réponse valide indépendamment des autres.
Le cache n'expire jamais ; le site indique les réponses anciennes ou en échec.
Sans binding, les trois sections et leurs liens FFR s'affichent avec un message
d'indisponibilité : aucune donnée fictive n'est utilisée.

Une simple prévisualisation statique ne peut pas exécuter l'API. Pour tester
l'intégration, utiliser Pages Functions et un KV local/de prévisualisation.
Les assets de la page sont ajoutés au service worker ; les réponses API
ne sont pas ajoutées au cache PWA. Le stockage des dernières données valides
est côté serveur, pas dans le navigateur.

## Contrôles

`node scripts/test-standings.js`

`npm run validate`

`npm test`

Contrôler en prévisualisation les liens d'ancrage, le header et le défilement
horizontal sur mobile. Après configuration distante, vérifier une exécution
Cron et les dates par catégorie. Ces vérifications distantes ne peuvent pas
être remplacées par les tests locaux et nécessitent un déploiement autorisé.
