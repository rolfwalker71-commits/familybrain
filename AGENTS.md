<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## App version (sidebar)

`APP_VERSION` in `lib/app-version.ts` (`YYYYMMDD-HHMM`) is bumped automatically by
`.githooks/pre-commit` on every commit (`core.hooksPath=.githooks`).

Agents: still run `npm run version:bump` and stage `lib/app-version.ts` before
`git commit` when preparing a commit, so the stamp is correct even if hooks are
skipped. Never commit with a stale sidebar version.
