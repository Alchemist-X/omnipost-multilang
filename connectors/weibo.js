'use strict';

/**
 * connectors/weibo.js — Weibo connector stub.
 * STATUS: STUB — activates only if WEIBO_ACCESS_TOKEN env var is set.
 * Real implementation would use the Weibo Open API POST /2/statuses/share.json
 *
 * Required env vars (all optional — skipped if missing):
 *   WEIBO_ACCESS_TOKEN  - OAuth 2.0 access token from Weibo
 *   WEIBO_APP_KEY       - Weibo app key
 */

const WEIBO_ACCESS_TOKEN = process.env.WEIBO_ACCESS_TOKEN;
const WEIBO_API_URL = 'https://api.weibo.com/2/statuses/share.json';

/**
 * Post to Weibo.
 * @param {{content: string, lang: string, platform: string}} post
 * @returns {Promise<{success: boolean, connector: string, message: string}>}
 */
async function publish(post) {
  if (!WEIBO_ACCESS_TOKEN) {
    return {
      success: false,
      connector: 'weibo',
      message: 'No token, skipped. Set WEIBO_ACCESS_TOKEN to enable.',
      skipped: true,
    };
  }

  // STUB: Real implementation would POST to Weibo API
  // Uncomment and complete when tokens are available:
  //
  // try {
  //   const params = new URLSearchParams({
  //     access_token: WEIBO_ACCESS_TOKEN,
  //     status: post.content,
  //   });
  //   const response = await fetch(WEIBO_API_URL, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  //     body: params.toString(),
  //   });
  //   if (!response.ok) {
  //     const err = await response.text();
  //     throw new Error(`Weibo API error ${response.status}: ${err}`);
  //   }
  //   const data = await response.json();
  //   return { success: true, connector: 'weibo', id: data.id };
  // } catch (error) {
  //   throw new Error(`[weibo connector] ${error.message}`);
  // }

  return {
    success: false,
    connector: 'weibo',
    message: 'STUB: Weibo connector not fully implemented. Token is set but posting is stubbed.',
    skipped: true,
  };
}

module.exports = {
  name: 'weibo',
  publish,
};
