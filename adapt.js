'use strict';

/**
 * adapt.js — per-platform adaptation of translated posts.
 * Applies platform-specific constraints: character limits, hashtag styles, formatting.
 * Returns new objects — never mutates input.
 */

const PLATFORM_CONFIGS = {
  x: {
    name: 'X (Twitter)',
    maxChars: 280,
    hashtagStyle: 'inline',      // hashtags inline with text or appended
    supportsTitle: false,
    urlChars: 23,                 // Twitter counts URLs as 23 chars
    notes: 'Max 280 chars. Hashtags inline or appended.',
  },
  weibo: {
    name: '微博 (Weibo)',
    maxChars: 2000,
    hashtagStyle: 'wrapped',     // #hashtag# style
    supportsTitle: false,
    notes: 'Max 2000 chars. Hashtags wrapped in #...#.',
  },
  linkedin: {
    name: 'LinkedIn',
    maxChars: 3000,
    hashtagStyle: 'appended',
    supportsTitle: true,
    notes: 'Max 3000 chars. Professional tone. Title used as headline.',
  },
  instagram: {
    name: 'Instagram',
    maxChars: 2200,
    hashtagStyle: 'block',       // hashtag block at end separated by line
    supportsTitle: false,
    maxHashtags: 30,
    notes: 'Max 2200 chars. Hashtag block appended. Max 30 hashtags.',
  },
  file: {
    name: 'File (dry-run)',
    maxChars: Infinity,
    hashtagStyle: 'appended',
    supportsTitle: true,
    notes: 'No limit. Writes to outbox/. Dry-run default.',
  },
};

/**
 * Format hashtags according to platform style.
 * @param {string[]} hashtags
 * @param {string} style - 'inline' | 'appended' | 'wrapped' | 'block'
 * @param {number} [maxHashtags]
 * @returns {string}
 */
function formatHashtags(hashtags, style, maxHashtags) {
  if (!hashtags || hashtags.length === 0) return '';

  const limited = maxHashtags ? hashtags.slice(0, maxHashtags) : hashtags;
  const cleaned = limited.map((tag) => tag.replace(/^#/, ''));

  switch (style) {
    case 'wrapped':
      return cleaned.map((tag) => `#${tag}#`).join(' ');
    case 'block':
      return '\n\n' + cleaned.map((tag) => `#${tag}`).join(' ');
    case 'inline':
    case 'appended':
    default:
      return cleaned.map((tag) => `#${tag}`).join(' ');
  }
}

/**
 * Truncate text to maxChars, appending ellipsis if needed.
 * @param {string} text
 * @param {number} maxChars
 * @returns {{text: string, truncated: boolean}}
 */
function truncateText(text, maxChars) {
  if (maxChars === Infinity || text.length <= maxChars) {
    return { text, truncated: false };
  }
  const ellipsis = '…';
  return {
    text: text.slice(0, maxChars - ellipsis.length) + ellipsis,
    truncated: true,
  };
}

/**
 * Adapt a translated post for a specific platform.
 * Returns a new object — never mutates input.
 * @param {{title: string, body: string, hashtags?: string[], lang: string, [key: string]: any}} post
 * @param {string} platform - Platform key (x, weibo, linkedin, instagram, file)
 * @returns {{
 *   ...post,
 *   platform: string,
 *   platformName: string,
 *   content: string,
 *   truncated: boolean,
 *   exceedsLimit: boolean,
 *   charCount: number,
 *   maxChars: number,
 *   warnings: string[]
 * }}
 */
function adaptForPlatform(post, platform) {
  const config = PLATFORM_CONFIGS[platform] || PLATFORM_CONFIGS.file;
  const warnings = [];

  const hashtagStr = formatHashtags(
    post.hashtags,
    config.hashtagStyle,
    config.maxHashtags
  );

  let content;

  switch (platform) {
    case 'x': {
      // Twitter: body + hashtags, no title
      const body = post.body || '';
      const separator = hashtagStr ? ' ' : '';
      const combined = body + separator + hashtagStr;
      const { text, truncated } = truncateText(combined, config.maxChars);
      if (truncated) {
        warnings.push(`Content truncated to ${config.maxChars} chars for X`);
      }
      content = text;
      break;
    }

    case 'weibo': {
      const body = post.body || '';
      const separator = hashtagStr ? ' ' : '';
      const combined = body + separator + hashtagStr;
      const { text, truncated } = truncateText(combined, config.maxChars);
      if (truncated) {
        warnings.push(`Content truncated to ${config.maxChars} chars for Weibo`);
      }
      content = text;
      break;
    }

    case 'linkedin': {
      // LinkedIn: title as headline + body + hashtags
      const headline = post.title ? `${post.title}\n\n` : '';
      const body = post.body || '';
      const separator = hashtagStr ? '\n\n' : '';
      const combined = headline + body + separator + hashtagStr;
      const { text, truncated } = truncateText(combined, config.maxChars);
      if (truncated) {
        warnings.push(`Content truncated to ${config.maxChars} chars for LinkedIn`);
      }
      content = text;
      break;
    }

    case 'instagram': {
      // Instagram: body + hashtag block
      const body = post.body || '';
      const effectiveHashtags = post.hashtags ? post.hashtags.slice(0, config.maxHashtags) : [];
      if (post.hashtags && post.hashtags.length > config.maxHashtags) {
        warnings.push(`Hashtags trimmed to ${config.maxHashtags} (Instagram limit)`);
      }
      const igHashtagStr = formatHashtags(effectiveHashtags, 'block');
      const combined = body + igHashtagStr;
      const { text, truncated } = truncateText(combined, config.maxChars);
      if (truncated) {
        warnings.push(`Content truncated to ${config.maxChars} chars for Instagram`);
      }
      content = text;
      break;
    }

    case 'file':
    default: {
      const headline = post.title ? `${post.title}\n\n` : '';
      const body = post.body || '';
      const separator = hashtagStr ? '\n\n' : '';
      content = headline + body + separator + hashtagStr;
      break;
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
    platformName: config.platformName || config.name,
    content,
    truncated: charCount < (post.body || '').length,
    exceedsLimit,
    charCount,
    maxChars: config.maxChars,
    warnings,
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

module.exports = { adaptForPlatform, adaptForPlatforms, PLATFORM_CONFIGS };
