---
name: Discord bot animation techniques
description: How animation is achieved in this Discord bot (GIFs generated from PNGs + message-edit sequences) and the concurrency rule for fireChest
---

# Discord bot animations

Discord embeds are static; only two things "animate": animated GIF images
(`setImage` on a `.gif`) and rapid `message.edit` sequences. mp4/video does NOT
auto-animate in an embed.

## Animated GIFs from existing PNGs (ffmpeg)

Embed art (chest/monster/death) ships as animated `.gif` generated from the source
`.png` with a pulsing brightness/saturation loop, referenced via `IMG` in
`bot/assets.ts` (same static `/api/assets` URL mechanism as the PNGs).

Recipe: drive an `eq` filter with `eval=frame` and a `sin` whose period equals the
clip duration so the loop is seamless, e.g.
`-loop 1 -t 2 -i in.png -filter_complex "fps=12,scale=480:-1:flags=lanczos,eq=brightness='0.11*sin(2*PI*t/2)':saturation='1+0.22*sin(2*PI*t/2)':eval=frame,split[s0][s1];[s0]palettegen=stats_mode=single[p];[s1][p]paletteuse" out.gif`

**Gotcha:** the `hue` filter does NOT support `eval=frame` ("Option not found").
For per-frame color shifts use `eq` (`gamma_r`/`gamma_b`) instead.

**Size:** keep embed GIFs roughly ≲4MB for reliable Discord embedding via URL.
A 16:9 source at `scale=640`, `fps=15`, 4s (~60 frames) lands ~6.6MB (too big);
`scale=512`, `fps=12`, 4s (~48 frames) lands ~4MB and still looks smooth.

## Edit-based motion

`fireChest` and `fireEvent` send a placeholder, then run a few `await sleep(...)` +
`message.edit(...)` frames (sparkle/suspense buildup) before revealing the final
embed+button. Chest claim shows an "opening" row, sleeps, then the claimed row.

## Concurrency rule (important)

`fireChest` is invoked from BOTH the fixed-interval scheduler AND the manual
`/cufar` command, and now spans ~2.4s of sleeps/edits. It MUST hold a module-level
`firingChest` lock (try/finally) so calls serialize — a scheduler-level guard alone
does not cover the direct `/cufar` path. Also `clearTimeout` the previous chest's
expiry timer when replacing/deleting it, or deleted messages leave ghost timers.

**Why:** without the internal lock a second call deletes the first call's
in-progress placeholder (tracked by `lastChestMessageId`) while the first keeps
editing a now-deleted message and arms a ghost expiry timeout.
