// AnesthesioLogisch – algemene interactie: thema, menu, zoeken, inhoudsopgave, quiz, mermaid.
(() => {
  const BASE = window.AL_BASE || '/';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ---------- Thema ----------
  $('.thema-knop')?.addEventListener('click', () => {
    const root = document.documentElement;
    const nuDonker =
      root.dataset.theme === 'dark' ||
      (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = nuDonker ? 'light' : 'dark';
    try {
      localStorage.setItem('al-thema', root.dataset.theme);
    } catch (e) {}
    document.dispatchEvent(new CustomEvent('al-thema'));
  });

  // ---------- Mobiel menu ----------
  const navKnop = $('.nav-knop');
  const scrim = $('.nav-scrim');
  const zetNav = (open) => {
    document.body.classList.toggle('nav-open', open);
    navKnop?.setAttribute('aria-expanded', String(open));
    if (scrim) scrim.hidden = !open;
  };
  navKnop?.addEventListener('click', () => zetNav(!document.body.classList.contains('nav-open')));
  scrim?.addEventListener('click', () => zetNav(false));
  $('.zijbalk [aria-current="page"]')?.scrollIntoView({ block: 'center' });

  // ---------- Zoeken ----------
  const modal = $('.zoek-modal');
  const input = $('.zoek-modal input');
  const lijst = $('.zoek-resultaten');
  let index = null;
  let actief = 0;

  const norm = (s) =>
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  const esc = (s) => (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  async function laadIndex() {
    if (index) return index;
    const res = await fetch(BASE + 'zoekindex.json');
    const data = await res.json();
    index = data.map((d) => ({ ...d, _t: norm(d.t), _x: norm(d.x), _g: norm((d.g || []).join(' ') + ' ' + (d.a || []).join(' ')), _d: norm(d.d) }));
    return index;
  }

  function fragment(tekst, termen) {
    const n = norm(tekst);
    let pos = -1;
    for (const t of termen) {
      pos = n.indexOf(t);
      if (pos >= 0) break;
    }
    if (pos < 0) return esc(tekst.slice(0, 140)) + (tekst.length > 140 ? '…' : '');
    const start = Math.max(0, pos - 60);
    let s = (start ? '…' : '') + tekst.slice(start, start + 170) + '…';
    s = esc(s);
    for (const t of termen) {
      if (t.length < 2) continue;
      const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      s = s.replace(re, (m) => `<mark>${m}</mark>`);
    }
    return s;
  }

  function zoek(q) {
    const termen = norm(q).split(/\s+/).filter(Boolean);
    if (!termen.length || !index) return [];
    const res = [];
    for (const d of index) {
      let score = 0;
      let alles = true;
      for (const t of termen) {
        let s = 0;
        if (d._t === t) s += 60;
        if (d._t.startsWith(t)) s += 25;
        if (d._t.includes(t)) s += 20;
        if (d._g.includes(t)) s += 12;
        if (d._d.includes(t)) s += 8;
        const c = d._x.split(t).length - 1;
        if (c) s += Math.min(10, 2 + c);
        if (!s) alles = false;
        score += s;
      }
      if (alles && score) res.push({ d, score });
    }
    return res.sort((a, b) => b.score - a.score).slice(0, 12).map((r) => ({ ...r.d, frag: fragment(r.d.x, termen) }));
  }

  function toon(q) {
    const r = zoek(q);
    actief = 0;
    if (!q.trim()) {
      lijst.innerHTML = '<li class="zoek-leeg">Typ om te zoeken in alle pagina’s.</li>';
      return;
    }
    if (!r.length) {
      lijst.innerHTML = `<li class="zoek-leeg">Niets gevonden voor “${esc(q)}”.</li>`;
      return;
    }
    lijst.innerHTML = r
      .map(
        (d, i) => `<li><a href="${d.u}" class="${i === 0 ? 'actief' : ''}"><strong>${esc(d.t)}</strong>${d.p ? `<small>${esc(d.p)}</small>` : ''}<p>${d.frag}</p></a></li>`,
      )
      .join('');
  }

  function openZoek() {
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    input.value = '';
    toon('');
    input.focus();
    laadIndex().catch(() => {
      lijst.innerHTML = '<li class="zoek-leeg">Zoekindex kon niet geladen worden.</li>';
    });
  }
  function sluitZoek() {
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }
  $$('[data-zoek-open]').forEach((b) => b.addEventListener('click', openZoek));
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) sluitZoek();
  });
  input?.addEventListener('input', async () => {
    await laadIndex();
    toon(input.value);
  });
  input?.addEventListener('keydown', (e) => {
    const links = $$('a', lijst);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!links.length) return;
      links[actief]?.classList.remove('actief');
      actief = (actief + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links[actief].classList.add('actief');
      links[actief].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && links[actief]) {
      location.href = links[actief].href;
    }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName))) {
      e.preventDefault();
      openZoek();
    } else if (e.key === 'Escape') {
      if (modal && !modal.hidden) sluitZoek();
      zetNav(false);
    }
  });

  // ---------- Inhoudsopgave: actieve kop markeren ----------
  const tocLinks = $$('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const koppen = tocLinks.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
    const zichtbaar = new Set();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.isIntersecting ? zichtbaar.add(e.target) : zichtbaar.delete(e.target);
        let huidig = koppen.find((k) => zichtbaar.has(k));
        if (!huidig) huidig = [...koppen].reverse().find((k) => k.getBoundingClientRect().top < 120);
        tocLinks.forEach((a) => a.classList.toggle('actief', huidig && a.hash === '#' + huidig.id));
      },
      { rootMargin: '-70px 0px -60% 0px' },
    );
    koppen.forEach((k) => obs.observe(k));
  }

  // ---------- Quiz ----------
  $$('.quiz-vraag').forEach((v) => {
    const meer = v.dataset.meer === '1';
    const opties = $$('.quiz-optie', v);
    const uitleg = $('.quiz-uitleg', v);
    const afronden = (goed) => {
      opties.forEach((o) => {
        o.disabled = true;
        if (o.dataset.goed === '1') o.classList.add('goed');
        else if (o.classList.contains('gekozen')) o.classList.add('fout');
      });
      const uitslag = `<span class="uitslag" style="color:var(${goed ? '--groen' : '--rood'})">${goed ? 'Goed!' : 'Helaas.'}</span>`;
      uitleg.innerHTML = uitslag + uitleg.innerHTML;
      uitleg.hidden = false;
      const check = $('.quiz-check', v);
      if (check) check.remove();
    };
    opties.forEach((o) =>
      o.addEventListener('click', () => {
        if (meer) {
          o.classList.toggle('gekozen');
        } else {
          o.classList.add('gekozen');
          afronden(o.dataset.goed === '1');
        }
      }),
    );
    $('.quiz-check', v)?.addEventListener('click', () => {
      const goed = opties.every((o) => (o.dataset.goed === '1') === o.classList.contains('gekozen'));
      afronden(goed);
    });
  });

  // ---------- Mermaid-diagrammen (alleen laden als ze op de pagina staan) ----------
  if (document.querySelector('pre.mermaid')) {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
    s.onload = () => {
      const donker =
        document.documentElement.dataset.theme === 'dark' ||
        (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      window.mermaid.initialize({ startOnLoad: false, theme: donker ? 'dark' : 'neutral', securityLevel: 'strict', fontFamily: 'inherit' });
      window.mermaid.run({ querySelector: 'pre.mermaid' });
    };
    document.head.appendChild(s);
  }
})();
