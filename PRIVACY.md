# Privacy Policy — HeaderForge

**Effective date:** 2026-07-20  
**Product:** HeaderForge browser extension

## Summary

HeaderForge is offline-first. It does not collect, transmit, sell, or share your data.

- **Zero telemetry**
- **Zero analytics**
- **No external API calls** for extension features
- **No accounts**
- **No cloud sync** in v1

## What we store

Configuration is stored only in `chrome.storage.local` on your device:

- Profiles
- Header definitions (names, values, operations)
- Domain rules
- Enable/disable state
- Automatic local backup snapshot

## What we do not do

HeaderForge does **not**:

- Send browsing history, URLs, or headers to any server
- Use Google Analytics, Sentry, or similar tools
- Phone home for license checks or “usage stats”
- Store data outside `chrome.storage.local`
- Require an account

## Permissions

| Permission | Why |
|---|---|
| `storage` | Save profiles locally |
| `declarativeNetRequest` / `declarativeNetRequestWithHostAccess` | Modify request headers |
| `tabs` | Open the options page and support toolbar workflows |
| `host_permissions` (`http://*/*`, `https://*/*`) | Needed so header modifications can run on websites. No browsing data leaves your device. |

## Domain marks

Favicon-like marks next to domain rules are generated locally (SVG data URIs). They are not fetched from the network.

## Changes

If a future version adds optional cloud sync, it will be **opt-in**, documented, and never enabled by default.

## Contact

Open an issue in the project GitHub repository for privacy questions or reports.

A web version of this policy (for Chrome Web Store) lives at [`docs/privacy.html`](./docs/privacy.html).
