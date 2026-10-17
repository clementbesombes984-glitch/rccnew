# SportEasy : priorité trente jours et réconciliation quotidienne

## Modes

Le même Cron */30 est conservé. workers/sporteasy-sync.js sélectionne le mode full
au passage de 02:00 UTC, priorité aux autres passages. Pas de déclencheur ajouté,
de route de lancement HTTP, de Pages ou de secret modifié. Un snapshot sans fullDay
reçoit une initialisation complète à sa première exécution après mise à jour.
Les catégories ayant échoué réessaient leur initialisation au passage suivant.
Ne pas confondre cette initialisation automatique avec une mesure de mode courant.

Le mode prioritaire s'applique à l'instant courant jusqu'à J+30 (trente fois 24h).
Les événements chevauchant la fenêtre sont inclus. Les anciens événements proches
sont suivis par hash UID même s'ils sont déplacés au-delà de J+30 ; un changement
de UID côté source est indiscernable d'une création distincte. Les nouvelles dates
lointaines sont récupérées au complet quotidien. Tous les mois restent consultables.

Chaque téléchargement reste INTÉGRAL. Aucune API de période ni prise en charge
ETag/Last-Modified/304 n'a été vérifiée ; le test des URL privées reste en attente
d'autorisation explicite. Aucune condition HTTP non prouvée n'est implémentée.

## Traitement et conservation

Le hash complet du flux est comparé aux métadonnées KV. S'il est identique et que
la fenêtre a été évaluée le même jour, le parsing iCal et le snapshot ne sont pas
réécrits en mode prioritaire. Une petite clé checked conserve la fraîcheur : zéro
écriture de snapshot ne signifie donc pas zéro écriture KV totale.
Le complet quotidien réévalue les récurrences même à corps identique et met à jour
fullDay. Les fenêtres de développement RFC5545 précédentes sont conservées (six
mois passés, dix-huit mois futurs), ainsi que les occurrences archivées hors fenêtre.

Sur un corps modifié, le parsing syntaxique iCal reste complet ; la fenêtre évite
la normalisation d'événements simples lointains. Les UID sont toujours hachés pour
suivre les déplacements sans conserver leurs valeurs potentiellement personnelles.
Une série déjà proche est développée dans la fenêtre habituelle pour préserver ses
autres occurrences. Ce choix favorise la fiabilité plutôt qu'un gain maximal.
Les lectures KV du snapshot complet ne sont nécessaires qu'en cas de reconstruction.
Cela ajoute au maximum une lecture par catégorie si les métadonnées avaient suffi
jusqu'alors ; pas de nouvel index ni autre ressource.

Fusion atomique par catégorie avec les données existantes, jamais remplacement par
le seul mois. Une annulation explicite ou une exception de récurrence peut enlever
l'occurrence concernée. Les UID absents du flux sont CONSERVÉS, même au complet :
un flux syntaxiquement valide peut être incomplet. La dépublication sans statut
CANCELLED ne peut donc pas être garantie automatiquement. Les données privées ou
devenues non publiables sont retirées par précaution. Les échecs HTTP, réseau,
parsing, flux vide inattendu et limites d'expansion gardent le snapshot précédent.

Compteurs category/status/mode/events/raw/parsed/metadataHit/metadataUpgraded,
created/updated/removed/snapshotWrites/checkWrites. Un déplacement peut compter
une création et une suppression puisque l'ID occurrence inclut sa date de début.
Aucune URL, UID brut, description ou donnée personnelle dans les compteurs.

## Validation

Fixtures : création J+7, modification J+15, annulation J+25, création/modification
J+60 récupérées au quotidien, déplacement J+15 vers J+60, archives et UID absent
conservés, métadonnées/flux inchangés, première initialisation full et quotidien,
récurrences, DST, réseau/HTTP/flux invalides, filtres/API et JSON manuels inchangés.
Tests locaux et compilation ne démontrent pas le CPU Cloudflare : observer au moins
une exécution complète et deux courantes naturelles par nouvelle version.

Pas de garantie CPU Free à ce stade. Plan effectif non identifié (subscriptions403,
usageModelstandard et limitsnull insuffisants). Free nominal10ms par Cron, Paid30s
pour un intervalle inférieur à une heure :
https://developers.cloudflare.com/workers/platform/limits/
Le temps réseau n'est pas du CPU. Aucun abonnement payant autorisé/activé.
Si le complet dépasse les limites effectives, demander un découpage séparé avant
Production, sans présenter une fréquence réduite comme une réduction CPU/invocation.

## Déploiement et retour arrière

Seulement rccnew-sporteasy-sync-preview et KV d7df448506d7441a9d22dc4be96a291c,
override RCC_SPORTEASY_SYNC_ENABLED:true comme précédemment. Cron inchangé.
Pas de migration KV destructive : champs additionnels fullDay en snapshot/metadata.
Revenir à la version précédente sans supprimer KV ni données manuelles si nécessaire.
Les notifications push, Facebook, Pages, DNS et ressources Production sont exclus.
