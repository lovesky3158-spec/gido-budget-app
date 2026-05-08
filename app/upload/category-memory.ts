export type CategoryMemoryMap = Record<string, string>;

const STORAGE_KEY = "asset_couple_category_memory";

function normalizeMerchantKey(text: string) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\(주\)/g, "")
    .replace(/주식회사/g, "")
    .replace(/[0-9]{2,}/g, "")
    .replace(/[₩원,]/g, "")
    .replace(/[()\[\]{}<>]/g, "")
    .replace(/[·|_\-/:*#.,]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function scoreMerchantMatch(sourceKey: string, memoryKey: string) {
  if (!sourceKey || !memoryKey) return 0;
  if (sourceKey === memoryKey) return 1000;

  const shorter = sourceKey.length < memoryKey.length ? sourceKey : memoryKey;
  const longer = sourceKey.length >= memoryKey.length ? sourceKey : memoryKey;

  // 너무 짧은 키워드까지 유사매칭하면 오분류가 심해져서 4글자 이상만 허용
  if (shorter.length >= 4 && longer.includes(shorter)) {
    return 700 + shorter.length;
  }

  // 앞부분이 거의 같으면 지점명/승인번호만 다른 같은 가맹점으로 판단
  const maxPrefix = Math.min(sourceKey.length, memoryKey.length, 12);
  let prefix = 0;
  for (let i = 0; i < maxPrefix; i += 1) {
    if (sourceKey[i] !== memoryKey[i]) break;
    prefix += 1;
  }

  if (prefix >= 5) return 500 + prefix;

  return 0;
}

export function getMerchantKey(description: string) {
  return normalizeMerchantKey(description);
}

export function loadCategoryMemory(): CategoryMemoryMap {
  if (typeof window === "undefined") return {};

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as CategoryMemoryMap;
  } catch {
    return {};
  }
}

export function saveCategoryMemory(memory: CategoryMemoryMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
}

export function setCategoryMemory(description: string, category: string) {
  if (!description || !category) return;

  const memory = loadCategoryMemory();
  const key = getMerchantKey(description);
  if (!key) return;

  memory[key] = category;
  saveCategoryMemory(memory);
}

export function getRememberedCategory(description: string) {
  const memory = loadCategoryMemory();
  const key = getMerchantKey(description);

  if (!key) return "";
  if (memory[key]) return memory[key];

  let bestCategory = "";
  let bestScore = 0;

  for (const [memoryKey, category] of Object.entries(memory)) {
    const score = scoreMerchantMatch(key, memoryKey);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  // 500 이상부터만 유사결제건으로 인정
  return bestScore >= 500 ? bestCategory : "";
}

export function removeCategoryMemory(description: string) {
  const memory = loadCategoryMemory();
  const key = getMerchantKey(description);
  if (!key) return;

  delete memory[key];
  saveCategoryMemory(memory);
}

export function clearCategoryMemory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
