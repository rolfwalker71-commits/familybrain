<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## App version (sidebar)

Before every git commit, bump the sidebar build stamp and include it in the same commit:

```bash
npm run version:bump
```

That writes `lib/app-version.ts` (`APP_VERSION` as `YYYYMMDD-HHMM`). Do not rely on a pre-commit hook.
