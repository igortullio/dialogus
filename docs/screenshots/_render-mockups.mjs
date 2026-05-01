// Renders six mockup screenshots for Feature 004 (Chat UI) closure docs.
// These are visual placeholders shipped with task_15 to populate the README
// portfolio section. The actual dogfooding smoke recapture is a manual step
// the owner runs against the live stack — see _prd.md "Exit Criteria
// Verification" for which surfaces still need a real-data capture.
//
// Run: node docs/screenshots/_render-mockups.mjs
//
// Outputs (1280x800 PNG, dark theme matching apps/web globals.css tokens):
//   docs/screenshots/landing-empty.png
//   docs/screenshots/thread-with-citations.png
//   docs/screenshots/citation-side-panel.png
//   docs/screenshots/spoiler-slider.png
//   docs/screenshots/library-grid.png
//   docs/screenshots/gutendex-drawer.png

import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Resolve @playwright/test from apps/web (the only workspace with it installed).
const PLAYWRIGHT_ENTRY = resolve(
  __dirname,
  '..',
  '..',
  'apps',
  'web',
  'node_modules',
  '@playwright',
  'test',
  'index.mjs',
)
const { chromium } = await import(pathToFileURL(PLAYWRIGHT_ENTRY).href)

const VIEWPORT = { width: 1280, height: 800 }

const TOKENS = `
  :root {
    --bg: #1a1a1a;
    --bg-elevated: #232323;
    --bg-hover: #2a2a2a;
    --fg: #fafafa;
    --fg-muted: #a3a3a3;
    --fg-dim: #737373;
    --border: rgba(255,255,255,0.10);
    --border-strong: rgba(255,255,255,0.18);
    --primary: #ededed;
    --primary-fg: #232323;
    --scholarly: #c79b6a;
    --status-ready: #61c47a;
    --status-failed: #f14a4a;
    --status-progress: #e3a743;
    --radius: 0.625rem;
    --radius-cite: 4px;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    height: 800px;
    overflow: hidden;
  }
  .serif { font-family: 'Iowan Old Style', 'Apple Garamond', Baskerville, Georgia, serif; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .frame {
    display: grid;
    grid-template-columns: 280px 1fr;
    height: 100%;
  }
  .sidebar {
    background: var(--bg-elevated);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
  }
  .sidebar-header {
    padding: 16px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .brand {
    font-family: 'Iowan Old Style', Georgia, serif;
    font-size: 18px;
    font-weight: 600;
    color: var(--scholarly);
    letter-spacing: 0.01em;
  }
  .new-thread {
    background: var(--primary);
    color: var(--primary-fg);
    border: 0;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .group-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--fg-dim);
    letter-spacing: 0.06em;
    padding: 12px 16px 6px;
  }
  .thread-row {
    height: 56px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    border-left: 2px solid transparent;
  }
  .thread-row.active {
    background: var(--bg-hover);
    border-left-color: var(--scholarly);
  }
  .thread-row .title { font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .thread-row .meta { font-size: 11px; color: var(--fg-dim); }
  .pin { color: var(--scholarly); font-size: 11px; }
  .footer-link { padding: 12px 16px; border-top: 1px solid var(--border); color: var(--fg-muted); font-size: 13px; }
  .main {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .header {
    height: 56px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 24px;
    gap: 10px;
    background: var(--bg);
  }
  .chip {
    height: 28px;
    border-radius: 14px;
    border: 1px solid var(--border-strong);
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    background: var(--bg-elevated);
  }
  .chip .flag { font-size: 11px; }
  .chip .cap {
    background: var(--scholarly);
    color: var(--primary-fg);
    border-radius: 3px;
    padding: 1px 6px;
    font-weight: 600;
    font-size: 10px;
  }
  .body {
    flex: 1;
    overflow: hidden;
    padding: 32px 64px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .empty-card {
    margin: auto;
    width: 720px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 28px;
  }
  .empty-card h2 { margin: 0 0 6px; font-size: 18px; font-weight: 600; }
  .empty-card p { margin: 0 0 18px; color: var(--fg-muted); font-size: 14px; }
  .book-shelf {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .book-tile {
    background: var(--bg-hover);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .cover {
    aspect-ratio: 3 / 4;
    border-radius: 6px;
    background: linear-gradient(160deg, #46340a, #c79b6a);
    display: flex;
    align-items: end;
    padding: 10px;
    font-family: 'Iowan Old Style', Georgia, serif;
    font-size: 14px;
    font-weight: 600;
    color: #1a1a1a;
  }
  .cover.cover-2 { background: linear-gradient(160deg, #2c4f2a, #8fc475); }
  .cover.cover-3 { background: linear-gradient(160deg, #4b1f1f, #d96666); }
  .book-tile .title { font-size: 13px; font-weight: 600; }
  .book-tile .meta { font-size: 11px; color: var(--fg-muted); }
  .book-tile .cta {
    margin-top: auto;
    background: var(--primary);
    color: var(--primary-fg);
    border: 0;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .composer {
    margin-top: auto;
    border: 1px solid var(--border-strong);
    background: var(--bg-elevated);
    border-radius: 14px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .composer .placeholder { color: var(--fg-dim); font-size: 14px; }
  .composer .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--fg-muted);
    font-size: 12px;
  }
  .composer-tag {
    background: var(--bg-hover);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 11px;
  }
  .send-btn {
    background: var(--scholarly);
    color: var(--primary-fg);
    border: 0;
    border-radius: 8px;
    padding: 7px 14px;
    font-size: 12px;
    font-weight: 600;
  }
  .message-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .message-row.assistant { align-self: stretch; }
  .message-row.user { align-self: end; max-width: 70%; }
  .bubble {
    border-radius: 14px;
    padding: 12px 16px;
    font-size: 14px;
    line-height: 1.55;
  }
  .bubble.user { background: var(--scholarly); color: var(--primary-fg); }
  .bubble.assistant { background: var(--bg-elevated); border: 1px solid var(--border); }
  sup.cite {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    margin: 0 2px;
    border-radius: var(--radius-cite);
    background: var(--scholarly);
    color: var(--primary-fg);
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    vertical-align: top;
    position: relative;
    top: -2px;
  }
  /* Side panel + popover */
  .side-panel {
    position: absolute;
    right: 0;
    top: 0;
    height: 100%;
    width: 480px;
    background: var(--bg-elevated);
    border-left: 1px solid var(--border-strong);
    display: flex;
    flex-direction: column;
    box-shadow: -16px 0 48px rgba(0,0,0,0.45);
    z-index: 10;
  }
  .side-panel header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 600;
  }
  .side-panel .panel-body {
    padding: 20px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .panel-label { color: var(--fg-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
  .panel-chapter { font-family: 'Iowan Old Style', Georgia, serif; font-size: 17px; font-weight: 600; }
  .panel-quote {
    background: var(--bg-hover);
    border-left: 3px solid var(--scholarly);
    border-radius: 0 8px 8px 0;
    padding: 14px 16px;
    font-family: 'Iowan Old Style', Georgia, serif;
    font-size: 14px;
    line-height: 1.65;
    color: var(--fg);
  }
  /* Spoiler slider popover */
  .popover {
    position: absolute;
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: 10px;
    padding: 16px;
    width: 320px;
    box-shadow: 0 16px 32px rgba(0,0,0,0.45);
    z-index: 11;
  }
  .popover h3 { margin: 0 0 6px; font-size: 13px; font-weight: 600; }
  .popover .sub { color: var(--fg-muted); font-size: 12px; margin-bottom: 14px; }
  .slider-track {
    position: relative;
    height: 6px;
    background: var(--border-strong);
    border-radius: 3px;
    margin: 18px 0 6px;
  }
  .slider-fill {
    position: absolute;
    top: 0; left: 0;
    height: 100%;
    background: var(--scholarly);
    border-radius: 3px;
  }
  .slider-thumb {
    position: absolute;
    top: 50%;
    width: 18px; height: 18px;
    background: var(--fg);
    border: 2px solid var(--scholarly);
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }
  .slider-readout {
    display: flex; justify-content: space-between;
    font-size: 11px; color: var(--fg-muted);
  }
  .switch-row {
    display: flex; align-items: center; justify-content: space-between;
    margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);
    font-size: 12px;
  }
  .switch {
    width: 32px; height: 18px; background: var(--border-strong); border-radius: 999px; position: relative;
  }
  .switch::after {
    content: '';
    position: absolute;
    width: 14px; height: 14px;
    background: var(--fg);
    border-radius: 50%;
    top: 2px; left: 2px;
  }
  /* Library grid */
  .lib-frame { padding: 24px; height: 100%; overflow: hidden; }
  .lib-toolbar {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 18px;
  }
  .lib-search {
    flex: 1;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
    color: var(--fg-muted);
  }
  .lib-add {
    background: var(--primary);
    color: var(--primary-fg);
    border: 0;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 600;
  }
  .lib-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
  .lib-card {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .lib-cover {
    aspect-ratio: 3 / 4;
    border-radius: 6px;
    background: linear-gradient(160deg, #46340a, #c79b6a);
  }
  .lib-cover.b { background: linear-gradient(160deg, #2c4f2a, #8fc475); }
  .lib-cover.c { background: linear-gradient(160deg, #4b1f1f, #d96666); }
  .lib-cover.d { background: linear-gradient(160deg, #1f2c4b, #6699d9); }
  .lib-cover.e { background: linear-gradient(160deg, #4b1f44, #c47ad9); }
  .lib-cover.f { background: linear-gradient(160deg, #2a4b4b, #6acac4); }
  .lib-title { font-family: 'Iowan Old Style', Georgia, serif; font-size: 14px; font-weight: 600; }
  .lib-meta { font-size: 11px; color: var(--fg-muted); }
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    width: fit-content;
  }
  .status-ready { background: rgba(97,196,122,0.18); color: var(--status-ready); }
  .status-progress { background: rgba(227,167,67,0.16); color: var(--status-progress); }
  .status-failed { background: rgba(241,74,74,0.18); color: var(--status-failed); }
  .progress-track {
    height: 4px;
    background: rgba(255,255,255,0.10);
    border-radius: 2px;
    overflow: hidden;
  }
  .progress-fill { height: 100%; background: var(--status-progress); }
  /* Gutendex drawer (left side) */
  .drawer {
    position: absolute;
    left: 0; top: 0;
    width: 480px;
    height: 100%;
    background: var(--bg-elevated);
    border-right: 1px solid var(--border-strong);
    display: flex;
    flex-direction: column;
    box-shadow: 16px 0 48px rgba(0,0,0,0.45);
    z-index: 12;
  }
  .drawer header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
  }
  .drawer .body-d { padding: 16px 20px; overflow: hidden; display: flex; flex-direction: column; gap: 12px; }
  .drawer-search {
    background: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
  }
  .drawer-filter {
    display: inline-flex;
    gap: 6px;
    margin-top: 4px;
  }
  .filter-chip {
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    font-size: 11px;
    color: var(--fg-muted);
  }
  .filter-chip.active {
    background: var(--scholarly);
    color: var(--primary-fg);
    border-color: var(--scholarly);
  }
  .drawer-row {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .drawer-row .mini-cover {
    width: 50px;
    height: 70px;
    border-radius: 4px;
    background: linear-gradient(160deg, #46340a, #c79b6a);
  }
  .drawer-row .mini-cover.x { background: linear-gradient(160deg, #1f2c4b, #6699d9); }
  .drawer-row .mini-cover.y { background: linear-gradient(160deg, #2a4b4b, #6acac4); }
  .drawer-row .info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .drawer-row .info .t { font-size: 13px; font-weight: 600; }
  .drawer-row .info .a { font-size: 11px; color: var(--fg-muted); }
  .drawer-row .add {
    background: var(--primary);
    color: var(--primary-fg);
    border: 0;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 600;
    align-self: flex-start;
  }
  .ghost { color: var(--fg-dim); }
`

const SIDEBAR = (active = 'thread2') => `
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="brand">dIAlogus</div>
      <button class="new-thread">+ Nova conversa</button>
    </div>
    <div class="group-label">Fixadas</div>
    <div class="thread-row ${active === 'thread1' ? 'active' : ''}">
      <div class="title">Moby Dick deep dive</div>
      <div class="pin">📌</div>
    </div>
    <div class="group-label">Recentes</div>
    <div class="thread-row ${active === 'thread2' ? 'active' : ''}">
      <div class="title">Memorias deep dive</div>
      <div class="meta">há 2h</div>
    </div>
    <div class="thread-row">
      <div class="title">A condição humana em Brás Cubas</div>
      <div class="meta">ontem</div>
    </div>
    <div class="thread-row">
      <div class="title">Crime and Punishment — primeira leitura</div>
      <div class="meta">3d</div>
    </div>
    <div class="thread-row">
      <div class="title">Comparação Tolstói × Dostoiévski</div>
      <div class="meta">5d</div>
    </div>
    <div style="flex:1"></div>
    <div class="footer-link">📚 Gerenciar acervo</div>
  </aside>
`

const HEADER_CHIPS = (showCap = true) => `
  <header class="header">
    <span class="chip"><span class="flag">🇧🇷</span><span>Memórias Póstumas</span>${showCap ? '<span class="cap">Cap. ≤ 23</span>' : ''}</span>
    <span class="chip"><span class="flag">🇺🇸</span><span>Crime and Punishment</span></span>
    <span style="flex:1"></span>
    <span style="color: var(--fg-dim); font-size:12px">Trocar livros = nova conversa</span>
  </header>
`

const COMPOSER = `
  <div class="composer">
    <div class="placeholder">Pergunte sobre os livros selecionados…</div>
    <div class="row">
      <div style="display:flex; gap:6px;">
        <span class="composer-tag">📚 Memórias Póstumas</span>
        <span class="composer-tag">📚 Crime and Punishment</span>
      </div>
      <button class="send-btn">Enviar ⌘↵</button>
    </div>
  </div>
`

function pageShell(body, extra = '') {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <style>${TOKENS}${extra}</style>
</head>
<body>
${body}
</body>
</html>`
}

const MOCKUPS = {
  'landing-empty.png': pageShell(`
    <div class="frame">
      ${SIDEBAR('none')}
      <main class="main">
        <header class="header"><span class="brand serif" style="font-size:14px">Comece sua próxima leitura</span></header>
        <div class="body" style="display:flex; align-items:center; justify-content:center;">
          <div class="empty-card">
            <h2>Primeiros passos</h2>
            <p>Escolha um dos clássicos abaixo para indexar e começar a conversar. Em alguns minutos seu acervo está pronto.</p>
            <div class="book-shelf">
              <div class="book-tile">
                <div class="cover serif">The Count of Monte Cristo</div>
                <div class="title serif">The Count of Monte Cristo</div>
                <div class="meta">Alexandre Dumas · 🇺🇸 EN · 117 cap.</div>
                <button class="cta">Adicionar e ingerir</button>
              </div>
              <div class="book-tile">
                <div class="cover cover-2 serif">Brás Cubas</div>
                <div class="title serif">Memórias Póstumas de Brás Cubas</div>
                <div class="meta">Machado de Assis · 🇧🇷 PT · 160 cap.</div>
                <button class="cta">Adicionar e ingerir</button>
              </div>
              <div class="book-tile">
                <div class="cover cover-3 serif">Crime and Punishment</div>
                <div class="title serif">Crime and Punishment</div>
                <div class="meta">F. Dostoiévski · 🇺🇸 EN · 38 cap.</div>
                <button class="cta">Adicionar e ingerir</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  `),
  'thread-with-citations.png': pageShell(`
    <div class="frame">
      ${SIDEBAR('thread2')}
      <main class="main">
        ${HEADER_CHIPS(true)}
        <div class="body" style="overflow:auto; gap:18px;">
          <div class="message-row user"><div class="bubble user">Quem é o narrador de Memórias Póstumas?</div></div>
          <div class="message-row assistant">
            <div class="bubble assistant">
              O narrador é o próprio <em>Brás Cubas</em>, que se apresenta como um defunto-autor — escreve do <em>além-túmulo</em>, sem o constrangimento do leitor vivo.
              Essa moldura permite a digressão constante, o tom irônico e a quebra metaficcional que caracterizam a obra<sup class="cite">1</sup>.
              No capítulo de abertura, ele declara explicitamente a inversão do ato narrativo<sup class="cite">2</sup>, e ao longo do livro continua se dirigindo ao leitor como ouvinte de um morto<sup class="cite">3</sup>.
            </div>
          </div>
          <div class="message-row user"><div class="bubble user">E o tom dele muda ao longo do livro?</div></div>
          <div class="message-row assistant">
            <div class="bubble assistant">
              O tom é deliberadamente instável. Na infância e juventude (caps. 5–20) prevalece a anedota leve; depois, à medida que o desencanto cresce, surgem ataques diretos ao leitor — o capítulo do delírio<sup class="cite">4</sup> e o famoso “ao verme que primeiro roeu as frias carnes do meu cadáver”<sup class="cite">5</sup> são os clímax do registro melancólico-irônico.
            </div>
          </div>
          ${COMPOSER}
        </div>
      </main>
    </div>
  `),
  'citation-side-panel.png': pageShell(`
    <div class="frame">
      ${SIDEBAR('thread2')}
      <main class="main" style="position:relative;">
        ${HEADER_CHIPS(true)}
        <div class="body" style="overflow:auto; gap:18px; padding-right: 504px;">
          <div class="message-row user"><div class="bubble user">Quem é o narrador?</div></div>
          <div class="message-row assistant">
            <div class="bubble assistant">
              O narrador é <em>Brás Cubas</em>, um defunto-autor — figura que Machado constrói para escrever do além-túmulo<sup class="cite" style="background:#fff;color:#1a1a1a;outline:2px solid var(--scholarly);outline-offset:1px;">2</sup>.
              É essa moldura que viabiliza a ironia e as digressões.
            </div>
          </div>
          ${COMPOSER}
        </div>
        <aside class="side-panel">
          <header>
            <div>Citação 2 · Cap. 1</div>
            <div class="ghost" style="font-size:18px; cursor:pointer;">×</div>
          </header>
          <div class="panel-body">
            <div class="panel-label">Capítulo</div>
            <div class="panel-chapter serif">Cap. 1 — Óbito do Autor</div>
            <div class="panel-label" style="margin-top:6px;">Excerto</div>
            <blockquote class="panel-quote">
              Algum tempo hesitei se devia abrir estas memórias pelo princípio ou pelo fim, isto é, se poria em primeiro lugar o meu nascimento ou a minha morte. Suposto o uso vulgar seja começar pelo nascimento, duas considerações me levaram a adotar diferente método: a primeira é que eu não sou propriamente um autor defunto, mas um defunto autor, para quem a campa foi outro berço…
            </blockquote>
            <div class="panel-label">Origem</div>
            <div class="mono" style="font-size:11px; color:var(--fg-muted);">chunk_id: 5e4f3a2c-94e1-…   ·   livro: 54829</div>
          </div>
        </aside>
      </main>
    </div>
  `),
  'spoiler-slider.png': pageShell(`
    <div class="frame">
      ${SIDEBAR('thread2')}
      <main class="main" style="position:relative;">
        ${HEADER_CHIPS(true)}
        <div class="body" style="overflow:auto; gap:18px;">
          <div class="message-row assistant"><div class="bubble assistant">Pronto. Pergunte algo sobre o capítulo atual ou anteriores.</div></div>
          ${COMPOSER}
        </div>
        <div class="popover" style="left: 296px; top: 70px;">
          <h3>Memórias Póstumas — limite de capítulos</h3>
          <div class="sub">Respostas só citarão capítulos ≤ ao limite definido aqui. Salvo apenas neste navegador.</div>
          <div class="slider-track" style="margin-top:6px;">
            <div class="slider-fill" style="width:14%"></div>
            <div class="slider-thumb" style="left:14%"></div>
          </div>
          <div class="slider-readout">
            <span>Cap. 1</span>
            <span style="font-weight:700; color:var(--fg);">Cap. ≤ 23</span>
            <span>Cap. 160</span>
          </div>
          <div class="switch-row">
            <span>Sem cap (responder com qualquer capítulo)</span>
            <span class="switch"></span>
          </div>
        </div>
      </main>
    </div>
  `),
  'library-grid.png': pageShell(`
    <div class="frame">
      ${SIDEBAR('library')}
      <main class="main">
        <header class="header">
          <span class="brand serif" style="font-size:14px">Gerenciar acervo</span>
          <span style="flex:1"></span>
          <span class="ghost" style="font-size:12px;">7 livros</span>
        </header>
        <div class="lib-frame">
          <div class="lib-toolbar">
            <input class="lib-search" value="Buscar no acervo (título, autor)…" />
            <button class="lib-add">+ Adicionar do Gutendex</button>
          </div>
          <div class="lib-grid">
            <div class="lib-card">
              <div class="lib-cover"></div>
              <div class="lib-title">The Count of Monte Cristo</div>
              <div class="lib-meta">Alexandre Dumas · 🇺🇸 EN</div>
              <span class="status-badge status-ready">● ready</span>
            </div>
            <div class="lib-card">
              <div class="lib-cover b"></div>
              <div class="lib-title">Memórias Póstumas de Brás Cubas</div>
              <div class="lib-meta">Machado de Assis · 🇧🇷 PT</div>
              <span class="status-badge status-ready">● ready</span>
            </div>
            <div class="lib-card">
              <div class="lib-cover c"></div>
              <div class="lib-title">Crime and Punishment</div>
              <div class="lib-meta">F. Dostoiévski · 🇺🇸 EN</div>
              <span class="status-badge status-ready">● ready</span>
            </div>
            <div class="lib-card">
              <div class="lib-cover d"></div>
              <div class="lib-title">Moby-Dick</div>
              <div class="lib-meta">Herman Melville · 🇺🇸 EN</div>
              <span class="status-badge status-ready">● ready</span>
            </div>
            <div class="lib-card">
              <div class="lib-cover e"></div>
              <div class="lib-title">Anna Karenina</div>
              <div class="lib-meta">Liev Tolstói · 🇺🇸 EN</div>
              <span class="status-badge status-progress">⟳ embedding · 64%</span>
              <div class="progress-track"><div class="progress-fill" style="width:64%"></div></div>
            </div>
            <div class="lib-card">
              <div class="lib-cover f"></div>
              <div class="lib-title">Dom Casmurro</div>
              <div class="lib-meta">Machado de Assis · 🇧🇷 PT</div>
              <span class="status-badge status-progress">⟳ chunking · 22%</span>
              <div class="progress-track"><div class="progress-fill" style="width:22%"></div></div>
            </div>
            <div class="lib-card">
              <div class="lib-cover" style="background:#322;"></div>
              <div class="lib-title">War and Peace</div>
              <div class="lib-meta">Liev Tolstói · 🇺🇸 EN</div>
              <span class="status-badge status-failed">⚠ failed · download</span>
            </div>
            <div class="lib-card">
              <div class="lib-cover" style="background:#222; border:1px dashed var(--border-strong)"></div>
              <div class="lib-title ghost">Adicionar próximo livro</div>
              <div class="lib-meta">via Gutendex</div>
              <span class="status-badge" style="background:var(--bg-hover); color:var(--fg-muted)">+ adicionar</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  `),
  'gutendex-drawer.png': pageShell(`
    <div class="frame" style="position:relative;">
      ${SIDEBAR('library')}
      <main class="main">
        <header class="header"><span class="brand serif" style="font-size:14px">Gerenciar acervo</span></header>
        <div class="lib-frame" style="filter: brightness(0.55);">
          <div class="lib-toolbar">
            <input class="lib-search" value="Buscar…" />
            <button class="lib-add">+ Adicionar do Gutendex</button>
          </div>
          <div class="lib-grid">
            <div class="lib-card"><div class="lib-cover"></div><div class="lib-title">Monte Cristo</div></div>
            <div class="lib-card"><div class="lib-cover b"></div><div class="lib-title">Brás Cubas</div></div>
            <div class="lib-card"><div class="lib-cover c"></div><div class="lib-title">Crime and Punishment</div></div>
            <div class="lib-card"><div class="lib-cover d"></div><div class="lib-title">Moby-Dick</div></div>
          </div>
        </div>
      </main>
      <aside class="drawer">
        <header>
          <div style="font-weight:600;">Adicionar do Gutendex</div>
          <div class="ghost" style="font-size:18px; cursor:pointer;">×</div>
        </header>
        <div class="body-d">
          <div class="drawer-search">Tolstoy</div>
          <div class="drawer-filter">
            <span class="filter-chip">Todos</span>
            <span class="filter-chip active">EN</span>
            <span class="filter-chip">PT</span>
          </div>
          <div class="drawer-row">
            <div class="mini-cover"></div>
            <div class="info">
              <div class="t">Anna Karenina</div>
              <div class="a">Leo Tolstoy · gutendex_id 1399</div>
              <div class="a ghost">Já no acervo</div>
            </div>
            <button class="add" style="background: var(--bg-hover); color: var(--fg-muted);">no acervo</button>
          </div>
          <div class="drawer-row">
            <div class="mini-cover x"></div>
            <div class="info">
              <div class="t">War and Peace</div>
              <div class="a">Leo Tolstoy · gutendex_id 2600</div>
              <div class="a ghost">~1.2 MB · 365 caps</div>
            </div>
            <button class="add">+ Adicionar</button>
          </div>
          <div class="drawer-row">
            <div class="mini-cover y"></div>
            <div class="info">
              <div class="t">The Death of Ivan Ilyich</div>
              <div class="a">Leo Tolstoy · gutendex_id 985</div>
              <div class="a ghost">~120 KB · 12 caps</div>
            </div>
            <button class="add">+ Adicionar</button>
          </div>
          <div class="drawer-row">
            <div class="mini-cover"></div>
            <div class="info">
              <div class="t">Childhood, Boyhood, Youth</div>
              <div class="a">Leo Tolstoy · gutendex_id 2142</div>
              <div class="a ghost">~430 KB · 84 caps</div>
            </div>
            <button class="add">+ Adicionar</button>
          </div>
          <div style="text-align:center; padding-top:8px;">
            <span class="ghost" style="font-size:12px;">Carregar mais resultados…</span>
          </div>
        </div>
      </aside>
    </div>
  `),
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 })
  const page = await context.newPage()
  for (const [filename, html] of Object.entries(MOCKUPS)) {
    await page.setContent(html, { waitUntil: 'load' })
    const out = resolve(__dirname, filename)
    await page.screenshot({ path: out, fullPage: false, type: 'png' })
    console.log('wrote', out)
  }
  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
