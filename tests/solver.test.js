import test from "node:test";
import assert from "node:assert/strict";
import { CROSSPLAY_RULES } from "../src/rules/crossplayRules.js";
import { createTrieFromWords } from "../src/solver/dictionary.js";
import { scoreMoveForTesting, solveTopMoves } from "../src/solver/solver.js";

function emptyBoard(size = CROSSPLAY_RULES.boardSize) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({
      letter: "",
      isBlankTile: false
    }))
  );
}

function moveCoversCell(move, row, col) {
  const dr = move.direction === "H" ? 0 : 1;
  const dc = move.direction === "H" ? 1 : 0;

  for (let i = 0; i < move.word.length; i += 1) {
    const r = move.row + dr * i;
    const c = move.col + dc * i;
    if (r === row && c === col) {
      return true;
    }
  }

  return false;
}

test("all first-move candidates cover center square", () => {
  const words = ["CAT", "CATS", "AT", "SAT"];
  const trie = createTrieFromWords(words);
  const wordSet = new Set(words);
  const board = emptyBoard();

  const moves = solveTopMoves({
    board,
    rack: "CATS",
    trie,
    wordSet,
    rules: CROSSPLAY_RULES,
    limit: 50
  });

  assert.ok(moves.length > 0);
  for (const move of moves) {
    assert.equal(moveCoversCell(move, 7, 7), true);
  }
});

test("blank tiles score zero", () => {
  const board = emptyBoard();

  const scoredBlank = scoreMoveForTesting({
    board,
    move: {
      row: 7,
      col: 7,
      direction: "H",
      word: "A",
      placements: [{ row: 7, col: 7, letter: "A", isBlank: true }]
    }
  });

  const scoredRegular = scoreMoveForTesting({
    board,
    move: {
      row: 7,
      col: 7,
      direction: "H",
      word: "A",
      placements: [{ row: 7, col: 7, letter: "A", isBlank: false }]
    }
  });

  assert.equal(scoredBlank.score, 0);
  assert.equal(scoredRegular.score, 1);
});

test("cross-check rejects invalid perpendicular words", () => {
  const words = ["E", "AET"];
  const trie = createTrieFromWords(words);
  const wordSet = new Set(words);
  const board = emptyBoard();

  board[6][7] = { letter: "A", isBlankTile: false };
  board[8][7] = { letter: "T", isBlankTile: false };

  const moves = solveTopMoves({
    board,
    rack: "EF",
    trie,
    wordSet,
    rules: CROSSPLAY_RULES,
    limit: 20
  });

  assert.ok(moves.length > 0);
  for (const move of moves) {
    for (const placement of move.placements) {
      if (placement.row === 7 && placement.col === 7) {
        assert.equal(placement.letter, "E");
      }
    }
  }
});

test("solver returns max 15 ranked moves", () => {
  const words = [
    "A",
    "E",
    "I",
    "O",
    "U",
    "QI",
    "QUIZ",
    "CAT",
    "TACO",
    "COAT",
    "ZOA",
    "ZA",
    "TA",
    "AT",
    "TO",
    "IT",
    "QI",
    "QAID",
    "QUIT"
  ];
  const trie = createTrieFromWords(words);
  const wordSet = new Set(words);

  const moves = solveTopMoves({
    board: emptyBoard(),
    rack: "QUIZCAT",
    trie,
    wordSet,
    rules: CROSSPLAY_RULES,
    limit: 15
  });

  assert.equal(moves.length, 15);
  assert.equal(moves[0].word, "QUIZ");

  for (let i = 1; i < moves.length; i += 1) {
    assert.ok(moves[i - 1].score >= moves[i].score);
  }
});
