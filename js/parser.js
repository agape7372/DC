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
     * 시간 패턴인지 확인
     * @param {string} str
     * @returns {boolean}
     */
    function isTimePattern(str) {
        const trimmed = str.trim();
        // HH:MM 또는 HH:MM-HH:MM
        return /^\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?$/.test(trimmed);
    }

    /**
     * 오더 코드 패턴인지 확인
     * @param {string} str
     * @returns {boolean}
     */
    function isOrderCodePattern(str) {
        const upper = str.trim().toUpperCase();
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

        // 한글 이름 패턴 (2-4자) - 오더 코드 아닌 경우
        if (/^[가-힣]{2,4}$/.test(trimmed) && !isOrderCodePattern(trimmed)) {
            return true;
        }

        return false;
    }

    /**
     * 오더 코드를 개별 코드로 분리
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

        // 복합 오더 분리
        const expandedCodes = [];
        for (const code of rawCodes) {
            const expanded = expandCompoundCode(code);
            expandedCodes.push(...expanded);
        }

        return expandedCodes;
    }

    /**
     * 복합 오더 코드 분리
     * CA → C1, A1 (숫자 없으면 기본 1단위)
     * C2A1 → C2, A1
     */
    function expandCompoundCode(code) {
        if (!code) return [];

        const upperCode = code.toUpperCase();

        // 비급여/평가 코드는 분리하지 않음
        if (isNonReimbursableCode(upperCode) || isEvaluationCode(upperCode)) {
            return [upperCode];
        }

        // 복합 코드 패턴
        const pattern = /([A-Z]+)(\d*)/g;
        const matches = [...upperCode.matchAll(pattern)];
        const reconstructed = matches.map(m => m[0]).join('');

        if (matches.length >= 2 && reconstructed === upperCode) {
            const allValid = matches.every(m => {
                const codeOnly = m[1];
                return isPhysicalTherapyCode(codeOnly) || isOccupationalTherapyCode(codeOnly);
            });

            if (allValid) {
                // 숫자가 하나도 없으면 각각 1단위로 처리
                const hasAnyNumber = matches.some(m => m[2] && m[2].length > 0);
                return matches.map(m => {
                    const codeOnly = m[1];
                    const unit = m[2] || (hasAnyNumber ? '' : '1');
                    return codeOnly + unit;
                }).filter(c => c.length > 0);
            }
        }

        return [code];
    }

    /**
     * 오더 코드 파싱 (코드와 단위 분리)
     */
    function parseOrderCode(rawCode) {
        if (!rawCode) {
            return { code: '', unit: null, raw: '' };
        }

        const trimmedCode = rawCode.trim().toUpperCase();

        // 비급여 코드
        if (isNonReimbursableCode(trimmedCode)) {
            return { code: trimmedCode, unit: 1, raw: trimmedCode };
        }

        // 일반 코드: 숫자 분리
        const match = trimmedCode.match(PATTERNS.ORDER_CODE);
        if (!match) {
            return { code: trimmedCode, unit: null, raw: trimmedCode };
        }

        const [, codeOnly, unitStr] = match;
        return {
            code: codeOnly,
            unit: unitStr ? parseInt(unitStr, 10) : null,
            raw: trimmedCode
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

        for (const field of fields) {
            // 가산오류 텍스트 제거
            const cleanField = field.replace(PATTERNS.EXTRA_ERROR, '').trim();
            if (!cleanField) continue;

            // 1. 시간 패턴?
            if (isTimePattern(cleanField)) {
                time = cleanField;
                continue;
            }

            // 2. 필드를 공백/콤마로 분리해서 개별 분석
            const subParts = cleanField.split(/[,\s]+/).filter(c => c);

            for (const part of subParts) {
                // 시간 패턴?
                if (isTimePattern(part)) {
                    time = part;
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

                // 한글 2-4자면 이름으로 추정
                if (/^[가-힣]{2,4}$/.test(part)) {
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
        for (const rawCode of orderCodes) {
            const parsed = parseOrderCode(rawCode);
            const therapyType = getTherapyType(parsed.code);

            if (therapyType === 'unknown') {
                console.warn(`알 수 없는 오더 코드: ${rawCode}`);
            }

            result.orders.push({
                therapist: therapist || '',
                patient: patient,
                code: parsed.code,
                unit: parsed.unit,
                time: time || '',
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

        for (let i = 0; i < lines.length; i++) {
            const lineResult = parseLine(lines[i]);

            if (lineResult.success) {
                successCount++;

                for (const order of lineResult.orders) {
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
