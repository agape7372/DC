/**
 * 오더정리 앱 - localStorage 관리 모듈
 *
 * 치료사 목록, 환자 데이터, 설정을 localStorage에 저장하고 관리합니다.
 * 모든 저장/불러오기 작업은 이 모듈을 통해 수행됩니다.
 */

'use strict';

const Storage = (function () {
    // ========================================
    // Private 유틸리티 함수
    // ========================================

    /**
     * JSON을 안전하게 파싱
     * @param {string} jsonString - JSON 문자열
     * @param {*} defaultValue - 파싱 실패 시 반환할 기본값
     * @returns {*}
     */
    function safeJsonParse(jsonString, defaultValue) {
        if (!jsonString) return defaultValue;
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            console.error('JSON 파싱 오류:', error);
            return defaultValue;
        }
    }

    /**
     * localStorage에 안전하게 저장
     * @param {string} key - 저장 키
     * @param {*} value - 저장할 값
     * @returns {boolean} - 성공 여부
     */
    function safeSetItem(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('localStorage 저장 오류:', error);
            // 용량 초과 시 처리
            if (error.name === 'QuotaExceededError') {
                console.error('localStorage 용량 초과');
            }
            return false;
        }
    }

    /**
     * localStorage에서 안전하게 불러오기
     * @param {string} key - 불러올 키
     * @param {*} defaultValue - 없을 경우 기본값
     * @returns {*}
     */
    function safeGetItem(key, defaultValue) {
        try {
            const item = localStorage.getItem(key);
            return safeJsonParse(item, defaultValue);
        } catch (error) {
            console.error('localStorage 불러오기 오류:', error);
            return defaultValue;
        }
    }

    // ========================================
    // 치료사 관리
    // ========================================

    /**
     * 치료사 목록 불러오기
     * @returns {string[]}
     */
    function getTherapists() {
        return safeGetItem(STORAGE_KEYS.THERAPISTS, []);
    }

    /**
     * 치료사 목록 저장
     * @param {string[]} therapists
     * @returns {boolean}
     */
    function setTherapists(therapists) {
        if (!Array.isArray(therapists)) {
            console.error('치료사 목록은 배열이어야 합니다.');
            return false;
        }
        // 중복 제거 및 빈 문자열 제거
        const uniqueTherapists = [...new Set(therapists.filter(t => t && t.trim()))];
        return safeSetItem(STORAGE_KEYS.THERAPISTS, uniqueTherapists);
    }

    /**
     * 치료사 추가
     * @param {string} name - 치료사 이름
     * @returns {boolean}
     */
    function addTherapist(name) {
        if (!name || !name.trim()) {
            console.error('치료사 이름이 비어있습니다.');
            return false;
        }
        const therapists = getTherapists();
        const trimmedName = name.trim();

        // 중복 체크
        if (therapists.includes(trimmedName)) {
            console.warn('이미 등록된 치료사입니다:', trimmedName);
            return false;
        }

        therapists.push(trimmedName);
        return setTherapists(therapists);
    }

    /**
     * 치료사 삭제
     * @param {string} name - 치료사 이름
     * @returns {boolean}
     */
    function removeTherapist(name) {
        const therapists = getTherapists();
        const index = therapists.indexOf(name);

        if (index === -1) {
            console.warn('치료사를 찾을 수 없습니다:', name);
            return false;
        }

        therapists.splice(index, 1);
        return setTherapists(therapists);
    }

    // ========================================
    // 환자 데이터 관리
    // ========================================

    /**
     * 환자 데이터 불러오기
     * @returns {Object.<string, Patient>} - 환자명을 키로 하는 객체
     */
    function getPatients() {
        return safeGetItem(STORAGE_KEYS.PATIENTS, {});
    }

    /**
     * 환자 데이터 저장
     * @param {Object.<string, Patient>} patients
     * @returns {boolean}
     */
    function setPatients(patients) {
        if (!patients || typeof patients !== 'object') {
            console.error('환자 데이터는 객체여야 합니다.');
            return false;
        }
        return safeSetItem(STORAGE_KEYS.PATIENTS, patients);
    }

    /**
     * 환자 데이터 병합 (추가/수정)
     * @param {Array<Patient>} newPatients - 새로운 환자 목록
     * @returns {{added: Patient[], modified: Patient[], existing: Patient[]}}
     */
    function mergePatients(newPatients) {
        const currentPatients = getPatients();
        const result = {
            added: [],
            modified: [],
            existing: []
        };

        newPatients.forEach(patient => {
            if (!patient.name) return;

            const existing = currentPatients[patient.name];

            if (!existing) {
                // 새로운 환자
                result.added.push(patient);
            } else if (existing.ward !== patient.ward || existing.room !== patient.room) {
                // 변경된 환자
                result.modified.push({
                    ...patient,
                    previous: existing
                });
            } else {
                // 기존과 동일
                result.existing.push(patient);
            }
        });

        return result;
    }

    /**
     * 환자 데이터 적용 (병합 후 저장)
     * @param {Array<Patient>} newPatients - 새로운 환자 목록
     * @returns {boolean}
     */
    function applyPatients(newPatients) {
        const currentPatients = getPatients();

        newPatients.forEach(patient => {
            if (patient.name) {
                currentPatients[patient.name] = {
                    name: patient.name,
                    ward: patient.ward,
                    room: patient.room
                };
            }
        });

        return setPatients(currentPatients);
    }

    /**
     * 환자 데이터 초기화
     * @returns {boolean}
     */
    function clearPatients() {
        return setPatients({});
    }

    /**
     * 환자 수 조회
     * @returns {number}
     */
    function getPatientCount() {
        const patients = getPatients();
        return Object.keys(patients).length;
    }

    /**
     * 환자 정보 조회
     * @param {string} name - 환자명
     * @returns {Patient|null}
     */
    function getPatientByName(name) {
        if (!name) return null;
        const patients = getPatients();
        return patients[name] || null;
    }

    // ========================================
    // 설정 관리
    // ========================================

    /**
     * 설정 불러오기
     * @returns {Settings}
     */
    function getSettings() {
        return safeGetItem(STORAGE_KEYS.SETTINGS, { ...DEFAULT_SETTINGS });
    }

    /**
     * 설정 저장
     * @param {Settings} settings
     * @returns {boolean}
     */
    function setSettings(settings) {
        if (!settings || typeof settings !== 'object') {
            console.error('설정은 객체여야 합니다.');
            return false;
        }
        return safeSetItem(STORAGE_KEYS.SETTINGS, settings);
    }

    /**
     * 특정 설정 업데이트
     * @param {string} key - 설정 키
     * @param {*} value - 설정 값
     * @returns {boolean}
     */
    function updateSetting(key, value) {
        const settings = getSettings();
        settings[key] = value;
        return setSettings(settings);
    }

    // ========================================
    // 전체 초기화
    // ========================================

    /**
     * 모든 데이터 초기화
     * @returns {boolean}
     */
    function clearAll() {
        try {
            localStorage.removeItem(STORAGE_KEYS.THERAPISTS);
            localStorage.removeItem(STORAGE_KEYS.PATIENTS);
            localStorage.removeItem(STORAGE_KEYS.SETTINGS);
            return true;
        } catch (error) {
            console.error('초기화 오류:', error);
            return false;
        }
    }

    // ========================================
    // 백업/복원
    // ========================================

    /**
     * 모든 데이터를 JSON으로 내보내기
     * @returns {string} - JSON 문자열
     */
    function exportData() {
        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            therapists: getTherapists(),
            patients: getPatients(),
            settings: getSettings()
        };
        return JSON.stringify(data, null, 2);
    }

    /**
     * JSON 데이터를 가져와서 localStorage에 저장
     * @param {string} jsonString - JSON 문자열
     * @returns {{success: boolean, message: string}}
     */
    function importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);

            // 데이터 검증
            if (!data || typeof data !== 'object') {
                return { success: false, message: '잘못된 백업 파일 형식입니다.' };
            }

            // 버전 확인 (선택)
            if (data.version !== '1.0') {
                console.warn('다른 버전의 백업 파일:', data.version);
            }

            // 데이터 복원
            let restored = 0;

            if (data.therapists) {
                if (setTherapists(data.therapists)) {
                    restored++;
                }
            }

            if (data.patients) {
                if (setPatients(data.patients)) {
                    restored++;
                }
            }

            if (data.settings) {
                if (setSettings(data.settings)) {
                    restored++;
                }
            }

            if (restored === 0) {
                return { success: false, message: '복원할 데이터가 없습니다.' };
            }

            const exportDate = data.exportDate ? new Date(data.exportDate).toLocaleString('ko-KR') : '알 수 없음';
            return {
                success: true,
                message: `백업 데이터를 성공적으로 복원했습니다.\n백업 일시: ${exportDate}`
            };

        } catch (error) {
            console.error('데이터 복원 오류:', error);
            return { success: false, message: '백업 파일을 읽을 수 없습니다: ' + error.message };
        }
    }

    // ========================================
    // Public API
    // ========================================

    return {
        // 치료사
        getTherapists,
        setTherapists,
        addTherapist,
        removeTherapist,

        // 환자
        getPatients,
        setPatients,
        mergePatients,
        applyPatients,
        clearPatients,
        getPatientCount,
        getPatientByName,

        // 설정
        getSettings,
        setSettings,
        updateSetting,

        // 전체
        clearAll,

        // 백업/복원
        exportData,
        importData
    };
})();
