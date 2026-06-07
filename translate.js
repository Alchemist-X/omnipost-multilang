'use strict';

/**
 * translate.js — translate a source post into target languages.
 * If ANTHROPIC_API_KEY is set, calls Anthropic Messages API for real translation.
 * Otherwise, returns a stub that tags text with [lang] and notes the missing key.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-5';
const ANTHROPIC_VERSION = '2023-06-01';

const LANGUAGE_NAMES = {
  en: 'English',
  zh: 'Simplified Chinese (Mandarin)',
  ja: 'Japanese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ko: 'Korean',
  pt: 'Portuguese',
  ar: 'Arabic',
  ru: 'Russian',
};

/**
 * Translate text to a target language using Anthropic API.
 * @param {string} text - Source text to translate.
 * @param {string} targetLang - ISO 639-1 language code.
 * @param {string} sourceLang - ISO 639-1 source language code (default 'en').
 * @returns {Promise<{text: string, lang: string, method: string}>}
 */
async function translateWithAI(text, targetLang, sourceLang = 'en') {
  const targetName = LANGUAGE_NAMES[targetLang] || targetLang;
  const sourceName = LANGUAGE_NAMES[sourceLang] || sourceLang;

  const requestBody = {
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Translate the following text from ${sourceName} to ${targetName}. Preserve the tone, style, and formatting. Return ONLY the translated text with no explanation or preamble.\n\nText to translate:\n${text}`,
      },
    ],
  };

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const translatedText = data.content?.[0]?.text;

  if (!translatedText) {
    throw new Error('Anthropic API returned empty translation');
  }

  return {
    text: translatedText,
    lang: targetLang,
    method: 'anthropic-ai',
  };
}

/**
 * Stub translator — tags text with [lang] when no API key is set.
 * @param {string} text - Source text.
 * @param {string} targetLang - Target language code.
 * @returns {{text: string, lang: string, method: string}}
 */
function translateStub(text, targetLang) {
  const note = '[STUB: set ANTHROPIC_API_KEY for real translation]';
  return {
    text: `[${targetLang}] ${text} ${note}`,
    lang: targetLang,
    method: 'stub',
  };
}

/**
 * Translate a post object into a target language.
 * Returns a new post object — never mutates input.
 * @param {{title: string, body: string, hashtags?: string[], [key: string]: any}} post
 * @param {string} targetLang
 * @param {string} [sourceLang='en']
 * @returns {Promise<{...post, title: string, body: string, lang: string, translationMethod: string}>}
 */
async function translatePost(post, targetLang, sourceLang = 'en') {
  if (targetLang === sourceLang) {
    return { ...post, lang: targetLang, translationMethod: 'passthrough' };
  }

  if (!ANTHROPIC_API_KEY) {
    const titleResult = translateStub(post.title, targetLang);
    const bodyResult = translateStub(post.body, targetLang);
    return {
      ...post,
      title: titleResult.text,
      body: bodyResult.text,
      lang: targetLang,
      translationMethod: 'stub',
    };
  }

  try {
    const [titleResult, bodyResult] = await Promise.all([
      translateWithAI(post.title, targetLang, sourceLang),
      translateWithAI(post.body, targetLang, sourceLang),
    ]);

    return {
      ...post,
      title: titleResult.text,
      body: bodyResult.text,
      lang: targetLang,
      translationMethod: 'anthropic-ai',
    };
  } catch (error) {
    console.error(`[translate] AI translation failed for ${targetLang}, falling back to stub:`, error.message);
    const titleResult = translateStub(post.title, targetLang);
    const bodyResult = translateStub(post.body, targetLang);
    return {
      ...post,
      title: titleResult.text,
      body: bodyResult.text,
      lang: targetLang,
      translationMethod: 'stub-fallback',
    };
  }
}

/**
 * Translate a post into multiple target languages.
 * @param {object} post - Source post object.
 * @param {string[]} targetLangs - Array of language codes.
 * @param {string} [sourceLang='en']
 * @returns {Promise<Array<{...post, lang: string, translationMethod: string}>>}
 */
async function translatePostToMany(post, targetLangs, sourceLang = 'en') {
  const results = await Promise.all(
    targetLangs.map((lang) => translatePost(post, lang, sourceLang))
  );
  return results;
}

module.exports = { translatePost, translatePostToMany, LANGUAGE_NAMES };
