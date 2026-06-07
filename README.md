# OmniPost — Write Once, Publish Everywhere

Translate a post into many languages, adapt it per-platform with smart truncation and thread splitting, preview variants in a beautiful HTML mockup, and triage multilingual comments from a unified inbox. **Dry-run by default** — no tokens required.

## What It Does

- **Translate** source content into multiple languages (AI via Anthropic claude-sonnet-4-5, or tagged stub without a key)
- **Adapt** each translation to platform-specific constraints with sentence-boundary-aware truncation, per-platform hashtag/mention styling, emoji budgets, and automatic X thread splitting for long content
- **Preview** all language×platform variants as a beautiful dark-theme HTML phone-mockup page with char-count meters and over-limit warnings — review before you publish
- **Publish** via connector modules (real file connector for dry-run; stubbed connectors for all platforms that activate when tokens are set)
- **Workbench** — load multilingual comments, translate to your language, classify intent (lead/question/complaint/praise/spam), score priority, generate draft replies, and browse in a full inbox-style HTML triage UI

## Quick Start

```bash
# Dry-run: translate into 3 languages, write to outbox/ + preview.html
node index.js publish --content content.json --langs en,zh,ja

# With specific platforms
node index.js publish --content content.json --langs en,zh,ja,es --platforms x,weibo,linkedin,instagram,threads

# Preview-only (no outbox write)
node index.js preview --content content.json --langs en,zh,ja --platforms x,weibo,linkedin

# Live mode: call real connectors (requires tokens in .env)
node index.js publish --content content.json --langs en,zh --platforms x,linkedin --live

# Comment workbench (CLI + workbench.html)
node index.js workbench

# Workbench with comments translated to Chinese
node index.js workbench --lang zh
```

## Environment Setup

Copy `.env.example` to `.env` and fill in values. Everything is optional:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Real AI translation. Without it: stub mode. |
| `X_BEARER_TOKEN` | Enables X (Twitter) connector |
| `WEIBO_ACCESS_TOKEN` | Enables Weibo connector |
| `LINKEDIN_ACCESS_TOKEN` | Enables LinkedIn connector |
| `INSTAGRAM_ACCESS_TOKEN` | Enables Instagram connector |
| `THREADS_ACCESS_TOKEN` | Enables Threads connector |
| `MASTODON_ACCESS_TOKEN` | Enables Mastodon connector |
| `XHS_ACCESS_TOKEN` | Enables 小红书 connector |
| `YOUTUBE_OAUTH_TOKEN` | Enables YouTube Community connector |

See `.env.example` for all variables and where to get them.

## Platforms

All platforms are config-driven in `adapt.js` — easy to extend.

| Platform | Key | Char Limit | Hashtag Style | Special |
|---|---|---|---|---|
| X (Twitter) | `x` | 280 | inline | Auto-thread for long content |
| 微博 Weibo | `weibo` | 2000 | `#wrapped#` | — |
| LinkedIn | `linkedin` | 3000 | appended | Title as headline |
| Instagram | `instagram` | 2200 | block at end | Max 30 hashtags |
| Threads | `threads` | 500 | appended | — |
| Mastodon | `mastodon` | 500 | appended | Open protocol |
| 小红书 | `xiaohongshu` | 1000 | `[topic]` | Title prominent |
| YouTube Community | `youtube_community` | 5000 | appended | — |
| File (dry-run) | `file` | ∞ | appended | No tokens needed |

## Connectors: Real vs Stub

| Connector | Status | Notes |
|---|---|---|
| `file` | **REAL** | Writes to `outbox/<platform>/<lang>.txt`. Default dry-run. |
| `x` | **STUB** | Set `X_BEARER_TOKEN` to enable (posting still stubbed pending OAuth 1.0a). |
| `weibo` | **STUB** | Set `WEIBO_ACCESS_TOKEN` to enable. |
| `linkedin` | **STUB** | Set `LINKEDIN_ACCESS_TOKEN` + `LINKEDIN_PERSON_URN`. |
| `instagram` | **STUB** | Set `INSTAGRAM_ACCESS_TOKEN`. Requires image/video media. |
| `threads` | **STUB** | Set `THREADS_ACCESS_TOKEN`. |
| `mastodon` | **STUB** | Set `MASTODON_ACCESS_TOKEN` + optional `MASTODON_INSTANCE_URL`. |
| `xiaohongshu` | **STUB** | Set `XHS_ACCESS_TOKEN`. Typically requires images. |
| `youtube_community` | **STUB** | Set `YOUTUBE_OAUTH_TOKEN`. |

Stub connectors return `skipped: true` — they never throw.

## Output Files

After `publish` or `preview`:

```
outbox/
├── preview.html          Beautiful dark-theme HTML mockup (lang×platform variants)
├── workbench.html        Inbox-style triage UI (after `workbench` command)
├── x/
│   ├── en.txt
│   ├── zh.txt
│   └── ja.txt
├── weibo/
│   └── ...
├── linkedin/
│   └── ...
└── instagram/
    └── ...
```

## Project Structure

```
omnipost-multilang/
├── index.js              CLI entry point (publish / preview / workbench)
├── translate.js          AI translation (Anthropic) or stub
├── adapt.js              Platform-specific adaptation (8 platforms, config-driven)
├── workbench.js          Comment triage: scoring, intent, replies, HTML inbox
├── preview.js            HTML preview generator (phone mockup per variant)
├── cli-colors.js         ANSI color helpers, auto-no-color when piped
├── connectors/
│   ├── file.js           Real file connector (dry-run)
│   ├── x.js              X/Twitter stub
│   ├── weibo.js          Weibo stub
│   ├── linkedin.js       LinkedIn stub
│   ├── instagram.js      Instagram stub
│   ├── threads.js        Threads stub
│   ├── mastodon.js       Mastodon stub
│   ├── xiaohongshu.js    小红书 stub
│   └── youtube_community.js  YouTube Community stub
├── content.json          Sample source post
├── sample-comments.json  Multilingual comments for workbench demo
├── .env.example          Environment variable template
└── outbox/               Output directory (git-ignored)
```

## Technical Notes

- Zero npm dependencies — uses Node.js built-in `fs`, `path`, global `fetch`
- Requires Node 18+ for global `fetch`
- Immutable data flow — no object mutation, all transforms return new objects
- Files ≤ 400 lines each; concerns separated by module
- CLI auto-detects TTY — ANSI colors suppressed when piped
- Dry-run + stub translate always work with no keys or tokens
- Error handling: all async paths wrapped with descriptive messages and fallbacks

## License

MIT © 2026 Alchemist-X
