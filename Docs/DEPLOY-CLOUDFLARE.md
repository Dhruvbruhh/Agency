# Deploying the website to Cloudflare Workers

The site runs on Cloudflare Workers through [OpenNext](https://opennext.js.org/cloudflare)
(`@opennextjs/cloudflare`). Convex stays where it is.

- Worker name: `agency-website` (set in `wrangler.jsonc`)
- Cloudflare account: `e1c80e62d610888d0733c9f36faaafa8` (the one that holds the `ventriee.in` zone)
- Deploys: `.github/workflows/deploy-cloudflare.yml`, on every push to `main` (or run it by hand from the Actions tab)

## Local commands

| Command              | What it does                                                        |
| -------------------- | ------------------------------------------------------------------- |
| `npm run dev`        | Normal Next.js dev server                                           |
| `npm run cf:build`   | `next build` + OpenNext bundle into `.open-next/`                   |
| `npm run cf:preview` | Build, then run the Worker locally in `workerd` on `localhost:8787` |
| `npm run cf:deploy`  | Build output → Cloudflare (CI does this; needs Cloudflare login)    |

The build needs `NEXT_PUBLIC_CONVEX_URL` (put it in `.env.local`). On Windows, OpenNext prints a
"not fully compatible with Windows" warning and the Worker can fail with `ChunkLoadError`: build in
WSL or rely on CI (Linux).

## 1. Add GitHub secrets and variables

Repo → Settings → Secrets and variables → Actions.

Secrets:

| Name                    | Value                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `CONVEX_DEPLOY_KEY`     | Convex dashboard → production deployment → Settings → Deploy key (the one Vercel used)                       |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare → My Profile → API Tokens → Create → template **Edit Cloudflare Workers**, scoped to this account |
| `CLOUDFLARE_ACCOUNT_ID` | `e1c80e62d610888d0733c9f36faaafa8`                                                                           |

Variables (public values, inlined at build time; copy them from Vercel → Project → Settings → Environment Variables):

| Name                           | Value                        |
| ------------------------------ | ---------------------------- |
| `NEXT_PUBLIC_GA_ID`            | Google Analytics ID, if used |
| `NEXT_PUBLIC_GSC_VERIFICATION` | Search Console code, if used |

`NEXT_PUBLIC_CONVEX_URL` needs no setting: `convex deploy` passes it to the build.

## 2. First deploy

1. Merge the PR (or run the **Deploy to Cloudflare** workflow by hand).
2. The workflow deploys Convex, builds, and runs `wrangler deploy`. It creates the Worker on the first run.
3. Open the `workers.dev` URL printed at the end of the `wrangler deploy` step
   (`https://agency-website.<your-subdomain>.workers.dev`) and check `/`, `/blog`, `/services`, `/ventriee`.

The site on `ventriee.in` is unchanged until step 3.

## 3. Cut over `ventriee.in` and `www.ventriee.in`

A Workers custom domain can't be added while a DNS record for that name exists, so remove the old
Vercel records first. The site is already serving Vercel's 404 today, so the short gap costs nothing.

1. Cloudflare → `ventriee.in` zone → **DNS → Records**. Note down, then delete, the records pointing at
   Vercel:
   - `ventriee.in` (apex): `A 76.76.21.21` or a `CNAME` to `cname.vercel-dns.com`
   - `www`: `CNAME cname.vercel-dns.com` (or similar `*.vercel-dns.com` target)

   Leave every other record (mail `MX`/`TXT`, Search Console `TXT`, and the `workspace`, `dashboard`
   and `app` records used by Ventriee Studios) alone.

2. Workers & Pages → `agency-website` → **Settings → Domains & Routes → Add → Custom domain**:
   add `ventriee.in`, then add `www.ventriee.in`. Cloudflare creates the DNS records and certificates.
3. Check:

   ```bash
   curl -sI https://ventriee.in/ | head -1          # 200, serves the /ventriee page
   curl -sI https://www.ventriee.in/ | head -1      # 200, serves the main site
   curl -sI https://www.ventriee.in/ | grep -i x-frame-options
   ```

   After the next push to `main`, confirm both custom domains are still listed on the Worker.

4. Once it has been stable for a while: delete `vercel.json`, remove the domain from the Vercel
   project, and update the "set in Vercel env vars" notes in `.env.example` and `GSC-SETUP.md`.

### How the two hosts behave

`src/middleware.ts` rewrites every page request whose `Host` is exactly `ventriee.in` to
`/ventriee/...` (this used to be a rewrite in `vercel.json`). `www.ventriee.in` serves the full site.
So on the apex only `/` (the Ventriee page) exists; `https://ventriee.in/services` is a 404.

### URLs in the code that name the site

All of these use `https://ventriee.in`; none need to change for the move, but they are what search
engines and Convex Auth see:

- `src/app/layout.tsx` — `metadata.openGraph.url` and the JSON-LD `url` / `image`
- `src/app/sitemap.ts` — `baseUrl` for every sitemap entry
- `src/app/(marketing)/services/[slug]/page.tsx` — JSON-LD provider `url`
- `public/robots.txt` — `Sitemap:` line
- `convex/auth.config.ts` — auth provider `domain` (plus `http://localhost:3000`)

Because of the apex rewrite above, the sitemap and canonical URLs on `ventriee.in` (other than `/`)
point at pages the apex doesn't serve. That was true on Vercel too; decide separately whether the
apex should redirect to `www` or the URLs should use `www`.

## Images

`next.config.ts` sets `images.unoptimized: true`, so `next/image` serves files as they are, with no
Cloudflare Images binding and no image-transformation charges. The only `next/image` today is the
logo (`public/logo.png`, ~237 KB), which now loads the original PNG instead of a resized WebP/AVIF.
To turn optimisation back on, remove `unoptimized` and add an `"images": { "binding": "IMAGES" }`
block to `wrangler.jsonc` (Cloudflare Images bills per unique transformation beyond a free monthly allowance; check current pricing first).

## Headers

- Rendered pages: `headers()` in `next.config.ts` (security headers + `Cache-Control`), applied by OpenNext.
- Static files (`/_next/static/*`, `public/`): served by Workers Assets, which skips `headers()`;
  `public/_headers` adds the same security headers and long-term caching for `/_next/static/*`.

## Rollback

- **Code**: revert the migration PR. `vercel.json` is still there, so a Vercel build works as before.
- **Traffic**: remove the two custom domains from the Worker, then re-create the Vercel DNS records
  you noted in step 3.1. This only helps if the Vercel project has a working production deployment
  with `ventriee.in` attached; today it doesn't (`DEPLOYMENT_NOT_FOUND`), so fix that in Vercel first.
- **A bad deploy on Workers**: Workers & Pages → `agency-website` → **Deployments** → roll back to an
  earlier version, or `npx wrangler rollback`.
