# Privacy Policy — TabQ

_Last updated: 2026-06-22_

**TabQ does not collect, store, sell, or transmit any personal or browsing
data.** It has no servers, no analytics, no accounts, and no third-party SDKs.
Everything it does happens locally in your browser.

## What TabQ accesses, and why

| Data                            | How it's used                                                                                          | Leaves your device? |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
| Tab **order** (position, window) | To work out which tabs are 1–9. Read from tab-event metadata (`index`, `windowId`) — never URLs or titles. | No                  |
| Page **favicon**                | Fetched (without your cookies) and composited with the number badge, then applied back to the page.    | No                  |

That's the complete list. TabQ does **not** read page content, browsing history,
form data, cookies, or the URLs/titles of your tabs. It requests no `tabs`
permission.

## Permissions

- **`scripting`** — to inject the badge renderer into already-open tabs when you
  install the extension.
- **Host access (`http://*/*`, `https://*/*`)** — to run the content script that
  draws the badge and to fetch favicon image bytes for compositing. Favicon
  requests are made with `credentials: "omit"`, so your session cookies are never
  sent to favicon hosts.

## Network activity

The only network requests TabQ makes are to **fetch favicon images** so it can
draw the number on top of them. No data is sent anywhere; nothing is uploaded.

## Data retention

None. TabQ keeps no persistent storage of your data. The badge is drawn live and
disappears when you reload a page, when a tab leaves the top 9, or when you
remove the extension.

## Changes

If this policy ever changes, the update will be committed to the public
repository with a new "Last updated" date.

## Contact

Questions? Open an issue at `https://github.com/your-username/tabq/issues`.
