<div align="center">
  <img src="extension/icons/icon128.png" width="96" height="96" alt="TabQ logo" />
  <h1>TabQ</h1>
  <p><strong>Numbered tab favicons for Chrome.</strong></p>
  <p>
    Chrome lets you jump to a tab with <code>Ctrl</code>/<code>⌘</code> + a number —
    but nothing tells you which tab is which. TabQ badges the favicon of your
    first 9 tabs with their number (1–9), so you always know where the shortcut
    will land.
  </p>
</div>

---

## Features

- 🔢 **Numbered favicons** — a white circle with a light-blue number, top-right of each favicon.
- 🔁 **Always in order** — reacts to tabs being created, closed, dragged, reordered, and moved between windows.
- 🔄 **Survives favicon changes** — re-badges over unread-count icons (Gmail, Discord, Slack) without flicker loops.
- 🔒 **Private by design** — no accounts, no tracking, no servers. Everything runs locally.
- 🪶 **Tiny & dependency-free** — Manifest V3, vanilla JS, no build step for the extension itself.

## Repository layout

```
tabq/
├── extension/            # the unpacked extension (load this / zip this)
│   ├── manifest.json
│   ├── background.js     # ordering: assigns each tab its number
│   ├── content.js        # rendering: composites the favicon + badge
│   ├── popup.html        # toolbar popup
│   └── icons/            # 16/32/48/128 px PNGs
├── website/              # static landing page (HTML/CSS/JS, no deps)
├── tools/
│   ├── gen_icons.py      # regenerate the PNG icons (stdlib only)
│   └── build.py          # package extension/ into dist/tabq-<version>.zip
├── LICENSE               # MIT
├── PRIVACY.md            # privacy policy (also used for the store listing)
└── CONTRIBUTING.md
```

## Install

### From the Chrome Web Store

> Once published, link it here: `https://chromewebstore.google.com/detail/<your-extension-id>`

### Manually (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions` and enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the **`extension/`** folder.

Existing tabs are badged immediately; new ones update automatically.

## How it works

TabQ splits the job in two:

- **`background.js` (ordering).** A service worker listens to `tabs.onCreated`,
  `onRemoved`, `onMoved`, `onAttached`, and `onDetached`. Any of these can change
  left→right order, so it (debounced) renumbers the affected window and tells each
  tab its number (1–9, or `null` past the ninth). It also fetches favicon bytes on
  the content script's behalf — having host permissions, it can read cross-origin
  favicons that would otherwise taint a page-side `<canvas>`.
- **`content.js` (rendering).** Reads the page's favicon, composites it with the
  badge on an off-screen `<canvas>`, and installs the result via a managed
  `<link rel="icon" data-tabq>`. A `MutationObserver` re-applies the badge when the
  page changes its own favicon. Loop-safety comes from the `data-tabq` marker (our
  own link is invisible to the observer) plus a per-update render token.

See the inline comments in each file for the details.

## Development

```bash
# Regenerate the PNG icons (no dependencies — uses Python's stdlib only)
python3 tools/gen_icons.py

# Package the extension into dist/tabq-<version>.zip for the Web Store
python3 tools/build.py
```

To preview the website locally:

```bash
cd website && python3 -m http.server 8000   # then open http://localhost:8000
```

## Publishing checklist (Chrome Web Store)

- [ ] Replace the placeholder URLs (`your-username`, `your-extension-id`) in
      `extension/manifest.json`, `extension/popup.html`, and `website/`.
- [ ] Run `python3 tools/build.py` and upload `dist/tabq-<version>.zip`.
- [ ] Provide store assets the listing requires: at least one **1280×800** (or
      640×400) screenshot and a **128×128** store icon (`extension/icons/icon128.png`).
- [ ] Paste `PRIVACY.md` (or host it) as the privacy policy, and declare the
      single purpose + permission justifications below.

## Permissions, explained

| Permission                    | Why it's needed                                                        |
| ----------------------------- | ---------------------------------------------------------------------- |
| `scripting`                   | Inject the badge renderer into already-open tabs on install.           |
| `host_permissions` http/https | Run the content script and fetch favicon bytes to composite the badge. |

No `tabs` permission is requested — tab **order** is read from event metadata
(`index`/`windowId`), never your URLs or history. See [PRIVACY.md](PRIVACY.md).

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © TabQ contributors.
