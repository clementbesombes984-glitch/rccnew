// One-time initial sync, Preview KV only. Never prints config, ICS or event content.
import { readFile } from 'node:fs/promises';
import { syncCalendars } from '../integrations/sporteasy/calendar.js';
const namespace = 'd7df448506d7441a9d22dc4be96a291c';
const account = '4299612fac6e91fbee26ed07aa7baa3f';
const config = await readFile(process.argv[3], 'utf8');
const token = config.match(/^oauth_token\s*=\s*["']([^"']+)/m)?.[1];
if (!token) throw new Error('cloudflare_auth_missing');
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}/values/`;
const kv = {
  async get(key) {
    const r = await fetch(base + encodeURIComponent(key), { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('storage_read');
    return r.json();
  },
  async put(key, value) {
    const r = await fetch(base + encodeURIComponent(key), { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: value });
    if (!r.ok) throw new Error('storage_write');
  }
};
const result = await syncCalendars({ RCC_SPORTEASY_KV: kv, RCC_SPORTEASY_SYNC_ENABLED: 'true', RCC_SPORTEASY_FEEDS: await readFile(process.argv[2], 'utf8') });
console.log(JSON.stringify(result));
if (result.status !== 'ok') process.exitCode = 1;
