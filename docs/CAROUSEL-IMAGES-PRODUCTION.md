# Carrousel RCC — publication du 17 octobre 2026

Autorisation explicite de publier uniquement la correction Preview validée.

- Déploiement Production : `5bb14b80-5511-49dd-8f8f-ab29f38c108e`.
- URL du déploiement : https://5bb14b80.rccnew.pages.dev
- Domaine officiel : https://rccubzaguais.fr
- Précédent déploiement (retour arrière Pages) :
  `048d0271-774d-43f1-8866-49b242cb6e99`.
- Paquet identique à la Preview `3f71dc55`, publication directe Pages, pas de
  fusion du worktree ni de déploiement des autres expériences en cours.

Comparaison avant publication : tous les fichiers des deux paquets comparés,
exactement trois différences : co-theme.js, script.js, index.html.
Les37 assets publics HTML/JS/CSS/webmanifest de la base correspondent à l'ancienne
Production (normalisation du marquage email Cloudflare). Functions et calendrier
conservés dans le paquet. Aucun changement de configuration ou déploiement Worker,
secret, Cron, stockage, push, synchronisation, DNS ou design.

## Tests réels après publication

`scripts/test-carousel-images.cjs https://rccubzaguais.fr` : ordinateur1440x1000,
mobile390x844, vrai flux API, affiche de l'article
facebook-1131153776758221_122129574831400436 effectivement chargée et URL identique
au champ image API. Cadrage cover, stabilité après ancien tick cinématique,
aucune erreur JS, aucun appel Meta et aucune tentative POST push pendant le test.

Tests navigateur avec fixtures distinctes : photo manuelle, repli sans image,
repli photo inaccessible, nouvelle signature via refresh pageshow. Il s'agit de
simulations des erreurs/renouvellements, pas d'une expiration Meta réellement observée.

`scripts/check-facebook-production-live.mjs` : deux articles Facebook actifs et
uniques, champs éditoriaux de l'ancien article inchangés ; deux photosHTTP200 image.
Les13news et2matches manuels sont identiques à la sauvegarde. SportEasy : neuf
sources105événements en octobre. WorkerFacebook sync=true, Cron10minutes,
push Worker et Pages=false ; aucun changement de ces paramètres lors de cette publication.

Calendrier officiel vérifié en navigateur desktop/mobile : neuf filtres catégorie,
types et navigation mensuelle, aucune erreur JS ni tentative push.

Les tests automatisés npmtest/validate et diffcheck étaient réussis sur la
correction Preview. Aucun gain CPU revendiqué pour cette correction front-end.
Retour arrière possible par rollback du seul déploiement Pages précédent,
sans toucher aux données ou aux synchronisations.
