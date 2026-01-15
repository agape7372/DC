# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

병원 치료사용 오더정리 웹 앱 - 치료사가 작성한 "부족한 오더" 목록을 메신저 양식으로 변환하는 도구입니다.

## Development Commands

```bash
# 로컬 개발 서버 실행 (포트 3000)
npm run dev

# 테스트 실행
# 브라우저에서 tests/test.html 열기
```

## Architecture

순수 HTML/CSS/JavaScript 기반 (프레임워크 없음). localStorage로 데이터 저장.

### External Dependencies
- **SheetJS (xlsx)**: Excel 파일 파싱 (CDN 로드)

### Module Loading Order (index.html)
```
constants.js → storage.js → parser.js → formatter.js → patient.js → ui.js → app.js
```

### Module Pattern
모든 모듈은 **IIFE(즉시 실행 함수 표현식)** 패턴 사용:
```javascript
const ModuleName = (function() {
    // Private functions (closures)
    function privateFunc() { ... }

    // Public API
    return {
        publicFunc() { ... }
    };
})();
```

### Module Responsibilities

| 파일 | 역할 |
|------|------|
| `constants.js` | 오더 코드 분류, 상수, 유틸리티 함수 |
| `storage.js` | localStorage CRUD (설정, 치료사, 환자), 백업/복원 |
| `parser.js` | Excel 복사 텍스트 파싱 → ParsedOrder 객체 |
| `formatter.js` | ParsedOrder → 메신저 양식 변환 |
| `patient.js` | Excel 파일 업로드/파싱 (SheetJS) |
| `ui.js` | DOM 이벤트 핸들링, UI 상태 관리 |
| `app.js` | 앱 초기화 진입점 |

### Key Data Structures
- **ParsedOrder**: `{ therapist, patientName, rm, codes[], period, units, isEvaluation, rawTime }`
- **Patient**: `{ name, rm }` (localStorage에 저장)

## Domain Concepts

### 오더 코드 분류
- **운동치료 (Physical)**: COM, CPM, F, M, M7, M15, MM, N, N7, RG, RM, RN, P, RP
- **작업치료 (Occupational)**: A, C, CA, D, H, H7, O7, RA, RD, RS, S, V, Y, 전산화인지
- **평가 오더**: ROM, MMT, BBS (운동) / PHQ-9, CDR, MMSE, HAND, MBI, SNSB, VFSS (작업)
- **비급여 코드**: M7, N7, O7, H7 (숫자가 코드의 일부)

### 핵심 파싱 규칙
1. **비급여 코드 구분**: M7은 비급여 코드 (분리 안함), M2는 M+2단위 (분리함)
2. **복합 오더 파싱**: C1A1 → C1 + A1로 분리
3. **평가/치료 자동 분리**: 평가 오더는 `>` (당일), 치료 오더는 `~~>>` (계속)

### 오더 단위 자동 계산 규칙
- **30분 기준 코드** (UNIT_30MIN_CODES): COM, CPM, F, M, M7, M15, N, N7, P (운동) / D, H, H7, O7, S, V, Y (작업)
  - 시간 미입력 시 기본 1단위
  - 시간 입력 시 자동 계산 (예: 90분 → 3단위)
- **15분 기준 코드** (UNIT_15MIN_CODES): RG, RM, RN, RP, MM (운동) / RA, RD, RS (작업)
  - 시간 입력 시 자동 계산 (예: 60분 → 4단위)
  - 시간 미입력 시 단위 확인 필요 (기본값: 2단위)
- **시간 형식**: `HH:MM` 또는 `HH:MM-HH:MM` (괄호 안 입력 가능, 4자리 숫자도 자동 변환)
- **단위 확인 UI**: 15분 코드 시간 미입력 시 단위 확인 섹션 표시, 메인 변환 버튼으로 적용

### 입력/출력 형식
- **입력**: `치료사/환자/오더코드/시간` (Excel 복사 형식, 구분자: `/`, `:`, 탭, 공백)
- **출력**: RM별로 그룹핑된 메신저 양식

### 데이터 백업/복원
- **백업**: 📤 데이터 백업 버튼으로 JSON 파일 다운로드 (치료사, 환자, 설정 포함)
- **복원**: 📥 데이터 복원 버튼으로 백업 파일 업로드
- **용도**: 앱 폴더 업데이트 시 데이터 손실 방지 (`file://` 프로토콜 사용 환경)

## Testing

커스텀 테스트 프레임워크 사용 (tests/test.html):
```javascript
TestRunner.suite('테스트 그룹명');
TestRunner.test('테스트명', () => {
    assert.equal(actual, expected);
    assert.deepEqual(obj1, obj2);
    assert.throws(() => { ... });
});
```

브라우저에서 tests/test.html 열어서 수동 실행. CLI 기반 자동화 테스트 없음.

## Deployment

GitHub Pages via GitHub Actions. `main` 브랜치 push 시 자동 배포.
