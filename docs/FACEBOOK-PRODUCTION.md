# Facebook production

Production is promoted from Preview commit 51f6d443f31d90aba3a5fa0e9f0010171ab4f5db.

- The existing Worker `rccnew-facebook-sync-preview` now serves production. Its historical name is retained to preserve the encrypted `RCC_FACEBOOK_PAGE_TOKEN` without reading or copying its value.
- Deploy it ONLY using `workers/facebook-sync.production.toml`. Cron: every ten minutes. It has no push credentials or publishing code.
- Production D1: `rccnew-facebook-production`, ID `d9488355-321c-4298-aba4-f256de6e4b73`. Both additive migrations must be applied before switching the Worker.
- Pages production reads the production database through `RCC_FACEBOOK_DB`, with `RCC_FACEBOOK_READ_ENABLED=true`. Existing KV namespaces, secrets and `RCC_PUSH_ENABLED=false` are preserved.
- The old Preview database `af28c81b-a6da-4390-aab3-bbaf95391420` is retained. It no longer receives this Worker's Cron updates. Preview Pages continues reading that separate database.
- `workers/facebook-sync.toml` now names a separate disabled sandbox Worker; it must never target the promoted Worker. No sandbox Worker or secret is created as part of promotion.

Manual `data/news.json`, matches and push queue are unchanged. Facebook records are isolated in D1 and are never written to those files. Primary key UPSERT and an expiring ownership lock prevent duplicate imports and concurrent writes.

Rollback: restore Pages deployment `1dd82a52-9d9c-4740-a603-05ee398078c4` and redeploy the promoted Worker with sync disabled. Preserve both databases and all secrets. The previous Worker version is `59a73562-6c25-404e-bf7e-66ba57f5c52c`; restoring that version also requires restoring its Preview D1 binding explicitly if settings have changed. Never delete D1 or regenerate VAPID keys for rollback.

The previously reported CPU observation is one Preview execution at 12 ms. This promotion does not establish six CPU samples or prove an improvement.
