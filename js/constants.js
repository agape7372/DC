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
    general: ['CPM', 'F', 'M', 'M15', 'MM', 'N', 'N7', 'RG', 'RM', 'RN', 'P', 'RP'],
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
 */
const SKIP_UNIT_CHECK_CODES = ['전산화인지'];

/**
 * 비급여 오더 코드 (숫자가 코드의 일부인 오더)
 * 이 코드들은 숫자를 분리하지 않음
 */
const NON_REIMBURSABLE_CODES = ['M7', 'N7', 'O7', 'H7'];

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
    if (!str) return '';
    const escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return str.replace(/[&<>"']/g, char => escapeMap[char]);
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
