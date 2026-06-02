# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [SemVer](https://semver.org/).

## [0.1.0] — 2026-06-02

### Added
- Initial public pre-alpha release
- Manifest V3 extension structure with MAIN-world script (`main-world.js`) for direct Vue/Inertia access
- Modular ISOLATED-world scripts: `data.js`, `interactions.js`, `solver.js`, `ui.js`
- Support for question types: `SINGLE_SELECTION`, `MULTIPLE_SELECTION`, `SORTING`, `FILL_BLANK_*`, `ASSOCIATE`/`MATCHING`, `FILL_IN_THE_BLANK`
- `findElementForAnswer` strategy inspired by Projet Voltaire Solver: broad selectors, UI-button filtering, fuzzy text matching
- Floating overlay (bottom-right): **Copy Data**, **Find**, **Auto: ON/OFF**
- GitHub Actions:
  - `release.yml` — builds extension `.zip` and attaches it to a Release on each `v*.*.*` tag
  - `bump-version.yml` — manual workflow to bump `manifest.json`, commit, tag and push
  - `lint.yml` — validates `manifest.json` and runs `node --check` on each JS file

### Known issues
- Drag & drop simulation may fail on some custom drag handlers
- Some question variants still require manual handling
- No headless / offline mode
