/**
 * Dashboard — 실시간 대시보드 UI 모듈
 *
 * 강의 요약 타임라인, 실시간 텍스트 스트림, 이탈 통계 시각화,
 * 키워드 하이라이트 및 검색 기능을 제공한다.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

const Dashboard = (() => {
  // --- 설정 ---
  const DEFAULT_API_BASE = 'http://localhost:3000';
  const POLL_INTERVAL_MS = 5000;

  // --- 내부 상태 ---
  let _sessionId = null;
  let _apiBaseUrl = DEFAULT_API_BASE;
  let _summaries = [];
  let _pollTimer = null;
  let _currentSearchQuery = '';

  // --- DOM 참조 ---
  function _el(id) {
    return document.getElementById(id);
  }

  // --- API 호출 ---

  /**
   * 세션의 요약 이력을 가져온다.
   * GET /api/lapse/summaries/:sessionId
   */
  async function _fetchSummaries() {
    try {
      const res = await fetch(`${_apiBaseUrl}/api/lapse/summaries/${_sessionId}`);
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.error('[Dashboard] Failed to fetch summaries:', err);
      return [];
    }
  }

  /**
   * 세션의 이탈 통계를 가져온다.
   * GET /api/focus/stats/:sessionId
   */
  async function _fetchStats() {
    try {
      const res = await fetch(`${_apiBaseUrl}/api/focus/stats/${_sessionId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error('[Dashboard] Failed to fetch stats:', err);
      return null;
    }
  }

  // --- 렌더링 ---

  /**
   * 텍스트 내 HTML 특수문자를 이스케이프한다.
   */
  function _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 텍스트 내 검색 키워드를 하이라이트한다.
   * @param {string} text - 원본 텍스트
   * @param {string} query - 검색어
   * @returns {string} 하이라이트된 HTML
   */
  function _highlightText(text, query) {
    if (!query) return _escapeHtml(text);
    const escaped = _escapeHtml(text);
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${safeQuery})`, 'gi');
    return escaped.replace(regex, '<mark class="highlight">$1</mark>');
  }

  /**
   * 요약 카드 하나를 HTML 문자열로 생성한다.
   */
  function _renderSummaryCard(summary, query) {
    const start = new Date(summary.periodStart);
    const end = new Date(summary.periodEnd);
    const timeStr = `${start.toLocaleTimeString('ko-KR')} ~ ${end.toLocaleTimeString('ko-KR')}`;

    const points = (summary.mainPoints || [])
      .map((p) => `<li>${_highlightText(p, query)}</li>`)
      .join('');

    const keywords = (summary.keywords || [])
      .map((kw) => {
        const word = typeof kw === 'string' ? kw : kw.word;
        return `<span class="keyword-tag">${_highlightText(word, query)}</span>`;
      })
      .join('');

    return `
      <div class="summary-card">
        <div class="card-time">${_escapeHtml(timeStr)}</div>
        <ul class="card-points">${points}</ul>
        <div class="card-keywords">${keywords}</div>
      </div>
    `;
  }

  /**
   * 타임라인에 요약 카드 목록을 렌더링한다.
   * 검색어가 있으면 해당 키워드를 포함하는 요약만 표시한다.
   */
  function renderTimeline(summaries, query) {
    const container = _el('timeline-container');
    if (!container) return;

    let filtered = summaries;
    if (query) {
      const lowerQuery = query.toLowerCase();
      filtered = summaries.filter((s) => {
        const inPoints = (s.mainPoints || []).some((p) =>
          p.toLowerCase().includes(lowerQuery)
        );
        const inKeywords = (s.keywords || []).some((kw) => {
          const word = typeof kw === 'string' ? kw : kw.word;
          return word.toLowerCase().includes(lowerQuery);
        });
        return inPoints || inKeywords;
      });
    }

    if (filtered.length === 0) {
      container.innerHTML = `<div class="no-results">${query ? '검색 결과가 없습니다.' : '아직 요약이 없습니다.'}</div>`;
      return;
    }

    container.innerHTML = filtered.map((s) => _renderSummaryCard(s, query)).join('');
  }

  /**
   * 타임라인에 요약 카드 하나를 추가한다.
   */
  function addSummaryCard(summary) {
    _summaries.push(summary);
    renderTimeline(_summaries, _currentSearchQuery);
  }

  /**
   * 실시간 텍스트 스트림을 업데이트한다.
   */
  function updateLiveTranscript(text) {
    const el = _el('live-transcript');
    if (!el) return;
    el.textContent = text || '대기 중...';
    el.scrollTop = el.scrollHeight;
  }

  /**
   * 이탈 통계를 표시한다.
   */
  function showDistractionStats(stats) {
    if (!stats) return;

    const totalEl = _el('stat-total-distractions');
    const timeEl = _el('stat-total-time');
    const avgEl = _el('stat-avg-time');
    const rateEl = _el('stat-focus-rate');

    if (totalEl) totalEl.textContent = stats.totalDistractions || 0;
    if (timeEl) timeEl.textContent = _formatSeconds(stats.totalDistractedSeconds || 0);
    if (avgEl) avgEl.textContent = _formatSeconds(Math.round(stats.averageDistractionSeconds || 0));
    if (rateEl) rateEl.textContent = _formatPercent(stats.focusRate);
  }

  /**
   * 초를 읽기 쉬운 형식으로 변환한다.
   */
  function _formatSeconds(sec) {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  }

  /**
   * focusRate(0~1)를 퍼센트 문자열로 변환한다.
   */
  function _formatPercent(rate) {
    if (rate == null) return '100%';
    return `${Math.round(rate * 100)}%`;
  }

  // --- 폴링 ---

  /**
   * 주기적으로 서버에서 요약과 통계를 가져와 UI를 갱신한다.
   */
  async function _poll() {
    if (!_sessionId) return;

    const [summaries, stats] = await Promise.all([
      _fetchSummaries(),
      _fetchStats(),
    ]);

    if (summaries && summaries.length > 0) {
      _summaries = summaries;
      renderTimeline(_summaries, _currentSearchQuery);
    }

    if (stats) {
      showDistractionStats(stats);
    }
  }

  // --- 검색 ---

  /**
   * 키워드 검색을 수행한다.
   */
  function _handleSearch() {
    const input = _el('keyword-search');
    if (!input) return;
    _currentSearchQuery = input.value.trim();
    renderTimeline(_summaries, _currentSearchQuery);
  }

  // --- 이벤트 바인딩 ---

  function _bindEvents() {
    const searchBtn = _el('search-btn');
    const searchInput = _el('keyword-search');

    if (searchBtn) {
      searchBtn.addEventListener('click', _handleSearch);
    }
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') _handleSearch();
      });
    }
  }

  // --- 공개 API ---

  /**
   * 대시보드를 초기화하고 폴링을 시작한다.
   * @param {string} sessionId - 현재 강의 세션 ID
   * @param {string} [apiBaseUrl] - 백엔드 API 기본 URL
   */
  function init(sessionId, apiBaseUrl) {
    if (!sessionId) {
      throw new Error('[Dashboard] sessionId is required');
    }

    _sessionId = sessionId;
    if (apiBaseUrl) _apiBaseUrl = apiBaseUrl.replace(/\/+$/, '');
    _summaries = [];
    _currentSearchQuery = '';

    const indicator = _el('session-indicator');
    if (indicator) indicator.textContent = `세션: ${sessionId.slice(0, 8)}...`;

    _bindEvents();
    _poll();
    _pollTimer = setInterval(_poll, POLL_INTERVAL_MS);
  }

  /**
   * 대시보드 폴링을 중단한다.
   */
  function destroy() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
    _sessionId = null;
    _summaries = [];
  }

  return {
    init,
    destroy,
    renderTimeline,
    addSummaryCard,
    updateLiveTranscript,
    showDistractionStats,
  };
})();
