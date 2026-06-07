'use strict';

/**
 * connectors/file.js — Real file connector (dry-run default).
 * Writes each adapted post to outbox/<platform>/<lang>.txt
 * STATUS: REAL (no tokens required)
 */

const fs = require('fs');
const path = require('path');

const OUTBOX_DIR = path.resolve(process.cwd(), 'outbox');

/**
 * Ensure a directory exists, creating it recursively if needed.
 * @param {string} dir
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * File connector — writes post content to outbox/<platform>/<lang>.txt
 * @param {{platform: string, lang: string, content: string, title?: string, warnings?: string[]}} post
 * @returns {Promise<{success: boolean, path: string, connector: string}>}
 */
async function publish(post) {
  try {
    const platformDir = path.join(OUTBOX_DIR, post.platform || 'file');
    ensureDir(platformDir);

    const filename = `${post.lang || 'unknown'}.txt`;
    const filePath = path.join(platformDir, filename);

    const header = [
      `Platform: ${post.platformName || post.platform}`,
      `Language: ${post.lang}`,
      `Translation: ${post.translationMethod || 'unknown'}`,
      `Chars: ${post.charCount || post.content?.length || 0}`,
      post.warnings && post.warnings.length > 0 ? `Warnings: ${post.warnings.join('; ')}` : null,
      '---',
      '',
    ]
      .filter(Boolean)
      .join('\n');

    const fileContent = header + (post.content || '');

    fs.writeFileSync(filePath, fileContent, 'utf8');

    return {
      success: true,
      path: filePath,
      connector: 'file',
    };
  } catch (error) {
    throw new Error(`[file connector] Failed to write post: ${error.message}`);
  }
}

module.exports = {
  name: 'file',
  publish,
};
