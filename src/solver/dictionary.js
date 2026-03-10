import fs from "node:fs/promises";
import path from "node:path";

class TrieNode {
  constructor() {
    this.children = new Map();
    this.isWord = false;
  }
}

export function createTrieFromWords(words) {
  const root = new TrieNode();

  for (const word of words) {
    let node = root;
    for (const letter of word) {
      let child = node.children.get(letter);
      if (!child) {
        child = new TrieNode();
        node.children.set(letter, child);
      }
      node = child;
    }
    node.isWord = true;
  }

  return root;
}

export function parseDictionaryText(text, maxWordLength = 15) {
  const words = new Set();
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const match = line.trim().match(/^([A-Za-z]+)/);
    if (!match) {
      continue;
    }

    const word = match[1].toUpperCase();
    if (word.length > 0 && word.length <= maxWordLength) {
      words.add(word);
    }
  }

  return [...words].sort();
}

export function loadDictionaryFromText(text, maxWordLength = 15, sourcePath = "[memory]") {
  const words = parseDictionaryText(text, maxWordLength);
  const wordSet = new Set(words);
  const trie = createTrieFromWords(words);

  return {
    words,
    wordSet,
    trie,
    count: words.length,
    path: sourcePath
  };
}

export async function loadDictionaryFromFile(filePath, maxWordLength = 15) {
  const content = await fs.readFile(filePath, "utf8");
  return loadDictionaryFromText(content, maxWordLength, filePath);
}

export async function resolveDefaultDictionaryPath({ appPath, resourcesPath } = {}) {
  const candidates = [];
  const defaultNames = ["ENABLE2K.txt", "enable2k.txt", "WORD.LST", "word.lst"];

  if (process.env.CROSSPLAY_DICT_PATH) {
    candidates.push(process.env.CROSSPLAY_DICT_PATH);
  }

  for (const name of defaultNames) {
    candidates.push(path.resolve(process.cwd(), name));
  }

  if (appPath) {
    for (const name of defaultNames) {
      candidates.push(path.resolve(appPath, name));
    }
  }

  if (resourcesPath) {
    for (const name of defaultNames) {
      candidates.push(path.resolve(resourcesPath, "dictionary", name));
    }
  }

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }

  throw new Error("Could not find ENABLE2K.txt. Place it in the project root or set CROSSPLAY_DICT_PATH.");
}

export function followTrie(node, letters) {
  let current = node;
  for (const letter of letters) {
    current = current.children.get(letter);
    if (!current) {
      return null;
    }
  }
  return current;
}

export function getChildEntriesSorted(node) {
  return [...node.children.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
