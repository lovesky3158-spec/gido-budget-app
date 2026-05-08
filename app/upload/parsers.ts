// app/upload/parsers.ts
export type ParserPreset = "kbcard" | "shinhan" | "nhcard" | "generic";
import CATEGORY_RULES from "./category-rules";
import { getRememberedCategory } from "./category-memory";

type MappingKey =
  | "date"
  | "description"
  | "amount"
  | "type"
  | "cardName"
  | "balance";

type MappingState = Record<MappingKey, string>;

type ExcelDraftRow = {
  id: string;
  tx_date: string;
  description: string;
  category: string;
  amount: number | null;
  cardName: string;
  selected: boolean;
  flowType?: "지출" | "수입";
};

type BuildDraftRowsParams = {
  headers: string[];
  rawRows: string[][];
  mapping: MappingState;
  detectedPreset: ParserPreset;
  makeId: (prefix: string) => string;
};

export type ParsedKbRow = {
  id: string;
  tx_date: string;
  description: string;
  category: string;
  amount: number | null;
  cardName: string;
  selected: boolean;
};

const COLUMN_HINTS: Record<MappingKey, string[]> = {
  date: ["날짜", "거래일", "거래일자", "사용일", "승인일", "이용일자", "일자", "date"],
  description: [
    "내용",
    "적요",
    "사용처",
    "가맹점",
    "이용하신 가맹점",
    "거래내용",
    "내역",
    "description",
  ],
  amount: ["금액", "사용금액", "거래금액", "결제금액", "이용금액", "승인금액", "amount"],
  type: ["구분", "유형", "거래구분", "분류", "type", "일시불", "할부"],
  cardName: ["카드", "이용카드", "카드명", "상품명", "card"],
  balance: ["잔액", "결제 후 잔액", "balance"],
};

export function normalizeHeader(text: string) {
  return String(text ?? "").replace(/\s+/g, "").toLowerCase();
}

function normalizeTypeText(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function cleanMoney(value: string) {
  return String(value ?? "")
    .replace(/[,\s₩원]/g, "")
    .replace(/^\((.*)\)$/, "-$1")
    .trim();
}

function parseNumber(value: string | number | null | undefined) {
  const cleaned = cleanMoney(String(value ?? ""));
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function normalizeDateText(value: string) {
  const v = String(value ?? "").trim();
  if (!v) return "";

  let m = v.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;

  m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1].slice(2)}.${m[2]}.${m[3]}`;

  m = v.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (m) return `${m[1].slice(2)}.${m[2]}.${m[3]}`;

  m = v.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m) return `${m[1].slice(2)}.${m[2]}.${m[3]}`;

  m = v.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;

  return v;
}

function isLikelyDate(value: string) {
  const v = String(value ?? "").trim();
  return (
    /^\d{2}\.\d{2}\.\d{2}$/.test(v) ||
    /^\d{4}-\d{2}-\d{2}$/.test(v) ||
    /^\d{4}\.\d{2}\.\d{2}$/.test(v) ||
    /^\d{4}\/\d{2}\/\d{2}$/.test(v) ||
    /^\d{2}\/\d{2}\/\d{2}$/.test(v)
  );
}


function detectColumn(headers: string[], hints: string[]) {
  const normalizedHints = hints.map((hint) => normalizeHeader(hint));

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (normalizedHints.some((hint) => normalized === hint || normalized.includes(hint))) {
      return header;
    }
  }
  return "";
}

function buildCardLabelWithKind(cardName: string, cardKind: string) {
  const issuer = String(cardName ?? "").replace(/카드/g, "").trim();
  const kind = String(cardKind ?? "").trim();

  if (!issuer) return "카드";
  if (!kind) return issuer;
  if (issuer.includes("|") || issuer.includes("·")) return issuer;

  return `${issuer} ${kind}`;
}

function detectCardKindColumn(headers: string[]) {
  return detectColumn(headers, [
    "카드구분",
    "카드 구분",
    "카드종류",
    "카드 종류",
    "결제구분",
    "결제 구분",
    "신용체크",
    "신용/체크",
    "cardtype",
    "card type",
  ]);
}

function detectAmountColumn(headers: string[]) {
  const priorityGroups = [
    ["이번달 결제금액", "이번달결제금액", "이번달 내실금액", "이번달내실금액", "내실금액", "청구금액", "결제금액"],
    ["이용금액", "이용 금액", "승인금액", "사용금액", "금액"],
  ];

  for (const group of priorityGroups) {
    for (const header of headers) {
      const normalizedHeader = normalizeHeader(header);
      if (group.some((keyword) => normalizedHeader.includes(normalizeHeader(keyword)))) {
        return header;
      }
    }
  }

  return "";
}

export function getHeaderScore(cells: string[]) {
  const joined = cells.join(" ").replace(/\s+/g, "").toLowerCase();
  const headerHints = [
    "날짜",
    "이용일자",
    "거래일자",
    "사용일",
    "가맹점",
    "이용하신가맹점",
    "내용",
    "적요",
    "금액",
    "이용금액",
    "결제금액",
    "승인금액",
    "잔액",
    "구분",
    "이용카드",
    "카드",
  ];
  return headerHints.filter((hint) => joined.includes(hint.toLowerCase())).length;
}

export function findBestHeaderIndex(rows: string[][]) {
  let bestIndex = 0;
  let bestScore = -1;

  rows.forEach((row, index) => {
    const score = getHeaderScore(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

export function detectPreset(rows: string[][], headers: string[]): ParserPreset {
  const normalizedHeaders = headers.map((h) => normalizeHeader(h));
  const joinedHeaders = normalizedHeaders.join("|");
  const sampleJoined = rows.slice(0, 20).flat().join(" ").replace(/\s+/g, "").toLowerCase();

  const isKb =
    joinedHeaders.includes("이용일자") &&
    joinedHeaders.includes("이용카드") &&
    joinedHeaders.includes("이용하신가맹점") &&
    joinedHeaders.includes("이용금액");

  if (isKb && (sampleJoined.includes("이번달결제금액") || sampleJoined.includes("결제후잔액"))) {
    return "kbcard";
  }

  const isNh =
    joinedHeaders.includes("사용일자") &&
    joinedHeaders.includes("이용카드") &&
    joinedHeaders.includes("승인번호") &&
    joinedHeaders.includes("가맹점명") &&
    joinedHeaders.includes("이용금액") &&
    joinedHeaders.includes("이용구분");

  if (isNh || sampleJoined.includes("nh농협카드")) {
    return "nhcard";
  }

  const isShinhan =
    (joinedHeaders.includes("일자") &&
      joinedHeaders.includes("카드") &&
      joinedHeaders.includes("가맹점") &&
      joinedHeaders.includes("금액")) ||
    sampleJoined.includes("이용일자별카드사용내역");

  if (isShinhan) return "shinhan";

  return "generic";
}

export function findKbHeaderIndex(cleaned: string[][]) {
  for (let i = 0; i < cleaned.length - 1; i++) {
    const top = (cleaned[i] ?? []).map((cell) => normalizeHeader(cell)).filter(Boolean);
    const sub = (cleaned[i + 1] ?? []).map((cell) => normalizeHeader(cell)).filter(Boolean);

    const looksLikeTop =
      top.some((v) => v.includes("이용일자")) &&
      top.some((v) => v.includes("이용카드")) &&
      top.some((v) => v.includes("이용하신가맹점")) &&
      top.some((v) => v.includes("이용금액"));

    const looksLikeSub =
      sub.some((v) => v.includes("회차")) &&
      sub.some((v) => v.includes("원금"));

    if (looksLikeTop && looksLikeSub) {
      return i;
    }
  }

  return findBestHeaderIndex(cleaned);
}

export function buildKbHeaders(cleaned: string[][], headerIndex: number) {
  const top = cleaned[headerIndex] ?? [];
  const sub = cleaned[headerIndex + 1] ?? [];
  const maxLen = Math.max(top.length, sub.length);

  const result: string[] = [];
  let carryTop = "";

  for (let i = 0; i < maxLen; i++) {
    const rawTop = String(top[i] ?? "").replace(/\u00a0/g, " ").trim();
    const rawSub = String(sub[i] ?? "").replace(/\u00a0/g, " ").trim();

    if (rawTop) {
      carryTop = rawTop;
    }

    const topLabel = carryTop;
    const subLabel = rawSub;

    let merged = "";
    if (topLabel && subLabel) {
      merged = `${topLabel} ${subLabel}`.replace(/\s+/g, " ").trim();
    } else if (topLabel) {
      merged = topLabel;
    } else if (subLabel) {
      merged = subLabel;
    } else {
      merged = `col_${i}`;
    }

    result.push(merged);
  }

  return result;
}

export function applyKbPreset(headers: string[]): MappingState {
  const findExact = (...candidates: string[]) =>
    headers.find((h) =>
      candidates.some((candidate) => normalizeHeader(h) === normalizeHeader(candidate))
    ) ?? "";

  const findIncludes = (...candidates: string[]) =>
    headers.find((h) =>
      candidates.some((candidate) => normalizeHeader(h).includes(normalizeHeader(candidate)))
    ) ?? "";

  return {
    date: findExact("이용일자") || findIncludes("이용일자"),
    description: findExact("이용하신 가맹점") || findIncludes("이용하신가맹점"),
    amount:
      findExact("이번달 결제금액 원금") ||
      findIncludes("이번달 결제금액 원금", "이번달결제금액원금"),
    type: findExact("구분") || findIncludes("구분"),
    cardName: findExact("이용카드") || findIncludes("이용카드"),
    balance:
      findExact("결제 후 잔액 원금") ||
      findIncludes("결제 후 잔액 원금", "결제후잔액원금", "결제후잔액"),
  };
}
export function applyNhPreset(headers: string[]): MappingState {
  const findHeader = (...candidates: string[]) =>
    headers.find((h) =>
      candidates.some((candidate) => normalizeHeader(h) === normalizeHeader(candidate))
    ) ?? "";

  const findHeaderIncludes = (...candidates: string[]) =>
    headers.find((h) =>
      candidates.some((candidate) => normalizeHeader(h).includes(normalizeHeader(candidate)))
    ) ?? "";

  return {
    date:
      findHeader("사용일자", "사용 일자") ||
      findHeaderIncludes("사용일자", "사용일", "일자"),

    description:
      findHeader("가맹점명", "가맹점 명") ||
      findHeaderIncludes("가맹점명", "가맹점"),

    amount:
      findHeader("이용금액", "이용 금액") ||
      findHeaderIncludes("이용금액", "금액"),

    type:
      findHeader("이용구분", "이용 구분") ||
      findHeaderIncludes("이용구분", "구분"),

    cardName:
      findHeader("이용카드", "이용 카드") ||
      findHeaderIncludes("이용카드", "카드"),

    balance: "",
  };
}


export function applyShinhanPreset(headers: string[]): MappingState {
  const findHeader = (...candidates: string[]) =>
    headers.find((h) =>
      candidates.some((candidate) => normalizeHeader(h) === normalizeHeader(candidate))
    ) ?? "";

  const findHeaderIncludes = (...candidates: string[]) =>
    headers.find((h) =>
      candidates.some((candidate) => normalizeHeader(h).includes(normalizeHeader(candidate)))
    ) ?? "";

  return {
    date:
      findHeader("이용 일자", "이용일자", "일자", "사용일자", "사용 일자") ||
      findHeaderIncludes("이용일자", "일자"),
    description:
      findHeader("이용 가맹점", "이용가맹점", "가맹점", "사용처", "이용처") ||
      findHeaderIncludes("가맹점"),
    amount: detectAmountColumn(headers),
    type:
      findHeader("적용 구분", "구분", "거래 구분", "거래구분") ||
      findHeaderIncludes("구분"),
    cardName:
      findHeader("이용 카드", "이용카드", "카드", "카드명") ||
      findHeaderIncludes("카드"),
    balance:
      findHeader("결제 후 잔액", "잔액") ||
      findHeaderIncludes("잔액"),
  };
}

export function applyGenericPreset(headers: string[]): MappingState {
  return {
    date: detectColumn(headers, COLUMN_HINTS.date),
    description: detectColumn(headers, COLUMN_HINTS.description),
    amount: detectAmountColumn(headers),
    type: detectColumn(headers, COLUMN_HINTS.type),
    cardName: detectColumn(headers, COLUMN_HINTS.cardName),
    balance: detectColumn(headers, COLUMN_HINTS.balance),
  };
}

export function findShinhanHeaderAndRows(cleaned: string[][]) {
  const headerCandidates = [
    ["이용일자", "이용카드", "이용가맹점", "이용금액"],
    ["이용 일자", "이용 카드", "이용 가맹점", "이용 금액"],
    ["일자", "카드", "가맹점", "금액"],
    ["이용일자", "이용가맹점", "이용금액"],
  ].map((row) => row.map((cell) => normalizeHeader(cell)));

  const targetIndex = cleaned.findIndex((row) => {
    const normalized = row.map((cell) => normalizeHeader(cell)).filter(Boolean);
    return headerCandidates.some((candidate) =>
      candidate.every((need) => normalized.some((cell) => cell.includes(need)))
    );
  });

  const headerIndex = targetIndex >= 0 ? targetIndex : findBestHeaderIndex(cleaned);
  const headers = cleaned[headerIndex] ?? [];
  const rows = cleaned.slice(headerIndex + 1);

  const stopKeywords = [
    "취소매출상세내역",
    "할인혜택상세내역",
    "포인트상세내역",
    "월별명세",
    "이용요약",
    "총합계",
    "총계",
  ].map((v) => v.toLowerCase());

  const filteredRows: string[][] = [];
  for (const row of rows) {
    const joined = row.join(" ").replace(/\s+/g, "").toLowerCase();

    if (stopKeywords.some((keyword) => joined.includes(keyword))) {
      break;
    }

    if (row.every((cell) => !String(cell ?? "").trim())) {
      continue;
    }

    filteredRows.push(row);
  }

  return { headers, rows: filteredRows };
}

function countLikelyDataRows(rows: string[][], startIndex: number) {
  return rows.slice(startIndex + 1, startIndex + 80).filter((row) => {
    const joined = row.join(" ");
    const hasDate = /\d{4}[./-]\d{2}[./-]\d{2}|\d{2}[./-]\d{2}[./-]\d{2}/.test(joined);
    const hasAmount = /\d{1,3}(,\d{3})+|\d{3,}/.test(joined);
    return hasDate && hasAmount;
  }).length;
}

export function getDirectCellText(cell: Element) {
  const parts: string[] = [];

  for (const node of Array.from(cell.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = String(node.textContent ?? "").replace(/\u00a0/g, " ").trim();
      if (text) parts.push(text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();

      if (["table", "thead", "tbody", "tr", "td", "th", "ul", "ol", "li"].includes(tag)) {
        continue;
      }

      const text = String(el.textContent ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) parts.push(text);
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function pickBestHtmlTable(tables: string[][][]) {
  let bestTable: string[][] = [];
  let bestScore = -1;

  for (const table of tables) {
    const cleaned = table
      .map((row) => row.map((cell) => String(cell ?? "").trim()))
      .filter((row) => row.some((cell) => cell !== ""));

    if (cleaned.length < 3) continue;

    const headerIndex = findBestHeaderIndex(cleaned);
    const headerRow = cleaned[headerIndex] ?? [];
    const headerScore = getHeaderScore(headerRow);
    const dataScore = countLikelyDataRows(cleaned, headerIndex);

    const firstRowJoined = (cleaned[0] ?? []).join(" ");
    const hasHugeMergedRow = firstRowJoined.length > 120;

    const hasShinhanPattern =
      headerRow.some((v) => normalizeHeader(v).includes("이용일자")) ||
      headerRow.some((v) => normalizeHeader(v).includes("이용카드")) ||
      headerRow.some((v) => normalizeHeader(v).includes("이용가맹점")) ||
      headerRow.some((v) => normalizeHeader(v).includes("이용금액"));

    let totalScore = headerScore * 12 + dataScore * 5 + Math.min(cleaned.length, 80) * 0.1;

    if (hasShinhanPattern) totalScore += 30;
    if (hasHugeMergedRow) totalScore -= 40;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestTable = cleaned;
    }
  }

  return bestTable;
}

function inferCategory(description: string) {
  const remembered = getRememberedCategory(description);
  if (remembered) {
    return remembered;
  }

  const text = normalizeTypeText(description);

  let bestCategory = "기타";
  let bestScore = 0;

  for (const rule of CATEGORY_RULES) {
    let score = 0;

    const exclude = rule.exclude ?? [];
    const strong = rule.strong ?? [];
    const weak = rule.weak ?? [];

    for (const keyword of exclude) {
      if (text.includes(normalizeTypeText(keyword))) {
        score -= 100;
      }
    }

    for (const keyword of strong) {
      if (text.includes(normalizeTypeText(keyword))) {
        score += 5;
      }
    }

    for (const keyword of weak) {
      if (text.includes(normalizeTypeText(keyword))) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategory = rule.category;
    }
  }

  return bestCategory;
}

function getCell(row: string[], headers: string[], headerName: string) {
  if (!headerName) return "";
  const idx = headers.findIndex((h) => h === headerName);
  if (idx < 0) return "";
  return String(row[idx] ?? "").trim();
}

function findHeaderByIncludes(headers: string[], ...candidates: string[]) {
  return (
    headers.find((h) =>
      candidates.some((candidate) => normalizeHeader(h).includes(normalizeHeader(candidate)))
    ) ?? ""
  );
}

function isSummaryLikeRow(text: string) {
  const joined = text.replace(/\s+/g, "").toLowerCase();
  const keywords = [
    "본인회원소계",
    "소계",
    "합계",
    "총계",
    "총금액",
    "결제총액",
    "신용카드결제하실총금액",
    "이월금액합계",
    "연회비",
    "청구금액",
    "결제예정금액",
    "납부금액",
    "명세서",
    "국내이용금액합계",
    "해외이용금액합계",
    "누계",
    "취소매출상세내역",
    "할인혜택상세내역",
  ].map((v) => v.toLowerCase());

  return keywords.some((keyword) => joined.includes(keyword));
}

function isKbContinuationRow(row: string[], headers: string[]) {
  const dateHeader = findHeaderByIncludes(headers, "이용일자");
  const cardHeader = findHeaderByIncludes(headers, "이용카드");
  const typeHeader = findHeaderByIncludes(headers, "구분");
  const descHeader = findHeaderByIncludes(headers, "이용하신가맹점");
  const principalHeader = findHeaderByIncludes(headers, "이번달 결제금액 원금", "이번달결제금액원금");
  const feeHeader = findHeaderByIncludes(headers, "이번달 결제금액 수수료", "수수료(이자)");
  const useAmountHeader = findHeaderByIncludes(headers, "이용금액");

  const date = getCell(row, headers, dateHeader);
  const card = getCell(row, headers, cardHeader);
  const type = getCell(row, headers, typeHeader);
  const desc = getCell(row, headers, descHeader);
  const principal = parseNumber(getCell(row, headers, principalHeader));
  const fee = parseNumber(getCell(row, headers, feeHeader));
  const useAmount = parseNumber(getCell(row, headers, useAmountHeader));

  const noMainIdentity = !date && !card && !type;
  const hasContinuationDesc =
    normalizeTypeText(desc).includes("무이자혜택금액") ||
    normalizeTypeText(desc).includes("수수료") ||
    normalizeTypeText(desc).includes("이자");
  const hasAdjustNumber = principal !== null || fee !== null || useAmount !== null;

  return noMainIdentity && hasContinuationDesc && hasAdjustNumber;
}

function buildKbDraftRows(params: BuildDraftRowsParams): ExcelDraftRow[] {
  const { headers, rawRows, mapping, makeId } = params;
  const result: ExcelDraftRow[] = [];

  const dateHeader = mapping.date || findHeaderByIncludes(headers, "이용일자");
  const descHeader = mapping.description || findHeaderByIncludes(headers, "이용하신가맹점");
  const cardHeader = mapping.cardName || findHeaderByIncludes(headers, "이용카드");
  const typeHeader = mapping.type || findHeaderByIncludes(headers, "구분");

  const principalHeader =
    findHeaderByIncludes(headers, "이번달 결제금액 원금", "이번달결제금액원금") ||
    headers.find((h) => normalizeHeader(h) === "원금") ||
    "";

  const feeHeader =
    findHeaderByIncludes(
      headers,
      "이번달 결제금액 수수료",
      "이번달결제금액수수료",
      "이번달 결제금액 수수료(이자)",
      "수수료(이자)"
    ) || "";

  const useAmountHeader =
    findHeaderByIncludes(headers, "이용금액", "이용 금액") || "";

  let lastMainRow: ExcelDraftRow | null = null;

  for (const row of rawRows) {
    const rowText = row.join(" ").trim();
    if (!rowText) continue;

    if (isKbContinuationRow(row, headers)) {
      if (!lastMainRow) continue;

      const principalAdj = parseNumber(getCell(row, headers, principalHeader)) ?? 0;
      const feeAdj = parseNumber(getCell(row, headers, feeHeader)) ?? 0;
      const useAmountAdj = parseNumber(getCell(row, headers, useAmountHeader)) ?? 0;

      const delta =
        principalAdj !== 0 || feeAdj !== 0
          ? principalAdj + feeAdj
          : useAmountAdj;

      if (lastMainRow.amount === null) {
        lastMainRow.amount = delta || null;
      } else {
        lastMainRow.amount += delta;
      }
      continue;
    }

    if (isSummaryLikeRow(rowText)) continue;

    const dateText = normalizeDateText(getCell(row, headers, dateHeader));
    const desc = getCell(row, headers, descHeader);
    const cardName = getCell(row, headers, cardHeader) || "국민카드";
    const typeText = getCell(row, headers, typeHeader);

    if (!dateText || !isLikelyDate(dateText)) continue;
    if (!desc) continue;

    const principal = parseNumber(getCell(row, headers, principalHeader));
    const fee = parseNumber(getCell(row, headers, feeHeader));
    const useAmount = parseNumber(getCell(row, headers, useAmountHeader));

    let amount: number | null = null;

    const typeNorm = normalizeTypeText(typeText);
    const isInstallment =
      typeNorm.includes("할부") || typeNorm.includes("부분무이자");

    if (principal !== null) {
      amount = principal + (fee ?? 0);
    } else if (!isInstallment && useAmount !== null) {
      amount = useAmount;
    }

    if (amount === null) continue;

    const item: ExcelDraftRow = {
      id: makeId("excel"),
      tx_date: dateText,
      description: desc,
      category: inferCategory(desc),
      amount,
      cardName,
      selected: true,
      flowType: "지출",
    };

    result.push(item);
    lastMainRow = item;
  }

  return result;
}

export function buildDraftRows(params: BuildDraftRowsParams): ExcelDraftRow[] {
  if (params.detectedPreset === "kbcard") {
    return buildKbDraftRows(params);
  }

  const { headers, rawRows, mapping, makeId } = params;
  const rows: ExcelDraftRow[] = [];
  const cardKindHeader = detectCardKindColumn(headers);

  for (const row of rawRows) {
    const rowText = row.join(" ").trim();
    if (!rowText) continue;
    if (isSummaryLikeRow(rowText)) continue;

    const dateText = normalizeDateText(getCell(row, headers, mapping.date));
    const desc = getCell(row, headers, mapping.description);
    const amount = parseNumber(getCell(row, headers, mapping.amount));
    const cardName = buildCardLabelWithKind(
      getCell(row, headers, mapping.cardName) || "카드",
      getCell(row, headers, cardKindHeader)
    );

    if (!dateText || !isLikelyDate(dateText)) continue;
    if (!desc) continue;
    if (amount === null) continue;

    rows.push({
      id: makeId("excel"),
      tx_date: dateText,
      description: desc,
      category: inferCategory(desc),
      amount,
      cardName,
      selected: true,
      flowType: "지출",
    });
  }

  return rows;
}

function findKbHeaderPair(cleaned: string[][]) {
  for (let i = 0; i < cleaned.length - 1; i++) {
    const top = (cleaned[i] ?? []).map((v) => String(v ?? "").trim());
    const sub = (cleaned[i + 1] ?? []).map((v) => String(v ?? "").trim());

    const topNorm = top.map((v) => normalizeHeader(v));
    const subNorm = sub.map((v) => normalizeHeader(v));

    const looksLikeTop =
      topNorm.some((v) => v.includes("이용일자")) &&
      topNorm.some((v) => v.includes("이용카드")) &&
      topNorm.some((v) => v.includes("이용하신가맹점")) &&
      topNorm.some((v) => v.includes("이용금액"));

    const looksLikeSub =
      subNorm.some((v) => v.includes("회차")) &&
      subNorm.some((v) => v.includes("원금"));

    if (looksLikeTop && looksLikeSub) {
      return { topIndex: i, top, sub };
    }
  }

  return null;
}

function buildKbColumnIndexes(top: string[], sub: string[]) {
  const maxLen = Math.max(top.length, sub.length);
  const merged: string[] = [];
  let carryTop = "";

  for (let i = 0; i < maxLen; i++) {
    const rawTop = String(top[i] ?? "").trim();
    const rawSub = String(sub[i] ?? "").trim();

    if (rawTop) carryTop = rawTop;

    const t = carryTop;
    const s = rawSub;

    if (t && s) merged.push(`${t} ${s}`.replace(/\s+/g, " ").trim());
    else if (t) merged.push(t);
    else if (s) merged.push(s);
    else merged.push(`col_${i}`);
  }

  const findIdx = (...candidates: string[]) =>
    merged.findIndex((h) =>
      candidates.some((c) => normalizeHeader(h).includes(normalizeHeader(c)))
    );

  return {
    merged,
    dateIdx: findIdx("이용일자"),
    cardIdx: findIdx("이용카드"),
    typeIdx: findIdx("구분"),
    descIdx: findIdx("이용하신가맹점"),
    useAmountIdx: findIdx("이용금액"),
    principalIdx: findIdx("이번달 결제금액 원금", "이번달결제금액원금"),
    feeIdx: findIdx("이번달 결제금액 수수료", "수수료(이자)"),
  };
}

function rowCell(row: string[], idx: number) {
  if (idx < 0) return "";
  return String(row[idx] ?? "").trim();
}

function isKbSummaryRowText(text: string) {
  const joined = text.replace(/\s+/g, "").toLowerCase();
  const keywords = [
    "본인회원소계",
    "소계",
    "합계",
    "총계",
    "총금액",
    "결제총액",
    "신용카드결제하실총금액",
    "이월금액합계",
    "연회비",
    "청구금액",
    "결제예정금액",
    "납부금액",
    "명세서",
    "국내이용금액합계",
    "해외이용금액합계",
    "누계",
    "취소매출상세내역",
    "할인혜택상세내역",
  ];
  return keywords.some((k) => joined.includes(k));
}

export function parseKbRowsDirect(
  cleaned: string[][],
  makeId: (prefix: string) => string
): ParsedKbRow[] {
  const pair = findKbHeaderPair(cleaned);
  if (!pair) return [];

  const { topIndex, top, sub } = pair;
  const cols = buildKbColumnIndexes(top, sub);
  const rows = cleaned.slice(topIndex + 2);

  const result: ParsedKbRow[] = [];
  let lastMain: ParsedKbRow | null = null;

  for (const row of rows) {
    const rowText = row.join(" ").trim();
    if (!rowText) continue;
    if (isKbSummaryRowText(rowText)) continue;

    const date = normalizeDateText(rowCell(row, cols.dateIdx));
    const card = rowCell(row, cols.cardIdx);
    const type = rowCell(row, cols.typeIdx);
    const desc = rowCell(row, cols.descIdx);

    const useAmount = parseNumber(rowCell(row, cols.useAmountIdx));
    const principal = parseNumber(rowCell(row, cols.principalIdx));
    const fee = parseNumber(rowCell(row, cols.feeIdx));

    const isContinuation =
      !date &&
      !card &&
      !type &&
      !!desc &&
      (
        normalizeTypeText(desc).includes("무이자혜택금액") ||
        normalizeTypeText(desc).includes("수수료") ||
        normalizeTypeText(desc).includes("이자")
      ) &&
      (principal !== null || fee !== null || useAmount !== null);

    if (isContinuation) {
      if (!lastMain) continue;

      const delta =
        (principal ?? 0) !== 0 || (fee ?? 0) !== 0
          ? (principal ?? 0) + (fee ?? 0)
          : (useAmount ?? 0);

      if (lastMain.amount === null) lastMain.amount = delta || null;
      else lastMain.amount += delta;

      continue;
    }

    if (!date || !isLikelyDate(date)) continue;
    if (!desc) continue;

    const typeNorm = normalizeTypeText(type);
    const isInstallment =
      typeNorm.includes("할부") || typeNorm.includes("부분무이자");

    let amount: number | null = null;

    if (principal !== null) {
      amount = principal + (fee ?? 0);
    } else if (!isInstallment && useAmount !== null) {
      amount = useAmount;
    }

    if (amount === null) continue;

    const item: ParsedKbRow = {
      id: makeId("excel"),
      tx_date: date,
      description: desc,
      category: inferCategory(desc),
      amount,
      cardName: card || "국민카드",
      selected: true,
      flowType: "지출",
    };

    result.push(item);
    lastMain = item;
  }

  return result;
}