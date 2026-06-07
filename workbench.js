'use strict';

/**
 * workbench.js — unified comment triage demo.
 * Loads sample-comments.json, translates each comment to the user's language,
 * scores priority with a heuristic, sorts, and displays a ranked workbench.
 * Dry-run: outputs to terminal only.
 */

const path = require('path');
const fs = require('fs');
const { translatePost } = require('./translate.js');

const SAMPLE_COMMENTS_PATH = path.resolve(__dirname, 'sample-comments.json');

// Priority scoring weights
const PRIORITY_WEIGHTS = {
  type: {
    question: 30,
    complaint: 25,
    praise: 10,
  },
  verified: 20,
  followerTiers: [
    { min: 100000, score: 25 },
    { min: 10000, score: 15 },
    { min: 1000, score: 8 },
    { min: 0, score: 2 },
  ],
  recencyHours: {
    within1: 15,
    within6: 10,
    within24: 5,
    older: 0,
  },
};

/**
 * Calculate a priority score for a comment.
 * @param {{type: string, verified: boolean, followers: number, timestamp: string}} comment
 * @returns {number}
 */
function scorePriority(comment) {
  const typeScore = PRIORITY_WEIGHTS.type[comment.type] || 5;
  const verifiedScore = comment.verified ? PRIORITY_WEIGHTS.verified : 0;

  const followerScore = PRIORITY_WEIGHTS.followerTiers.reduce((score, tier) => {
    if (comment.followers >= tier.min) {
      return Math.max(score, tier.score);
    }
    return score;
  }, 0);

  const now = new Date();
  const commentTime = new Date(comment.timestamp);
  const hoursAgo = (now - commentTime) / (1000 * 60 * 60);

  let recencyScore;
  if (hoursAgo <= 1) recencyScore = PRIORITY_WEIGHTS.recencyHours.within1;
  else if (hoursAgo <= 6) recencyScore = PRIORITY_WEIGHTS.recencyHours.within6;
  else if (hoursAgo <= 24) recencyScore = PRIORITY_WEIGHTS.recencyHours.within24;
  else recencyScore = PRIORITY_WEIGHTS.recencyHours.older;

  return typeScore + verifiedScore + followerScore + recencyScore;
}

/**
 * Translate a comment's text to the target language.
 * Returns a new comment object — never mutates input.
 * @param {{id: string, text: string, lang: string, [key: string]: any}} comment
 * @param {string} targetLang
 * @returns {Promise<{...comment, translatedText: string, translationMethod: string}>}
 */
async function translateComment(comment, targetLang) {
  if (comment.lang === targetLang) {
    return { ...comment, translatedText: comment.text, translationMethod: 'passthrough' };
  }

  try {
    const fakePost = { title: '', body: comment.text };
    const result = await translatePost(fakePost, targetLang, comment.lang);
    return {
      ...comment,
      translatedText: result.body,
      translationMethod: result.translationMethod,
    };
  } catch (error) {
    return {
      ...comment,
      translatedText: `[translation error: ${error.message}] ${comment.text}`,
      translationMethod: 'error',
    };
  }
}

/**
 * Load and triage comments from the sample file.
 * @param {string} targetLang - Language code to translate comments into.
 * @returns {Promise<Array<{...comment, priorityScore: number, translatedText: string}>>}
 */
async function loadAndTriageComments(targetLang = 'en') {
  if (!fs.existsSync(SAMPLE_COMMENTS_PATH)) {
    throw new Error(`sample-comments.json not found at ${SAMPLE_COMMENTS_PATH}`);
  }

  const raw = fs.readFileSync(SAMPLE_COMMENTS_PATH, 'utf8');
  const comments = JSON.parse(raw);

  // Score all comments
  const scored = comments.map((comment) => ({
    ...comment,
    priorityScore: scorePriority(comment),
  }));

  // Sort by priority descending (immutable sort via spread)
  const sorted = [...scored].sort((a, b) => b.priorityScore - a.priorityScore);

  // Translate all to target language in parallel
  const translated = await Promise.all(
    sorted.map((comment) => translateComment(comment, targetLang))
  );

  return translated;
}

/**
 * Format a priority level label.
 * @param {number} score
 * @returns {string}
 */
function priorityLabel(score) {
  if (score >= 60) return 'CRITICAL';
  if (score >= 45) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

/**
 * Format a comment for terminal display.
 * @param {{...comment, priorityScore: number, translatedText: string}} comment
 * @param {number} rank
 * @returns {string}
 */
function formatCommentForDisplay(comment, rank) {
  const priority = priorityLabel(comment.priorityScore);
  const verifiedBadge = comment.verified ? ' [VERIFIED]' : '';
  const method = comment.translationMethod === 'passthrough' ? '' : ` (via ${comment.translationMethod})`;

  const lines = [
    `┌─ #${rank} [${priority}] Score: ${comment.priorityScore} ─────────────────────────`,
    `│ ID: ${comment.id} | Platform: ${comment.platform} | Type: ${comment.type.toUpperCase()}`,
    `│ Author: @${comment.author}${verifiedBadge} | Followers: ${comment.followers.toLocaleString()}`,
    `│ Original [${comment.lang}]: ${comment.text}`,
    `│ Translated${method}: ${comment.translatedText}`,
    `│ Posted: ${new Date(comment.timestamp).toLocaleString()}`,
    `└──────────────────────────────────────────────────────────────`,
  ];
  return lines.join('\n');
}

/**
 * Demo: generate a sample reply suggestion.
 * @param {{type: string, author: string}} comment
 * @returns {string}
 */
function draftReplySuggestion(comment) {
  const templates = {
    question: `Hi @${comment.author}! Great question — we'd be happy to help. Could you share more details so we can assist you better?`,
    complaint: `Hi @${comment.author}, we're sorry to hear you're having trouble. Please DM us your details and we'll resolve this promptly.`,
    praise: `Thank you so much @${comment.author}! We're thrilled you find it useful. Stay tuned for more updates!`,
  };
  return templates[comment.type] || `Thank you for your feedback, @${comment.author}!`;
}

/**
 * Run the workbench demo.
 * @param {string} [targetLang='en'] - Language to display comments in.
 */
async function runWorkbench(targetLang = 'en') {
  try {
    process.stdout.write(`\n${'='.repeat(70)}\n`);
    process.stdout.write(`  OMNIPOST COMMENT WORKBENCH — Unified Triage Demo\n`);
    process.stdout.write(`  Display language: ${targetLang} | Source: sample-comments.json\n`);
    process.stdout.write(`${'='.repeat(70)}\n\n`);

    process.stdout.write('Translating and scoring comments...\n\n');

    const comments = await loadAndTriageComments(targetLang);

    comments.forEach((comment, index) => {
      process.stdout.write(formatCommentForDisplay(comment, index + 1) + '\n\n');
    });

    // Show sample reply for the top comment
    const topComment = comments[0];
    const sampleReply = draftReplySuggestion(topComment);

    process.stdout.write(`${'─'.repeat(70)}\n`);
    process.stdout.write(`SUGGESTED REPLY (for #1 priority comment):\n`);
    process.stdout.write(`  ${sampleReply}\n`);
    process.stdout.write(`\n  [In production: back-translate reply to comment's language (${topComment.lang})]\n`);
    process.stdout.write(`  [Use --live flag with ANTHROPIC_API_KEY for real translation]\n`);
    process.stdout.write(`${'─'.repeat(70)}\n\n`);

    process.stdout.write(`Total comments triaged: ${comments.length}\n`);
    process.stdout.write(`Priority breakdown: ${
      ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(
        (p) => `${p}: ${comments.filter((c) => priorityLabel(c.priorityScore) === p).length}`
      ).join(' | ')
    }\n\n`);

  } catch (error) {
    process.stderr.write(`[workbench] Error: ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = { runWorkbench, loadAndTriageComments };
