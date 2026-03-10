import { ALL_LETTERS, CROSSPLAY_RULES, getBonusMultipliers } from "../rules/crossplayRules.js";
import {
  canUseLetter,
  cloneCounts,
  consumeLetter,
  isAnchor,
  isBoardEmpty,
  isFilled,
  normalizeBoard,
  normalizeRack,
  rackToCounts,
  restoreLetter,
  transposeBoard
} from "./board.js";
import { getChildEntriesSorted } from "./dictionary.js";

const ALL_LETTERS_ARRAY = [...ALL_LETTERS];
const ALL_LETTERS_SET = new Set(ALL_LETTERS_ARRAY);

function inBounds(size, row, col) {
  return row >= 0 && row < size && col >= 0 && col < size;
}

function buildCrossChecks(board, wordSet) {
  const crossChecks = Array.from({ length: board.size }, () => Array(board.size).fill(null));

  for (let row = 0; row < board.size; row += 1) {
    for (let col = 0; col < board.size; col += 1) {
      if (isFilled(board, row, col)) {
        continue;
      }

      let prefix = "";
      let suffix = "";

      for (let r = row - 1; r >= 0 && isFilled(board, r, col); r -= 1) {
        prefix = board.letters[r][col] + prefix;
      }

      for (let r = row + 1; r < board.size && isFilled(board, r, col); r += 1) {
        suffix += board.letters[r][col];
      }

      if (!prefix && !suffix) {
        crossChecks[row][col] = ALL_LETTERS_SET;
        continue;
      }

      const allowed = new Set();
      for (const letter of ALL_LETTERS_ARRAY) {
        if (wordSet.has(`${prefix}${letter}${suffix}`)) {
          allowed.add(letter);
        }
      }
      crossChecks[row][col] = allowed;
    }
  }

  return crossChecks;
}

function getStartCandidates(board, row, anchorCol) {
  if (anchorCol > 0 && isFilled(board, row, anchorCol - 1)) {
    let start = anchorCol - 1;
    while (start > 0 && isFilled(board, row, start - 1)) {
      start -= 1;
    }
    return [start];
  }

  let leftMost = anchorCol;
  while (leftMost > 0 && !isFilled(board, row, leftMost - 1)) {
    leftMost -= 1;
  }

  const starts = [];
  for (let start = leftMost; start <= anchorCol; start += 1) {
    starts.push(start);
  }
  return starts;
}

function mapMoveToOriginal(move, direction) {
  if (direction === "H") {
    return move;
  }

  return {
    ...move,
    row: move.col,
    col: move.row,
    direction: "V",
    placements: move.placements.map((placement) => ({
      row: placement.col,
      col: placement.row,
      letter: placement.letter,
      isBlank: placement.isBlank
    }))
  };
}

function placementsKey(placements) {
  return placements
    .slice()
    .sort((a, b) => (a.row !== b.row ? a.row - b.row : a.col - b.col))
    .map((placement) => `${placement.row},${placement.col},${placement.letter}`)
    .join(";");
}

function collectDirectionalMoves({ board, direction, trieRoot, wordSet, rackCountsTemplate }) {
  const boardEmpty = isBoardEmpty(board);
  const crossChecks = buildCrossChecks(board, wordSet);
  const directionalMoves = [];

  for (let row = 0; row < board.size; row += 1) {
    for (let anchorCol = 0; anchorCol < board.size; anchorCol += 1) {
      if (!isAnchor(board, row, anchorCol, boardEmpty)) {
        continue;
      }

      const starts = getStartCandidates(board, row, anchorCol);

      for (const startCol of starts) {
        const rackCounts = cloneCounts(rackCountsTemplate);
        const placements = [];

        const dfs = (col, node, word, usedTiles) => {
          if (col >= board.size) {
            if (node.isWord && usedTiles > 0 && col > anchorCol) {
              directionalMoves.push({
                row,
                col: startCol,
                direction,
                word,
                placements: placements.slice()
              });
            }
            return;
          }

          if (isFilled(board, row, col)) {
            const letter = board.letters[row][col];
            const child = node.children.get(letter);
            if (!child) {
              return;
            }

            dfs(col + 1, child, `${word}${letter}`, usedTiles);
            return;
          }

          if (node.isWord && usedTiles > 0 && col > anchorCol) {
            directionalMoves.push({
              row,
              col: startCol,
              direction,
              word,
              placements: placements.slice()
            });
          }

          const allowed = crossChecks[row][col] ?? ALL_LETTERS_SET;

          for (const [letter, child] of getChildEntriesSorted(node)) {
            if (!allowed.has(letter)) {
              continue;
            }

            if (!canUseLetter(rackCounts, letter)) {
              continue;
            }

            const usage = consumeLetter(rackCounts, letter);
            if (!usage) {
              continue;
            }

            placements.push({ row, col, letter, isBlank: usage.usedBlank });
            dfs(col + 1, child, `${word}${letter}`, usedTiles + 1);
            placements.pop();
            restoreLetter(rackCounts, usage);
          }
        };

        dfs(startCol, trieRoot, "", 0);
      }
    }
  }

  return directionalMoves;
}

function letterScore(rules, letter, isBlankTile) {
  if (isBlankTile) {
    return 0;
  }
  return rules.tileScores[letter] ?? 0;
}

function scoreMove(board, move, rules, sweepBonus) {
  const placementMap = new Map();
  for (const placement of move.placements) {
    placementMap.set(`${placement.row},${placement.col}`, placement);
  }

  const dr = move.direction === "H" ? 0 : 1;
  const dc = move.direction === "H" ? 1 : 0;

  let mainLetterSum = 0;
  let mainWordMultiplier = 1;

  for (let index = 0; index < move.word.length; index += 1) {
    const row = move.row + dr * index;
    const col = move.col + dc * index;
    const placement = placementMap.get(`${row},${col}`);

    if (placement) {
      const bonusCode = rules.boardBonuses[row][col];
      const multipliers = getBonusMultipliers(bonusCode);
      const base = letterScore(rules, placement.letter, placement.isBlank);
      mainLetterSum += base * multipliers.letter;
      mainWordMultiplier *= multipliers.word;
    } else {
      const letter = board.letters[row][col];
      mainLetterSum += letterScore(rules, letter, board.blanks[row][col]);
    }
  }

  const mainWordScore = mainLetterSum * mainWordMultiplier;
  const crossWords = [];
  const crossDirection = move.direction === "H" ? "V" : "H";
  const crossDr = move.direction === "H" ? 1 : 0;
  const crossDc = move.direction === "H" ? 0 : 1;

  const getLetterAt = (row, col) => {
    const placement = placementMap.get(`${row},${col}`);
    if (placement) {
      return placement.letter;
    }
    return board.letters[row][col];
  };

  const isOccupiedAt = (row, col) => {
    if (!inBounds(board.size, row, col)) {
      return false;
    }

    if (placementMap.has(`${row},${col}`)) {
      return true;
    }

    return board.letters[row][col] !== "";
  };

  let crossScoreTotal = 0;

  for (const placement of move.placements) {
    let row = placement.row;
    let col = placement.col;

    while (isOccupiedAt(row - crossDr, col - crossDc)) {
      row -= crossDr;
      col -= crossDc;
    }

    const startRow = row;
    const startCol = col;
    let word = "";
    let letterSum = 0;
    let wordMultiplier = 1;

    while (isOccupiedAt(row, col)) {
      const isCenter = row === placement.row && col === placement.col;
      const letter = getLetterAt(row, col);
      word += letter;

      if (isCenter) {
        const bonusCode = rules.boardBonuses[row][col];
        const multipliers = getBonusMultipliers(bonusCode);
        const base = letterScore(rules, letter, placement.isBlank);
        letterSum += base * multipliers.letter;
        wordMultiplier *= multipliers.word;
      } else {
        letterSum += letterScore(rules, letter, board.blanks[row][col]);
      }

      row += crossDr;
      col += crossDc;
    }

    if (word.length > 1) {
      const score = letterSum * wordMultiplier;
      crossScoreTotal += score;
      crossWords.push({
        word,
        row: startRow,
        col: startCol,
        direction: crossDirection,
        score
      });
    }
  }

  const sweep = move.placements.length === rules.rackSize ? sweepBonus : 0;
  const total = mainWordScore + crossScoreTotal + sweep;

  return {
    ...move,
    score: total,
    scoreBreakdown: {
      mainWord: {
        word: move.word,
        score: mainWordScore
      },
      crossWords,
      sweepBonus: sweep,
      total
    }
  };
}

function compareMoves(a, b) {
  if (a.score !== b.score) {
    return b.score - a.score;
  }

  if (a.row !== b.row) {
    return a.row - b.row;
  }

  if (a.col !== b.col) {
    return a.col - b.col;
  }

  if (a.direction !== b.direction) {
    return a.direction < b.direction ? -1 : 1;
  }

  if (a.word !== b.word) {
    return a.word < b.word ? -1 : 1;
  }

  const placementsA = placementsKey(a.placements);
  const placementsB = placementsKey(b.placements);
  return placementsA < placementsB ? -1 : placementsA > placementsB ? 1 : 0;
}

export function solveTopMoves({
  board,
  rack,
  rules = CROSSPLAY_RULES,
  limit = 15,
  sweepBonus = rules.defaultSweepBonus,
  trie,
  wordSet
}) {
  if (!trie || !wordSet) {
    throw new Error("solveTopMoves requires trie and wordSet.");
  }

  const normalizedBoard = normalizeBoard(board, rules.boardSize);
  const normalizedRack = normalizeRack(rack, rules.rackSize);

  if (!normalizedRack.length) {
    return [];
  }

  const rackCountsTemplate = rackToCounts(normalizedRack);

  const horizontalRaw = collectDirectionalMoves({
    board: normalizedBoard,
    direction: "H",
    trieRoot: trie,
    wordSet,
    rackCountsTemplate
  });

  const verticalRawTransposed = collectDirectionalMoves({
    board: transposeBoard(normalizedBoard),
    direction: "H",
    trieRoot: trie,
    wordSet,
    rackCountsTemplate
  });

  const rawMoves = [
    ...horizontalRaw,
    ...verticalRawTransposed.map((move) => mapMoveToOriginal(move, "V"))
  ];

  const scoredBestByMove = new Map();

  for (const rawMove of rawMoves) {
    const scored = scoreMove(normalizedBoard, rawMove, rules, sweepBonus);
    const key = `${scored.direction}|${scored.row}|${scored.col}|${scored.word}|${placementsKey(scored.placements)}`;
    const existing = scoredBestByMove.get(key);

    if (!existing || compareMoves(scored, existing) < 0) {
      scoredBestByMove.set(key, scored);
    }
  }

  const ranked = [...scoredBestByMove.values()].sort(compareMoves);
  return ranked.slice(0, Math.max(1, limit));
}

export function scoreMoveForTesting({ board, move, rules = CROSSPLAY_RULES, sweepBonus = rules.defaultSweepBonus }) {
  const normalizedBoard = normalizeBoard(board, rules.boardSize);
  return scoreMove(normalizedBoard, move, rules, sweepBonus);
}
