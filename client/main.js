/**
 * main.js — 클라이언트 통합 모듈
 *
 * TabMonitor → 백엔드 Focus-Harness API 연동
 * SpeechCapture → 백엔드 Lapse-Harness API 연동
 *
 * Requirements: 4.1, 4.2, 7.1, 7.3
 */

const ClientMain = (() => {
  const API_BASE = window.location.origin || 'http://localhost:3000';

  let _sessionId = null;
  let _running = false;

  /**
   * 백엔드 API에 POST 요청을 보낸다.
   */
  async function _post(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  /**
   * TabMonitor 탭 전환 이벤트를 백엔드 Focus-Harness API로 전달한다.
   */
  async function _onTabSwitch(event) {
    if (!_sessionId) return;
    try {
      const result = await _post('/api/focus/tab-switch', {
        sessionId: _sessionId,
        targetUrl: event.targetUrl,
        timestamp: event.timestamp.toISOString(),
      });

      // 설득 메시지가 있으면 알림 표시
      if (result.persuasion && typeof Notification !== 'undefined' && Notification.showNotification) {
        Notification.showNotification(result.persuasion);
      }
    } catch (err) {
      console.error('[ClientMain] tab-switch API error:', err);
    }
  }

  /**
   * TabMonitor 탭 복귀 이벤트를 백엔드 Focus-Harness API로 전달한다.
   */
  async function _onTabReturn(event) {
    if (!_sessionId) return;
    try {
      await _post('/api/focus/tab-return', {
        sessionId: _sessionId,
        timestamp: event.returnTimestamp.toISOString(),
      });
    } catch (err) {
      console.error('[ClientMain] tab-return API error:', err);
    }
  }

  /**
   * 세션을 시작하고 모든 클라이언트 모듈을 활성화한다.
   * @param {string} sessionId - 백엔드에서 생성된 세션 ID
   */
  function start(sessionId) {
    if (_running) return;
    if (!sessionId) throw new Error('[ClientMain] sessionId is required');

    _sessionId = sessionId;
    _running = true;

    // TabMonitor → Focus-Harness API 연동
    if (typeof TabMonitor !== 'undefined') {
      TabMonitor.on('tabSwitch', _onTabSwitch);
      TabMonitor.on('tabReturn', _onTabReturn);
      TabMonitor.startMonitoring(sessionId);
    }

    // SpeechCapture → Lapse-Harness API 연동
    if (typeof SpeechCapture !== 'undefined') {
      SpeechCapture.startCapture(sessionId, API_BASE);
    }
  }

  /**
   * 세션을 종료하고 모든 클라이언트 모듈을 비활성화한다.
   */
  function stop() {
    if (!_running) return;

    if (typeof TabMonitor !== 'undefined') {
      TabMonitor.off('tabSwitch', _onTabSwitch);
      TabMonitor.off('tabReturn', _onTabReturn);
      TabMonitor.stopMonitoring();
    }

    if (typeof SpeechCapture !== 'undefined') {
      SpeechCapture.stopCapture();
    }

    _sessionId = null;
    _running = false;
  }

  /**
   * 현재 실행 중인지 여부를 반환한다.
   * @returns {boolean}
   */
  function isRunning() {
    return _running;
  }

  return { start, stop, isRunning };
})();
