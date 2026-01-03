/**
 * 오더정리 앱 - 메인 초기화
 *
 * 앱 시작점. DOM 로드 완료 후 UI를 초기화합니다.
 */

'use strict';

(function () {
    // DOM 로드 완료 후 초기화
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

    function initApp() {
        try {
            UI.init();
            console.log('오더정리 앱이 초기화되었습니다.');
        } catch (error) {
            console.error('앱 초기화 오류:', error);
            alert('앱을 초기화하는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.');
        }
    }
})();
