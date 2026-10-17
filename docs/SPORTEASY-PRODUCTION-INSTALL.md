# Première installation SportEasy Production — 17 octobre 2026

Autorisation humaine explicite d'installation initiale, puis autorisation précise
de lire le fichier privé existant pour le secret Production. Aucune URL dans ce
document, GitHub, le navigateur ou les logs. Pas de données Preview copiées.

## Sources et périmètre

Moteur exact testé au commit9cf2e01 : integrations/sporteasy/* et
workers/sporteasy-sync.js inchangés depuis ce commit. Configuration Production
distincte workers/sporteasy-production.toml ; rotation*/10 UTC, catégorie/90min,
priorityJ..J30 et premier succès UTC de chaque catégorie quotidien en full.
SQLite DO dédié, pas de migration des données existantes ni de D1 SportEasy.

Pages : archive de la Production précédente commit
1a44bf49486c61f7a3432cd011c1ad92c81fada1, déploiement
c15b74f5-b2ef-492a-816f-d1d36d5ed8b0. Seuls quatre fichiers du calendrier validé
sont ajoutés/remplacés : calendrier.html, calendar-view.js, calendar-model.js,
functions/api/sporteasy-calendar.js. CSS, autres pages et Functions Facebook/push
proviennent exactement de l'archive officielle, pas de la branche expérimentale.
Le prototype Google et le correctif Facebook763ff1c ne sont pas embarqués.

## Sauvegarde et initialisation

Sauvegarde locale hors Git : dist/sporteasy-production-install/before.json.
Contient namespace initial (0clé) et JSON officiels complets2matches/13news.
Script install-sporteasy-production.mjs : backup obligatoire avant seed,
namespaceProduction fixé2f273875520b4362af2f4323aec5ec5b, traitement full séquentiel
des9fluxréels, relectureaprèschaquecatégorie ; aucunelectureSnapshotPreviewpourseed.
La premièreinitialisationcontrôlée est exécutée parNode : ce n'est PAS une mesure
CPU Cloudflare et PAS un Cron naturel. Initialisation483IDsuniques :
38,75,31,33,49,99,10,35,113. M8sourcecourante75VEVENTcontre78Previewconservés :
3IDsdifférentsabsentsdunouvelimport, dates24/28/31octobre ; cause métier inconnue.
Aucune suppression de Production (vide avant initialisation), pas de total486forcé.

## Notifications et protections

API push/config enabled=true décrit Boolean(VAPID_PUBLIC_KEY) et concordanceorigin,
pas l'autorisation d'envoi. ConfigurationProductionauditéeRCC_PUSH_ENABLED=false,
RCC_PUSH_DELIVERY_MODE=workflow. /push/send exigeflagtrue,sourceworkflow etadminauth.
Le moteur SportEasy écritseulementKV/DO,aucunappelpush/GitHub/publishing.
Le workflow notify déclenchemainuniquementdata/news.json,matches.json,push-queue.json
non modifiés par installation. Pasdecommitmain/fusion/notification, pasdecléVAPID
ouabonnementmodifié. Conserver exactement ces réglages à la publication Pages.

## Retour arrière public, non destructif

Si régression aprèsactivation : rollback Pages vers
c15b74f5-b2ef-492a-816f-d1d36d5ed8b0 viaCloudflareDeploymentsRollback, puis mettre
uniquementRCC_SPORTEASY_READ_ENABLED=false si nécessaire. Ne supprimer aucune
ressource/KV/DO/événement. La version Pages précédente ignore les nouvelles données.
Ne pas restaurer le snapshotPreview. Le Worker peut rester indépendant du calendrier
public ; si sa synchronisation estdéfectueuse,désactivationduseulflagSportEasyavec
accord nécessaire seloncontexte, conservationdesévénements. PasderollbackWorker
pré-installationpuisqu'aucunWorkerProductionn'existait.

## Validation

Tests npmtest etvalidate réussis, rotations/concurrence/récurrence/exceptions/DST
simulées. InitialisationProductioncomplète9catréelle, intégrité483uniquecontrôlée,
moisaoût28/octobre105/décembre74 viaAPIavecbindingProductionisolé. Donnéesmanuelles
comparéesauJSONsauvegardé. Rendu localdupaquetProductionavectousfiltres et navigation
desktop/mobile : distinct d'un test du siteofficielaprèsactivation.
ConservermesuresCron/DOProductionréellesenrapport séparéesdesduréesNode.
LeslimitesDOCPUdiffèrentduCronFree10ms ; nepasdéduireplanFree/PaiddeusageModelstandard.
