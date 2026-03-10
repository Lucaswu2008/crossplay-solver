import { ALL_LETTERS } from "../rules/crossplayRules.js";

export function createEmptyBoard(size) {
  const letters = Array.from({ length: size }, () => Array(size).fill(""));
  const blanks = Array.from({ length: size }, () => Array(size).fill(false));
  return { size, letters, blanks };
}

export function normalizeBoard(inputBoard, size) {
  const board = createEmptyBoard(size);

  for (let row = 0; row < size; row += 1) {
    const inputRow = Array.isArray(inputBoard?.[row]) ? inputBoard[row] : [];

    for (let col = 0; col < size; col += 1) {
      const cell = inputRow[col];
      const rawLetter = typeof cell?.letter === "string" ? cell.letter : "";
      const letter = rawLetter.trim().toUpperCase();

      if (/^[A-Z]$/.test(letter)) {
        board.letters[row][col] = letter;
        board.blanks[row][col] = Boolean(cell?.isBlankTile);
      }
    }
  }

  return board;
}

export function boardToCells(board) {
  return board.letters.map((row, rowIndex) =>
    row.map((letter, colIndex) => ({
      letter,
      isBlankTile: letter ? board.blanks[rowIndex][colIndex] : false
    }))
  );
}

export function transposeBoard(board) {
  const transposed = createEmptyBoard(board.size);

  for (let row = 0; row < board.size; row += 1) {
    for (let col = 0; col < board.size; col += 1) {
      transposed.letters[col][row] = board.letters[row][col];
      transposed.blanks[col][row] = board.blanks[row][col];
    }
  }

  return transposed;
}

export function isFilled(board, row, col) {
  return board.letters[row][col] !== "";
}

export function isBoardEmpty(board) {
  for (let row = 0; row < board.size; row += 1) {
    for (let col = 0; col < board.size; col += 1) {
      if (board.letters[row][col]) {
        return false;
      }
    }
  }
  return true;
}

export function hasNeighborFilled(board, row, col) {
  const deltas = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ];

  for (const [dr, dc] of deltas) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < board.size && nc >= 0 && nc < board.size && isFilled(board, nr, nc)) {
      return true;
    }
  }

  return false;
}

export function isAnchor(board, row, col, boardEmpty) {
  if (isFilled(board, row, col)) {
    return false;
  }

  if (boardEmpty) {
    const center = Math.floor(board.size / 2);
    return row === center && col === center;
  }

  return hasNeighborFilled(board, row, col);
}

export function normalizeRack(rack, rackSize) {
  const cleaned = (typeof rack === "string" ? rack : "")
    .toUpperCase()
    .replace(/[^A-Z?]/g, "")
    .slice(0, rackSize);

  return cleaned;
}

export function rackToCounts(rack) {
  const counts = Object.create(null);

  for (const letter of ALL_LETTERS) {
    counts[letter] = 0;
  }
  counts["?"] = 0;

  for (const char of rack) {
    counts[char] = (counts[char] ?? 0) + 1;
  }

  return counts;
}

export function cloneCounts(counts) {
  return { ...counts };
}

export function canUseLetter(counts, letter) {
  return (counts[letter] ?? 0) > 0 || (counts["?"] ?? 0) > 0;
}

export function consumeLetter(counts, letter) {
  if ((counts[letter] ?? 0) > 0) {
    counts[letter] -= 1;
    return { letter, usedBlank: false };
  }

  if ((counts["?"] ?? 0) > 0) {
    counts["?"] -= 1;
    return { letter, usedBlank: true };
  }

  return null;
}

export function restoreLetter(counts, usage) {
  if (!usage) {
    return;
  }

  if (usage.usedBlank) {
    counts["?"] += 1;
  } else {
    counts[usage.letter] += 1;
  }
}
