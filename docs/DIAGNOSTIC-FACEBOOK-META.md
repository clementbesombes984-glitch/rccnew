# Diagnostic Meta / Wrangler — 16 octobre 2026

## Mise en sécurité effectuée

Le seul déploiement autorisé pendant ce diagnostic a été la remise à false du
Worker `rccnew-facebook-sync-preview`, avant toute modification corrective du code.
Cloudflare confirme la version `7647f725-78d9-4a77-baf8-2a61a8fc6de5`.
Le contrôle Settings confirme sync=false et le secret Page toujours présent,
sans lecture ni modification de sa valeur. Cron toujours */10 * * * *.
Pages Preview : read=true, push=false ; déploiement Production inchangé
`1dd82a52-9d9c-4740-a603-05ee398078c4`. La correction ci-dessous n'est pas déployée.

## Cause confirmée dans le code : mode de redirection incompatible

Avant correction, graph() appelait fetch avec `redirect: 'error'` dans un try/catch
qui reclassait TOUTE exception en meta_network, sans détail. Le try contenait
aussi la création du signal d'expiration et la construction implicite de Request.

Le runtime local workerd lancé avec Wrangler 4.151.1 et compatibility_date
2026-10-16 rejette ce mode. Reproduction sans token réel, sans accès Meta ni réseau
sortant : `new Request('https://example.invalid/', {redirect:'error'})` lève
TypeError, message contrôlé : Invalid redirect value, must be one of follow or manual.
Les modes manual/follow sont acceptés ; AbortSignal.timeout est disponible.
Le code source officiel workerd confirme que l'enum Redirect ne contient que
FOLLOW et MANUAL. La documentation Request générale mentionne pourtant les trois
valeurs : le test du runtime et le code de l'implémentation sont déterminants ici.

Ce défaut se produit avant l'envoi réseau et suffit à expliquer meta_network.
Il ne prouve ni une panne Meta, ni un jeton invalide. Les tests Node précédents
injectaient un fetch simulé qui ne construisait pas une Request workerd : ils
ne détectaient donc pas cette incompatibilité. La compilation seule ne la détecte pas.

## Journaux réellement disponibles

L'écoute tail existante conserve les passages naturels de 13:00 et 13:10 UTC :
code meta_network, aucune exception propagée, outcome ok. Le code intercepte
l'erreur et ne la relance pas, d'où outcome ok malgré l'échec métier.
Un troisième passage déjà tamponné à 13:20 UTC de l'ancienne version active
`d459cf55-87b6-48cd-a170-d9180e8ed4b2` donne le même résultat (CPU 3 ms).
Ce n'est pas une exécution de la nouvelle version désactivée.

L'observabilité persistante n'était pas configurée (settings observability=null).
Le message TypeError original ayant été jeté par le catch, il ne peut pas être
reconstruit à partir de ces logs. La cause est reproduite localement, pas extraite
d'une trace brute secrète. Aucun nouvel appel Facebook n'a été déclenché.

## Analyse de la requête et des réponses

- Destination fixe : HTTPS graph.facebook.com, version v25.0, Page 1131153776758221.
- Lecture de /posts avec id,message,created_time,permalink_url,full_picture,
  limite 25 et curseur de pagination. Les next URL Meta ne sont pas suivies :
  seul le curseur est réutilisé sur l'origine fixe.
- Authorization Bearer reste uniquement en en-tête serveur. Pas de token en query,
  aucune URL/en-tête/corps/message Graph/stack dans les logs proposés.
- Un fetch normal retourne une Response sur HTTP 4xx/5xx : ces statuts ne sont
  pas des exceptions réseau. L'ancien meta_network pouvait masquer une exception
  JavaScript de construction, un échec DNS/TLS, une interruption ou un timeout.
- Délai de 15 secondes conservé, incluant la lecture du corps via le signal.
  Les échecs observés duraient moins d'une seconde : ils ne correspondent pas
  à l'expiration normale de ce délai. Le timeout lui-même est compatible workerd.
- L'ancien parse JSON reclassait une réponse HTML 502 en meta_response et perdait
  son statut. Le correctif conserve cette information sans lire/logguer le texte brut.

## Correctif minimal préparé dans la PR nº 1

1. redirect=manual, puis refus explicite de tout HTTP 3xx avant lecture JSON.
   Aucun suivi de Location, jamais de transfert du Bearer vers une autre origine.
2. Validation de Request séparée du transport : meta_request_invalid si la
   construction échoue ; meta_network pour le transport, meta_timeout pour abort/timeout.
3. Classification exploitable des HTTP 401/code190, 403, 429/codes de limitation,
   5xx, JSON invalide et réponse de redirection.
4. Logs bornés à des valeurs contrôlées : code, étape request/transport/body/response,
   type d'exception pris dans une liste fermée, statut HTTP et codes Meta numériques.
   Aucun message natif, message Meta, URL, Location, en-tête ou secret.

## Erreurs Wrangler 7403 et 10000 : incident distinct

Vérification limitée des logs locaux, sans afficher leur contenu d'authentification :
`wrangler-2026-10-16_13-01-08_448.log` contient 10000 ;
`wrangler-2026-10-16_13-10-58_976.log` contient 7403. Dans les deux cas il s'agit
de requêtes de gestion D1 vers le compte attendu, pas de requêtes Graph Meta.

Pendant ce diagnostic : whoami confirme OAuth connecté, le compte attendu et
le scope d1:write ; le SELECT COUNT(*) sur la base Preview réussit de nouveau,
success=true, articles=0, rows_written=0. Aucun login/logout, nouvel identifiant,
nouveau secret ou nouvelle base n'a été demandé.

Cause historique exacte NON établie : authentification transitoire/état de session
ou autorisation de service sont des hypothèses, pas des faits prouvés. Il n'y a
pas d'élément justifiant de recréer D1 ou de régénérer des credentials. Les accès
D1 par binding Worker et l'accès API de gestion Wrangler sont deux chemins distincts.
Les anciens logs ne démontrent ni une base invalide ni un échec du token Facebook.

## Tests exécutés et restant à faire

- npm test : toutes les suites existantes et Facebook passent.
- Nouveaux cas : Request construite, refus 302/307/308 sans suivi, HTTP 401/403/429/503,
  code190, HTML502, JSON invalide, timeout transport/corps, header invalide, exception
  au nom arbitraire et vérification des logs sans secret ni URL.
- workerd local : ancien mode refusé, requête corrigée acceptée, redirection bloquée,
  timeout disponible. Test réel du runtime, avec toutes les réponses Meta simulées.
- npm run validate, git diff --check et Worker dry-run réussis.

Test local reproductible :
`npx wrangler dev --local --config scripts/facebook-runtime-check.toml --port 3342`.
Consulter http://127.0.0.1:3342/ ; attendu passed:true. Ce test n'a ni binding,
ni token réel, ni accès réseau sortant, ni Cron. Ne pas déployer cette fixture.

À valider seulement après nouvel accord : déployer la correction Preview en gardant
sync=false, puis autoriser explicitement une reprise contrôlée. Seule une lecture
réelle permettra de vérifier le token, ses droits, la connectivité distante et les
champs Graph, puis l'import et les doublons. Aucune réactivation dans cette mission.

## Sources primaires

https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.h
(enum Request::Redirect, FOLLOW/MANUAL).
https://developers.cloudflare.com/workers/runtime-apis/request/
(avertissement sur le transfert des headers en redirect=follow).
