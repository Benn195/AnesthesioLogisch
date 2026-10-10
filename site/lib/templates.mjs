import { escapeHtml, formatDatum } from './util.mjs';

const ICONS = {
  zoek: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  thema: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
};

export function logo(base) {
  return `<a class="logo" href="${base}" aria-label="AnesthesioLogisch – naar de startpagina">
  <svg class="logo-mark" viewBox="0 0 40 40" aria-hidden="true">
    <rect x="1" y="1" width="38" height="38" rx="11" fill="var(--accent)"/>
    <path d="M6 22h7l3-8 5 15 4-11 2 4h7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <span class="logo-tekst">Anesthesio<strong>Logisch</strong></span>
</a>`;
}

function renderNav(nodes, currentId, depth = 0) {
  return `<ul class="nav-lijst${depth ? ' sub' : ''}">${nodes
    .map((n) => {
      if (n.type === 'map') {
        const open = n.containsCurrent ? ' open' : '';
        const actief = n.page && n.page.id === currentId ? ' aria-current="page"' : '';
        return `<li class="nav-map"><details${open}><summary><span class="nav-map-naam">${n.icoon ? `<span class="nav-icoon">${escapeHtml(n.icoon)}</span>` : ''}${escapeHtml(n.title)}</span></summary>
        ${n.url ? `<a class="nav-overzicht" href="${n.url}"${actief}>Overzicht</a>` : ''}
        ${renderNav(n.children, currentId, depth + 1)}</details></li>`;
      }
      const actief = n.page.id === currentId ? ' aria-current="page"' : '';
      return `<li><a href="${n.page.url}"${actief}>${escapeHtml(n.page.title)}</a></li>`;
    })
    .join('')}</ul>`;
}

export function layout(o) {
  const { site, base, page, body, nav, currentId, toc = [], scripts = {}, description } = o;
  const title = page.isHome ? `${site.naam} – ${site.slogan}` : `${page.title} · ${site.naam}`;
  const desc = description || page.description || site.beschrijving;
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta name="theme-color" content="#0f766e">
<link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${base}assets/style.css?v=${site.versie}">
<script>
  // Thema zo vroeg mogelijk zetten om 'flitsen' te voorkomen
  try { const t = localStorage.getItem('al-thema'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
  window.AL_BASE = ${JSON.stringify(base)};
</script>
<script src="${base}assets/app.js?v=${site.versie}" defer></script>
${scripts.animaties ? `<script src="${base}assets/animaties.js?v=${site.versie}" defer></script>` : ''}
</head>
<body class="${page.isHome ? 'is-home' : 'is-pagina'}">
<a class="skip" href="#inhoud">Naar de inhoud</a>
<header class="topbalk">
  <button class="icoonknop nav-knop" type="button" aria-label="Menu openen" aria-expanded="false" aria-controls="zijbalk">${ICONS.menu}</button>
  ${logo(base)}
  <button class="zoek-knop" type="button" data-zoek-open aria-label="Zoeken">${ICONS.zoek}<span>Zoeken…</span><kbd>Ctrl K</kbd></button>
  <button class="icoonknop thema-knop" type="button" aria-label="Licht/donker thema wisselen">${ICONS.thema}</button>
</header>
<div class="schil">
  <nav id="zijbalk" class="zijbalk" aria-label="Hoofdnavigatie">
    <a class="nav-home" href="${base}"${page.isHome ? ' aria-current="page"' : ''}>🏠 Startpagina</a>
    ${renderNav(nav, currentId)}
    <div class="nav-extra">
      <a href="${base}interactief/">✨ Interactieve modules</a>
      <a href="${base}tags/">🏷️ Alle tags</a>
    </div>
  </nav>
  <div class="nav-scrim" hidden></div>
  <main id="inhoud" class="hoofd${toc.length > 1 ? ' met-toc' : ''}">
    ${body}
  </main>
  ${
    toc.length > 1
      ? `<aside class="toc" aria-label="Op deze pagina"><p class="toc-titel">Op deze pagina</p><ul>${toc
          .map((t) => `<li class="toc-l${t.level}"><a href="#${t.id}">${escapeHtml(t.text)}</a></li>`)
          .join('')}</ul></aside>`
      : ''
  }
</div>
<footer class="voet">
  <div class="voet-binnen">
    <div>${logo(base)}<p>${escapeHtml(site.beschrijving)}</p></div>
    <p class="disclaimer"><strong>Disclaimer:</strong> ${escapeHtml(site.disclaimer)}</p>
  </div>
</footer>
<div class="zoek-modal" hidden role="dialog" aria-modal="true" aria-label="Zoeken">
  <div class="zoek-paneel">
    <div class="zoek-invoer">${ICONS.zoek}<input type="search" placeholder="Zoek op onderwerp, medicijn, begrip…" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>
    <ul class="zoek-resultaten" role="listbox"></ul>
  </div>
</div>
</body>
</html>`;
}

export function artikel(o) {
  const { page, html, breadcrumbs, backlinks, prevNext, tagUrl } = o;
  const tags = page.tags.length
    ? `<div class="tags">${page.tags.map((t) => `<a class="tag" href="${tagUrl(t)}">#${escapeHtml(t)}</a>`).join('')}</div>`
    : '';
  return `<article class="artikel">
  <nav class="kruimels" aria-label="Kruimelpad">${breadcrumbs
    .map((b) => (b.url ? `<a href="${b.url}">${escapeHtml(b.title)}</a>` : `<span>${escapeHtml(b.title)}</span>`))
    .join('<span class="sep">/</span>')}</nav>
  <header class="artikel-kop">
    <h1>${page.icoon ? `<span class="titel-icoon">${escapeHtml(page.icoon)}</span>` : ''}${escapeHtml(page.title)}</h1>
    ${page.description ? `<p class="intro">${escapeHtml(page.description)}</p>` : ''}
    <div class="meta">${page.updated ? `<span>Bijgewerkt ${formatDatum(page.updated)}</span>` : ''}${page.leestijd ? `<span>${page.leestijd} min lezen</span>` : ''}${page.auteur ? `<span>Door ${escapeHtml(page.auteur)}</span>` : ''}</div>
    ${tags}
  </header>
  <div class="prose">
${html}
  </div>
  ${
    backlinks.length
      ? `<section class="backlinks"><h2>Gelinkt vanuit</h2><ul>${backlinks
          .map((p) => `<li><a href="${p.url}">${escapeHtml(p.title)}</a>${p.description ? `<span>${escapeHtml(p.description)}</span>` : ''}</li>`)
          .join('')}</ul></section>`
      : ''
  }
  ${
    prevNext.prev || prevNext.next
      ? `<nav class="vorige-volgende">${
          prevNext.prev ? `<a class="vv-vorige" href="${prevNext.prev.url}"><span>← Vorige</span>${escapeHtml(prevNext.prev.title)}</a>` : '<span></span>'
        }${prevNext.next ? `<a class="vv-volgende" href="${prevNext.next.url}"><span>Volgende →</span>${escapeHtml(prevNext.next.title)}</a>` : ''}</nav>`
      : ''
  }
</article>`;
}

export function kaartLijst(pages) {
  return `<div class="kaarten">${pages
    .map(
      (p) => `<a class="kaart" href="${p.url}">
  ${p.icoon ? `<span class="kaart-icoon">${escapeHtml(p.icoon)}</span>` : ''}
  <strong>${escapeHtml(p.title)}</strong>
  ${p.description ? `<span>${escapeHtml(p.description)}</span>` : ''}
</a>`,
    )
    .join('')}</div>`;
}
