const { TranscriptChunkSchema, SummarySchema, generateUUID } = require('../models/schemas');

/**
 * LapseHarness 서비스 팩토리.
 * 실시간 음성 인식 텍스트를 수집하고 주기적으로 AI 요약을 생성한다.
 *
 * @param {object} deps - 의존성 주입
 * @param {object} deps.aiAgent - AIAgent 인스턴스 (summarizeLecture, extractKeywords 메서드 필요)
 * @param {number} [deps.summaryIntervalMs=180000] - 요약 주기 (밀리초, 기본 3분)
 * @returns {object} LapseHarness 인스턴스
 */
function createLapseHarness({ aiAgent, summaryIntervalMs = 180000 } = {}) {
  // sessionId → TranscriptChunk[] 인메모리 저장소
  const transcriptChunks = new Map();
  // sessionId → 텍스트 버퍼 (순서대로 누적된 텍스트 배열)
  const textBuffers = new Map();
  // sessionId → Summary[] 요약 이력
  const summaryHistories = new Map();
  // sessionId → timer ID
  const summaryTimers = new Map();
  // 현재 활성 세션 ID
  let activeSessionId = null;

  /**
   * 캡처를 시작한다. 텍스트 버퍼를 초기화하고 요약 타이머를 시작한다.
   * @param {string} sessionId - 세션 ID
   */
  function startCapture(sessionId) {
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
      throw new Error('sessionId is required and must be a non-empty string');
    }

    // 이미 캡처 중이면 기존 캡처 중단
    if (activeSessionId && activeSessionId !== sessionId) {
      stopCapture();
    }

    activeSessionId = sessionId;

    // 버퍼 및 저장소 초기화
    if (!transcriptChunks.has(sessionId)) {
      transcriptChunks.set(sessionId, []);
    }
    textBuffers.set(sessionId, []);
    if (!summaryHistories.has(sessionId)) {
      summaryHistories.set(sessionId, []);
    }

    // 요약 타이머 시작
    const timerId = setInterval(() => {
      _triggerSummary(sessionId);
    }, summaryIntervalMs);
    summaryTimers.set(sessionId, timerId);
  }

  /**
   * 캡처를 중단한다. 타이머를 정리하고 남은 버퍼 데이터를 저장한다.
   * @returns {Promise<object|null>} 남은 버퍼로 생성된 Summary 또는 null
   */
  async function stopCapture() {
    if (!activeSessionId) {
      return null;
    }

    const sessionId = activeSessionId;

    // 타이머 정리
    const timerId = summaryTimers.get(sessionId);
    if (timerId) {
      clearInterval(timerId);
      summaryTimers.delete(sessionId);
    }

    // 남은 버퍼 데이터로 최종 요약 생성
    let finalSummary = null;
    const buffer = textBuffers.get(sessionId);
    if (buffer && buffer.length > 0) {
      finalSummary = await _triggerSummary(sessionId);
    }

    activeSessionId = null;
    return finalSummary;
  }

  /**
   * 텍스트 청크를 추가한다. TranscriptChunk를 생성하고 버퍼에 누적한다.
   * @param {object} chunk - 텍스트 청크 데이터
   * @param {string} chunk.sessionId - 세션 ID
   * @param {string} chunk.text - 인식된 텍스트
   * @param {Date} chunk.startTime - 시작 시각
   * @param {Date} chunk.endTime - 종료 시각
   * @param {boolean} chunk.isFinal - 최종 결과 여부
   * @param {number} chunk.confidence - 신뢰도 (0.0~1.0)
   * @returns {object} 생성된 TranscriptChunk
   */
  function addTranscriptChunk(chunk) {
    if (!chunk || !chunk.sessionId) {
      throw new Error('chunk with sessionId is required');
    }

    const transcriptChunk = TranscriptChunkSchema.parse({
      chunkId: generateUUID(),
      sessionId: chunk.sessionId,
      text: chunk.text,
      startTime: chunk.startTime instanceof Date ? chunk.startTime : new Date(chunk.startTime),
      endTime: chunk.endTime instanceof Date ? chunk.endTime : new Date(chunk.endTime),
      isFinal: chunk.isFinal,
      confidence: chunk.confidence,
    });

    // 청크 저장
    if (!transcriptChunks.has(chunk.sessionId)) {
      transcriptChunks.set(chunk.sessionId, []);
    }
    transcriptChunks.get(chunk.sessionId).push(transcriptChunk);

    // 텍스트 버퍼에 누적
    if (!textBuffers.has(chunk.sessionId)) {
      textBuffers.set(chunk.sessionId, []);
    }
    textBuffers.get(chunk.sessionId).push(transcriptChunk.text);

    return transcriptChunk;
  }

  /**
   * 시간 범위 내 최근 텍스트와 키워드를 반환한다.
   * @param {number} [windowSeconds=60] - 시간 범위 (초)
   * @returns {object} { recentText: string, keywords: Array }
   */
  function getRecentContext(windowSeconds = 60) {
    if (!activeSessionId) {
      return { recentText: '', keywords: [] };
    }

    const sessionId = activeSessionId;
    const chunks = transcriptChunks.get(sessionId) || [];
    const now = new Date();
    const cutoff = new Date(now.getTime() - windowSeconds * 1000);

    // 시간 범위 내 청크 필터링
    const recentChunks = chunks.filter(c => c.endTime >= cutoff);

    if (recentChunks.length === 0) {
      return { recentText: '', keywords: [] };
    }

    const recentText = recentChunks.map(c => c.text).join(' ');

    // 최근 요약에서 키워드 추출
    const summaries = summaryHistories.get(sessionId) || [];
    const keywords = summaries.length > 0
      ? summaries[summaries.length - 1].keywords.map(k => k.word)
      : [];

    return { recentText, keywords };
  }

  /**
   * 요약 이력을 조회한다.
   * @param {string} sessionId - 세션 ID
   * @returns {Array} Summary 배열
   */
  function getSummaryHistory(sessionId) {
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
      throw new Error('sessionId is required and must be a non-empty string');
    }
    return summaryHistories.get(sessionId) || [];
  }

  /**
   * 내부: 요약을 트리거한다. 버퍼의 텍스트를 AIAgent에 전달하여 요약을 생성한다.
   * @param {string} sessionId
   * @returns {Promise<object|null>} 생성된 Summary 또는 null
   * @private
   */
  async function _triggerSummary(sessionId) {
    const buffer = textBuffers.get(sessionId);
    if (!buffer || buffer.length === 0) {
      return null;
    }

    const rawText = buffer.join(' ');
    const chunks = transcriptChunks.get(sessionId) || [];
    const bufferChunks = chunks.slice(-buffer.length);

    // 기간 계산
    const periodStart = bufferChunks.length > 0
      ? bufferChunks[0].startTime
      : new Date();
    const periodEnd = bufferChunks.length > 0
      ? bufferChunks[bufferChunks.length - 1].endTime
      : new Date();

    // 이전 키워드 수집
    const summaries = summaryHistories.get(sessionId) || [];
    const previousKeywords = summaries.length > 0
      ? summaries[summaries.length - 1].keywords.map(k => k.word)
      : [];

    // AI 요약 요청
    let aiSummary = { mainPoints: [], keywords: [] };
    if (aiAgent && typeof aiAgent.summarizeLecture === 'function') {
      aiSummary = await aiAgent.summarizeLecture(rawText, previousKeywords);
    }

    // 키워드를 Keyword 스키마 형식으로 변환
    const now = new Date();
    const keywords = (aiSummary.keywords || []).map(k => {
      if (typeof k === 'string') {
        return { word: k, frequency: 1, importance: 0.5, firstMentionedAt: now };
      }
      return {
        word: k.word || k,
        frequency: k.frequency || 1,
        importance: k.importance != null ? k.importance : 0.5,
        firstMentionedAt: k.firstMentionedAt || now,
      };
    });

    const summary = SummarySchema.parse({
      summaryId: generateUUID(),
      sessionId,
      periodStart,
      periodEnd,
      mainPoints: aiSummary.mainPoints || [],
      keywords,
      rawText,
    });

    // 요약 이력에 추가
    if (!summaryHistories.has(sessionId)) {
      summaryHistories.set(sessionId, []);
    }
    summaryHistories.get(sessionId).push(summary);

    // 버퍼 초기화
    textBuffers.set(sessionId, []);

    return summary;
  }

  /**
   * 수동으로 요약을 트리거한다 (테스트용).
   * @param {string} [sessionId] - 세션 ID (생략 시 activeSessionId 사용)
   * @returns {Promise<object|null>}
   */
  async function triggerSummaryManually(sessionId) {
    const sid = sessionId || activeSessionId;
    if (!sid) {
      return null;
    }
    return _triggerSummary(sid);
  }

  /**
   * 특정 세션의 텍스트 청크 목록을 반환한다.
   * @param {string} sessionId
   * @returns {Array}
   */
  function getTranscriptChunks(sessionId) {
    return transcriptChunks.get(sessionId) || [];
  }

  /**
   * 현재 활성 세션 ID를 반환한다.
   * @returns {string|null}
   */
  function getActiveSessionId() {
    return activeSessionId;
  }

  /**
   * 테스트용: 모든 데이터를 초기화한다.
   */
  function clearAll() {
    // 타이머 정리
    for (const timerId of summaryTimers.values()) {
      clearInterval(timerId);
    }
    transcriptChunks.clear();
    textBuffers.clear();
    summaryHistories.clear();
    summaryTimers.clear();
    activeSessionId = null;
  }

  return {
    startCapture,
    stopCapture,
    addTranscriptChunk,
    getRecentContext,
    getSummaryHistory,
    triggerSummaryManually,
    getTranscriptChunks,
    getActiveSessionId,
    clearAll,
  };
}

module.exports = { createLapseHarness };
