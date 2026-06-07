'use strict';

/**
 * connectors/instagram.js — Instagram connector stub.
 * STATUS: STUB — activates only if INSTAGRAM_ACCESS_TOKEN env var is set.
 * Real implementation would use the Instagram Graph API (requires Facebook Business account).
 * Flow: POST /v18.0/{ig-user-id}/media → POST /v18.0/{ig-user-id}/media_publish
 *
 * Required env vars (all optional — skipped if missing):
 *   INSTAGRAM_ACCESS_TOKEN - Instagram Graph API access token
 *   INSTAGRAM_USER_ID      - Instagram Business/Creator account user ID
 */

const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID;
const INSTAGRAM_API_BASE = 'https://graph.facebook.com/v18.0';

/**
 * Post to Instagram.
 * @param {{content: string, lang: string, platform: string}} post
 * @returns {Promise<{success: boolean, connector: string, message: string}>}
 */
async function publish(post) {
  if (!INSTAGRAM_ACCESS_TOKEN) {
    return {
      success: false,
      connector: 'instagram',
      message: 'No token, skipped. Set INSTAGRAM_ACCESS_TOKEN to enable.',
      skipped: true,
    };
  }

  // STUB: Real implementation would use Instagram Graph API
  // Note: Instagram requires an image/video — text-only posts are not supported.
  // Uncomment and complete when tokens are available:
  //
  // if (!INSTAGRAM_USER_ID) {
  //   throw new Error('[instagram connector] INSTAGRAM_USER_ID is required');
  // }
  // try {
  //   // Step 1: Create media container (requires image_url or video_url)
  //   const createRes = await fetch(
  //     `${INSTAGRAM_API_BASE}/${INSTAGRAM_USER_ID}/media?` +
  //     new URLSearchParams({
  //       image_url: post.imageUrl || '',  // Required: must be a public URL
  //       caption: post.content,
  //       access_token: INSTAGRAM_ACCESS_TOKEN,
  //     })
  //   , { method: 'POST' });
  //   if (!createRes.ok) throw new Error(`Create media failed: ${await createRes.text()}`);
  //   const { id: containerId } = await createRes.json();
  //
  //   // Step 2: Publish media container
  //   const publishRes = await fetch(
  //     `${INSTAGRAM_API_BASE}/${INSTAGRAM_USER_ID}/media_publish`, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  //     body: new URLSearchParams({ creation_id: containerId, access_token: INSTAGRAM_ACCESS_TOKEN }),
  //   });
  //   if (!publishRes.ok) throw new Error(`Publish failed: ${await publishRes.text()}`);
  //   const data = await publishRes.json();
  //   return { success: true, connector: 'instagram', id: data.id };
  // } catch (error) {
  //   throw new Error(`[instagram connector] ${error.message}`);
  // }

  return {
    success: false,
    connector: 'instagram',
    message: 'STUB: Instagram connector not fully implemented. Note: Instagram requires image/video media; text-only posts are not supported by the Graph API.',
    skipped: true,
  };
}

module.exports = {
  name: 'instagram',
  publish,
};
