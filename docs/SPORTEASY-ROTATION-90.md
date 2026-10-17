# SportEasy : une catégorie par créneau UTC de dix minutes

Cette version remplace le traitement des neuf flux dans une seule invocation.
Rotation : floor(scheduledTime/600000) modulo9 dans l'ordre M6,M8,M10,M12,M14,
M16,M19,Cadettes,Seniors. Les144créneaux/jour sont divisibles par9 : chaque
catégorie reçoit16passages/jour, espacés de90minutes. Un créneau manqué ne décale
jamais les suivants ; l'âge des données peut alors dépasser90minutes (panne).
scheduledTime du Cron est obligatoire, jamais l'horloge de réception comme compteur.

## Coordination autorisée

RCC_SPORTEASY_COORDINATOR : Durable Object SQLite de classe SportEasyCoordinator,
instance déterminée par nom de catégorie. Migration additive sporteasy-coordinator-v1
avec new_sqlite_classes. Ce composant est disponible sur WorkersFree sous quotas,
sans activerWorkersPaid. Aucun R2. Le plan effectif du compte n'est pas encore
vérifié car l'accès aux abonnements est refusé ; ne pas présumer les coûts du compte.
https://developers.cloudflare.com/durable-objects/platform/pricing/

blockConcurrencyWhile sérialise les opérations réseau/KV d'une catégorie. Le
checkpoint durable vérifie catégorie,lastSlot,lastFullDay ; une rediffusion de
créneau ou un vieux créneau terminé est ignoré même après redémarrage. Il ne sert
PAS à choisir la rotation. Écriture seulement après succès de la synchronisation.
Une panne après écritureKV mais avant checkpoint peut provoquer une reprise
idempotente, pas une garantie exactly-once distribuée entreKV etSQLite.

La section exclusive Cloudflare expire après30secondes et réinitialise l'objet.
Le téléchargement existant expire après20secondes ; mesurer le budget restant
pour le stockage. Aucun lease KV non atomique, aucune variable mémoire de rotation.
https://developers.cloudflare.com/durable-objects/api/state/

Le premier passage réussi de chaque catégorie/jourUTC est complet, les15 suivants
sont prioritaires J..J+30. Si le premier manque, le prochain passage rattrape le
complet. La première rotation après déploiement est complète car checkpoints vides.
Ne pas compter cette rotation comme une série prioritaire sans vérifier mode.

## Données et limites

Le code existant ne reçoit que options.category ; il valide/télécharge uniquement
son flux et ne lit/écrit que calendar:cat et checked:cat. Les huit autres calendriers
restent intacts. L'API Pages demeure inchangée et agrège les neuf snapshots.
Les règles J+30, déplacements, archives, erreurs et absences non confirmées décrites
dans SPORTEASY-PRIORITY-30.md restent applicables. Aucune URL privée niICS journalisé.

Par passage nominal : 1requêteflux,1appelDO,1lecturecheckpointDO,1écriturecheckpoint
après succès. Snapshot inchangé :1lectureKVmetadata+1écriturechecked. Reconstruction :
1lectureKVmetadata+éventuellement1lecturesnapshot+1écrituresnapshot. Migrationmetadata
ancienne peut nécessiter1écritureKVsupplémentaire. Les requêtes API des visiteurs
sont séparées. Ne pas présenter ces bornes de code comme une facturation mesurée.

## Tests et mesures

npmtest inclut rotation144créneaux sur journéesDST, neuf catégories, boucle90min,
redémarrage, passage manqué, équité, 1fluxseul, 8snapshotsinchangés, appels concurrents
simulés, dédoublonnage durable, rattrapagefullquotidien, données/pannes/récurrences
et tests globaux existants. Test de concurrence simulé ≠ preuve runtimeCloudflare.
CompilerWorker puis observer un cycleNATUREL de9créneaux pour la nouvelleversion.

Relever séparément cpuTime/wallTime pour component=cron-dispatch et category-sync
(DO), corrélation category+slot. Leur somme donne le coûtCPU observé combiné,
pas le seul CPU du Cron. Le temps mural parent inclut l'attente du DO et ne doit pas
être additionné naïvement au temps mural enfant. Si les traces DO ne sont pas
disponibles, annoncer mesureCPUincomplète, jamais un faux gain par déplacement.
Comparercompletsindividuels/courants séparément, et nepasdiviser86ms par9 commepreuve.
Extrapolation24h doit préciser hypothèses, nombredecomplets/courants et lacunes.

Déployer uniquement workers/sporteasy-sync.toml (rccnew-sporteasy-sync-preview),
Cronunique*/10, KVPreviewd7df448506d7441a9d22dc4be96a291c, même secret existant.
AucunWorkerFacebook/Pages/Production/DNS/pushmodifié. Ne pas supprimer le namespace
DurableObject pour un retour arrière ; toute action destructive exige un accord.
