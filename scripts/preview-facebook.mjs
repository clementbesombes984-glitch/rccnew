// Local-only visual fixture server. Never used by Cloudflare or the sync Worker.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.woff2': 'font/woff2' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/facebook-news') {
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    if (url.searchParams.get('offset') === '20') return res.end(JSON.stringify({ news: [], next: null }));
    return res.end(JSON.stringify({ news: [{ id: 'facebook-1131153776758221_999', source: 'facebook', title: 'Actualité Facebook — test local uniquement',
      body: 'Texte de validation mobile.\n\n<script>window.facebookInjected=true</script>', summary: 'Texte de validation mobile.',
      date: '2026-10-16T12:00:00Z', category: 'Club', notification: false, image: '', facebookUrl: 'https://www.facebook.com/example/posts/999' }], next: url.searchParams.has('id') ? null : 20 }));
  }
  if (url.pathname.startsWith('/api/')) { res.writeHead(503); return res.end('{}'); }
  const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!filename.startsWith(root + path.sep) || /[/\\]\./.test(path.relative(root, filename)) || path.relative(root, filename).startsWith('.')) { res.writeHead(404); return res.end(); }
  try { res.setHeader('content-type', types[path.extname(filename)] || 'application/octet-stream'); res.end(await readFile(filename)); }
  catch { res.writeHead(404); res.end(); }
}).listen(3338, '127.0.0.1', () => console.log('Local fixtures: http://127.0.0.1:3338'));
