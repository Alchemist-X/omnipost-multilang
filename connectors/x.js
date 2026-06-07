'use strict';

/**
 * connectors/x.js — X (Twitter) connector stub.
 * STATUS: STUB — activates only if X_BEARER_TOKEN env var is set.
 * Real implementation would use the Twitter API v2 POST /2/tweets endpoint.
 *
 * Required env vars (all optional — skipped if missing):
 *   X_BEARER_TOKEN      - OAuth 2.0 Bearer token
 *   X_API_KEY           - App API key (for OAuth 1.0a)
 *   X_API_SECRET        - App API secret
 *   X_ACCESS_TOKEN      - User access token
 *   X_ACCESS_SECRET     - User access secret
 */

const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;
const X_API_URL = 'https://api.twitter.com/2/tweets';

/**
 * Post a tweet to X (Twitter).
 * @param {{content: string, lang: string, platform: string}} post
 * @returns {Promise<{success: boolean, connector: string, message: string, id?: string}>}
 */
async function publish(post) {
  if (!X_BEARER_TOKEN) {
    return {
      success: false,
      connector: 'x',
      message: 'No token, skipped. Set X_BEARER_TOKEN to enable.',
      skipped: true,
    };
  }

  // STUB: Real implementation would POST to Twitter API v2
  // Uncomment and complete when tokens are available:
  //
  // try {
  //   const response = await fetch(X_API_URL, {
  //     method: 'POST',
  //     headers: {
  //       'Authorization': `Bearer ${X_BEARER_TOKEN}`,
  //       'Content-Type': 'application/json',
  //     },
  //     body: JSON.stringify({ text: post.content }),
  //   });
  //   if (!response.ok) {
  //     const err = await response.text();
  //     throw new Error(`X API error ${response.status}: ${err}`);
  //   }
  //   const data = await response.json();
  //   return { success: true, connector: 'x', id: data.data.id };
  // } catch (error) {
  //   throw new Error(`[x connector] ${error.message}`);
  // }

  return {
    success: false,
    connector: 'x',
    message: 'STUB: X connector not fully implemented. Token is set but posting is stubbed.',
    skipped: true,
  };
}

module.exports = {
  name: 'x',
  publish,
};
