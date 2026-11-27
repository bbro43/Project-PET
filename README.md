# Project PET

A mobile Mega Man Battle Network 4–6 battle simulator, installed from GitHub Pages: https://bbro43.github.io/Project-PET/

Original graphics are not included. The app decodes them on your device from Battle Network ROMs you import; nothing is uploaded.

- Run locally: `python3 -m http.server 8765` from the folder above this repo, then open http://127.0.0.1:8765/Project-PET/
- Tests: `node --test tests/*.test.mjs` (add `ROM_DIR=<folder of .gba files>` to also check the ROM offsets)
- Release: bump `release.js` (app every release, assets when shipped data changes), list new files in `sw.js`, add `documentation/releases/<version>.md`.
- Status and roadmap: `documentation/STATUS.md`. Working rules: `CLAUDE.md`.
