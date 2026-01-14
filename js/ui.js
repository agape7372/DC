/**
 * 오더정리 앱 - UI 이벤트 핸들러 모듈
 *
 * 모든 DOM 조작과 이벤트 처리를 담당합니다.
 */

'use strict';

const UI = (function () {
    // ========================================
    // DOM 요소 참조
    // ========================================

    const elements = {
        // 설정 요소
        floorGroup: null,
        jobGroup: null,
        therapistGroup: null,
        dateInput: null,
        dateDisplay: null,

        // 입력/출력 요소
        addInputArea: null,
        deleteInputArea: null,
        outputArea: null,
        convertBtn: null,
        copyBtn: null,

        // 단위 확인 섹션
        unitCheckSection: null,
        unitCheckList: null,

        // 환자 데이터 섹션
        patientCount: null,
        uploadBtn: null,
        excelUpload: null,
        clearPatientBtn: null,

        // 치료사 모달
        therapistModal: null,
        therapistList: null,
        newTherapistName: null,
        addTherapistBtn: null,
        closeTherapistModal: null,
        manageTherapistBtn: null,

        // 환자 미리보기 모달
        patientPreviewModal: null,
        previewContent: null,
        previewTabs: null,
        addedCount: null,
        modifiedCount: null,
        allCount: null,
        applyPatientUpload: null,
        cancelPatientUpload: null,
        closePatientPreviewModal: null,

        // 토스트
        toast: null
    };

    // ========================================
    // 상태
    // ========================================

    let currentSettings = { ...DEFAULT_SETTINGS };
    let parsedAddOrders = [];
    let parsedDeleteOrders = [];
    let unitCheckOrders = [];
    let currentOrderType = null; // 'add' or 'delete' for unit check

    // ========================================
    // 초기화
    // ========================================

    /**
     * UI 초기화
     */
    function init() {
        cacheElements();
        loadSettings();
        bindEvents();
        renderTherapists();
        updatePatientCount();
        setDefaultDate();
    }

    /**
     * DOM 요소 캐시
     */
    function cacheElements() {
        elements.floorGroup = document.getElementById('floorGroup');
        elements.jobGroup = document.getElementById('jobGroup');
        elements.therapistGroup = document.getElementById('therapistGroup');
        elements.dateInput = document.getElementById('dateInput');
        elements.dateDisplay = document.getElementById('dateDisplay');

        elements.addInputArea = document.getElementById('addInputArea');
        elements.deleteInputArea = document.getElementById('deleteInputArea');
        elements.outputArea = document.getElementById('outputArea');
        elements.convertBtn = document.getElementById('convertBtn');
        elements.copyBtn = document.getElementById('copyBtn');
        elements.sortRmBtn = document.getElementById('sortRmBtn');
        elements.saveRmBtn = document.getElementById('saveRmBtn');

        elements.unitCheckSection = document.getElementById('unitCheckSection');
        elements.unitCheckList = document.getElementById('unitCheckList');

        elements.patientCount = document.getElementById('patientCount');
        elements.uploadBtn = document.getElementById('uploadBtn');
        elements.excelUpload = document.getElementById('excelUpload');
        elements.clearPatientBtn = document.getElementById('clearPatientBtn');

        elements.therapistModal = document.getElementById('therapistModal');
        elements.therapistList = document.getElementById('therapistList');
        elements.newTherapistName = document.getElementById('newTherapistName');
        elements.addTherapistBtn = document.getElementById('addTherapistBtn');
        elements.closeTherapistModal = document.getElementById('closeTherapistModal');
        elements.manageTherapistBtn = document.getElementById('manageTherapistBtn');

        elements.patientPreviewModal = document.getElementById('patientPreviewModal');
        elements.previewContent = document.getElementById('previewContent');
        elements.addedCount = document.getElementById('addedCount');
        elements.modifiedCount = document.getElementById('modifiedCount');
        elements.allCount = document.getElementById('allCount');
        elements.applyPatientUpload = document.getElementById('applyPatientUpload');
        elements.cancelPatientUpload = document.getElementById('cancelPatientUpload');
        elements.closePatientPreviewModal = document.getElementById('closePatientPreviewModal');

        elements.toast = document.getElementById('toast');
    }

    /**
     * 설정 불러오기
     */
    function loadSettings() {
        currentSettings = Storage.getSettings();

        // 버튼 그룹 선택 상태 복원
        if (currentSettings.floor) {
            selectButtonInGroup(elements.floorGroup, currentSettings.floor);
        }
        if (currentSettings.job) {
            selectButtonInGroup(elements.jobGroup, currentSettings.job);
        }
    }

    /**
     * 오늘 날짜 설정
     */
    function setDefaultDate() {
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        elements.dateInput.value = dateStr;
        updateDateDisplay();
    }

    // ========================================
    // 이벤트 바인딩
    // ========================================

    /**
     * 모든 이벤트 바인딩
     */
    function bindEvents() {
        // 버튼 그룹 이벤트
        bindButtonGroupEvents(elements.floorGroup, 'floor');
        bindButtonGroupEvents(elements.jobGroup, 'job');
        bindTherapistGroupEvents(); // 치료사 버튼 그룹 (한 번만 바인딩)

        // 날짜 변경
        elements.dateInput.addEventListener('change', updateDateDisplay);

        // 변환 버튼
        elements.convertBtn.addEventListener('click', handleConvert);

        // 복사 버튼
        elements.copyBtn.addEventListener('click', handleCopy);

        // RM 정렬 버튼
        elements.sortRmBtn.addEventListener('click', handleSortRm);

        // RM 저장 버튼
        elements.saveRmBtn.addEventListener('click', handleSaveRm);

        // 치료사 관리
        elements.manageTherapistBtn.addEventListener('click', openTherapistModal);
        elements.closeTherapistModal.addEventListener('click', closeTherapistModal);
        elements.addTherapistBtn.addEventListener('click', handleAddTherapist);
        elements.newTherapistName.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') handleAddTherapist();
        });

        // 환자 데이터 관리
        elements.uploadBtn.addEventListener('click', () => elements.excelUpload.click());
        elements.excelUpload.addEventListener('change', handleExcelUpload);
        elements.clearPatientBtn.addEventListener('click', handleClearPatients);

        // 환자 미리보기 모달
        elements.closePatientPreviewModal.addEventListener('click', closePatientPreviewModal);
        elements.cancelPatientUpload.addEventListener('click', closePatientPreviewModal);
        elements.applyPatientUpload.addEventListener('click', handleApplyPatients);

        // 미리보기 탭
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', handleTabClick);
        });

        // 모달 외부 클릭 닫기
        elements.therapistModal.addEventListener('click', function (e) {
            if (e.target === this) closeTherapistModal();
        });
        elements.patientPreviewModal.addEventListener('click', function (e) {
            if (e.target === this) closePatientPreviewModal();
        });
    }

    /**
     * 버튼 그룹 이벤트 바인딩
     */
    function bindButtonGroupEvents(group, settingKey) {
        if (!group) return;

        group.addEventListener('click', function (e) {
            const btn = e.target.closest('.btn-option');
            if (!btn) return;

            // 기존 선택 해제
            group.querySelectorAll('.btn-option').forEach(b => b.classList.remove('active'));

            // 새 선택
            btn.classList.add('active');

            // 설정 저장
            const value = btn.dataset.value;
            currentSettings[settingKey] = value;
            Storage.updateSetting(settingKey, value);
        });
    }

    // ========================================
    // 버튼 그룹 헬퍼
    // ========================================

    /**
     * 버튼 그룹에서 특정 값 선택
     */
    function selectButtonInGroup(group, value) {
        if (!group) return;

        group.querySelectorAll('.btn-option').forEach(btn => {
            if (btn.dataset.value === value) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // ========================================
    // 날짜 처리
    // ========================================

    /**
     * 날짜 표시 업데이트
     */
    function updateDateDisplay() {
        const dateValue = elements.dateInput.value;
        if (dateValue) {
            const date = new Date(dateValue + 'T00:00:00');
            elements.dateDisplay.textContent = formatDateKorean(date);
        }
    }

    // ========================================
    // 변환 처리
    // ========================================

    /**
     * 변환 버튼 클릭 핸들러
     */
    function handleConvert() {
        const addInput = elements.addInputArea.value.trim();
        const deleteInput = elements.deleteInputArea.value.trim();

        if (!addInput && !deleteInput) {
            showToast('입력 내용이 없습니다.', 'warning');
            return;
        }

        // 추가오더 파싱
        parsedAddOrders = [];
        let addUnitCheck = [];
        let allWarnings = [];
        let allErrors = [];
        if (addInput) {
            const addResult = Parser.parseInput(addInput);
            if (addResult.success || addResult.orders.length > 0) {
                parsedAddOrders = addResult.orders;
                addUnitCheck = addResult.needsUnitCheck;
            }
            if (addResult.errors.length > 0) {
                console.warn('추가오더 파싱 에러:', addResult.errors);
                allErrors.push(...addResult.errors.map(err => `[추가] ${err}`));
            }
            if (addResult.warnings.length > 0) {
                allWarnings.push(...addResult.warnings);
            }
        }

        // 삭제오더 파싱
        parsedDeleteOrders = [];
        let deleteUnitCheck = [];
        if (deleteInput) {
            const deleteResult = Parser.parseInput(deleteInput);
            if (deleteResult.success || deleteResult.orders.length > 0) {
                parsedDeleteOrders = deleteResult.orders;
                deleteUnitCheck = deleteResult.needsUnitCheck;
            }
            if (deleteResult.errors.length > 0) {
                console.warn('삭제오더 파싱 에러:', deleteResult.errors);
                allErrors.push(...deleteResult.errors.map(err => `[삭제] ${err}`));
            }
            if (deleteResult.warnings.length > 0) {
                allWarnings.push(...deleteResult.warnings);
            }
        }

        // 파싱 에러 표시 (최대 3개)
        if (allErrors.length > 0) {
            const errorMsg = allErrors.slice(0, 3).join('\n');
            const moreMsg = allErrors.length > 3 ? `\n... 외 ${allErrors.length - 3}개` : '';
            showToast('일부 라인 파싱 실패:\n' + errorMsg + moreMsg, 'warning');
        }

        // 경고 메시지 표시 (정의되지 않은 코드 등)
        if (allWarnings.length > 0) {
            showToast(allWarnings.join('\n'), 'warning');
        }

        // 단위 확인 필요 여부 (추가오더만 - 삭제오더는 단위 무시)
        unitCheckOrders = addUnitCheck;
        if (unitCheckOrders.length > 0) {
            showUnitCheckSection();
        } else {
            hideUnitCheckSection();
            generateOutput();
        }
    }

    /**
     * 단위 확인 섹션 표시
     */
    function showUnitCheckSection() {
        elements.unitCheckSection.style.display = 'block';
        renderUnitCheckList();
    }

    /**
     * 단위 확인 섹션 숨김
     */
    function hideUnitCheckSection() {
        elements.unitCheckSection.style.display = 'none';
        elements.unitCheckList.innerHTML = '';
    }

    /**
     * 단위 확인 목록 렌더링
     */
    function renderUnitCheckList() {
        const html = unitCheckOrders.map((order, index) => {
            const key = Parser.createOrderKey(order);
            const optionsHtml = UNIT_OPTIONS.map(u =>
                `<option value="${u}" ${u === DEFAULT_UNIT ? 'selected' : ''}>${u}</option>`
            ).join('');

            return `
                <div class="unit-check-item">
                    <span>${escapeHtml(order.therapist)}/${escapeHtml(order.patient)}/${escapeHtml(order.code)}</span>
                    <select class="unit-select" data-key="${escapeHtml(key)}" data-index="${index}">
                        ${optionsHtml}
                    </select>
                </div>
            `;
        }).join('');

        elements.unitCheckList.innerHTML = html;

        // 단위 변경 이벤트
        elements.unitCheckList.querySelectorAll('.unit-select').forEach(select => {
            select.addEventListener('change', function () {
                const index = parseInt(this.dataset.index);
                const unit = parseInt(this.value);
                unitCheckOrders[index].unit = unit;
            });
        });

        // 변환 버튼 클릭 시 단위 적용 후 출력
        const existingBtn = elements.unitCheckSection.querySelector('.btn-apply-unit');
        if (existingBtn) existingBtn.remove();

        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn-primary btn-apply-unit';
        applyBtn.textContent = '변환';
        applyBtn.style.marginTop = '12px';
        applyBtn.addEventListener('click', () => {
            applyUnitsAndGenerate();
        });
        elements.unitCheckList.appendChild(applyBtn);
    }

    /**
     * 단위 적용 후 출력 생성
     */
    function applyUnitsAndGenerate() {
        // 단위 맵 생성
        const unitMap = {};
        unitCheckOrders.forEach(order => {
            const key = Parser.createOrderKey(order);
            unitMap[key] = order.unit || DEFAULT_UNIT;
        });

        // 단위 적용 (추가오더에만)
        parsedAddOrders = Parser.applyUnits(parsedAddOrders, unitMap);

        hideUnitCheckSection();
        generateOutput();
    }

    /**
     * 출력 생성
     */
    function generateOutput() {
        const settings = {
            floor: currentSettings.floor,
            job: currentSettings.job,
            therapist: currentSettings.therapist,
            date: new Date(elements.dateInput.value + 'T00:00:00')
        };

        const result = Formatter.formatCombinedOutput(parsedAddOrders, parsedDeleteOrders, settings);
        elements.outputArea.textContent = result.output;

        // 미등록 환자 경고
        if (result.unregisteredPatients.length > 0) {
            const names = result.unregisteredPatients.join(', ');
            showToast(`미등록 환자: ${names}`, 'warning');
        } else {
            showToast('변환 완료!', 'success');
        }
    }

    // ========================================
    // 복사 처리
    // ========================================

    /**
     * 복사 버튼 클릭 핸들러
     */
    async function handleCopy() {
        const text = elements.outputArea.textContent;

        if (!text || text === '변환 결과가 여기에 표시됩니다.') {
            showToast('복사할 내용이 없습니다.', 'warning');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            elements.copyBtn.classList.add('copied');
            elements.copyBtn.textContent = '✓ 복사됨';
            showToast('클립보드에 복사되었습니다.', 'success');

            setTimeout(() => {
                elements.copyBtn.classList.remove('copied');
                elements.copyBtn.textContent = '📋 복사';
            }, 2000);
        } catch (err) {
            console.error('복사 실패:', err);
            showToast('복사에 실패했습니다.', 'error');
        }
    }

    // ========================================
    // RM 정렬
    // ========================================

    /**
     * RM 정렬 버튼 클릭 핸들러
     * 출력 텍스트에서 같은 RM끼리 그룹핑
     */
    function handleSortRm() {
        // innerText 사용 - contenteditable의 줄바꿈 보존
        const text = elements.outputArea.innerText;

        if (!text || text.trim() === '' || text === '변환 결과가 여기에 표시됩니다.') {
            showToast('정렬할 내용이 없습니다.', 'warning');
            return;
        }

        const sortedText = sortByRm(text);
        elements.outputArea.textContent = sortedText;
        showToast('RM별로 정렬 완료!', 'success');
    }

    /**
     * 텍스트를 RM별로 정렬
     * @param {string} text - 원본 텍스트
     * @returns {string} - 정렬된 텍스트
     */
    function sortByRm(text) {
        // 줄바꿈 정규화
        const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalizedText.split('\n');
        const result = [];

        let headerLines = [];
        let footerLines = [];
        let sections = []; // {title: '[추가 오더]' or '[삭제 오더]', dateSections: [...]}
        let currentSection = null;
        let currentDateSection = null;
        let currentRm = null;
        let currentRmLines = [];
        let inHeader = true;
        let foundFooter = false;

        for (const line of lines) {
            const trimmedLine = line.trim();

            // 푸터 감지
            if (trimmedLine.startsWith('부탁드립니다') || trimmedLine.startsWith('감사합니다')) {
                foundFooter = true;
            }

            if (foundFooter) {
                footerLines.push(line);
                continue;
            }

            // 섹션 헤더 감지 ([추가 오더], [삭제 오더])
            if (trimmedLine === '[추가 오더]' || trimmedLine === '[삭제 오더]') {
                inHeader = false;

                // 이전 RM 저장
                if (currentRm && currentRmLines.length > 0 && currentDateSection) {
                    currentDateSection.rmGroups.push({ rm: currentRm, lines: currentRmLines });
                }
                if (currentDateSection && currentSection) {
                    currentSection.dateSections.push(currentDateSection);
                }
                if (currentSection) {
                    sections.push(currentSection);
                }

                currentSection = { title: trimmedLine, dateSections: [] };
                currentDateSection = null;
                currentRm = null;
                currentRmLines = [];
                continue;
            }

            // 날짜 섹션 감지 (1.4 > 또는 1.4~~>>)
            if (/^\d+\.\d+\s*(>|~~>>)$/.test(trimmedLine)) {
                // 이전 RM 저장
                if (currentRm && currentRmLines.length > 0 && currentDateSection) {
                    currentDateSection.rmGroups.push({ rm: currentRm, lines: currentRmLines });
                }
                if (currentDateSection && currentSection) {
                    currentSection.dateSections.push(currentDateSection);
                }

                currentDateSection = { dateHeader: trimmedLine, rmGroups: [] };
                currentRm = null;
                currentRmLines = [];
                continue;
            }

            // RM 헤더 감지 (<RM1>, <RM?> 등)
            const rmMatch = trimmedLine.match(/^<(RM\d+|RM\?)>$/i);
            if (rmMatch) {
                // 이전 RM 저장
                if (currentRm && currentRmLines.length > 0 && currentDateSection) {
                    currentDateSection.rmGroups.push({ rm: currentRm, lines: currentRmLines });
                }

                currentRm = rmMatch[1].toUpperCase();
                currentRmLines = [];
                continue;
            }

            // 일반 라인
            if (inHeader) {
                headerLines.push(line);
            } else if (currentRm && currentDateSection) {
                if (trimmedLine) {
                    currentRmLines.push(trimmedLine);
                }
            }
        }

        // 마지막 RM 저장
        if (currentRm && currentRmLines.length > 0 && currentDateSection) {
            currentDateSection.rmGroups.push({ rm: currentRm, lines: currentRmLines });
        }
        if (currentDateSection && currentSection) {
            currentSection.dateSections.push(currentDateSection);
        }
        if (currentSection) {
            sections.push(currentSection);
        }

        // 결과 조립
        result.push(...headerLines);

        for (const section of sections) {
            result.push(section.title);

            for (const dateSection of section.dateSections) {
                result.push(dateSection.dateHeader);
                result.push('');

                // RM별로 그룹핑 및 병합
                const rmMap = new Map();
                for (const rmGroup of dateSection.rmGroups) {
                    if (!rmMap.has(rmGroup.rm)) {
                        rmMap.set(rmGroup.rm, []);
                    }
                    rmMap.get(rmGroup.rm).push(...rmGroup.lines);
                }

                // RM 정렬 (숫자순, RM?는 마지막)
                const sortedRms = Array.from(rmMap.keys()).sort((a, b) => {
                    if (a === 'RM?') return 1;
                    if (b === 'RM?') return -1;
                    const numA = parseInt(a.replace('RM', '')) || 999;
                    const numB = parseInt(b.replace('RM', '')) || 999;
                    return numA - numB;
                });

                for (const rm of sortedRms) {
                    result.push(`<${rm}>`);
                    result.push(...rmMap.get(rm));
                    result.push('');
                }
            }
        }

        result.push(...footerLines);

        return result.join('\n');
    }

    /**
     * RM 정보 저장
     */
    function handleSaveRm() {
        // innerText 사용 - contenteditable의 줄바꿈 보존
        const text = elements.outputArea.innerText;

        if (!text || text.trim() === '' || text === '변환 결과가 여기에 표시됩니다.') {
            showToast('저장할 내용이 없습니다.', 'warning');
            return;
        }

        // 출력 텍스트에서 환자 정보 추출
        const parseResult = Parser.parseOutputForPatients(text);

        if (parseResult.errors.length > 0) {
            showToast(parseResult.errors.join('\n'), 'warning');
            return;
        }

        if (parseResult.patients.length === 0) {
            showToast('저장할 환자 정보를 찾을 수 없습니다.', 'warning');
            return;
        }

        // Storage에 환자 데이터 저장
        const success = Storage.applyPatients(parseResult.patients);

        if (success) {
            // 저장 성공
            updatePatientCount();

            // 버튼 시각적 피드백
            elements.saveRmBtn.classList.add('saved');
            elements.saveRmBtn.textContent = '✓ 저장 완료';

            setTimeout(() => {
                elements.saveRmBtn.classList.remove('saved');
                elements.saveRmBtn.textContent = '💾 RM 저장';
            }, 2000);

            showToast(`${parseResult.patients.length}명의 환자 RM 정보 저장 완료!`, 'success');
        } else {
            showToast('저장 중 오류가 발생했습니다.', 'error');
        }
    }

    // ========================================
    // 치료사 관리
    // ========================================

    /**
     * 치료사 목록 렌더링
     */
    function renderTherapists() {
        const therapists = Storage.getTherapists();

        // 버튼 그룹 렌더링 (XSS 방지를 위해 escapeHtml 사용)
        const buttonsHtml = therapists.map(name =>
            `<button type="button" class="btn-option" data-value="${escapeHtml(name)}">${escapeHtml(name)}</button>`
        ).join('');
        elements.therapistGroup.innerHTML = buttonsHtml;

        // 저장된 치료사 선택
        if (currentSettings.therapist) {
            selectButtonInGroup(elements.therapistGroup, currentSettings.therapist);
        }

        // 모달 목록 렌더링
        renderTherapistList();
    }

    /**
     * 치료사 버튼 그룹 이벤트
     */
    function bindTherapistGroupEvents() {
        elements.therapistGroup.addEventListener('click', function (e) {
            const btn = e.target.closest('.btn-option');
            if (!btn) return;

            elements.therapistGroup.querySelectorAll('.btn-option').forEach(b =>
                b.classList.remove('active')
            );
            btn.classList.add('active');

            currentSettings.therapist = btn.dataset.value;
            Storage.updateSetting('therapist', btn.dataset.value);
        });
    }

    /**
     * 치료사 목록 (모달) 렌더링
     */
    function renderTherapistList() {
        const therapists = Storage.getTherapists();

        if (therapists.length === 0) {
            elements.therapistList.innerHTML =
                '<li class="empty-state">등록된 치료사가 없습니다.</li>';
            return;
        }

        const html = therapists.map(name => `
            <li>
                <span>${escapeHtml(name)}</span>
                <button type="button" class="btn-delete" data-name="${escapeHtml(name)}">삭제</button>
            </li>
        `).join('');

        elements.therapistList.innerHTML = html;

        // 삭제 버튼 이벤트
        elements.therapistList.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', function () {
                const name = this.dataset.name;
                handleDeleteTherapist(name);
            });
        });
    }

    /**
     * 치료사 모달 열기
     */
    function openTherapistModal() {
        renderTherapistList();
        elements.therapistModal.classList.add('active');
        elements.newTherapistName.focus();
    }

    /**
     * 치료사 모달 닫기
     */
    function closeTherapistModal() {
        elements.therapistModal.classList.remove('active');
        elements.newTherapistName.value = '';
    }

    /**
     * 치료사 추가 핸들러
     */
    function handleAddTherapist() {
        const name = elements.newTherapistName.value.trim();

        if (!name) {
            showToast('이름을 입력해주세요.', 'warning');
            return;
        }

        const success = Storage.addTherapist(name);

        if (success) {
            showToast(`${name} 추가됨`, 'success');
            elements.newTherapistName.value = '';
            renderTherapists();
        } else {
            showToast('이미 등록된 치료사입니다.', 'warning');
        }
    }

    /**
     * 치료사 삭제 핸들러
     */
    function handleDeleteTherapist(name) {
        if (!confirm(`${name}을(를) 삭제하시겠습니까?`)) return;

        const success = Storage.removeTherapist(name);

        if (success) {
            showToast(`${name} 삭제됨`, 'success');
            renderTherapists();

            // 현재 선택된 치료사였다면 선택 해제
            if (currentSettings.therapist === name) {
                currentSettings.therapist = null;
                Storage.updateSetting('therapist', null);
            }
        }
    }

    // ========================================
    // 환자 데이터 관리
    // ========================================

    /**
     * 환자 수 업데이트
     */
    function updatePatientCount() {
        const count = Storage.getPatientCount();
        elements.patientCount.textContent = `${count}명`;
    }

    /**
     * 엑셀 업로드 핸들러
     */
    async function handleExcelUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const result = await PatientManager.uploadAndPreview(file);
            // 미리보기 없이 바로 적용
            const success = PatientManager.applyPendingPatients();
            if (success) {
                updatePatientCount();
                const totalCount = result.added.length + result.modified.length + result.existing.length;
                showToast(`환자 ${totalCount}명 등록 완료 (추가: ${result.added.length}, 수정: ${result.modified.length})`, 'success');
            }
        } catch (error) {
            console.error('엑셀 업로드 오류:', error);
            showToast(error.message, 'error');
        }

        // 파일 입력 초기화 (같은 파일 재업로드 가능하게)
        e.target.value = '';
    }

    /**
     * 환자 미리보기 모달 표시
     */
    function showPatientPreviewModal(result) {
        elements.addedCount.textContent = result.added.length;
        elements.modifiedCount.textContent = result.modified.length;
        elements.allCount.textContent =
            result.added.length + result.modified.length + result.existing.length;

        // 기본 탭: 추가
        renderPreviewTab('added');

        elements.patientPreviewModal.classList.add('active');
    }

    /**
     * 환자 미리보기 모달 닫기
     */
    function closePatientPreviewModal() {
        elements.patientPreviewModal.classList.remove('active');
        PatientManager.cancelPending();
    }

    /**
     * 미리보기 탭 클릭 핸들러
     */
    function handleTabClick(e) {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tab = btn.dataset.tab;
        renderPreviewTab(tab);
    }

    /**
     * 미리보기 탭 내용 렌더링
     */
    function renderPreviewTab(tab) {
        const result = PatientManager.getMergeResult();
        if (!result) return;

        let patients = [];
        let className = '';

        switch (tab) {
            case 'added':
                patients = result.added;
                className = 'added';
                break;
            case 'modified':
                patients = result.modified;
                className = 'modified';
                break;
            case 'all':
                patients = [...result.added, ...result.modified, ...result.existing];
                className = '';
                break;
        }

        if (patients.length === 0) {
            elements.previewContent.innerHTML =
                '<div class="empty-state">데이터가 없습니다.</div>';
            return;
        }

        const html = patients.map(p => {
            let itemClass = className;
            if (tab === 'all') {
                if (result.added.some(a => a.name === p.name)) itemClass = 'added';
                else if (result.modified.some(m => m.name === p.name)) itemClass = 'modified';
            }

            let detail = `${escapeHtml(p.ward)} / ${escapeHtml(p.room)}`;
            if (p.previous) {
                detail += ` (이전: ${escapeHtml(p.previous.ward)} / ${escapeHtml(p.previous.room)})`;
            }

            return `
                <div class="preview-item ${itemClass}">
                    <div class="preview-item-name">${escapeHtml(p.name)}</div>
                    <div class="preview-item-detail">${detail}</div>
                </div>
            `;
        }).join('');

        elements.previewContent.innerHTML = html;
    }

    /**
     * 환자 데이터 적용 핸들러
     */
    function handleApplyPatients() {
        const success = PatientManager.applyPendingPatients();

        if (success) {
            updatePatientCount();
            closePatientPreviewModal();
            showToast('환자 데이터가 적용되었습니다.', 'success');
        } else {
            showToast('적용에 실패했습니다.', 'error');
        }
    }

    /**
     * 환자 데이터 초기화 핸들러
     */
    function handleClearPatients() {
        if (!confirm('모든 환자 데이터를 삭제하시겠습니까?')) return;

        const success = Storage.clearPatients();

        if (success) {
            updatePatientCount();
            showToast('환자 데이터가 초기화되었습니다.', 'success');
        }
    }

    // ========================================
    // 토스트 알림
    // ========================================

    /**
     * 토스트 메시지 표시
     * @param {string} message
     * @param {string} type - 'success' | 'error' | 'warning'
     */
    function showToast(message, type = '') {
        elements.toast.textContent = message;
        elements.toast.className = 'toast';

        if (type) {
            elements.toast.classList.add(type);
        }

        elements.toast.classList.add('show');

        setTimeout(() => {
            elements.toast.classList.remove('show');
        }, 3000);
    }

    // ========================================
    // Public API
    // ========================================

    return {
        init,
        showToast,
        updatePatientCount,
        renderTherapists
    };
})();
