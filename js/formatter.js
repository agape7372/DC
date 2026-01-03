/**
 * 오더정리 앱 - 출력 변환 모듈
 *
 * 파싱된 오더 데이터를 메신저 양식으로 변환합니다.
 *
 * 출력 형식:
 * 안녕하세요, [N]층 [직종] [이름]입니다.
 * 추가오더 및 삭제오더 명단 보내드립니다.
 *
 * [추가/삭제 오더]
 * M.D >
 *
 * <RM번호>
 * 병동구분 환자명님 치료유형 - 오더코드
 */

'use strict';

const Formatter = (function () {
    // ========================================
    // Private 유틸리티 함수
    // ========================================

    /**
     * 오더 코드 포맷팅
     * @param {ParsedOrder} order
     * @returns {string}
     */
    function formatOrderCode(order) {
        if (order.isEvaluation) {
            return order.code;
        }

        // 비급여 코드는 그대로
        if (isNonReimbursableCode(order.code)) {
            return order.code;
        }

        // 일반 코드: 코드 + 단위
        return order.code + (order.unit || DEFAULT_UNIT);
    }

    /**
     * 치료 유형 한글 변환
     * @param {string} type - 'physical' | 'occupational'
     * @returns {string}
     */
    function getTherapyTypeName(type) {
        switch (type) {
            case THERAPY_TYPE.PHYSICAL:
                return '운동';
            case THERAPY_TYPE.OCCUPATIONAL:
                return '작업';
            default:
                return '치료';
        }
    }

    // ========================================
    // 오더 그룹핑
    // ========================================

    /**
     * 오더를 RM별, 환자별로 그룹핑
     *
     * @param {ParsedOrder[]} orders - 파싱된 오더 목록
     * @returns {Map<string, Map<string, {ward: string, orders: ParsedOrder[], hasExtraError: boolean}>>}
     */
    function groupOrders(orders) {
        // RM → 환자 → 오더 구조
        const roomMap = new Map();

        for (const order of orders) {
            // 환자 정보 조회
            const patient = Storage.getPatientByName(order.patient);
            const room = patient?.room || 'RM?';
            const ward = patient?.ward || '미등록';

            // RM 그룹
            if (!roomMap.has(room)) {
                roomMap.set(room, new Map());
            }
            const patientMap = roomMap.get(room);

            // 환자 그룹
            if (!patientMap.has(order.patient)) {
                patientMap.set(order.patient, {
                    ward: ward,
                    orders: [],
                    hasExtraError: false
                });
            }

            const patientData = patientMap.get(order.patient);
            patientData.orders.push(order);

            if (order.hasExtraError) {
                patientData.hasExtraError = true;
            }
        }

        return roomMap;
    }

    /**
     * 환자의 오더를 치료 유형별로 분리
     *
     * @param {ParsedOrder[]} orders
     * @returns {{physical: ParsedOrder[], occupational: ParsedOrder[]}}
     */
    function separateByTherapyType(orders) {
        const result = {
            physical: [],
            occupational: []
        };

        for (const order of orders) {
            if (order.therapyType === THERAPY_TYPE.PHYSICAL) {
                result.physical.push(order);
            } else if (order.therapyType === THERAPY_TYPE.OCCUPATIONAL) {
                result.occupational.push(order);
            }
        }

        return result;
    }

    /**
     * 오더 목록을 코드 문자열로 변환
     *
     * 같은 코드는 합치지 않고 개별 표시
     * 예: [RG2, RG2, M7] → "RG2 RG2 M7" 또는 복잡하면 "RG4 M7"
     *
     * @param {ParsedOrder[]} orders
     * @returns {string}
     */
    function formatOrderCodes(orders) {
        if (orders.length === 0) return '';

        // 같은 코드끼리 단위 합산
        const codeMap = new Map();

        for (const order of orders) {
            const code = order.code;

            // 비급여 코드나 평가 코드는 합산하지 않음
            if (isNonReimbursableCode(code) || order.isEvaluation) {
                const key = formatOrderCode(order);
                codeMap.set(key, (codeMap.get(key) || 0) + 1);
            } else {
                // 일반 코드: 단위 합산
                const currentUnit = codeMap.get(code) || 0;
                codeMap.set(code, currentUnit + (order.unit || DEFAULT_UNIT));
            }
        }

        // 코드 문자열 생성
        const codeParts = [];

        for (const [code, value] of codeMap) {
            // 이미 포맷된 비급여/평가 코드
            if (isNonReimbursableCode(code) || isEvaluationCode(code)) {
                codeParts.push(code);
            } else {
                // 일반 코드 + 총 단위
                codeParts.push(code + value);
            }
        }

        return codeParts.join(' ');
    }

    // ========================================
    // 환자 라인 포맷팅
    // ========================================

    /**
     * 단일 환자의 오더 라인 생성
     *
     * 형식:
     * - 운동만: "회복기 김원순님 운동 - M7"
     * - 작업만: "전문 박진희님 작업 - C1A1"
     * - 둘 다: "회복기 김원순님 운동/작업 - M7 / C1A1"
     * - 가산오류만: "회복기 문두순님 가산오류 있습니다."
     * - 오더+가산오류: "회복기 문두순님 운동 - RG2\n회복기 문두순님 가산오류 있습니다."
     *
     * @param {string} patientName - 환자명
     * @param {string} ward - 병동구분
     * @param {ParsedOrder[]} orders - 오더 목록
     * @param {boolean} hasExtraError - 가산오류 여부
     * @returns {string}
     */
    function formatPatientLine(patientName, ward, orders, hasExtraError) {
        const lines = [];

        // 가산오류만 있는 경우
        if (hasExtraError && orders.length === 0) {
            return `${ward} ${patientName}님 가산오류 있습니다.`;
        }

        const { physical, occupational } = separateByTherapyType(orders);

        const hasPhysical = physical.length > 0;
        const hasOccupational = occupational.length > 0;

        if (hasPhysical || hasOccupational) {
            // 치료 유형 텍스트
            let therapyText = '';
            if (hasPhysical && hasOccupational) {
                therapyText = '운동/작업';
            } else if (hasPhysical) {
                therapyText = '운동';
            } else if (hasOccupational) {
                therapyText = '작업';
            }

            // 오더 코드 텍스트
            let codeText = '';
            if (hasPhysical && hasOccupational) {
                const physicalCodes = formatOrderCodes(physical);
                const occupationalCodes = formatOrderCodes(occupational);
                codeText = `${physicalCodes} / ${occupationalCodes}`;
            } else if (hasPhysical) {
                codeText = formatOrderCodes(physical);
            } else if (hasOccupational) {
                codeText = formatOrderCodes(occupational);
            }

            lines.push(`${ward} ${patientName}님 ${therapyText} - ${codeText}`);
        }

        // 가산오류가 있으면 별도 라인으로 추가
        if (hasExtraError) {
            lines.push(`${ward} ${patientName}님 가산오류 있습니다.`);
        }

        return lines.join('\n');
    }

    // ========================================
    // 전체 출력 생성
    // ========================================

    /**
     * 오더를 평가/치료로 분리
     * @param {ParsedOrder[]} orders
     * @returns {{evaluation: ParsedOrder[], treatment: ParsedOrder[]}}
     */
    function separateByEvaluation(orders) {
        const evaluation = [];
        const treatment = [];

        for (const order of orders) {
            if (order.isEvaluation) {
                evaluation.push(order);
            } else {
                treatment.push(order);
            }
        }

        return { evaluation, treatment };
    }

    /**
     * 특정 오더 목록에 대한 RM별 섹션 생성
     * @param {ParsedOrder[]} orders
     * @param {Set} unregisteredPatients - 미등록 환자 수집용
     * @returns {string[]}
     */
    function formatOrderSection(orders, unregisteredPatients) {
        if (orders.length === 0) return [];

        const lines = [];
        const groupedOrders = groupOrders(orders);

        // 미등록 환자 수집
        for (const [room, patientMap] of groupedOrders) {
            if (room === 'RM?') {
                for (const [patientName] of patientMap) {
                    unregisteredPatients.add(patientName);
                }
            }
        }

        // RM 정렬 (RM1, RM2, ..., RM?)
        const sortedRooms = Array.from(groupedOrders.keys()).sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, '')) || 999;
            const numB = parseInt(b.replace(/\D/g, '')) || 999;
            return numA - numB;
        });

        for (const room of sortedRooms) {
            const patientMap = groupedOrders.get(room);

            lines.push(`<${room}>`);

            // 환자별 출력
            for (const [patientName, data] of patientMap) {
                const line = formatPatientLine(
                    patientName,
                    data.ward,
                    data.orders,
                    data.hasExtraError
                );
                lines.push(line);
            }

            lines.push('');
        }

        return lines;
    }

    /**
     * 메신저 양식 생성
     *
     * 평가 오더는 > (당일), 치료 오더는 ~~>> (계속)으로 자동 분리
     *
     * @param {ParsedOrder[]} orders - 파싱된 오더 목록
     * @param {Object} settings - 설정
     * @param {string} settings.floor - 층
     * @param {string} settings.job - 직종
     * @param {string} settings.therapist - 치료사명
     * @param {Date} settings.date - 날짜
     * @param {string} settings.orderType - 구분 (add/delete)
     * @returns {{output: string, unregisteredPatients: string[]}}
     */
    function formatOutput(orders, settings) {
        if (!orders || orders.length === 0) {
            return {
                output: '변환할 오더가 없습니다.',
                unregisteredPatients: []
            };
        }

        const lines = [];
        const unregisteredPatients = new Set();

        // 인사말
        const floor = settings.floor || '?';
        const job = settings.job || '치료사';
        const therapist = settings.therapist || '(이름)';

        lines.push(`안녕하세요, ${floor}층 ${job} ${therapist}입니다.`);
        lines.push('추가오더 및 삭제오더 명단 보내드립니다.');
        lines.push('');

        // 오더 유형 헤더
        const orderTypeText = settings.orderType === ORDER_TYPE.DELETE
            ? '[삭제 오더]'
            : '[추가 오더]';
        lines.push(orderTypeText);

        // 날짜
        const date = settings.date || new Date();
        const dateStr = formatDateMD(date);

        // 평가/치료 오더 분리
        const { evaluation, treatment } = separateByEvaluation(orders);

        // 평가 오더 출력 (> 사용)
        if (evaluation.length > 0) {
            lines.push(dateStr + ' >');
            lines.push('');
            const evalLines = formatOrderSection(evaluation, unregisteredPatients);
            lines.push(...evalLines);
        }

        // 치료 오더 출력 (~~>> 사용)
        if (treatment.length > 0) {
            lines.push(dateStr + '~~>>');
            lines.push('');
            const treatmentLines = formatOrderSection(treatment, unregisteredPatients);
            lines.push(...treatmentLines);
        }

        // 마무리
        lines.push('부탁드립니다, 감사합니다!');

        return {
            output: lines.join('\n'),
            unregisteredPatients: Array.from(unregisteredPatients)
        };
    }

    /**
     * 추가오더 + 삭제오더 합쳐서 메신저 양식 생성
     *
     * @param {ParsedOrder[]} addOrders - 추가 오더 목록
     * @param {ParsedOrder[]} deleteOrders - 삭제 오더 목록
     * @param {Object} settings - 설정
     * @returns {{output: string, unregisteredPatients: string[]}}
     */
    function formatCombinedOutput(addOrders, deleteOrders, settings) {
        const hasAdd = addOrders && addOrders.length > 0;
        const hasDelete = deleteOrders && deleteOrders.length > 0;

        if (!hasAdd && !hasDelete) {
            return {
                output: '변환할 오더가 없습니다.',
                unregisteredPatients: []
            };
        }

        const lines = [];
        const unregisteredPatients = new Set();

        // 인사말
        const floor = settings.floor || '?';
        const job = settings.job || '치료사';
        const therapist = settings.therapist || '(이름)';

        lines.push(`안녕하세요, ${floor}층 ${job} ${therapist}입니다.`);
        lines.push('추가오더 및 삭제오더 명단 보내드립니다.');
        lines.push('');

        // 날짜
        const date = settings.date || new Date();
        const dateStr = formatDateMD(date);

        // ========== 추가 오더 ==========
        if (hasAdd) {
            lines.push('[추가 오더]');

            const { evaluation, treatment } = separateByEvaluation(addOrders);

            // 평가 오더 출력 (> 사용)
            if (evaluation.length > 0) {
                lines.push(dateStr + ' >');
                lines.push('');
                const evalLines = formatOrderSection(evaluation, unregisteredPatients);
                lines.push(...evalLines);
            }

            // 치료 오더 출력 (~~>> 사용)
            if (treatment.length > 0) {
                lines.push(dateStr + '~~>>');
                lines.push('');
                const treatmentLines = formatOrderSection(treatment, unregisteredPatients);
                lines.push(...treatmentLines);
            }
        }

        // ========== 삭제 오더 ==========
        if (hasDelete) {
            lines.push('[삭제 오더]');

            const { evaluation, treatment } = separateByEvaluation(deleteOrders);

            // 평가 오더 출력 (> 사용)
            if (evaluation.length > 0) {
                lines.push(dateStr + ' >');
                lines.push('');
                const evalLines = formatOrderSection(evaluation, unregisteredPatients);
                lines.push(...evalLines);
            }

            // 치료 오더 출력 (~~>> 사용)
            if (treatment.length > 0) {
                lines.push(dateStr + '~~>>');
                lines.push('');
                const treatmentLines = formatOrderSection(treatment, unregisteredPatients);
                lines.push(...treatmentLines);
            }
        }

        // 마무리
        lines.push('부탁드립니다, 감사합니다!');

        return {
            output: lines.join('\n'),
            unregisteredPatients: Array.from(unregisteredPatients)
        };
    }

    // ========================================
    // Public API
    // ========================================

    return {
        formatOutput,
        formatCombinedOutput,
        groupOrders,

        // 유틸리티 노출 (테스트용)
        _formatOrderCode: formatOrderCode,
        _formatOrderCodes: formatOrderCodes,
        _formatPatientLine: formatPatientLine,
        _separateByTherapyType: separateByTherapyType
    };
})();
