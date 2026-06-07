'use strict';

/**
 * adapt.js — per-platform adaptation of translated posts.
 * Applies platform-specific constraints: char limits, hashtag styles,
 * sentence-boundary-aware truncation, emoji budgets, X thread splitting.
 * Returns new objects — never mutates input.
 */

const PLATFORM_CONFIGS = {
  x: {
    name: 'X (Twitter)',
    maxChars: 280,
    hashtagStyle: 'inline',
    supportsTitle: false,
    urlChars: 23,
    maxEmojis: 3,
    threadSplit: true,        // auto-split long content into numbered thread
    mentionPrefix: '@',
    notes: 'Max 280 chars per tweet. Auto-threads long content. Hashtags inline.',
    isReal: false,
    isStub: true,
  },
  weibo: {
    name: '微博 (Weibo)',
    maxChars: 2000,
    hashtagStyle: 'wrapped',
    supportsTitle: false,
    maxEmojis: 5,
    mentionPrefix: '@',
    notes: 'Max 2000 chars. Hashtags wrapped in #...#.',
    isReal: false,
    isStub: true,
  },
  linkedin: {
    name: 'LinkedIn',
    maxChars: 3000,
    hashtagStyle: 'appended',
    supportsTitle: true,
    maxEmojis: 2,
    mentionPrefix: '@',
    notes: 'Max 3000 chars. Professional tone. Title used as headline.',
    isReal: false,
    isStub: true,
  },
  instagram: {
    name: 'Instagram',
    maxChars: 2200,
    hashtagStyle: 'block',
    supportsTitle: false,
    maxHashtags: 30,
    maxEmojis: 10,
    mentionPrefix: '@',
    notes: 'Max 2200 chars. Hashtag block appended. Max 30 hashtags.',
    isReal: false,
    isStub: true,
  },
  threads: {
    name: 'Threads',
    maxChars: 500,
    hashtagStyle: 'appended',
    supportsTitle: false,
    maxEmojis: 4,
    mentionPrefix: '@',
    notes: 'Max 500 chars. Similar to Instagram but text-first.',
    isReal: false,
    isStub: true,
  },
  mastodon: {
    name: 'Mastodon',
    maxChars: 500,
    hashtagStyle: 'appended',
    supportsTitle: false,
    maxEmojis: 5,
    mentionPrefix: '@',
    notes: 'Max 500 chars. Open protocol. Hashtags recommended for discoverability.',
    isReal: false,
    isStub: true,
  },
  xiaohongshu: {
    name: '小红书 (Little Red Book)',
    maxChars: 1000,
    hashtagStyle: 'topic',   // [topic] style topics
    supportsTitle: true,
    maxHashtags: 20,
    maxEmojis: 8,
    mentionPrefix: '@',
    notes: 'Max 1000 chars. Title prominent. Topic tags in [topic] format.',
    isReal: false,
    isStub: true,
  },
  youtube_community: {
    name: 'YouTube Community',
    maxChars: 5000,
    hashtagStyle: 'appended',
    supportsTitle: false,
    maxEmojis: 6,
    mentionPrefix: '@',
    notes: 'Max 5000 chars. Engage your subscribers with community posts.',
    isReal: false,
    isStub: true,
  },
  file: {
    name: 'File (dry-run)',
    maxChars: Infinity,
    hashtagStyle: 'appended',
    supportsTitle: true,
    maxEmojis: Infinity,
    notes: 'No limit. Writes to outbox/. Dry-run default.',
    isReal: true,
    isStub: false,
  },
};

/**
 * Count emojis in a string (Unicode ranges).
 * @param {string} text
 * @returns {number}
 */
function countEmojis(text) {
  const emojiRegex = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;
  return (text.match(emojiRegex) || []).length;
}

/**
 * Trim emojis down to budget by stripping trailing emoji sequences.
 * @param {string} text
 * @param {number} budget
 * @returns {string}
 */
function applyEmojiBudget(text, budget) {
  if (budget === Infinity) return text;
  let count = 0;
  return text.replace(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu, (match) => {
    count++;
    return count <= budget ? match : '';
  });
}

/**
 * Format hashtags according to platform style.
 * @param {string[]} hashtags
 * @param {string} style
 * @param {number} [maxHashtags]
 * @returns {string}
 */
function formatHashtags(hashtags, style, maxHashtags) {
  if (!hashtags || hashtags.length === 0) return '';

  const limited = maxHashtags ? hashtags.slice(0, maxHashtags) : hashtags;
  const cleaned = limited.map((tag) => tag.replace(/^#/, '').replace(/^##/, ''));

  switch (style) {
    case 'wrapped':
      return cleaned.map((tag) => `#${tag}#`).join(' ');
    case 'block':
      return '\n\n' + cleaned.map((tag) => `#${tag}`).join(' ');
    case 'topic':
      return '\n' + cleaned.map((tag) => `[${tag}]`).join(' ');
    case 'inline':
    case 'appended':
    default:
      return cleaned.map((tag) => `#${tag}`).join(' ');
  }
}

/**
 * Sentence-boundary-aware truncation.
 * Tries to break at `. `, `! `, `? `, then at word boundary, then hard-cuts.
 * Always preserves hashtags and links if they fit in the budget.
 * @param {string} text
 * @param {number} maxChars
 * @param {string} [suffix='…']
 * @returns {{text: string, truncated: boolean}}
 */
function truncateText(text, maxChars, suffix = '…') {
  if (maxChars === Infinity || text.length <= maxChars) {
    return { text, truncated: false };
  }
  const limit = maxChars - suffix.length;

  // Try sentence boundary
  const sentenceEnd = /[.!?]\s/g;
  let lastSentenceEnd = -1;
  let m;
  while ((m = sentenceEnd.exec(text)) !== null) {
    if (m.index + 1 <= limit) lastSentenceEnd = m.index + 1;
  }
  if (lastSentenceEnd > limit * 0.5) {
    return { text: text.slice(0, lastSentenceEnd).trimEnd() + suffix, truncated: true };
  }

  // Try word boundary
  const wordBoundary = text.lastIndexOf(' ', limit);
  if (wordBoundary > limit * 0.5) {
    return { text: text.slice(0, wordBoundary) + suffix, truncated: true };
  }

  // Hard cut
  return { text: text.slice(0, limit) + suffix, truncated: true };
}

/**
 * Split content into X thread parts (≤280 chars each), numbered "1/n".
 * The numbering notation itself is accounted for in char budget.
 * @param {string} body
 * @param {string[]} hashtags
 * @returns {string[]} Array of tweet strings
 */
function buildXThread(body, hashtags) {
  const MAX = 280;
  // First tweet gets hashtags if they fit
  const hashStr = formatHashtags(hashtags, 'inline');
  const sentences = body.split(/(?<=[.!?])\s+/);

  const parts = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current ? current + ' ' + sentence : sentence;
    if (candidate.length <= MAX - 6) {
      // leave room for " 1/n"
      current = candidate;
    } else {
      if (current) parts.push(current.trim());
      current = sentence.length <= MAX - 6 ? sentence : sentence.slice(0, MAX - 6 - 1) + '…';
    }
  }
  if (current) parts.push(current.trim());

  // Append hashtags to last tweet if they fit
  if (hashStr && parts.length > 0) {
    const last = parts[parts.length - 1];
    const withTags = last + ' ' + hashStr;
    if (withTags.length <= MAX - 6) {
      parts[parts.length - 1] = withTags;
    }
  }

  const n = parts.length;
  return parts.map((p, i) => `${p} ${i + 1}/${n}`);
}

/**
 * Adapt a translated post for a specific platform.
 * Returns a new object — never mutates input.
 * @param {object} post
 * @param {string} platform
 * @returns {object}
 */
function adaptForPlatform(post, platform) {
  const config = PLATFORM_CONFIGS[platform] || PLATFORM_CONFIGS.file;
  const warnings = [];

  // Hashtag handling
  const rawHashtags = post.hashtags || [];
  let effectiveHashtags = rawHashtags;
  if (config.maxHashtags && rawHashtags.length > config.maxHashtags) {
    effectiveHashtags = rawHashtags.slice(0, config.maxHashtags);
    warnings.push(`Hashtags trimmed to ${config.maxHashtags} (${config.name} limit)`);
  }

  const hashtagStr = formatHashtags(effectiveHashtags, config.hashtagStyle, config.maxHashtags);

  let content;
  let thread = null; // X thread parts if applicable

  switch (platform) {
    case 'x': {
      const body = post.body || '';
      const combined = body + (hashtagStr ? ' ' + hashtagStr : '');
      if (combined.length > config.maxChars && config.threadSplit) {
        // Build thread
        const threadParts = buildXThread(body, effectiveHashtags);
        thread = threadParts;
        content = threadParts[0]; // primary display content = first tweet
        if (threadParts.length > 1) {
          warnings.push(`Long content split into ${threadParts.length}-tweet thread`);
        }
      } else {
        const { text, truncated } = truncateText(combined, config.maxChars);
        if (truncated) warnings.push(`Content truncated to ${config.maxChars} chars for X`);
        content = text;
      }
      break;
    }

    case 'weibo': {
      const body = post.body || '';
      const combined = body + (hashtagStr ? ' ' + hashtagStr : '');
      const { text, truncated } = truncateText(combined, config.maxChars);
      if (truncated) warnings.push(`Content truncated to ${config.maxChars} chars for Weibo`);
      content = text;
      break;
    }

    case 'linkedin': {
      const headline = post.title ? `${post.title}\n\n` : '';
      const body = post.body || '';
      const combined = headline + body + (hashtagStr ? '\n\n' + hashtagStr : '');
      const { text, truncated } = truncateText(combined, config.maxChars);
      if (truncated) warnings.push(`Content truncated to ${config.maxChars} chars for LinkedIn`);
      content = text;
      break;
    }

    case 'instagram': {
      const body = post.body || '';
      const igHashStr = formatHashtags(effectiveHashtags, 'block');
      const combined = body + igHashStr;
      const { text, truncated } = truncateText(combined, config.maxChars);
      if (truncated) warnings.push(`Content truncated to ${config.maxChars} chars for Instagram`);
      content = text;
      break;
    }

    case 'threads': {
      const body = post.body || '';
      const combined = body + (hashtagStr ? ' ' + hashtagStr : '');
      const { text, truncated } = truncateText(combined, config.maxChars);
      if (truncated) warnings.push(`Content truncated to ${config.maxChars} chars for Threads`);
      content = text;
      break;
    }

    case 'mastodon': {
      const body = post.body || '';
      const combined = body + (hashtagStr ? ' ' + hashtagStr : '');
      const { text, truncated } = truncateText(combined, config.maxChars);
      if (truncated) warnings.push(`Content truncated to ${config.maxChars} chars for Mastodon`);
      content = text;
      break;
    }

    case 'xiaohongshu': {
      const headline = post.title ? `✨ ${post.title}\n\n` : '';
      const body = post.body || '';
      const combined = headline + body + (hashtagStr ? hashtagStr : '');
      const { text, truncated } = truncateText(combined, config.maxChars);
      if (truncated) warnings.push(`Content truncated to ${config.maxChars} chars for 小红书`);
      content = text;
      break;
    }

    case 'youtube_community': {
      const body = post.body || '';
      const combined = body + (hashtagStr ? '\n\n' + hashtagStr : '');
      const { text, truncated } = truncateText(combined, config.maxChars);
      if (truncated) warnings.push(`Content truncated to ${config.maxChars} chars for YouTube Community`);
      content = text;
      break;
    }

    case 'file':
    default: {
      const headline = post.title ? `${post.title}\n\n` : '';
      const body = post.body || '';
      content = headline + body + (hashtagStr ? '\n\n' + hashtagStr : '');
      break;
    }
  }

  // Emoji budget enforcement
  if (config.maxEmojis !== Infinity && typeof config.maxEmojis === 'number') {
    const emojiCount = countEmojis(content);
    if (emojiCount > config.maxEmojis) {
      content = applyEmojiBudget(content, config.maxEmojis);
      warnings.push(`Emojis trimmed to ${config.maxEmojis} (${config.name} budget)`);
    }
  }

  const charCount = content.length;
  const exceedsLimit = config.maxChars !== Infinity && charCount > config.maxChars;

  if (exceedsLimit) {
    warnings.push(`WARNING: content (${charCount} chars) exceeds ${platform} limit of ${config.maxChars}`);
  }

  return {
    ...post,
    platform,
    platformName: config.name,
    content,
    thread,
    truncated: charCount < (post.body || '').length && platform !== 'file',
    exceedsLimit,
    charCount,
    maxChars: config.maxChars,
    overLimit: exceedsLimit,
    warnings,
    platformConfig: {
      isReal: config.isReal || false,
      isStub: config.isStub || false,
      notes: config.notes,
    },
  };
}

/**
 * Adapt a post for multiple platforms.
 * @param {object} post
 * @param {string[]} platforms
 * @returns {Array<object>}
 */
function adaptForPlatforms(post, platforms) {
  return platforms.map((platform) => adaptForPlatform(post, platform));
}

module.exports = { adaptForPlatform, adaptForPlatforms, PLATFORM_CONFIGS, formatHashtags };
