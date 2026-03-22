/**
 * TabMonitor — 브라우저 탭 전환 감지 클라이언트 모듈
 *
 * visibilitychange 및 focus/blur 이벤트를 통해 탭 이탈/복귀를 감지하고,
 * 다른 모듈이 구독할 수 있는 커스텀 이벤트를 발생시킨다.
 *
 * Requirements: 2.1, 2.3, 2.4
 */

const TabMonitor = (() => {
  // --- 내부 상태 ---
  let _sessionId = null;
  let _monitoring = false;
  let _departed = false; // 현재 탭을 떠난 상태인지

  // 이벤트 리스너 저장소
  const _listeners = {
    tabSwitch: [],
    tabReturn: [],
  };

  // 바인딩된 핸들러 참조 (제거용)
  let _boundHandleVisibility = null;
  let _boundHandleFocus = null;
  let _boundHandleBlur = null;

  // --- 이벤트 발행 ---

  function _emit(eventName, payload) {
    const handlers = _listeners[eventName];
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[TabMonitor] ${eventName} handler error:`, err);
      }
    }
  }

  // --- 내부 핸들러 ---

  function _handleTabDeparture() {
    if (!_monitoring || _departed) return;
    _departed = true;

    const event = {
      type: 'tabSwitch',
      sessionId: _sessionId,
      targetUrl: document.location.href,
      timestamp: new Date(),
    };
    _emit('tabSwitch', event);
  }

  function _handleTabReturn() {
    if (!_monitoring || !_departed) return;
    _departed = false;

    const event = {
      type: 'tabReturn',
      sessionId: _sessionId,
      returnTimestamp: new Date(),
    };
    _emit('tabReturn', event);
  }

  function _onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      _handleTabDeparture();
    } else if (document.visibilityState === 'visible') {
      _handleTabReturn();
    }
  }

  function _onFocus() {
    _handleTabReturn();
  }

  function _onBlur() {
    _handleTabDeparture();
  }

  // --- 공개 API ---

  /**
   * 탭 모니터링을 시작한다.
   * @param {string} sessionId - 현재 강의 세션 ID
   */
  function startMonitoring(sessionId) {
    if (_monitoring) return;
    if (!sessionId) {
      throw new Error('[TabMonitor] sessionId is required');
    }

    _sessionId = sessionId;
    _monitoring = true;
    _departed = false;

    _boundHandleVisibility = _onVisibilityChange;
    _boundHandleFocus = _onFocus;
    _boundHandleBlur = _onBlur;

    document.addEventListener('visibilitychange', _boundHandleVisibility);
    window.addEventListener('focus', _boundHandleFocus);
    window.addEventListener('blur', _boundHandleBlur);
  }

  /**
   * 탭 모니터링을 중단한다.
   */
  function stopMonitoring() {
    if (!_monitoring) return;

    document.removeEventListener('visibilitychange', _boundHandleVisibility);
    window.removeEventListener('focus', _boundHandleFocus);
    window.removeEventListener('blur', _boundHandleBlur);

    _monitoring = false;
    _sessionId = null;
    _departed = false;
  }

  /**
   * 이벤트 리스너를 등록한다.
   * @param {'tabSwitch'|'tabReturn'} eventName
   * @param {Function} handler
   */
  function on(eventName, handler) {
    if (!_listeners[eventName]) {
      throw new Error(`[TabMonitor] Unknown event: ${eventName}`);
    }
    _listeners[eventName].push(handler);
  }

  /**
   * 이벤트 리스너를 제거한다.
   * @param {'tabSwitch'|'tabReturn'} eventName
   * @param {Function} handler
   */
  function off(eventName, handler) {
    if (!_listeners[eventName]) return;
    _listeners[eventName] = _listeners[eventName].filter((h) => h !== handler);
  }

  return {
    startMonitoring,
    stopMonitoring,
    on,
    off,
  };
})();
