/**
 * NotificationUI — 설득 메시지 오버레이 알림 클라이언트 모듈
 *
 * FocusHarness가 생성한 PersuasionMessage를 화면 상단에 오버레이 알림으로 표시한다.
 * urgency 수준(LOW/MEDIUM/HIGH)에 따라 시각적으로 차별화된 스타일을 적용한다.
 *
 * Requirements: 5.1
 */

const NotificationUI = (() => {
  // --- 설정 ---
  const DEFAULT_TIMEOUT_MS = 10000;
  const CONTAINER_ID = 'adhd-notification-container';

  // urgency별 색상 매핑
  const URGENCY_STYLES = {
    LOW: {
      background: '#e3f2fd',
      border: '#2196f3',
      color: '#0d47a1',
    },
    MEDIUM: {
      background: '#fff3e0',
      border: '#ff9800',
      color: '#e65100',
    },
    HIGH: {
      background: '#ffebee',
      border: '#f44336',
      color: '#b71c1c',
    },
  };

  // --- 내부 상태 ---
  let _container = null;

  // --- 헬퍼 ---

  /**
   * 알림 컨테이너를 생성하거나 기존 컨테이너를 반환한다.
   * @returns {HTMLElement}
   */
  function _getContainer() {
    if (_container && document.body.contains(_container)) {
      return _container;
    }

    _container = document.getElementById(CONTAINER_ID);
    if (_container) return _container;

    _container = document.createElement('div');
    _container.id = CONTAINER_ID;
    _container.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'right: 0',
      'z-index: 2147483647',
      'display: flex',
      'flex-direction: column',
      'align-items: center',
      'pointer-events: none',
      'padding: 8px',
      'gap: 8px',
    ].join(';');

    document.body.appendChild(_container);
    return _container;
  }

  /**
   * urgency에 해당하는 스타일 객체를 반환한다.
   * 알 수 없는 urgency는 LOW로 폴백한다.
   * @param {string} urgency
   * @returns {Object}
   */
  function _getStyle(urgency) {
    return URGENCY_STYLES[urgency] || URGENCY_STYLES.LOW;
  }

  /**
   * 알림 요소를 생성한다.
   * @param {string} message - 표시할 메시지
   * @param {string} urgency - LOW | MEDIUM | HIGH
   * @returns {HTMLElement}
   */
  function _createNotificationElement(message, urgency) {
    const style = _getStyle(urgency);
    const el = document.createElement('div');

    el.style.cssText = [
      `background: ${style.background}`,
      `border-left: 4px solid ${style.border}`,
      `color: ${style.color}`,
      'padding: 12px 16px',
      'border-radius: 4px',
      'box-shadow: 0 2px 8px rgba(0,0,0,0.15)',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'font-size: 14px',
      'line-height: 1.4',
      'max-width: 480px',
      'width: 100%',
      'cursor: pointer',
      'pointer-events: auto',
      'opacity: 0',
      'transform: translateY(-20px)',
      'transition: opacity 0.3s ease, transform 0.3s ease',
    ].join(';');

    // urgency 라벨
    const label = document.createElement('strong');
    label.textContent = `[${urgency}] `;
    el.appendChild(label);

    // 메시지 텍스트
    const text = document.createTextNode(message);
    el.appendChild(text);

    return el;
  }

  /**
   * 알림 요소를 제거한다 (페이드아웃 후).
   * @param {HTMLElement} el
   */
  function _dismiss(el) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-20px)';

    setTimeout(() => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, 300);
  }

  // --- 공개 API ---

  /**
   * 설득 메시지를 오버레이 알림으로 표시한다.
   *
   * @param {Object} persuasionMessage - PersuasionMessage 객체
   * @param {string} persuasionMessage.message - 표시할 설득 메시지
   * @param {string} persuasionMessage.urgency - 긴급도 (LOW | MEDIUM | HIGH)
   * @param {Object} [options] - 추가 옵션
   * @param {number} [options.timeoutMs] - 자동 닫힘 시간(ms), 기본 10000
   * @returns {HTMLElement} 생성된 알림 요소
   */
  function showNotification(persuasionMessage, options) {
    const { message, urgency } = persuasionMessage || {};
    if (!message) {
      throw new Error('[NotificationUI] message is required');
    }

    const resolvedUrgency = urgency || 'LOW';
    const timeoutMs = (options && options.timeoutMs) || DEFAULT_TIMEOUT_MS;

    const container = _getContainer();
    const el = _createNotificationElement(message, resolvedUrgency);

    // 클릭으로 수동 닫기
    el.addEventListener('click', () => _dismiss(el));

    container.appendChild(el);

    // 페이드인 애니메이션 트리거
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });

    // 자동 닫힘 타이머
    if (timeoutMs > 0) {
      setTimeout(() => _dismiss(el), timeoutMs);
    }

    return el;
  }

  /**
   * 모든 알림을 즉시 제거한다.
   */
  function clearAll() {
    const container = _getContainer();
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  }

  return {
    showNotification,
    clearAll,
  };
})();
