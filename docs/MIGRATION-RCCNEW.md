# Préparation migration rcc2026 vers rccnew (validation pages.dev uniquement)

## Périmètre et conditions impératives

Le domaine officiel doit garder exactement son origine HTTPS, le manifeste
`id`, `start_url`, `scope` et le service worker `/sw.js` de portée `/`.
Le nouveau code ne désinscrit pas automatiquement les abonnements lors d'une
erreur réseau ou d'origine, ni lors de l'activation du service worker.
Les installations sur `rccnew.pages.dev` restent des applications d'une autre
origine : elles ne peuvent pas récupérer les abonnements du domaine officiel.
Le comportement sur iOS/Android et une PWA officielle déjà installée doit être
testé après la bascule ; des tests locaux ne constituent pas une validation appareil.

## Sauvegarde et retour arrière avant publication

Référence Git avant migration : `d233eab4feea0d194fbda56c02ba48a87ec790b2`.
Déploiement Pages correspondant : `f101e228-40cb-46d3-a84e-a6ca4065ef89`.
Une sauvegarde Git complète vérifiée (`before-migration.bundle`) et un export
Wrangler de la configuration distante ont été créés hors du répertoire publié,
dans le dossier temporaire local `rccnew-migration-03d041b950f345c68a6ca1e5fe305000`.
Conserver ces fichiers dans un stockage privé durable avant la bascule officielle.
L'export ne contient pas les valeurs des secrets masqués et ne les remplace pas.

En cas d'incident sur la validation pages.dev : dans Cloudflare Pages, sélectionner
uniquement `rccnew`, puis restaurer le déploiement ci-dessus. Vérifier ses bindings
après restauration : le code et la configuration du projet ne doivent pas être
supposés restaurés ensemble. Pour revenir durablement dans Git, créer un commit
de réversion du commit de migration, après examen des changements ultérieurs ;
ne pas utiliser de push forcé. Laisser les envois du nouveau projet désactivés.
Ne supprimer aucun namespace KV, aucun abonnement ni aucune clé VAPID. Ne modifier
ni le Worker Classements, ni `rcc2026`, ni les domaines/DNS pour ce retour arrière.

## Configuration préparée

Pages Production `rccnew` :
- `RCC_PUSH_SUBSCRIPTIONS` : namespace EXISTANT `rcc2026-push-subscriptions`,
  ID `5e412dc7eadc4548ba85ff30c789fdbc` (ne jamais recréer).
- `RCC_STANDINGS` : namespace Classements inchangé.
- `RCC_SITE_ORIGIN=https://rccubzaguais.fr` : conserve la sélection par origine.
- `RCC_GITHUB_REPOSITORY=clementbesombes984-glitch/rccnew`, branche `main`.
- `RCC_PUSH_ENABLED=false` : aucune émission avant bascule.
- `RCC_PUSH_DELIVERY_MODE=workflow` : un seul canal d'émission.

Preview n'a PAS accès au KV des abonnements. Aucun endpoint d'abonné, secret
ou clé privée ne doit être commité ni affiché dans les logs.

## Secrets à transférer par l'administrateur (valeurs existantes uniquement)

Sur Pages `rccnew` : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
`PUSH_ADMIN_TOKEN`, `PAGES_CMS_PASSWORD`, `ADMIN_SESSION_SECRET`,
`RCC_GITHUB_TOKEN`. Conserver les clés VAPID et leur sujet existants :
NE PAS générer de paire et NE PAS utiliser un générateur en ligne.
Cloudflare ne permet pas de relire la valeur des secrets masqués ; il faut
les reprendre depuis leur sauvegarde sécurisée ou le gestionnaire de secrets.
Le token GitHub doit avoir accès à `rccnew` (Contents read/write).
Vérification en lecture seule effectuée pendant cette préparation : la liste
des secrets Production `rccnew` renvoyée par Wrangler était vide. Aucun secret
n'a été créé ou remplacé par cette préparation.
Le Studio refuse explicitement toute configuration pointant vers `rcc2026`.

Exemple de commande interactive à exécuter par l'administrateur pour CHAQUE
secret connu (ne jamais placer la valeur dans la ligne de commande) :

`npx wrangler pages secret put VAPID_PRIVATE_KEY --project-name rccnew`

GitHub `rccnew` : secret `RCC_PUSH_ADMIN_TOKEN` identique au `PUSH_ADMIN_TOKEN`
Pages ; variable `RCC_SITE_URL=https://rccubzaguais.fr` ; laisser la variable
`RCC_PUSH_ENABLED` absente ou `false` avant bascule. Les valeurs de secrets
ne sont pas copiées automatiquement par les corrections du dépôt.

## Un seul émetteur

Le Studio écrit l'article avec `notification=true` et laisse le workflow
envoyer après le commit. Les notifications seules (dont compositions) passent
par une file GitHub `data/push-queue.json`, jamais par un second appel direct.
Une entrée de file identique est reconnue par son empreinte pour éviter qu'un
double clic ne crée deux demandes identiques. Le workflow ne traite que les
nouvelles entrées. Les publications de newsletter et compositions conservent
leurs formats et leur stockage dans `rccnew`.
Le polling local ne produit pas une deuxième alerte si un abonnement Web Push
existe. Le serveur refuse les anciennes requêtes sans le marqueur workflow.

À la bascule : désactiver le workflow notifications de `rcc2026` AVANT d'activer
`RCC_PUSH_ENABLED=true` sur GitHub rccnew et Pages rccnew. Aucun automatisme
de cette préparation ne modifie l'ancien dépôt ou son workflow.
Ne pas relancer un ancien run ni republier tout l'historique pour tester.
Ne jamais configurer `RCC_SITE_URL` sur une prévisualisation.

Limite : aucun système Web Push ne garantit la livraison exactement une fois.
Un run interrompu après livraison partielle peut redélivrer à la relance ;
la sérialisation du workflow évite les exécutions concurrentes mais ne constitue
pas un registre transactionnel par destinataire. Ne pas promettre cette garantie.

## Cache et conservation

Les API et pages admin sont network-only/no-store. Le nouveau cache PWA
supprime uniquement les anciens caches `rcc-pwa-*`, sans toucher aux données
localStorage, aux abonnements PushManager ou aux caches d'autres applications.
Les JSON publics gardent un cache de secours hors ligne avec clé sans query
timestamp, mais tentent le réseau sans cache HTTP. Le KV Classements conserve
ses derniers tableaux valides indépendamment du cache navigateur.

## Tests sans émission ni écriture distante

`npm test`

`node scripts/test-migration.js`

`node scripts/test-standings.js`

`npm run validate`

Avant bascule : confirmer la présence des secrets sans en afficher les valeurs,
la concordance de la clé publique VAPID avec l'ancien site et les contrôles
sur PWA déjà installée. Les enregistrements sans `siteOrigin` ou d'une autre
origine sont conservés mais ne sont pas automatiquement envoyés ni réécrits.
