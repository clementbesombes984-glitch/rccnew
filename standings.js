(async () => {
  const root = document.getElementById('standings');
  const groups = [
    ['seniors', 'Seniors', 'Nouvelle-Aquitaine Régionale 3 — Championnat territorial', 'https://monclubhouse.ffr.fr/regionales/nouvelle-aquitaine/nouvelle-aquitaine-regionale-3-championnat-territorial/qualification-50143/73076/classements'],
    ['cadets', 'Cadets', 'Nouvelle-Aquitaine Régional 2 U16', 'https://monclubhouse.ffr.fr/regionales/nouvelle-aquitaine/nouvelle-aquitaine-regional-2-u16/qualification-50230/73244/classements'],
    ['cadettes', 'Cadettes', 'Nouvelle-Aquitaine Féminines régionales à X — moins de 18 ans', 'https://monclubhouse.ffr.fr/clubs/r-c-cubzaguais/competitions/nouvelle-aquitaine-feminines-regionales-a-x-moins-de-18-ans-championnat-territorial/qualification-50321/classements']
  ];
  let payload;
  try {
    const response = await fetch('./api/standings', { cache: 'no-store', signal: AbortSignal.timeout(50000) });
    if (!response.ok) throw new Error('network');
    payload = await response.json();
  } catch { /* All sections and official links remain available without the API. */ }
  const el = (tag, text) => { const node = document.createElement(tag); if (text != null) node.textContent = text; return node; };
  const fragment = document.createDocumentFragment();
  for (const [id, label, competition, source] of groups) {
    const data = payload?.groups?.find((g) => g.id === id);
    const section = el('section'); section.id = id; section.className = 'standings-section';
    section.setAttribute('aria-labelledby', `${id}-title`);
    const title = el('h2', `Classement ${label}`); title.id = `${id}-title`;
    section.append(title, el('p', competition));
    if (data?.rows?.length) {
      const wrap = el('div'); wrap.className = 'standings-scroll'; wrap.tabIndex = 0;
      wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', `Tableau ${label}, défilement horizontal`);
      const table = el('table'); table.className = 'standings-table';
      const caption = el('caption', `Classement officiel FFR — ${label} — 2026-2027`); table.append(caption);
      const fields = [['position', 'Position'], ['name', 'Club'], ['joues', 'Joués'], ['gagnes', 'Victoires'], ['nuls', 'Nuls'], ['perdus', 'Défaites'], ['pointTerrain', 'Points'], ['bonusOffensif', 'BO'], ['bonusDefensif', 'BD']];
      const head = el('thead'); const hr = el('tr');
      fields.forEach(([, label]) => { const th = el('th', label); th.scope = 'col'; hr.append(th); }); head.append(hr); table.append(head);
      const body = el('tbody');
      data.rows.forEach((row) => { const tr = el('tr'); if (row.rcc) tr.className = 'is-rcc'; fields.forEach(([field]) => { const cell = el(field === 'name' ? 'th' : 'td', row[field] ?? '—'); if (field === 'name') cell.scope = 'row'; tr.append(cell); }); body.append(tr); });
      table.append(body); wrap.append(table); section.append(wrap);
      if (data.stale) section.append(el('p', 'La FFR est indisponible ou la mise à jour est en retard : dernières données valides conservées.'));
    } else { const message = el('p', 'Classement temporairement indisponible. Aucune donnée officielle n’a encore pu être récupérée.'); message.className = 'standings-message'; section.append(message); }
    const meta = el('p'); meta.className = 'standings-meta';
    const date = data?.updatedAt && new Date(data.updatedAt);
    meta.append(el('span', date && !Number.isNaN(date.getTime()) ? `Dernière récupération réussie : ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(date)} (heure de Paris).` : 'Dernière récupération réussie : aucune.'), el('br'));
    const link = el('a', 'Voir le classement officiel sur la FFR'); link.href = source; link.target = '_blank'; link.rel = 'noopener noreferrer'; meta.append(link); section.append(meta); fragment.append(section);
  }
  root.replaceChildren(fragment);
  if (['#seniors', '#cadets', '#cadettes'].includes(location.hash)) document.querySelector(location.hash)?.scrollIntoView();
})();
