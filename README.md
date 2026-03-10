# Crossplay Solver

Crossplay Solver is a Windows desktop app that analyzes your board and rack to find the highest-scoring playable moves.

## Download and Install

### Installer (recommended)
- [Download Crossplay Solver Installer (.exe)](https://github.com/Lucaswu2008/crossplay-solver/raw/main/dist/Crossplay%20Solver-1.0.0-installer-x64.exe)

### Install steps
1. Download the installer from the link above.
2. Run `Crossplay Solver-1.0.0-installer-x64.exe`.
3. Finish setup and launch from Start Menu or Desktop shortcut.

## What the app does

- Solves board+rack positions and ranks best moves by score.
- Includes full score breakdown and move preview.
- Lets you apply a suggested move to the board with one click.
- Supports saved boards (`Game 1`, `Game 2`, etc.).
- Supports custom dictionary uploads (`.txt`) in addition to built-in `ENABLE2K`.
- Includes undo/redo and keyboard-driven board input.

## System requirements

- Windows 10 or Windows 11
- 64-bit system

## Quick Start

1. Open the app.
2. Enter board letters by clicking squares and typing `A-Z`.
3. Enter rack letters (`7` slots, use `?` for blank).
4. Click **Find Best Moves**.
5. Click a suggested move to preview it.
6. Click **Play Move** in Move Details to apply it.

## Board and Rack Input

### Board editing
- Click a square, then type a letter.
- Right-click a filled board square (or press `*`) to mark it as blank tile (`0` points).
- Auto-advance follows your current input direction.

### Rack editing
- Enter rack letters left to right.
- Use `?` for blanks.
- Backspace in rack moves back and clears previous tile when appropriate.

## Keyboard Shortcuts

- `Ctrl+Z`: Undo
- `Ctrl+Shift+Z` or `Ctrl+Y`: Redo
- Arrow keys: Move selected board square
- `Backspace` / `Delete`: Delete selected tile (or undo behavior when applicable)
- `*` or `?` on selected board tile: toggle blank mark

## Dictionaries

- Default dictionary: `ENABLE2K` (bundled with app).
- You can switch dictionaries from the Dictionary selector.
- You can load your own `.txt` word list with **Load TXT**.
- Custom dictionaries are kept in app state for your local install.

## Saved Boards

- Use the controls near the top to:
  - create a new board state,
  - rename board states,
  - delete board states,
  - switch between saved board states.
- App state is persisted automatically (board, rack, theme, selected dictionary, saved games).

## Themes

- Light and Dark themes are available in the top controls.

## Troubleshooting

### "Windows protected your PC" / SmartScreen
- Click **More info** -> **Run anyway** (for unsigned indie apps).

### Firewall prompt on first launch
- The app runs a local server (`127.0.0.1`) for the UI and solver bridge.
- This does not expose your app publicly.

### State didn't save
- Installed app save file:
  - `C:\Users\<YourUser>\AppData\Roaming\crossplay-solver-app\solver-state.json`
- Portable app save file:
  - `<Portable EXE folder>\CrossplaySolverData\solver-state.json`

## Privacy

- Runs locally on your machine.
- No account/login required.
- No cloud sync.

## Advanced: Build from Source

```powershell
npm.cmd install
npm.cmd run web:build
npm.cmd run win:dist
```

Build outputs:
- `dist/Crossplay Solver-1.0.0-installer-x64.exe`
- `dist/Crossplay Solver-1.0.0-portable-x64.exe`

## Legal

- This project is not affiliated with The New York Times.
- `Crossplay` and NYT-related marks belong to their respective owners.
