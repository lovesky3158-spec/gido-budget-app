# 0515 localStorage 최소화 패치

## 금액 데이터 Supabase 저장 전환

### Assets
- 시작자산
- 이번달 수입상세
- 월별 기타보유금

위 데이터는 `asset_settings` 테이블의 `asset_state` key에 저장됩니다.
기존 localStorage 값이 있으면 최초 1회 Supabase로 이관하고, 성공 시 기존 localStorage key를 제거합니다.

### Dashboard Budget
- 월별 예산

위 데이터는 `asset_settings` 테이블의 `dashboard_budget_map` key에 저장됩니다.
기존 `girin-dashboard-budget-map` localStorage 값이 있으면 최초 1회 Supabase로 이관하고, 성공 시 기존 localStorage key를 제거합니다.

## localStorage 유지 항목
금액성 데이터가 아닌 UI/편의 항목은 유지했습니다.

- 로그인 유지시간 / 최초 홈 진입 session flag
- 로그인 ID 저장
- 업로드 옵션 목록, 컬럼 매핑 프리셋
- 카테고리 자동분류 메모리
- 옵션 아이콘 매핑

## Supabase SQL
`supabase_asset_settings.sql`을 Supabase SQL Editor에서 1회 실행해야 합니다.
