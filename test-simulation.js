// 완전한 파싱 시뮬레이션

// Constants 정의
const PHYSICAL_THERAPY_CODES = {
    general: ['CPM', 'F', 'M', 'M15', 'MM', 'N', 'N7', 'RG', 'RM', 'RN', 'P', 'RP'],
    evaluation: ['ROM', 'MMT', 'BBS']
};

const UNIT_15MIN_CODES = ['RG', 'RM', 'RN', 'RP', 'MM', 'RA', 'RD', 'RS'];

const ALL_PHYSICAL_CODES = [...PHYSICAL_THERAPY_CODES.general, ...PHYSICAL_THERAPY_CODES.evaluation];

function isPhysicalTherapyCode(code) {
    const upperCode = code.toUpperCase();
    if (upperCode === 'M7' || upperCode === 'N7') return true;
    return ALL_PHYSICAL_CODES.some(c => c.toUpperCase() === upperCode);
}

function is15MinUnitCode(code) {
    if (!code) return false;
    const upperCode = code.toUpperCase().replace(/\d+$/, '');
    return UNIT_15MIN_CODES.includes(upperCode);
}

function removeTimeInParens(str) {
    let result = str.replace(/\(\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?\)$/g, '');
    result = result.replace(/\(\d{4}(?:-\d{4})?\)$/g, '');
    return result;
}

function isOrderCodePattern(str) {
    const trimmed = str.trim();
    if (!trimmed) return false;

    const withoutTime = removeTimeInParens(trimmed);
    const upper = withoutTime.toUpperCase();

    if (!upper) return false;

    const baseCode = upper.replace(/\d+$/, '');
    if (baseCode && isPhysicalTherapyCode(baseCode)) {
        return true;
    }

    return false;
}

function calculateMinutesFromTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;

    const rangeMatch = timeStr.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
    if (rangeMatch) {
        const [, startHour, startMin, endHour, endMin] = rangeMatch.map(Number);
        let startTotal = startHour * 60 + startMin;
        let endTotal = endHour * 60 + endMin;

        if (endTotal < startTotal) {
            endTotal += 24 * 60;
        }

        return endTotal - startTotal;
    }

    return null;
}

function calculateUnitsFromTime(timeStr) {
    if (!timeStr) return null;

    const minutes = calculateMinutesFromTime(timeStr);
    if (minutes === null) return null;

    return Math.floor(minutes / 15);
}

// ===== 테스트 시작 =====

console.log('===== 완전 파싱 시뮬레이션 =====\n');

const testInput = "박수진/조민수2님 : RM(08:30-09:00)";
console.log('입력:', testInput);

// 1. 전처리
const timeInParensMatches = [];
let normalized = testInput.replace(/\([\d:-]+\)/g, (match) => {
    const placeholder = `__TIME${timeInParensMatches.length}__`;
    timeInParensMatches.push(match);
    return placeholder;
});

normalized = normalized
    .replace(/님/g, '')
    .replace(/[\/:\t]+/g, ' ')
    .trim();

timeInParensMatches.forEach((time, index) => {
    normalized = normalized.replace(`__TIME${index}__`, time);
});

console.log('\n[전처리] normalized:', normalized);

// 2. 토큰 분리
const tokens = normalized.split(/\s+/).filter(t => t);
console.log('[토큰 분리]:', tokens);

// 3. 토큰 파싱
let therapist = null;
let patient = null;
let orderCodes = [];

for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    console.log(`\n[토큰 ${i}] "${token}"`);

    // 이름 패턴?
    const namePattern = /^[가-힣]{2,4}\d*$/;
    if (namePattern.test(token)) {
        if (!therapist) {
            therapist = token;
            console.log('  → 치료사로 인식');
        } else if (!patient) {
            patient = token;
            console.log('  → 환자로 인식');
        }
        continue;
    }

    // 오더 코드?
    if (isOrderCodePattern(token)) {
        console.log('  → 오더 코드 패턴 인식');

        // 시간 추출
        const timeMatch = token.match(/\((\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?)\)/);
        const time = timeMatch ? timeMatch[1] : null;
        const code = removeTimeInParens(token);

        console.log('    - code:', code);
        console.log('    - time:', time);

        orderCodes.push({code, time});
        continue;
    }

    console.log('  → 인식 불가');
}

console.log('\n===== 파싱 결과 =====');
console.log('therapist:', therapist);
console.log('patient:', patient);
console.log('orderCodes:', JSON.stringify(orderCodes, null, 2));

// 4. 단위 계산
if (orderCodes.length > 0) {
    const orderInfo = orderCodes[0];
    console.log('\n===== 단위 계산 =====');
    console.log('code:', orderInfo.code);
    console.log('time:', orderInfo.time);
    console.log('is15MinUnitCode:', is15MinUnitCode(orderInfo.code));

    if (orderInfo.time) {
        const minutes = calculateMinutesFromTime(orderInfo.time);
        const units = calculateUnitsFromTime(orderInfo.time);
        console.log('minutes:', minutes);
        console.log('units:', units);
    }
}

console.log('\n===== 결론 =====');
if (patient && orderCodes.length > 0) {
    console.log('✅ 파싱 성공!');
    console.log(`예상 출력: ${patient}님 운동 - ${orderCodes[0].code}2`);
} else {
    console.log('❌ 파싱 실패!');
    if (!patient) console.log('  - 환자명 없음');
    if (orderCodes.length === 0) console.log('  - 오더 코드 없음');
}
