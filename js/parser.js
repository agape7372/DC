/**
 * 오더정리 앱 - 입력 파싱 모듈
 *
 * 엑셀에서 복사한 텍스트를 파싱하여 구조화된 오더 데이터로 변환합니다.
 *
 * 스마트 파서 기능:
 * 1. 구분자 자동 감지 (탭/슬래시/공백)
 * 2. 필드 자동 인식 (환자명, 오더코드, 시간)
 * 3. 최소 필수: 환자명 + 오더코드
 * 4. 시간 없어도 OK (오더코드로 평가 여부 판단)
 */

'use strict';

const Parser = (function () {
    // ========================================
    // Private 유틸리티 함수
    // ========================================

    /**
     * 문자열 트림 및 정규화
     */
    function normalize(str) {
        if (!str || typeof str !== 'string') return '';
        return str.trim().replace(/\s+/g, ' ');
    }

    /**
     * 구분자 자동 감지 (탭 > 슬래시 > 콜론 > 공백)
     * @param {string} line
     * @returns {string|RegExp}
     */
    function detectDelimiter(line) {
        if (line.includes('\t')) return '\t';
        if (line.includes('/')) return '/';
        if (line.includes(':')) return ':';
        return /\s+/; // 공백
    }

    /**
     * 시간 문자열 정규화 (콜론 없는 형식 자동 보정)
     * @param {string} str - 시간 문자열
     * @returns {string|null} - 정규화된 시간 또는 null
     *
     * 지원 형식:
     * - 1440 → 14:40
     * - 1440-1510 → 14:40-15:10
     * - 14:40 → 14:40 (그대로)
     * - 14:40-15:10 → 14:40-15:10 (그대로)
     */
    function normalizeTime(str) {
        if (!str) return null;
        const trimmed = str.trim();

        // 이미 콜론이 있으면 그대로 반환
        if (/^\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?$/.test(trimmed)) {
            return trimmed;
        }

        // 4자리 숫자 형식: 1440 → 14:40 (유효성 검증 추가)
        if (/^\d{4}$/.test(trimmed)) {
            const hour = parseInt(trimmed.slice(0, 2), 10);
            const min = parseInt(trimmed.slice(2, 4), 10);
            // 유효한 시간인지 검증
            if (hour >= 0 && hour <= 23 && min >= 0 && min <= 59) {
                return `${trimmed.slice(0, 2)}:${trimmed.slice(2, 4)}`;
            }
            return null; // 유효하지 않은 시간
        }

        // 범위 형식: 1440-1510 → 14:40-15:10 (유효성 검증 추가)
        const rangeMatch = trimmed.match(/^(\d{4})-(\d{4})$/);
        if (rangeMatch) {
            const startHour = parseInt(rangeMatch[1].slice(0, 2), 10);
            const startMin = parseInt(rangeMatch[1].slice(2, 4), 10);
            const endHour = parseInt(rangeMatch[2].slice(0, 2), 10);
            const endMin = parseInt(rangeMatch[2].slice(2, 4), 10);

            // 유효한 시간인지 검증
            if (startHour >= 0 && startHour <= 23 && startMin >= 0 && startMin <= 59 &&
                endHour >= 0 && endHour <= 23 && endMin >= 0 && endMin <= 59) {
                return `${rangeMatch[1].slice(0, 2)}:${rangeMatch[1].slice(2, 4)}-${rangeMatch[2].slice(0, 2)}:${rangeMatch[2].slice(2, 4)}`;
            }
            return null; // 유효하지 않은 시간
        }

        return null;
    }

    /**
     * 시간 패턴인지 확인 (자동 보정 포함)
     * @param {string} str
     * @returns {boolean}
     */
    function isTimePattern(str) {
        return normalizeTime(str) !== null;
    }

    /**
     * 괄호 안 시간 추출 및 정규화: M(10:15-10:45) → "10:15-10:45"
     * @param {string} str
     * @returns {string|null}
     *
     * 지원 형식:
     * - M(14:40-15:10) → "14:40-15:10"
     * - M(1440-1510) → "14:40-15:10" (자동 보정)
     */
    function extractTimeFromParens(str) {
        // 콜론 있는 형식
        const colonMatch = str.match(/\((\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?)\)$/);
        if (colonMatch) {
            return colonMatch[1];
        }

        // 콜론 없는 형식 (4자리 숫자)
        const noColonMatch = str.match(/\((\d{4}(?:-\d{4})?)\)$/);
        if (noColonMatch) {
            return normalizeTime(noColonMatch[1]);
        }

        return null;
    }

    /**
     * 괄호 안 시간 제거: M(10:15-10:45) → M, M(1440-1510) → M
     * @param {string} str
     * @returns {string}
     */
    function removeTimeInParens(str) {
        // 콜론 있는 형식 제거
        let result = str.replace(/\(\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?\)$/g, '');
        // 콜론 없는 형식 제거 (4자리 숫자)
        result = result.replace(/\(\d{4}(?:-\d{4})?\)$/g, '');
        return result;
    }

    /**
     * 오더 코드 패턴인지 확인
     * @param {string} str
     * @returns {boolean}
     */
    function isOrderCodePattern(str) {
        const trimmed = str.trim();
        if (!trimmed) return false;

        // 괄호 안 시간 제거: M(10:15-10:45) → M
        const withoutTime = removeTimeInParens(trimmed);
        const upper = withoutTime.toUpperCase();

        if (!upper) return false;

        // 비급여 코드
        if (isNonReimbursableCode(upper)) return true;

        // 평가 코드
        if (isEvaluationCode(upper)) return true;

        // 숫자 제거 후 기본 코드 확인
        const baseCode = upper.replace(/\d+$/, '');
        if (baseCode && (isPhysicalTherapyCode(baseCode) || isOccupationalTherapyCode(baseCode))) {
            return true;
        }

        // 복합 코드 패턴 (C1A1 등)
        if (/^[A-Z]+\d*([A-Z]+\d*)+$/.test(upper)) {
            const expanded = expandCompoundCode(upper);
            if (expanded.length > 1) {
                return expanded.every(code => {
                    const base = code.replace(/\d+$/, '');
                    return isPhysicalTherapyCode(base) || isOccupationalTherapyCode(base) ||
                           isNonReimbursableCode(code) || isEvaluationCode(base);
                });
            }
        }

        return false;
    }

    /**
     * 이름 정규화 ("님" 접미사 제거)
     * @param {string} str
     * @returns {string}
     */
    function normalizeName(str) {
        if (!str) return '';
        return str.trim().replace(/님$/, '');
    }

    /**
     * 환자명인지 확인
     * @param {string} str
     * @returns {boolean}
     */
    function isPatientName(str) {
        const trimmed = str.trim();
        if (!trimmed) return false;

        // "님" 제거 후 검증
        const normalized = normalizeName(trimmed);

        // 등록된 환자인지 확인 (원본과 정규화된 이름 모두 확인)
        const patient = Storage.getPatientByName(trimmed) || Storage.getPatientByName(normalized);
        if (patient) return true;

        // 한글 이름 패턴 (2-4자 + 동명이인 숫자) - 오더 코드 아닌 경우
        if (/^[가-힣]{2,4}\d*$/.test(normalized) && !isOrderCodePattern(normalized)) {
            return true;
        }

        return false;
    }

    /**
     * 오더 코드를 개별 코드로 분리
     * @returns {Array<{code: string, time: string|null}>} - 코드와 괄호 내 시간
     */
    function splitOrderCodes(orderString) {
        if (!orderString) return [];

        // 가산오류 플래그 먼저 제거
        const cleanedString = orderString.replace(PATTERNS.EXTRA_ERROR, '').trim();

        // 콤마 또는 공백으로 분리
        const rawCodes = cleanedString
            .split(/[,\s]+/)
            .map(code => code.trim())
            .filter(code => code.length > 0);

        // 복합 오더 분리 (괄호 내 시간 보존)
        const expandedCodes = [];
        for (const code of rawCodes) {
            // 괄호 안 시간 추출: M(10:15-10:45) → "10:15-10:45"
            const timeInParens = extractTimeFromParens(code);
            // 괄호 안 시간 제거: M(10:15-10:45) → M
            const codeWithoutTime = removeTimeInParens(code);
            const expanded = expandCompoundCode(codeWithoutTime);

            for (const expandedCode of expanded) {
                expandedCodes.push({
                    code: expandedCode,
                    time: timeInParens
                });
            }
        }

        return expandedCodes;
    }

    /**
     * 복합 오더 코드 분리
     * CA → C1, A1 (CA만 특별히 숫자 없으면 기본 1단위)
     * C2A1 → C2, A1
     *
     * 주의: CPM, MM, M15 등은 분리하지 않음 (단일 코드)
     */
    function expandCompoundCode(code) {
        if (!code) return [];

        const upperCode = code.toUpperCase();

        // 비급여/평가 코드는 분리하지 않음
        if (isNonReimbursableCode(upperCode) || isEvaluationCode(upperCode)) {
            return [upperCode];
        }

        // 분리 불가 코드 체크 (CPM, MM, M15, PHQ-9 등)
        if (isNonSplittableCode(upperCode)) {
            return [upperCode];
        }

        // CA 특별 처리: 숫자 없으면 C1A1로
        if (upperCode === 'CA') {
            return ['C1', 'A1'];
        }

        // 이미 단일 유효 코드인 경우 분리하지 않음
        const baseCode = upperCode.replace(/\d+$/, '');
        if (isPhysicalTherapyCode(baseCode) || isOccupationalTherapyCode(baseCode)) {
            return [upperCode];
        }

        // 복합 코드 패턴 (예: C2A1)
        const pattern = /([A-Z]+)(\d*)/g;
        const matches = [...upperCode.matchAll(pattern)];
        const reconstructed = matches.map(m => m[0]).join('');

        if (matches.length >= 2 && reconstructed === upperCode) {
            const allValid = matches.every(m => {
                const codeOnly = m[1];
                // 분리 불가 코드가 포함되어 있으면 분리하지 않음
                if (isNonSplittableCode(codeOnly)) return false;
                return isPhysicalTherapyCode(codeOnly) || isOccupationalTherapyCode(codeOnly);
            });

            if (allValid) {
                return matches.map(m => m[0]).filter(c => c.length > 0);
            }
        }

        return [code];
    }

    /**
     * 오더 코드 파싱 (코드와 단위 분리)
     * @param {string} rawCode - 원본 오더 코드
     * @param {string} timeStr - 시간 문자열 (선택, 15분 단위 계산용)
     */
    function parseOrderCode(rawCode, timeStr) {
        if (!rawCode) {
            return { code: '', unit: null, raw: '' };
        }

        const trimmedCode = rawCode.trim();
        const upperCode = trimmedCode.toUpperCase();

        // 비급여 코드
        if (isNonReimbursableCode(upperCode)) {
            return { code: upperCode, unit: 1, raw: upperCode };
        }

        // 전산화인지 특별 처리: 숫자 없으면 기본 1단위
        if (trimmedCode.startsWith('전산화인지')) {
            const unitMatch = trimmedCode.match(/전산화인지(\d+)?$/);
            if (unitMatch) {
                const unit = unitMatch[1] ? parseInt(unitMatch[1], 10) : 1;
                return { code: '전산화인지', unit: unit, raw: '전산화인지' + unit };
            }
        }

        // 일반 코드: 숫자 분리
        const match = upperCode.match(PATTERNS.ORDER_CODE);
        if (!match) {
            return { code: upperCode, unit: null, raw: upperCode };
        }

        const [, codeOnly, unitStr] = match;
        let unit = unitStr ? parseInt(unitStr, 10) : null;

        // 단위가 없는 경우 규칙 기반 자동 계산
        if (unit === null) {
            // 30분 = 1단위 오더: 기본 1단위
            if (is30MinUnitCode(codeOnly)) {
                unit = 1;
            }
            // 15분 = 1단위 오더: 시간으로 계산
            else if (is15MinUnitCode(codeOnly)) {
                if (timeStr) {
                    const calculatedUnit = calculateUnitsFromTime(timeStr);
                    if (calculatedUnit !== null) {
                        unit = calculatedUnit;
                        console.log('[15분 코드 시간 계산]', {codeOnly, timeStr, unit});
                    } else {
                        // 시간 계산 실패 시 기본 2단위
                        unit = DEFAULT_UNIT;
                        console.warn('[15분 코드 시간 계산 실패 - 기본 단위 적용]', {codeOnly, timeStr});
                    }
                } else {
                    // 시간 없으면 기본 2단위
                    unit = DEFAULT_UNIT;
                    console.warn('[15분 코드 시간 없음 - 기본 단위 적용]', {codeOnly});
                }
            }
            // 정의되지 않은 코드: 기본 2단위
            else if (!is30MinUnitCode(codeOnly) && !is15MinUnitCode(codeOnly)) {
                // 운동/작업 치료 코드가 아니면 기본 단위 적용 (경고 표시됨)
                if (!isPhysicalTherapyCode(codeOnly) && !isOccupationalTherapyCode(codeOnly)) {
                    unit = DEFAULT_UNIT;
                }
            }
        }

        return {
            code: codeOnly,
            unit: unit,
            raw: unit !== null ? codeOnly + unit : upperCode
        };
    }

    /**
     * 치료 유형 판별
     */
    function getTherapyType(code) {
        if (isPhysicalTherapyCode(code)) return THERAPY_TYPE.PHYSICAL;
        if (isOccupationalTherapyCode(code)) return THERAPY_TYPE.OCCUPATIONAL;
        return 'unknown';
    }

    // ========================================
    // 스마트 라인 파싱
    // ========================================

    /**
     * 단일 입력 라인 스마트 파싱
     *
     * 지원 형식:
     * - 치료사/환자/오더/시간 (기존)
     * - 환자/오더 (최소)
     * - 환자 오더 (공백 구분)
     * - 탭 구분 엑셀 데이터
     */
    function parseLine(line) {
        const result = { success: false, orders: [], error: null };

        if (!line || typeof line !== 'string') {
            result.error = '빈 라인입니다.';
            return result;
        }

        const trimmedLine = normalize(line);
        if (!trimmedLine) {
            result.error = '빈 라인입니다.';
            return result;
        }

        // 가산오류 플래그 체크
        const hasExtraError = PATTERNS.EXTRA_ERROR.test(trimmedLine);

        // ========================================
        // 토큰 기반 순차 파싱 (구분자 독립적)
        // ========================================

        // 1. 전처리: "님" 제거, 구분자 통일 (괄호 안 시간은 보호!)

        // 1-1. 괄호 안 시간을 임시 플레이스홀더로 치환 (콜론 보호)
        const timeInParensMatches = [];
        let normalized = trimmedLine.replace(/\([\d:-]+\)/g, (match) => {
            const placeholder = `__TIME${timeInParensMatches.length}__`;
            timeInParensMatches.push(match);
            return placeholder;
        });

        // 1-2. 전처리: "님" 제거, 구분자를 공백으로
        normalized = normalized
            .replace(/님/g, '')              // "님" 제거
            .replace(/[\/:\t]+/g, ' ')      // 구분자를 공백으로 (괄호 안 시간은 이미 치환됨)
            .replace(PATTERNS.EXTRA_ERROR, '')  // 가산오류 텍스트 제거
            .trim();

        // 1-3. 플레이스홀더를 원래 시간으로 복원
        timeInParensMatches.forEach((time, index) => {
            normalized = normalized.replace(`__TIME${index}__`, time);
        });

        // 2. 토큰 분리 (괄호는 앞 토큰과 붙여서 유지)
        const tokens = normalized.split(/\s+/).filter(t => t);

        console.log('[토큰 파싱]', {line: trimmedLine, normalized, tokens});

        // 3. 순차적으로 토큰 분류
        let patient = null;
        let orderCodes = [];
        let time = null;
        let therapist = null;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (!token) continue;

            // 1. 시간 패턴? (괄호 포함: (08:30-09:00))
            if (isTimePattern(token) || /^\([\d:-]+\)$/.test(token)) {
                const cleanTime = token.replace(/[()]/g, '');
                time = normalizeTime(cleanTime);
                console.log('[시간 인식]', {token, cleanTime, time});
                continue;
            }

            // 2. 오더 코드? (다음 토큰이 괄호 시간이면 합치기)
            if (isOrderCodePattern(token)) {
                let orderToken = token;

                // 다음 토큰이 괄호 시간이면 합치기: RM + (08:30-09:00) → RM(08:30-09:00)
                if (i + 1 < tokens.length && /^\([\d:-]+\)$/.test(tokens[i + 1])) {
                    orderToken = token + tokens[i + 1];
                    i++; // 다음 토큰 스킵
                    console.log('[오더+시간 합침]', orderToken);
                }

                const codes = splitOrderCodes(orderToken);
                orderCodes.push(...codes);
                console.log('[오더 인식]', {token: orderToken, codes});
                continue;
            }

            // 3. 이름 패턴? (한글 2-4자 + 선택적 숫자)
            const namePattern = /^[가-힣]{2,4}\d*$/;
            if (namePattern.test(token) && !isOrderCodePattern(token)) {
                if (!therapist) {
                    therapist = token;
                    console.log('[치료사 인식]', token);
                } else if (!patient) {
                    patient = token;
                    console.log('[환자 인식]', token);
                }
                continue;
            }

            // 4. 등록된 환자명?
            if (!patient && isPatientName(token)) {
                patient = token;
                console.log('[등록된 환자 인식]', token);
                continue;
            }
        }

        // 이름이 하나만 있으면 환자로 처리 (치료사는 선택사항)
        if (therapist && !patient) {
            patient = therapist;
            therapist = null;
            console.log('[이름 하나 → 환자로 처리]', {patient});
        }

        // 유효성 검사: 환자명 + 오더코드 필수
        console.log('[파싱 최종 결과]', {
            line: trimmedLine,
            therapist,
            patient,
            orderCodes,
            time
        });

        if (!patient) {
            result.error = `환자명을 찾을 수 없습니다: "${trimmedLine}"`;
            console.error('[파싱 실패 - 환자명 없음]', trimmedLine);
            return result;
        }

        if (orderCodes.length === 0) {
            result.error = `오더 코드를 찾을 수 없습니다: "${trimmedLine}"`;
            console.error('[파싱 실패 - 오더코드 없음]', {patient, therapist, tokens});
            return result;
        }

        // 평가 시간 체크
        const isEvaluationTime = time && PATTERNS.EVALUATION_TIME.test(time);

        // 오더 객체 생성
        // orderCodes는 {code, time} 객체 배열 (splitOrderCodes에서 반환)
        for (const orderInfo of orderCodes) {
            // 괄호 내 시간 우선, 없으면 필드 시간 사용
            const effectiveTime = orderInfo.time || time;

            // 시간 정보를 parseOrderCode에 전달하여 15분 단위 오더 자동 계산
            const parsed = parseOrderCode(orderInfo.code, effectiveTime);
            const therapyType = getTherapyType(parsed.code);

            if (therapyType === 'unknown') {
                console.warn(`알 수 없는 오더 코드: ${orderInfo.code}`);
            }

            result.orders.push({
                therapist: therapist || '',
                patient: patient,
                code: parsed.code,
                unit: parsed.unit,
                time: effectiveTime || '',
                isEvaluation: isEvaluationTime || isEvaluationCode(parsed.code),
                hasExtraError: hasExtraError,
                rawCode: parsed.raw,
                therapyType: therapyType
            });
        }

        result.success = true;
        return result;
    }

    // ========================================
    // 전체 입력 파싱
    // ========================================

    /**
     * 전체 입력 텍스트 파싱
     */
    function parseInput(input) {
        const result = {
            success: false,
            orders: [],
            needsUnitCheck: [],
            errors: [],
            warnings: []
        };

        if (!input || typeof input !== 'string') {
            result.errors.push('입력이 비어있습니다.');
            return result;
        }

        const lines = input.split('\n').filter(line => line.trim());

        if (lines.length === 0) {
            result.errors.push('입력이 비어있습니다.');
            return result;
        }

        let successCount = 0;
        let lastTherapist = ''; // 이전 줄의 치료사명 (들여쓰기 처리용)

        for (let i = 0; i < lines.length; i++) {
            const lineResult = parseLine(lines[i]);

            if (lineResult.success) {
                successCount++;

                for (const order of lineResult.orders) {
                    // 치료사명 상속: 현재 줄에 치료사명이 없으면 이전 치료사명 사용
                    if (!order.therapist && lastTherapist) {
                        order.therapist = lastTherapist;
                    }

                    // 현재 오더에 치료사명이 있으면 lastTherapist 업데이트
                    if (order.therapist) {
                        lastTherapist = order.therapist;
                    }

                    result.orders.push(order);

                    // 단위 확인 필요 (평가, 비급여, 스킵 코드 제외)
                    if (order.unit === null &&
                        !isNonReimbursableCode(order.code) &&
                        !order.isEvaluation &&
                        !SKIP_UNIT_CHECK_CODES.includes(order.code)) {
                        result.needsUnitCheck.push(order);
                    }
                }
            } else {
                result.errors.push(`${i + 1}번째 줄: ${lineResult.error}`);
            }
        }

        result.success = successCount > 0;

        // 알 수 없는 코드 경고
        const unknownCodes = result.orders
            .filter(o => o.therapyType === 'unknown')
            .map(o => o.rawCode);

        if (unknownCodes.length > 0) {
            const uniqueCodes = [...new Set(unknownCodes)];
            result.warnings.push(`알 수 없는 오더 코드: ${uniqueCodes.join(', ')}`);
        }

        return result;
    }

    // ========================================
    // 단위 적용
    // ========================================

    function applyUnits(orders, unitMap) {
        return orders.map(order => {
            if (order.unit !== null) return order;

            const key = createOrderKey(order);
            const unit = unitMap[key] !== undefined ? unitMap[key] : DEFAULT_UNIT;

            return {
                ...order,
                unit: unit,
                rawCode: order.code + unit
            };
        });
    }

    function createOrderKey(order) {
        return `${order.therapist}/${order.patient}/${order.code}`;
    }

    // ========================================
    // 출력 텍스트 파싱 (RM 정보 추출)
    // ========================================

    /**
     * 출력 텍스트에서 환자 RM 정보 추출
     *
     * 형식:
     * <RM3>
     * 유혜영4님 운동 - M1
     * 김철수님 작업 - C1
     *
     * <RM5>
     * 박영희님 운동 - RG2
     *
     * @param {string} outputText - 출력 텍스트
     * @returns {{patients: Array<{name: string, room: string, ward: string}>, errors: string[]}}
     */
    function parseOutputForPatients(outputText) {
        const result = {
            patients: [],
            errors: []
        };

        if (!outputText || typeof outputText !== 'string') {
            result.errors.push('출력 텍스트가 비어있습니다.');
            return result;
        }

        const lines = outputText.split('\n');
        let currentRoom = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // RM 패턴: <RM3>, <RM?>
            const rmMatch = line.match(/^<(RM\d+|RM\?)>$/);
            if (rmMatch) {
                currentRoom = rmMatch[1];
                continue;
            }

            // 환자 라인 파싱
            // 형식: (병동구분)? 환자명님 치료유형 - 오더
            // 예: "회복기 유혜영4님 운동 - M1" 또는 "유혜영4님 운동 - M1"
            if (currentRoom && currentRoom !== 'RM?') {
                // 환자명 패턴: (한글 2-4자 공백)? 한글+숫자님
                const patientMatch = line.match(/^(?:([가-힣]{2,4})\s+)?([가-힣0-9]+)님/);
                if (patientMatch) {
                    const ward = patientMatch[1] || '';
                    const patientName = patientMatch[2];

                    result.patients.push({
                        name: patientName,
                        room: currentRoom,
                        ward: ward
                    });
                }
            }
        }

        if (result.patients.length === 0) {
            result.errors.push('저장할 환자 정보를 찾을 수 없습니다.');
        }

        return result;
    }

    // ========================================
    // Public API
    // ========================================

    return {
        parseLine,
        parseInput,
        applyUnits,
        createOrderKey,
        parseOutputForPatients,
        _splitOrderCodes: splitOrderCodes,
        _parseOrderCode: parseOrderCode,
        _getTherapyType: getTherapyType,
        _isOrderCodePattern: isOrderCodePattern,
        _isPatientName: isPatientName
    };
})();
