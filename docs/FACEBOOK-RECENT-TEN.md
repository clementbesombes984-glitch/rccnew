# Facebook : fenêtre de dix publications — 17 octobre 2026

Le Worker interroge une seule fois /posts avec limit=10 et les mêmes champs Meta,
avant tout filtrage du hashtag. Aucun curseur ou paging.next n'est suivi. Une réponse
de plus de dix éléments est rejetée plutôt que de masquer un comportement inattendu.
L'ordre de la fenêtre est celui fourni par Meta, sans tri ou préfiltrage local.
Le code ne peut prouver qu'aucune publication inaccessible n'a été omise par Meta.
Les publications programmées restent exclues tant qu'elles ne sont pas publiées.

Les anciens articles D1 restent accessibles et ne sont jamais supprimés pour absence
de cette fenêtre. La rotation existante relit jusqu'à dix anciens ID connus par Cron,
seulement s'ils sont absents de la réponse récente. Donc pages=1 mais requêtes Meta
totales=pages+rechecked, entre 1 et 11. examined peut atteindre 20 (dix récents et dix
anciens connus), sans recherche dans des dizaines de publications inconnues.
Un hashtag ajouté à un post jamais importé au-delà des dix derniers n'est plus détecté.

Les URL d'images restent complètes et validées. Si seule l'URL change, UPDATE des seules
colonnes image_url/checked_at sous verrou ; aucune date publique ou champ éditorial
réécrit. Si tout est identique, seul le contrôle checked_at est actualisé pour la
rotation. Aucun téléchargement média, R2, push ou changement d'affichage.

Tests : fenêtre non filtrée mixte, hashtag majuscule au dixième rang, curseur ignoré,
seconde synchronisation idempotente, moins de dix résultats, ancien article sorti
de la fenêtre conservé/relu/modifié, renouvellement image, retrait du hashtag,
erreur Meta, concurrence, sécurité et non-régression globale.

Uniquement Worker Preview et D1 af28c81b-a6da-4390-aab3-bbaf95391420.
Pas de migration, Pages, SportEasy, Production, secret ou notification modifiés.
Comparer les Crons naturels aux anciens 11/15ms sans annoncer de gain théorique.
Plan effectif non vérifié : endpoint abonnements refusé403, usage_model=standard
ne démontre pas Free/Paid ; aucun cpu_ms personnalisé précédemment exposé.
