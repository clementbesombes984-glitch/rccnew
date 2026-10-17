# Diagnostic CPU Preview — 17 octobre 2026

## Limites et preuves

Les deux settings distants indiquent usage_model=standard, limits=null. Aucun
cpu_ms personnalisé n'est exposé. Le GET account subscriptions est refusé HTTP403.
Le plan Free/Paid n'est donc pas identifié : standard n'en est pas une preuve.
La documentation officielle fixe Free à 10ms CPU par HTTP comme par Cron ; Paid
à 30s par Cron espacé de moins d'une heure. Une tolérance occasionnelle existe.
https://developers.cloudflare.com/workers/platform/limits/
Le temps réseau/stockage n'est pas du CPU. Les durées applicatives ne profilent
pas précisément le CPU ; seules les métriques Cloudflare fournissent sa mesure.

## Facebook

La comparaison exclut checked_at ; published_at provient de created_time et non
de l'instant de synchronisation. Les tests SQLite confirment le chemin inchangé.
Une URL image renouvelée doit rester mise à jour : ne jamais ignorer ses paramètres
signés ou figer une image expirée. La cause distante exacte reste à établir.
Instrumentation ciblée changedFields : six compteurs numériques (titre, corps,
date, lien, image, activation), aucune valeur, URL, texte ou secret. Pas de changement
de stratégie de comparaison sans preuve. checked_at continue d'assurer la rotation
des relectures sous verrou : ce n'est pas une date publique artificielle.

## SportEasy

Défaut confirmé : un snapshot historique sans metadata est décodé à chaque Cron
inchangé, sans jamais recevoir ses métadonnées. Le code précédent lisait également
le snapshot entier comme texte, même en présence de métadonnées.
Correction : getWithMetadata en stream ; annuler le stream si métadonnées présentes.
Sinon lire la valeur historique et, après vérification du hash et du jour, réécrire
une seule fois EXACTEMENT la même valeur avec métadonnées. Aucun événement/date
du snapshot n'est changé lors de cette migration paresseuse. Les jours suivants
la réexpansion reste obligatoire pour les récurrences. Les changements réels restent
détectés par hash du corps téléchargé. Aucun cache ne remplace le contrôle de source.
Compteurs sûrs metadataHit, metadataUpgraded, parsed par catégorie.

Le téléchargement, la lecture bornée du corps, SHA256, les neuf contrôles KV et les
écritures checked restent effectués. Leur attribution exacte en millisecondes CPU
n'est pas démontrée sans profil. Pas de promesse de gain avant mesures réelles.
Le test ETag/Last-Modified/304 direct est bloqué par la sécurité car il requiert
la lecture du fichier d'URL privées : non exécuté, aucun support304 présumé.
Autorisation explicite à demander avant ce test. Pas d'implémentation conditionnelle.

## Périmètre

Workers Preview seuls, D1 af28c81b-a6da-4390-aab3-bbaf95391420 et
KV d7df448506d7441a9d22dc4be96a291c. Aucun Pages/Production/secret/push/DNS modifié.
Pas de migration D1. Métadonnées KV ajoutées par le Worker uniquement aux catégories
validées ; coût initial possible d'une écriture supplémentaire par catégorie.
Comparer deux Crons naturels par nouvelle version, sans mélanger anciennes traces.
Préserver les 486 événements (sauf évolution source), deux événements et treize
actualités manuels. Retour arrière Worker possible sans suppression de données.
