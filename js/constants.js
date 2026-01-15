/**
 * 오더정리 앱 - 상수 및 데이터 모델 정의
 *
 * 이 파일은 앱 전반에서 사용되는 상수, 오더 코드 분류,
 * 비급여 코드 목록 등을 정의합니다.
 */

'use strict';

// ========================================
// 오더 코드 분류
// ========================================

/**
 * 운동치료 (물리치료) 오더 코드
 */
const PHYSICAL_THERAPY_CODES = {
    // 일반 오더
    general: ['COM', 'CPM', 'F', 'M', 'M7', 'M15', 'MM', 'N', 'N7', 'RG', 'RM', 'RN', 'P', 'RP'],
    // 평가 오더
    evaluation: ['ROM', 'MMT', 'BBS']
};

/**
 * 작업치료 오더 코드
 */
const OCCUPATIONAL_THERAPY_CODES = {
    // 일반 오더
    general: ['A', 'C', 'CA', 'D', 'H', 'H7', 'O7', 'RA', 'RD', 'RS', 'S', 'V', 'Y', '전산화인지'],
    // 평가 오더 (하루 1회)
    evaluation: ['PHQ-9', 'CDR', 'MMSE', 'HAND', 'MBI', 'SNSB', 'VFSS']
};

/**
 * 단위 확인 스킵 오더 (평가 아니지만 단위 확인 불필요)
 * 30분=1단위 오더는 단위 미지정 시 기본 1단위
 */
const SKIP_UNIT_CHECK_CODES = ['전산화인지'];

/**
 * 비급여 오더 코드 (숫자가 코드의 일부인 오더)
 * 이 코드들은 숫자를 분리하지 않음
 */
const NON_REIMBURSABLE_CODES = ['M7', 'N7', 'O7', 'H7'];

// ========================================
// 단위 계산 규칙
// ========================================

/**
 * 30분 = 1단위 오더 (단위 미지정 시 기본 1단위, 단위확인 스킵)
 * - 운동: COM, CPM, F, M, M7, M15, N, N7, P
 * - 작업: D, H, H7, O7, S, V, Y
 * - CA는 복합코드로 별도 처리 (C1+A1 = 30분)
 */
const UNIT_30MIN_CODES = ['COM', 'CPM', 'F', 'M', 'M7', 'M15', 'N', 'N7', 'P', 'D', 'H', 'H7', 'O7', 'S', 'V', 'Y'];

/**
 * 15분 = 1단위 오더 (시간으로 단위 자동 계산 가능)
 * - 운동: RG, RM, RN, RP, MM
 * - 작업: RA, RD, RS
 * 예: RM(08:30-09:00) = 30분 = 2단위
 */
const UNIT_15MIN_CODES = ['RG', 'RM', 'RN', 'RP', 'MM', 'RA', 'RD', 'RS'];

/**
 * 복합 오더 코드 (분리 가능한 코드 조합)
 * CA만 특별 처리: C(10분) + A(20분) = 30분
 */
const COMPOUND_CODES = ['CA'];

/**
 * 분리 불가 오더 코드 (알파벳 조합이지만 단일 코드)
 * CPM, MM 등은 분리하지 않음
 */
const NON_SPLITTABLE_CODES = ['CPM', 'MM', 'M15', 'PHQ-9'];

/**
 * 모든 운동치료 코드 (일반 + 평가)
 */
const ALL_PHYSICAL_CODES = [
    ...PHYSICAL_THERAPY_CODES.general,
    ...PHYSICAL_THERAPY_CODES.evaluation
];

/**
 * 모든 작업치료 코드 (일반 + 평가)
 */
const ALL_OCCUPATIONAL_CODES = [
    ...OCCUPATIONAL_THERAPY_CODES.general,
    ...OCCUPATIONAL_THERAPY_CODES.evaluation
];

/**
 * 모든 평가 오더 코드
 */
const ALL_EVALUATION_CODES = [
    ...PHYSICAL_THERAPY_CODES.evaluation,
    ...OCCUPATIONAL_THERAPY_CODES.evaluation
];

// ========================================
// localStorage 키
// ========================================

const STORAGE_KEYS = {
    THERAPISTS: 'orderApp_therapists',
    PATIENTS: 'orderApp_patients',
    SETTINGS: 'orderApp_settings'
};

// ========================================
// 기본 설정값
// ========================================

const DEFAULT_SETTINGS = {
    floor: null,
    job: null,
    therapist: null
};

/**
 * 오더 단위 기본값
 */
const DEFAULT_UNIT = 2;

/**
 * 단위 선택 옵션 (1~10)
 */
const UNIT_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

// ========================================
// 타입/상태 상수
// ========================================

const THERAPY_TYPE = {
    PHYSICAL: 'physical',      // 운동치료 (물리치료)
    OCCUPATIONAL: 'occupational' // 작업치료
};

const ORDER_TYPE = {
    ADD: 'add',
    DELETE: 'delete'
};

const PERIOD_TYPE = {
    DAY: 'day',          // 하루 (>)
    CONTINUOUS: 'continuous'  // 계속 (~~>>)
};

// ========================================
// 정규식 패턴
// ========================================

const PATTERNS = {
    // 입력 라인 파싱: 치료사/환자/오더/시간
    INPUT_LINE: /^([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/,

    // 시간 패턴: HH:MM 또는 HH:MM-HH:MM
    TIME: /(\d{1,2}:\d{2})(?:-(\d{1,2}:\d{2}))?/,

    // 가산오류 플래그
    EXTRA_ERROR: /,?\s*가산오류/,

    // 오더 코드와 숫자 분리 (예: RG2 → RG + 2)
    // 비급여 코드(M7, N7, O7, H7)는 별도 처리
    ORDER_CODE: /^([A-Za-z가-힣-]+)(\d+)?$/,

    // 평가 시간 (00:00)
    EVALUATION_TIME: /^00:00$/
};

// ========================================
// 유틸리티 함수
// ========================================

/**
 * HTML 특수문자 이스케이프 (XSS 방지)
 * @param {string} str - 이스케이프할 문자열
 * @returns {string}
 */
function escapeHtml(str) {
    // 명시적으로 null/undefined만 빈 문자열로 변환
    if (str === null || str === undefined) return '';
    // 숫자나 불린도 문자열로 변환
    const text = String(str);
    const escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, char => escapeMap[char]);
}

/**
 * 오더 코드가 비급여 코드인지 확인
 * @param {string} code - 오더 코드
 * @returns {boolean}
 */
function isNonReimbursableCode(code) {
    return NON_REIMBURSABLE_CODES.includes(code.toUpperCase());
}

/**
 * 오더 코드가 운동치료(물리치료) 코드인지 확인
 * @param {string} code - 오더 코드 (숫자 제외)
 * @returns {boolean}
 */
function isPhysicalTherapyCode(code) {
    const upperCode = code.toUpperCase();
    // 비급여 코드 중 물리치료 관련
    if (upperCode === 'M7' || upperCode === 'N7') return true;
    return ALL_PHYSICAL_CODES.some(c => c.toUpperCase() === upperCode);
}

/**
 * 오더 코드가 작업치료 코드인지 확인
 * @param {string} code - 오더 코드 (숫자 제외)
 * @returns {boolean}
 */
function isOccupationalTherapyCode(code) {
    const upperCode = code.toUpperCase();
    // 비급여 코드 중 작업치료 관련
    if (upperCode === 'O7' || upperCode === 'H7') return true;
    return ALL_OCCUPATIONAL_CODES.some(c => c.toUpperCase() === upperCode);
}

/**
 * 오더 코드가 평가 코드인지 확인
 * @param {string} code - 오더 코드
 * @returns {boolean}
 */
function isEvaluationCode(code) {
    const upperCode = code.toUpperCase().replace(/\d+$/, '');
    return ALL_EVALUATION_CODES.some(c => c.toUpperCase() === upperCode);
}

/**
 * 오더 코드가 유효한지 확인
 * @param {string} code - 오더 코드 (숫자 포함 가능)
 * @returns {boolean}
 */
function isValidOrderCode(code) {
    if (!code || typeof code !== 'string') return false;

    const trimmedCode = code.trim().toUpperCase();

    // 비급여 코드 체크
    if (isNonReimbursableCode(trimmedCode)) return true;

    // 숫자 제거 후 코드만 추출
    const codeOnly = trimmedCode.replace(/\d+$/, '');

    return isPhysicalTherapyCode(codeOnly) || isOccupationalTherapyCode(codeOnly);
}

/**
 * 30분 = 1단위 오더인지 확인
 * @param {string} code - 오더 코드
 * @returns {boolean}
 */
function is30MinUnitCode(code) {
    if (!code) return false;
    const upperCode = code.toUpperCase().replace(/\d+$/, '');
    return UNIT_30MIN_CODES.includes(upperCode);
}

/**
 * 15분 = 1단위 오더인지 확인
 * @param {string} code - 오더 코드
 * @returns {boolean}
 */
function is15MinUnitCode(code) {
    if (!code) return false;
    const upperCode = code.toUpperCase().replace(/\d+$/, '');
    return UNIT_15MIN_CODES.includes(upperCode);
}

/**
 * 분리 불가 코드인지 확인
 * @param {string} code - 오더 코드
 * @returns {boolean}
 */
function isNonSplittableCode(code) {
    if (!code) return false;
    const upperCode = code.toUpperCase().replace(/\d+$/, '');
    return NON_SPLITTABLE_CODES.includes(upperCode);
}

/**
 * 시간 문자열에서 분 단위 차이 계산
 * @param {string} timeStr - "HH:MM-HH:MM" 형식
 * @returns {number|null} - 분 단위 차이, 계산 불가 시 null
 */
function calculateMinutesFromTime(timeStr) {
    if (!timeStr) return null;

    const match = timeStr.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
    if (!match) return null;

    const startHour = parseInt(match[1], 10);
    const startMin = parseInt(match[2], 10);
    const endHour = parseInt(match[3], 10);
    const endMin = parseInt(match[4], 10);

    let startTotal = startHour * 60 + startMin;
    let endTotal = endHour * 60 + endMin;

    // 자정 넘어가는 경우 처리 (23:30-00:30)
    if (endTotal < startTotal) {
        endTotal += 24 * 60; // 다음날로 계산
    }

    const diff = endTotal - startTotal;

    // 음수 결과 방지 (이미 위에서 처리되었지만 안전장치)
    if (diff < 0) {
        console.warn(`잘못된 시간 범위: ${timeStr}`);
        return null;
    }

    return diff;
}

/**
 * 시간으로 15분 단위 오더의 단위 수 계산
 * @param {string} timeStr - "HH:MM-HH:MM" 형식
 * @returns {number|null} - 단위 수, 계산 불가 시 null
 */
function calculateUnitsFromTime(timeStr) {
    const minutes = calculateMinutesFromTime(timeStr);
    if (minutes === null || minutes <= 0) return null;
    return Math.round(minutes / 15);
}

/**
 * 날짜를 M.D 형식으로 포맷
 * @param {Date} date - 날짜 객체
 * @returns {string} - 예: "1.3"
 */
function formatDateMD(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}.${day}`;
}

/**
 * 날짜를 M월 D일 형식으로 포맷
 * @param {Date} date - 날짜 객체
 * @returns {string} - 예: "1월 3일"
 */
function formatDateKorean(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}월 ${day}일`;
}

// ========================================
// 데이터 모델 (JSDoc 타입 정의)
// ========================================

/**
 * @typedef {Object} Patient
 * @property {string} name - 환자명
 * @property {string} ward - 병동구분 (회복기/전문)
 * @property {string} room - 담당원장 RM번호 (예: RM1, RM7)
 */

/**
 * @typedef {Object} ParsedOrder
 * @property {string} therapist - 치료사명
 * @property {string} patient - 환자명
 * @property {string} code - 오더 코드 (숫자 제외)
 * @property {number|null} unit - 단위 (null이면 확인 필요)
 * @property {string} time - 시간 문자열
 * @property {boolean} isEvaluation - 평가 오더 여부
 * @property {boolean} hasExtraError - 가산오류 플래그
 * @property {string} rawCode - 원본 오더 코드 (숫자 포함)
 * @property {string} therapyType - 치료 유형 (physical/occupational)
 */

/**
 * @typedef {Object} GroupedOrders
 * @property {string} room - RM번호
 * @property {Array<PatientOrders>} patients - 환자별 오더 목록
 */

/**
 * @typedef {Object} PatientOrders
 * @property {string} name - 환자명
 * @property {string} ward - 병동구분
 * @property {Array<ParsedOrder>} physicalOrders - 운동치료 오더
 * @property {Array<ParsedOrder>} occupationalOrders - 작업치료 오더
 * @property {boolean} hasExtraError - 가산오류 여부
 */

/**
 * @typedef {Object} Settings
 * @property {string|null} floor - 선택된 층
 * @property {string|null} job - 선택된 직종
 * @property {string|null} therapist - 선택된 치료사
 */
