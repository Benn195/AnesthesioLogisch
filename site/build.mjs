// Bouwt de website uit de Obsidian-kluis in /inhoud naar /dist.
//   npm run build            → bouwt voor de root ("/")
//   BASE_PATH=/repo/ npm run build → bouwt voor een submap (bv. GitHub Pages)
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { createMarkdown } from './lib/markdown.mjs';
import { layout, artikel, kaartLijst } from './lib/templates.mjs';
import { ANIMATIES } from './lib/animaties.mjs';
import { escapeHtml, slugify, stripHtml, formatDatum } from './lib/util.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT = path.join(ROOT, 'inhoud');
const OUT = path.join(ROOT, 'dist');
const ASSETS = path.join(__dirname, 'assets');

const SITE = {
  naam: 'AnesthesioLogisch',
  slogan: 'Anesthesiologie, logisch uitgelegd',
  beschrijving:
    'Dé centrale kennisbank voor studenten anesthesiologie: heldere uitleg, interactieve animaties en alles op één plek.',
  disclaimer:
    'AnesthesioLogisch is bedoeld voor onderwijs. Doseringen en adviezen zijn indicatief; volg altijd de lokale protocollen, het Farmacotherapeutisch Kompas en de aanwijzingen van je supervisor.',
  versie: Date.now().toString(36),
};

const HOME_FILE = 'startpagina';
const PAGE_EXT = '.md';

function normalizeBase(b) {
  if (!b) return '/';
  if (!b.startsWith('/')) b = '/' + b;
  if (!b.endsWith('/')) b += '/';
  return b;
}

export async function build({ base = normalizeBase(process.env.BASE_PATH), quiet = false } = {}) {
  const t0 = Date.now();
  const log = quiet ? () => {} : console.log;
  const warnings = [];

  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  // ---------- 1. Bestanden verzamelen ----------
  const files = await walk(CONTENT);
  const gitDates = readGitDates();
  const pages = [];
  const attachments = new Map(); // basename (lowercase) → url
  const attachmentsByPath = new Map();

  for (const abs of files) {
    const rel = path.relative(CONTENT, abs).split(path.sep).join('/');
    const segs = rel.split('/');
    if (segs.some((s) => s.startsWith('.'))) continue;
    if (rel.toLowerCase().endsWith(PAGE_EXT)) {
      if (segs.some((s) => s.startsWith('_'))) continue; // sjablonen, beheer, etc.
      const raw = await fs.readFile(abs, 'utf8');
      const { data: fm, content } = parseFrontmatter(raw, rel, warnings);
      if (fm.concept === true || fm.publiceren === false || fm.draft === true) continue;
      const stat = await fs.stat(abs);
      const name = segs[segs.length - 1].slice(0, -PAGE_EXT.length);
      const dirs = segs.slice(0, -1);
      const parentName = dirs[dirs.length - 1];
      const isFolderNote = !!parentName && (name.toLowerCase() === parentName.toLowerCase() || name.toLowerCase() === 'index');
      const isHome = dirs.length === 0 && name.toLowerCase() === HOME_FILE;
      const urlSegs = (isFolderNote ? dirs : [...dirs, name]).map(slugify);
      const url = isHome ? base : base + urlSegs.join('/') + '/';
      pages.push({
        id: rel,
        rel,
        name,
        dirs,
        isFolderNote,
        isHome,
        url,
        outFile: isHome ? 'index.html' : [...urlSegs, 'index.html'].join('/'),
        fm,
        body: content,
        title: String(fm.titel || fm.title || name),
        description: fm.beschrijving || fm.description || '',
        icoon: fm.icoon || fm.icon || '',
        auteur: fm.auteur || fm.author || '',
        order: Number.isFinite(Number(fm.volgorde ?? fm.order)) ? Number(fm.volgorde ?? fm.order) : 999,
        aliases: toList(fm.aliases || fm.alias),
        tags: toList(fm.tags || fm.tag).map((t) => String(t).replace(/^#/, '').toLowerCase()),
        updated: gitDates.get('inhoud/' + rel) || stat.mtime.toISOString(),
      });
    } else {
      const url = base + 'bestanden/' + segs.map((s) => encodeURIComponent(s)).join('/');
      const dest = path.join(OUT, 'bestanden', ...segs);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(abs, dest);
      attachments.set(segs[segs.length - 1].toLowerCase(), url);
      attachmentsByPath.set(rel.toLowerCase(), url);
    }
  }

  // ---------- 2. Opzoektabellen voor [[links]] ----------
  const byName = new Map();
  const byPath = new Map();
  for (const p of pages) {
    byPath.set(p.rel.slice(0, -PAGE_EXT.length).toLowerCase(), p);
    for (const key of [p.name, ...p.aliases]) {
      const k = String(key).toLowerCase();
      if (!byName.has(k)) byName.set(k, p);
    }
  }
  const resolve = (target) => {
    if (!target) return null;
    const t = target.trim().replace(/\\/g, '/').replace(/^\.?\//, '');
    const lower = t.toLowerCase();
    const isFile = /\.[a-z0-9]{2,5}$/i.test(lower) && !lower.endsWith('.md');
    if (isFile) {
      const file = attachmentsByPath.get(lower) || attachments.get(lower.split('/').pop());
      return file ? { kind: 'file', url: file, title: t } : null;
    }
    const key = lower.replace(/\.md$/, '');
    const page = byPath.get(key) || byName.get(key.split('/').pop());
    return page ? { kind: 'page', page, url: page.url, title: page.title } : null;
  };
  const tagUrl = (tag) => `${base}tags/${slugify(tag)}/`;

  const md = createMarkdown({ resolve, tagUrl });

  // ---------- 3. Markdown renderen ----------
  for (const p of pages) {
    const env = { links: new Set(), tags: new Set(), animaties: new Set(), broken: [], toc: [] };
    p.html = md.render(p.body, env)
      // Obsidian-takenlijstjes: - [ ] en - [x]
      .replace(/<li>\[( |x|X)\] ?/g, (_m, x) => `<li class="taak"><input type="checkbox" disabled${x.trim() ? ' checked' : ''}> `);
    p.env = env;
    for (const t of env.tags) if (!p.tags.includes(t)) p.tags.push(t);
    p.text = stripHtml(p.html);
    p.leestijd = Math.max(1, Math.round(p.text.split(' ').length / 200));
    for (const b of env.broken) warnings.push(`${p.rel}: link naar “${b}” bestaat niet`);
  }

  // Backlinks
  const byId = new Map(pages.map((p) => [p.id, p]));
  for (const p of pages) p.backlinks = [];
  for (const p of pages) {
    for (const id of p.env.links) {
      const target = byId.get(id);
      if (target && target !== p && !target.backlinks.includes(p)) target.backlinks.push(p);
    }
  }

  // ---------- 4. Navigatieboom ----------
  const tree = buildTree(pages, base);
  const flat = [];
  (function flatten(nodes) {
    for (const n of nodes) {
      if (n.type === 'map') {
        if (n.page) flat.push(n.page);
        flatten(n.children);
      } else flat.push(n.page);
    }
  })(tree);

  const markCurrent = (nodes, id) => {
    let found = false;
    for (const n of nodes) {
      if (n.type === 'map') {
        n.containsCurrent = markCurrent(n.children, id) || (n.page && n.page.id === id);
        if (n.containsCurrent) found = true;
      } else if (n.page.id === id) found = true;
    }
    return found;
  };

  const folderMap = new Map(); // "Map/Sub" → node
  (function index(nodes) {
    for (const n of nodes) if (n.type === 'map') (folderMap.set(n.path, n), index(n.children));
  })(tree);

  const write = async (outFile, html) => {
    const dest = path.join(OUT, outFile);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, html);
  };

  const pageShell = (page, bodyHtml, opts = {}) =>
    layout({
      site: SITE,
      base,
      page,
      body: bodyHtml,
      nav: tree,
      currentId: page.id,
      toc: opts.toc || [],
      scripts: { animaties: opts.animaties },
      description: opts.description,
    });

  const breadcrumbsFor = (p) => {
    const crumbs = [{ title: 'Start', url: base }];
    const dirs = p.isFolderNote ? p.dirs.slice(0, -1) : p.dirs;
    for (let i = 0; i < dirs.length; i++) {
      const node = folderMap.get(dirs.slice(0, i + 1).join('/'));
      crumbs.push({ title: node?.title || dirs[i], url: node?.url });
    }
    return crumbs;
  };

  // ---------- 5. Pagina's schrijven ----------
  const recent = [...pages].filter((p) => !p.isHome).sort((a, b) => (a.updated < b.updated ? 1 : -1));
  const animPages = pages.filter((p) => p.env.animaties.size > 0 && !p.isHome);

  for (const p of pages) {
    markCurrent(tree, p.id);
    if (p.isHome) {
      await write(p.outFile, pageShell(p, renderHome(p, tree, animPages, recent.slice(0, 6), base), { animaties: p.env.animaties.size > 0 }));
      continue;
    }
    let html = p.html;
    if (p.isFolderNote) {
      const node = folderMap.get(p.dirs.join('/'));
      if (node) html += folderListing(node);
    }
    const i = flat.indexOf(p);
    const body = artikel({
      page: p,
      html,
      breadcrumbs: breadcrumbsFor(p),
      backlinks: p.backlinks.filter((b) => !b.isHome),
      prevNext: { prev: flat[i - 1], next: flat[i + 1] },
      tagUrl,
    });
    await write(p.outFile, pageShell(p, body, { toc: p.env.toc, animaties: p.env.animaties.size > 0 }));
  }

  // Automatische overzichtspagina's voor mappen zonder eigen mapnotitie
  for (const node of folderMap.values()) {
    if (node.page) continue;
    const fake = { id: '__map:' + node.path, title: node.title, tags: [], dirs: node.path.split('/'), isFolderNote: true, url: node.url };
    markCurrent(tree, fake.id);
    const body = artikel({ page: fake, html: folderListing(node), breadcrumbs: breadcrumbsFor(fake), backlinks: [], prevNext: {}, tagUrl });
    await write(node.url.slice(base.length) + 'index.html', pageShell(fake, body));
  }

  // Interactieve modules
  {
    markCurrent(tree, '__interactief');
    const fake = { id: '__interactief', title: 'Interactieve modules', icoon: '✨', tags: [], dirs: [], description: 'Leer door te doen: alle animaties en simulaties op een rij.' };
    let html = '';
    for (const a of ANIMATIES) {
      const gebruikt = animPages.filter((p) => p.env.animaties.has(a.naam));
      html += `<h2 id="${a.naam}">${a.icoon} ${escapeHtml(a.titel)}</h2><p>${escapeHtml(a.beschrijving)}</p>
<${a.element}></${a.element}>
${gebruikt.length ? `<p class="gebruikt-in">Meer uitleg: ${gebruikt.map((p) => `<a href="${p.url}">${escapeHtml(p.title)}</a>`).join(', ')}</p>` : ''}`;
    }
    const body = artikel({ page: fake, html, breadcrumbs: [{ title: 'Start', url: base }], backlinks: [], prevNext: {}, tagUrl });
    await write('interactief/index.html', pageShell(fake, body, { animaties: true, toc: ANIMATIES.map((a) => ({ id: a.naam, text: a.titel, level: 2 })) }));
  }

  // Tags
  const tagIndex = new Map();
  for (const p of pages) for (const t of p.tags) (tagIndex.get(t) || tagIndex.set(t, []).get(t)).push(p);
  {
    markCurrent(tree, '__tags');
    const fake = { id: '__tags', title: 'Tags', icoon: '🏷️', tags: [], dirs: [] };
    const sorted = [...tagIndex.entries()].sort((a, b) => a[0].localeCompare(b[0], 'nl'));
    const html = sorted.length
      ? `<div class="tagwolk">${sorted.map(([t, ps]) => `<a class="tag" href="${tagUrl(t)}">#${escapeHtml(t)} <small>${ps.length}</small></a>`).join('')}</div>`
      : '<p>Er zijn nog geen tags.</p>';
    await write('tags/index.html', pageShell(fake, artikel({ page: fake, html, breadcrumbs: [{ title: 'Start', url: base }], backlinks: [], prevNext: {}, tagUrl })));
    for (const [t, ps] of sorted) {
      const f = { id: '__tag:' + t, title: '#' + t, tags: [], dirs: [], description: `${ps.length} pagina${ps.length === 1 ? '' : "'s"} met deze tag` };
      const body = artikel({ page: f, html: kaartLijst(ps.sort((a, b) => a.title.localeCompare(b.title, 'nl'))), breadcrumbs: [{ title: 'Start', url: base }, { title: 'Tags', url: base + 'tags/' }], backlinks: [], prevNext: {}, tagUrl });
      await write(`tags/${slugify(t)}/index.html`, pageShell(f, body));
    }
  }

  // 404
  {
    markCurrent(tree, '__404');
    const fake = { id: '__404', title: 'Pagina niet gevonden', tags: [], dirs: [] };
    const html = `<p>Deze pagina bestaat niet (meer). Gebruik de zoekfunctie of ga terug naar de <a href="${base}">startpagina</a>.</p>`;
    await write('404.html', pageShell(fake, artikel({ page: fake, html, breadcrumbs: [{ title: 'Start', url: base }], backlinks: [], prevNext: {}, tagUrl })));
  }

  // Zoekindex
  const index = pages.map((p) => ({
    t: p.title,
    u: p.url,
    d: p.description,
    p: p.dirs.join(' › '),
    g: p.tags,
    a: p.aliases,
    x: p.text.slice(0, 8000),
  }));
  await write('zoekindex.json', JSON.stringify(index));

  // Statische bestanden
  await fs.cp(ASSETS, path.join(OUT, 'assets'), { recursive: true });
  await fs.writeFile(path.join(OUT, '.nojekyll'), '');

  if (!pages.some((p) => p.isHome)) warnings.push('Er is geen Startpagina.md in de hoofdmap van /inhoud.');
  for (const w of warnings) log('  ⚠️  ' + w);
  log(`✔ ${pages.length} pagina's gebouwd in ${Date.now() - t0} ms → dist/ (basis: ${base})`);
  return { pages: pages.length, warnings };
}

// ---------------------------------------------------------------------------

function renderHome(p, tree, animPages, recent, base) {
  const mappen = tree.filter((n) => n.type === 'map');
  const usedAnims = ANIMATIES.map((a) => ({ a, page: animPages.find((pg) => pg.env.animaties.has(a.naam)) }));
  return `<section class="hero">
  <div class="hero-tekst">
    <p class="hero-label">Kennisbank anesthesiologie</p>
    <h1>${escapeHtml(p.fm.kop || 'Anesthesiologie, logisch uitgelegd.')}</h1>
    <p class="hero-intro">${escapeHtml(p.description || SITE.beschrijving)}</p>
    <button class="hero-zoek" type="button" data-zoek-open><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Zoek bijvoorbeeld “propofol” of “capnografie”</span><kbd>Ctrl K</kbd></button>
  </div>
  <div class="hero-visual" aria-hidden="true">
    <svg viewBox="0 0 400 220" class="hero-ecg">
      <defs><linearGradient id="hg" x1="0" x2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity="0"/><stop offset=".3" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/></linearGradient></defs>
      <path class="hero-lijn" d="M0 130 H60 l10 -12 l10 12 H110 l8 10 l14 -100 l14 120 l10 -30 H200 q20 -30 40 0 H270 l10 -12 l10 12 H320 l8 10 l14 -100 l14 120 l10 -30 H400" fill="none" stroke="url(#hg)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>
</section>
${
  mappen.length
    ? `<section class="home-sectie"><h2>Onderwerpen</h2><div class="kaarten">${mappen
        .map(
          (n) => `<a class="kaart" href="${n.url}">
      <span class="kaart-icoon">${escapeHtml(n.icoon || '📁')}</span>
      <strong>${escapeHtml(n.title)}</strong>
      ${n.description ? `<span>${escapeHtml(n.description)}</span>` : ''}
      <small>${countPages(n)} pagina${countPages(n) === 1 ? '' : "'s"}</small>
    </a>`,
        )
        .join('')}</div></section>`
    : ''
}
<section class="home-sectie"><h2>Interactief leren</h2><p class="sectie-intro">Geen droge theorie: zie wat er gebeurt op de monitor, in het hart en tijdens de inductie.</p>
  <div class="kaarten anim-kaarten">${usedAnims
    .map(
      ({ a, page }) => `<a class="kaart anim-kaart" href="${page ? page.url : base + 'interactief/#' + a.naam}">
    <span class="kaart-icoon">${a.icoon}</span><strong>${escapeHtml(a.titel)}</strong><span>${escapeHtml(a.beschrijving)}</span><small>Probeer het →</small></a>`,
    )
    .join('')}</div>
</section>
<section class="home-sectie home-grid">
  <div class="prose">${p.html}</div>
  <aside class="recent"><h2>Recent bijgewerkt</h2><ul>${recent
    .map((r) => `<li><a href="${r.url}">${escapeHtml(r.title)}</a><span>${formatDatum(r.updated)}</span></li>`)
    .join('')}</ul></aside>
</section>`;
}

function countPages(node) {
  return node.children.reduce((n, c) => n + (c.type === 'map' ? countPages(c) + (c.page ? 1 : 0) : 1), 0);
}

function folderListing(node) {
  const items = node.children.map((c) =>
    c.type === 'map'
      ? { url: c.url, title: c.title, description: c.description, icoon: c.icoon || '📁' }
      : { url: c.page.url, title: c.page.title, description: c.page.description, icoon: c.page.icoon },
  );
  if (!items.length) return '';
  return `<h2 id="in-deze-map">In dit onderdeel</h2>${kaartLijst(items)}`;
}

function buildTree(pages, base) {
  const root = { children: [] };
  const folders = new Map([['', root]]);
  const getFolder = (dirs) => {
    const key = dirs.join('/');
    if (folders.has(key)) return folders.get(key);
    const parent = getFolder(dirs.slice(0, -1));
    const node = {
      type: 'map',
      path: key,
      title: dirs[dirs.length - 1],
      url: base + dirs.map(slugify).join('/') + '/',
      children: [],
      order: 999,
    };
    parent.children.push(node);
    folders.set(key, node);
    return node;
  };
  for (const p of pages) {
    if (p.isHome) continue;
    if (p.isFolderNote) {
      const f = getFolder(p.dirs);
      f.page = p;
      f.title = p.title;
      f.icoon = p.icoon;
      f.description = p.description;
      f.order = p.order;
    } else {
      getFolder(p.dirs).children.push({ type: 'pagina', page: p, order: p.order, title: p.title });
    }
  }
  const sort = (nodes) => {
    nodes.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'nl'));
    for (const n of nodes) if (n.children) sort(n.children);
  };
  sort(root.children);
  return root.children;
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(abs)));
    else out.push(abs);
  }
  return out;
}

function parseFrontmatter(raw, rel, warnings) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return { data: {}, content: raw };
  try {
    const data = YAML.parse(m[1]) || {};
    return { data: typeof data === 'object' ? data : {}, content: raw.slice(m[0].length) };
  } catch (e) {
    // Vergevingsgezinde terugval voor eenvoudige "sleutel: waarde"-regels
    const data = {};
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^([\w-]+):\s*(.*)$/.exec(line);
      if (!kv) continue;
      let v = kv[2].trim().replace(/^["']|["']$/g, '');
      if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      else if (v === 'true' || v === 'false') v = v === 'true';
      data[kv[1]] = v;
    }
    warnings.push(`${rel}: de eigenschappen bovenaan bevatten een opmaakfout (tip: zet tekst met een dubbele punt tussen "aanhalingstekens")`);
    return { data, content: raw.slice(m[0].length) };
  }
}

function toList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  return String(v)
    .split(/[,\s]+/)
    .filter(Boolean);
}

function readGitDates() {
  const map = new Map();
  try {
    const out = execFileSync('git', ['-c', 'core.quotepath=off', 'log', '--format=%x00%cI', '--name-only', '--', 'inhoud'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let date = null;
    for (const line of out.split('\n')) {
      if (line.startsWith('\0')) date = line.slice(1);
      else if (line && date && !map.has(line)) map.set(line, date);
    }
  } catch {
    /* geen git beschikbaar: dan gebruiken we de bestandsdatum */
  }
  return map;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
