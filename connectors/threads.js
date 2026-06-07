'use strict';

/**
 * connectors/threads.js — Threads connector stub.
 * STATUS: STUB — activates only if THREADS_ACCESS_TOKEN env var is set.
 * Real implementation would use Meta's Threads API (threads.net).
 *
 * Required env vars (all optional — skipped if missing):
 *   THREADS_ACCESS_TOKEN - OAuth 2.0 access token
 *   THREADS_USER_ID      - Threads user ID
 */

const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;

/**
 * Post to Threads.
 * @param {{content: string, lang: string, platform: string}} post
 * @returns {Promise<{success: boolean, connector: string, message: string, skipped?: boolean}>}
 */
async function publish(post) {
  if (!THREADS_ACCESS_TOKEN) {
    return {
      success: false,
      connector: 'threads',
      message: 'No token, skipped. Set THREADS_ACCESS_TOKEN to enable.',
      skipped: true,
    };
  }

  // STUB: Real implementation would use Meta Threads API
  return {
    success: false,
    connector: 'threads',
    message: 'STUB: Threads connector not fully implemented. Token is set but posting is stubbed.',
    skipped: true,
  };
}

module.exports = { name: 'threads', publish };
