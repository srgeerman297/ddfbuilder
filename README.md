# Shufti DDF Builder — ddfbuilder.axioma-corp.com

The same builder as the claude.ai artifact, packaged as a website for Cloudflare Pages
(the host axioma-corp.com already uses).

```
public/index.html         the builder (generated, do not edit by hand)
public/_headers           security headers
functions/api/claude.js   small backend: calls Claude with the API key kept on the server
dev-server.mjs            local test server (stands in for Cloudflare Pages)
```

## What changed from the claude.ai version

| claude.ai artifact | This site |
| --- | --- |
| Download CSV through claude.ai's save prompt | Normal browser download |
| Claude chat, PDF clean-up and scan reading through claude.ai | Same features through `/api/claude`, billed to AXIOMA's Anthropic API key |
| No Claude allowed | No key set, or wrong access code: the step-by-step chat, exactly as before |

Forms are still saved in each person's browser. Forms made in the claude.ai version do not move
over by themselves: Download CSV there, then Import CSV here.

## Deploy (Cloudflare Pages)

1. **Repository.** Create an empty GitHub repository (for example `srgeerman297/ddf-builder`) and push this folder to it.
2. **Pages project.** Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repository.
   Framework preset: None. Build command: leave empty. Build output directory: `public`.
   Cloudflare picks up `functions/` by itself.
3. **API key.** Project → Settings → Variables and Secrets → add `ANTHROPIC_API_KEY` as a *Secret*
   (a key from console.anthropic.com; set a monthly spend limit there). Redeploy once so it takes effect.
4. **Domain.** Project → Custom domains → Set up a custom domain → `ddfbuilder.axioma-corp.com`.
   If axioma-corp.com's DNS is on Cloudflare, it adds the record itself. If not, add at the DNS host:
   `CNAME ddfbuilder → <project-name>.pages.dev`.
5. **Who can use it (pick one).**
   - Recommended: Cloudflare Zero Trust → Access → Applications → Self-hosted → `ddfbuilder.axioma-corp.com`,
     policy "Emails ending in @axioma-corp.com" (free up to 50 users). Only AXIOMA staff can open the site at all.
   - Simpler: add a Secret `ACCESS_CODE`. Anyone can open the site and use the step-by-step chat, but
     Claude features ask for the code once per browser.
   Without either, anyone who finds the URL can spend the API key.

Optional variables: `MODEL_QUICK` (chat, default `claude-haiku-5-5`), `MODEL_DEFAULT` (PDF reading, default `claude-sonnet-5-5`).

Without Git: from this folder, `npx wrangler pages deploy public --project-name ddf-builder`
(run it here, not inside `public`, so `functions/` is included). Drag-and-drop upload in the
dashboard does **not** include `functions/`, so Claude features would be missing.

## Updating

Source lives in `../tests` (`core.js`, `chat.js`, `agent.js`, `pdfimport.js`, `app.html`,
`standalone_shim.js`). `python3 build.py` in `../tests` writes both the artifact
(`ddf-builder.html`) and `public/index.html`. Run `bash regress.sh` there, then push.

## Try it locally

```
node dev-server.mjs                          # no key: step-by-step chat
ANTHROPIC_API_KEY=sk-ant-... node dev-server.mjs
```
Then open http://localhost:8788.
