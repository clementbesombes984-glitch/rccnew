# Calendrier SportEasy RCC — Preview uniquement

## Architecture et périmètre

Branche `codex/sporteasy-calendar`, sans modification des fichiers Facebook,
des JSON manuels, du Studio, du carrousel, des notifications, des domaines ou du DNS.
Le calendrier mensuel existant est conservé : grille, navigation, couleurs, mobile,
dialogue. Deux rangées de filtres utilisent les mêmes boutons CSS existants.

- Worker indépendant : `rccnew-sporteasy-sync-preview`.
- Cron : `*/30 * * * *`, neuf téléchargements par passage, catégories indépendantes.
- Secret Worker uniquement : `RCC_SPORTEASY_FEEDS`, objet JSON catégorie → URL HTTPS.
- KV dédié : `rccnew-sporteasy-preview`, binding `RCC_SPORTEASY_KV`,
  ID `d7df448506d7441a9d22dc4be96a291c`.
- API GET seule : `/api/sporteasy-calendar?month=2026-10` ; aucun proxy de flux.
- Pages : configuration `wrangler.sporteasy-preview.toml`, branche Preview dédiée.
- Activation : `RCC_SPORTEASY_SYNC_ENABLED=true` côté Worker et
  `RCC_SPORTEASY_READ_ENABLED=true` côté Pages. `RCC_PUSH_ENABLED=false` conservé.
- Le fichier Worker versionné garde le flag false par sécurité ; utiliser un override
  explicite true au déploiement Preview autorisé. Aucun R2, D1 supplémentaire ou Paid.

Les valeurs des neuf URL n'apparaissent dans aucun fichier versionné. Ne pas copier
le fichier privé dans une archive Pages, un log ou une réponse API. Le secret Facebook
n'est ni lu ni modifié. Le binding D1 Facebook Preview et son flag de lecture sont
conservés dans la configuration de cette nouvelle branche.

## Données et confidentialité

Le parseur `ical.js` 2.2.1, verrouillé dans package-lock, gère iCalendar, RRULE,
RDATE/EXDATE, exceptions déplacées/annulées et VTIMEZONE. Si les définitions de zone
manquent, Intl utilise les règles IANA ; les heures flottantes sont interprétées en
Europe/Paris. Les heures ambiguës/non existantes suivent la convention RFC 5545.
Les jours complets et DTEND exclusif sont respectés ; les événements multi-jours
apparaissent chaque jour concerné, y compris à cheval sur deux mois.

Seuls titre, dates, lieu, catégorie d'origine et type déterminable sont publiés.
DESCRIPTION libre est volontairement exclue, comme ATTENDEE, ORGANIZER, CONTACT,
URL, alarmes et propriétés arbitraires. On ne peut pas garantir automatiquement
l'anonymisation d'un texte libre ou reconnaître tous les noms propres : pour publier
des descriptions il faudra un champ réellement public identifié/validé séparément.
Pas de changement imposé au travail quotidien des bénévoles pour les informations
de planning. Les titres/lieux sont limités, nettoyés, refusés en présence de motifs
de contacts/liens/présences/médical ; les CLASS PRIVATE/CONFIDENTIAL sont masquées.
Les responsables doivent réserver les titres et lieux aux informations publiques
de planning, jamais y inscrire des noms/coordonnées de membres. La détection de motifs
n'est pas une garantie universelle d'anonymisation. Les UID sont hachés SHA-256 ;
aucun identifiant iCal brut (qui pourrait contenir une adresse) n'est publié.

Les types viennent seulement du titre et CATEGORIES. Sans indication fiable :
type `unknown`, aucune étiquette inventée. Le filtre « Autres événements » inclut
les types non déterminés. Un même UID/occurrence commun à plusieurs flux n'apparaît
qu'une fois et garde toutes ses catégories. Des événements distincts possédant des
UID différents ne sont pas fusionnés sur le seul titre (risque de fusion abusive).

Les deux événements JSON manuels restent chargés indépendamment de l'API. Les anciens
groupes EDR/Jeunes sont associés à leurs catégories d'âge. L'ordre chronologique,
les détails et leur échappement HTML sont conservés. Le bouton « + autres » ouvre
les événements supplémentaires du jour : aucun événement n'est inaccessible à cause
de la limite visuelle de trois cartes par case.

## Robustesse et limites

Chaque catégorie remplace atomiquement son seul snapshot KV après téléchargement
complet et validation. Pas de remplacement sur HTTP non 2xx, redirection, délai,
ICS invalide/tronqué ou flux sans VEVENT inattendu. Les autres catégories continuent.
Une annulation explicite ou la disparition dans un flux complet valide est répercutée.
Un flux entièrement vide ne purge jamais la dernière version : validation humaine
nécessaire pour une suppression totale intentionnelle. L'API affiche un état dégradé
si une catégorie est absente ou n'a pas été synchronisée depuis plus de deux heures.
syncedAt reflète le dernier snapshot modifié/développé ; checkedAt est actualisé
séparément pour les flux identiques. L'état de fraîcheur prend le plus récent des
deux, sans fausse alerte pour un calendrier inchangé mais téléchargé avec succès.

La comparaison SHA-256 du flux évite parsing/réécriture des événements si rien n'a
changé le même jour ; seule une petite clé de contrôle est actualisée.
Les séries récurrentes sont développées sur six mois passés et dix-huit mois à venir,
recalculées quotidiennement ; les événements simples historiques sont conservés.
Bornes de sécurité : 2 Mo/flux, 2 000 VEVENT, 2 000 occurrences et 10 000 itérations
par catégorie ; un dépassement garde la dernière version plutôt qu'un snapshot partiel.
Le Worker a au maximum 27 sous-requêtes habituelles (neuf lectures, neuf fetch,
neuf écritures), sans téléchargement média ni retry agressif. Cron 30 minutes,
exécution au maximum 15 minutes : pas de chevauchement naturel attendu. KV n'est
pas un verrou transactionnel ; ne pas lancer deux seeds simultanés au Cron.

Maximum courant 432 écritures/jour pour neuf flux modifiés à chaque passage,
plus l'initialisation ; beaucoup moins si inchangés. Les quotas KV sont partagés
avec les autres usages du compte. Aucun abonnement payant ne doit être activé.
Le coût CPU Cloudflare, particulièrement lors d'un changement massif, reste à
mesurer : la réussite sous Node ne prouve pas la marge Workers Free. Si dépassement,
ne pas activer Paid ; conserver les snapshots et revoir le découpage du traitement.
La consistance KV peut différer de plusieurs dizaines de secondes entre régions.

## Installation / publication Preview

Les ressources isolées sont créées sans toucher aux existantes. Vérifier les noms/ID.
Installer les URL privées uniquement via l'entrée standard du prompt secret :

```text
npx wrangler deploy --config workers/sporteasy-sync.toml
npx wrangler secret put RCC_SPORTEASY_FEEDS --config workers/sporteasy-sync.toml
npx wrangler deploy --config workers/sporteasy-sync.toml --var RCC_SPORTEASY_SYNC_ENABLED:true
```

Pour la synchronisation initiale, le script `scripts/seed-sporteasy-preview.mjs`
réutilise exactement le normaliseur et la logique de conservation ; ses arguments
sont les CHEMINS locaux du fichier de flux et de la configuration OAuth Wrangler,
jamais des valeurs de secrets. Il est limité au namespace Preview ci-dessus ; ne
pas l'adapter pour Production sans nouvelle validation. Aucun endpoint public de sync.

Déployer Pages depuis une archive Git propre (pas les fichiers locaux non suivis),
jamais depuis une copie contenant une configuration privée :

```text
# Dans l'archive temporaire UNIQUEMENT : copier wrangler.sporteasy-preview.toml
# sous le nom wrangler.toml, puis :
npx wrangler pages deploy . --project-name rccnew --branch codex/sporteasy-calendar
```

Wrangler Pages refuse un chemin de configuration personnalisé dans la version
utilisée : le renommage ne concerne que le paquet temporaire, JAMAIS wrangler.toml
Production du dépôt. Ne jamais employer `main` ou le domaine officiel. Les commits `[CF-Pages-Skip]`
évitent le déploiement automatique lors du push ; publication Preview explicite.
Retour arrière : désactiver uniquement les flags SportEasy ou utiliser la version
précédente de cette Preview ; ne supprimer ni KV, ni JSON, ni article Facebook.

## Vérifications du 16 octobre 2026

Accès réels HTTP 200 et normalisation initiale autorisée vers KV Preview :

| Catégorie | VEVENT | Événements stockés |
| --- | ---: | ---: |
| M6 | 38 | 38 |
| M8 | 78 | 78 |
| M10 | 31 | 31 |
| M12 | 33 | 33 |
| M14 | 49 | 49 |
| M16 | 99 | 99 |
| M19 | 10 | 10 |
| Cadettes | 35 | 35 |
| Seniors | 113 | 113 |
| Total | 486 | 486 |

Premier contrôle : 487 événements (M8 : 79). Lors de l'actualisation initiale à
16:19 UTC, le flux M8 contenait lui-même 78 VEVENT ; le total est donc passé à 486.
Aucun événement JSON manuel n'a été supprimé. Ne pas attribuer cette variation
à une annulation précise sans preuve fournie par la source.

Ces flux réels sont en UTC, sans RRULE. Les récurrences, exceptions, changement
d'heure, multi-jours, panne et flux vide sont testés sur fixtures, pas revendiqués
comme présents dans SportEasy. Les tests vérifient aussi confidentialité, filtrage,
API, catégories partagées, reprise indépendante, hash/cache et JSON manuels inchangés.
Compléter le bilan de déploiement avec les versions et les contrôles navigateur.
