# Activity rank previews

The panel's seven transparent previews are derivatives, not original artwork.
Both `/rank` and the preview exporter use `thin_bar_frames` in
`artifacts/api-server/src/bot/activity-bars/sprites.py`. The exporter calls
`render.py --sprites-out` with the existing demonstration progress of **62%**,
preserving **560×64**, animation timing, looping and transparency.

`pnpm --filter @workspace/status run build` regenerates and validates all seven
GIFs **before** Vite copies public assets. This also runs for the root build and
the artifact's production build. Starting the status development workflow
regenerates them too; restart it after changing the renderer or artwork.
Generation errors stop the build/start instead of publishing old images.
Vite derives the panel image cache key from the generated GIF contents.

Manual generation, from any workspace directory:

```sh
pnpm --filter @workspace/status run previews:generate
```

Optional CI synchronization check (read-only; exits nonzero for missing,
changed or extra GIFs):

```sh
pnpm --filter @workspace/status run previews:check
```

Requires the project's Python 3.11+ runtime and Pillow dependency from
`pyproject.toml`/`uv.lock`. Run byte-for-byte checks using the same locked
Pillow version; encoder versions can change bytes without changing artwork.
The font and the three original Python artwork sources must be available,
just as for the existing API renderer build. No Discord, network or database
access is needed.
