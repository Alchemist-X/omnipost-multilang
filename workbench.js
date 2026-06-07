'use strict';

/**
 * workbench.js — unified comment triage with HTML inbox output.
 * Loads sample-comments.json, translates, scores with intent classification,
 * generates sentiment tags + draft replies, writes outbox/workbench.html.
 * Returns new objects — never mutates input.
 */

const path = require('path');
const fs = require('fs');
const { translatePost } = require('./translate.js');
const { colors, badge, table, isTTY } = require('./cli-colors.js');

const SAMPLE_COMMENTS_PATH = path.resolve(__dirname, 'sample-comments.json');
const OUTBOX_DIR = path.resolve(__dirname, 'outbox');

// ── Intent & priority config ────────────────────────────────────────────────

const INTENT_WEIGHTS = {
  lead: 40,
  question: 30,
  complaint: 25,
  praise: 10,
  spam: -20,
  general: 5,
};

const INTENT_KEYWORDS = {
  lead: ['partnership', 'enterprise', 'discuss', 'collaborate', 'invest', 'purchase', 'buy', 'integrate', 'demo', 'pricing', 'quote', 'opportunity', 'business'],
  question: ['how', 'what', 'where', 'when', 'why', 'does', 'can', 'is', '?', 'help', 'support', '如何', '怎么', 'どうやって', 'どこ', 'いつ', 'なぜ'],
  complaint: ['not work', "doesn't work", 'broken', 'error', 'fail', 'bug', 'crash', 'terrible', 'awful', 'worst', 'useless', '不能用', '浪费', '问题', '错误'],
  praise: ['great', 'love', 'amazing', 'awesome', 'excellent', 'fantastic', 'thank', 'congratul', 'well done', 'perfect', '素晴らしい', '感謝', '好', '喜欢', 'encanta', 'super'],
  spam: ['click here', 'buy now', 'discount', 'free money', 'guaranteed', 'act now', 'limited offer'],
};

const PRIORITY_WEIGHTS = {
  verified: 20,
  followerTiers: [
    { min: 100_000, score: 25 },
    { min: 10_000, score: 15 },
    { min: 1_000, score: 8 },
    { min: 0, score: 2 },
  ],
  recencyHours: { within1: 15, within6: 10, within24: 5, older: 0 },
};

const SENTIMENT_THRESHOLDS = {
  positive: ['love', 'great', 'amazing', 'awesome', 'excellent', 'perfect', 'thank', '素晴らしい', '好', 'encanta', 'super'],
  negative: ['not work', 'broken', 'error', 'fail', 'bug', 'terrible', 'awful', 'useless', '不能用', '浪费', '问题'],
};

// ── Scoring helpers ──────────────────────────────────────────────────────────

/**
 * Classify intent from text and stored type field.
 * @param {{text: string, type: string}} comment
 * @returns {string}
 */
function classifyIntent(comment) {
  const lower = comment.text.toLowerCase();

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return intent;
  }

  // Fall back to stored type if present
  const typeMap = { question: 'question', complaint: 'complaint', praise: 'praise' };
  return typeMap[comment.type] || 'general';
}

/**
 * Classify sentiment.
 * @param {string} text
 * @returns {'positive'|'negative'|'neutral'}
 */
function classifySentiment(text) {
  const lower = text.toLowerCase();
  const pos = SENTIMENT_THRESHOLDS.positive.filter((w) => lower.includes(w)).length;
  const neg = SENTIMENT_THRESHOLDS.negative.filter((w) => lower.includes(w)).length;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

/**
 * Score a comment's priority.
 * @param {object} comment
 * @param {string} intent
 * @returns {number}
 */
function scorePriority(comment, intent) {
  const intentScore = INTENT_WEIGHTS[intent] ?? 5;
  const verifiedScore = comment.verified ? PRIORITY_WEIGHTS.verified : 0;

  const followerScore = PRIORITY_WEIGHTS.followerTiers.reduce((best, tier) => {
    return comment.followers >= tier.min ? Math.max(best, tier.score) : best;
  }, 0);

  const now = new Date();
  const hoursAgo = (now - new Date(comment.timestamp)) / 3_600_000;
  const rw = PRIORITY_WEIGHTS.recencyHours;
  const recencyScore =
    hoursAgo <= 1 ? rw.within1 :
    hoursAgo <= 6 ? rw.within6 :
    hoursAgo <= 24 ? rw.within24 : rw.older;

  return intentScore + verifiedScore + followerScore + recencyScore;
}

/**
 * Priority label from score.
 * @param {number} score
 * @returns {'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'}
 */
function priorityLabel(score) {
  if (score >= 60) return 'CRITICAL';
  if (score >= 45) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

// ── Reply templates ──────────────────────────────────────────────────────────

const REPLY_TEMPLATES = {
  lead: (c) =>
    `Hi @${c.author}! Thank you for reaching out — we'd love to explore this opportunity. Please DM us or email partnerships@omnipost.io to schedule a call.`,
  question: (c) =>
    `Hi @${c.author}! Great question — we'd be happy to help. Could you share more details so we can assist you better? Check our docs at docs.omnipost.io for a quick start.`,
  complaint: (c) =>
    `Hi @${c.author}, we're sorry to hear you're experiencing trouble. Please DM us your details and we'll resolve this promptly — we take all feedback seriously.`,
  praise: (c) =>
    `Thank you so much @${c.author}! We're thrilled you find it useful. Stay tuned for more updates — exciting things are coming!`,
  spam: () => `[No reply recommended — flagged as potential spam]`,
  general: (c) => `Thank you for your feedback, @${c.author}! We appreciate you taking the time to reach out.`,
};

/**
 * Generate a draft reply for a comment.
 * @param {object} comment
 * @param {string} intent
 * @returns {string}
 */
function draftReply(comment, intent) {
  const fn = REPLY_TEMPLATES[intent] || REPLY_TEMPLATES.general;
  return fn(comment);
}

// ── Translation ──────────────────────────────────────────────────────────────

/**
 * Translate a comment's text to the target language.
 * @param {object} comment
 * @param {string} targetLang
 * @returns {Promise<object>}
 */
async function translateComment(comment, targetLang) {
  if (comment.lang === targetLang) {
    return { ...comment, translatedText: comment.text, translationMethod: 'passthrough' };
  }

  try {
    const fakePost = { title: '', body: comment.text };
    const result = await translatePost(fakePost, targetLang, comment.lang);
    return {
      ...comment,
      translatedText: result.body,
      translationMethod: result.translationMethod,
    };
  } catch (error) {
    return {
      ...comment,
      translatedText: `[translation error: ${error.message}] ${comment.text}`,
      translationMethod: 'error',
    };
  }
}

// ── Triage pipeline ──────────────────────────────────────────────────────────

/**
 * Load and fully triage comments.
 * @param {string} targetLang
 * @returns {Promise<Array<object>>}
 */
async function loadAndTriageComments(targetLang = 'en') {
  if (!fs.existsSync(SAMPLE_COMMENTS_PATH)) {
    throw new Error(`sample-comments.json not found at ${SAMPLE_COMMENTS_PATH}`);
  }

  const raw = fs.readFileSync(SAMPLE_COMMENTS_PATH, 'utf8');
  const comments = JSON.parse(raw);

  // Score and classify (immutable map)
  const classified = comments.map((comment) => {
    const intent = classifyIntent(comment);
    const sentiment = classifySentiment(comment.text);
    const priorityScore = scorePriority(comment, intent);
    const draftReplyText = draftReply(comment, intent);
    return { ...comment, intent, sentiment, priorityScore, draftReplyText };
  });

  // Sort by priority descending (immutable)
  const sorted = [...classified].sort((a, b) => b.priorityScore - a.priorityScore);

  // Translate all in parallel
  const translated = await Promise.all(
    sorted.map((comment) => translateComment(comment, targetLang))
  );

  return translated;
}

// ── CLI output ───────────────────────────────────────────────────────────────

/**
 * Format a comment for terminal display.
 */
function formatCommentForDisplay(comment, rank) {
  const priority = priorityLabel(comment.priorityScore);
  const verifiedBadge = comment.verified ? (isTTY ? colors.cyan(' ✓ VERIFIED') : ' [VERIFIED]') : '';
  const method = comment.translationMethod === 'passthrough' ? '' : ` (${comment.translationMethod})`;

  const priorityColors = {
    CRITICAL: colors.red,
    HIGH: colors.yellow,
    MEDIUM: colors.blue,
    LOW: colors.dim,
  };
  const colorFn = priorityColors[priority] || colors.reset;
  const priorityStr = isTTY ? colorFn(`[${priority}]`) : `[${priority}]`;

  const intentColor = comment.intent === 'lead' ? colors.green :
    comment.intent === 'complaint' ? colors.red :
    comment.intent === 'question' ? colors.yellow : colors.dim;
  const intentStr = isTTY ? intentColor(comment.intent.toUpperCase()) : comment.intent.toUpperCase();

  const sentimentEmoji = comment.sentiment === 'positive' ? ' 😊' : comment.sentiment === 'negative' ? ' 😤' : '';

  const lines = [
    `┌─ #${rank} ${priorityStr} Score: ${comment.priorityScore} | Intent: ${intentStr} | Sentiment: ${comment.sentiment}${sentimentEmoji}`,
    `│ ID: ${comment.id} | Platform: ${comment.platform} | Lang: ${comment.lang}`,
    `│ Author: @${comment.author}${verifiedBadge} | Followers: ${comment.followers.toLocaleString()}`,
    `│ Original: ${comment.text}`,
    `│ Translated${method}: ${comment.translatedText}`,
    `│ Suggested Reply: ${comment.draftReplyText}`,
    `│ Posted: ${new Date(comment.timestamp).toLocaleString()}`,
    `└${'─'.repeat(70)}`,
  ];
  return lines.join('\n');
}

// ── HTML generation ──────────────────────────────────────────────────────────

const PRIORITY_COLORS_HTML = {
  CRITICAL: { bg: '#ff4444', text: '#fff' },
  HIGH: { bg: '#ff9900', text: '#fff' },
  MEDIUM: { bg: '#4a90e2', text: '#fff' },
  LOW: { bg: '#555', text: '#aaa' },
};

const INTENT_COLORS_HTML = {
  lead: '#22c55e',
  question: '#f59e0b',
  complaint: '#ef4444',
  praise: '#8b5cf6',
  spam: '#6b7280',
  general: '#64748b',
};

const SENTIMENT_ICONS = {
  positive: '😊',
  negative: '😤',
  neutral: '😐',
};

const PLATFORM_ICONS = {
  x: '✕',
  weibo: '微',
  linkedin: 'in',
  instagram: '📷',
  threads: '◎',
  mastodon: '🐘',
};

/**
 * Escape HTML special characters.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build a single comment card HTML.
 */
function buildCommentCard(comment, rank) {
  const priority = priorityLabel(comment.priorityScore);
  const pColor = PRIORITY_COLORS_HTML[priority];
  const intentColor = INTENT_COLORS_HTML[comment.intent] || '#64748b';
  const platformIcon = PLATFORM_ICONS[comment.platform] || comment.platform;
  const sentimentIcon = SENTIMENT_ICONS[comment.sentiment] || '😐';
  const verifiedBadge = comment.verified
    ? `<span class="badge verified">✓ Verified</span>`
    : '';

  const timeAgo = (() => {
    const diff = Date.now() - new Date(comment.timestamp).getTime();
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return `${Math.floor(diff / 60_000)}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  })();

  return `
      <article class="comment-card" data-platform="${escapeHtml(comment.platform)}" data-priority="${escapeHtml(priority)}" data-intent="${escapeHtml(comment.intent)}" data-id="${escapeHtml(comment.id)}">
        <div class="card-header">
          <div class="rank-badge">#${rank}</div>
          <span class="priority-badge" style="background:${pColor.bg};color:${pColor.text}">${priority}</span>
          <span class="intent-badge" style="color:${intentColor};border-color:${intentColor}">${comment.intent}</span>
          <span class="platform-icon" title="${escapeHtml(comment.platform)}">${platformIcon}</span>
          <div class="author-info">
            <span class="author">@${escapeHtml(comment.author)}</span>
            ${verifiedBadge}
            <span class="followers">${comment.followers.toLocaleString()} followers</span>
          </div>
          <div class="meta-right">
            <span class="sentiment">${sentimentIcon} ${comment.sentiment}</span>
            <span class="score">Score: ${comment.priorityScore}</span>
            <span class="time">${timeAgo}</span>
          </div>
        </div>

        <div class="card-body">
          <div class="original-text">
            <label>Original <span class="lang-tag">${escapeHtml(comment.lang)}</span></label>
            <p>${escapeHtml(comment.text)}</p>
          </div>
          <div class="translated-text">
            <label>Translated <span class="method-tag">${escapeHtml(comment.translationMethod)}</span></label>
            <p>${escapeHtml(comment.translatedText)}</p>
          </div>
        </div>

        <div class="card-reply">
          <label>Suggested Reply</label>
          <div class="reply-box" contenteditable="true">${escapeHtml(comment.draftReplyText)}</div>
          <div class="reply-actions">
            <button class="btn btn-copy" onclick="copyReply(this)">Copy Reply</button>
            <button class="btn btn-dismiss" onclick="dismissCard(this)">Dismiss</button>
          </div>
        </div>
      </article>`;
}

/**
 * Generate the full workbench HTML file.
 * @param {Array<object>} comments
 * @param {string} targetLang
 * @returns {string}
 */
function generateWorkbenchHtml(comments, targetLang) {
  const priorityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  comments.forEach((c) => { priorityCounts[priorityLabel(c.priorityScore)]++; });

  const platforms = [...new Set(comments.map((c) => c.platform))];
  const intents = [...new Set(comments.map((c) => c.intent))];

  const cards = comments.map((c, i) => buildCommentCard(c, i + 1)).join('\n');
  const generatedAt = new Date().toLocaleString();

  const platformFilterBtns = ['all', ...platforms]
    .map((p) => `<button class="filter-btn ${p === 'all' ? 'active' : ''}" data-filter="platform" data-value="${p}">${p === 'all' ? 'All Platforms' : p}</button>`)
    .join('');

  const priorityFilterBtns = ['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
    .map((p) => `<button class="filter-btn ${p === 'all' ? 'active' : ''}" data-filter="priority" data-value="${p}">${p === 'all' ? 'All Priorities' : p}</button>`)
    .join('');

  const intentFilterBtns = ['all', ...intents]
    .map((i) => `<button class="filter-btn ${i === 'all' ? 'active' : ''}" data-filter="intent" data-value="${i}">${i === 'all' ? 'All Intents' : i}</button>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OmniPost Comment Workbench</title>
<style>
  /* ── Reset & base ── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0d0d14;
    --surface: #13131e;
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
    --blue: #4a90e2;
    --radius: 12px;
    --shadow: 0 4px 24px rgba(0,0,0,0.4);
    --font: 'Inter', 'Segoe UI', system-ui, sans-serif;
  }
  html { font-size: 14px; }
  body { background: var(--bg); color: var(--text); font-family: var(--font); min-height: 100vh; }

  /* ── Layout ── */
  .app { display: flex; flex-direction: column; height: 100vh; }
  .sidebar { width: 280px; flex-shrink: 0; background: var(--surface); border-right: 1px solid var(--border); padding: 20px; overflow-y: auto; }
  .main-content { flex: 1; overflow-y: auto; padding: 24px; }
  .layout { display: flex; height: calc(100vh - 72px); }

  /* ── Header ── */
  .app-header {
    background: linear-gradient(135deg, #1a0533 0%, #0d0d14 100%);
    border-bottom: 1px solid var(--border);
    padding: 0 24px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .header-left { display: flex; align-items: center; gap: 16px; }
  .logo { font-size: 22px; font-weight: 800; background: linear-gradient(90deg, #a855f7, #4f46e5); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -0.5px; }
  .header-sub { color: var(--text-muted); font-size: 12px; }
  .header-stats { display: flex; gap: 20px; }
  .stat-item { text-align: center; }
  .stat-num { font-size: 22px; font-weight: 700; color: var(--accent); }
  .stat-label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; }

  /* ── Sidebar ── */
  .sidebar-section { margin-bottom: 24px; }
  .sidebar-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-dim); font-weight: 600; margin-bottom: 10px; }
  .filter-group { display: flex; flex-direction: column; gap: 4px; }
  .filter-btn {
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted);
    padding: 7px 12px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    font-family: var(--font);
    text-align: left;
    transition: all 0.15s;
  }
  .filter-btn:hover { background: var(--surface2); color: var(--text); }
  .filter-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }

  .priority-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .pstat { background: var(--surface2); border-radius: 8px; padding: 10px; text-align: center; border: 1px solid var(--border); }
  .pstat-num { font-size: 20px; font-weight: 700; }
  .pstat-label { font-size: 10px; color: var(--text-dim); }
  .pstat.CRITICAL .pstat-num { color: #ff4444; }
  .pstat.HIGH .pstat-num { color: #ff9900; }
  .pstat.MEDIUM .pstat-num { color: #4a90e2; }
  .pstat.LOW .pstat-num { color: #555; }

  .search-box {
    width: 100%;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
    color: var(--text);
    font-family: var(--font);
    font-size: 13px;
    outline: none;
  }
  .search-box:focus { border-color: var(--accent); }
  .search-box::placeholder { color: var(--text-dim); }

  /* ── Comment cards ── */
  .comments-list { display: flex; flex-direction: column; gap: 16px; max-width: 860px; }
  .comment-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    transition: border-color 0.2s, transform 0.15s;
  }
  .comment-card:hover { border-color: var(--accent); transform: translateY(-1px); }
  .comment-card.dismissed { opacity: 0.3; pointer-events: none; }

  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: var(--surface2);
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .rank-badge { font-size: 11px; font-weight: 700; color: var(--text-dim); min-width: 24px; }
  .priority-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .intent-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: transparent;
  }
  .platform-icon {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 7px;
    border-radius: 4px;
    background: var(--surface3);
    color: var(--text-muted);
  }
  .author-info { display: flex; align-items: center; gap: 6px; }
  .author { font-weight: 600; font-size: 13px; }
  .followers { font-size: 11px; color: var(--text-dim); }
  .badge { font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 600; }
  .badge.verified { background: #164e63; color: #67e8f9; }
  .meta-right { margin-left: auto; display: flex; align-items: center; gap: 12px; font-size: 11px; color: var(--text-dim); }
  .sentiment { font-size: 12px; }
  .score { font-weight: 700; color: var(--accent); }

  .card-body { padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; border-bottom: 1px solid var(--border); }
  .original-text label, .translated-text label {
    display: flex; align-items: center; gap: 6px;
    font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
    color: var(--text-dim); margin-bottom: 6px;
  }
  .lang-tag, .method-tag {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--surface3);
    color: var(--text-muted);
    text-transform: none;
    letter-spacing: 0;
  }
  .card-body p { font-size: 13px; line-height: 1.5; color: var(--text); }
  .original-text p { color: var(--text-muted); }

  .card-reply { padding: 14px 16px; background: var(--surface2); }
  .card-reply label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); display: block; margin-bottom: 8px; }
  .reply-box {
    background: var(--surface3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text);
    min-height: 48px;
    outline: none;
    font-family: var(--font);
  }
  .reply-box:focus { border-color: var(--accent); }
  .reply-actions { display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end; }
  .btn {
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 11px;
    font-family: var(--font);
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: opacity 0.15s, transform 0.1s;
  }
  .btn:hover { opacity: 0.85; transform: translateY(-1px); }
  .btn-copy { background: var(--accent); color: #fff; }
  .btn-dismiss { background: var(--surface3); color: var(--text-muted); border: 1px solid var(--border); }
  .btn-dismiss:hover { color: var(--red); border-color: var(--red); }

  /* ── Empty state ── */
  .empty-state { text-align: center; padding: 60px 20px; color: var(--text-dim); }
  .empty-state .icon { font-size: 48px; margin-bottom: 16px; }
  .empty-state p { font-size: 14px; }

  /* ── Footer ── */
  .workbench-footer {
    font-size: 11px;
    color: var(--text-dim);
    text-align: center;
    padding: 20px;
    border-top: 1px solid var(--border);
    margin-top: 32px;
  }

  /* ── Responsive ── */
  @media (max-width: 700px) {
    .layout { flex-direction: column; height: auto; }
    .sidebar { width: 100%; border-right: none; border-bottom: 1px solid var(--border); }
    .card-body { grid-template-columns: 1fr; }
    .header-stats { display: none; }
  }
</style>
</head>
<body>
<div class="app">
  <!-- Header -->
  <header class="app-header">
    <div class="header-left">
      <div>
        <div class="logo">OmniPost</div>
        <div class="header-sub">Comment Workbench — Display: ${escapeHtml(targetLang)} — Generated ${escapeHtml(generatedAt)}</div>
      </div>
    </div>
    <div class="header-stats">
      <div class="stat-item">
        <div class="stat-num">${comments.length}</div>
        <div class="stat-label">Total</div>
      </div>
      <div class="stat-item">
        <div class="stat-num" style="color:#ff4444">${priorityCounts.CRITICAL}</div>
        <div class="stat-label">Critical</div>
      </div>
      <div class="stat-item">
        <div class="stat-num" style="color:#ff9900">${priorityCounts.HIGH}</div>
        <div class="stat-label">High</div>
      </div>
      <div class="stat-item">
        <div class="stat-num" style="color:#4a90e2">${priorityCounts.MEDIUM}</div>
        <div class="stat-label">Medium</div>
      </div>
    </div>
  </header>

  <div class="layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-section">
        <div class="sidebar-label">Search</div>
        <input class="search-box" type="text" placeholder="Search comments..." oninput="handleSearch(this.value)">
      </div>

      <div class="sidebar-section">
        <div class="sidebar-label">Priority Overview</div>
        <div class="priority-summary">
          ${['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => `
          <div class="pstat ${p}">
            <div class="pstat-num">${priorityCounts[p]}</div>
            <div class="pstat-label">${p}</div>
          </div>`).join('')}
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-label">Filter by Platform</div>
        <div class="filter-group">${platformFilterBtns}</div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-label">Filter by Priority</div>
        <div class="filter-group">${priorityFilterBtns}</div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-label">Filter by Intent</div>
        <div class="filter-group">${intentFilterBtns}</div>
      </div>
    </aside>

    <!-- Main -->
    <main class="main-content">
      <div class="comments-list" id="commentsList">
        ${cards}
      </div>
      <div class="empty-state" id="emptyState" style="display:none">
        <div class="icon">🎉</div>
        <p>No comments match your filters.</p>
      </div>
      <div class="workbench-footer">
        OmniPost Workbench · ${comments.length} comments triaged · Generated ${escapeHtml(generatedAt)}
      </div>
    </main>
  </div>
</div>

<script>
(function() {
  'use strict';

  // Active filters state (immutable-style updates)
  let state = { platform: 'all', priority: 'all', intent: 'all', search: '' };

  function applyFilters(newState) {
    state = Object.assign({}, state, newState);

    const cards = document.querySelectorAll('.comment-card');
    let visible = 0;
    cards.forEach(function(card) {
      const platform = card.dataset.platform;
      const priority = card.dataset.priority;
      const intent = card.dataset.intent;
      const text = card.textContent.toLowerCase();
      const search = state.search.toLowerCase();

      const matchPlatform = state.platform === 'all' || platform === state.platform;
      const matchPriority = state.priority === 'all' || priority === state.priority;
      const matchIntent = state.intent === 'all' || intent === state.intent;
      const matchSearch = !search || text.includes(search);

      const show = matchPlatform && matchPriority && matchIntent && matchSearch;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    const empty = document.getElementById('emptyState');
    if (empty) empty.style.display = visible === 0 ? '' : 'none';
  }

  // Filter button clicks
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;

    const filterType = btn.dataset.filter;
    const value = btn.dataset.value;

    // Update active button in this group
    btn.closest('.filter-group').querySelectorAll('.filter-btn').forEach(function(b) {
      b.classList.toggle('active', b === btn);
    });

    applyFilters({ [filterType]: value });
  });

  // Search
  window.handleSearch = function(value) {
    applyFilters({ search: value });
  };

  // Copy reply
  window.copyReply = function(btn) {
    const replyBox = btn.closest('.card-reply').querySelector('.reply-box');
    const text = replyBox.textContent || replyBox.innerText || '';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function() {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = orig; }, 1500);
      });
    }
  };

  // Dismiss card
  window.dismissCard = function(btn) {
    const card = btn.closest('.comment-card');
    if (card) card.classList.toggle('dismissed');
  };
})();
</script>
</body>
</html>`;
}

// ── Main entry ───────────────────────────────────────────────────────────────

/**
 * Run the workbench.
 * @param {string} [targetLang='en']
 */
async function runWorkbench(targetLang = 'en') {
  try {
    if (isTTY) {
      process.stdout.write(`\n${colors.bold('─'.repeat(70))}\n`);
      process.stdout.write(`  ${colors.bold(colors.magenta('OMNIPOST COMMENT WORKBENCH'))} — Unified Triage\n`);
      process.stdout.write(`  Display language: ${colors.cyan(targetLang)} | Source: sample-comments.json\n`);
      process.stdout.write(`${'─'.repeat(70)}\n\n`);
    } else {
      process.stdout.write(`\n${'='.repeat(70)}\n`);
      process.stdout.write(`  OMNIPOST COMMENT WORKBENCH — Unified Triage\n`);
      process.stdout.write(`  Display language: ${targetLang} | Source: sample-comments.json\n`);
      process.stdout.write(`${'='.repeat(70)}\n\n`);
    }

    process.stdout.write('Scoring, classifying, and translating comments...\n\n');

    const comments = await loadAndTriageComments(targetLang);

    comments.forEach((comment, index) => {
      process.stdout.write(formatCommentForDisplay(comment, index + 1) + '\n\n');
    });

    // Priority breakdown
    const breakdown = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => {
      const count = comments.filter((c) => priorityLabel(c.priorityScore) === p).length;
      return `${p}: ${count}`;
    }).join(' | ');

    process.stdout.write(`${'─'.repeat(70)}\n`);
    process.stdout.write(`Total: ${comments.length} | ${breakdown}\n`);
    process.stdout.write(`${'─'.repeat(70)}\n\n`);

    // Write HTML workbench
    if (!fs.existsSync(OUTBOX_DIR)) {
      fs.mkdirSync(OUTBOX_DIR, { recursive: true });
    }
    const htmlPath = path.join(OUTBOX_DIR, 'workbench.html');
    const html = generateWorkbenchHtml(comments, targetLang);
    fs.writeFileSync(htmlPath, html, 'utf8');

    process.stdout.write(`Workbench HTML written to: ${htmlPath}\n`);
    process.stdout.write(`Size: ${(html.length / 1024).toFixed(1)} KB\n\n`);

  } catch (error) {
    process.stderr.write(`[workbench] Error: ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = { runWorkbench, loadAndTriageComments, priorityLabel };
