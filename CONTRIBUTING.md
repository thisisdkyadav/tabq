# Contributing to TabQ

Thanks for your interest! TabQ is intentionally small and dependency-free, so
getting started is quick.

## Project principles

- **No build step for the extension.** `extension/` is plain MV3 + vanilla JS and
  must stay loadable as-is via *Load unpacked*.
- **No runtime dependencies.** No frameworks, no bundlers, no npm packages shipped.
- **Two clear roles.** `background.js` owns *ordering*; `content.js` owns
  *rendering*. Keep that separation.

## Development setup

1. Clone the repo.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**,
   and select the `extension/` folder.
3. Edit files under `extension/`. After changes:
   - Content/manifest changes: click the **reload** ↻ icon on the extension card.
   - Then reload any open tabs you're testing.

### Good things to test

- Open 10+ tabs; create/close/drag tabs and confirm 1–9 stay correct.
- A site that changes its own favicon (Gmail/Discord/Slack unread counts).
- A cross-origin favicon (icon served from a different domain/CDN).
- A `chrome://` page — it should be skipped silently (no console errors).

## Tooling (Python stdlib only — no pip needed)

```bash
python3 tools/gen_icons.py   # regenerate extension/icons + website icons
python3 tools/build.py       # produce dist/tabq-<version>.zip for the store
```

## Website

Static HTML/CSS/JS in `website/`. Preview with:

```bash
cd website && python3 -m http.server 8000
```

## Code style

- 2-space indentation, semicolons, `const`/`let` (no `var`).
- Prefer small, commented functions; match the existing comment density.
- Keep the favicon/loop-prevention invariants intact (see comments in
  `content.js` around `data-tabq` and `renderToken`).

## Pull requests

- Keep PRs focused and describe what you tested manually.
- Bump `version` in `extension/manifest.json` for user-facing changes.
