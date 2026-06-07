#!/usr/bin/env node
'use strict';

/**
 * index.js — OmniPost CLI entry point.
 *
 * Commands:
 *   node index.js publish  --content content.json --langs en,zh,ja [--platforms x,weibo,linkedin] [--preview] [--live]
 *   node index.js preview  --content content.json --langs en,zh,ja [--platforms x,weibo,linkedin]
 *   node index.js workbench [--lang zh]
 */

const fs = require('fs');
const path = require('path');
const { translatePostToMany } = require('./translate.js');
const { adaptForPlatforms, PLATFORM_CONFIGS } = require('./adapt.js');
const { runWorkbench } = require('./workbench.js');
const { generatePreviewHtml } = require('./preview.js');
const { colors, badge, table, isTTY } = require('./cli-colors.js');

const OUTBOX_DIR = path.resolve(process.cwd(), 'outbox');

// ── Connector registry — config-driven ──────────────────────────────────────
const CONNECTOR_MODULES = {
  file:              './connectors/file.js',
  x:                 './connectors/x.js',
  weibo:             './connectors/weibo.js',
  linkedin:          './connectors/linkedin.js',
  instagram:         './connectors/instagram.js',
  threads:           './connectors/threads.js',
  mastodon:          './connectors/mastodon.js',
  xiaohongshu:       './connectors/xiaohongshu.js',
  youtube_community: './connectors/youtube_community.js',
};

const DEFAULT_PLATFORMS = ['x', 'weibo', 'linkedin', 'instagram'];
const DEFAULT_LANGS = ['en'];

// ── CLI argument parser ──────────────────────────────────────────────────────

/**
 * Parse simple CLI arguments.
 * @param {string[]} argv
 * @returns {{_command: string, [key: string]: string|boolean}}
 */
function parseArgs(argv) {
  const args = { _command: argv[2] || 'help' };
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

// ── Content loader ───────────────────────────────────────────────────────────

/**
 * Load and validate a content JSON file.
 * @param {string} filePath
 * @returns {{title: string, body: string, lang: string, hashtags?: string[]}}
 */
function loadContent(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Content file not found: ${resolved}`);
  }
  try {
    const raw = fs.readFileSync(resolved, 'utf8');
    const content = JSON.parse(raw);
    if (!content.body) throw new Error('content.json must have a "body" field');
    if (!content.lang) throw new Error('content.json must have a "lang" field');
    return content;
  } catch (error) {
    if (error.message.startsWith('content.json')) throw error;
    throw new Error(`Failed to parse ${filePath}: ${error.message}`);
  }
}

// ── Connector loader ─────────────────────────────────────────────────────────

/**
 * Load connector modules for the given platform list.
 * @param {string[]} platforms
 * @returns {Array<{name: string, publish: Function}>}
 */
function loadConnectors(platforms) {
  return platforms.map((platform) => {
    const modulePath = CONNECTOR_MODULES[platform];
    if (!modulePath) {
      throw new Error(
        `Unknown platform: "${platform}". Available: ${Object.keys(CONNECTOR_MODULES).join(', ')}`
      );
    }
    return require(modulePath);
  });
}

// ── Outbox / Preview helpers ─────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write outbox/preview.html from adapted post variants.
 */
function writePreviewHtml(adaptedPosts, sourcePost, langs, platforms) {
  ensureDir(OUTBOX_DIR);
  const html = generatePreviewHtml(adaptedPosts, sourcePost, langs, platforms);
  const previewPath = path.join(OUTBOX_DIR, 'preview.html');
  fs.writeFileSync(previewPath, html, 'utf8');
  return { path: previewPath, size: html.length };
}

// ── Summary table ────────────────────────────────────────────────────────────

/**
 * Print a colorized lang×platform summary table.
 * @param {Array<{platform: string, lang: string, result: object, warnings: string[], charCount?: number, maxChars?: number, exceedsLimit?: boolean}>} results
 */
function printPublishSummary(results) {
  const succeeded = results.filter((r) => r.result?.success).length;
  const skipped   = results.filter((r) => r.result?.skipped).length;
  const failed    = results.filter((r) => !r.result?.success && !r.result?.skipped).length;

  process.stdout.write('\n');

  // Build table rows
  const headers = ['Platform', 'Lang', 'Status', 'Chars', 'Limit', 'Method', 'Notes'];
  const rows = results.map(({ platform, lang, result, warnings, charCount, maxChars, exceedsLimit, translationMethod }) => {
    const statusRaw = result?.success ? 'OK' : result?.skipped ? 'SKIPPED' : 'FAILED';
    const statusStr = result?.success
      ? (isTTY ? colors.green('✓ OK') : '✓ OK')
      : result?.skipped
      ? (isTTY ? colors.dim('→ SKIP') : '→ SKIP')
      : (isTTY ? colors.red('✗ FAIL') : '✗ FAIL');

    const charsStr = charCount != null
      ? (exceedsLimit
          ? (isTTY ? colors.red(String(charCount)) : `${charCount}!`)
          : String(charCount))
      : '—';

    const limitStr = maxChars === Infinity ? '∞' : (maxChars != null ? String(maxChars) : '—');

    const methodStr = translationMethod
      ? (translationMethod === 'passthrough' ? 'original'
        : translationMethod === 'stub' ? (isTTY ? colors.yellow('stub') : 'stub')
        : translationMethod === 'anthropic-ai' ? (isTTY ? colors.green('AI') : 'AI')
        : translationMethod)
      : '—';

    const warnStr = warnings && warnings.length
      ? (isTTY ? colors.yellow('⚠ ' + warnings.join('; ').slice(0, 50)) : warnings.join('; ').slice(0, 50))
      : '';

    return [platform, lang, statusStr, charsStr, limitStr, methodStr, warnStr];
  });

  process.stdout.write(table(headers, rows) + '\n\n');

  const summary = [
    `Total: ${results.length}`,
    `${isTTY ? colors.green(`✓ ${succeeded} succeeded`) : `${succeeded} succeeded`}`,
    skipped > 0 ? (isTTY ? colors.dim(`→ ${skipped} skipped`) : `${skipped} skipped`) : null,
    failed > 0 ? (isTTY ? colors.red(`✗ ${failed} failed`) : `${failed} failed`) : null,
  ].filter(Boolean).join('  |  ');

  process.stdout.write(`  ${summary}\n\n`);
}

// ── Publish command ──────────────────────────────────────────────────────────

async function runPublish(args) {
  const contentFile = args.content || 'content.json';
  const langs = (args.langs || DEFAULT_LANGS.join(',')).split(',').map((l) => l.trim()).filter(Boolean);
  const platformsArg = args.platforms;
  const platforms = platformsArg
    ? platformsArg.split(',').map((p) => p.trim()).filter(Boolean)
    : DEFAULT_PLATFORMS;
  const isLive = !!args.live;
  const wantPreview = args.preview !== undefined ? !!args.preview : true; // preview on by default in dry-run

  // Header
  const modeStr = isLive
    ? (isTTY ? colors.red('LIVE') : 'LIVE')
    : (isTTY ? colors.cyan('DRY-RUN') : 'DRY-RUN');

  process.stdout.write(`\n${isTTY ? colors.bold('OmniPost Publisher') : 'OmniPost Publisher'}\n`);
  process.stdout.write(`${'─'.repeat(50)}\n`);
  process.stdout.write(`Content:   ${contentFile}\n`);
  process.stdout.write(`Languages: ${langs.join(', ')}\n`);
  process.stdout.write(`Platforms: ${platforms.join(', ')}\n`);
  process.stdout.write(`Mode:      ${modeStr}${isLive ? ' — calling real connectors' : ' — writes to outbox/'}\n\n`);

  // Load content
  const post = loadContent(contentFile);
  process.stdout.write(`Post: "${isTTY ? colors.bold(post.title || post.body.slice(0, 60)) : (post.title || post.body.slice(0, 60))}"\n`);
  process.stdout.write(`Lang: ${post.lang}\n\n`);

  // Step 1: Translate
  process.stdout.write(`${isTTY ? colors.bold('Step 1/3') : 'Step 1/3'}: Translating → [${langs.join(', ')}]...\n`);
  const translatedPosts = await translatePostToMany(post, langs, post.lang);
  translatedPosts.forEach((tp) => {
    const method = tp.translationMethod === 'stub'
      ? (isTTY ? colors.yellow('stub') : 'stub')
      : tp.translationMethod === 'anthropic-ai'
      ? (isTTY ? colors.green('AI') : 'AI')
      : tp.translationMethod;
    process.stdout.write(`  ${tp.lang}: ${method}\n`);
  });

  // Step 2: Adapt
  process.stdout.write(`\n${isTTY ? colors.bold('Step 2/3') : 'Step 2/3'}: Adapting for [${platforms.join(', ')}]...\n`);
  const adaptedPosts = translatedPosts.flatMap((tp) => adaptForPlatforms(tp, platforms));
  const threadPosts = adaptedPosts.filter((p) => p.thread && p.thread.length > 1);
  process.stdout.write(`  ${adaptedPosts.length} variants generated`);
  if (threadPosts.length > 0) {
    process.stdout.write(` | ${threadPosts.length} X thread(s)`);
  }
  process.stdout.write('\n');

  // Step 3: Publish
  process.stdout.write(`\n${isTTY ? colors.bold('Step 3/3') : 'Step 3/3'}: Publishing...\n`);

  const fileConnector = require('./connectors/file.js');
  const liveConnectors = isLive ? loadConnectors(platforms) : [];

  const publishResults = [];

  for (const adapted of adaptedPosts) {
    const connectors = isLive ? liveConnectors : [fileConnector];
    for (const connector of connectors) {
      try {
        const result = await connector.publish(adapted);
        const statusChar = result?.success ? (isTTY ? colors.green('✓') : '✓') : result?.skipped ? (isTTY ? colors.dim('→') : '→') : (isTTY ? colors.red('✗') : '✗');
        process.stdout.write(`  ${statusChar} ${adapted.platform}/${adapted.lang} (${adapted.charCount}c)\n`);
        publishResults.push({
          platform: adapted.platform,
          lang: adapted.lang,
          translationMethod: adapted.translationMethod,
          charCount: adapted.charCount,
          maxChars: adapted.maxChars,
          exceedsLimit: adapted.exceedsLimit,
          result,
          warnings: adapted.warnings,
        });
      } catch (error) {
        process.stderr.write(`  ${isTTY ? colors.red('✗') : '✗'} ${adapted.platform}/${adapted.lang}: ${error.message}\n`);
        publishResults.push({
          platform: adapted.platform,
          lang: adapted.lang,
          translationMethod: adapted.translationMethod,
          charCount: adapted.charCount,
          maxChars: adapted.maxChars,
          exceedsLimit: adapted.exceedsLimit,
          result: { success: false, error: error.message },
          warnings: adapted.warnings,
        });
      }
    }
  }

  printPublishSummary(publishResults);

  // Preview HTML (always in dry-run unless --no-preview; optional in live)
  if (!isLive || wantPreview) {
    const preview = writePreviewHtml(adaptedPosts, post, langs, platforms);
    const sizeKb = (preview.size / 1024).toFixed(1);
    process.stdout.write(
      `Preview HTML: ${isTTY ? colors.cyan(preview.path) : preview.path} (${sizeKb} KB)\n`
    );
  }

  if (!isLive) {
    process.stdout.write(`\nDry-run complete. Check ${isTTY ? colors.cyan('outbox/') : 'outbox/'} for output.\n`);
    process.stdout.write(`Use ${isTTY ? colors.yellow('--live') : '--live'} to publish (requires tokens).\n\n`);
  }
}

// ── Preview-only command ─────────────────────────────────────────────────────

async function runPreview(args) {
  const contentFile = args.content || 'content.json';
  const langs = (args.langs || DEFAULT_LANGS.join(',')).split(',').map((l) => l.trim()).filter(Boolean);
  const platformsArg = args.platforms;
  const platforms = platformsArg
    ? platformsArg.split(',').map((p) => p.trim()).filter(Boolean)
    : DEFAULT_PLATFORMS;

  process.stdout.write(`\n${isTTY ? colors.bold('OmniPost Preview Generator') : 'OmniPost Preview Generator'}\n`);
  process.stdout.write(`${'─'.repeat(50)}\n`);
  process.stdout.write(`Content:   ${contentFile}\n`);
  process.stdout.write(`Languages: ${langs.join(', ')}\n`);
  process.stdout.write(`Platforms: ${platforms.join(', ')}\n\n`);

  const post = loadContent(contentFile);
  process.stdout.write(`Translating into [${langs.join(', ')}]...\n`);
  const translatedPosts = await translatePostToMany(post, langs, post.lang);
  process.stdout.write(`Adapting for [${platforms.join(', ')}]...\n`);
  const adaptedPosts = translatedPosts.flatMap((tp) => adaptForPlatforms(tp, platforms));
  const preview = writePreviewHtml(adaptedPosts, post, langs, platforms);
  const sizeKb = (preview.size / 1024).toFixed(1);

  process.stdout.write(`\nPreview written: ${isTTY ? colors.cyan(preview.path) : preview.path} (${sizeKb} KB)\n`);
  process.stdout.write(`Variants: ${adaptedPosts.length}\n\n`);
}

// ── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  const b = isTTY ? colors.bold : (s) => s;
  const c = isTTY ? colors.cyan : (s) => s;
  const y = isTTY ? colors.yellow : (s) => s;
  const g = isTTY ? colors.green : (s) => s;
  const d = isTTY ? colors.dim : (s) => s;

  process.stdout.write(`
${b('OmniPost')} — Write once, publish everywhere.

${b('COMMANDS')}:
  ${c('publish')}     Translate, adapt, publish, and generate HTML preview
  ${c('preview')}     Generate HTML preview only (no outbox write)
  ${c('workbench')}   Triage comments with scoring, replies, and workbench.html

${b('USAGE')}:
  node index.js publish --content content.json --langs en,zh,ja [--platforms x,weibo,linkedin] [--live]
  node index.js preview --content content.json --langs en,zh,ja [--platforms x,weibo,linkedin]
  node index.js workbench [--lang zh]

${b('OPTIONS (publish)')}:
  --content    Path to content JSON file ${d('(default: content.json)')}
  --langs      Comma-separated language codes ${d('(default: en)')}
  --platforms  Comma-separated platforms ${d('(default: x,weibo,linkedin,instagram)')}
  --live       Call real platform connectors ${d('(dry-run by default)')}
  --preview    Force preview HTML generation ${d('(default: on in dry-run)')}

${b('OPTIONS (workbench)')}:
  --lang       Display language ${d('(default: en)')}

${b('PLATFORMS (config-driven)')}:
  ${g('x')}                 X/Twitter · 280 chars · auto-thread
  ${g('weibo')}             微博 Weibo · 2000 chars · #wrapped# hashtags
  ${g('linkedin')}          LinkedIn · 3000 chars · title as headline
  ${g('instagram')}         Instagram · 2200 chars · hashtag block · max 30 tags
  ${g('threads')}           Threads · 500 chars
  ${g('mastodon')}          Mastodon · 500 chars · open protocol
  ${g('xiaohongshu')}       小红书 · 1000 chars · [topic] tags
  ${g('youtube_community')} YouTube Community · 5000 chars

${b('CONNECTORS: REAL vs STUB')}:
  ${g('file')}        REAL   writes to outbox/<platform>/<lang>.txt
  Others     ${y('STUB')}   skipped with "no token" message; set env token to enable

${b('ENVIRONMENT')} (all optional — stub/dry-run without):
  ANTHROPIC_API_KEY       Real AI translation (claude-sonnet-4-5)
  X_BEARER_TOKEN          Enable X connector
  WEIBO_ACCESS_TOKEN      Enable Weibo connector
  LINKEDIN_ACCESS_TOKEN   Enable LinkedIn connector
  INSTAGRAM_ACCESS_TOKEN  Enable Instagram connector
  THREADS_ACCESS_TOKEN    Enable Threads connector
  MASTODON_ACCESS_TOKEN   Enable Mastodon connector
  XHS_ACCESS_TOKEN        Enable 小红书 connector
  YOUTUBE_OAUTH_TOKEN     Enable YouTube Community connector
`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  try {
    switch (args._command) {
      case 'publish':
        await runPublish(args);
        break;

      case 'preview':
        await runPreview(args);
        break;

      case 'workbench': {
        const lang = args.lang || 'en';
        await runWorkbench(lang);
        break;
      }

      case 'help':
      case '--help':
      case '-h':
        printHelp();
        break;

      default:
        process.stderr.write(`Unknown command: ${args._command}\n`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    process.stderr.write(`\n${isTTY ? colors.red('Error') : 'Error'}: ${error.message}\n`);
    process.exit(1);
  }
}

main();
