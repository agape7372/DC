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
     * 구분자 자동 감지
     * @param {string} line
     * @returns {string|RegExp}
     */
    function detectDelimiter(line) {
        if (line.includes('\t')) return '\t';
        if (line.includes('/')) return '/';
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

        // 4자리 숫자 형식: 1440 → 14:40
        if (/^\d{4}$/.test(trimmed)) {
            const hour = trimmed.slice(0, 2);
            const min = trimmed.slice(2, 4);
            return `${hour}:${min}`;
        }

        // 범위 형식: 1440-1510 → 14:40-15:10
        const rangeMatch = trimmed.match(/^(\d{4})-(\d{4})$/);
        if (rangeMatch) {
            const startHour = rangeMatch[1].slice(0, 2);
            const startMin = rangeMatch[1].slice(2, 4);
            const endHour = rangeMatch[2].slice(0, 2);
            const endMin = rangeMatch[2].slice(2, 4);
            return `${startHour}:${startMin}-${endHour}:${endMin}`;
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
     * 환자명인지 확인
     * @param {string} str
     * @returns {boolean}
     */
    function isPatientName(str) {
        const trimmed = str.trim();
        if (!trimmed) return false;

        // 등록된 환자인지 확인
        const patient = Storage.getPatientByName(trimmed);
        if (patient) return true;

        // 한글 이름 패턴 (2-4자 + 동명이인 숫자) - 오더 코드 아닌 경우
        if (/^[가-힣]{2,4}\d*$/.test(trimmed) && !isOrderCodePattern(trimmed)) {
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
            else if (is15MinUnitCode(codeOnly) && timeStr) {
                const calculatedUnit = calculateUnitsFromTime(timeStr);
                if (calculatedUnit !== null) {
                    unit = calculatedUnit;
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

        // 구분자 감지 및 분리
        const delimiter = detectDelimiter(trimmedLine);
        let fields;
        if (typeof delimiter === 'string') {
            fields = trimmedLine.split(delimiter).map(f => f.trim()).filter(f => f);
        } else {
            fields = trimmedLine.split(delimiter).map(f => f.trim()).filter(f => f);
        }

        // 필드 분류
        let patient = null;
        let orderCodes = [];
        let time = null;
        let therapist = null;

        // "/" 구분자에서 이름 두 개 연속 감지 (치료사/환자 형식)
        if (delimiter === '/' && fields.length >= 2) {
            const cleanFirst = fields[0].replace(PATTERNS.EXTRA_ERROR, '').trim();
            const cleanSecond = fields[1].replace(PATTERNS.EXTRA_ERROR, '').trim();

            // 이름 패턴: 한글 2-4자 + 선택적 숫자 (동명이인)
            const namePattern = /^[가-힣]{2,4}\d*$/;
            const firstIsName = namePattern.test(cleanFirst) && !isOrderCodePattern(cleanFirst);
            const secondIsName = namePattern.test(cleanSecond) && !isOrderCodePattern(cleanSecond);

            if (firstIsName && secondIsName) {
                // 이름 두 개 연속: 치료사/환자
                therapist = cleanFirst;
                patient = cleanSecond;
                fields = fields.slice(2); // 처음 두 필드 제거
            }
            // 이름이 하나만 있는 경우는 아래 for loop에서 환자로 처리됨
        }

        for (const field of fields) {
            // 가산오류 텍스트 제거
            const cleanField = field.replace(PATTERNS.EXTRA_ERROR, '').trim();
            if (!cleanField) continue;

            // 1. 시간 패턴?
            if (isTimePattern(cleanField)) {
                time = normalizeTime(cleanField);
                continue;
            }

            // 2. 필드를 공백/콤마로 분리해서 개별 분석
            const subParts = cleanField.split(/[,\s]+/).filter(c => c);

            for (const part of subParts) {
                // 시간 패턴?
                if (isTimePattern(part)) {
                    time = normalizeTime(part);
                    continue;
                }

                // 오더 코드?
                if (isOrderCodePattern(part)) {
                    orderCodes.push(...splitOrderCodes(part));
                    continue;
                }

                // 환자명?
                if (!patient && isPatientName(part)) {
                    patient = part;
                    continue;
                }

                // 한글 2-4자(+동명이인 숫자)면 이름으로 추정
                if (/^[가-힣]{2,4}\d*$/.test(part)) {
                    if (!patient) {
                        patient = part;
                    } else if (!therapist) {
                        therapist = part;
                    }
                    continue;
                }

                // 그 외는 치료사로 저장
                if (!therapist) {
                    therapist = part;
                }
            }
        }

        // 유효성 검사: 환자명 + 오더코드 필수
        if (!patient) {
            result.error = `환자명을 찾을 수 없습니다: "${trimmedLine}"`;
            return result;
        }

        if (orderCodes.length === 0) {
            result.error = `오더 코드를 찾을 수 없습니다: "${trimmedLine}"`;
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
    // Public API
    // ========================================

    return {
        parseLine,
        parseInput,
        applyUnits,
        createOrderKey,
        _splitOrderCodes: splitOrderCodes,
        _parseOrderCode: parseOrderCode,
        _getTherapyType: getTherapyType,
        _isOrderCodePattern: isOrderCodePattern,
        _isPatientName: isPatientName
    };
})();
