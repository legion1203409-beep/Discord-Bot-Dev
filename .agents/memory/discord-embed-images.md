---
name: Discord embed images via static URLs
description: How/why the bot serves embed images as static files referenced by an env-derived public URL instead of attachments
---

# Discord embed images

Embed images (monster/combat, chest spawn, death) are committed PNGs under
`artifacts/api-server/assets/`, served by Express at `/api/assets/<file>.png`
(static route in `routes/index.ts`, resolved from `import.meta.dirname/../assets`
so it works after esbuild bundles `src` into `dist`). `bot/assets.ts` builds an
absolute HTTPS base from `REPLIT_DOMAINS` (prod) or `REPLIT_DEV_DOMAIN` (dev) and
exposes `IMG.{monster,chest,death}` (string | null); embeds call `.setImage(IMG.x)`.

**Why URL, not AttachmentBuilder:** the combat embed is edited on every attack
click. Attachments re-upload the file on each edit; an absolute URL is fetched and
cached once by Discord, so no per-edit re-upload. `setImage(null)` degrades
gracefully when no domain env is present.

**How to apply:** to add/replace an embed image, drop a `.png` in
`artifacts/api-server/assets/`, add it to `IMG` in `bot/assets.ts`, and reference
it. Images must be public-internet reachable for Discord to render them — the
Replit dev/prod domains already are.
