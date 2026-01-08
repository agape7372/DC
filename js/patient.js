/**
 * 오더정리 앱 - 환자 마스터 데이터 관리 모듈
 *
 * 엑셀 파일에서 환자 데이터를 파싱하고 관리합니다.
 * SheetJS(xlsx) 라이브러리를 사용하여 엑셀 파일을 읽습니다.
 */

'use strict';

const PatientManager = (function () {
    // ========================================
    // Private 상태
    // ========================================

    let pendingPatients = []; // 적용 대기 중인 환자 데이터
    let mergeResult = null;   // 병합 결과

    // ========================================
    // 엑셀 파싱
    // ========================================

    /**
     * 시트 이름에서 전문/회복기 감지
     * @param {string} sheetName - 시트 이름
     * @returns {string} - '전문', '회복기', 또는 빈 문자열
     */
    function detectWardFromSheetName(sheetName) {
        if (!sheetName) return '';
        const name = sheetName.toLowerCase();
        if (name.includes('전문')) return '전문';
        if (name.includes('회복')) return '회복기';
        return '';
    }

    /**
     * 엑셀 파일 읽기
     *
     * @param {File} file - 업로드된 파일
     * @returns {Promise<Array<Patient>>}
     */
    function readExcelFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('파일이 없습니다.'));
                return;
            }

            // 파일 형식 체크
            const validTypes = [
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-excel'
            ];

            if (!validTypes.includes(file.type) &&
                !file.name.endsWith('.xlsx') &&
                !file.name.endsWith('.xls')) {
                reject(new Error('엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.'));
                return;
            }

            // XLSX 라이브러리 체크
            if (typeof XLSX === 'undefined') {
                reject(new Error('XLSX 라이브러리가 로드되지 않았습니다.'));
                return;
            }

            const reader = new FileReader();

            reader.onload = function (e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // 모든 시트에서 환자 데이터 수집
                    const allPatients = [];

                    for (const sheetName of workbook.SheetNames) {
                        const worksheet = workbook.Sheets[sheetName];

                        // 시트 이름에서 전문/회복기 감지
                        const wardFromSheet = detectWardFromSheetName(sheetName);

                        // 시트를 JSON으로 변환
                        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                            header: 1, // 배열 형태로
                            defval: '' // 빈 셀 기본값
                        });

                        const patients = parseExcelData(jsonData, wardFromSheet);
                        allPatients.push(...patients);
                    }

                    resolve(allPatients);
                } catch (error) {
                    console.error('엑셀 파싱 오류:', error);
                    reject(new Error('엑셀 파일을 읽는 중 오류가 발생했습니다.'));
                }
            };

            reader.onerror = function () {
                reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
            };

            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * 헤더 행에서 환자명 열 인덱스 찾기
     * @param {Array<Array<string>>} data - 엑셀 데이터
     * @returns {{headerRow: number, nameCol: number}|null}
     */
    function findNameColumnIndex(data) {
        // 처음 10행 내에서 헤더 찾기
        for (let i = 0; i < Math.min(10, data.length); i++) {
            const row = data[i];
            if (!row) continue;

            for (let j = 0; j < row.length; j++) {
                const cell = (row[j] || '').toString().toLowerCase();
                // "이름" 또는 "환자명" 열 찾기
                if (cell === '이름' || cell === '환자명' || cell === '성명' || cell === 'name') {
                    return { headerRow: i, nameCol: j };
                }
            }
        }
        return null;
    }

    /**
     * 엑셀 데이터 파싱
     *
     * 지원하는 형식:
     * 1. 헤더 기반: "이름" 또는 "환자명" 열 자동 감지
     * 2. 섹션별 ward 감지: "회복기 종료 90일 미만" → 전문으로 취급
     *
     * @param {Array<Array<string>>} data - 엑셀 데이터 (2D 배열)
     * @param {string} defaultWard - 시트에서 감지된 기본 병동 (전문/회복기)
     * @returns {Array<Patient>}
     */
    function parseExcelData(data, defaultWard = '') {
        const patients = [];

        if (!data || data.length === 0) {
            return patients;
        }

        // 섹션별 ward 추적 (회복기 시트 내 "회복기 종료 90일 미만" 섹션은 전문으로)
        let currentWard = defaultWard;
        let currentNameCol = -1;

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            const rowText = row.map(c => (c || '').toString()).join(' ');

            // 섹션 헤더 감지: "회복기 종료" 포함 시 전문으로 변경
            if (rowText.includes('회복기 종료') || rowText.includes('90일 미만 대상자')) {
                currentWard = '전문';
                continue;
            }

            // 새로운 섹션 시작 감지 (일반 회복기 섹션)
            // 괄호+숫자 패턴의 섹션 헤더 (예: "중추신경계(14)", "근골격계 60일 (2)")
            // "회복기 종료"가 아닌 다른 섹션은 defaultWard로 복원
            if (defaultWard === '회복기' && /[가-힣]+.*\(\d+\)/.test(rowText) &&
                !rowText.includes('종료')) {
                currentWard = '회복기';
            }

            // 환자명 열 헤더 찾기
            let foundHeader = false;
            for (let j = 0; j < row.length; j++) {
                const cell = (row[j] || '').toString().trim();
                if (cell === '이름' || cell === '환자명' || cell === '성명') {
                    currentNameCol = j;
                    foundHeader = true;
                    break;
                }
            }
            if (foundHeader) continue; // 헤더 행은 스킵

            // 환자명 열이 아직 감지 안됨
            if (currentNameCol < 0) continue;

            // 데이터 행에서 환자명 추출
            const name = (row[currentNameCol] || '').toString().trim();
            if (!name) continue;

            // 숫자만 있는 행 스킵 (인덱스 행)
            if (/^\d+$/.test(name)) continue;

            patients.push({
                name: name,
                ward: currentWard,
                room: ''
            });
        }

        // 헤더 기반 파싱 실패 시 기존 방식 사용
        if (patients.length === 0) {
            let startRow = 0;
            if (data[0] && typeof data[0][0] === 'string') {
                const firstCell = data[0][0].toString().toLowerCase();
                if (firstCell.includes('환자') ||
                    firstCell.includes('이름') ||
                    firstCell.includes('name')) {
                    startRow = 1;
                }
            }

            for (let i = startRow; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length === 0) continue;

                const patient = parsePatientRow(row, defaultWard);
                if (patient) {
                    patients.push(patient);
                }
            }
        }

        return patients;
    }

    /**
     * 단일 행에서 환자 정보 파싱
     *
     * @param {Array<string>} row - 행 데이터
     * @param {string} defaultWard - 시트에서 감지된 기본 병동
     * @returns {Patient|null}
     */
    function parsePatientRow(row, defaultWard = '') {
        if (!row || row.length === 0) return null;

        let name = '';
        let ward = '';
        let room = '';

        // 형식 1: 한 셀에 콤마로 구분
        if (row.length === 1 && typeof row[0] === 'string' && row[0].includes(',')) {
            const parts = row[0].split(',').map(p => p.trim());
            name = parts[0] || '';
            ward = parts[1] || '';
            room = parts[2] || '';
        }
        // 형식 2: 여러 열
        else if (row.length >= 3) {
            name = (row[0] || '').toString().trim();
            ward = (row[1] || '').toString().trim();
            room = (row[2] || '').toString().trim();
        }
        // 형식 3: 2열 (환자명, 병동+RM)
        else if (row.length === 2) {
            name = (row[0] || '').toString().trim();
            // 두 번째 열에서 병동과 RM 분리 시도
            const secondCell = (row[1] || '').toString().trim();
            const roomMatch = secondCell.match(/(RM\d+)/i);
            if (roomMatch) {
                room = roomMatch[1].toUpperCase();
                ward = secondCell.replace(room, '').trim();
            } else {
                ward = secondCell;
            }
        }
        // 형식 4: 1열만 (환자명만)
        else if (row.length === 1) {
            name = (row[0] || '').toString().trim();
        }

        // 이름이 없으면 무효
        if (!name) return null;

        // RM 번호 정규화
        room = normalizeRoomNumber(room);

        // 병동 정규화 (행 데이터 우선, 없으면 시트 이름에서 감지된 값 사용)
        ward = normalizeWard(ward) || defaultWard;

        return { name, ward, room };
    }

    /**
     * RM 번호 정규화
     * @param {string} room
     * @returns {string}
     */
    function normalizeRoomNumber(room) {
        if (!room) return '';

        const str = room.toString().trim().toUpperCase();

        // 이미 RM 형식이면 그대로
        if (str.startsWith('RM')) {
            return str;
        }

        // 숫자만 있으면 RM 붙이기
        if (/^\d+$/.test(str)) {
            return 'RM' + str;
        }

        return str;
    }

    /**
     * 병동 정규화
     * @param {string} ward
     * @returns {string}
     */
    function normalizeWard(ward) {
        if (!ward) return '';

        const str = ward.toString().trim();

        // 회복기/전문 확인
        if (str.includes('회복')) return '회복기';
        if (str.includes('전문')) return '전문';

        return str;
    }

    // ========================================
    // 데이터 관리
    // ========================================

    /**
     * 엑셀 파일 업로드 및 미리보기 준비
     *
     * @param {File} file
     * @returns {Promise<{added: Patient[], modified: Patient[], existing: Patient[]}>}
     */
    async function uploadAndPreview(file) {
        const patients = await readExcelFile(file);

        if (patients.length === 0) {
            throw new Error('유효한 환자 데이터가 없습니다.');
        }

        pendingPatients = patients;
        mergeResult = Storage.mergePatients(patients);

        return mergeResult;
    }

    /**
     * 미리보기된 데이터 적용
     *
     * @returns {boolean}
     */
    function applyPendingPatients() {
        if (pendingPatients.length === 0) {
            console.warn('적용할 환자 데이터가 없습니다.');
            return false;
        }

        const success = Storage.applyPatients(pendingPatients);

        if (success) {
            pendingPatients = [];
            mergeResult = null;
        }

        return success;
    }

    /**
     * 대기 중인 데이터 취소
     */
    function cancelPending() {
        pendingPatients = [];
        mergeResult = null;
    }

    /**
     * 현재 병합 결과 조회
     * @returns {{added: Patient[], modified: Patient[], existing: Patient[]}|null}
     */
    function getMergeResult() {
        return mergeResult;
    }

    // ========================================
    // Public API
    // ========================================

    return {
        readExcelFile,
        uploadAndPreview,
        applyPendingPatients,
        cancelPending,
        getMergeResult,

        // 유틸리티 노출 (테스트용)
        _parseExcelData: parseExcelData,
        _parsePatientRow: parsePatientRow,
        _normalizeRoomNumber: normalizeRoomNumber,
        _normalizeWard: normalizeWard
    };
})();
