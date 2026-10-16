# Facebook → RCC — Preview gratuite, D1 uniquement

## État et périmètre

Branche `codex/facebook-news-import`, PR nº 1 existante. Les optimisations décrites
ci-dessous sont préparées sans nouveau déploiement. La version Preview antérieure
a réellement importé la publication La Brède le 16 octobre 2026, aux Crons de
14:30 et 14:40 UTC, avec un seul identifiant en D1 après les deux passages.
Pas de R2, pas de bucket, pas de binding RCC_FACEBOOK_MEDIA, pas de souscription
payante requise par cette intégration. Utiliser Workers Free et D1 Free, sans
activer R2, Workers Paid ou un produit demandant une carte bancaire.
Ne pas accepter d'upgrade si le tableau de bord le propose : examiner les quotas.

Base Preview existante vérifiée en lecture seule :

- Nom : `rccnew-facebook-preview`.
- ID : `af28c81b-a6da-4390-aab3-bbaf95391420`.
- Binding des deux services : `RCC_FACEBOOK_DB`.
- Worker isolé prévu : `rccnew-facebook-sync-preview`.
- Pages : projet `rccnew`, branche Preview `codex/facebook-news-import` seulement.

App Meta Studio Rugby : 1622656996088692 ; Page : 1131153776758221 ; Graph v25.0.
Le secret `RCC_FACEBOOK_PAGE_TOKEN` reste **exclusivement sur le Worker**. Aucun
token Meta dans Pages, GitHub, le navigateur ou le fichier de configuration.
Le fichier `wrangler.toml` Production, le domaine officiel et l'ancien projet
ne sont pas modifiés. Les commits portent `[CF-Pages-Skip]` pour empêcher le
déploiement automatique lors des mises à jour de la PR ; ne pas fusionner maintenant.

## Fonctionnement

Cron toutes les 10 minutes : `*/10 * * * *`, avec flag désactivé par défaut.
Lecture seule de `/1131153776758221/posts` et d'anciens ID importés. Champs :
id,message,created_time,permalink_url,full_picture. Aucun envoi vers Facebook.
Le hashtag entier #ActuRCC est reconnu sans distinction de casse, puis retiré
de l'affichage. Le titre vient de la première ligne, limité à 110 caractères.
Aucun contenu inventé. Les dates futures/non publiées sont refusées.

D1 conserve ID unique, texte, titre, date, lien Facebook et `image_url` éventuelle.
UPSERT idempotent et verrou avec vérification du propriétaire/échéance à l'écriture.
Le retrait confirmé du hashtag masque l'import ; une erreur ou une absence du
flux ne prouve pas une suppression. Les articles manuels ne sont jamais écrits.

La liste, l'accueil et le lecteur fusionnent imports et JSON manuels. Présentation
existante, dates décroissantes, API paginée (20 éléments, maximum 50 par requête),
bouton de chargement de la suite et lien « Voir sur Facebook ». Panne D1/Meta :
les actualités manuelles restent accessibles. Aucun import n'entre dans le polling
push ou la file GitHub. Les mécanismes de notifications manuelles sont inchangés.

### Images directes et expiration

Les URL HTTPS de fbcdn.net/fbsbx.com et de leurs sous-domaines sont validées à
l'import, à la sortie de l'API et côté affichage. Refus d'autres origines, ports,
identifiants URL, fragments et paramètres token/authorization/appsecret.
Le Worker ne télécharge aucun média. Le navigateur charge directement l'image,
sans envoyer le jeton Page, avec referrerPolicy=no-referrer.

Les cartes affichent d'abord le fallback RCC, puis ne remplacent ce fallback
qu'après chargement réussi. Une URL expirée, bloquée ou hors ligne garde le
fallback. Dans le lecteur, une image cassée est remplacée par le bloc RCC. Aucun
onerror HTML inline, aucune boucle de rechargement. Le texte et le lien restent
consultables ; une image absente/invalide ne bloque jamais la publication.
L'en-tête photo des articles Facebook ne dépend pas de leur URL distante.

Chaque relecture Meta actualise l'URL D1. Les posts récents sont relus au Cron ;
10 anciens ID sont recontrôlés par passage. Une URL ancienne peut donc rester
indisponible jusqu'à ce que Meta fournisse une URL renouvelée. Les images ne sont
pas archivées et leur disponibilité permanente n'est pas garantie. Les droits
d'utilisation des photos et les conditions Meta restent applicables. Les autres
formats (vidéos/Reels) ne sont pas copiés ; image principale seulement en V1.

## 1. Préparer la base existante — aucune recréation

Les deux configurations contiennent déjà l'ID Preview ci-dessus :
`wrangler.facebook-preview.toml` (Pages), `workers/facebook-sync.toml` (Worker).
La base n'a pas été modifiée par le développement. Vérifier avant toute commande :

```text
npx wrangler d1 list --json
npx wrangler d1 migrations list rccnew-facebook-preview --remote --config wrangler.facebook-preview.toml
```

Après validation, appliquer les migrations sur **cette seule base Preview** :

```text
npx wrangler d1 migrations apply rccnew-facebook-preview --remote --config wrangler.facebook-preview.toml
```

`0001_posts.sql` reste inchangée si elle a déjà été appliquée. `0002_direct_image_url.sql`
ajoute `image_url` sans supprimer de ligne ni réécrire les articles. L'ancienne
colonne `image_key` reste inutilisée pour compatibilité ; elle ne nécessite pas R2.
Utiliser le gestionnaire de migrations, pas un rejeu manuel de l'ALTER TABLE.

## 2. Connecter D1 à Pages Preview et au Worker

Préparer une archive Git propre de la branche pour ne pas publier les fichiers
locaux non commités d'autres missions. Dans cette archive :

1. Vérifier `wrangler.facebook-preview.toml` : binding RCC_FACEBOOK_DB, nom/ID
   existants ; `RCC_FACEBOOK_READ_ENABLED=false` et `RCC_PUSH_ENABLED=false`.
2. Le déploiement explicite avec ce fichier raccordera D1 à Pages **Preview**.
   Ne pas utiliser ce fichier pour main/Production.
3. Le Worker possède le même binding D1 et `RCC_FACEBOOK_SYNC_ENABLED=false`.
   Aucun binding KV, aucune clé VAPID, aucune ressource R2.

Commandes pour plus tard, seulement après validation des tests et de la base :

```text
npx wrangler pages deploy . --config wrangler.facebook-preview.toml --project-name rccnew --branch codex/facebook-news-import
npx wrangler deploy --config workers/facebook-sync.toml
```

Le Worker déployé à false n'appelle pas Meta, même si le Cron est enregistré.
Son endpoint HTTP renvoie 404, il n'offre pas de déclenchement public.

## 3. Installer le secret sur le Worker uniquement

L'administrateur conserve le jeton de Page validé pour /posts v25.0. Vérifier
dans Access Token Debugger validité, Page, permissions et échéances. Les permissions
communiquées sont pages_show_list, pages_read_engagement, business_management ;
aucune permission de publication Facebook/Instagram requise pour ce lecteur.

```text
npx wrangler secret put RCC_FACEBOOK_PAGE_TOKEN --config workers/facebook-sync.toml
```

Saisir uniquement dans le prompt sécurisé prévu à cet effet ou le champ Secret du
Worker dans Cloudflare. Jamais de valeur en argument, dans le chat ou dans GitHub.
Vérifier la présence par le **nom** dans Workers > rccnew-facebook-sync-preview >
Settings > Variables and Secrets. Ne pas l'ajouter aux variables Pages.

## 4. Activation progressive Preview, après accord

1. Vérifier D1 et le secret, puis déployer les deux composants avec flags false.
2. Dans la configuration Pages Preview dédiée, passer seulement
   `RCC_FACEBOOK_READ_ENABLED` à true et redéployer la branche Preview. L'API
   `/api/facebook-news` doit répondre sans exposer d'information privée.
3. Vérifier `/api/push/config` et conserver `RCC_PUSH_ENABLED=false`.
4. Passer `RCC_FACEBOOK_SYNC_ENABLED=true` dans le fichier Worker, après revue du
   nom preview et de l'ID D1, puis redéployer **uniquement le Worker Preview**.
5. Attendre le prochain Cron (10 minutes), consulter les codes de logs et vérifier
   une publication #ActuRCC déjà publiée ; puis absence de doublon au Cron suivant.
6. Tester un post sans image, un avec image, un retrait du hashtag, une URL expirée,
   une programmation devenue publique et l'affichage desktop/mobile. Aucun push.

Ces commandes/activations n'ont pas été exécutées pendant cette modification.
Ne pas activer le flux sur le domaine officiel. Ne pas fusionner la PR avant les
tests réels. La future activation de rccnew Production fera l'objet d'un accord
et d'une configuration distincte ; ne pas partager accidentellement la base Preview.

## Quotas gratuits et limites

Maximum 3 pages Meta (75 posts récents), 10 anciens ID recontrôlés et 15 écritures
d'articles par passage. Les nouveaux imports passent avant les rafraîchissements,
puis les plus anciens contrôles sont prioritaires. Un lot plus important dans cette
fenêtre est traité progressivement aux Crons suivants. Aucun téléchargement média
côté Worker. Ces bornes limitent les requêtes D1 et sous-requêtes réseau, sans
nécessiter Workers Paid. CPU/quotas gratuits restent à surveiller en test réel ;
en cas de dépassement, réduire la taille de lot, pas activer un plan payant.
Un historique antérieur aux 75 posts récents peut nécessiter un backfill contrôlé.
`truncated:true` signale un lot borné ; erreurs génériques sans message Graph brut,
notamment meta_token_invalid, meta_rate_limit et meta_network. Pas de retry agressif :
nouvelle tentative au Cron suivant. Aucun mécanisme ne renouvelle un token révoqué
sans intervention de l'administrateur.

## Tests et retour arrière

Voir aussi `docs/DIAGNOSTIC-FACEBOOK-META.md` : correctif workerd du mode de
redirection préparé sans activation. Le helper utilise manual et refuse les 3xx ;
ne pas remplacer par follow, qui pourrait transmettre Authorization à une autre
origine. Les logs n'incluent que des catégories/étapes et des codes numériques.

`npm test`, `npm run validate`, `git diff --check`, compilation Functions et Worker
en dry-run. Le test Facebook utilise une vraie SQLite locale en mémoire et un
réseau simulé. Il vérifie notamment migration sans perte, idempotence, concurrence,
images absentes/expirées/renouvelées, URL malveillantes, absence de token dans les
images publiques, fallback des cartes et du lecteur, sécurité HTML et repli manuel.
Le navigateur intégré n'avait pas accès à localhost lors de la phase précédente :
la revue visuelle desktop/mobile reste à réaliser en Preview, sans la déclarer acquise.

## Optimisation finale préparée — accord requis avant déploiement

### CPU : constats et changements

Les Crons de référence ont consommé 13 puis 12 ms de CPU ; ce ne sont pas leurs
durées réseau (8 952 et 4 432 ms). Aucun profil CPU détaillé Cloudflare n'est
disponible : l'attribution exacte de ces millisecondes n'est pas démontrée.
Les opérations inutiles identifiées dans le code étaient la normalisation complète
de toutes les publications (dates, URL, images, titre), une RegExp ID reconstruite
par publication, deux tests du hashtag et un tri localeCompare inutile pour des
horodatages ISO UTC.

La nouvelle version réutilise les RegExp, écarte les publications sans marqueur
et inconnues avant la normalisation, teste une seule fois leur marqueur et trie
les dates ISO par comparaison simple. Les images absentes n'entraînent plus une
exception URL utilisée comme contrôle de flux. Les ID connus sans hashtag restent
normalisés pour désactivation ; une image renouvelée reste réécrite. L'UPSERT et
le rafraîchissement checked_at sont volontairement conservés, ainsi que le verrou
et son fencing : les retirer ferait perdre des garanties de concurrence/rotation.
Les 3 pages de 25, 10 recontrôles et 15 écritures restent inchangés ; aucune réduction
silencieuse de couverture ou d'actualisation. Aucun changement des tables/index.

### Journaux sans secrets

Chaque succès contient status, processed, truncated et les compteurs suivants :

| Champ | Sens |
| --- | --- |
| received | Objets reçus dans les pages /posts (avant dédoublonnage) |
| pages | Pages /posts reçues et décodées avec succès, maximum 3 |
| rechecked | Appels directs tentés pour les anciens ID connus, maximum 10 |
| examined | Publications uniques examinées, flux et recontrôles réunis |
| matching | Publications uniques avec hashtag entier, avant validation des autres champs |
| rejected | Publications uniques invalides ou sans hashtag et inconnues |
| created | Nouvelles lignes effectivement écrites sous verrou |
| updated | Lignes déjà connues effectivement écrites (rafraîchissement compris) |
| durationMs | Durée totale du handler jusqu'à résolution de la synchronisation, libération du verrou comprise |

processed = created + updated, pas le nombre de nouveaux articles. Un retrait de
hashtag sur un article connu est une mise à jour, pas un rejet. Une publication
éligible différée par la limite de 15 n'est pas un rejet ; truncated le signale.
En erreur, les compteurs partiels disponibles sont conservés, ainsi que les
codes/étapes HTTP déjà filtrés. Une erreur avant acquisition du verrou peut ne
pas disposer de compteurs. Aucun corps Meta, URL, ID, texte, jeton ou en-tête n'est
journalisé. durationMs ne mesure PAS le CPU. Utiliser cpuTime et wallTime du tail
Cloudflare : aucune valeur CPU n'est inventée côté JavaScript.

### Historique : limite assumée et rattrapage proposé

La fenêtre automatique reste les 75 dernières publications, plus la rotation
des 10 anciens ID déjà importés. Une publication jamais importée et plus ancienne
ne sera pas découverte par cette version, même avec un hashtag ajouté après coup.
Pour ces exceptions, stratégie recommandée : rattrapage administratif limité à
1–5 ID explicites de cette Page, validation des ID, lecture officielle Graph et
même normalisation/UPSERT/verrou. Ce mode n'est PAS implémenté ni exécuté ici :
il nécessitera une validation distincte et des tests avant utilisation. Aucune
route publique de déclenchement et aucun secret supplémentaire. Ne jamais écrire
manuellement une ligne D1 pour contourner les protections. Au quotidien, ajouter
le marqueur au moment de publier/programmer suffit ; pas d'intervention technique
régulière. Pas d'exploration illimitée ni de nouvel état/cursor D1 dans cette PR.

### Validation et déploiement Preview ultérieur

1. Exécuter npm test, npm run validate, git diff --check, les builds dry-run Worker
   et Functions. Les tests utilisent réseau simulé et SQLite mémoire ; ils ne
   prouvent ni le CPU Cloudflare ni la disponibilité d'une image Meta réelle.
2. Après accord explicite seulement, préparer une archive propre du commit de PR.
   Aucun déploiement Pages n'est nécessaire pour cette optimisation backend.
3. Vérifier le nom rccnew-facebook-sync-preview et D1 af28c81b-a6da-4390-aab3-bbaf95391420.
   Le fichier versionné garde sync=false par sécurité. Pour conserver l'activation
   Preview déjà autorisée lors du déploiement de test, utiliser explicitement :

   ```text
   npx wrangler deploy --config workers/facebook-sync.toml --var RCC_FACEBOOK_SYNC_ENABLED:true
   npx wrangler tail --config workers/facebook-sync.toml --format json
   ```

   Ne pas réinstaller ni lire le secret existant. Ne pas toucher Pages, push,
   Production ou à la PR. Aucun nouvel apply de migration : seules 0001 et 0002
   déjà appliquées sont nécessaires. Vérifier après déploiement flag, version et Cron.
4. Observer au moins 6 passages NATURELS (60 minutes), puis idéalement 24 heures,
   incluant rafraîchissements et nouveau post réel. Relever cpuTime, wallTime,
   compteurs, erreurs, D1 et API. Vérifier 1 ID unique pour chaque article et les
   13 manuels inchangés ; push toujours false. Pas de notification ni test forcé.
5. Critère CPU : passages habituels sous 10 ms, viser <= 8 ms pour une marge ;
   ne pas conclure sur une moyenne cachant des dépassements. Sans mesure distante
   la réduction CPU reste NON VALIDÉE. Les compteurs couvrent aussi les lots rejetés.
6. Si les dépassements persistent : profiler en environnement isolé, puis envisager
   une stratégie à coût borné par passage (fenêtre récente à chaque Cron, scan plus
   profond réparti périodiquement avec curseur et tests de couverture). Diminuer la
   fréquence seule ne réduit pas le CPU PAR invocation ; ne pas présenter un Cron
   moins fréquent comme un correctif. Toute adaptation requiert un nouvel accord,
   aucune souscription payante ni activation R2.

Les seuils de référence officiels : [Workers Free CPU et sous-requêtes](https://developers.cloudflare.com/workers/platform/limits/)
et [D1 Free requêtes](https://developers.cloudflare.com/d1/platform/limits/).
Les erreurs de quota restent à surveiller ; aucun historique complet de consommation
du compte n'est déduit des tests locaux. Retour arrière : redéployer la version
Worker Preview précédente, ou désactiver son flag avec accord ; garder D1 et les
articles. Aucun changement du schéma ni migration de retour nécessaire.

Retour arrière : flag Worker false pour arrêter la synchronisation ; flag Pages
read false pour revenir aux actualités manuelles. Ne supprimer ni D1 ni les JSON,
ni les KV. Aucun changement du service worker, du calendrier, des classements,
du Studio, des abonnements, des domaines ou des DNS.
