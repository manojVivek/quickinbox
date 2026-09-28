# Deploy this fork using a database environment variable

In Cloudflare, open your Worker → **Settings → Build**:

1. Under **Variables and secrets**, add `D1_DATABASE_ID` with your existing D1 database UUID.
2. Set the **Deploy command** to:

   ```sh
   bun scripts/deploy-with-env.mjs
   ```

Keep the database ID placeholder committed in `wrangler.jsonc`. The wrapper
temporarily inserts the ID into the build checkout, runs upstream's `bun run deploy`
(including its migrations), and restores the original config when the command finishes,
including when deployment fails.

`D1_DATABASE_ID` must be a **build variable**. Keep `RESEND_API_KEY` and
`RESEND_WEBHOOK_SECRET` as **Worker runtime secrets**.

Only this guide and the wrapper are fork-specific; upstream files stay unchanged.
