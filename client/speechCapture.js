/**
 * SpeechCapture — Web Speech API 기반 실시간 음성 인식 클라이언트 모듈
 *
 * SpeechRecognition API를 사용하여 마이크 입력을 캡처하고,
 * 인식 결과를 TranscriptChunk 형태로 백엔드에 전송한다.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

const SpeechCapture = (() => {
  // --- 내부 상태 ---
  let _sessionId = null;
  let _apiBaseUrl = '';
  let _recognition = null;
  let _capturing = false;
  let _chunkCounter = 0;

  // --- 헬퍼 ---

  /**
   * 고유 chunkId를 생성한다.
   * crypto.randomUUID가 가능하면 사용하고, 아니면 타임스탬프+카운터 폴백.
   */
  function _generateChunkId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    _chunkCounter += 1;
    return `chunk-${Date.now()}-${_chunkCounter}`;
  }

  /**
   * TranscriptChunk 데이터를 백엔드로 전송한다.
   * @param {Object} chunk - TranscriptChunk 데이터
   */
  async function _sendChunk(chunk) {
    try {
      await fetch(`${_apiBaseUrl}/api/lapse/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      });
    } catch (err) {
      console.error('[SpeechCapture] Failed to send chunk:', err);
    }
  }

  /**
   * SpeechRecognition 인스턴스를 초기화한다.
   */
  function _initRecognition() {
    const SpeechRecognition =
      typeof webkitSpeechRecognition !== 'undefined'
        ? webkitSpeechRecognition
        : typeof window !== 'undefined' && window.SpeechRecognition
          ? window.SpeechRecognition
          : null;

    if (!SpeechRecognition) {
      throw new Error('[SpeechCapture] SpeechRecognition API is not supported in this browser');
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ko-KR';

    recognition.onresult = _handleResult;
    recognition.onerror = _handleError;
    recognition.onend = _handleEnd;

    return recognition;
  }

  // --- 이벤트 핸들러 ---

  /**
   * 음성 인식 결과를 처리하여 TranscriptChunk를 생성하고 백엔드로 전송한다.
   */
  function _handleResult(event) {
    const now = new Date();

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const alternative = result[0];

      const chunk = {
        chunkId: _generateChunkId(),
        sessionId: _sessionId,
        text: alternative.transcript,
        startTime: now.toISOString(),
        endTime: new Date().toISOString(),
        isFinal: result.isFinal,
        confidence: alternative.confidence,
      };

      _sendChunk(chunk);
    }
  }

  /**
   * 음성 인식 에러를 처리한다.
   * 캡처 중이면 자동으로 재시작을 시도한다.
   */
  function _handleError(event) {
    console.error('[SpeechCapture] Recognition error:', event.error);

    // 권한 거부 또는 의도적 중단은 재시작하지 않음
    const fatalErrors = ['aborted', 'not-allowed', 'service-not-allowed'];
    if (fatalErrors.includes(event.error)) {
      console.warn('[SpeechCapture] 마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크를 허용해 주세요.');
      _capturing = false;
      return;
    }

    if (_capturing) {
      setTimeout(() => _restartRecognition(), 300);
    }
  }

  /**
   * 음성 인식이 종료되었을 때 처리한다.
   * 아직 캡처 중이면 자동으로 재시작한다 (브라우저가 자동 종료하는 경우 대응).
   */
  function _handleEnd() {
    if (_capturing) {
      _restartRecognition();
    }
  }

  /**
   * 음성 인식을 재시작한다.
   */
  function _restartRecognition() {
    if (!_capturing || !_recognition) return;
    try {
      _recognition.stop();
    } catch (_) { /* ignore */ }
    try {
      _recognition.start();
    } catch (err) {
      console.error('[SpeechCapture] Failed to restart recognition:', err);
    }
  }

  // --- 공개 API ---

  /**
   * 음성 캡처를 시작한다.
   * @param {string} sessionId - 현재 강의 세션 ID
   * @param {string} apiBaseUrl - 백엔드 API 기본 URL (예: 'http://localhost:3000')
   */
  function startCapture(sessionId, apiBaseUrl) {
    if (_capturing) return;
    if (!sessionId) {
      throw new Error('[SpeechCapture] sessionId is required');
    }
    if (!apiBaseUrl) {
      throw new Error('[SpeechCapture] apiBaseUrl is required');
    }

    _sessionId = sessionId;
    _apiBaseUrl = apiBaseUrl.replace(/\/+$/, ''); // 후행 슬래시 제거
    _chunkCounter = 0;

    _recognition = _initRecognition();
    _capturing = true;
    _recognition.start();
  }

  /**
   * 음성 캡처를 중단한다.
   */
  function stopCapture() {
    if (!_capturing) return;

    _capturing = false;

    if (_recognition) {
      _recognition.onresult = null;
      _recognition.onerror = null;
      _recognition.onend = null;
      _recognition.stop();
      _recognition = null;
    }

    _sessionId = null;
    _apiBaseUrl = '';
  }

  /**
   * 현재 캡처 중인지 여부를 반환한다.
   * @returns {boolean}
   */
  function isCapturing() {
    return _capturing;
  }

  return {
    startCapture,
    stopCapture,
    isCapturing,
  };
})();
