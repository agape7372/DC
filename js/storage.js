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
        clearAll
    };
})();
