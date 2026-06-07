# OmniPost — Write Once, Publish Everywhere

Translate a post into many languages, adapt it per platform, and triage/reply to multilingual comments from one workbench. **Dry-run by default** — writes to `outbox/` with no tokens needed.

## What It Does

- **Translate** source content into multiple languages (AI-powered via Anthropic, or tagged stub without a key)
- **Adapt** each translation to platform-specific constraints (X/Twitter 280 chars, Weibo 微博 2000 chars, LinkedIn 3000 chars + title, Instagram caption + hashtag block)
- **Publish** to platforms via connector modules (real file connector for dry-run; stubbed X/Weibo/LinkedIn/Instagram connectors that activate when tokens are set)
- **Workbench** — load multilingual comments, translate to your language, score by priority (questions > complaints > praise, verified/large accounts weighted up, recency factored), display ranked triage view

## Quick Start

```bash
# Dry-run: translate into 3 languages and write to outbox/
node index.js publish --content content.json --langs en,zh,ja

# Dry-run with more platforms shown (all write to outbox/ by default)
node index.js publish --content content.json --langs en,zh,ja,es --platforms x,weibo,linkedin

# Live mode: call real connectors (requires platform tokens in .env)
node index.js publish --content content.json --langs en,zh --platforms x,linkedin --live

# Comment workbench (dry-run terminal demo)
node index.js workbench

# Workbench with comments translated to Chinese
node index.js workbench --lang zh
```

## Environment Setup

Copy `.env.example` to `.env` and fill in values. Everything is optional:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Real AI translation (claude-sonnet-4-5). Without it: stub mode. |
| `X_BEARER_TOKEN` | Enables X (Twitter) connector |
| `WEIBO_ACCESS_TOKEN` | Enables Weibo connector |
| `LINKEDIN_ACCESS_TOKEN` | Enables LinkedIn connector |
| `INSTAGRAM_ACCESS_TOKEN` | Enables Instagram connector |

See `.env.example` for all variables and where to get them.

## Connectors: Real vs Stub

| Connector | Status | Notes |
|---|---|---|
| `file` | **REAL** | Writes to `outbox/<platform>/<lang>.txt`. Default dry-run. No tokens needed. |
| `x` | **STUB** | Twitter API v2. Set `X_BEARER_TOKEN` to enable (posting still stubbed pending OAuth 1.0a). |
| `weibo` | **STUB** | Weibo Open API. Set `WEIBO_ACCESS_TOKEN` to enable. |
| `linkedin` | **STUB** | LinkedIn UGC API. Set `LINKEDIN_ACCESS_TOKEN` + `LINKEDIN_PERSON_URN`. |
| `instagram` | **STUB** | Instagram Graph API. **Note:** Instagram requires image/video; text-only posts are not supported. |

Stub connectors log `"No token, skipped"` and return `skipped: true` — they never throw.

## Project Structure

```
omnipost-multilang/
├── index.js              CLI entry point
├── translate.js          AI translation (Anthropic) or stub
├── adapt.js              Platform-specific adaptation
├── workbench.js          Comment triage demo
├── connectors/
│   ├── file.js           Real file connector (dry-run)
│   ├── x.js              X/Twitter stub
│   ├── weibo.js          Weibo stub
│   ├── linkedin.js       LinkedIn stub
│   └── instagram.js      Instagram stub
├── content.json          Sample source post
├── sample-comments.json  Multilingual comments for workbench demo
├── .env.example          Environment variable template
└── outbox/               Output directory (git-ignored)
```

## Limitations

- Zero npm dependencies (uses Node.js built-in `fs`, `path`, global `fetch`)
- Requires Node 18+ for global `fetch`
- Instagram connector notes: Graph API requires a media URL (image/video); pure text posts are not supported
- Stub translation wraps text with `[lang]` tags — not suitable for production without `ANTHROPIC_API_KEY`
- Rate limiting, retry logic, and OAuth refresh flows are not implemented in stubs
- `outbox/` is git-ignored; add to `.gitignore` or manage separately in CI

## License

MIT © 2026 Alchemist-X
