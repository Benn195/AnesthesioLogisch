// Markdown-verwerking met ondersteuning voor de belangrijkste Obsidian-features:
// [[wikilinks]], ![[embeds]], callouts (> [!tip]), #tags, ==markeringen==,
// voetnoten, mermaid-diagrammen en de eigen blokken ```animatie en ```quiz.
import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import mark from 'markdown-it-mark';
import { escapeHtml, slugify } from './util.mjs';
import { ANIMATIES } from './animaties.mjs';

const CALLOUTS = {
  note: { icon: '📝', label: 'Notitie' },
  abstract: { icon: '📋', label: 'Samenvatting', alias: ['summary', 'tldr', 'samenvatting'] },
  info: { icon: 'ℹ️', label: 'Info' },
  todo: { icon: '☑️', label: 'Te doen' },
  tip: { icon: '💡', label: 'Tip', alias: ['hint', 'important', 'parel'] },
  success: { icon: '✅', label: 'Goed', alias: ['check', 'done'] },
  question: { icon: '❓', label: 'Vraag', alias: ['help', 'faq', 'vraag'] },
  warning: { icon: '⚠️', label: 'Let op', alias: ['caution', 'attention', 'let-op', 'letop'] },
  failure: { icon: '❌', label: 'Fout', alias: ['fail', 'missing'] },
  danger: { icon: '🚨', label: 'Gevaar', alias: ['error', 'gevaar'] },
  bug: { icon: '🐞', label: 'Bug' },
  example: { icon: '🧪', label: 'Voorbeeld', alias: ['voorbeeld'] },
  quote: { icon: '❝', label: 'Citaat', alias: ['cite', 'citaat'] },
  dosering: { icon: '💉', label: 'Dosering', alias: ['dosis'] },
  klinisch: { icon: '🩺', label: 'In de praktijk', alias: ['praktijk', 'kliniek'] },
};
const CALLOUT_ALIAS = {};
for (const [type, def] of Object.entries(CALLOUTS)) {
  CALLOUT_ALIAS[type] = type;
  for (const a of def.alias || []) CALLOUT_ALIAS[a] = type;
}

/**
 * @param {object} ctx
 * @param {(target:string)=>({url:string,title:string,kind:'page'|'file',page?:object}|null)} ctx.resolve
 * @param {(tag:string)=>string} ctx.tagUrl
 */
export function createMarkdown(ctx) {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
  md.use(footnote).use(mark);

  // ---------- [[wikilinks]] en ![[embeds]] ----------
  md.inline.ruler.before('link', 'wikilink', (state, silent) => {
    const src = state.src;
    let pos = state.pos;
    let embed = false;
    if (src.charCodeAt(pos) === 0x21 /* ! */) {
      embed = true;
      pos++;
    }
    if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false;
    const end = src.indexOf(']]', pos + 2);
    if (end < 0) return false;
    const inner = src.slice(pos + 2, end);
    if (!inner || inner.includes('\n')) return false;
    if (!silent) {
      const token = state.push(embed ? 'wiki_embed' : 'wikilink', '', 0);
      token.content = inner;
    }
    state.pos = end + 2;
    return true;
  });

  const parseWiki = (inner) => {
    const [targetPart, ...aliasParts] = inner.split('|');
    const alias = aliasParts.join('|').trim();
    const [target, ...hashParts] = targetPart.split('#');
    return { target: target.trim(), heading: hashParts.join('#').trim(), alias };
  };

  md.renderer.rules.wikilink = (tokens, idx, _opts, env) => {
    const { target, heading, alias } = parseWiki(tokens[idx].content);
    const anchor = heading ? '#' + slugify(heading.replace(/^\^/, '')) : '';
    if (!target) {
      return `<a href="${anchor}">${escapeHtml(alias || heading)}</a>`;
    }
    const hit = ctx.resolve(target);
    const text = alias || (heading ? `${hit?.title || target} › ${heading}` : hit?.title || target);
    if (!hit) {
      env.broken?.push(target);
      return `<span class="link-ontbreekt" title="Deze pagina bestaat (nog) niet">${escapeHtml(text)}</span>`;
    }
    if (hit.page) env.links?.add(hit.page.id);
    return `<a class="intern" href="${hit.url}${anchor}">${escapeHtml(text)}</a>`;
  };

  md.renderer.rules.wiki_embed = (tokens, idx, _opts, env) => {
    const { target, heading, alias } = parseWiki(tokens[idx].content);
    const hit = ctx.resolve(target);
    if (!hit) {
      env.broken?.push(target);
      return `<span class="link-ontbreekt" title="Bestand niet gevonden">${escapeHtml(target)}</span>`;
    }
    if (hit.kind === 'file') {
      const ext = target.split('.').pop().toLowerCase();
      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'].includes(ext)) {
        // ![[foto.png|300]] of ![[foto.png|300x200]] of ![[foto.png|bijschrift]]
        let attrs = '';
        let alt = target.replace(/\.[^.]+$/, '');
        const size = alias.match(/^(\d+)(?:x(\d+))?$/);
        if (size) attrs = ` width="${size[1]}"${size[2] ? ` height="${size[2]}"` : ''}`;
        else if (alias) alt = alias;
        return `<img src="${hit.url}" alt="${escapeHtml(alt)}" loading="lazy"${attrs}>`;
      }
      if (['mp4', 'webm', 'mov'].includes(ext)) {
        return `<video src="${hit.url}" controls preload="metadata"></video>`;
      }
      if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
        return `<audio src="${hit.url}" controls preload="metadata"></audio>`;
      }
      if (ext === 'pdf') {
        return `<a class="bestand" href="${hit.url}" target="_blank" rel="noopener">📄 ${escapeHtml(alias || target)}</a>`;
      }
      return `<a class="bestand" href="${hit.url}">📎 ${escapeHtml(alias || target)}</a>`;
    }
    // Ingesloten notitie → nette verwijzingskaart
    env.links?.add(hit.page.id);
    const anchor = heading ? '#' + slugify(heading) : '';
    return `<a class="embed-kaart" href="${hit.url}${anchor}"><span class="embed-label">Zie ook</span><strong>${escapeHtml(alias || hit.title)}</strong>${hit.page.description ? `<span>${escapeHtml(hit.page.description)}</span>` : ''}</a>`;
  };

  // ---------- #tags in lopende tekst ----------
  md.inline.ruler.after('wikilink', 'hashtag', (state, silent) => {
    const src = state.src;
    const pos = state.pos;
    if (src.charCodeAt(pos) !== 0x23 /* # */) return false;
    if (pos > 0 && !/\s|\(/.test(src[pos - 1])) return false;
    const m = /^#([\p{L}_][\p{L}\p{N}_\-/]*)/u.exec(src.slice(pos));
    if (!m) return false;
    if (!silent) {
      const t = state.push('hashtag', '', 0);
      t.content = m[1];
    }
    state.pos += m[0].length;
    return true;
  });
  md.renderer.rules.hashtag = (tokens, idx, _o, env) => {
    const tag = tokens[idx].content;
    env.tags?.add(tag.toLowerCase());
    return `<a class="tag" href="${ctx.tagUrl(tag)}">#${escapeHtml(tag)}</a>`;
  };

  // ---------- Kopjes krijgen een id (voor inhoudsopgave en [[Pagina#Kop]]) ----------
  md.core.ruler.push('heading_ids', (state) => {
    if (state.inlineMode) return; // renderInline() mag de inhoudsopgave niet overschrijven
    const used = new Map();
    const toc = [];
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type !== 'heading_open') continue;
      const inline = tokens[i + 1];
      const text = inline.children
        .filter((c) => ['text', 'code_inline', 'wikilink', 'hashtag'].includes(c.type))
        .map((c) => (c.type === 'wikilink' ? parseWiki(c.content).alias || parseWiki(c.content).target : c.content))
        .join('');
      let id = slugify(text) || 'kop';
      const n = used.get(id) || 0;
      used.set(id, n + 1);
      if (n) id = `${id}-${n}`;
      t.attrSet('id', id);
      const level = Number(t.tag.slice(1));
      if (level >= 2 && level <= 3) toc.push({ id, text, level });
    }
    if (state.env) state.env.toc = toc;
  });
  md.renderer.rules.heading_open = (tokens, idx, opts, env, self) => {
    const t = tokens[idx];
    const id = t.attrGet('id');
    return `<${t.tag} id="${id}"><a class="kop-anker" href="#${id}" aria-hidden="true" tabindex="-1">#</a>`;
  };

  // ---------- Callouts: > [!tip] Titel ----------
  md.core.ruler.after('block', 'callouts', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') continue;
      // eerste inline-token binnen dit citaat
      const pOpen = tokens[i + 1];
      const inline = tokens[i + 2];
      if (!pOpen || pOpen.type !== 'paragraph_open' || !inline || inline.type !== 'inline') continue;
      const m = /^\[!([\w-]+)\]([+-]?)[ \t]*([^\n]*)\n?/.exec(inline.content);
      if (!m) continue;
      const rawType = m[1].toLowerCase();
      const type = CALLOUT_ALIAS[rawType] || 'note';
      const fold = m[2];
      const title = m[3].trim() || CALLOUTS[type].label;
      tokens[i].meta = { callout: { type, fold, title, icon: CALLOUTS[type].icon } };
      inline.content = inline.content.slice(m[0].length);
      if (!inline.content.trim()) {
        // lege alinea weghalen
        pOpen.hidden = true;
        tokens[i + 3].hidden = true;
        inline.content = '';
      }
      // bijbehorende sluit-token markeren
      let depth = 0;
      for (let j = i; j < tokens.length; j++) {
        if (tokens[j].type === 'blockquote_open') depth++;
        if (tokens[j].type === 'blockquote_close' && --depth === 0) {
          tokens[j].meta = { callout: tokens[i].meta.callout };
          break;
        }
      }
    }
  });
  md.renderer.rules.blockquote_open = (tokens, idx, opts, env, self) => {
    const c = tokens[idx].meta?.callout;
    if (!c) return '<blockquote>\n';
    const titleHtml = md.renderInline(c.title, env);
    const head = `<span class="callout-icoon" aria-hidden="true">${c.icon}</span><span class="callout-titel">${titleHtml}</span>`;
    if (c.fold) {
      return `<details class="callout callout-${c.type}"${c.fold === '+' ? ' open' : ''}><summary class="callout-kop">${head}</summary><div class="callout-inhoud">\n`;
    }
    return `<div class="callout callout-${c.type}"><div class="callout-kop">${head}</div><div class="callout-inhoud">\n`;
  };
  md.renderer.rules.blockquote_close = (tokens, idx) => {
    const c = tokens[idx].meta?.callout;
    if (!c) return '</blockquote>\n';
    return c.fold ? '</div></details>\n' : '</div></div>\n';
  };

  // ---------- Afbeeldingen met relatieve paden (standaard markdown-syntax) ----------
  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, opts, env, self) => {
    const t = tokens[idx];
    const src = t.attrGet('src') || '';
    if (!/^(https?:|data:|\/)/.test(src)) {
      const hit = ctx.resolve(decodeURIComponent(src));
      if (hit) t.attrSet('src', hit.url);
    }
    t.attrSet('loading', 'lazy');
    return defaultImage(tokens, idx, opts, env, self);
  };

  // Markdown-links naar andere .md-bestanden ([tekst](Map/Pagina.md)) omzetten
  const defaultLinkOpen =
    md.renderer.rules.link_open || ((tokens, idx, opts, env, self) => self.renderToken(tokens, idx, opts));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const t = tokens[idx];
    const href = t.attrGet('href') || '';
    if (/^https?:/.test(href)) {
      t.attrSet('target', '_blank');
      t.attrSet('rel', 'noopener');
      t.attrJoin('class', 'extern');
    } else if (href && !href.startsWith('#') && !/^[a-z]+:/i.test(href)) {
      const [p, hash] = href.split('#');
      const hit = ctx.resolve(decodeURIComponent(p).replace(/\.md$/i, ''));
      if (hit) {
        t.attrSet('href', hit.url + (hash ? '#' + slugify(hash) : ''));
        t.attrJoin('class', 'intern');
        if (hit.page) env.links?.add(hit.page.id);
      }
    }
    return defaultLinkOpen(tokens, idx, opts, env, self);
  };

  // ---------- Codeblokken: animatie, quiz, mermaid ----------
  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
    const t = tokens[idx];
    const lang = t.info.trim().split(/\s+/)[0].toLowerCase();
    if (lang === 'animatie' || lang === 'animation') return renderAnimatie(t.content, env);
    if (lang === 'quiz') return renderQuiz(t.content, md, env);
    if (lang === 'mermaid') {
      env.mermaid = true;
      return `<pre class="mermaid">${escapeHtml(t.content)}</pre>\n`;
    }
    return defaultFence(tokens, idx, opts, env, self);
  };

  return md;
}

function renderAnimatie(content, env) {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const naam = (lines.shift() || '').toLowerCase();
  const def = ANIMATIES.find((a) => a.naam === naam || a.alias.includes(naam));
  if (!def) {
    const bekend = ANIMATIES.map((a) => a.naam).join(', ');
    return `<div class="callout callout-warning"><div class="callout-kop"><span class="callout-icoon">⚠️</span><span class="callout-titel">Onbekende animatie: “${escapeHtml(naam)}”</span></div><div class="callout-inhoud"><p>Beschikbare animaties: ${escapeHtml(bekend)}.</p></div></div>`;
  }
  env.animaties?.add(def.naam);
  const attrs = [];
  for (const l of lines) {
    const m = /^([\w-]+)\s*[:=]\s*(.+)$/.exec(l);
    if (m && /^[\w-]+$/.test(m[1])) attrs.push(`${m[1].toLowerCase()}="${escapeHtml(m[2].trim())}"`);
  }
  return `<${def.element} ${attrs.join(' ')}><noscript>Deze interactieve animatie heeft JavaScript nodig.</noscript></${def.element}>\n`;
}

// ```quiz
// Vraag: Welke ...?
// - [ ] fout antwoord
// - [x] goed antwoord
// Uitleg: optionele toelichting
// ```
function renderQuiz(content, md, env) {
  const vragen = [];
  let cur = null;
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = /^(?:vraag|v|question|q)\s*:\s*(.+)$/i.exec(line))) {
      cur = { vraag: m[1], opties: [], uitleg: '' };
      vragen.push(cur);
    } else if ((m = /^[-*]\s*\[( |x|X)\]\s*(.+)$/.exec(line))) {
      if (!cur) vragen.push((cur = { vraag: '', opties: [], uitleg: '' }));
      cur.opties.push({ goed: m[1].toLowerCase() === 'x', tekst: m[2] });
    } else if ((m = /^(?:uitleg|toelichting|antwoord|explanation)\s*:\s*(.+)$/i.exec(line))) {
      if (cur) cur.uitleg = m[1];
    } else if (cur) {
      if (cur.opties.length === 0) cur.vraag += ' ' + line;
      else if (cur.uitleg) cur.uitleg += ' ' + line;
    }
  }
  if (!vragen.length) return '';
  env.quiz = true;
  const html = vragen
    .map((v, i) => {
      const meer = v.opties.filter((o) => o.goed).length > 1;
      return `<div class="quiz-vraag" data-meer="${meer ? 1 : 0}">
  <p class="quiz-tekst"><span class="quiz-nr">${vragen.length > 1 ? `Vraag ${i + 1}` : 'Test jezelf'}</span>${md.renderInline(v.vraag, env)}${meer ? ' <em class="quiz-hint">(meerdere antwoorden goed)</em>' : ''}</p>
  <ul class="quiz-opties">${v.opties
    .map((o) => `<li><button type="button" class="quiz-optie" data-goed="${o.goed ? 1 : 0}">${md.renderInline(o.tekst, env)}</button></li>`)
    .join('')}</ul>
  ${meer ? '<button type="button" class="quiz-check knop klein">Controleer</button>' : ''}
  <div class="quiz-uitleg" hidden>${v.uitleg ? md.renderInline(v.uitleg, env) : ''}</div>
</div>`;
    })
    .join('\n');
  return `<div class="quiz">${html}</div>\n`;
}
