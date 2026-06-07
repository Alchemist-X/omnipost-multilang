'use strict';

/**
 * connectors/youtube_community.js — YouTube Community Post connector stub.
 * STATUS: STUB — activates only if YOUTUBE_API_KEY env var is set.
 * Real implementation would use the YouTube Data API v3 (activities.insert).
 *
 * Required env vars (all optional — skipped if missing):
 *   YOUTUBE_API_KEY     - YouTube Data API v3 key
 *   YOUTUBE_CHANNEL_ID  - Your YouTube channel ID
 *   YOUTUBE_OAUTH_TOKEN - OAuth 2.0 token for posting (separate from API key)
 */

const YOUTUBE_OAUTH_TOKEN = process.env.YOUTUBE_OAUTH_TOKEN;

/**
 * Post a YouTube Community update.
 * @param {{content: string, lang: string, platform: string}} post
 * @returns {Promise<{success: boolean, connector: string, message: string, skipped?: boolean}>}
 */
async function publish(post) {
  if (!YOUTUBE_OAUTH_TOKEN) {
    return {
      success: false,
      connector: 'youtube_community',
      message: 'No token, skipped. Set YOUTUBE_OAUTH_TOKEN to enable.',
      skipped: true,
    };
  }

  // STUB: Real implementation would use YouTube Data API v3
  return {
    success: false,
    connector: 'youtube_community',
    message: 'STUB: YouTube Community connector not fully implemented. Token is set but posting is stubbed.',
    skipped: true,
  };
}

module.exports = { name: 'youtube_community', publish };
