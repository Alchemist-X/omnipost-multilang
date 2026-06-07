'use strict';

/**
 * connectors/linkedin.js — LinkedIn connector stub.
 * STATUS: STUB — activates only if LINKEDIN_ACCESS_TOKEN env var is set.
 * Real implementation would use the LinkedIn API POST /v2/ugcPosts endpoint.
 *
 * Required env vars (all optional — skipped if missing):
 *   LINKEDIN_ACCESS_TOKEN - OAuth 2.0 access token
 *   LINKEDIN_PERSON_URN   - LinkedIn person URN (urn:li:person:xxxxx)
 */

const LINKEDIN_ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;
const LINKEDIN_PERSON_URN = process.env.LINKEDIN_PERSON_URN;
const LINKEDIN_API_URL = 'https://api.linkedin.com/v2/ugcPosts';

/**
 * Post to LinkedIn.
 * @param {{content: string, lang: string, platform: string}} post
 * @returns {Promise<{success: boolean, connector: string, message: string}>}
 */
async function publish(post) {
  if (!LINKEDIN_ACCESS_TOKEN) {
    return {
      success: false,
      connector: 'linkedin',
      message: 'No token, skipped. Set LINKEDIN_ACCESS_TOKEN to enable.',
      skipped: true,
    };
  }

  // STUB: Real implementation would POST to LinkedIn API
  // Uncomment and complete when tokens are available:
  //
  // if (!LINKEDIN_PERSON_URN) {
  //   throw new Error('[linkedin connector] LINKEDIN_PERSON_URN is required');
  // }
  // try {
  //   const body = {
  //     author: LINKEDIN_PERSON_URN,
  //     lifecycleState: 'PUBLISHED',
  //     specificContent: {
  //       'com.linkedin.ugc.ShareContent': {
  //         shareCommentary: { text: post.content },
  //         shareMediaCategory: 'NONE',
  //       },
  //     },
  //     visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  //   };
  //   const response = await fetch(LINKEDIN_API_URL, {
  //     method: 'POST',
  //     headers: {
  //       Authorization: `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
  //       'Content-Type': 'application/json',
  //       'X-Restli-Protocol-Version': '2.0.0',
  //     },
  //     body: JSON.stringify(body),
  //   });
  //   if (!response.ok) {
  //     const err = await response.text();
  //     throw new Error(`LinkedIn API error ${response.status}: ${err}`);
  //   }
  //   return { success: true, connector: 'linkedin', id: response.headers.get('x-restli-id') };
  // } catch (error) {
  //   throw new Error(`[linkedin connector] ${error.message}`);
  // }

  return {
    success: false,
    connector: 'linkedin',
    message: 'STUB: LinkedIn connector not fully implemented. Token is set but posting is stubbed.',
    skipped: true,
  };
}

module.exports = {
  name: 'linkedin',
  publish,
};
