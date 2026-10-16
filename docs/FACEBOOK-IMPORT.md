# Facebook → RCC : installation et validation avant activation

## État livré

Branche `codex/facebook-news-import`. Aucun déploiement, aucune ressource distante
créée, aucun token demandé dans le chat. `wrangler.toml` Production reste inchangé.
Les identifiants fictifs des configurations doivent être remplacés avant déploiement.
Le commit de la branche porte le préfixe `[CF-Pages-Skip]` afin d'éviter un
déploiement Preview automatique lors du push et de la création de la PR.
App Meta Studio Rugby : 1622656996088692 ; Page : 1131153776758221 ; Graph v25.0.
Ces identifiants sont publics, contrairement au Page Access Token.

Le Worker lit uniquement `/1131153776758221/posts` et les anciens ID importés.
Champs conformes au test communiqué : id,message,created_time,permalink_url,full_picture.
Il n'appelle jamais de publication Facebook, GitHub ou push. Un hashtag entier
insensible à la casse sélectionne le post. Le hashtag est retiré du texte, le
titre est extrait de la première ligne (110 caractères maximum), sans IA.
Les posts sans texte restant ont un libellé neutre « Publication Facebook ».
Les dates futures et les objets explicitement non publiés sont refusés.

D1 utilise un ID Facebook unique et un UPSERT. Un bail SQL sérialise les passages,
et chaque écriture vérifie son propriétaire et son échéance (fencing).
Les répétitions/reprises n'ajoutent pas de doublon. Un retrait confirmé du hashtag
masque l'article ; une absence ou une erreur de lecture ne le supprime pas.
10 anciens ID sont recontrôlés à chaque passage, dans l'ordre du dernier contrôle.
Une suppression Facebook reste ambiguë avec une restriction d'accès : pas de
suppression automatique sur simple erreur API ; une revue administrative est requise.

L'API `/api/facebook-news` est en lecture seule : 20 éléments par défaut, 50 maximum,
`offset` borné à 10000, `next` pour charger la suite. Accès direct par `?id=facebook-ID`.
La liste, l'accueil et le lecteur utilisent une source fusionnée ; JSON manuels et
newsletters ne sont pas modifiés. Dates décroissantes, chargement de 20 imports
puis bouton pour les précédents. Le lecteur comporte « Voir sur Facebook ».
Les chaînes restent échappées, et les liens sont limités aux origines Facebook HTTPS.
Une panne D1/Meta n'efface pas les articles manuels. Le bouton Réessayer gère les pannes.

## Médias

R2 est obligatoire pour activer la synchronisation : aucune URL temporaire Facebook
ne devient une image permanente du site. Image principale uniquement pour cette V1.
Téléchargements HTTPS limités à fbcdn.net/fbsbx.com et leurs sous-domaines,
sans redirection, 5 Mio maximum, timeout, MIME et signatures binaires vérifiés.
JPEG/PNG/WebP/AVIF seulement. Les objets sont adressés par hash du contenu,
servis par `/api/facebook-media/ID` seulement si l'article est actif, en no-store.
Une erreur image conserve l'ancienne image ou affiche le fallback RCC ; elle est
comptée dans les logs et sera retentée au prochain passage. Pas de resizing dans
cette V1 : une compression/variante mobile pourra être ajoutée après mesure.
Les anciens objets R2 non référencés ne sont pas automatiquement purgés, pour ne
pas supprimer un objet partagé. Prévoir une maintenance avec inventaire des
références et purge contrôlée, notamment sur demande de suppression Meta/RCC.
Ne pas considérer R2 comme une archive permanente autorisée de tout contenu Meta.

## Cloudflare : d'abord un environnement isolé

Commandes à exécuter seulement après validation et activation R2 par le propriétaire :

1. Créer la base : `npx wrangler d1 create rccnew-facebook-preview`.
2. Créer le bucket privé : `npx wrangler r2 bucket create rccnew-facebook-media-preview`.
   Ne pas activer son accès public ; conserver le service via l'API Pages.
3. Reporter l'ID D1 dans `wrangler.facebook-preview.toml`. Remplacer aussi les
   valeurs du Worker pour pointer vers la même base/bucket de préproduction.
   Utiliser le nom Worker `rccnew-facebook-sync-preview` pendant ces tests.
4. Appliquer la migration **sur cette base isolée** :
   `npx wrangler d1 migrations apply rccnew-facebook-preview --remote --config wrangler.facebook-preview.toml`.
5. Les deux services partagent les bindings `RCC_FACEBOOK_DB` (D1) et
   `RCC_FACEBOOK_MEDIA` (R2). Aucun binding KV push ni standings dans le nouveau Worker.
6. Installer **sur le Worker uniquement**, via saisie masquée/interactive :
   `npx wrangler secret put RCC_FACEBOOK_PAGE_TOKEN --config workers/facebook-sync.toml`.
   Vérifier auparavant que ce fichier cible bien le Worker preview, pas Production.
   Jamais de token dans le fichier TOML, les arguments, GitHub, ou le JavaScript public.
7. Flags : Worker `RCC_FACEBOOK_SYNC_ENABLED=false` ; Pages
   `RCC_FACEBOOK_READ_ENABLED=false` ; conserver `RCC_PUSH_ENABLED=false`.
8. Une fois les bindings et le secret validés, déployer la branche uniquement en
   Preview avec le fichier Pages dédié. Ne jamais utiliser ce fichier sur main.
   `npx wrangler pages deploy . --config wrangler.facebook-preview.toml --project-name rccnew --branch codex/facebook-news-import`.
   Les scripts/documents locaux non commités doivent être exclus du dossier publié :
   préférer une archive Git de la branche pour ce déploiement.
9. Autoriser la lecture des imports sur Preview en passant son flag à true.
   Déployer le Worker preview après validation, puis passer son flag sync à true
   pour les tests réels : Cron `*/10 * * * *`. Sans ce flag aucun appel Meta n'a lieu.

Un déploiement Cron peut commencer à s'exécuter dès sa création : ne mettre le
flag à true qu'après revue des ressources et du token. Le Worker n'a pas de route
publique de synchronisation, son fetch renvoie 404.

## Après tests et accord : préparer rccnew.pages.dev

Créer une base et un bucket dédiés nommés `rccnew-facebook` et
`rccnew-facebook-media`, sans réutiliser les données preview. Remplacer les
placeholders du Worker. Ajouter dans le **wrangler.toml existant**, sans retirer
les KV ni les variables de migration, les blocs suivants (ID réel à renseigner) :

```toml
[[env.production.d1_databases]]
binding = "RCC_FACEBOOK_DB"
database_name = "rccnew-facebook"
database_id = "ID_D1_REEL"
migrations_dir = "migrations/facebook"

[[env.production.r2_buckets]]
binding = "RCC_FACEBOOK_MEDIA"
bucket_name = "rccnew-facebook-media"
```

Ajouter `RCC_FACEBOOK_READ_ENABLED="false"` dans `[env.production.vars]` (pas à
la fin d'un bloc bucket). Puis migration dédiée, installation du secret Worker,
revue des bindings, tests, et seulement ensuite activation sur rccnew.pages.dev.
Ne pas modifier les DNS/domaines, l'ancien projet, les clés VAPID ou les abonnements.
Aucun secret Meta nécessaire dans Pages : seul le Worker parle à Graph API.

## Tests et limites réelles

`npm test` inclut `scripts/test-facebook.js` (Node 22.13+ avec node:sqlite ; testé
ici avec Node 24). SQLite réelle en mémoire pour la migration, les UPSERT, les
verrous et les requêtes ; API Meta/R2 et réseau simulés. Tests des neuf cas demandés,
plus chevauchement, retrait hashtag, dates futures, image malveillante/trop grosse,
lecture d'image inactive, pagination invalide et fallback manuel dans le chargeur.
`npm run validate`, `git diff --check`, compilation Functions et Worker dry-run.

La programmation Meta réelle et les permissions ne sont pas certifiées par ces
tests. L'accès /posts v25.0 a été déclaré fonctionnel par l'administrateur, mais
le token n'est pas disponible dans cet environnement. Vérifier sa portée Page,
validité et échéances dans le débogueur Meta. Les permissions communiquées sont
pages_show_list, pages_read_engagement, business_management ; ne pas demander
pages_manage_posts/Instagram pour ce lecteur.

Le Worker examine au maximum 125 posts récents (5 pages) par passage, plus 10
anciens ID, avec budget de traitement de 4 minutes. `truncated:true` signale une
fenêtre dépassée ou un budget atteint : un backfill contrôlé sera alors nécessaire.
Pas de promesse d'import illimité de l'historique ou de latence garantie en cas
de panne/rate limit. Éviter le plan Free si les limites CPU/sous-requêtes sont
insuffisantes pour la volumétrie ; surveiller Workers, D1 et R2 avant activation.
Une erreur token est journalisée `meta_token_invalid`, sans message Graph brut ;
une erreur réseau `meta_network`. Nouvelle tentative au Cron suivant, pas de boucle
de retry agressive. Mettre une alerte sur ces codes et `truncated`/`mediaErrors`.

Le navigateur intégré n'a pas pu atteindre localhost pendant cette session
(ERR_CONNECTION_TIMED_OUT). La validation visuelle desktop/mobile reste donc
à effectuer en Preview. Le serveur de fixtures `node scripts/preview-facebook.mjs`
écoute uniquement 127.0.0.1:3338 et ne contient aucun secret ; il permet une revue
locale sans token ni notifications.

## Retour arrière

Mettre le flag sync à false pour arrêter l'import ; mettre le flag read à false
pour revenir immédiatement aux articles manuels. Ne supprimer ni les JSON ni D1
ni les KV lors de cette opération. Une réactivation retrouve les mêmes ID sans
doublon. Les futurs changements du Studio pourront utiliser la même API sans
réécrire les articles manuels existants.
