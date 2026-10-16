// Read private feed config from a LOCAL path, never print URLs or event content.
import { readFile } from 'node:fs/promises';
import { parseCalendar, feedConfig, CATEGORIES } from '../integrations/sporteasy/calendar.js';
const feeds = feedConfig(await readFile(process.argv[2], 'utf8'));
for (const category of CATEGORIES) {
  try {
    const r = await fetch(feeds[category], {redirect:'manual',signal:AbortSignal.timeout(20000)});
    if (!r.ok) { console.log(JSON.stringify({category,status:r.status})); continue; }
    const parsed = await parseCalendar(await r.text(),category);
    const types = {};
    for(const e of parsed.events)types[e.type]=(types[e.type]||0)+1;
    console.log(JSON.stringify({category,status:r.status,raw:parsed.rawCount,events:parsed.events.length,withheld:parsed.withheld,cancelled:parsed.cancelled,types}));
  } catch { console.log(JSON.stringify({category,status:'failed'})); }
}
