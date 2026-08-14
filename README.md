# CEO Planner — deployment folder

Everything needed to run CEO Planner, in one place. Built from the working copy on
14 August 2026, after upgrade batches 1–7.

**This folder's contents map directly onto the root of your GitHub repository.**
`index.html` here becomes `index.html` at the top of the repo. Copy everything in
(including the dotfile `.gitignore`), overwriting what is already there.

The site is served by **GitHub Pages from the repository root**, so the app's
`index.html` has to sit at the root — not in a subfolder. An earlier push placed it
in `ceo_planner_app/`, which left the old pre-upgrade copy at the root serving every
visitor while the new build sat unreachable one level down. If you ever see the app
behave like an old version, check which `?v=` number the live `index.html` requests
before anything else.

## What's in here

| Path | What it is | Goes where |
|---|---|---|
| `index.html`, `sw.js`, `manifest.json`, `logo.png`, `css/`, `js/` | The app. Served directly by GitHub Pages. | Repo root |
| `build_bundle.ps1`, `USER_GUIDE.md`, `PRODUCT_SYNOPSIS.md` | Build script and docs. The build reads the guide from beside itself. | Repo root |
| `sales_page/` | The standalone sales page. Independent of the app. | Repo root, served at `/sales_page/` |
| `supabase/` | Database setup and the three edge functions. | Deployed with the Supabase CLI, **not** by your web host |

Because Pages serves the repository root, everything committed is publicly
downloadable — including `supabase/setup.sql` and the edge function sources. There
are no secrets in them (all credentials come from `Deno.env`), but be aware that
anything you add to this repo is readable by anyone.

## Deploying the app

Publish source: **repository root**. Build command: **none** — the app has no build
step, `js/bundle.js` is committed ready to serve.

After pushing, confirm the deploy actually landed:

```
curl -s https://app.thewomensentrepreneurialnetwork.com/index.html | grep -o 'bundle.js?v=[0-9]*'
```

That number must match the `?v=` in this folder's `index.html`. If it doesn't, the
push went somewhere Pages isn't serving from.

`_redirects` is a Netlify/Cloudflare file and is ignored by GitHub Pages. It is
harmless either way, and the hash router (`/#/dashboard`) means no redirect rules are
needed on Pages at all.

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

Currently at **v24** (CSS files are on their own counter, currently **v13**).

Bump the number *after* you finish editing, not before. Bumping first means the new
version number gets cached against the old file, and your change silently doesn't
ship.

`USER_GUIDE.md` sits beside `build_bundle.ps1` on purpose: the build script reads it
and injects it into the AI coach's system prompt, so the coach explains the app as
the guide describes it. Editing that file is how you change what the coach believes.
Keep it next to `build_bundle.ps1`.

## Icons

`favicon.ico` holds **different artwork per size**: the "C" at 16 and 32 pixels,
where three letters would be an illegible smudge, and the full "CEO" at 48 and 64.
Alongside it are `apple-touch-icon.png` (180), `icon-192.png` and `icon-512.png`,
all referenced from `manifest.json` and all self-hosted — there is no longer any
third-party CDN in the icon or notification path.

They are generated from a single square source by the script in the working folder.
Pillow cannot write a multi-size ICO with different artwork per frame, so that
script assembles the container by hand; if you regenerate them, keep that in mind.

## Not included, on purpose

- `supabase/.temp/` — local Supabase CLI state, specific to your machine
- `CLAUDE.md`, `UPGRADE_PLAN.md` — working notes, not part of the product
- Word documents and scratch files from the working folder
