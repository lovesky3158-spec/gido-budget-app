export type CategoryRule = {
  category: string;
  strong?: string[];
  weak?: string[];
  exclude?: string[];
};

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "보험",
    strong: ["한화손해보험", "삼성화재", "현대해상", "db손해보험", "메리츠화재", "kb손해보험"],
    weak: ["보험", "손해보험", "생명보험", "화재"],
    exclude: [],
  },
  {
    category: "자동이체",
    strong: ["자동이체", "cms", "정기결제"],
    weak: ["정기", "자동납부"],
    exclude: [],
  },
  {
    category: "금융",
    strong: ["카드대금", "이자", "연회비", "수수료"],
    weak: ["금융", "납부"],
    exclude: [],
  },
  {
    category: "카페",
    strong: ["스타벅스", "투썸플레이스", "메가커피", "빽다방", "이디야", "할리스"],
    weak: ["커피", "카페", "베이커리"],
    exclude: [],
  },
  {
    category: "식대",
    strong: ["배달의민족", "요기요", "쿠팡이츠", "맘스터치", "버거킹", "맥도날드", "서브웨이"],
    weak: ["배민", "요기요", "치킨", "버거", "식당", "식사", "도시락", "국밥", "분식"],
    exclude: [],
  },
  {
    category: "장보기",
    strong: ["이마트", "홈플러스", "롯데마트", "코스트코", "트레이더스", "농협하나로마트"],
    weak: ["마트", "슈퍼", "장보기"],
    exclude: [],
  },
  {
    category: "생활",
    strong: ["다이소", "올리브영", "쿠팡", "오늘의집"],
    weak: ["생활", "잡화", "생필품"],
    exclude: ["쿠팡이츠"],
  },
  {
    category: "교통",
    strong: ["카카오t", "t머니", "고속버스", "srt", "ktx", "쏘카"],
    weak: ["택시", "버스", "지하철", "주유", "주차", "교통"],
    exclude: [],
  },
  {
    category: "쇼핑",
    strong: ["11번가", "g마켓", "옥션", "무신사", "ssf", "네이버쇼핑", "선물하기"],
    weak: ["쇼핑", "스토어", "마켓", "구매"],
    exclude: ["쿠팡이츠"],
  },
  {
    category: "여가",
    strong: ["cgv", "롯데시네마", "메가박스", "넷플릭스", "디즈니", "야놀자", "여기어때"],
    weak: ["영화", "숙박", "놀이", "여가"],
    exclude: [],
  },
  {
    category: "병원",
    strong: ["약국", "치과", "한의원", "병원", "의원"],
    weak: ["의료", "검사", "진료"],
    exclude: [],
  },
  {
    category: "주거",
    strong: ["관리비", "월세", "전세", "도시가스", "전기요금", "수도요금", "통신요금"],
    weak: ["가스", "전기", "수도", "통신", "인터넷"],
    exclude: [],
  },
];

export default CATEGORY_RULES;