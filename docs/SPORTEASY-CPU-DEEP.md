# SportEasy — optimisation ciblée et campagne de mesure

17 octobre 2026. Preview uniquement. Les modifications Google expérimentales
présentes dans le checkout ne font pas partie du commit ni du déploiement Worker.

## Audit et preuves

Le Cron délègue au Durable Object : son CPU seul ne mesure pas le coût complet.
`parseCalendar` assure parsing, indexation UID/exceptions, expansion, fuseaux,
sanitisation et identifiants. `reconcileCalendar` compare/merge les événements.
`syncCalendars` télécharge, décode, calcule SHA-256, lit les métadonnées KV puis
écrit un snapshot ou le contrôle léger. Le coordinateur sérialise les appels et
persiste le checkpoint après succès. Pas de compteur KV pour la rotation.

Constats de code, PAS attribution chiffrée du CPU distant :
- Intl.DateTimeFormat était recréé pour chaque conversion de date flottante ;
  désormais un objet par fuseau et par parsing (aucun état de rotation en mémoire).
- Deux JSON.stringify par événement comparé ; comparaison des champs publics
  explicite, catégories comprises, sans hypothèse SEQUENCE/LAST-MODIFIED.
- UID SHA-256 déjà calculé une fois par série ; suppression des Promises et await
  répétés par occurrence, sans changer les IDs ou les règles de récurrence.
- Blob + arrayBuffer après lecture des chunks ; décodage UTF-8 incrémental borné
  remplace ces allocations et respecte les caractères entre chunks.
- AbortSignal.timeout(20s) non désarmable ; AbortController + clearTimeout dans
  finally couvre téléchargement, corps, HTTP/réseau/taille/lecture en erreur.
  L'ancien minuteur explique plausiblement les traces DO proches de 20s ; la
  causalité et le gain de durée doivent être vérifiés sur les nouvelles traces.
  Ce n'est PAS une preuve de 20s CPU ni une mesure de facturation.

## Snapshots, fenêtre temporelle et récurrences

La comparaison identique vérifie événements + hash du flux + expandedDay + fullDay
+ nombres raw/withheld/cancelled. Seulement si tout est identique, l'écriture du
snapshot est remplacée par checked:cat. Au changement de jour, le snapshot reste
réécrit et le recalcul des récurrences demeure. Un simple hash inchangé n'évite
donc pas les contrôles temporels. Cette économie vise les reprises/migrations ou
répétitions complètes le même jour ; ne pas prétendre supprimer les 9 écritures
quotidiennes normales avec ce correctif.

Les flux inchangés en priorité bénéficiaient déjà de SHA-256 + metadata stream
annulé sans décodage JSON, parsing ni expansion : mécanisme conservé. Les anciens
snapshots sans métadonnées gardent leur migration paresseuse. Aucune suppression
sur UID absent, flux vide/malformé ou réponse incorrecte. Annulations explicites,
exceptions, confidentialité et déplacements conservent les règles existantes.
Pas de cache de récurrences supplémentaire : invalidation complexe et gain non
démontré. Les événements passés et futurs, API et filtres restent inchangés.

Options complètes : A quotidienne CONSERVÉE ; B conditionnelle et C hebdomadaire
non retenues maintenant. Elles pourraient retarder la découverte des modifications
lointaines et nécessiteraient une nouvelle politique d'invalidation temporelle.

## HTTP conditionnel

Aucune lecture externe de secrets ou URL privée n'a été effectuée. Les requêtes
normales du Worker observent désormais uniquement les booléens etagPresent et
lastModifiedPresent et le statut numérique. Les valeurs ne sont jamais stockées
ou journalisées. Leur présence ne prouve PAS le support des requêtes conditionnelles.
Le support réel SportEasy reste à vérifier pendant une campagne autorisée. Aucun
If-None-Match/If-Modified-Since activé par anticipation. Une réponse 304 inattendue
préserve les derniers événements (échec contrôlé), elle n'est jamais parsée comme
un calendrier vide. Un vrai chemin 304 demandera un validateur associé exactement
au snapshot et un repli GET 200 en cas de métadonnées absentes/périmées, sans
empêcher le recalcul journalier. Pas de contournement des restrictions antérieures.

## Instrumentation légère

Les champs profile sont numériques/booléens uniquement : statut HTTP, présence de
validateurs, octets, headersWallMs, bodyAndDecodeWallMs, digestWallMs,
metadataReadWallMs, icalParseWallMs, parseAndExpandWallMs, compareWallMs,
serializeWallMs, snapshotWriteWallMs, occurrences, uidDigests, timezoneFormatters.
Coordination : checkpointReadWallMs/checkpointWriteWallMs. Les erreurs restent
retained_last_valid sans message/URL/ICS. Pas de description, contacts ou UID brut.

IMPORTANT : ces mesures Date.now sont des DURÉES APPLICATIVES, parfois nulles ou
grossières dans Workers ; pas un profil CPU par fonction. Les phases asynchrones
incluent l'attente réseau/stockage et du travail local ; on ne peut pas isoler le
temps réseau pur avec ces champs. parseAndExpand englobe icalParse : ne pas sommer
les deux. Exceptions, dates, IDs sont inclus dans l'expansion, pas mesurés CPU
séparément pour éviter instrumentation par occurrence. Seuls cpuTime/wallTime des
traces Cloudflare sont les mesures réelles par invocation. Additionner CPU Cron
et DO d'un même slot ; ne pas additionner leurs durées murales imbriquées.

## Tests

`npm test`, `npm run validate`, `git diff --check`, Wrangler dry-run.
Nouveau test CPU : fermeture des timers sur tous chemins ; UTF-8 découpé ;
présence/absence de validateurs ; 304 conservateur ; snapshot identique ;
changement de jour/mois ; flux modifié ; comparaison de tous champs publics ;
conservation des 2 matchs/13 news. Tests existants couvrent J+30, annulations,
déplacements, EXDATE/RECURRENCE-ID, DST, récurrences, archives, concurrence simulée,
rotation équitable et isolation des huit autres catégories. Aucun test simulé ne
constitue une mesure Cloudflare ou un appel aux flux SportEasy réels.

## Baseline réelle avant correctif

| Catégorie | Full Cron ms | Full DO ms | Events | KV snapshot |
|---|---:|---:|---:|---:|
| M6 |1|25|38|1|
| M8 |0|30|78|1|
| M10 |0|26|31|1|
| M12 |1|17|33|1|
| M14 |0|18|49|1|
| M16 |0|43|99|1|
| M19 |1|19|10|1|
| Cadettes |1|14|35|1|
| Seniors |0|30|113|1|

Cycle complet précédent 226ms cumulés, moyenne25,1ms, max43ms/invocation ;
486 événements déclarés, pas de changement de contenu. Priorités réellement
observées avant : M6 DO5/Cron0, M8 DO4/Cron0, M12 DO4/Cron0. Autres catégories
prioritaires non observées à ce stade, ne pas compléter artificiellement.

## Déploiement et validation

`npx --offline wrangler deploy --config workers/sporteasy-sync.toml --var RCC_SPORTEASY_SYNC_ENABLED:true`
Nom exact Preview, KV d7df448506d7441a9d22dc4be96a291c, DO namespace existant
8578abc13c144c2b87dcf038907f2a4b, classe et migration inchangées, Cron */10.
Pas de migration de données, secret/binding/Pages/Facebook/Production modifié.

Observer au moins neuf passages naturels de la NOUVELLE version, puis les full
quotidiens naturels si la campagne ne les inclut pas. Les checkpoints conservés
peuvent imposer des passages priority après déploiement : ne pas les effacer pour
forcer un full. Rapport séparé par mode/catégorie/volume, compteurs de parsing et
écritures, CPU Cron/DO et couverture réelle. L'estimation journalière, seulement
si données suffisantes : somme des9full +15 fois somme des9priority ; ne pas
présenter ce calcul comme24h observées. Surveillance précédente arrêtée à la
demande humaine ; aucune ancienne mesure réutilisée comme mesure après correctif.

## Limites / sources officielles

Plan du compte NON IDENTIFIÉ : usageModel standard / limits null ne prouvent rien.
Workers Free :10ms CPU par Cron ; Durable Object SQLite :30s CPU par invocation
par défaut, limites distinctes ; blockConcurrencyWhile :30s de durée maximale.
Vérifier aussi quotas Free partagés du compte ; 1000visites/mois ne déterminent
pas à elles seules la consommation des synchronisations planifiées.

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/durable-objects/platform/limits/
- https://developers.cloudflare.com/durable-objects/platform/pricing/

Conclusion avant mesures nouvelles : INSUFFISAMMENT VÉRIFIÉ. Aucun gain CPU chiffré
annoncé sur les seuls tests locaux. Pas de compatibilité Free garantie tant que
plan, quotas et mesures réelles ne sont pas suffisamment établis.
