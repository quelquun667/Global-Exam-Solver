# GlobalExam Solver

> **Language / Langue:** [English](README.md) | [Français](README.fr.md)

A Chrome / Chromium extension that automatically answers exercises on [GlobalExam](https://global-exam.com), a language exam preparation platform.

> ⚠️ **Disclaimer** — This tool is provided for educational and personal study assistance. Use it responsibly. The authors are not affiliated with GlobalExam and are not responsible for any consequences resulting from its use, including potential account sanctions.

---

## Status

**Current version: `v0.1.0`** — Pre-alpha. Many question types are partially supported, others are still being implemented. Expect bugs.

---

## Features

- Reads the live `Inertia.js` / Vue page data directly from the MAIN world
- Detects the question type and applies the right strategy (click, drag, fill input)
- Supports several question categories:
  - `SINGLE_SELECTION`, `MULTIPLE_SELECTION` — single/multiple-choice
  - `SORTING_WORD`, `SORTING`, `ORDERING` — chips in order
  - `FILL_BLANK_SELECT`, `FILL_BLANK_DRAG` — drag chips into blanks
  - `ASSOCIATE`, `MATCHING`, `ASSOCIATION` — pair items
  - `FILL_IN_THE_BLANK`, `GAP_FILL`, `FILL_BLANK_RECON` — free text input
- **Auto mode**: chains exercises continuously, syncs on navigation events
- **Find mode**: solves the currently displayed question once
- Floating bottom-right overlay with debug button (sanitized data dump)

---

## Installation

The extension is **not** published on the Chrome Web Store. Load it manually as an unpacked extension.

### Option 1 — From a release `.zip`

1. Download the latest `globalexam-solver-vX.Y.Z.zip` from the [Releases page](https://github.com/quelquun667/Global-Exam-Solver/releases).
2. Unzip it anywhere on your computer.
3. Open `chrome://extensions`, enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped folder.

### Option 2 — From source

```bash
git clone https://github.com/quelquun667/Global-Exam-Solver.git
```

Then `Load unpacked` and select the `GlobalExamSolver/` subfolder.

The extension activates automatically on every `*.global-exam.com` page.

---

## Usage

1. Open an exercise on [global-exam.com](https://global-exam.com).
2. The **GE-Bot** overlay appears in the bottom-right corner.

| Button | Action |
|--------|--------|
| **Copy Data** | Dumps sanitized Inertia/Vue JSON to the DevTools console (F12) |
| **Find** | Solves the currently displayed question once |
| **Auto: OFF / ON** | Toggle continuous chaining of exercises |

Open DevTools (F12) and filter logs by `[GE-Bot]` to see what the bot is doing.

---

## Project structure

```
GlobalExamBot/
├── GlobalExamSolver/
│   ├── manifest.json       # Manifest V3 declaration
│   ├── main-world.js       # Runs in MAIN world — reads Vue/Inertia state
│   ├── content.js          # ISOLATED world entry — globals & logger
│   ├── data.js             # Bridge: receives data from main-world.js
│   ├── interactions.js     # DOM helpers: find element, click, drag, fill
│   ├── solver.js           # Per-question-type resolution logic
│   └── ui.js               # Floating overlay
├── .github/workflows/      # CI: release zip, version bump, lint
├── README.md               # This file
└── README.fr.md            # French version
```

### Architecture in a nutshell

- **`main-world.js`** runs in the page's MAIN execution world (declared via Manifest V3 `"world": "MAIN"`), giving it direct access to `app.__vueApp__` and `window.Inertia`. It also listens for navigation events and broadcasts fresh data via `window.postMessage`.
- **`data.js`** + **`solver.js`** + **`interactions.js`** + **`ui.js`** live in the ISOLATED world and consume those messages.
- The findElement strategy is **inspired by [Projet Voltaire Solver](https://github.com/quelquun667/Projet-Voltaire-Solver)**: broad DOM selectors + UI button filtering + fuzzy text matching.

---

## Releases & versioning

Releases are automated via GitHub Actions:

- Pushing a `v*.*.*` tag triggers the **Release** workflow, which builds a `.zip` of `GlobalExamSolver/` and attaches it to a new GitHub Release.
- Maintainers can trigger the **Bump version** workflow manually to increment `manifest.json` and push the matching tag.

Versions follow [SemVer](https://semver.org/) — `MAJOR.MINOR.PATCH`.

---

## Known limitations

- **Drag & drop simulation is fragile** — works on Vue-based drag handlers (most of GlobalExam), but may not trigger on custom or canvas-based interactions.
- **Some question types are partially supported** — see the type list above for what's covered.
- **No headless / fully-isolated mode** — the bot lives inside the browser session, so it follows your account.
- **Pre-1.0 software** — APIs, file structure and overlay UI can change between versions.

---

## Contributing

PRs welcome. If you hit an unsupported question type:

1. Click **Copy Data** and copy the JSON dumped in the console.
2. Open a GitHub issue with the JSON (after stripping any personal data) and a description of the exercise.
3. Or open a PR adding a new branch in [`solver.js`](GlobalExamSolver/solver.js).

---

## License

MIT — free to use, modify, and distribute. See [LICENSE](LICENSE) if present.
