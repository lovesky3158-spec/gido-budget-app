export type CategoryMemoryMap = Record<string, string>;

const STORAGE_KEY = "asset_couple_category_memory";

function normalizeMerchantKey(text: string) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\(주\)/g, "")
    .replace(/\s+/g, "")
    .trim();
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
  return memory[key] ?? "";
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