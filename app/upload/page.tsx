"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import * as TxParsers from "./parsers";
import { setCategoryMemory } from "./category-memory";
import { normalizeAccountLabel, normalizeUserTag } from "@/lib/finance-labels";
import {
  getDefaultOptionIcon,
  isImageIcon,
  loadOptionIcons,
  saveOptionIcons,
  type OptionGroupKey,
  type OptionIconMap,
} from "@/lib/option-icons";

type UploadTab = "manual" | "excel";

type TableRow = string[];

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
  memo?: string;
  isFixed?: boolean;
  installmentTotal?: number | null;
  installmentCurrent?: number | null;
};

type ManualDraftRow = {
  id: string;
  tx_date: string;
  description: string;
  flowType: "지출" | "수입";
  category: string;
  amount: string;
  userType: string;
  accountType: string;
};

type TransactionInsertRow = {
  tx_date: string | null;
  description: string | null;
  type: string | null;
  amount: number | null;
  balance: number | null;
  user_type: string | null;
  account_type: string | null;
  source_file: string | null;
  memo?: string | null;
  is_fixed?: boolean;
  installment_total?: number | null;
  installment_current?: number | null;
  installment_key?: string | null;
};

type EditExcelRowForm = {
  id: string;
  tx_date: string;
  description: string;
  category: string;
  amount: string;
  cardName: string;
  memo: string;
  flowType: "지출" | "수입";
  userType: string;
  isFixed: boolean;
  installmentTotal: string;
  installmentCurrent: string;
};

const LS_KEYS = {
  users: "asset_couple_users",
  accounts: "asset_couple_accounts",
  categories: "asset_couple_categories",
  mappingPresets: "asset_couple_upload_mapping_presets",
  optionIcons: "asset_couple_option_icons",
} as const;

const DEFAULT_USERS = ["기린", "짱구", "공동"];
const DEFAULT_ACCOUNTS = ["현대카드", "삼성카드", "신한카드", "국민카드", "카드", "계좌", "현금"];
const DEFAULT_CATEGORIES = [
  "식대",
  "카페",
  "장보기",
  "생활",
  "교통",
  "쇼핑",
  "여가",
  "병원",
  "주거",
  "기타",
];

const MAPPING_LABELS: Record<MappingKey, string> = {
  date: "날짜 컬럼",
  description: "내용 컬럼",
  amount: "금액 컬럼",
  type: "구분 컬럼",
  cardName: "카드명 컬럼",
  balance: "잔액 컬럼",
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

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadList(key: keyof typeof LS_KEYS, defaults: string[]) {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(LS_KEYS[key]);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults;
    const cleaned = parsed.map((v) => String(v ?? "").trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : defaults;
  } catch {
    return defaults;
  }
}

function saveList(key: keyof typeof LS_KEYS, values: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEYS[key], JSON.stringify(values));
}

function normalizeHeader(text: string) {
  return String(text ?? "").replace(/\s+/g, "").toLowerCase();
}

function detectColumn(headers: string[], hints: string[]) {
  const normalizedHints = hints.map((hint) => normalizeHeader(hint));

  for (const header of headers) {
    const normalizedHeader = normalizeHeader(header);
    if (normalizedHints.some((hint) => normalizedHeader === hint || normalizedHeader.includes(hint))) {
      return header;
    }
  }
  return "";
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

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (num > 0) return `+${num.toLocaleString("ko-KR")}원`;
  if (num < 0) return `-${Math.abs(num).toLocaleString("ko-KR")}원`;
  return "0원";
}

function isLikelyDate(value: string) {
  const v = String(value ?? "").trim();
  return (
    /^\d{2}\.\d{2}\.\d{2}$/.test(v) ||
    /^\d{4}-\d{2}-\d{2}$/.test(v) ||
    /^\d{4}\.\d{2}\.\d{2}$/.test(v) ||
    /^\d{2}\/\d{2}\/\d{2}$/.test(v)
  );
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

  m = v.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;

  return v;
}

function toIsoDate(value: string) {
  const m = String(value ?? "").match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!m) return "";
  return `20${m[1]}-${m[2]}-${m[3]}`;
}

function fromIsoDate(value: string) {
  const m = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return value;
  return `${m[1].slice(2)}.${m[2]}.${m[3]}`;
}

function normalizeTypeText(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function getHeaderScore(cells: string[]) {
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

function findBestHeaderIndex(rows: string[][]) {
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

function inferCategory(description: string) {
  const text = normalizeTypeText(description);

  const rules: Array<{ category: string; keywords: string[] }> = [
    { category: "카페", keywords: ["스타벅스", "투썸", "메가커피", "커피", "카페", "빽다방"] },
    { category: "식대", keywords: ["식당", "국밥", "장어", "배민", "요기요", "버거", "치킨", "식사", "도시락"] },
    { category: "장보기", keywords: ["이마트", "홈플러스", "롯데마트", "코스트코", "트레이더스", "마트"] },
    { category: "생활", keywords: ["다이소", "쿠팡", "올리브영", "생활", "무신사"] },
    { category: "교통", keywords: ["버스", "지하철", "택시", "주유", "주차", "교통", "t머니"] },
    { category: "쇼핑", keywords: ["쇼핑", "네이버", "지마켓", "11번가", "ssf", "오늘의집"] },
    { category: "여가", keywords: ["영화", "cgv", "넷플릭스", "디즈니", "놀이", "여가", "숙박", "stay"] },
    { category: "병원", keywords: ["병원", "약국", "의원", "치과", "검사", "한의원"] },
    { category: "주거", keywords: ["관리비", "월세", "전세", "가스", "전기", "수도", "통신"] },
  ];

  for (const rule of rules) {
    if (rule.keywords.some((keyword) => text.includes(normalizeTypeText(keyword)))) {
      return rule.category;
    }
  }

  return "기타";
}

function getMappingPresetKey(headers: string[]) {
  return headers.map((h) => normalizeHeader(h)).join("|");
}

function loadMappingPreset(headers: string[]): MappingState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEYS.mappingPresets);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const key = getMappingPresetKey(headers);
    return parsed?.[key] ?? null;
  } catch {
    return null;
  }
}

function saveMappingPreset(headers: string[], mapping: MappingState) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LS_KEYS.mappingPresets);
    const parsed = raw ? JSON.parse(raw) : {};
    const key = getMappingPresetKey(headers);
    parsed[key] = mapping;
    localStorage.setItem(LS_KEYS.mappingPresets, JSON.stringify(parsed));
  } catch {}
}

function getCategoryBadgeClass(value: string) {
  if (value === "식대") return "app-badge app-badge-yellow";
  if (value === "카페") return "app-badge app-badge-violet";
  if (value === "장보기") return "app-badge app-badge-teal";
  if (value === "여가") return "app-badge app-badge-violet";
  if (value === "교통") return "app-badge app-badge-yellow";
  return "app-badge app-badge-slate";
}
function buildUploadMeta(row: ExcelDraftRow) {
  const amountKey = Math.abs(Number(row.amount ?? 0));

  const hasInstallment =
    Number(row.installmentTotal ?? 0) > 1 &&
    Number(row.installmentCurrent ?? 0) >= 1;

  const installmentKey = hasInstallment
    ? [row.description.trim(), row.cardName.trim(), amountKey].join("||")
    : null;

  return {
    memo: row.memo?.trim() || null,
    is_fixed: row.isFixed ?? false,
    installment_total: hasInstallment ? Number(row.installmentTotal) : null,
    installment_current: hasInstallment ? Number(row.installmentCurrent) : null,
    installment_key: installmentKey,
  };
}
function parseHtmlTableFile(text: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));

  const parsedTables = tables.map((table) => {
    const rows = Array.from(table.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr"));

    return rows.map((tr) => {
      const cells = Array.from(tr.querySelectorAll(":scope > th, :scope > td"));
      return cells.map((cell) => TxParsers.getDirectCellText(cell));
    });
  });

  return TxParsers.pickBestHtmlTable(parsedTables);
}


export default function UploadPage() {
  const [tab, setTab] = useState<UploadTab>("excel");

  const [users, setUsers] = useState<string[]>(DEFAULT_USERS);
  const [accounts, setAccounts] = useState<string[]>(DEFAULT_ACCOUNTS);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [optionDraft, setOptionDraft] = useState({
    users: "",
    accounts: "",
    categories: "",
  });
  const [hoveredPreviewIndex, setHoveredPreviewIndex] = useState<number | null>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<TableRow[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [detectedPreset, setDetectedPreset] = useState<TxParsers.ParserPreset>("generic");

  const [mapping, setMapping] = useState<MappingState>({
    date: "",
    description: "",
    amount: "",
    type: "",
    cardName: "",
    balance: "",
  });

  const [excelUserType, setExcelUserType] = useState("기린");
  const [bulkCategory, setBulkCategory] = useState("기타");
  const [draftRows, setDraftRows] = useState<ExcelDraftRow[]>([]);

  const [showRawModal, setShowRawModal] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [editingRow, setEditingRow] = useState<EditExcelRowForm | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [optionIcons, setOptionIcons] = useState<OptionIconMap>({});
  const [manualRows, setManualRows] = useState<ManualDraftRow[]>([
    {
      id: makeId("manual"),
      tx_date: "",
      description: "",
      flowType: "지출",
      category: "기타",
      amount: "",
      userType: "기린",
      accountType: "현금",
    },
  ]);
  const [showManualAddModal, setShowManualAddModal] = useState(false);
  const [manualForm, setManualForm] = useState<ManualDraftRow>({
    id: makeId("manual"),
    tx_date: "",
    description: "",
    flowType: "지출",
    category: categories[0] ?? "기타",
    amount: "",
    userType: users[0] ?? "기린",
    accountType: accounts[0] ?? "현금",
  });
  useEffect(() => {
    setUsers(loadList("users", DEFAULT_USERS));
    setAccounts(loadList("accounts", DEFAULT_ACCOUNTS));
    setCategories(loadList("categories", DEFAULT_CATEGORIES));
    setOptionIcons(loadOptionIcons());
  }, []);

  useEffect(() => {
    if (users.length > 0 && !users.includes(excelUserType)) {
      setExcelUserType(users[0]);
    }
  }, [users, excelUserType]);

  useEffect(() => {
    if (categories.length > 0 && !categories.includes(bulkCategory)) {
      setBulkCategory(categories[0]);
    }
  }, [categories, bulkCategory]);

  const selectedCount = useMemo(
    () => draftRows.filter((row) => row.selected).length,
    [draftRows]
  );

  const previewRows = useMemo(() => draftRows.slice(0, 300), [draftRows]);

  const totalExpense = useMemo(() => {
    return draftRows
      .filter((row) => row.selected)
      .reduce((sum, row) => sum + Math.abs(Number(row.amount ?? 0)), 0);
  }, [draftRows]);

  const manualTotal = useMemo(() => {
    return manualRows.reduce((sum, row) => {
      const amount = parseNumber(row.amount);
      if (amount === null) return sum;

      return row.flowType === "지출"
        ? sum - Math.abs(amount)
        : sum + Math.abs(amount);
    }, 0);
  }, [manualRows]);

  const applyTableData = (tableData: unknown[][]) => {
  const cleaned = tableData
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((row) => row.some((cell) => cell !== ""));

  if (cleaned.length === 0) {
    setHeaders([]);
    setRawRows([]);
    setDraftRows([]);
    setError("비어 있는 파일이거나 표시할 행이 없습니다.");
    setSuccess("");
    setMapping({
      date: "",
      description: "",
      amount: "",
      type: "",
      cardName: "",
      balance: "",
    });
    return;
  }

  let nextHeaders: string[] = [];
  let nextRows: string[][] = [];

  const candidateHeaderIndex = TxParsers.findBestHeaderIndex(cleaned);
  const candidateHeaders = cleaned[candidateHeaderIndex] ?? [];
  const preset = TxParsers.detectPreset(cleaned, candidateHeaders);

  setDetectedPreset(preset);

if (preset === "kbcard") {
  const headerIndex = candidateHeaderIndex;
  const kbHeaders = cleaned[headerIndex] ?? [];
  const kbRawRows = cleaned
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));

  const kbRows = TxParsers.parseKbRowsDirect(cleaned, makeId);

  const kbMapping: MappingState = {
    date: detectColumn(kbHeaders, COLUMN_HINTS.date),
    description: detectColumn(kbHeaders, COLUMN_HINTS.description),
    amount: detectAmountColumn(kbHeaders),
    type: detectColumn(kbHeaders, COLUMN_HINTS.type),
    cardName: detectColumn(kbHeaders, COLUMN_HINTS.cardName),
    balance: detectColumn(kbHeaders, COLUMN_HINTS.balance),
  };

  setHeaders(kbHeaders);
  setRawRows(kbRawRows);
  setError("");
  setSuccess("");
  setMapping(kbMapping);
  setDraftRows(kbRows);
  return;
}

  if (preset === "shinhan") {
    const result = TxParsers.findShinhanHeaderAndRows(cleaned);
    nextHeaders = result.headers;
    nextRows = result.rows;
  } else {
    const headerIndex = candidateHeaderIndex;
    nextHeaders = cleaned[headerIndex] ?? [];
    nextRows = cleaned.slice(headerIndex + 1);
  }

  nextRows = nextRows.filter((row) =>
    row.some((cell) => String(cell ?? "").trim() !== "")
  );

  const savedPreset = loadMappingPreset(nextHeaders);

  let recommendedMapping: MappingState;
  if (savedPreset) {
    recommendedMapping = savedPreset;
  } else if (preset === "shinhan") {
    recommendedMapping = TxParsers.applyShinhanPreset(nextHeaders);
  } else if (preset === "nhcard") {
    recommendedMapping = TxParsers.applyNhPreset(nextHeaders);
  } else {
    recommendedMapping = TxParsers.applyGenericPreset(nextHeaders);
  }

  setHeaders(nextHeaders);
  setRawRows(nextRows);
  setError("");
  setSuccess("");
  setMapping(recommendedMapping);
  // 🔥 매핑 fallback (자동 실패 대비)
  setTimeout(() => {
    setMapping((prev) => {
      const hasMapping = Object.values(prev).some((v) => v);
      if (hasMapping) return prev;

      return {
        date: detectColumn(nextHeaders, COLUMN_HINTS.date),
        description: detectColumn(nextHeaders, COLUMN_HINTS.description),
        amount: detectAmountColumn(nextHeaders),
        type: detectColumn(nextHeaders, COLUMN_HINTS.type),
        cardName: detectColumn(nextHeaders, COLUMN_HINTS.cardName),
        balance: detectColumn(nextHeaders, COLUMN_HINTS.balance),
      };
    });
  }, 0);

};

useEffect(() => {
  if (detectedPreset === "kbcard") {
    return;
  }

  if (headers.length === 0 || rawRows.length === 0) {
    setDraftRows([]);
    return;
  }

  const mapped = TxParsers.buildDraftRows({
    headers,
    rawRows,
    mapping,
    detectedPreset,
    makeId,
  });

  setDraftRows(mapped);
}, [headers, rawRows, mapping, detectedPreset]);

  const parseCsvText = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      setHeaders([]);
      setRawRows([]);
      setDraftRows([]);
      setError("비어 있는 CSV 파일입니다.");
      setSuccess("");
      return;
    }

    const parsed = lines.map((line) => line.split(",").map((cell) => cell.trim()));
    applyTableData(parsed);
  };

  const parseExcelFile = async (file: File) => {
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith(".xls")) {
      const text = await file.text();
      const trimmed = text.trim().toLowerCase();

      if (trimmed.startsWith("<html") || trimmed.includes("<table")) {
        const htmlTable = parseHtmlTableFile(text);
        if (htmlTable.length === 0) {
          setHeaders([]);
          setRawRows([]);
          setDraftRows([]);
          setError("HTML 형식 XLS 파일에서 표를 찾지 못했습니다.");
          setSuccess("");
          return;
        }

        applyTableData(htmlTable as unknown[][]);
        return;
      }
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, {
      type: "array",
      cellText: true,
      cellDates: false,
    });

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      setHeaders([]);
      setRawRows([]);
      setDraftRows([]);
      setError("시트를 찾을 수 없습니다.");
      setSuccess("");
      return;
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const data = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
      worksheet,
      {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      }
    );

    applyTableData(data as unknown[][]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handlePickedFile(file);
  };

  const handlePickedFile = async (file: File) => {
    setFileName(file.name);
    setSuccess("");
    setError("");

    try {
      const lowerName = file.name.toLowerCase();

      if (lowerName.endsWith(".csv")) {
        const text = await file.text();
        parseCsvText(text);
        return;
      }

      if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
        await parseExcelFile(file);
        return;
      }

      setHeaders([]);
      setRawRows([]);
      setDraftRows([]);
      setError("지원하지 않는 파일 형식입니다. CSV 또는 XLSX 파일을 선택해주세요.");
    } catch {
      setHeaders([]);
      setRawRows([]);
      setDraftRows([]);
      setError("파일을 읽는 중 오류가 발생했습니다.");
    }
  };

  const handleMappingChange = (key: MappingKey, value: string) => {
    setMapping((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const saveCurrentMappingPreset = () => {
    if (headers.length === 0) return;
    saveMappingPreset(headers, mapping);
    setShowMappingModal(false);
  };

  const toggleRowSelection = (id: string) => {
    setDraftRows((prev) =>
      prev.map((row) =>
        row.id === id ? { ...row, selected: !row.selected } : row
      )
    );
  };

  const toggleAllRows = () => {
    const allSelected = draftRows.length > 0 && draftRows.every((row) => row.selected);
    setDraftRows((prev) => prev.map((row) => ({ ...row, selected: !allSelected })));
  };

  const applyBulkCategory = () => {
    setDraftRows((prev) =>
      prev.map((row) => {
        if (!row.selected) return row;

        setCategoryMemory(row.description, bulkCategory);

        return {
          ...row,
          category: bulkCategory,
        };
      })
    );
  };

  const excludeSelectedRows = () => {
    setDraftRows((prev) => prev.filter((row) => !row.selected));
  };

const openRowEditor = (row: ExcelDraftRow) => {
  setEditingRow({
    id: row.id,
    tx_date: toIsoDate(row.tx_date),
    description: row.description,
    category: row.category,
    amount: row.amount !== null ? String(Math.abs(row.amount)) : "",
    cardName: row.cardName,
    memo: row.memo ?? "",
    flowType: "지출",
    userType: excelUserType,
    isFixed: row.isFixed ?? false,
    installmentTotal: row.installmentTotal ? String(row.installmentTotal) : "",
    installmentCurrent: row.installmentCurrent ? String(row.installmentCurrent) : "",
  });
};

  const saveRowEditor = () => {
    if (!editingRow) return;

    const nextDescription = editingRow.description.trim();
    const nextCategory = editingRow.category.trim() || "기타";

    setCategoryMemory(nextDescription, nextCategory);

    setDraftRows((prev) =>
      prev.map((row) => {
        if (row.id !== editingRow.id) return row;
        return {
          ...row,
          tx_date: editingRow.tx_date ? fromIsoDate(editingRow.tx_date) : row.tx_date,
          description: nextDescription,
          category: nextCategory,
          amount:
            editingRow.flowType === "지출"
              ? -Math.abs(Number(parseNumber(editingRow.amount) ?? 0))
              : Math.abs(Number(parseNumber(editingRow.amount) ?? 0)),
          cardName: editingRow.cardName.trim() || "카드",
          memo: editingRow.memo.trim(),
          isFixed: editingRow.isFixed,
          installmentTotal: editingRow.installmentTotal ? Number(editingRow.installmentTotal) : null,
          installmentCurrent: editingRow.installmentCurrent ? Number(editingRow.installmentCurrent) : null,
        };
      })
    );

    setEditingRow(null);
  };

  function normalizeUploadAccountType(
    cardName: string | null | undefined,
    currentFileName: string | null | undefined
  ) {
    return normalizeAccountLabel(cardName, currentFileName, detectedPreset);
  }

  function normalizeDuplicateText(value: string | null | undefined) {
    return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function getFlowFromType(value: string | null | undefined) {
    const raw = String(value ?? "").trim();
    const [flow = ""] = raw.split("/");
    return flow.trim();
  }

  function buildDuplicateKey(row: {
    tx_date: string | null | undefined;
    description: string | null | undefined;
    type: string | null | undefined;
    amount: number | null | undefined;
    user_type: string | null | undefined;
    account_type: string | null | undefined;
  }) {
    const amount = Math.abs(Number(row.amount ?? 0));
    const flow = getFlowFromType(row.type);
    return [
      row.tx_date ?? "",
      normalizeDuplicateText(row.description),
      flow,
      String(amount),
      normalizeDuplicateText(row.user_type),
      normalizeDuplicateText(row.account_type),
    ].join("||");
  }

  async function filterDuplicateTransactions(payload: TransactionInsertRow[]) {
    if (payload.length === 0) {
      return {
        uniqueRows: [] as TransactionInsertRow[],
        duplicateCount: 0,
      };
    }

    const dates = Array.from(
      new Set(payload.map((row) => row.tx_date).filter((v): v is string => Boolean(v)))
    );

    let existingRows: Array<{
      tx_date: string | null;
      description: string | null;
      type: string | null;
      amount: number | null;
      user_type: string | null;
      account_type: string | null;
    }> = [];

    if (dates.length > 0) {
      const { data, error } = await supabase
        .from("transactions")
        .select("tx_date, description, type, amount, user_type, account_type")
        .in("tx_date", dates);

      if (error) {
        throw new Error(error.message);
      }

      existingRows = (data ?? []) as typeof existingRows;
    }

    const existingSet = new Set(existingRows.map((row) => buildDuplicateKey(row)));
    const seenInPayload = new Set<string>();

    const uniqueRows: TransactionInsertRow[] = [];
    let duplicateCount = 0;

    for (const row of payload) {
      const key = buildDuplicateKey(row);

      if (existingSet.has(key) || seenInPayload.has(key)) {
        duplicateCount += 1;
        continue;
      }

      seenInPayload.add(key);
      uniqueRows.push(row);
    }

    return { uniqueRows, duplicateCount };
  }
  

async function buildPrevInstallmentMap() {
  const { data } = await supabase
    .from("transactions")
    .select("installment_key, installment_current, installment_total");

  const map = new Map();

  (data ?? []).forEach((row) => {
    if (!row.installment_key) return;

    map.set(row.installment_key, {
      current: row.installment_current ?? 0,
      total: row.installment_total ?? 0,
    });
  });

  return map;
}
  const handleExcelSave = async () => {
    setError("");
    setSuccess("");

    const selectedData = draftRows.filter((row) => row.selected);
    if (selectedData.length === 0) {
      setError("저장할 행을 하나 이상 선택해주세요.");
      return;
    }

  const prevMap = await buildPrevInstallmentMap();

  const payload: TransactionInsertRow[] = selectedData.map((row) => {
    const rawAmount = Math.abs(Number(row.amount ?? 0));
    const finalAmount = row.amount && row.amount > 0 ? row.amount : -rawAmount;
    const memoMeta = buildUploadMeta(row);

    return {
      tx_date: row.tx_date || null,
      description: row.description || null,
      type: `지출/${row.category || "기타"}`,
      amount: finalAmount,
      balance: null,
      user_type: normalizeUserTag(excelUserType),
      account_type: normalizeUploadAccountType(row.cardName, fileName),
      source_file: fileName || null,
      memo: memoMeta.memo,
      is_fixed: memoMeta.is_fixed,
      installment_total: memoMeta.installment_total,
      installment_current: memoMeta.installment_current,
      installment_key: memoMeta.installment_key,
    };
  });

    try {
      setIsSaving(true);

      const { uniqueRows, duplicateCount } = await filterDuplicateTransactions(payload);

      if (uniqueRows.length === 0) {
        setError(
          duplicateCount > 0
            ? `모든 행이 이미 저장된 내역입니다. (중복 ${duplicateCount}건)`
            : "저장할 데이터가 없습니다."
        );
        return;
      }

      const { error: insertError } = await supabase.from("transactions").insert(uniqueRows);

      if (insertError) {
        setError(`저장 실패: ${insertError.message}`);
        return;
      }

      setSuccess(
        duplicateCount > 0
          ? `${uniqueRows.length}건 저장 완료 · 중복 ${duplicateCount}건 제외`
          : `${uniqueRows.length}건 저장 완료`
      );
      setDraftRows((prev) => prev.map((row) => ({ ...row, selected: false })));
    } catch (err) {
      const message = err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

const addManualRow = () => {
  setManualForm({
    id: makeId("manual"),
    tx_date: "",
    description: "",
    flowType: "지출",
    category: categories[0] ?? "기타",
    amount: "",
    userType: users[0] ?? "기린",
    accountType: accounts[0] ?? "현금",
  });
  setShowManualAddModal(true);
};

const updateManualForm = (key: keyof ManualDraftRow, value: string) => {
  setManualForm((prev) => ({ ...prev, [key]: value }));
};

const appendManualForm = () => {
  if (!manualForm.tx_date || !manualForm.description.trim() || parseNumber(manualForm.amount) === null) {
    setError("날짜, 내용, 금액을 입력해주세요.");
    return;
  }

  setManualRows((prev) => [...prev, { ...manualForm, id: makeId("manual") }]);
  setShowManualAddModal(false);
};

  const removeManualRow = (id: string) => {
    setManualRows((prev) => prev.filter((row) => row.id !== id));
  };

  const updateManualRow = (
    id: string,
    key: keyof ManualDraftRow,
    value: string
  ) => {
    setManualRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [key]: value } : row))
    );
  };

  const handleManualSave = async () => {
    setError("");
    setSuccess("");

    const validRows = manualRows.filter(
      (row) => row.tx_date && row.description.trim() && parseNumber(row.amount) !== null
    );

    if (validRows.length === 0) {
      setError("저장할 수동 입력 행이 없습니다.");
      return;
    }

    const payload = validRows.map((row) => {
      const rawAmount = Math.abs(Number(parseNumber(row.amount) ?? 0));
      const finalAmount = row.flowType === "지출" ? -rawAmount : rawAmount;

      return {
        tx_date: fromIsoDate(row.tx_date),
        description: row.description.trim(),
        type: `${row.flowType}/${row.category || "기타"}`,
        amount: finalAmount,
        balance: null,
        user_type: normalizeUserTag(row.userType) || "미지정",
        account_type: normalizeAccountLabel(row.accountType) || "미지정",
        source_file: "manual_input",
      };
    });

    try {
      setIsSaving(true);
      const { error: insertError } = await supabase.from("transactions").insert(payload);

      if (insertError) {
        setError(`저장 실패: ${insertError.message}`);
        return;
      }

      setSuccess(`${payload.length}건 저장 완료`);
      setManualRows([
        {
          id: makeId("manual"),
          tx_date: "",
          description: "",
          flowType: "지출",
          category: categories[0] ?? "기타",
          amount: "",
          userType: users[0] ?? "기린",
          accountType: accounts[0] ?? "현금",
        },
      ]);
    } catch {
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const addOption = (group: OptionGroupKey) => {
    const rawValue = optionDraft[group].trim();
    const value =
      group === "users"
        ? normalizeUserTag(rawValue) || rawValue
        : group === "accounts"
          ? normalizeAccountLabel(rawValue) || rawValue
          : rawValue;
    if (!value) return;

    if (group === "users") {
      if (users.includes(value)) return;
      const next = [...users, value];
      setUsers(next);
      saveList("users", next);
    }

    if (group === "accounts") {
      if (accounts.includes(value)) return;
      const next = [...accounts, value];
      setAccounts(next);
      saveList("accounts", next);
    }

    if (group === "categories") {
      if (categories.includes(value)) return;
      const next = [...categories, value];
      setCategories(next);
      saveList("categories", next);
    }

    setOptionDraft((prev) => ({ ...prev, [group]: "" }));
  };

  const removeOption = (group: OptionGroupKey, value: string) => {
    if (group === "users") {
      const next = users.filter((v) => v !== value);
      if (next.length === 0) return;
      setUsers(next);
      saveList("users", next);
    }

    if (group === "accounts") {
      const next = accounts.filter((v) => v !== value);
      if (next.length === 0) return;
      setAccounts(next);
      saveList("accounts", next);
    }

    if (group === "categories") {
      const next = categories.filter((v) => v !== value);
      if (next.length === 0) return;
      setCategories(next);
      saveList("categories", next);
    }
    const nextIcons: OptionIconMap = {
      ...optionIcons,
      [group]: {
        ...(optionIcons[group] ?? {}),
      },
    };

    delete nextIcons[group]?.[value];

    setOptionIcons(nextIcons);
    saveOptionIcons(nextIcons);
  };

  
  const updateOptionIcon = (group: OptionGroupKey, value: string, dataUrl: string) => {
    const next: OptionIconMap = {
      ...optionIcons,
      [group]: {
        ...(optionIcons[group] ?? {}),
        [value]: dataUrl,
      },
    };

    setOptionIcons(next);
    saveOptionIcons(next);
  };
  const presetLabel =
    detectedPreset === "kbcard"
      ? "국민카드 프리셋"
      : detectedPreset === "shinhan"
        ? "신한카드 프리셋"
        : detectedPreset === "nhcard"
          ? "농협카드 프리셋"
          : "범용 모드";

  return (
    <div className="min-h-screen bg-[#f6fbfb]">
      <section className="bg-[linear-gradient(135deg,#3ec7c1_0%,#2fb3ad_100%)] text-white">
        <div className="mx-auto max-w-6xl px-4 py-2 sm:px-6 sm:py-8">
          <div className="py-2">
            <div className="hidden items-center gap-1.5 rounded-full border border-white/35 bg-white/35 px-2.5 py-1 text-[10px] font-bold text-[#063f3a] sm:inline-flex">
              <span>수입·지출 등록</span>
              <span className="rounded-full bg-white/55 px-1.5 py-0.5 text-[9px] font-black">
                UPLOAD
              </span>
            </div>

            <div className="mt-3">
              <h1 className="text-[25px] font-black tracking-[-0.055em] text-white sm:text-[38px]">
                기린 · 짱구 일괄등록
              </h1>

              <p className="mt-2 hidden text-[10px] font-medium leading-relaxed text-white/80 sm:block sm:text-[14px]">
                수동 입력과 엑셀 업로드로 카드·계좌 거래를 빠르게 정리해요.
              </p>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-3 sm:mt-6 sm:justify-start">
                <div className="flex items-center gap-2 rounded-full bg-white/18 p-1.5 backdrop-blur">
                  <button
                    type="button"
                    onClick={() => setTab("manual")}
                    className={`rounded-full px-5 py-2.5 text-sm font-black transition ${
                      tab === "manual"
                        ? "bg-white text-[#0f766e] shadow-sm"
                        : "text-white/85 hover:bg-white/15"
                    }`}
                  >
                    수동 등록
                  </button>

                  <button
                    type="button"
                    onClick={() => setTab("excel")}
                    className={`rounded-full px-5 py-2.5 text-sm font-black transition ${
                      tab === "excel"
                        ? "bg-white text-[#0f766e] shadow-sm"
                        : "text-white/85 hover:bg-white/15"
                    }`}
                  >
                    엑셀 업로드
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className={`px-4 py-5 transition-all duration-300 sm:px-6 sm:py-8 ${showRawModal ? "lg:mr-[46vw]" : ""}`}>
        <div className="mx-auto max-w-6xl space-y-6">
          {error ? (
            <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}

          {tab === "manual" ? (
            <>
              <div className="hidden gap-4 sm:grid md:grid-cols-4">
                <div className="app-kpi">
                  <div className="app-kpi-label">입력 행</div>
                  <div className="app-kpi-value">{manualRows.length}건</div>
                </div>
                <div className="app-kpi">
                  <div className="app-kpi-label">총합</div>
                  <div className="app-kpi-value">{manualTotal.toLocaleString()}원</div>
                </div>
                <div className="app-kpi">
                  <div className="app-kpi-label">사용자 항목</div>
                  <div className="app-kpi-value">{users.length}개</div>
                </div>
                <div className="app-kpi">
                  <div className="app-kpi-label">카테고리 항목</div>
                  <div className="app-kpi-value">{categories.length}개</div>
                </div>
              </div>

<div className="app-card rounded-[30px] p-5">
  <div className="mb-4 flex items-center justify-between gap-3">
    <div>
      <h2 className="app-section-title">수동 등록</h2>
      <p className="app-section-sub hidden sm:block">
        현금 사용분이나 자동 파싱되지 않는 내역을 직접 추가해요.
      </p>
    </div>

    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        onClick={addManualRow}
        className="rounded-[16px] bg-[#21bdb7] px-4 py-2.5 text-sm font-black text-white shadow-sm"
      >
        <span className="sm:hidden">1건 입력</span><span className="hidden sm:inline">행 추가</span>
      </button>

      <button
        type="button"
        onClick={handleManualSave}
        disabled={isSaving}
        className="rounded-[16px] bg-slate-800 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
      >
        저장
      </button>
    </div>
  </div>

  <div className="sm:hidden">
    {manualRows.length > 0 ? (
      <div className="space-y-2">
        {manualRows.map((row) => {
          const amount = Math.abs(Number(parseNumber(row.amount) ?? 0));
          const signed = row.flowType === "지출" ? -amount : amount;
          return (
            <div key={`mobile-manual-${row.id}`} className="rounded-[20px] border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-black text-slate-800">{row.description || "-"}</div>
                  <div className="mt-1 text-[11px] font-bold text-slate-400">{row.tx_date ? fromIsoDate(row.tx_date) : "-"} · {row.category} · {row.userType}</div>
                </div>
                <div className={`shrink-0 text-[14px] font-black ${signed < 0 ? "text-rose-500" : "text-sky-500"}`}>{signed < 0 ? "-" : "+"}{amount.toLocaleString()}원</div>
              </div>
              <button type="button" onClick={() => removeManualRow(row.id)} className="mt-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-rose-500 ring-1 ring-rose-100">삭제</button>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm font-bold text-slate-400">
        1건 입력 버튼으로 내역을 추가해주세요.
      </div>
    )}
  </div>

  <div className="hidden overflow-hidden rounded-[26px] border border-slate-100 bg-white sm:block">
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            <th className="w-[120px] px-4 py-4 text-center font-black text-slate-500">날짜</th>
            <th className="px-4 py-4 text-left font-black text-slate-500">내용</th>
            <th className="w-[130px] px-4 py-4 text-center font-black text-slate-500">분류</th>
            <th className="w-[120px] px-4 py-4 text-center font-black text-slate-500">사용자</th>
            <th className="w-[140px] px-4 py-4 text-center font-black text-slate-500">계정</th>
            <th className="w-[150px] px-4 py-4 text-right font-black text-slate-500">금액</th>
            <th className="w-[80px] px-4 py-4 text-center font-black text-slate-500">삭제</th>
          </tr>
        </thead>

        <tbody>
          {manualRows.length > 0 ? (
            manualRows.map((row) => {
              const amount = Math.abs(Number(parseNumber(row.amount) ?? 0));
              const signed = row.flowType === "지출" ? -amount : amount;

              return (
                <tr key={row.id} className="border-t border-slate-100 transition hover:bg-[#f8fffe]">
                  <td className="px-4 py-4 text-center font-bold text-slate-500">
                    {row.tx_date ? fromIsoDate(row.tx_date) : "-"}
                  </td>

                  <td className="px-4 py-4">
                    <div className="font-black text-slate-800">{row.description || "-"}</div>
                    <div className="mt-1 text-xs font-bold text-slate-300">
                      수동 입력 예정
                    </div>
                  </td>

                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex overflow-hidden rounded-full bg-slate-100 text-[11px] font-black">
                      <span className={row.flowType === "지출" ? "bg-rose-100 px-2.5 py-1 text-rose-500" : "bg-sky-100 px-2.5 py-1 text-sky-600"}>
                        {row.flowType}
                      </span>
                      <span className="border-l border-white px-2.5 py-1 text-slate-500">
                        {row.category}
                      </span>
                    </span>
                  </td>

                  <td className="px-4 py-4 text-center font-bold text-slate-500">{row.userType}</td>
                  <td className="px-4 py-4 text-center font-bold text-slate-500">{row.accountType}</td>

                  <td className={`px-4 py-4 text-right font-black tabular-nums ${
                    signed < 0 ? "text-rose-500" : "text-sky-500"
                  }`}>
                    {signed < 0 ? "-" : "+"}{amount.toLocaleString()}원
                  </td>

                  <td className="px-4 py-4 text-center">
                    <button
                      type="button"
                      onClick={() => removeManualRow(row.id)}
                      className="rounded-[14px] bg-rose-50 px-3 py-2 text-sm font-black text-rose-500 hover:bg-rose-100"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={7} className="py-14 text-center text-sm font-bold text-slate-400">
                행 추가 버튼으로 수동 등록할 내역을 먼저 추가해주세요.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
</div>
            </>
          ) : (
            <>
<div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
  <label
    onDragOver={(e) => {
      e.preventDefault();
      setIsDraggingFile(true);
    }}
    onDragLeave={() => setIsDraggingFile(false)}
    onDrop={async (e) => {
      e.preventDefault();
      setIsDraggingFile(false);
      const file = e.dataTransfer.files?.[0];
      if (file) await handlePickedFile(file);
    }}
    className={`group relative flex min-h-[190px] cursor-pointer flex-col justify-between overflow-hidden rounded-[34px] border p-6 shadow-sm transition ${
      isDraggingFile
        ? "border-[#21bdb7] bg-[#effffe] shadow-[0_22px_60px_rgba(33,189,183,0.18)]"
        : "border-[#d8f3f1] bg-white hover:border-[#21bdb7] hover:bg-[#fbfffe]"
    }`}
  >
    <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} className="hidden" />

    <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#effffe]" />
    <div className="absolute -bottom-14 left-10 h-28 w-28 rounded-full bg-[#fff7d6]" />

    <div className="relative flex items-start gap-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[24px] bg-[#21bdb7] text-2xl text-white shadow-[0_14px_30px_rgba(33,189,183,0.22)]">
        📄
      </div>

      <div className="min-w-0">
        <div className="text-sm font-black text-[#0f766e]">Excel Upload</div>
        <div className="mt-1 truncate text-2xl font-black tracking-[-0.04em] text-slate-800">
          {fileName || "엑셀 파일을 올려주세요"}
        </div>
        <div className="mt-2 text-sm font-medium leading-6 text-slate-400">
          클릭하거나 파일을 끌어다 놓으면 자동으로 정리하고 미리보기를 생성해요.
        </div>
      </div>
    </div>

    <div className="relative mt-6 flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-[#21bdb7] px-5 py-2.5 text-sm font-black text-white shadow-sm">
        파일 선택
      </span>
      <span className="rounded-full border border-slate-100 bg-white px-4 py-2 text-xs font-black text-slate-400">
        CSV · XLSX · XLS
      </span>
      {fileName ? (
        <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-500">
          불러옴 완료
        </span>
      ) : null}
    </div>
  </label>

  <div className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <div className="text-lg font-black tracking-[-0.03em] text-slate-800">업로드 설정</div>
        <div className="mt-1 text-sm font-medium text-slate-400">
          사용자와 매핑 설정을 확인한 뒤 선택 저장해요.
        </div>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowSettingsMenu((prev) => !prev)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-100 bg-slate-50 text-lg transition hover:bg-[#effffe]"
        >
          ⚙️
        </button>

        {showSettingsMenu ? (
          <div className="absolute right-0 top-12 z-30 w-44 rounded-[20px] border border-slate-100 bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.14)]">
            <button
              type="button"
              onClick={() => {
                setShowSettingsMenu(false);
                setShowMappingModal(true);
              }}
              className="w-full rounded-[14px] px-3 py-2 text-left text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              매핑 설정
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSettingsMenu(false);
                setShowOptionsModal(true);
              }}
              className="w-full rounded-[14px] px-3 py-2 text-left text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              분류 관리
            </button>
          </div>
        ) : null}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2">
      {["기린", "짱구"].map((user) => (
        <button
          key={user}
          type="button"
          onClick={() => setExcelUserType(user)}
          className={`flex h-14 items-center justify-center gap-2 rounded-[20px] text-sm font-black transition ${
            excelUserType === user
              ? "bg-[#21bdb7] text-white shadow-[0_12px_24px_rgba(33,189,183,0.20)]"
              : "border border-slate-100 bg-slate-50 text-slate-500 hover:bg-[#effffe]"
          }`}
        >
          <img
            src={user === "기린" ? "/icons/girin.png" : "/icons/zzangu.png"}
            className="h-6 w-6 object-contain"
          />
          {user}
        </button>
      ))}
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => setShowRawModal(true)}
        disabled={headers.length === 0}
        className="h-12 rounded-[18px] border border-slate-100 bg-slate-50 px-4 text-sm font-black text-slate-500 transition hover:bg-white disabled:opacity-50"
      >
        원본 보기
      </button>

      <button
        onClick={handleExcelSave}
        disabled={isSaving || draftRows.length === 0}
        className="h-12 rounded-[18px] bg-[#21bdb7] px-4 text-sm font-black text-white shadow-[0_10px_20px_rgba(33,189,183,0.20)] transition hover:bg-[#18aaa4] disabled:opacity-50"
      >
        {isSaving ? "저장 중..." : "선택 저장"}
      </button>
    </div>

    <div className="mt-4 rounded-[22px] bg-[#effffe] px-4 py-3">
      <div className="text-xs font-black text-[#0f766e]">현재 프리셋</div>
      <div className="mt-1 truncate text-sm font-black text-slate-700">{presetLabel}</div>
    </div>
  </div>
</div>

<div className="app-card rounded-[30px] p-5">
  <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
    <div>
      <h2 className="app-section-title">미리보기</h2>
      <p className="app-section-sub">행 클릭으로 선택, 더블클릭으로 개별 수정해요.</p>
    </div>

    <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
      <div className="rounded-[18px] bg-slate-50 px-4 py-3">
        <div className="text-[11px] font-black text-slate-400">정리</div>
        <div className="mt-1 text-lg font-black text-slate-800">{draftRows.length}건</div>
      </div>
      <div className="rounded-[18px] bg-[#effffe] px-4 py-3">
        <div className="text-[11px] font-black text-[#0f766e]/70">선택</div>
        <div className="mt-1 text-lg font-black text-[#0f766e]">{selectedCount}건</div>
      </div>
      <div className="rounded-[18px] bg-rose-50 px-4 py-3">
        <div className="text-[11px] font-black text-rose-400">선택 지출</div>
        <div className="mt-1 truncate text-lg font-black text-rose-500">
          {totalExpense.toLocaleString()}원
        </div>
      </div>
    </div>
  </div>

  <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[24px] bg-slate-50 p-3">
    <button
      onClick={toggleAllRows}
      className="rounded-[16px] bg-white px-4 py-2.5 text-sm font-black text-slate-600 shadow-sm transition hover:bg-[#effffe]"
    >
      전체 선택/해제
    </button>

    <select
      value={bulkCategory}
      onChange={(e) => setBulkCategory(e.target.value)}
      className="app-input-soft h-11 w-[160px] rounded-[16px] px-3"
    >
      {categories.map((category) => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
    </select>

    <button
      onClick={applyBulkCategory}
      className="rounded-[16px] bg-[#effffe] px-4 py-2.5 text-sm font-black text-[#0f766e] transition hover:bg-[#d8f3f1]"
    >
      카테고리 적용
    </button>

    <button
      onClick={excludeSelectedRows}
      className="rounded-[16px] bg-rose-50 px-4 py-2.5 text-sm font-black text-rose-500 transition hover:bg-rose-100"
    >
      선택 제외
    </button>
  </div>

  <div className="overflow-hidden rounded-[26px] border border-slate-100 bg-white">
    <div className="max-h-[560px] overflow-auto">
      <table className="min-w-[980px] w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            <th className="w-[64px] px-3 py-4 text-center font-black text-slate-500">선택</th>
            <th className="w-[110px] px-3 py-4 text-center font-black text-slate-500">날짜</th>
            <th className="w-[130px] px-3 py-4 text-center font-black text-slate-500">카테고리</th>
            <th className="min-w-[320px] px-3 py-4 text-left font-black text-slate-500">내용</th>
            <th className="w-[150px] px-3 py-4 text-center font-black text-slate-500">카드</th>
            <th className="w-[150px] px-3 py-4 text-right font-black text-slate-500">금액</th>
          </tr>
        </thead>

        <tbody>
          {previewRows.length > 0 ? (
            previewRows.map((row, rowIdx) => (
              <tr
                key={row.id}
                onClick={() => toggleRowSelection(row.id)}
                onDoubleClick={() => openRowEditor(row)}
                onMouseEnter={() => setHoveredPreviewIndex(rowIdx)}
                onMouseLeave={() => setHoveredPreviewIndex(null)}
                className={`border-t border-slate-100 transition hover:bg-[#f8fffe] ${
                  row.selected ? "bg-[#f1fffb]" : "bg-white"
                }`}
              >
                <td className="px-3 py-4 text-center align-middle">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={() => toggleRowSelection(row.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td className="px-3 py-4 text-center align-middle font-bold text-slate-600">
                  {row.tx_date}
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <span className={getCategoryBadgeClass(row.category)}>
                    {getDefaultOptionIcon("categories", row.category)} {row.category}
                  </span>
                </td>
                <td className="px-3 py-4 align-middle font-medium text-slate-700">
                  <span className="block whitespace-normal break-words leading-6">
                    {row.description}
                  </span>
                </td>
                <td className="px-3 py-4 text-center align-middle font-bold text-slate-500">
                  <span className="block whitespace-normal break-words">{row.cardName}</span>
                </td>
                <td className="px-3 py-4 text-right align-middle font-black text-rose-500 tabular-nums">
                  -{Math.abs(Number(row.amount ?? 0)).toLocaleString("ko-KR")}원
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="py-16 text-center text-slate-400">
                업로드된 데이터가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
</div>

            </>
          )}
        </div>
      </main>

{showRawModal ? (
  <div className="fixed right-0 top-0 z-[99999] flex h-full w-[42vw] min-w-[520px] flex-col bg-white shadow-[-24px_0_70px_rgba(15,23,42,0.18)]">
    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
      <div>
        <div className="text-lg font-black tracking-[-0.03em] text-slate-800">
          원본 데이터
        </div>
        <div className="mt-1 text-xs font-medium text-slate-400">
          미리보기와 나란히 비교해요
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowRawModal(false)}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
      >
        ✕
      </button>
    </div>

    <div className="flex-1 overflow-auto p-4">
      <table className="min-w-[1400px] border-collapse bg-white text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            {headers.map((header, idx) => (
              <th
                key={`${header}-${idx}`}
                className="min-w-[220px] border-b border-slate-200 px-4 py-3 text-left font-black text-slate-600"
              >
                <div className="whitespace-normal break-words">{header}</div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
        {rawRows
          .filter((row) => {
            const joined = row.join(" ").trim();
            if (!joined) return false;
            if (joined.includes("합계")) return false;
            if (joined.includes("소계")) return false;
            if (joined.includes("총금액")) return false;
            return row.some((cell) => isLikelyDate(cell));
          })
          .slice(0, 200)
          .map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className={`transition ${
                hoveredPreviewIndex === rowIdx
                  ? "bg-[#dffaf6]"
                  : rowIdx % 2 === 0
                    ? "bg-white"
                    : "bg-slate-50"
              }`}
            >
              {headers.map((_, colIdx) => (
                <td
                  key={`${rowIdx}-${colIdx}`}
                  className="min-w-[220px] border-b border-slate-100 px-4 py-3 align-top text-slate-600"
                >
                  <div className="whitespace-normal break-words">
                    {row[colIdx] ?? ""}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
) : null}

      {showMappingModal ? (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/45 px-6 py-8 backdrop-blur-sm"
          onMouseDown={() => setShowMappingModal(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[34px] bg-white shadow-[0_32px_90px_rgba(15,23,42,0.28)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="relative border-b border-slate-100 bg-[linear-gradient(135deg,#f8fffe_0%,#effffe_100%)] px-5 py-5 sm:px-7 sm:py-6">
              <button
                type="button"
                onClick={() => setShowMappingModal(false)}
                className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-black text-slate-400 shadow-sm transition hover:bg-slate-50 hover:text-slate-600"
              >
                ×
              </button>

              <div className="pr-12">
                <div className="inline-flex rounded-full bg-[#d8f3f1] px-3 py-1 text-[11px] font-black text-[#0f766e]">
                  MAPPING SETTING
                </div>

                <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-800">
                  매핑 설정
                </h2>

                <p className="mt-1 text-sm font-medium text-slate-400">
                  엑셀 헤더 기준으로 컬럼을 연결해요. 저장하면 다음 업로드에도 자동 적용돼요.
                </p>
              </div>
            </div>



<div className="grid gap-4 px-7 py-6 md:grid-cols-2">
  {(Object.keys(MAPPING_LABELS) as MappingKey[]).map((key) => (
    <div key={key}>
      <label className="mb-2 block text-sm font-bold text-slate-600">
        {MAPPING_LABELS[key]}
      </label>

      <select
        value={mapping[key]}
        onChange={(e) => handleMappingChange(key, e.target.value)}
        className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
      >
        <option value="">선택 안 함</option>
        {headers.map((header, idx) => (
          <option key={`${key}-${header}-${idx}`} value={header}>
            {header}
          </option>
        ))}
      </select>
    </div>
  ))}
</div>

            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-7 sm:py-5">
              <button
                type="button"
                onClick={() => setShowMappingModal(false)}
                className="rounded-[18px] border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-500 transition hover:bg-slate-50"
              >
                취소
              </button>

              <button
                type="button"
                onClick={saveCurrentMappingPreset}
                className="rounded-[18px] bg-[#21bdb7] px-6 py-3 text-sm font-black text-white shadow-[0_12px_26px_rgba(33,189,183,0.24)] transition hover:bg-[#18aaa4]"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      ) : null}
{showManualAddModal ? (
  <div
    className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/45 px-6 py-8 backdrop-blur-sm"
    onMouseDown={() => setShowManualAddModal(false)}
  >
    <div
      className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[30px] bg-white shadow-[0_32px_90px_rgba(15,23,42,0.28)] sm:rounded-[34px]"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="relative border-b border-slate-100 bg-[linear-gradient(135deg,#f8fffe_0%,#effffe_100%)] px-7 py-6">
        <button
          type="button"
          onClick={() => setShowManualAddModal(false)}
          className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-black text-slate-400 shadow-sm hover:text-slate-600"
        >
          ×
        </button>

        <div className="inline-flex rounded-full bg-[#d8f3f1] px-3 py-1 text-[11px] font-black text-[#0f766e]">
          MANUAL ADD
        </div>

        <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-800">
          수동 거래 추가
        </h2>

        <p className="mt-1 text-sm font-medium text-slate-400">
          현금 사용분이나 자동 파싱되지 않는 내역을 직접 등록해요.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2 sm:px-7 sm:py-6">
        <Field label="날짜">
          <input
            type="date"
            value={manualForm.tx_date}
            onChange={(e) => updateManualForm("tx_date", e.target.value)}
            className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
          />
        </Field>

        <Field label="지출/수입">
          <div className="grid grid-cols-2 gap-2">
            {["지출", "수입"].map((flow) => (
              <button
                key={flow}
                type="button"
                onClick={() => updateManualForm("flowType", flow)}
                className={`h-12 rounded-[18px] text-sm font-black transition ${
                  manualForm.flowType === flow
                    ? "bg-[#21bdb7] text-white shadow-sm"
                    : "border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                }`}
              >
                {flow}
              </button>
            ))}
          </div>
        </Field>

        <Field label="내용" className="sm:col-span-2">
          <input
            type="text"
            value={manualForm.description}
            onChange={(e) => updateManualForm("description", e.target.value)}
            placeholder="예: 현금 결제 / 경조사 / 간식"
            className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
          />
        </Field>

        <Field label="카테고리">
          <select
            value={manualForm.category}
            onChange={(e) => updateManualForm("category", e.target.value)}
            className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </Field>

        <Field label="사용자">
          <select
            value={manualForm.userType}
            onChange={(e) => updateManualForm("userType", e.target.value)}
            className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
          >
            {users.map((user) => (
              <option key={user} value={user}>
                {user}
              </option>
            ))}
          </select>
        </Field>

        <Field label="계정">
          <select
            value={manualForm.accountType}
            onChange={(e) => updateManualForm("accountType", e.target.value)}
            className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
          >
            {accounts.map((account) => (
              <option key={account} value={account}>
                {account}
              </option>
            ))}
          </select>
        </Field>

        <Field label="금액">
          <input
            type="text"
            value={manualForm.amount}
            onChange={(e) => updateManualForm("amount", e.target.value)}
            placeholder="0"
            className={`app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 text-right font-black tabular-nums ${
              manualForm.flowType === "지출" ? "text-rose-500" : "text-sky-500"
            }`}
          />
        </Field>
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/70 px-7 py-5">
        <button
          type="button"
          onClick={() => setShowManualAddModal(false)}
          className="rounded-[18px] border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-500 hover:bg-slate-50"
        >
          취소
        </button>

        <button
          type="button"
          onClick={appendManualForm}
          className="rounded-[18px] bg-[#21bdb7] px-6 py-3 text-sm font-black text-white shadow-[0_12px_26px_rgba(33,189,183,0.24)] hover:bg-[#18aaa4]"
        >
          미리보기에 추가
        </button>
      </div>
    </div>
  </div>
) : null}

{editingRow ? (() => {
  const editAmount = editingRow.flowType === "지출"
    ? -Math.abs(Number(parseNumber(editingRow.amount) ?? 0))
    : Math.abs(Number(parseNumber(editingRow.amount) ?? 0));

  const setEditFlow = (flow: "지출" | "수입") => {
    setEditingRow((prev) => (prev ? { ...prev, flowType: flow } : prev));
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/45 px-6 py-8 backdrop-blur-sm"
      onMouseDown={() => setEditingRow(null)}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[34px] bg-white shadow-[0_32px_90px_rgba(15,23,42,0.28)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative border-b border-slate-100 bg-[linear-gradient(135deg,#f8fffe_0%,#effffe_100%)] px-7 py-6">
          <button
            type="button"
            onClick={() => setEditingRow(null)}
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-black text-slate-400 shadow-sm transition hover:bg-slate-50 hover:text-slate-600"
          >
            ×
          </button>

          <div className="pr-12">
            <div className="inline-flex rounded-full bg-[#d8f3f1] px-3 py-1 text-[11px] font-black text-[#0f766e]">
              TRANSACTION EDIT
            </div>

            <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-800">
              거래내역 수정
            </h2>

            <p className="mt-1 text-sm font-medium text-slate-400">
              카드·분류·금액을 확인하고 필요한 값만 수정해요.
            </p>
          </div>
        </div>

        <div className="px-7 py-6">
          <div className="mb-5 rounded-[26px] border border-[#d8f3f1] bg-[#f8fffe] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="truncate text-lg font-black text-slate-800">
                  {editingRow.description || "거래명 없음"}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[#0f766e]">
                    {editingRow.flowType}/{editingRow.category || "기타"}
                  </span>

                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-400">
                    {editingRow.tx_date || "날짜 없음"}
                  </span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div
                  className={`text-xl font-black tabular-nums ${
                    editAmount < 0 ? "text-rose-400" : "text-sky-500"
                  }`}
                >
                  {editAmount > 0
                    ? `+${editAmount.toLocaleString()}원`
                    : editAmount < 0
                      ? `-${Math.abs(editAmount).toLocaleString()}원`
                      : "0원"}
                </div>

                <div className="mt-1 text-[10px] font-bold text-slate-300">
                  현재 금액
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Field label="날짜">
              <input
                type="date"
                value={editingRow.tx_date}
                onChange={(e) =>
                  setEditingRow((prev) => (prev ? { ...prev, tx_date: e.target.value } : prev))
                }
                className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
              />
            </Field>

            <Field label="지출/수입">
              <div className="grid grid-cols-2 gap-2">
                {["지출", "수입"].map((flow) => (
                  <button
                    key={flow}
                    type="button"
                    onClick={() => setEditFlow(flow as "지출" | "수입")}
                    className={`h-12 rounded-[18px] text-sm font-black transition ${
                      editingRow.flowType === flow
                        ? "bg-[#21bdb7] text-white shadow-sm"
                        : "border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {flow}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="상세분류">
              <select
                value={editingRow.category}
                onChange={(e) =>
                  setEditingRow((prev) => (prev ? { ...prev, category: e.target.value } : prev))
                }
                className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
              >
                <option value="">선택</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="사용자">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "기린", icon: "/icons/girin.png" },
                  { key: "짱구", icon: "/icons/zzangu.png" },
                ].map((user) => (
                  <button
                    key={user.key}
                    type="button"
                    onClick={() =>
                      setEditingRow((prev) => (prev ? { ...prev, userType: user.key } : prev))
                    }
                    className={`flex h-12 items-center justify-center gap-2 rounded-[18px] text-sm font-black transition ${
                      editingRow.userType === user.key
                        ? "bg-[#21bdb7] text-white shadow-sm"
                        : "border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    <img src={user.icon} className="h-5 w-5 object-contain" />
                    {user.key}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="내용" className="col-span-2">
              <input
                type="text"
                value={editingRow.description}
                onChange={(e) =>
                  setEditingRow((prev) => (prev ? { ...prev, description: e.target.value } : prev))
                }
                className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
              />
            </Field>

            <Field label="금액">
              <input
                type="text"
                value={Number(editingRow.amount || 0).toLocaleString()}
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, "");
                  if (!/^\d*$/.test(raw)) return;
                  setEditingRow((prev) => (prev ? { ...prev, amount: raw } : prev));
                }}
                className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-black tabular-nums text-rose-400"
                placeholder="19000"
              />
            </Field>

            <Field label="결제수단">
              <div className="relative">
                <select
                  value={editingRow.cardName}
                  onChange={(e) =>
                    setEditingRow((prev) => (prev ? { ...prev, cardName: e.target.value } : prev))
                  }
                  style={{ paddingLeft: "48px", paddingRight: "40px" }}
                  className="app-input h-12 w-full appearance-none rounded-[18px] border-slate-200 bg-slate-50 font-bold text-slate-700"
                >
                  <option value="">선택</option>
                  {accounts.map((account) => (
                    <option key={account} value={account}>
                      {account}
                    </option>
                  ))}
                </select>

                <div className="pointer-events-none absolute left-4 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center">
                  <span className="text-sm">💳</span>
                </div>

                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  ▼
                </div>
              </div>
            </Field>
            <Field label="고정비 / 할부" className="col-span-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setEditingRow((prev) => {
                      if (!prev) return prev;
                      const memo = prev.memo.includes("고정") ? prev.memo.replace(/고정비|고정|정기|구독/g, "").trim() : `${prev.memo} 고정비`.trim();
                      return { ...prev, memo };
                    })
                  }
                  className={`h-12 rounded-[18px] text-sm font-black transition ${
                    /고정|정기|구독/.test(editingRow.memo)
                      ? "bg-[#21bdb7] text-white shadow-sm"
                      : "border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  고정비
                </button>

                <select
                  value={editingRow.memo.match(/(\d+)\s*개월/)?.[1] ?? ""}
                  onChange={(e) =>
                    setEditingRow((prev) => {
                      if (!prev) return prev;
                      const cleaned = prev.memo.replace(/\d+\s*개월|\d+\s*\/\s*\d+/g, "").trim();
                      const value = e.target.value ? `${e.target.value}개월` : "";
                      return { ...prev, memo: `${cleaned} ${value}`.trim() };
                    })
                  }
                  className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
                >
                  <option value="">일시불</option>
                  {[2, 3, 4, 5, 6, 10, 12, 18, 24].map((month) => (
                    <option key={month} value={month}>
                      {month}개월 할부
                    </option>
                  ))}
                </select>
              </div>
            </Field>

            <Field label="고정비 / 할부" className="col-span-2">
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setEditingRow((prev) => (prev ? { ...prev, isFixed: !prev.isFixed } : prev))
                  }
                  className={`h-12 rounded-[18px] text-sm font-black transition ${
                    editingRow.isFixed
                      ? "bg-[#21bdb7] text-white shadow-sm"
                      : "border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  고정비
                </button>

                <select
                  value={editingRow.installmentTotal}
                  onChange={(e) =>
                    setEditingRow((prev) =>
                      prev
                        ? {
                            ...prev,
                            installmentTotal: e.target.value,
                            installmentCurrent: e.target.value ? prev.installmentCurrent || "1" : "",
                          }
                        : prev
                    )
                  }
                  className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
                >
                  <option value="">일시불</option>
                  {[2, 3, 4, 5, 6, 10, 12, 18, 24].map((m) => (
                    <option key={m} value={m}>{m}개월</option>
                  ))}
                </select>

                <select
                  value={editingRow.installmentCurrent}
                  disabled={!editingRow.installmentTotal}
                  onChange={(e) =>
                    setEditingRow((prev) => (prev ? { ...prev, installmentCurrent: e.target.value } : prev))
                  }
                  className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold disabled:opacity-50"
                >
                  <option value="">회차</option>
                  {Array.from({ length: Number(editingRow.installmentTotal || 0) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}/{editingRow.installmentTotal}</option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="비고" className="col-span-2">
              <input
                type="text"
                value={editingRow.memo}
                onChange={(e) =>
                  setEditingRow((prev) => (prev ? { ...prev, memo: e.target.value } : prev))
                }
                className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
              />
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/70 px-7 py-5">
          <button
            type="button"
            onClick={saveRowEditor}
            className="rounded-[18px] bg-[#21bdb7] px-6 py-3 text-sm font-black text-white shadow-[0_12px_26px_rgba(33,189,183,0.24)] transition hover:bg-[#18aaa4]"
          >
            저장
          </button>

          <button
            type="button"
            onClick={() => setEditingRow(null)}
            className="rounded-[18px] border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-500 transition hover:bg-slate-50"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
})() : null}

      {showOptionsModal ? (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowOptionsModal(false)}
        >
          <div
            className="w-full max-w-4xl rounded-[30px] bg-white shadow-[0_30px_80px_rgba(0,0,0,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <div className="text-xl font-black text-slate-800">분류 관리</div>
                <div className="mt-1 text-sm text-slate-400">
                  사용자 / 카드 / 카테고리를 자유롭게 추가·삭제해요
                </div>
              </div>
              <button
                onClick={() => setShowOptionsModal(false)}
                className="rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-500 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-6 px-6 py-6 md:grid-cols-3">
              <OptionManager
                group="users"
                title="사용자"
                items={users}
                value={optionDraft.users}
                icons={optionIcons.users ?? {}}
                onIconChange={updateOptionIcon}
                onChange={(value) => setOptionDraft((prev) => ({ ...prev, users: value }))}
                onAdd={() => addOption("users")}
                onRemove={(value) => removeOption("users", value)}
              />

              <OptionManager
                group="accounts"
                title="카드/수단"
                items={accounts}
                value={optionDraft.accounts}
                icons={optionIcons.accounts ?? {}}
                onIconChange={updateOptionIcon}
                onChange={(value) => setOptionDraft((prev) => ({ ...prev, accounts: value }))}
                onAdd={() => addOption("accounts")}
                onRemove={(value) => removeOption("accounts", value)}
              />

              <OptionManager
                group="categories"
                title="카테고리"
                items={categories}
                value={optionDraft.categories}
                icons={optionIcons.categories ?? {}}
                onIconChange={updateOptionIcon}
                onChange={(value) => setOptionDraft((prev) => ({ ...prev, categories: value }))}
                onAdd={() => addOption("categories")}
                onRemove={(value) => removeOption("categories", value)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OptionManager({
  group,
  title,
  items,
  value,
  icons,
  onIconChange,
  onChange,
  onAdd,
  onRemove,
}: {
  group: OptionGroupKey;
  title: string;
  items: string[];
  value: string;
  icons: Record<string, string>;
  onIconChange: (group: OptionGroupKey, value: string, dataUrl: string) => void;
  onChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (value: string) => void;
}) {
  const iconEnabled = true;

  const pickIcon = (item: string, file: File | undefined) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      if (!dataUrl) return;
      onIconChange(group, item, dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
      <div className="text-base font-black text-slate-800">{title}</div>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${title} 추가`}
          className="app-input-soft rounded-[16px]"
        />
        <button onClick={onAdd} className="app-btn-yellow rounded-[16px] px-4 py-2 text-sm">
          추가
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {items.map((item) => {
          const iconSrc = icons[item] || getDefaultOptionIcon(group, item);

          return (
            <div
              key={item}
              className="flex items-center justify-between gap-2 rounded-[16px] bg-slate-50 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                {iconEnabled ? (
                  <label className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-white text-xs font-black text-slate-400 shadow-sm transition hover:bg-[#effffe]">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => pickIcon(item, e.target.files?.[0])}
                    />
                    {iconSrc ? (
                      isImageIcon(iconSrc) ? (
                        <img src={iconSrc} className="h-6 w-6 object-contain" />
                      ) : (
                        <span className="text-base leading-none">{iconSrc}</span>
                      )
                    ) : (
                      "+"
                    )}
                  </label>
                ) : null}

                <span className="truncate text-sm font-medium text-slate-700">{item}</span>
              </div>

              <button
                onClick={() => onRemove(item)}
                className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-500 transition hover:bg-rose-100"
              >
                삭제
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-bold text-slate-600">{label}</label>
      {children}
    </div>
  );
}