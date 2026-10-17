# Facebook Preview — CPU ciblé, 17 octobre 2026

## Périmètre et comportement conservé

Facebook uniquement. Aucun changement Pages, SportEasy, calendrier, push, D1
schéma ou secrets. Le Cron reste */10, binding D1 Preview
af28c81b-a6da-4390-aab3-bbaf95391420. Aucun téléchargement/conversion/stockage
de fichier image : Meta fournit full_picture, D1 stocke l'URL CDN validée, le
navigateur affiche la photo avec repli RCC existant si absente/expirée.

La recherche récente était DÉJÀ limitée à un seul /posts limit10, avant filtre
du hashtag entier #ActuRCC. Pagination ignorée. Champs conservés : id, message,
created_time, permalink_url, full_picture, tous utilisés. Aucun champ supplémentaire
updated_time/attachments/media ajouté. Les dix sont ceux retournés par Meta,
pas les dix dernières publications éligibles. On ne garantit pas la détection
d'un nouvel hashtag ajouté à une publication ancienne jamais importée hors fenêtre.

Les anciens IDs importés sont toujours recontrôlés par rotation, au plus dix par
passage. Donc appels Meta = 1 + rechecked, pas forcément un appel total. Leur
absence des dix derniers ou une erreur meta_denied ambiguë ne les supprime pas.
Retrait du marqueur : désactivation existante ; erreur transport/permission :
préservation des données ; aucune suppression destructive ajoutée.

## Changements

1. Une seule lecture bornée de contenu D1 réunit les dix anciens contrôles et
   les IDs de la fenêtre récente (au plus20 lignes). La sélection des dix plus
   anciens reste faite par SQL, l'ordre est conservé. L'ancienne implémentation
   faisait généralement deux lectures (ordre puis contenu). Le compteur d1Reads
   dénombre ces lectures de contenu, PAS les lectures internes SQL ou la facturation.
2. Comparaisons title/body/date/permalink/active/image évaluées une fois, sans
   construction d'un objet et Object.entries par article. Le tri et le plafond
   de15 écritures sont préservés.
3. URL différente seule : UPDATE image_url,checked_at, jamais l'article complet.
   Ce comportement existait ; il est conservé et compte imageOnlyUpdated ajouté.
   Ne pas enlever les signatures/queries CDN, ni figer une ancienne URL expirée.
   Sans identifiant média stable ou coût réseau supplémentaire, on ne prouve pas
   que deux URLs différentes représentent la même photo. Une petite écriture est
   nécessaire pour conserver le renouvellement des photos. Aucun cache risqué.
4. Graph utilise AbortController et désarme le timer15s en finally (y compris
   erreurs et lecture JSON). Pas de délai résiduel après succès. Le gain éventuel
   de durée murale n'est PAS un gain CPU démontré.
5. Une relecture individuelle doit retourner exactement l'ID demandé : sinon
   meta_response contrôlée, aucune importation d'une réponse incohérente.

Les articles identiques gardent seulement l'écriture checked_at indispensable à
la rotation des vérifications, protégée par le verrou D1. Les writes du verrou,
le fencing et sa libération en finally restent inchangés. Pas de nouvel index ou
migration. Pas de batch transactionnel ajouté à ce stade : complexité/coût non
démontré pour seulement quelques articles.

## Tests

`npm test`, `npm run validate`, `git diff --check`, Wrangler dry-run.
Tests existants : nouveaux imports, éditions, marqueur retiré, inaccessible,
doublons/redémarrage, concurrence, HTML, repli manuel/carrousel/lecteur, photos
absentes/expirées/renouvelées, erreur Meta/D1 et libération du verrou.
Ajouts : d1Reads=1, imageOnlyUpdated=1, rotation de dix anciens IDs parmi vingt
avec un récent hors groupe, préservation des autres, timers libérés sur succès,
réseau, redirection et JSON invalide. Réseau simulé, aucun secret réel ni push.

## CPU réel et limites

Référence historique version b2074fcc : 09:10UTC14ms CPU/2489ms murales,
09:20UTC12ms/1407ms, 10 reçus,2 éligibles,0 rechecks,mais créations/updates
différentes. Moyenne13ms ; pas une preuve que le code actuel gagne un nombre précis
de ms. Les nouveaux essais doivent comparer mêmes volumes ET modes de modification
(image seule, inchangé, nouveau). Les tests locaux ne sont pas des mesures Workers.
La nouvelle collecte doit distinguer created/updated/imageOnlyUpdated/unchanged,
changedFields, pages/rechecked, d1Reads, CPU et durée réels. Ne pas déclencher de
sync manuelle pour fabriquer une mesure ou inventer une exécution non reçue.

Workers Free :10ms CPU par Cron ; attente Meta et D1 non CPU. Un dépassement isolé
ne prouve pas une panne, mais des valeurs régulières supérieures ne permettent pas
de garantir une marge. Plan réel non identifié (limits null ne prouve pas Free).
Aucun Paid/R2 activé. Référence :
https://developers.cloudflare.com/workers/platform/limits/

## Déploiement autorisé

Uniquement `npx --offline wrangler deploy --config workers/facebook-sync.toml --var RCC_FACEBOOK_SYNC_ENABLED:true`.
Préflight a confirmé D1 Preview, sync=true, secret présent sans lecture de valeur,
ancienne version b2074fcc. Aucun flag de Production ni secret modifié.

Conclusion tant que les nouvelles traces ne sont pas reçues : INSUFFISAMMENT
VÉRIFIÉ. Réduction des lectures démontrée par tests, pas de gain CPU chiffré
déclaré avant collecte de Crons naturels comparables.
