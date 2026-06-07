'use strict';

/**
 * preview.js — generates outbox/preview.html
 * A beautiful dark-theme HTML preview showing every language×platform variant
 * as a phone/post mockup with char counts and over-limit warnings.
 * Zero dependencies — inline CSS/JS, no CDN.
 */

const fs = require('fs');
const path = require('path');

const PLATFORM_ICONS = {
  x: { icon: '✕', color: '#000', bg: '#fff', label: 'X (Twitter)' },
  weibo: { icon: '微博', color: '#fff', bg: '#e6162d', label: '微博 Weibo' },
  linkedin: { icon: 'in', color: '#fff', bg: '#0077b5', label: 'LinkedIn' },
  instagram: { icon: '◈', color: '#fff', bg: 'linear-gradient(135deg,#f9ce34,#ee2a7b,#6228d7)', label: 'Instagram' },
  threads: { icon: '◎', color: '#fff', bg: '#000', label: 'Threads' },
  mastodon: { icon: '🐘', color: '#fff', bg: '#563acc', label: 'Mastodon' },
  xiaohongshu: { icon: '📕', color: '#fff', bg: '#fe2c55', label: '小红书' },
  youtube_community: { icon: '▶', color: '#fff', bg: '#ff0000', label: 'YouTube' },
  file: { icon: '📁', color: '#fff', bg: '#334155', label: 'File (dry-run)' },
};

const LANG_NAMES = {
  en: 'English', zh: '中文', ja: '日本語', es: 'Español',
  fr: 'Français', de: 'Deutsch', ko: '한국어', pt: 'Português',
  ar: 'العربية', ru: 'Русский',
};

/**
 * Escape HTML special characters.
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build a single platform post mockup card.
 */
function buildPostCard(adapted) {
  const pi = PLATFORM_ICONS[adapted.platform] || PLATFORM_ICONS.file;
  const langName = LANG_NAMES[adapted.lang] || adapted.lang;
  const pct = adapted.maxChars === Infinity ? 100 : Math.min(100, Math.round((adapted.charCount / adapted.maxChars) * 100));
  const isOver = adapted.exceedsLimit;
  const isWarn = !isOver && pct > 85;
  const meterColor = isOver ? '#ef4444' : isWarn ? '#f59e0b' : '#22c55e';

  const limitLabel = adapted.maxChars === Infinity
    ? `${adapted.charCount} chars (no limit)`
    : `${adapted.charCount} / ${adapted.maxChars} chars`;

  const overLimitBadge = isOver
    ? `<span class="over-badge">⚠ OVER LIMIT</span>`
    : isWarn
    ? `<span class="warn-badge">⚠ Near limit</span>`
    : '';

  const translationBadge = adapted.translationMethod === 'passthrough'
    ? `<span class="method-tag passthrough">original</span>`
    : adapted.translationMethod === 'stub'
    ? `<span class="method-tag stub">stub</span>`
    : `<span class="method-tag ai">AI translated</span>`;

  // Thread indicator for X
  const threadBlock = adapted.thread && adapted.thread.length > 1
    ? `<div class="thread-block">
        <div class="thread-label">🧵 Thread (${adapted.thread.length} tweets)</div>
        ${adapted.thread.map((t, i) => `
          <div class="thread-tweet">
            <span class="thread-num">${i + 1}/${adapted.thread.length}</span>
            <span class="thread-text">${escapeHtml(t.replace(/ \d+\/\d+$/, ''))}</span>
          </div>`).join('')}
      </div>`
    : '';

  const warnings = adapted.warnings && adapted.warnings.length > 0
    ? `<div class="card-warnings">${adapted.warnings.map((w) => `<div class="warning-item">⚠ ${escapeHtml(w)}</div>`).join('')}</div>`
    : '';

  return `
  <div class="post-card ${isOver ? 'over-limit' : ''}" data-lang="${escapeHtml(adapted.lang)}" data-platform="${escapeHtml(adapted.platform)}">
    <div class="card-top">
      <div class="platform-badge" style="background:${pi.bg};color:${pi.color}">
        <span class="platform-icon">${pi.icon}</span>
        <span class="platform-name">${escapeHtml(pi.label)}</span>
      </div>
      <div class="lang-badge">
        <span class="lang-flag">${langName}</span>
        ${translationBadge}
      </div>
    </div>

    <div class="phone-mockup">
      <div class="phone-screen">
        <div class="post-header">
          <div class="avatar">${escapeHtml(adapted.author ? adapted.author[0].toUpperCase() : 'A')}</div>
          <div class="post-meta">
            <div class="post-author">${escapeHtml(adapted.author || 'Author')}</div>
            <div class="post-time">just now · ${escapeHtml(pi.label)}</div>
          </div>
        </div>
        <div class="post-content">${escapeHtml(adapted.content)}</div>
        ${threadBlock}
        ${warnings}
      </div>
    </div>

    <div class="char-meter-wrap">
      <div class="char-label">
        <span>${limitLabel}</span>
        ${overLimitBadge}
      </div>
      <div class="char-meter">
        <div class="char-bar" style="width:${pct}%;background:${meterColor}"></div>
      </div>
    </div>
  </div>`;
}

/**
 * Build the full preview.html.
 * @param {Array<object>} adaptedPosts - All adapted post variants
 * @param {object} sourcePost - Original source post
 * @param {string[]} langs
 * @param {string[]} platforms
 * @returns {string} HTML string
 */
function generatePreviewHtml(adaptedPosts, sourcePost, langs, platforms) {
  const generatedAt = new Date().toLocaleString();
  const totalVariants = adaptedPosts.length;
  const overCount = adaptedPosts.filter((p) => p.exceedsLimit).length;
  const threadCount = adaptedPosts.filter((p) => p.thread && p.thread.length > 1).length;

  // Group by lang for display
  const byLang = langs.map((lang) => ({
    lang,
    posts: platforms.map((platform) =>
      adaptedPosts.find((p) => p.lang === lang && p.platform === platform)
    ).filter(Boolean),
  }));

  const langTabs = langs.map((l) =>
    `<button class="tab-btn ${l === langs[0] ? 'active' : ''}" data-lang="${l}">${LANG_NAMES[l] || l}</button>`
  ).join('');

  const platformFilterBtns = ['all', ...platforms]
    .map((p) => `<button class="plat-btn ${p === 'all' ? 'active' : ''}" data-platform="${p}">${p === 'all' ? 'All' : (PLATFORM_ICONS[p]?.label || p)}</button>`)
    .join('');

  const sections = byLang.map(({ lang, posts }) => {
    const cards = posts.map((p) => buildPostCard(p)).join('');
    return `
    <section class="lang-section" data-lang="${escapeHtml(lang)}">
      <div class="cards-grid">${cards}</div>
    </section>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OmniPost Preview — ${escapeHtml(sourcePost.title || 'Post')}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0a0a12;
    --surface: #11111e;
    --surface2: #1a1a2e;
    --surface3: #22223a;
    --border: #2a2a45;
    --accent: #7c3aed;
    --accent2: #4f46e5;
    --text: #e2e8f0;
    --text-muted: #94a3b8;
    --text-dim: #64748b;
    --green: #22c55e;
    --yellow: #f59e0b;
    --red: #ef4444;
    --radius: 14px;
    --font: 'Inter', 'Segoe UI', system-ui, sans-serif;
  }
  body { background: var(--bg); color: var(--text); font-family: var(--font); min-height: 100vh; }

  /* ── Header ── */
  .preview-header {
    background: linear-gradient(135deg, #1a0533 0%, #0a0a12 60%);
    border-bottom: 1px solid var(--border);
    padding: 28px 32px;
  }
  .preview-title { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 4px; }
  .preview-title span { background: linear-gradient(90deg, #a855f7, #4f46e5); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .preview-sub { color: var(--text-muted); font-size: 13px; margin-bottom: 20px; }
  .source-block {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 18px;
    font-size: 13px;
    line-height: 1.6;
    max-width: 700px;
  }
  .source-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--text-dim); margin-bottom: 6px; }
  .source-body { color: var(--text-muted); }

  /* ── Stats bar ── */
  .stats-bar {
    display: flex; gap: 28px;
    padding: 16px 32px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .stat { display: flex; align-items: center; gap: 8px; }
  .stat-num { font-size: 20px; font-weight: 700; color: var(--accent); }
  .stat-label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-num.warn { color: var(--yellow); }
  .stat-num.ok { color: var(--green); }

  /* ── Tabs & filters ── */
  .controls {
    padding: 16px 32px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    display: flex; gap: 16px; flex-wrap: wrap; align-items: center;
  }
  .tab-group, .plat-group { display: flex; gap: 6px; flex-wrap: wrap; }
  .controls-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); }
  .tab-btn, .plat-btn {
    padding: 6px 14px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    font-family: var(--font);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tab-btn:hover, .plat-btn:hover { background: var(--surface2); color: var(--text); }
  .tab-btn.active, .plat-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }

  /* ── Cards grid ── */
  .content-area { padding: 28px 32px; }
  .lang-section { display: none; }
  .lang-section.visible { display: block; }
  .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px; }

  /* ── Post card ── */
  .post-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    transition: border-color 0.2s, transform 0.15s;
  }
  .post-card:hover { border-color: var(--accent); transform: translateY(-2px); }
  .post-card.over-limit { border-color: var(--red); }
  .post-card.hidden { display: none; }

  .card-top {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 14px;
    background: var(--surface2);
    border-bottom: 1px solid var(--border);
  }
  .platform-badge {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  .platform-icon { font-size: 11px; }
  .lang-badge { display: flex; align-items: center; gap: 6px; }
  .lang-flag { font-size: 12px; color: var(--text-muted); }
  .method-tag {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  .method-tag.passthrough { background: #1e3a5f; color: #67e8f9; }
  .method-tag.stub { background: #3f1f1f; color: #f87171; }
  .method-tag.ai { background: #1a2e1a; color: #4ade80; }

  /* ── Phone mockup ── */
  .phone-mockup {
    padding: 12px 14px;
    min-height: 120px;
  }
  .phone-screen {
    background: var(--surface3);
    border-radius: 10px;
    padding: 14px;
    border: 1px solid var(--border);
  }
  .post-header { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px; }
  .avatar {
    width: 36px; height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 700; color: #fff;
    flex-shrink: 0;
  }
  .post-meta { flex: 1; }
  .post-author { font-size: 13px; font-weight: 600; }
  .post-time { font-size: 11px; color: var(--text-dim); }
  .post-content { font-size: 13px; line-height: 1.6; color: var(--text); white-space: pre-wrap; word-break: break-word; }

  /* ── Thread block ── */
  .thread-block { margin-top: 10px; border-left: 2px solid var(--accent); padding-left: 10px; }
  .thread-label { font-size: 10px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .thread-tweet { display: flex; gap: 8px; margin-bottom: 6px; font-size: 12px; line-height: 1.5; }
  .thread-num { font-size: 10px; font-weight: 700; color: var(--text-dim); white-space: nowrap; }
  .thread-text { color: var(--text-muted); }

  /* ── Warnings ── */
  .card-warnings { margin-top: 10px; }
  .warning-item { font-size: 11px; color: var(--yellow); padding: 3px 0; }

  /* ── Char meter ── */
  .char-meter-wrap { padding: 10px 14px 14px; border-top: 1px solid var(--border); }
  .char-label {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 11px; color: var(--text-dim); margin-bottom: 6px;
  }
  .char-meter { height: 4px; background: var(--surface3); border-radius: 2px; overflow: hidden; }
  .char-bar { height: 100%; border-radius: 2px; transition: width 0.3s; }
  .over-badge { font-size: 10px; font-weight: 700; color: var(--red); text-transform: uppercase; letter-spacing: 0.5px; }
  .warn-badge { font-size: 10px; font-weight: 700; color: var(--yellow); }

  /* ── Footer ── */
  .preview-footer {
    text-align: center;
    padding: 24px;
    font-size: 11px;
    color: var(--text-dim);
    border-top: 1px solid var(--border);
    margin-top: 20px;
  }

  /* ── Responsive ── */
  @media (max-width: 600px) {
    .preview-header, .stats-bar, .controls, .content-area { padding: 16px; }
    .cards-grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>

<header class="preview-header">
  <div class="preview-title"><span>OmniPost</span> Preview</div>
  <div class="preview-sub">Generated ${escapeHtml(generatedAt)} · Review before publishing</div>
  <div class="source-block">
    <div class="source-label">Source Post</div>
    <strong>${escapeHtml(sourcePost.title || '')}</strong>
    ${sourcePost.title ? '<br>' : ''}
    <span class="source-body">${escapeHtml((sourcePost.body || '').slice(0, 200))}${(sourcePost.body || '').length > 200 ? '…' : ''}</span>
  </div>
</header>

<div class="stats-bar">
  <div class="stat">
    <div class="stat-num">${totalVariants}</div>
    <div class="stat-label">Variants</div>
  </div>
  <div class="stat">
    <div class="stat-num">${langs.length}</div>
    <div class="stat-label">Languages</div>
  </div>
  <div class="stat">
    <div class="stat-num">${platforms.length}</div>
    <div class="stat-label">Platforms</div>
  </div>
  <div class="stat">
    <div class="stat-num ${threadCount > 0 ? 'warn' : 'ok'}">${threadCount}</div>
    <div class="stat-label">Threads</div>
  </div>
  <div class="stat">
    <div class="stat-num ${overCount > 0 ? 'warn' : 'ok'}">${overCount}</div>
    <div class="stat-label">Over Limit</div>
  </div>
</div>

<div class="controls">
  <div class="controls-label">Lang:</div>
  <div class="tab-group">${langTabs}</div>
  <div class="controls-label">Platform:</div>
  <div class="plat-group">${platformFilterBtns}</div>
</div>

<div class="content-area">
  ${sections}

  <div class="preview-footer">
    OmniPost Preview · ${totalVariants} post variants across ${langs.length} languages and ${platforms.length} platforms
    · Generated ${escapeHtml(generatedAt)}
  </div>
</div>

<script>
(function() {
  'use strict';

  let activeLang = ${JSON.stringify(langs[0] || 'en')};
  let activePlatform = 'all';

  function showLang(lang) {
    activeLang = lang;
    document.querySelectorAll('.lang-section').forEach(function(s) {
      s.classList.toggle('visible', s.dataset.lang === lang);
    });
    document.querySelectorAll('.tab-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
    applyPlatformFilter();
  }

  function applyPlatformFilter() {
    const section = document.querySelector('.lang-section[data-lang="' + activeLang + '"]');
    if (!section) return;
    section.querySelectorAll('.post-card').forEach(function(card) {
      const show = activePlatform === 'all' || card.dataset.platform === activePlatform;
      card.classList.toggle('hidden', !show);
    });
  }

  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { showLang(btn.dataset.lang); });
  });

  document.querySelectorAll('.plat-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      activePlatform = btn.dataset.platform;
      document.querySelectorAll('.plat-btn').forEach(function(b) {
        b.classList.toggle('active', b === btn);
      });
      applyPlatformFilter();
    });
  });

  // Show first language
  showLang(activeLang);
})();
</script>
</body>
</html>`;
}

module.exports = { generatePreviewHtml };
