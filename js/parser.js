/**
 * 오더정리 앱 - 입력 파싱 모듈
 *
 * 엑셀에서 복사한 텍스트를 파싱하여 구조화된 오더 데이터로 변환합니다.
 *
 * 잠재적 버그 방지:
 * 1. 비급여 코드(M7, N7, O7, H7) vs 일반 오더+숫자 정확한 구분
 * 2. 콤마와 공백 혼용된 오더 구분자 처리
 * 3. 빈 입력, 잘못된 형식 등 엣지 케이스 처리
 */

'use strict';

const Parser = (function () {
    // ========================================
    // Private 유틸리티 함수
    // ========================================

    /**
     * 문자열 트림 및 정규화
     * @param {string} str
     * @returns {string}
     */
    function normalize(str) {
        if (!str || typeof str !== 'string') return '';
        return str.trim().replace(/\s+/g, ' ');
    }

    /**
     * 오더 코드를 개별 코드로 분리
     * 콤마와 공백 혼용 지원
     *
     * 예시:
     * - "ROM,MMT,BBS" → ["ROM", "MMT", "BBS"]
     * - "MMSE CDR HAND" → ["MMSE", "CDR", "HAND"]
     * - "ROM,MMT BBS" → ["ROM", "MMT", "BBS"]
     * - "C1A1" → ["C1", "A1"] (복합 오더)
     *
     * @param {string} orderString - 오더 문자열
     * @returns {string[]}
     */
    function splitOrderCodes(orderString) {
        if (!orderString) return [];

        // 가산오류 플래그 먼저 제거
        const cleanedString = orderString.replace(PATTERNS.EXTRA_ERROR, '').trim();

        // 콤마 또는 공백으로 분리 (연속된 구분자 처리)
        const rawCodes = cleanedString
            .split(/[,\s]+/)
            .map(code => code.trim())
            .filter(code => code.length > 0);

        // 복합 오더 분리 (예: C1A1 → C1, A1)
        const expandedCodes = [];
        for (const code of rawCodes) {
            const expanded = expandCompoundCode(code);
            expandedCodes.push(...expanded);
        }

        return expandedCodes;
    }

    /**
     * 복합 오더 코드 분리
     * 예: C1A1 → ["C1", "A1"]
     * 예: M1N2RG2 → ["M1", "N2", "RG2"]
     *
     * @param {string} code - 오더 코드
     * @returns {string[]}
     */
    function expandCompoundCode(code) {
        if (!code) return [];

        const upperCode = code.toUpperCase();

        // 비급여 코드는 분리하지 않음
        if (isNonReimbursableCode(upperCode)) {
            return [upperCode];
        }

        // 평가 코드는 분리하지 않음
        if (isEvaluationCode(upperCode)) {
            return [upperCode];
        }

        // 복합 코드 패턴: 알파벳+숫자 반복 (예: C1A1, M1N2)
        // 단, 단일 코드(RG2)와 구분해야 함
        const pattern = /([A-Z]+)(\d*)/g;
        const matches = [...upperCode.matchAll(pattern)];

        // 매치가 2개 이상이고 전체 문자열을 커버하면 복합 코드
        const reconstructed = matches.map(m => m[0]).join('');

        if (matches.length >= 2 && reconstructed === upperCode) {
            // 유효한 복합 코드인지 확인 (각 코드가 알려진 코드인지)
            const allValid = matches.every(m => {
                const codeOnly = m[1];
                return isPhysicalTherapyCode(codeOnly) || isOccupationalTherapyCode(codeOnly);
            });

            if (allValid) {
                return matches
                    .map(m => m[0])
                    .filter(c => c.length > 0);
            }
        }

        // 복합 코드가 아니면 그대로 반환
        return [code];
    }

    /**
     * 오더 코드에서 코드와 숫자(단위) 분리
     *
     * 비급여 코드 처리:
     * - M7, N7, O7, H7는 숫자가 코드의 일부이므로 분리하지 않음
     *
     * 일반 코드:
     * - RG2 → { code: 'RG', unit: 2, raw: 'RG2' }
     * - RG → { code: 'RG', unit: null, raw: 'RG' } (단위 확인 필요)
     *
     * @param {string} rawCode - 원본 오더 코드
     * @returns {{code: string, unit: number|null, raw: string}}
     */
    function parseOrderCode(rawCode) {
        if (!rawCode) {
            return { code: '', unit: null, raw: '' };
        }

        const trimmedCode = rawCode.trim().toUpperCase();

        // 1. 비급여 코드 체크 (M7, N7, O7, H7)
        //    이 코드들은 숫자가 코드의 일부이므로 분리하지 않음
        if (isNonReimbursableCode(trimmedCode)) {
            return {
                code: trimmedCode,
                unit: 1, // 비급여는 단위 개념 없음, 편의상 1
                raw: trimmedCode
            };
        }

        // 2. 일반 코드: 숫자 분리 시도
        const match = trimmedCode.match(PATTERNS.ORDER_CODE);

        if (!match) {
            // 매칭 실패 시 원본 그대로 반환
            return {
                code: trimmedCode,
                unit: null,
                raw: trimmedCode
            };
        }

        const [, codeOnly, unitStr] = match;

        return {
            code: codeOnly,
            unit: unitStr ? parseInt(unitStr, 10) : null,
            raw: trimmedCode
        };
    }

    /**
     * 오더의 치료 유형 판별
     * @param {string} code - 오더 코드 (숫자 제외)
     * @returns {string} - 'physical' | 'occupational' | 'unknown'
     */
    function getTherapyType(code) {
        if (isPhysicalTherapyCode(code)) {
            return THERAPY_TYPE.PHYSICAL;
        }
        if (isOccupationalTherapyCode(code)) {
            return THERAPY_TYPE.OCCUPATIONAL;
        }
        return 'unknown';
    }

    // ========================================
    // 라인 파싱
    // ========================================

    /**
     * 단일 입력 라인 파싱
     *
     * 형식: 치료사/환자/오더코드/시간
     * 예: 이예지/김원순/M7/11:25-11:55
     *
     * @param {string} line - 입력 라인
     * @returns {{success: boolean, orders: ParsedOrder[], error: string|null}}
     */
    function parseLine(line) {
        const result = {
            success: false,
            orders: [],
            error: null
        };

        if (!line || typeof line !== 'string') {
            result.error = '빈 라인입니다.';
            return result;
        }

        const trimmedLine = normalize(line);
        if (!trimmedLine) {
            result.error = '빈 라인입니다.';
            return result;
        }

        // 형식 체크: 치료사/환자/오더/시간
        const match = trimmedLine.match(PATTERNS.INPUT_LINE);

        if (!match) {
            result.error = `잘못된 형식: "${trimmedLine}" (형식: 치료사/환자/오더/시간)`;
            return result;
        }

        const [, therapist, patient, orderString, timeString] = match;

        // 가산오류 플래그 체크
        const hasExtraError = PATTERNS.EXTRA_ERROR.test(orderString + timeString);

        // 평가 시간 체크 (00:00)
        const isEvaluationTime = PATTERNS.EVALUATION_TIME.test(timeString.trim());

        // 오더 코드 분리
        const orderCodes = splitOrderCodes(orderString);

        if (orderCodes.length === 0) {
            result.error = `오더 코드가 없습니다: "${trimmedLine}"`;
            return result;
        }

        // 각 오더 코드 파싱
        for (const rawCode of orderCodes) {
            const parsed = parseOrderCode(rawCode);
            const therapyType = getTherapyType(parsed.code);

            // 알 수 없는 코드 경고 (에러는 아님)
            if (therapyType === 'unknown') {
                console.warn(`알 수 없는 오더 코드: ${rawCode}`);
            }

            result.orders.push({
                therapist: therapist.trim(),
                patient: patient.trim(),
                code: parsed.code,
                unit: parsed.unit,
                time: timeString.trim(),
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
     *
     * @param {string} input - 전체 입력 텍스트 (줄바꿈으로 구분)
     * @returns {{
     *   success: boolean,
     *   orders: ParsedOrder[],
     *   needsUnitCheck: ParsedOrder[],
     *   errors: string[],
     *   warnings: string[]
     * }}
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

        for (let i = 0; i < lines.length; i++) {
            const lineResult = parseLine(lines[i]);

            if (lineResult.success) {
                successCount++;

                for (const order of lineResult.orders) {
                    result.orders.push(order);

                    // 단위 확인 필요 (null인 경우)
                    // 비급여 코드와 평가 코드는 제외
                    if (order.unit === null &&
                        !isNonReimbursableCode(order.code) &&
                        !order.isEvaluation) {
                        result.needsUnitCheck.push(order);
                    }
                }
            } else {
                result.errors.push(`${i + 1}번째 줄: ${lineResult.error}`);
            }
        }

        // 일부라도 성공하면 success
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

    /**
     * 단위 확인이 필요한 오더에 단위 적용
     *
     * @param {ParsedOrder[]} orders - 전체 오더 목록
     * @param {Object.<string, number>} unitMap - 오더 키 → 단위 맵
     * @returns {ParsedOrder[]}
     */
    function applyUnits(orders, unitMap) {
        return orders.map(order => {
            // 이미 단위가 있으면 그대로
            if (order.unit !== null) {
                return order;
            }

            // unitMap에서 찾기
            const key = createOrderKey(order);
            const unit = unitMap[key] !== undefined ? unitMap[key] : DEFAULT_UNIT;

            return {
                ...order,
                unit: unit,
                rawCode: order.code + unit
            };
        });
    }

    /**
     * 오더의 고유 키 생성 (단위 확인용)
     * @param {ParsedOrder} order
     * @returns {string}
     */
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

        // 유틸리티 노출 (테스트용)
        _splitOrderCodes: splitOrderCodes,
        _parseOrderCode: parseOrderCode,
        _getTherapyType: getTherapyType
    };
})();
