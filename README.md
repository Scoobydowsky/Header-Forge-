# HeaderForge

Open-source, privacy-first HTTP header manager for **Chrome** and **Edge** (Manifest V3).

Built as a trustworthy alternative for developers who need profile-based request header control — without telemetry, analytics, or cloud lock-in.

> **Zero telemetry. Zero analytics. Everything stays on your device.**

**Repository:** [Scoobydowsky/Header-Forge-](https://github.com/Scoobydowsky/Header-Forge-)

This project was created with assistance from the **Cursor AI agent** (Composer).

## Features

- **Profiles** — Production, Development, QA, Localhost, or your own
- **Headers** — ADD / SET / REMOVE with one-click disable
- **Domain rules** — `localhost`, `api.example.com`, `*.example.com`
- **Presets** — JWT, Bearer, OAuth, CORS Testing, JSON API, XML API
- **Import / Export** — portable JSON
- **Automatic local backup** on every save
- **Popup** — active profile, enable toggle, quick switch, search, recent profiles
- **Options** — Profiles · Headers · Rules · Import · Export · About
- **Dark mode** — follows `prefers-color-scheme`
- **Color labels** — DEV / TEST / PROD / LOCAL
- **Counters** — active headers, domains, profiles
- **Validation** — blocks empty values for ADD/SET (e.g. `Authorization:` alone)
- **Toasts** — save / import / export / delete feedback
- **Shortcuts** — `Ctrl/Cmd+S`, `Ctrl/Cmd+F`, `Ctrl/Cmd+D` (also `Alt+Shift+H`)

## Install (developer mode)

1. Clone or download this repository.
2. Open Chrome/Edge → `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `HeaderForge` folder (the one containing `manifest.json`).
5. Pin HeaderForge from the toolbar.

### Optional: lint

```bash
npm install
npm run lint
```

## Quick start

1. Open the popup → confirm sample profiles loaded (Development is active by default).
2. Open **Options** → **Rules** and keep or edit domains for your target hosts.
3. Click **Grant host access** (or activate a profile) so Chrome can ask for host permissions.
4. Edit headers under **Headers**, or apply a preset.
5. Browse a matching site — request headers are modified via `declarativeNetRequest`.

## Screenshots

See the capture guide in [`docs/STORE.md`](./docs/STORE.md). Place final 1280×800 PNGs in `docs/screenshots/`.

## Store listing

Publishing checklist, privacy URL setup, and copy templates: [`docs/STORE.md`](./docs/STORE.md).

## Architecture

```
HeaderForge/
├── manifest.json              # MV3, minimal permissions
├── background/
│   └── service-worker.js      # Syncs DNR rules + badge
├── storage/
│   └── profiles.js            # chrome.storage.local model
├── rules/
│   └── rules.js               # Profile → declarativeNetRequest
├── popup/                     # Fast switcher UI
├── options/                   # Full configuration UI
├── utils/                     # DOM, validation, presets, toasts, theme
├── samples/                   # Demo profiles + export JSON
└── icons/
```

**Data flow**

1. UI writes profiles to `chrome.storage.local`.
2. Service worker listens for storage changes.
3. Active profile + enabled headers/rules → dynamic `declarativeNetRequest` rules.
4. No network calls are made by the extension itself.

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Local configuration |
| `declarativeNetRequest` | Header modification |
| `declarativeNetRequestWithHostAccess` | Modify headers on granted hosts |
| `tabs` | Open options / toolbar helpers |
| `http://*/*`, `https://*/*` | Apply header rules on websites (All sites / domain rules) |

## Privacy

See [PRIVACY.md](./PRIVACY.md) and [`docs/privacy.html`](./docs/privacy.html).

- No telemetry
- No analytics
- No external APIs for core features
- Domain “favicons” are local SVG marks (not fetched from the web)

## Sample data

- Runtime samples: `samples/sample-data.js` (seeded on first launch)
- Static export example: `samples/demo-export.json`

Import the demo file from **Options → Import** to try a clean fixture set.

## FAQ

**Does HeaderForge work offline?**  
Yes. All configuration is local.

**Will it modify every site?**  
No. Only hosts matching enabled domain rules on the active profile, and only after you grant host access.

**Can I import ModHeader configs?**  
v1 supports HeaderForge JSON. Cross-tool import is on the v2 roadmap where legally/technically possible.

**Where is my data stored?**  
Exclusively in `chrome.storage.local`, plus an automatic backup snapshot inside that same store.

**Why do I see permission prompts?**  
Chrome requires host permissions before `declarativeNetRequest` can modify requests for those origins. HeaderForge asks only for the domains in your rules.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Headers not applied | Ensure extension is enabled, profile is active, header toggles are on, and domain rules match the request host. |
| Permission errors | Open Options → Rules → **Grant host access**, or re-activate the profile. |
| Popup empty / errors | Reload the extension on `chrome://extensions`. Check the service worker console. |
| Wildcard not matching | Use `*.example.com` (matches `example.com` and subdomains via DNR `urlFilter`). |
| `Authorization` won’t save | ADD/SET require a non-empty value — this is intentional validation. |
| Dark mode wrong | HeaderForge follows the OS / browser `prefers-color-scheme` setting. |

## Roadmap (v2)

- Optional Google account sync (explicit opt-in)
- Secret masking / safer credential storage
- Rule editor with URL match preview
- Firefox support
- Import from other header extensions (when feasible)

## Development notes

- Vanilla JavaScript (ES2022), HTML, CSS
- No React/Vue/Angular
- No third-party JS libraries at runtime
- Comments and JSDoc in English
- ESLint flat config (`eslint.config.js`)

## License

MIT — see [LICENSE](./LICENSE).

## Credits

Created with assistance from the **Cursor AI agent** (Composer).
Repository: [Scoobydowsky/Header-Forge-](https://github.com/Scoobydowsky/Header-Forge-)
