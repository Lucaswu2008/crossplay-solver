# Crossplay Solver App

Local Crossplay move solver with:
- Web app (`npm.cmd run web:dev`)
- Electron desktop app (`npm.cmd run electron:dev`)
- Windows packaging (`npm.cmd run win:dist`)

## Requirements
- Node.js 20+ (tested with Node 25)
- `ENABLE2K.txt` in the repository root (bundled default dictionary)

## Install
```powershell
npm.cmd install
```

## Run Web App
```powershell
npm.cmd run web:dev
```
Then open `http://localhost:4173`.

## Run Electron App
```powershell
npm.cmd run electron:dev
```

## Build Windows EXE Artifacts
```powershell
npm.cmd run win:dist
```
Outputs are written under `dist/` by Electron Builder:
- NSIS installer EXE
- Portable EXE

## Tests
```powershell
npm.cmd test
```

## Input Notes
- Board: click a square, type `A-Z`.
- Mark an existing board tile as blank: right-click the tile, or press `?` when selected.
- Rack: 7 slots, use `?` for blank tiles.
- Sweep bonus defaults to `40` and can be changed in the UI.
- Dictionary selector supports bundled `ENABLE2K` and custom `.txt` uploads.
