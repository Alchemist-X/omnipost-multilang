#!/usr/bin/env node
'use strict';

/**
 * index.js — OmniPost CLI entry point.
 *
 * Commands:
 *   node index.js publish --content content.json --langs en,zh,ja,es --platforms x,weibo,linkedin
 *   node index.js publish --content content.json --langs en,zh,ja   (dry-run, writes to outbox/)
 *   node index.js publish --content content.json --langs en,zh --live  (call real connectors if tokens set)
 *   node index.js workbench                                            (comment triage demo)
 *   node index.js workbench --lang zh                                  (display in Chinese)
 */

const fs = require('fs');
const path = require('path');
const { translatePostToMany } = require('./translate.js');
const { adaptForPlatforms } = require('./adapt.js');
const { runWorkbench } = require('./workbench.js');

// Available connectors
const CONNECTOR_MODULES = {
  file: './connectors/file.js',
  x: './connectors/x.js',
  weibo: './connectors/weibo.js',
  linkedin: './connectors/linkedin.js',
  instagram: './connectors/instagram.js',
};

const DEFAULT_PLATFORMS = ['x', 'weibo', 'linkedin', 'instagram'];
const DEFAULT_LANGS = ['en'];

/**
 * Parse simple CLI arguments into an object.
 * Supports --flag value and --flag (boolean).
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

/**
 * Load connector modules for the given platform list.
 * @param {string[]} platforms
 * @returns {Array<{name: string, publish: Function}>}
 */
function loadConnectors(platforms) {
  return platforms.map((platform) => {
    const modulePath = CONNECTOR_MODULES[platform];
    if (!modulePath) {
      throw new Error(`Unknown platform: "${platform}". Available: ${Object.keys(CONNECTOR_MODULES).join(', ')}`);
    }
    return require(modulePath);
  });
}

/**
 * Print publish results summary.
 * @param {Array<{platform: string, lang: string, result: object, warnings: string[]}>} results
 */
function printPublishSummary(results) {
  const succeeded = results.filter((r) => r.result?.success);
  const skipped = results.filter((r) => r.result?.skipped);
  const failed = results.filter((r) => !r.result?.success && !r.result?.skipped);

  process.stdout.write(`\n${'='.repeat(60)}\n`);
  process.stdout.write(`  PUBLISH SUMMARY\n`);
  process.stdout.write(`${'='.repeat(60)}\n`);
  process.stdout.write(`  Total:     ${results.length}\n`);
  process.stdout.write(`  Succeeded: ${succeeded.length}\n`);
  process.stdout.write(`  Skipped:   ${skipped.length}\n`);
  process.stdout.write(`  Failed:    ${failed.length}\n`);
  process.stdout.write(`${'='.repeat(60)}\n\n`);

  results.forEach(({ platform, lang, result, warnings }) => {
    const status = result?.success ? 'OK' : result?.skipped ? 'SKIPPED' : 'FAILED';
    const detail = result?.path
      ? `→ ${result.path}`
      : result?.message || '';
    process.stdout.write(`  [${status}] ${platform}/${lang}  ${detail}\n`);
    if (warnings && warnings.length > 0) {
      warnings.forEach((w) => process.stdout.write(`         WARN: ${w}\n`));
    }
  });

  process.stdout.write('\n');
}

/**
 * Run the publish command.
 */
async function runPublish(args) {
  const contentFile = args.content || 'content.json';
  const langs = (args.langs || DEFAULT_LANGS.join(',')).split(',').map((l) => l.trim());
  const platformsArg = args.platforms;
  const platforms = platformsArg
    ? platformsArg.split(',').map((p) => p.trim())
    : DEFAULT_PLATFORMS;
  const isLive = !!args.live;

  process.stdout.write(`\nOmniPost Publisher\n`);
  process.stdout.write(`${'─'.repeat(40)}\n`);
  process.stdout.write(`Content:   ${contentFile}\n`);
  process.stdout.write(`Languages: ${langs.join(', ')}\n`);
  process.stdout.write(`Platforms: ${platforms.join(', ')}\n`);
  process.stdout.write(`Mode:      ${isLive ? 'LIVE (real connectors)' : 'DRY-RUN (file connector only)'}\n\n`);

  // Load content
  const post = loadContent(contentFile);
  process.stdout.write(`Source post: "${post.title || post.body.slice(0, 60)}..."\n`);
  process.stdout.write(`Source lang: ${post.lang}\n\n`);

  // Step 1: Translate
  process.stdout.write(`Step 1/3: Translating into [${langs.join(', ')}]...\n`);
  const translatedPosts = await translatePostToMany(post, langs, post.lang);
  translatedPosts.forEach((tp) => {
    process.stdout.write(`  ${tp.lang}: ${tp.translationMethod}\n`);
  });

  // Step 2: Adapt for platforms
  process.stdout.write(`\nStep 2/3: Adapting for platforms [${platforms.join(', ')}]...\n`);
  const adaptedPosts = translatedPosts.flatMap((tp) =>
    adaptForPlatforms(tp, platforms)
  );
  process.stdout.write(`  Generated ${adaptedPosts.length} post variants\n`);

  // Step 3: Publish
  process.stdout.write(`\nStep 3/3: Publishing...\n`);

  // In dry-run mode, always use file connector regardless of --platforms
  // In live mode, use the requested connectors (but fallback to file for unknowns)
  const effectivePlatforms = isLive ? platforms : ['file'];
  const connectors = loadConnectors(isLive ? platforms : ['file']);

  const publishResults = [];

  for (const adapted of adaptedPosts) {
    for (const connector of connectors) {
      try {
        // In dry-run, use file connector but keep platform metadata for folder structure
        const postToPublish = isLive ? adapted : { ...adapted, platform: adapted.platform };
        const result = await (isLive ? connector.publish(postToPublish) : require('./connectors/file.js').publish(postToPublish));
        publishResults.push({
          platform: adapted.platform,
          lang: adapted.lang,
          result,
          warnings: adapted.warnings,
        });
        const status = result.success ? '✓' : result.skipped ? '→' : '✗';
        process.stdout.write(`  ${status} ${adapted.platform}/${adapted.lang}\n`);
      } catch (error) {
        publishResults.push({
          platform: adapted.platform,
          lang: adapted.lang,
          result: { success: false, error: error.message },
          warnings: adapted.warnings,
        });
        process.stderr.write(`  ✗ ${adapted.platform}/${adapted.lang}: ${error.message}\n`);
      }
    }
  }

  printPublishSummary(publishResults);

  if (!isLive) {
    process.stdout.write(`Dry-run complete. Check outbox/ for output files.\n`);
    process.stdout.write(`Use --live to publish to real platforms (requires tokens).\n\n`);
  }
}

/**
 * Print help text.
 */
function printHelp() {
  process.stdout.write(`
OmniPost — Write once, publish everywhere.

COMMANDS:
  publish     Translate and publish a post to multiple platforms/languages
  workbench   Run unified comment triage demo

USAGE:
  node index.js publish --content content.json --langs en,zh,ja,es --platforms x,weibo,linkedin
  node index.js publish --content content.json --langs en,zh,ja         (dry-run → outbox/)
  node index.js publish --content content.json --langs en --live         (call real connectors)
  node index.js workbench
  node index.js workbench --lang zh

OPTIONS (publish):
  --content   Path to content JSON file (default: content.json)
  --langs     Comma-separated language codes (default: en)
  --platforms Comma-separated platforms: x,weibo,linkedin,instagram,file (default: all)
  --live      Actually call platform connectors (requires env tokens; dry-run by default)

OPTIONS (workbench):
  --lang      Display language for translated comments (default: en)

CONNECTORS:
  file        REAL   — writes to outbox/<platform>/<lang>.txt (dry-run default)
  x           STUB   — set X_BEARER_TOKEN to enable
  weibo       STUB   — set WEIBO_ACCESS_TOKEN to enable
  linkedin    STUB   — set LINKEDIN_ACCESS_TOKEN to enable
  instagram   STUB   — set INSTAGRAM_ACCESS_TOKEN to enable

TRANSLATION:
  Set ANTHROPIC_API_KEY for real AI translation; otherwise stub mode tags text with [lang].
`);
}

/**
 * Main entry point.
 */
async function main() {
  const args = parseArgs(process.argv);

  try {
    switch (args._command) {
      case 'publish':
        await runPublish(args);
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
    process.stderr.write(`\nError: ${error.message}\n`);
    process.exit(1);
  }
}

main();
