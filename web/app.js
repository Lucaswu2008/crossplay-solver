const BONUS_LABELS = {
  "2L": "2L",
  "3L": "3L",
  "2W": "2W",
  "3W": "3W",
  "**": "NYT"
};

const BONUS_CLASS = {
  "2L": "bonus-2L",
  "3L": "bonus-3L",
  "2W": "bonus-2W",
  "3W": "bonus-3W",
  "**": "bonus-start"
};

const boardElement = document.querySelector("#board");
const rackElement = document.querySelector("#rack");
const solveButton = document.querySelector("#solveButton");
const clearBoardButton = document.querySelector("#clearBoard");
const clearRackButton = document.querySelector("#clearRack");
const resultListElement = document.querySelector("#resultsList");
const movesScrollElement = document.querySelector(".moves-scroll");
const detailElement = document.querySelector("#moveDetail");
const dictionarySelectElement = document.querySelector("#dictionarySelect");
const dictionaryUploadButton = document.querySelector("#dictionaryUploadButton");
const dictionaryFileInput = document.querySelector("#dictionaryFileInput");
const analysisInstructionsElement = document.querySelector("#analysisInstructions");
const selectedCellLabel = document.querySelector("#selectedCellLabel");
const sweepBonusInput = document.querySelector("#sweepBonus");
const resultMetaElement = document.querySelector("#resultMeta");
const analysisCopyElement = document.querySelector("#analysisCopy");
const keyTurnTitleElement = document.querySelector("#keyTurnTitle");
const themeLightButton = document.querySelector("#themeLight");
const themeDarkButton = document.querySelector("#themeDark");
const undoButton = document.querySelector("#undoButton");
const redoButton = document.querySelector("#redoButton");
const boardWrapperElement = document.querySelector(".board-wrapper");
const savedGameSelectElement = document.querySelector("#savedGameSelect");
const addGameButton = document.querySelector("#addGameButton");
const renameGameButton = document.querySelector("#renameGameButton");
const deleteGameButton = document.querySelector("#deleteGameButton");

const THEME_STORAGE_KEY = "crossplay-solver-theme";
const APP_STATE_STORAGE_KEY = "crossplay-solver-app-state-v2";
const HISTORY_LIMIT = 250;

const state = {
  boardSize: 15,
  rackSize: 7,
  boardBonuses: [],
  tileScores: {},
  board: [],
  rack: [],
  selected: null,
  inputDirection: "horizontal",
  lastTypedCell: null,
  awaitingDirectionClick: false,
  boardInputActive: false,
  results: [],
  activeResultIndex: -1,
  visibleMoveCount: 0,
  requestedLimit: 0,
  hasMoreServerResults: false,
  isLoadingMore: false,
  lastSolvePayload: null,
  dictionaryOptions: [],
  selectedDictionaryId: "",
  savedGames: [],
  activeGameId: null,
  undoStack: [],
  redoStack: [],
  isHydrating: false,
  isSolving: false
};

const serverBridge = {
  health: async () => {
    const response = await fetch("/api/health");
    if (!response.ok) {
      throw new Error("Failed to load health status.");
    }
    return response.json();
  },
  solve: async (payload) => {
    const response = await fetch("/api/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error ?? "Solve request failed.");
    }
    return response.json();
  },
  uploadDictionary: async (payload) => {
    const response = await fetch("/api/dictionaries/custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error ?? "Dictionary upload failed.");
    }
    return response.json();
  }
};

const solverBridge = window.crossplaySolver
  ? {
      health: () =>
        typeof window.crossplaySolver.health === "function"
          ? window.crossplaySolver.health()
          : serverBridge.health(),
      solve: (payload) =>
        typeof window.crossplaySolver.solve === "function"
          ? window.crossplaySolver.solve(payload)
          : serverBridge.solve(payload),
      uploadDictionary: (payload) =>
        typeof window.crossplaySolver.uploadDictionary === "function"
          ? window.crossplaySolver.uploadDictionary(payload)
          : serverBridge.uploadDictionary(payload)
    }
  : serverBridge;

const appStateBridge =
  window.desktopShell &&
  typeof window.desktopShell.loadAppState === "function" &&
  typeof window.desktopShell.saveAppState === "function"
    ? {
        load: () => window.desktopShell.loadAppState(),
        save: (payload) => window.desktopShell.saveAppState(payload),
        saveSync:
          typeof window.desktopShell.saveAppStateSync === "function"
            ? (payload) => window.desktopShell.saveAppStateSync(payload)
            : null
      }
    : null;

const APP_STATE_SAVE_DEBOUNCE_MS = 140;
let pendingSaveTimeoutId = null;
let pendingFileStatePayload = null;
let fileSaveInFlight = false;

function createEmptyBoard(size) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({
      letter: "",
      isBlankTile: false
    }))
  );
}

function boardCell(row, col) {
  return state.board[row][col];
}

function getRackString() {
  return state.rack.join("");
}

function cloneBoardData(board) {
  return board.map((row) =>
    row.map((cell) => ({
      letter: cell.letter,
      isBlankTile: Boolean(cell.isBlankTile)
    }))
  );
}

function normalizeGameSnapshot(snapshot) {
  const normalized = {
    board: createEmptyBoard(state.boardSize),
    rack: Array.from({ length: state.rackSize }, () => ""),
    selected: null,
    sweepBonus: Number.isFinite(Number(snapshot?.sweepBonus)) ? Math.max(0, Math.floor(Number(snapshot.sweepBonus))) : 40,
    inputDirection: snapshot?.inputDirection === "vertical" ? "vertical" : "horizontal"
  };

  if (Array.isArray(snapshot?.board) && snapshot.board.length === state.boardSize) {
    for (let row = 0; row < state.boardSize; row += 1) {
      const sourceRow = snapshot.board[row];
      if (!Array.isArray(sourceRow) || sourceRow.length !== state.boardSize) {
        continue;
      }

      for (let col = 0; col < state.boardSize; col += 1) {
        const sourceCell = sourceRow[col] ?? {};
        const rawLetter = String(sourceCell.letter ?? "").toUpperCase();
        normalized.board[row][col].letter = /^[A-Z]$/.test(rawLetter) ? rawLetter : "";
        normalized.board[row][col].isBlankTile =
          Boolean(sourceCell.isBlankTile) && Boolean(normalized.board[row][col].letter);
      }
    }
  }

  if (Array.isArray(snapshot?.rack)) {
    for (let index = 0; index < state.rackSize; index += 1) {
      const raw = String(snapshot.rack[index] ?? "").toUpperCase();
      normalized.rack[index] = /^[A-Z?]$/.test(raw) ? raw : "";
    }
  }

  const selected = snapshot?.selected;
  if (
    selected &&
    Number.isInteger(selected.row) &&
    Number.isInteger(selected.col) &&
    selected.row >= 0 &&
    selected.row < state.boardSize &&
    selected.col >= 0 &&
    selected.col < state.boardSize
  ) {
    normalized.selected = { row: selected.row, col: selected.col };
  }

  return normalized;
}

function applySnapshotToLiveState(snapshot) {
  const normalized = normalizeGameSnapshot(snapshot);

  state.board = cloneBoardData(normalized.board);

  for (let index = 0; index < state.rackSize; index += 1) {
    setRackValue(index, normalized.rack[index] ?? "");
  }

  sweepBonusInput.value = String(normalized.sweepBonus);
  state.inputDirection = normalized.inputDirection;
  state.selected = normalized.selected ? { ...normalized.selected } : null;

  if (state.selected) {
    selectedCellLabel.textContent = `${state.selected.row + 1}, ${state.selected.col + 1}`;
  } else {
    selectedCellLabel.textContent = "None";
  }
}

function createLiveSnapshot() {
  return {
    board: cloneBoardData(state.board),
    rack: [...state.rack],
    selected: state.selected ? { ...state.selected } : null,
    sweepBonus: Number(sweepBonusInput.value),
    inputDirection: state.inputDirection
  };
}

function createEditSnapshot() {
  return createLiveSnapshot();
}

function updateUndoRedoButtons() {
  if (undoButton instanceof HTMLButtonElement) {
    undoButton.disabled = state.undoStack.length === 0;
  }

  if (redoButton instanceof HTMLButtonElement) {
    redoButton.disabled = state.redoStack.length === 0;
  }
}

function normalizeDictionaryOption(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const id = String(entry.id ?? "").trim();
  if (!id) {
    return null;
  }

  const name = String(entry.name ?? id).trim() || id;
  const words = Number(entry.words ?? 0);

  return {
    id,
    name,
    words: Number.isFinite(words) && words >= 0 ? Math.floor(words) : 0,
    isCustom: Boolean(entry.isCustom)
  };
}

function getDictionaryById(dictionaryId) {
  return state.dictionaryOptions.find((entry) => entry.id === dictionaryId) ?? null;
}

function formatDictionaryOptionLabel(option) {
  return `${option.name} (${option.words.toLocaleString()} words)`;
}

function renderDictionarySelector() {
  if (!(dictionarySelectElement instanceof HTMLSelectElement)) {
    return;
  }

  dictionarySelectElement.innerHTML = "";

  if (!state.dictionaryOptions.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No dictionaries available";
    dictionarySelectElement.appendChild(option);
    dictionarySelectElement.disabled = true;
    return;
  }

  dictionarySelectElement.disabled = false;

  for (const optionData of state.dictionaryOptions) {
    const option = document.createElement("option");
    option.value = optionData.id;
    option.textContent = formatDictionaryOptionLabel(optionData);
    dictionarySelectElement.appendChild(option);
  }

  const fallbackId = state.dictionaryOptions[0].id;
  const selectedId = getDictionaryById(state.selectedDictionaryId) ? state.selectedDictionaryId : fallbackId;
  state.selectedDictionaryId = selectedId;
  dictionarySelectElement.value = selectedId;
}

function setDictionarySelection(dictionaryId, { persist = true, invalidate = true } = {}) {
  if (!getDictionaryById(dictionaryId)) {
    return false;
  }

  if (state.selectedDictionaryId === dictionaryId) {
    return true;
  }

  state.selectedDictionaryId = dictionaryId;

  if (invalidate) {
    invalidateResults();
  }

  if (persist) {
    persistAppState();
  }

  return true;
}

async function uploadCustomDictionaryFromFile(file) {
  if (!(file instanceof File)) {
    return;
  }

  const text = await file.text();
  const response = await solverBridge.uploadDictionary({
    name: file.name,
    text
  });

  if (Array.isArray(response?.dictionaries)) {
    const normalized = response.dictionaries.map(normalizeDictionaryOption).filter(Boolean);
    if (normalized.length > 0) {
      state.dictionaryOptions = normalized;
    }
  }

  if (state.dictionaryOptions.length === 0 && response?.dictionary) {
    const fallbackEntry = normalizeDictionaryOption(response.dictionary);
    if (fallbackEntry) {
      state.dictionaryOptions = [fallbackEntry];
    }
  }

  const preferredDictionaryId =
    typeof response?.activeDictionaryId === "string" ? response.activeDictionaryId : response?.dictionary?.id;
  const fallbackDictionaryId = state.dictionaryOptions[0]?.id ?? "";
  const nextDictionaryId = getDictionaryById(preferredDictionaryId) ? preferredDictionaryId : fallbackDictionaryId;

  if (nextDictionaryId) {
    setDictionarySelection(nextDictionaryId, { persist: false, invalidate: true });
  }

  renderDictionarySelector();
  persistAppState();
}

function pushUndoSnapshot() {
  if (state.isHydrating) {
    return;
  }

  state.undoStack.push(createEditSnapshot());

  if (state.undoStack.length > HISTORY_LIMIT) {
    state.undoStack.shift();
  }

  state.redoStack = [];
  updateUndoRedoButtons();
}

function getActiveGameIndex() {
  return state.savedGames.findIndex((game) => game.id === state.activeGameId);
}

function getActiveGame() {
  const index = getActiveGameIndex();
  return index >= 0 ? state.savedGames[index] : null;
}

function syncActiveGameSnapshotFromLiveState() {
  const activeGame = getActiveGame();
  if (!activeGame) {
    return;
  }

  activeGame.snapshot = normalizeGameSnapshot(createLiveSnapshot());
}

function nextDefaultGameName() {
  let maxIndex = 0;

  for (const game of state.savedGames) {
    const match = /^Game\s+(\d+)$/i.exec(game.name);
    if (match) {
      maxIndex = Math.max(maxIndex, Number(match[1]));
    }
  }

  return `Game ${maxIndex + 1}`;
}

function createBlankGameSnapshot() {
  const center = Math.floor(state.boardSize / 2);
  return normalizeGameSnapshot({
    board: createEmptyBoard(state.boardSize),
    rack: Array.from({ length: state.rackSize }, () => ""),
    selected: { row: center, col: center },
    sweepBonus: Number(sweepBonusInput.value),
    inputDirection: "horizontal"
  });
}

function renderSavedGameControls() {
  if (!(savedGameSelectElement instanceof HTMLSelectElement)) {
    return;
  }

  savedGameSelectElement.innerHTML = "";

  for (const game of state.savedGames) {
    const option = document.createElement("option");
    option.value = game.id;
    option.textContent = game.name;
    savedGameSelectElement.appendChild(option);
  }

  if (state.activeGameId) {
    savedGameSelectElement.value = state.activeGameId;
  }

  if (deleteGameButton instanceof HTMLButtonElement) {
    deleteGameButton.disabled = state.savedGames.length <= 1;
  }

  if (renameGameButton instanceof HTMLButtonElement) {
    renameGameButton.disabled = state.savedGames.length === 0;
  }
}

function loadSavedGame(gameId) {
  const target = state.savedGames.find((game) => game.id === gameId);
  if (!target) {
    return;
  }

  state.isHydrating = true;
  applySnapshotToLiveState(target.snapshot);
  state.lastTypedCell = null;
  state.awaitingDirectionClick = false;
  state.boardInputActive = false;
  state.undoStack = [];
  state.redoStack = [];
  updateUndoRedoButtons();
  state.isHydrating = false;

  invalidateResults();
  renderBoard();
  updateSolveButtonState();
  persistAppState();
}

function switchSavedGame(gameId) {
  if (!gameId || gameId === state.activeGameId) {
    return;
  }

  syncActiveGameSnapshotFromLiveState();
  state.activeGameId = gameId;
  loadSavedGame(gameId);
  renderSavedGameControls();
}

function addSavedGame() {
  syncActiveGameSnapshotFromLiveState();

  const id = `game-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const game = {
    id,
    name: nextDefaultGameName(),
    snapshot: createBlankGameSnapshot()
  };

  state.savedGames.push(game);
  state.activeGameId = game.id;
  loadSavedGame(game.id);
  renderSavedGameControls();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function openRenameDialog(initialName) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "rename-dialog-overlay";
    overlay.innerHTML = `
      <div class="rename-dialog-card" role="dialog" aria-modal="true" aria-label="Rename board">
        <h4>Rename Board</h4>
        <input id="renameGameInput" type="text" maxlength="40" value="${initialName.replace(/"/g, "&quot;")}" />
        <div class="rename-dialog-actions">
          <button type="button" class="rename-dialog-button rename-dialog-cancel">Cancel</button>
          <button type="button" class="rename-dialog-button rename-dialog-save">Save</button>
        </div>
      </div>
    `;

    const input = overlay.querySelector("#renameGameInput");
    const cancelButton = overlay.querySelector(".rename-dialog-cancel");
    const saveButton = overlay.querySelector(".rename-dialog-save");

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    const submit = () => {
      if (!(input instanceof HTMLInputElement)) {
        close(null);
        return;
      }

      const nextName = input.value.trim();
      if (!nextName) {
        input.focus();
        return;
      }

      close(nextName);
    };

    cancelButton?.addEventListener("click", () => close(null));
    saveButton?.addEventListener("click", submit);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close(null);
      }
    });
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        close(null);
      }
    });

    document.body.appendChild(overlay);
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  });
}

async function renameSavedGame() {
  const activeGame = getActiveGame();
  if (!activeGame) {
    return;
  }

  const nextName = await openRenameDialog(activeGame.name);
  if (!nextName) {
    return;
  }

  activeGame.name = nextName;
  renderSavedGameControls();
  persistAppState();
}

function openDeleteDialog(gameName) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "rename-dialog-overlay";
    overlay.innerHTML = `
      <div class="rename-dialog-card" role="dialog" aria-modal="true" aria-label="Delete board">
        <h4>Delete Board</h4>
        <p class="confirm-dialog-message">Delete "${escapeHtml(gameName)}"?</p>
        <div class="rename-dialog-actions">
          <button type="button" class="rename-dialog-button rename-dialog-cancel">Cancel</button>
          <button type="button" class="rename-dialog-button rename-dialog-delete">Delete</button>
        </div>
      </div>
    `;

    const cancelButton = overlay.querySelector(".rename-dialog-cancel");
    const deleteButton = overlay.querySelector(".rename-dialog-delete");

    const close = (confirmed) => {
      overlay.remove();
      resolve(Boolean(confirmed));
    };

    cancelButton?.addEventListener("click", () => close(false));
    deleteButton?.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close(false);
      }
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        close(true);
      }
    });

    document.body.appendChild(overlay);
    if (deleteButton instanceof HTMLButtonElement) {
      deleteButton.focus();
    }
  });
}

async function deleteSavedGame() {
  if (state.savedGames.length <= 1) {
    return;
  }

  const activeIndex = getActiveGameIndex();
  if (activeIndex < 0) {
    return;
  }

  const activeGame = state.savedGames[activeIndex];
  const confirmDelete = await openDeleteDialog(activeGame.name);
  if (!confirmDelete) {
    return;
  }

  state.savedGames.splice(activeIndex, 1);
  const nextIndex = Math.min(activeIndex, state.savedGames.length - 1);
  state.activeGameId = state.savedGames[nextIndex].id;
  loadSavedGame(state.activeGameId);
  renderSavedGameControls();
}

function initializeSavedGamesFromParsed(parsed) {
  if (Array.isArray(parsed?.savedGames) && parsed.savedGames.length > 0) {
    const normalizedGames = [];

    for (const game of parsed.savedGames) {
      if (!game || typeof game !== "object") {
        continue;
      }

      const id = String(game.id ?? "");
      if (!id) {
        continue;
      }

      const name = String(game.name ?? "").trim() || `Game ${normalizedGames.length + 1}`;
      normalizedGames.push({
        id,
        name,
        snapshot: normalizeGameSnapshot(game.snapshot)
      });
    }

    if (normalizedGames.length > 0) {
      state.savedGames = normalizedGames;
      const parsedActiveId = String(parsed.activeGameId ?? "");
      const activeGame = normalizedGames.find((game) => game.id === parsedActiveId) ?? normalizedGames[0];
      state.activeGameId = activeGame.id;
      applySnapshotToLiveState(activeGame.snapshot);
      return;
    }
  }

  const legacyDefault = {
    id: "game-1",
    name: "Game 1",
    snapshot: normalizeGameSnapshot(createLiveSnapshot())
  };

  state.savedGames = [legacyDefault];
  state.activeGameId = legacyDefault.id;
}

function ensureSavedGamesInitialized() {
  if (state.savedGames.length > 0) {
    return;
  }

  const defaultGame = {
    id: "game-1",
    name: "Game 1",
    snapshot: normalizeGameSnapshot(createLiveSnapshot())
  };

  state.savedGames = [defaultGame];
  state.activeGameId = defaultGame.id;
}

function applyEditSnapshot(snapshot) {
  if (!snapshot) {
    return;
  }

  state.isHydrating = true;
  applySnapshotToLiveState(snapshot);
  state.lastTypedCell = null;
  state.awaitingDirectionClick = false;
  state.boardInputActive = Boolean(state.selected);
  invalidateResults();
  renderBoard();
  if (state.selected) {
    focusBoardCell(state.selected.row, state.selected.col);
  } else if (isBoardCellElement(document.activeElement)) {
    document.activeElement.blur();
  }
  updateSolveButtonState();
  state.isHydrating = false;
  syncActiveGameSnapshotFromLiveState();
  persistAppState();
}

function undo() {
  if (!state.undoStack.length) {
    return;
  }

  const current = createEditSnapshot();
  const previous = state.undoStack.pop();
  state.redoStack.push(current);
  applyEditSnapshot(previous);
  updateUndoRedoButtons();
}

function redo() {
  if (!state.redoStack.length) {
    return;
  }

  const current = createEditSnapshot();
  const next = state.redoStack.pop();
  state.undoStack.push(current);
  applyEditSnapshot(next);
  updateUndoRedoButtons();
}

function serializeSavedGames() {
  return state.savedGames.map((game) => ({
    id: game.id,
    name: game.name,
    snapshot: normalizeGameSnapshot(game.snapshot)
  }));
}

function serializeAppState() {
  syncActiveGameSnapshotFromLiveState();
  const resultsToStore = [...state.results];

  return {
    board: cloneBoardData(state.board),
    rack: [...state.rack],
    selected: state.selected ? { ...state.selected } : null,
    inputDirection: state.inputDirection,
    theme: document.body.dataset.theme === "dark" ? "dark" : "light",
    sweepBonus: Number(sweepBonusInput.value),
    results: resultsToStore,
    activeResultIndex: state.activeResultIndex,
    visibleMoveCount: Math.min(state.visibleMoveCount, resultsToStore.length),
    requestedLimit: state.requestedLimit,
    hasMoreServerResults: state.hasMoreServerResults,
    selectedDictionaryId: state.selectedDictionaryId,
    savedGames: serializeSavedGames(),
    activeGameId: state.activeGameId
  };
}

function saveToLocalStorage(payload) {
  try {
    window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(payload));
    return payload;
  } catch {
    const reducedPayload = { ...payload, results: payload.results.slice(0, 120) };
    try {
      window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(reducedPayload));
      return reducedPayload;
    } catch {
      return reducedPayload;
    }
  }
}

function loadFromLocalStorage() {
  let rawState = null;

  try {
    rawState = window.localStorage.getItem(APP_STATE_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!rawState) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawState);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function flushPendingFileStateSave() {
  if (!appStateBridge || fileSaveInFlight || !pendingFileStatePayload) {
    return;
  }

  fileSaveInFlight = true;
  const payload = pendingFileStatePayload;
  pendingFileStatePayload = null;

  try {
    await appStateBridge.save(payload);
  } catch {
    // Ignore file persistence errors; localStorage fallback still exists.
  } finally {
    fileSaveInFlight = false;
  }

  if (pendingFileStatePayload) {
    void flushPendingFileStateSave();
  }
}

function scheduleFileStateSave(payload) {
  if (!appStateBridge) {
    return;
  }

  pendingFileStatePayload = payload;

  if (pendingSaveTimeoutId !== null) {
    window.clearTimeout(pendingSaveTimeoutId);
  }

  pendingSaveTimeoutId = window.setTimeout(() => {
    pendingSaveTimeoutId = null;
    void flushPendingFileStateSave();
  }, APP_STATE_SAVE_DEBOUNCE_MS);
}

function persistAppState(options = {}) {
  if (state.isHydrating) {
    return;
  }

  const payload = serializeAppState();
  const persistedPayload = saveToLocalStorage(payload);

  if (!appStateBridge) {
    return;
  }

  if (options.sync && appStateBridge.saveSync) {
    try {
      const syncSaved = appStateBridge.saveSync(persistedPayload);
      if (syncSaved) {
        pendingFileStatePayload = null;
        if (pendingSaveTimeoutId !== null) {
          window.clearTimeout(pendingSaveTimeoutId);
          pendingSaveTimeoutId = null;
        }
        return;
      }
    } catch {
      // Fall back to async save.
    }
  }

  scheduleFileStateSave(persistedPayload);
}

async function restorePersistedAppState() {
  let parsed = null;

  if (appStateBridge) {
    try {
      const fileState = await appStateBridge.load();
      if (fileState && typeof fileState === "object") {
        parsed = fileState;
      }
    } catch {
      parsed = null;
    }
  }

  if (!parsed) {
    parsed = loadFromLocalStorage();
  }

  if (!parsed) {
    return;
  }

  state.isHydrating = true;
  applySnapshotToLiveState({
    board: parsed.board,
    rack: parsed.rack,
    selected: parsed.selected,
    sweepBonus: parsed.sweepBonus,
    inputDirection: parsed.inputDirection
  });

  if (parsed.theme === "dark" || parsed.theme === "light") {
    applyTheme(parsed.theme);
  }

  if (typeof parsed.selectedDictionaryId === "string" && getDictionaryById(parsed.selectedDictionaryId)) {
    state.selectedDictionaryId = parsed.selectedDictionaryId;
  }

  renderDictionarySelector();
  initializeSavedGamesFromParsed(parsed);

  if (Array.isArray(parsed.results) && parsed.results.length > 0) {
    state.results = parsed.results;
    state.requestedLimit = Math.max(30, Number(parsed.requestedLimit) || 30);
    state.visibleMoveCount = Math.min(
      parsed.visibleMoveCount && Number.isInteger(parsed.visibleMoveCount) ? parsed.visibleMoveCount : 30,
      state.results.length
    );
    state.activeResultIndex =
      parsed.activeResultIndex && Number.isInteger(parsed.activeResultIndex) ? parsed.activeResultIndex : 0;
    state.hasMoreServerResults = Boolean(parsed.hasMoreServerResults);
    state.lastSolvePayload = createSolvePayload(state.requestedLimit);
  }

  state.isHydrating = false;
  updateSolveButtonState();
  renderBoard();

  if (state.results.length) {
    renderResults(state.results);
  } else {
    invalidateResults();
  }
}

function updateSolveButtonState() {
  const canSolve = getRackString().length > 0 && !state.isSolving;
  solveButton.disabled = !canSolve;
  solveButton.textContent = state.isSolving ? "Solving..." : "Find Best Moves";
}

function initializeBoardUI() {
  boardElement.innerHTML = "";

  for (let row = 0; row < state.boardSize; row += 1) {
    for (let col = 0; col < state.boardSize; col += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "board-cell";
      button.dataset.row = String(row);
      button.dataset.col = String(col);

      button.addEventListener("click", () => {
        selectCell(row, col, { fromUser: true });
      });

      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        toggleBoardBlank(row, col);
      });

      boardElement.appendChild(button);
    }
  }
}

function setRackValue(index, char) {
  const slot = rackElement.querySelector(`.rack-slot[data-index=\"${index}\"]`);
  const input = slot?.querySelector(".rack-input");
  const points = slot?.querySelector(".rack-point");

  state.rack[index] = char;

  if (input instanceof HTMLInputElement) {
    input.value = char;
  }

  if (points instanceof HTMLElement) {
    points.textContent = char ? String(state.tileScores[char] ?? 0) : "";
  }

  if (slot instanceof HTMLElement) {
    slot.classList.toggle("empty", !char);
  }
}

function initializeRackUI() {
  rackElement.innerHTML = "";
  state.rack = Array.from({ length: state.rackSize }, () => "");

  for (let index = 0; index < state.rackSize; index += 1) {
    const slot = document.createElement("div");
    slot.className = "rack-slot empty";
    slot.dataset.index = String(index);

    const input = document.createElement("input");
    input.className = "rack-input";
    input.type = "text";
    input.maxLength = 1;
    input.dataset.index = String(index);
    input.autocomplete = "off";

    const point = document.createElement("span");
    point.className = "rack-point";

    input.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      const char = target.value.toUpperCase().replace(/[^A-Z?]/g, "").slice(0, 1);
      if (char !== state.rack[index]) {
        pushUndoSnapshot();
      }
      setRackValue(index, char);
      invalidateResults();
      updateSolveButtonState();
      persistAppState();

      if (char && index < state.rackSize - 1) {
        const nextInput = rackElement.querySelector(`.rack-input[data-index="${index + 1}"]`);
        if (nextInput instanceof HTMLInputElement) {
          nextInput.focus();
          nextInput.select();
        }
      }
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && index > 0) {
        event.preventDefault();
        pushUndoSnapshot();
        const previousIndex = index - 1;
        setRackValue(previousIndex, "");
        invalidateResults();
        updateSolveButtonState();
        persistAppState();

        const previousInput = rackElement.querySelector(`.rack-input[data-index="${previousIndex}"]`);
        if (previousInput instanceof HTMLInputElement) {
          previousInput.focus();
          previousInput.select();
        }
      } else if (event.key === "ArrowRight" && index < state.rackSize - 1) {
        event.preventDefault();
        const next = rackElement.querySelector(`.rack-input[data-index=\"${index + 1}\"]`);
        next?.focus();
      } else if (event.key === "ArrowLeft" && index > 0) {
        event.preventDefault();
        const prev = rackElement.querySelector(`.rack-input[data-index=\"${index - 1}\"]`);
        prev?.focus();
      }
    });

    slot.appendChild(input);
    slot.appendChild(point);
    rackElement.appendChild(slot);
  }

  updateSolveButtonState();
}

function getBoardCellButton(row, col) {
  return boardElement.querySelector(`.board-cell[data-row="${row}"][data-col="${col}"]`);
}

function focusBoardCell(row, col) {
  const button = getBoardCellButton(row, col);
  if (button instanceof HTMLButtonElement) {
    button.focus({ preventScroll: true });
  }
}

function selectCell(row, col, options = {}) {
  const { fromUser = false } = options;
  if (fromUser) {
    const typedCell = state.lastTypedCell;
    const userPickedVertical =
      state.awaitingDirectionClick &&
      typedCell &&
      col === typedCell.col &&
      row !== typedCell.row;

    state.inputDirection = userPickedVertical ? "vertical" : "horizontal";
    state.awaitingDirectionClick = false;
    state.boardInputActive = true;
  }

  state.selected = { row, col };
  selectedCellLabel.textContent = `${row + 1}, ${col + 1}`;
  renderBoard();
  focusBoardCell(row, col);
  persistAppState();
}

function setBoardLetter(row, col, letter) {
  const cell = boardCell(row, col);

  if (letter) {
    cell.letter = letter;
    cell.isBlankTile = false;
  } else {
    cell.letter = "";
    cell.isBlankTile = false;
  }

  invalidateResults();
  persistAppState();
}

function toggleBoardBlank(row, col) {
  const cell = boardCell(row, col);
  if (!cell.letter) {
    return;
  }

  pushUndoSnapshot();
  cell.isBlankTile = !cell.isBlankTile;
  invalidateResults();
  renderBoard();
  persistAppState();
}

function moveSelection(dr, dc) {
  if (!state.selected) {
    return;
  }

  const nextRow = Math.min(state.boardSize - 1, Math.max(0, state.selected.row + dr));
  const nextCol = Math.min(state.boardSize - 1, Math.max(0, state.selected.col + dc));
  selectCell(nextRow, nextCol, { fromUser: false });
}

function advanceSelectionToNextEmpty(startRow, startCol, direction) {
  const dr = direction === "vertical" ? 1 : 0;
  const dc = direction === "vertical" ? 0 : 1;
  let row = startRow;
  let col = startCol;

  while (true) {
    row += dr;
    col += dc;

    if (row < 0 || row >= state.boardSize || col < 0 || col >= state.boardSize) {
      return;
    }

    if (!boardCell(row, col).letter) {
      selectCell(row, col, { fromUser: false });
      return;
    }
  }
}

function getPreviewMap() {
  const preview = new Map();
  const activeMove = state.results[state.activeResultIndex];

  if (!activeMove) {
    return preview;
  }

  for (const placement of activeMove.placements) {
    preview.set(`${placement.row},${placement.col}`, placement.letter);
  }

  return preview;
}

function renderBoard() {
  const previewMap = getPreviewMap();

  boardElement.querySelectorAll(".board-cell").forEach((button) => {
    const row = Number(button.dataset.row);
    const col = Number(button.dataset.col);
    const cell = boardCell(row, col);
    const bonusCode = state.boardBonuses[row][col];

    button.className = "board-cell";
    if (BONUS_CLASS[bonusCode]) {
      button.classList.add(BONUS_CLASS[bonusCode]);
    }

    if (state.selected && state.selected.row === row && state.selected.col === col) {
      button.classList.add("selected");
    }

    if (previewMap.has(`${row},${col}`)) {
      button.classList.add("preview");
    }

    if (cell.letter) {
      button.classList.add("filled");
      if (cell.isBlankTile) {
        button.classList.add("blank-tile");
      }
      const letterScore = cell.isBlankTile ? 0 : state.tileScores[cell.letter] ?? 0;
      button.innerHTML = `
        <span class="cell-main-label">${cell.letter}${cell.isBlankTile ? "*" : ""}</span>
        <span class="cell-point-value">${letterScore}</span>
      `;
      return;
    }

    if (previewMap.has(`${row},${col}`)) {
      button.innerHTML = `<span class=\"cell-main-label\">${previewMap.get(`${row},${col}`)}</span>`;
      return;
    }

    const bonusLabel = BONUS_LABELS[bonusCode] ?? "";
    button.innerHTML = `<span class=\"cell-bonus-label\">${bonusLabel}</span>`;
  });
}

function formatMoveLocation(move) {
  return `${move.direction}${move.row + 1}:${move.col + 1}`;
}

function getMoveBadge(move) {
  for (const placement of move.placements) {
    const bonus = state.boardBonuses[placement.row][placement.col];
    if (bonus && bonus !== "__" && bonus !== "**") {
      return bonus;
    }
  }
  return "";
}

function getScorePercent(score, topScore) {
  if (topScore <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((score / topScore) * 100)));
}

function consumeRackTile(letter, isBlankPlacement) {
  const preferred = isBlankPlacement ? "?" : letter;
  let rackIndex = state.rack.findIndex((rackTile) => rackTile === preferred);

  if (rackIndex < 0 && !isBlankPlacement) {
    rackIndex = state.rack.findIndex((rackTile) => rackTile === "?");
  }

  if (rackIndex >= 0) {
    setRackValue(rackIndex, "");
  }
}

function compactRackToLeft() {
  const filledTiles = state.rack.filter((tile) => tile);

  for (let index = 0; index < state.rackSize; index += 1) {
    setRackValue(index, filledTiles[index] ?? "");
  }
}

function playSuggestedMove(index) {
  const move = state.results[index];
  if (!move) {
    return;
  }

  pushUndoSnapshot();

  for (const placement of move.placements) {
    const cell = boardCell(placement.row, placement.col);
    cell.letter = placement.letter;
    cell.isBlankTile = Boolean(placement.isBlank);
  }

  for (const placement of move.placements) {
    consumeRackTile(placement.letter, Boolean(placement.isBlank));
  }

  compactRackToLeft();

  if (move.placements.length > 0) {
    state.selected = { row: move.placements[0].row, col: move.placements[0].col };
    selectedCellLabel.textContent = `${state.selected.row + 1}, ${state.selected.col + 1}`;
  }

  state.boardInputActive = true;
  state.lastTypedCell = null;
  state.awaitingDirectionClick = false;

  invalidateResults();
  renderBoard();
  updateSolveButtonState();
  persistAppState();
}

function renderMoveDetail(index) {
  const move = state.results[index];

  if (!move) {
    detailElement.innerHTML = "<p>Select a move to inspect details.</p>";
    return;
  }

  const crossWords = move.scoreBreakdown.crossWords;
  const crossList = crossWords.length
    ? `<ul>${crossWords
        .map((cross) => `<li>${cross.word} (${cross.direction} ${cross.row + 1},${cross.col + 1}) +${cross.score}</li>`)
        .join("")}</ul>`
    : "<p>No cross-words were formed on this move.</p>";

  detailElement.innerHTML = `
    <p><strong>${move.word}</strong> at <strong>${formatMoveLocation(move)}</strong> scores <strong>${move.score}</strong>.</p>
    <p>Main word: +${move.scoreBreakdown.mainWord.score}. Sweep bonus: +${move.scoreBreakdown.sweepBonus}.</p>
    ${crossList}
    <button type="button" class="play-move-button" id="playMoveButton">Play Move</button>
  `;

  const playMoveButton = detailElement.querySelector("#playMoveButton");
  playMoveButton?.addEventListener("click", () => playSuggestedMove(index));
}

function setActiveMove(index) {
  if (!state.results[index]) {
    return;
  }

  state.activeResultIndex = index;

  resultListElement.querySelectorAll(".move-row").forEach((row) => {
    row.classList.toggle("active", Number(row.dataset.index) === index);
  });

  renderMoveDetail(index);
  renderBoard();
  persistAppState();
}

function renderMoveRows() {
  resultListElement.innerHTML = "";

  const topScore = state.results[0]?.score ?? 0;
  const visibleMoves = state.results.slice(0, state.visibleMoveCount);

  visibleMoves.forEach((move, index) => {
    const scorePercent = getScorePercent(move.score, topScore);
    const bonusBadge = getMoveBadge(move);

    const row = document.createElement("tr");
    row.className = "move-row";
    row.dataset.index = String(index);

    row.innerHTML = `
      <td>
        <div class="move-word-cell">
          <span>${move.word}</span>
          ${bonusBadge ? `<span class=\"move-badge\">${bonusBadge}</span>` : ""}
        </div>
      </td>
      <td class="points-cell">
        <span class="points-value">${move.score}</span>
        <div class="score-progress-wrap" title="${scorePercent}% of top score">
          <span class="score-progress"><span class="score-progress-fill" style="width:${scorePercent}%;"></span></span>
        </div>
      </td>
    `;

    row.addEventListener("click", () => setActiveMove(index));

    resultListElement.appendChild(row);
  });

  if (state.isLoadingMore) {
    const loadingRow = document.createElement("tr");
    loadingRow.className = "move-row";
    loadingRow.innerHTML = `<td colspan="2">Loading more moves...</td>`;
    resultListElement.appendChild(loadingRow);
  }
}

function renderResults(moves) {
  state.results = moves;

  if (!moves.length) {
    state.activeResultIndex = -1;
    state.visibleMoveCount = 0;
    state.hasMoreServerResults = false;
    resultMetaElement.textContent = "No legal moves found";
    analysisCopyElement.textContent = "No legal move was found for this rack on the current board.";
    keyTurnTitleElement.textContent = "No playable move";
    resultListElement.innerHTML = "";
    renderMoveDetail(-1);
    renderBoard();
    persistAppState();
    return;
  }

  const top = moves[0];
  keyTurnTitleElement.textContent = `Top move: ${top.word} for ${top.score}`;
  analysisCopyElement.textContent = `Exact top result: ${top.word} for ${top.score} points. Click any row to preview placement and score breakdown.`;

  if (!state.visibleMoveCount) {
    state.visibleMoveCount = Math.min(30, moves.length);
  } else {
    state.visibleMoveCount = Math.min(state.visibleMoveCount, moves.length);
  }

  resultMetaElement.textContent = `Showing ${state.visibleMoveCount} of ${moves.length} loaded moves`;

  renderMoveRows();

  if (state.activeResultIndex < 0 || state.activeResultIndex >= state.visibleMoveCount) {
    setActiveMove(0);
  } else {
    setActiveMove(state.activeResultIndex);
  }

  persistAppState();
}

function invalidateResults() {
  state.results = [];
  state.activeResultIndex = -1;
  state.visibleMoveCount = 0;
  state.requestedLimit = 0;
  state.hasMoreServerResults = false;
  state.isLoadingMore = false;
  state.lastSolvePayload = null;
  resultListElement.innerHTML = "";
  resultMetaElement.textContent = "";
  analysisCopyElement.textContent = "Press Find Best Moves to analyze your current position.";
  keyTurnTitleElement.textContent = "Run solver to analyze this position";
  detailElement.innerHTML = "<p>Board, rack, or dictionary changed. Run solver again to refresh analysis.</p>";
  persistAppState();
}

function applyTheme(theme) {
  const resolvedTheme = theme === "dark" ? "dark" : "light";
  document.body.dataset.theme = resolvedTheme;
  themeLightButton?.classList.toggle("active", resolvedTheme === "light");
  themeDarkButton?.classList.toggle("active", resolvedTheme === "dark");

  if (window.desktopShell?.setTheme) {
    window.desktopShell.setTheme(resolvedTheme).catch(() => {
      // Ignore shell sync issues and keep renderer theme applied.
    });
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
  } catch {
    // Ignore storage errors; theme still applies for this session.
  }

  persistAppState();
}

function initializeTheme() {
  let savedTheme = "light";

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      savedTheme = storedTheme;
    }
  } catch {
    savedTheme = "light";
  }

  applyTheme(savedTheme);

  themeLightButton?.addEventListener("click", () => applyTheme("light"));
  themeDarkButton?.addEventListener("click", () => applyTheme("dark"));
}

function updateUiScale() {
  const widthScale = window.innerWidth / 1680;
  const heightScale = window.innerHeight / 1020;
  const scale = Math.min(widthScale, heightScale, 1);
  const clampedScale = Math.max(0.6, scale);
  document.documentElement.style.setProperty("--ui-scale", clampedScale.toFixed(4));
  requestAnimationFrame(updateBoardSizing);
}

function updateBoardSizing() {
  if (!(boardWrapperElement instanceof HTMLElement)) {
    return;
  }

  const availableWidth = boardWrapperElement.clientWidth;
  const availableHeight = boardWrapperElement.clientHeight;

  if (availableWidth <= 0 || availableHeight <= 0) {
    return;
  }

  const boardSize = Math.max(180, Math.min(availableWidth, availableHeight));
  boardElement.style.width = `${Math.floor(boardSize)}px`;

  const tileSize = (boardSize - 6 - 42) / 15;
  boardElement.style.setProperty("--tile-bonus-font", `${Math.max(8, Math.round(tileSize * 0.29))}px`);
  boardElement.style.setProperty("--tile-main-font", `${Math.max(12, Math.round(tileSize * 0.5))}px`);
}

function initializeUiScale() {
  updateUiScale();
  window.addEventListener("resize", updateUiScale);
  window.addEventListener("resize", updateBoardSizing);
  requestAnimationFrame(updateBoardSizing);
}

function clearBoard() {
  pushUndoSnapshot();
  state.board = createEmptyBoard(state.boardSize);
  state.lastTypedCell = null;
  state.awaitingDirectionClick = false;
  invalidateResults();
  renderBoard();
  persistAppState();
}

function clearRack() {
  pushUndoSnapshot();
  for (let index = 0; index < state.rackSize; index += 1) {
    setRackValue(index, "");
  }

  invalidateResults();
  updateSolveButtonState();
  persistAppState();
}

function createSolvePayload(limit) {
  return {
    board: state.board,
    rack: getRackString(),
    sweepBonus: Number(sweepBonusInput.value),
    dictionaryId: state.selectedDictionaryId,
    limit
  };
}

async function loadMoreMovesIfNeeded() {
  if (state.isLoadingMore || !state.lastSolvePayload) {
    return;
  }

  if (state.visibleMoveCount < state.results.length) {
    state.visibleMoveCount = Math.min(state.visibleMoveCount + 30, state.results.length);
    resultMetaElement.textContent = `Showing ${state.visibleMoveCount} of ${state.results.length} loaded moves`;
    renderMoveRows();
    if (state.activeResultIndex >= 0) {
      setActiveMove(Math.min(state.activeResultIndex, state.visibleMoveCount - 1));
    }
    persistAppState();
    return;
  }

  if (!state.hasMoreServerResults) {
    return;
  }

  state.isLoadingMore = true;
  renderMoveRows();

  try {
    const nextLimit = state.requestedLimit + 30;
    const response = await solverBridge.solve({
      ...state.lastSolvePayload,
      limit: nextLimit
    });

    const nextMoves = response.moves ?? [];

    if (nextMoves.length <= state.results.length) {
      state.hasMoreServerResults = false;
      return;
    }

    state.results = nextMoves;
    state.requestedLimit = nextLimit;
    state.visibleMoveCount = Math.min(state.visibleMoveCount + 30, state.results.length);
    state.hasMoreServerResults = state.results.length >= state.requestedLimit;

    resultMetaElement.textContent = `Showing ${state.visibleMoveCount} of ${state.results.length} loaded moves`;
    renderMoveRows();
    if (state.activeResultIndex >= 0) {
      setActiveMove(Math.min(state.activeResultIndex, state.visibleMoveCount - 1));
    }
    persistAppState();
  } catch (error) {
    resultMetaElement.textContent = error instanceof Error ? error.message : "Unable to load more moves";
  } finally {
    state.isLoadingMore = false;
    renderMoveRows();
  }
}

function handleMovesScroll() {
  if (!(movesScrollElement instanceof HTMLElement)) {
    return;
  }

  const distanceToBottom =
    movesScrollElement.scrollHeight - movesScrollElement.scrollTop - movesScrollElement.clientHeight;

  if (distanceToBottom <= 120) {
    loadMoreMovesIfNeeded();
  }
}

async function solveCurrentState() {
  if (!getRackString().length) {
    resultMetaElement.textContent = "Enter rack letters first";
    return;
  }

  state.isSolving = true;
  updateSolveButtonState();

  try {
    state.requestedLimit = 30;
    state.visibleMoveCount = 0;
    state.activeResultIndex = -1;
    state.hasMoreServerResults = true;
    state.lastSolvePayload = createSolvePayload(state.requestedLimit);

    const response = await solverBridge.solve(state.lastSolvePayload);
    const moves = response.moves ?? [];

    state.hasMoreServerResults = moves.length >= state.requestedLimit;
    renderResults(moves);
  } catch (error) {
    resultMetaElement.textContent = error instanceof Error ? error.message : "Solve request failed";
  } finally {
    state.isSolving = false;
    updateSolveButtonState();
  }
}

function isBoardCellElement(element) {
  return element instanceof HTMLElement && element.classList.contains("board-cell");
}

function isNonBoardControlElement(element) {
  if (!(element instanceof HTMLElement) || isBoardCellElement(element)) {
    return false;
  }

  return Boolean(element.closest("input, textarea, select, button, a, [role='button'], [contenteditable='true']"));
}

function handlePointerDownForBoardContext(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  state.boardInputActive = Boolean(target.closest(".board-cell"));
}

function clearSelectedBoardCell() {
  if (!state.selected) {
    return false;
  }

  const { row, col } = state.selected;
  const cell = boardCell(row, col);
  if (!cell.letter) {
    return false;
  }

  pushUndoSnapshot();
  setBoardLetter(row, col, "");
  state.lastTypedCell = null;
  state.awaitingDirectionClick = false;
  renderBoard();

  return true;
}

function handleBoardKeyboard(event) {
  const isPrimaryModifier = event.ctrlKey || event.metaKey;
  const normalizedKey = event.key.toUpperCase();
  const activeElement = document.activeElement;

  if (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement?.isContentEditable ||
    isNonBoardControlElement(activeElement)
  ) {
    return;
  }

  const boardHotkeysEnabled = state.boardInputActive;

  if (isPrimaryModifier && !event.altKey) {
    if (!boardHotkeysEnabled) {
      return;
    }

    if (normalizedKey === "Z" && event.shiftKey) {
      event.preventDefault();
      redo();
      return;
    }

    if (normalizedKey === "Z") {
      event.preventDefault();
      undo();
      return;
    }

    if (normalizedKey === "Y") {
      event.preventDefault();
      redo();
      return;
    }
  }

  const key = normalizedKey;

  if (key === "BACKSPACE") {
    if (!boardHotkeysEnabled) {
      return;
    }
    event.preventDefault();
    if (!clearSelectedBoardCell()) {
      undo();
    }
    return;
  }

  if (key === "DELETE") {
    if (boardHotkeysEnabled && clearSelectedBoardCell()) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    undo();
    return;
  }

  if (!boardHotkeysEnabled || !state.selected) {
    return;
  }

  if (/^[A-Z]$/.test(key)) {
    pushUndoSnapshot();
    const typedRow = state.selected.row;
    const typedCol = state.selected.col;
    setBoardLetter(typedRow, typedCol, key);
    state.lastTypedCell = { row: typedRow, col: typedCol };
    state.awaitingDirectionClick = true;
    renderBoard();
    advanceSelectionToNextEmpty(typedRow, typedCol, state.inputDirection);
    event.preventDefault();
    return;
  }

  if (key === "?" || key === "*") {
    toggleBoardBlank(state.selected.row, state.selected.col);
    event.preventDefault();
    return;
  }

  if (key === "ARROWUP") {
    moveSelection(-1, 0);
    event.preventDefault();
  } else if (key === "ARROWDOWN") {
    moveSelection(1, 0);
    event.preventDefault();
  } else if (key === "ARROWLEFT") {
    moveSelection(0, -1);
    event.preventDefault();
  } else if (key === "ARROWRIGHT") {
    moveSelection(0, 1);
    event.preventDefault();
  }
}

async function initialize() {
  try {
    initializeTheme();

    const status = await solverBridge.health();
    state.boardSize = status.boardSize;
    state.rackSize = status.rackSize;
    state.boardBonuses = status.boardBonuses;
    state.tileScores = status.tileScores;
    state.dictionaryOptions = Array.isArray(status.dictionaries)
      ? status.dictionaries.map(normalizeDictionaryOption).filter(Boolean)
      : [];
    if (state.dictionaryOptions.length === 0) {
      const fallbackDictionaryOption = normalizeDictionaryOption({
        id: status.dictionaryId ?? "enable2k",
        name: status.dictionaryName ?? "ENABLE2K",
        words: status.dictionaryWords ?? 0,
        isCustom: false
      });
      if (fallbackDictionaryOption) {
        state.dictionaryOptions = [fallbackDictionaryOption];
      }
    }

    const defaultDictionaryId =
      typeof status.dictionaryId === "string" && getDictionaryById(status.dictionaryId)
        ? status.dictionaryId
        : state.dictionaryOptions[0]?.id ?? "";
    state.selectedDictionaryId = defaultDictionaryId;
    renderDictionarySelector();

    if (analysisInstructionsElement instanceof HTMLElement) {
      analysisInstructionsElement.textContent =
        "Instructions: scroll the move list to load more results in 30-move batches. Click a move row to preview placement. Use Dictionary selector to switch lexicons or load a custom .txt.";
    }
    sweepBonusInput.value = String(status.defaultSweepBonus);

    state.board = createEmptyBoard(state.boardSize);

    initializeBoardUI();
    initializeRackUI();
    updateUndoRedoButtons();
    await restorePersistedAppState();
    renderDictionarySelector();

    if (!state.selected) {
      const center = Math.floor(state.boardSize / 2);
      selectCell(center, center, { fromUser: false });
      renderBoard();
    }

    ensureSavedGamesInitialized();
    syncActiveGameSnapshotFromLiveState();
    renderSavedGameControls();

    solveButton.addEventListener("click", solveCurrentState);
    clearBoardButton.addEventListener("click", clearBoard);
    clearRackButton.addEventListener("click", clearRack);
    undoButton?.addEventListener("click", undo);
    redoButton?.addEventListener("click", redo);
    savedGameSelectElement?.addEventListener("change", () => {
      if (savedGameSelectElement instanceof HTMLSelectElement) {
        switchSavedGame(savedGameSelectElement.value);
      }
    });
    addGameButton?.addEventListener("click", addSavedGame);
    renameGameButton?.addEventListener("click", renameSavedGame);
    deleteGameButton?.addEventListener("click", deleteSavedGame);
    dictionarySelectElement?.addEventListener("change", () => {
      if (!(dictionarySelectElement instanceof HTMLSelectElement)) {
        return;
      }

      const changed = setDictionarySelection(dictionarySelectElement.value);
      if (changed) {
        renderDictionarySelector();
      }
    });
    dictionaryUploadButton?.addEventListener("click", () => {
      dictionaryFileInput?.click();
    });
    dictionaryFileInput?.addEventListener("change", async () => {
      try {
        const file = dictionaryFileInput?.files?.[0];
        if (!file) {
          return;
        }

        await uploadCustomDictionaryFromFile(file);
      } catch (error) {
        resultMetaElement.textContent = error instanceof Error ? error.message : "Failed to load dictionary";
      } finally {
        if (dictionaryFileInput instanceof HTMLInputElement) {
          dictionaryFileInput.value = "";
        }
      }
    });
    movesScrollElement?.addEventListener("scroll", handleMovesScroll);
    sweepBonusInput.addEventListener("focus", () => {
      sweepBonusInput.dataset.previousValue = sweepBonusInput.value;
    });
    sweepBonusInput.addEventListener("change", () => {
      const previous = Number(sweepBonusInput.dataset.previousValue ?? sweepBonusInput.defaultValue ?? 40);
      const current = Number(sweepBonusInput.value);
      const normalized = Number.isFinite(current) && current >= 0 ? Math.floor(current) : 0;
      if (current !== normalized) {
        sweepBonusInput.value = String(normalized);
      }
      if (normalized !== previous) {
        pushUndoSnapshot();
      }
      invalidateResults();
      persistAppState();
    });

    document.addEventListener("pointerdown", handlePointerDownForBoardContext);
    document.addEventListener("keydown", handleBoardKeyboard);
    window.addEventListener("beforeunload", () => {
      persistAppState({ sync: true });
    });
    window.addEventListener("pagehide", () => {
      persistAppState({ sync: true });
    });
    initializeUiScale();
  } catch (error) {
    resultMetaElement.textContent = error instanceof Error ? error.message : "Failed to initialize app";
  }
}

initialize();
