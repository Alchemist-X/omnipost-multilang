'use strict';

/**
 * connectors/mastodon.js — Mastodon connector stub.
 * STATUS: STUB — activates only if MASTODON_ACCESS_TOKEN env var is set.
 * Real implementation would POST to the Mastodon /api/v1/statuses endpoint
 * on your instance (e.g. mastodon.social).
 *
 * Required env vars (all optional — skipped if missing):
 *   MASTODON_ACCESS_TOKEN  - OAuth 2.0 access token
 *   MASTODON_INSTANCE_URL  - Your Mastodon instance URL (default: https://mastodon.social)
 */

const MASTODON_ACCESS_TOKEN = process.env.MASTODON_ACCESS_TOKEN;
const MASTODON_INSTANCE_URL = process.env.MASTODON_INSTANCE_URL || 'https://mastodon.social';

/**
 * Post to Mastodon.
 * @param {{content: string, lang: string, platform: string}} post
 * @returns {Promise<{success: boolean, connector: string, message: string, skipped?: boolean}>}
 */
async function publish(post) {
  if (!MASTODON_ACCESS_TOKEN) {
    return {
      success: false,
      connector: 'mastodon',
      message: 'No token, skipped. Set MASTODON_ACCESS_TOKEN to enable.',
      skipped: true,
    };
  }

  // STUB: Real implementation would POST to Mastodon API
  // try {
  //   const response = await fetch(`${MASTODON_INSTANCE_URL}/api/v1/statuses`, {
  //     method: 'POST',
  //     headers: {
  //       Authorization: `Bearer ${MASTODON_ACCESS_TOKEN}`,
  //       'Content-Type': 'application/json',
  //     },
  //     body: JSON.stringify({ status: post.content, language: post.lang }),
  //   });
  //   if (!response.ok) throw new Error(`Mastodon API error ${response.status}: ${await response.text()}`);
  //   const data = await response.json();
  //   return { success: true, connector: 'mastodon', id: data.id };
  // } catch (error) {
  //   throw new Error(`[mastodon connector] ${error.message}`);
  // }

  return {
    success: false,
    connector: 'mastodon',
    message: 'STUB: Mastodon connector not fully implemented. Token is set but posting is stubbed.',
    skipped: true,
  };
}

module.exports = { name: 'mastodon', publish };
