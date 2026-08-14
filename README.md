# CEO Planner — deployment folder

Everything needed to run CEO Planner, in one place. Built from the working copy on
14 August 2026, after upgrade batches 1–6.

Drop the **contents of this folder** into your GitHub repository (not the folder
itself — you want `ceo_planner_app/` at the top level of the repo, not
`github_deployment/ceo_planner_app/`).

## What's in here

| Folder | What it is | Goes where |
|---|---|---|
| `ceo_planner_app/` | The app itself. This is the folder your host serves. | Netlify / Cloudflare Pages / GitHub Pages |
| `sales_page/` | The standalone sales page. Independent of the app. | Wherever you host the sales page |
| `supabase/` | Database setup and the three edge functions. | Deployed with the Supabase CLI, not by your web host |

## Deploying the app

Publish directory: **`ceo_planner_app`**. Build command: **none** — the app has no
build step, `js/bundle.js` is committed ready to serve.

`_redirects` is included for Netlify (it sends every path to `index.html` so the
router handles it). Cloudflare Pages reads the same file. On GitHub Pages it is
ignored and harmless.

## Deploying the Supabase side

Only needed when the database or the AI/Stripe functions change.

```bash
supabase db push
```

```bash
supabase functions deploy chat signup-sync stripe-webhook
```

The functions read these secrets from the Supabase dashboard (Settings → Edge
Functions → Secrets). None of them are in this repository, and none should be:

- `OPENAI_API_KEY` — the AI coach and executive report
- `LOOPS_API_KEY` — welcome and trial-ending emails
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` — subscription webhooks

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase
automatically — you don't set those yourself.

The Supabase URL and anon key that *are* in `js/supabaseClient.js` are meant to be
public. They identify the project in the browser; row-level security in
`supabase/setup.sql` is what actually protects the data.

## After you push a code change

`js/bundle.js` is generated. Rebuild it before deploying, from the app folder:

```bash
powershell -ExecutionPolicy Bypass -File build_bundle.ps1
```

Then bump the cache version in **three** places, or returning users get served the
old code from their service worker:

1. `index.html` — the `?v=` on the bundle script tag
2. `sw.js` — `CACHE_NAME`
3. `sw.js` — the `?v=` entries in `urlsToCache`

Currently at **v19** (CSS files are on their own counter, currently **v13**).

Bump the number *after* you finish editing, not before. Bumping first means the new
version number gets cached against the old file, and your change silently doesn't
ship.

`USER_GUIDE.md` sits inside `ceo_planner_app/` on purpose: the build script reads it
and injects it into the AI coach's system prompt, so the coach explains the app as
the guide describes it. Editing that file is how you change what the coach believes.
Keep it next to `build_bundle.ps1`.

## One thing to fix

`index.html` and `manifest.json` both reference `favicon.ico`, which doesn't exist —
so browsers show a blank tab icon and log a 404. `logo.png` is a wide wordmark, so it
won't crop to a square icon well. Adding a square brand mark saved as
`ceo_planner_app/favicon.ico` is all that's needed.

## Not included, on purpose

- `supabase/.temp/` — local Supabase CLI state, specific to your machine
- `CLAUDE.md`, `UPGRADE_PLAN.md` — working notes, not part of the product
- Word documents and scratch files from the working folder
