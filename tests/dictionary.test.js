import test from "node:test";
import assert from "node:assert/strict";
import { createTrieFromWords, parseDictionaryText } from "../src/solver/dictionary.js";

test("parseDictionaryText extracts leading alphabetic words and deduplicates", () => {
  const sample = [
    "AA rough, cindery lava [n AAS]",
    "AB a muscle",
    "AB duplicate",
    "bad lowercase line",
    "ZZZZ label"
  ].join("\n");

  const words = parseDictionaryText(sample, 4);

  assert.deepEqual(words, ["AA", "AB", "BAD", "ZZZZ"]);
});

test("createTrieFromWords stores expected word paths", () => {
  const trie = createTrieFromWords(["CAT", "CAR"]);

  const cNode = trie.children.get("C");
  assert.ok(cNode);
  assert.ok(cNode.children.get("A"));
  assert.ok(cNode.children.get("A").children.get("T")?.isWord);
  assert.ok(cNode.children.get("A").children.get("R")?.isWord);
});
