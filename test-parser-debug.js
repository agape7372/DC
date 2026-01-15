// Node.js 테스트 스크립트
// 파싱 로직 검증

const testInput = "박수진/조민수2님 : RM(08:30-09:00)";

console.log('=== 테스트 시작 ===');
console.log('입력:', testInput);

// 1. 전처리 시뮬레이션
let line = testInput;

// 1-1. 괄호 안 시간 플레이스홀더
const timeInParensMatches = [];
let normalized = line.replace(/\([\d:-]+\)/g, (match) => {
    const placeholder = `__TIME${timeInParensMatches.length}__`;
    timeInParensMatches.push(match);
    console.log(`\n[1-1] 괄호 시간 추출: "${match}" → "${placeholder}"`);
    return placeholder;
});
console.log('[1-1] 결과:', normalized);
console.log('[1-1] timeInParensMatches:', timeInParensMatches);

// 1-2. 전처리
normalized = normalized
    .replace(/님/g, '')
    .replace(/[\/:\t]+/g, ' ')
    .replace(/1:1가산체크란\s*없음/g, '')
    .trim();
console.log('\n[1-2] 구분자 처리 후:', normalized);

// 1-3. 복원
timeInParensMatches.forEach((time, index) => {
    const before = normalized;
    normalized = normalized.replace(`__TIME${index}__`, time);
    console.log(`[1-3] 복원 ${index}: "${before}" → "${normalized}"`);
});
console.log('[1-3] 최종 normalized:', normalized);

// 2. 토큰 분리
const tokens = normalized.split(/\s+/).filter(t => t);
console.log('\n[2] 토큰:', tokens);

// 3. 각 토큰 분석
console.log('\n[3] 토큰 분석:');
tokens.forEach((token, i) => {
    console.log(`\n토큰 ${i}: "${token}"`);

    // 시간 패턴?
    const isTime = /^\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?$/.test(token);
    const isTimeInParens = /^\([\d:-]+\)$/.test(token);
    console.log(`  - 시간 패턴: ${isTime || isTimeInParens}`);

    // 한글 이름?
    const isName = /^[가-힣]{2,4}\d*$/.test(token);
    console.log(`  - 이름 패턴: ${isName}`);

    // 괄호 포함?
    const hasParens = token.includes('(');
    console.log(`  - 괄호 포함: ${hasParens}`);

    if (hasParens) {
        // 괄호 안 시간 추출
        const timeMatch = token.match(/\((\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?)\)/);
        if (timeMatch) {
            console.log(`  - 괄호 안 시간: "${timeMatch[1]}"`);
        }

        // 코드 부분
        const codeOnly = token.replace(/\([\d:-]+\)/, '');
        console.log(`  - 코드 부분: "${codeOnly}"`);
    }
});

console.log('\n=== 테스트 완료 ===');
