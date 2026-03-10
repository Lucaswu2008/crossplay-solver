import { CROSSPLAY_RULES } from "../rules/crossplayRules.js";
import { loadDictionaryFromFile, loadDictionaryFromText, resolveDefaultDictionaryPath } from "./dictionary.js";
import { solveTopMoves } from "./solver.js";

function normalizeDictionaryName(name, fallback) {
  if (typeof name !== "string") {
    return fallback;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 80) : fallback;
}

function toDictionaryMeta(dictionary) {
  return {
    id: dictionary.id,
    name: dictionary.name,
    words: dictionary.count,
    isCustom: Boolean(dictionary.isCustom)
  };
}

export async function createSolverService(options = {}) {
  const rules = options.rules ?? CROSSPLAY_RULES;
  const dictionaryPath =
    options.dictionaryPath ??
    (await resolveDefaultDictionaryPath({
      appPath: options.appPath,
      resourcesPath: options.resourcesPath
    }));

  const defaultDictionaryData = await loadDictionaryFromFile(dictionaryPath, rules.boardSize);
  const dictionaries = new Map();
  const defaultDictionary = {
    id: "enable2k",
    name: "ENABLE2K",
    isCustom: false,
    ...defaultDictionaryData
  };
  dictionaries.set(defaultDictionary.id, defaultDictionary);

  let activeDictionaryId = defaultDictionary.id;

  const listDictionaryMeta = () =>
    [...dictionaries.values()].map(toDictionaryMeta).sort((a, b) => {
      if (a.isCustom !== b.isCustom) {
        return a.isCustom ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });

  const resolveDictionary = (dictionaryId) => {
    const normalizedId = typeof dictionaryId === "string" ? dictionaryId.trim() : "";

    if (normalizedId) {
      const selected = dictionaries.get(normalizedId);
      if (!selected) {
        throw new Error(`Dictionary "${normalizedId}" is not available.`);
      }
      return selected;
    }

    return dictionaries.get(activeDictionaryId) ?? defaultDictionary;
  };

  const getStatus = () => {
    const activeDictionary = resolveDictionary(activeDictionaryId);
    return {
      ready: true,
      dictionaryPath: activeDictionary.path,
      dictionaryWords: activeDictionary.count,
      dictionaryId: activeDictionary.id,
      dictionaryName: activeDictionary.name,
      dictionaries: listDictionaryMeta(),
      boardSize: rules.boardSize,
      rackSize: rules.rackSize,
      defaultSweepBonus: rules.defaultSweepBonus,
      boardBonuses: rules.boardBonuses,
      tileScores: rules.tileScores
    };
  };

  const solve = ({ board, rack, sweepBonus, limit, dictionaryId }) => {
    const resolvedSweepBonus = Number.isFinite(Number(sweepBonus))
      ? Number(sweepBonus)
      : rules.defaultSweepBonus;

    const resolvedLimit = Number.isFinite(Number(limit)) ? Number(limit) : 15;
    const resolvedDictionary = resolveDictionary(dictionaryId);
    activeDictionaryId = resolvedDictionary.id;

    const moves = solveTopMoves({
      board,
      rack,
      rules,
      limit: Math.max(1, Math.min(100, resolvedLimit)),
      sweepBonus: resolvedSweepBonus,
      trie: resolvedDictionary.trie,
      wordSet: resolvedDictionary.wordSet
    });

    return {
      moves,
      meta: {
        requestedLimit: resolvedLimit,
        returnedMoves: moves.length,
        sweepBonus: resolvedSweepBonus,
        dictionaryId: resolvedDictionary.id,
        dictionaryName: resolvedDictionary.name,
        dictionaryWords: resolvedDictionary.count
      }
    };
  };

  const addCustomDictionary = ({ name, text }) => {
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error("Custom dictionary text is empty.");
    }

    const customDictionaryData = loadDictionaryFromText(text, rules.boardSize, "[custom-upload]");
    if (!customDictionaryData.count) {
      throw new Error("Custom dictionary has no valid words (A-Z only).");
    }

    const defaultCustomName = `Custom ${[...dictionaries.values()].filter((entry) => entry.isCustom).length + 1}`;
    const customDictionary = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: normalizeDictionaryName(name, defaultCustomName),
      isCustom: true,
      ...customDictionaryData
    };

    dictionaries.set(customDictionary.id, customDictionary);
    activeDictionaryId = customDictionary.id;

    return {
      dictionary: toDictionaryMeta(customDictionary),
      activeDictionaryId,
      dictionaries: listDictionaryMeta()
    };
  };

  return {
    rules,
    solve,
    getStatus,
    addCustomDictionary
  };
}
