'use strict';

/**
 * connectors/xiaohongshu.js — 小红书 (Little Red Book / XHS) connector stub.
 * STATUS: STUB — activates only if XHS_ACCESS_TOKEN env var is set.
 * Real implementation would use the Xiaohongshu Open Platform API.
 * Note: XHS requires image content for most post types.
 *
 * Required env vars (all optional — skipped if missing):
 *   XHS_ACCESS_TOKEN  - Xiaohongshu OAuth access token
 *   XHS_USER_ID       - Xiaohongshu user ID
 */

const XHS_ACCESS_TOKEN = process.env.XHS_ACCESS_TOKEN;

/**
 * Post to Xiaohongshu (小红书).
 * @param {{content: string, lang: string, platform: string, title?: string}} post
 * @returns {Promise<{success: boolean, connector: string, message: string, skipped?: boolean}>}
 */
async function publish(post) {
  if (!XHS_ACCESS_TOKEN) {
    return {
      success: false,
      connector: 'xiaohongshu',
      message: 'No token, skipped. Set XHS_ACCESS_TOKEN to enable.',
      skipped: true,
    };
  }

  // STUB: Real implementation would use Xiaohongshu Open Platform API
  return {
    success: false,
    connector: 'xiaohongshu',
    message: 'STUB: 小红书 connector not fully implemented. Note: XHS typically requires images.',
    skipped: true,
  };
}

module.exports = { name: 'xiaohongshu', publish };
