const { DistractionEventSchema, PersuasionMessageSchema, generateUUID } = require('../models/schemas');
const { isNonStudySite } = require('./siteClassifier');
const { getSession } = require('./sessionManager');
const supabaseClient = require('../db/supabaseClient');

/**
 * FocusHarness 서비스 팩토리.
 * 탭 이탈 시 AI 기반 맥락 설득 메시지를 생성하여 학생을 강의로 복귀시킨다.
 *
 * @param {object} deps - 의존성 주입
 * @param {object} deps.lapseHarness - LapseHarness 인스턴스 (getRecentContext 메서드 필요)
 * @param {object} deps.aiAgent - AIAgent 인스턴스 (generatePersuasion 메서드 필요)
 * @returns {object} FocusHarness 인스턴스
 */
function createFocusHarness({ lapseHarness, aiAgent } = {}) {
  // sessionId → DistractionEvent[] 인메모리 저장소
  const distractionEvents = new Map();
  // sessionId → { targetUrl, departureTime, persuasionMessage } 진행 중인 이탈 추적
  const pendingDepartures = new Map();

  /**
   * URL에서 사이트명을 추출한다.
   * @param {string} url
   * @returns {string}
   */
  function extractSiteName(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return url;
    }
  }

  /**
   * 탭 전환 이벤트를 처리한다.
   * 비학습 사이트 판별 → LapseHarness에서 맥락 조회 → AIAgent에 설득 메시지 생성 요청
   *
   * @param {object} event - 탭 전환 이벤트
   * @param {string} event.sessionId - 세션 ID
   * @param {string} event.targetUrl - 이동 대상 URL
   * @param {Date} event.timestamp - 이벤트 발생 시각
   * @returns {Promise<object|null>} PersuasionMessage 또는 null (학습 사이트인 경우)
   */
  async function handleTabSwitch(event) {
    const { sessionId, targetUrl, timestamp } = event;

    if (!sessionId || !targetUrl || !timestamp) {
      throw new Error('sessionId, targetUrl, and timestamp are required');
    }

    // 세션 유효성 확인
    const session = await getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.status !== 'ACTIVE') {
      throw new Error(`Session is not active: ${sessionId}`);
    }

    // 탭 전환 자체를 이탈로 판정 (사이트 분류 없이 항상 설득 메시지 생성)

    // LapseHarness에서 강의 맥락 조회
    let context = { recentText: '', keywords: [] };
    if (lapseHarness && typeof lapseHarness.getRecentContext === 'function') {
      context = await lapseHarness.getRecentContext(60);
    }

    // AIAgent에 설득 메시지 생성 요청
    let aiResponse = {
      message: '강의에 집중해주세요!',
      urgency: 'MEDIUM',
    };
    if (aiAgent && typeof aiAgent.generatePersuasion === 'function') {
      aiResponse = await aiAgent.generatePersuasion(context, targetUrl);
    }

    // PersuasionMessage 생성
    const persuasionMessage = PersuasionMessageSchema.parse({
      message: aiResponse.message,
      urgency: aiResponse.urgency || 'MEDIUM',
      lectureContext: context.recentText || '',
      generatedAt: new Date(),
    });

    // 진행 중인 이탈 기록 저장
    pendingDepartures.set(sessionId, {
      targetUrl,
      departureTime: timestamp instanceof Date ? timestamp : new Date(timestamp),
      persuasionMessage: persuasionMessage.message,
    });

    return persuasionMessage;
  }

  /**
   * 탭 복귀 이벤트를 처리한다.
   * 이탈 시간 계산 및 DistractionEvent 기록.
   *
   * @param {object} event - 탭 복귀 이벤트
   * @param {string} event.sessionId - 세션 ID
   * @param {Date} event.timestamp - 복귀 시각
   * @returns {object|null} 기록된 DistractionEvent 또는 null (진행 중인 이탈이 없는 경우)
   */
  function handleTabReturn(event) {
    const { sessionId, timestamp } = event;

    if (!sessionId || !timestamp) {
      throw new Error('sessionId and timestamp are required');
    }

    const pending = pendingDepartures.get(sessionId);
    if (!pending) {
      return null;
    }

    const returnTime = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const departureTime = pending.departureTime;
    const durationSeconds = Math.max(0, Math.round((returnTime.getTime() - departureTime.getTime()) / 1000));

    const distractionEvent = DistractionEventSchema.parse({
      eventId: generateUUID(),
      sessionId,
      targetUrl: pending.targetUrl,
      siteName: extractSiteName(pending.targetUrl),
      departureTime,
      returnTime,
      persuasionMessage: pending.persuasionMessage,
      durationSeconds,
    });

    // 이벤트 저장 (인메모리)
    if (!distractionEvents.has(sessionId)) {
      distractionEvents.set(sessionId, []);
    }
    distractionEvents.get(sessionId).push(distractionEvent);

    // Supabase에도 저장 (비동기, fire-and-forget)
    if (supabaseClient.isConnected()) {
      supabaseClient.insertDistractionEvent(distractionEvent).catch(err => {
        console.error('[FocusHarness] Supabase insertDistractionEvent failed:', err);
      });
    }

    // 진행 중인 이탈 제거
    pendingDepartures.delete(sessionId);

    return distractionEvent;
  }

  /**
   * 이탈 통계를 계산하여 반환한다.
   *
   * @param {string} sessionId - 세션 ID
   * @returns {object} DistractionStats
   */
  async function getDistractionStats(sessionId) {
    if (!sessionId) {
      throw new Error('sessionId is required');
    }

    const session = await getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const events = distractionEvents.get(sessionId) || [];
    const totalDistractions = events.length;
    const totalDistractedSeconds = events.reduce((sum, e) => sum + e.durationSeconds, 0);
    const averageDistractionSeconds = totalDistractions > 0
      ? totalDistractedSeconds / totalDistractions
      : 0;

    // 상위 이탈 사이트 계산
    const siteCounts = {};
    for (const e of events) {
      siteCounts[e.siteName] = (siteCounts[e.siteName] || 0) + 1;
    }
    const topDistractingSites = Object.entries(siteCounts)
      .map(([siteName, count]) => ({ siteName, count }))
      .sort((a, b) => b.count - a.count);

    // focusRate 계산: 1.0 - (이탈시간 / 전체세션시간)
    const now = session.endTime || new Date();
    const totalSessionSeconds = Math.max(1, Math.round((now.getTime() - session.startTime.getTime()) / 1000));
    const focusRate = Math.max(0, Math.min(1, 1 - (totalDistractedSeconds / totalSessionSeconds)));

    return {
      sessionId,
      totalDistractions,
      totalDistractedSeconds,
      averageDistractionSeconds,
      topDistractingSites,
      focusRate,
    };
  }

  /**
   * 특정 세션의 이탈 이벤트 목록을 반환한다.
   * @param {string} sessionId
   * @returns {Array}
   */
  function getDistractionEvents(sessionId) {
    return distractionEvents.get(sessionId) || [];
  }

  /**
   * 현재 세션의 집중률이 전체 사용자 대비 상위 몇 퍼센트인지 계산한다.
   * @param {string} sessionId - 현재 세션 ID
   * @returns {Promise<object>} { focusRate, percentile, totalSessions, betterThan }
   */
  async function getFocusPercentile(sessionId) {
    if (!sessionId) throw new Error('sessionId is required');

    const session = await getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // 현재 세션의 집중률 계산
    const events = distractionEvents.get(sessionId) || [];
    const totalDistractedSeconds = events.reduce((sum, e) => sum + e.durationSeconds, 0);
    const now = session.endTime || new Date();
    const totalSessionSeconds = Math.max(1, Math.round((now.getTime() - session.startTime.getTime()) / 1000));
    const myFocusRate = Math.max(0, Math.min(1, 1 - (totalDistractedSeconds / totalSessionSeconds)));

    // Supabase에서 전체 세션 집중률 가져오기
    let allRates = [];
    if (supabaseClient.isConnected()) {
      try {
        allRates = await supabaseClient.getAllSessionFocusRates();
      } catch (err) {
        console.error('[FocusHarness] getAllSessionFocusRates failed:', err);
      }
    }

    if (allRates.length === 0) {
      return {
        focusRate: myFocusRate,
        percentile: 100,
        totalSessions: 0,
        betterThan: 0,
      };
    }

    // 나보다 집중률이 낮은 세션 수 계산
    const betterThan = allRates.filter(r => r.focusRate < myFocusRate).length;
    const percentile = Math.round((betterThan / allRates.length) * 100);

    return {
      focusRate: myFocusRate,
      percentile,
      totalSessions: allRates.length,
      betterThan,
    };
  }

  /**
   * 테스트용: 모든 데이터를 초기화한다.
   */
  function clearAll() {
    distractionEvents.clear();
    pendingDepartures.clear();
  }

  return {
    handleTabSwitch,
    handleTabReturn,
    getDistractionStats,
    getDistractionEvents,
    getFocusPercentile,
    clearAll,
  };
}

module.exports = { createFocusHarness };
