const { DistractionStatsSchema } = require('../models/schemas');

/**
 * Standalone DistractionTracker 모듈.
 * DistractionEvent 목록과 세션 정보로부터 DistractionStats를 계산한다.
 * FocusHarness와 독립적으로 사용 가능하다.
 */

/**
 * DistractionEvent 목록으로부터 DistractionStats를 계산한다.
 *
 * @param {object} params
 * @param {string} params.sessionId - 세션 UUID
 * @param {Array<object>} params.events - DistractionEvent 목록 (각 항목에 durationSeconds, siteName 필요)
 * @param {Date} params.startTime - 세션 시작 시각
 * @param {Date} params.endTime - 세션 종료 시각 (null이면 현재 시각 사용)
 * @returns {object} DistractionStats (Zod 검증 완료)
 */
function calculateStats({ sessionId, events, startTime, endTime }) {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }
  if (!startTime || !(startTime instanceof Date)) {
    throw new Error('startTime is required and must be a Date');
  }
  if (!Array.isArray(events)) {
    throw new Error('events must be an array');
  }

  const effectiveEndTime = endTime instanceof Date ? endTime : new Date();

  const totalDistractions = events.length;
  const totalDistractedSeconds = events.reduce((sum, e) => sum + (e.durationSeconds || 0), 0);
  const averageDistractionSeconds = totalDistractions > 0
    ? totalDistractedSeconds / totalDistractions
    : 0;

  // 상위 이탈 사이트 계산
  const siteCounts = {};
  for (const e of events) {
    if (e.siteName) {
      siteCounts[e.siteName] = (siteCounts[e.siteName] || 0) + 1;
    }
  }
  const topDistractingSites = Object.entries(siteCounts)
    .map(([siteName, count]) => ({ siteName, count }))
    .sort((a, b) => b.count - a.count);

  // focusRate = 1.0 - (totalDistractedSeconds / totalSessionSeconds), 0.0~1.0 클램핑
  const totalSessionSeconds = Math.max(1, Math.round(
    (effectiveEndTime.getTime() - startTime.getTime()) / 1000
  ));
  const focusRate = Math.max(0, Math.min(1, 1 - (totalDistractedSeconds / totalSessionSeconds)));

  return DistractionStatsSchema.parse({
    sessionId,
    totalDistractions,
    totalDistractedSeconds,
    averageDistractionSeconds,
    topDistractingSites,
    focusRate,
  });
}

/**
 * DistractionTracker 인스턴스를 생성한다.
 * 이벤트를 추가할 때마다 통계가 즉시 갱신된다.
 *
 * @param {object} params
 * @param {string} params.sessionId - 세션 UUID
 * @param {Date} params.startTime - 세션 시작 시각
 * @param {Date|null} [params.endTime] - 세션 종료 시각
 * @returns {object} DistractionTracker 인스턴스
 */
function createDistractionTracker({ sessionId, startTime, endTime = null }) {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }
  if (!startTime || !(startTime instanceof Date)) {
    throw new Error('startTime is required and must be a Date');
  }

  const events = [];
  let currentEndTime = endTime;

  /**
   * 새 DistractionEvent를 추가하고 통계를 즉시 갱신한다.
   * @param {object} event - DistractionEvent (durationSeconds, siteName 필요)
   */
  function addEvent(event) {
    if (!event || typeof event !== 'object') {
      throw new Error('event must be an object');
    }
    events.push(event);
  }

  /**
   * 세션 종료 시각을 업데이트한다.
   * @param {Date} time
   */
  function setEndTime(time) {
    currentEndTime = time;
  }

  /**
   * 현재 통계를 계산하여 반환한다.
   * @returns {object} DistractionStats
   */
  function getStats() {
    return calculateStats({
      sessionId,
      events,
      startTime,
      endTime: currentEndTime,
    });
  }

  /**
   * 현재 이벤트 목록을 반환한다.
   * @returns {Array}
   */
  function getEvents() {
    return [...events];
  }

  return {
    addEvent,
    setEndTime,
    getStats,
    getEvents,
  };
}

module.exports = { calculateStats, createDistractionTracker };
