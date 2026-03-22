/**
 * Supabase 클라이언트 모듈.
 * lecture_sessions, transcript_chunks, summaries, summary_keywords,
 * distraction_events 테이블에 대한 CRUD 메서드를 제공한다.
 */

const { createClient } = require('@supabase/supabase-js');
const { toSnakeCase, toCamelCase } = require('./utils');

class SupabaseClient {
  constructor() {
    this._client = null;
    this._connected = false;
  }

  /**
   * Supabase 클라이언트를 초기화한다.
   * @param {string} url - Supabase 프로젝트 URL
   * @param {string} anonKey - Supabase anon key
   */
  initialize(url, anonKey) {
    if (!url || !anonKey) {
      console.error('[SupabaseClient] URL and anon key are required');
      this._connected = false;
      return;
    }
    try {
      this._client = createClient(url, anonKey);
      this._connected = true;
    } catch (err) {
      console.error('[SupabaseClient] Initialization failed:', err);
      this._connected = false;
    }
  }

  isConnected() {
    return this._connected;
  }

  // ─── lecture_sessions ───────────────────────────────────────

  async insertSession(session) {
    const row = toSnakeCase(session);
    const { data, error } = await this._client
      .from('lecture_sessions')
      .insert(row)
      .select()
      .single();
    if (error) return this._handleError('insertSession', error);
    return toCamelCase(data);
  }

  async updateSession(sessionId, updates) {
    const row = toSnakeCase(updates);
    const { data, error } = await this._client
      .from('lecture_sessions')
      .update(row)
      .eq('session_id', sessionId)
      .select()
      .single();
    if (error) return this._handleError('updateSession', error);
    return toCamelCase(data);
  }

  async getSession(sessionId) {
    const { data, error } = await this._client
      .from('lecture_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      return this._handleError('getSession', error);
    }
    return toCamelCase(data);
  }

  async getSessionsByUser(userId) {
    const { data, error } = await this._client
      .from('lecture_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('start_time', { ascending: false });
    if (error) return this._handleError('getSessionsByUser', error);
    return data.map(toCamelCase);
  }

  async getActiveSession() {
    const { data, error } = await this._client
      .from('lecture_sessions')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('start_time', { ascending: false })
      .limit(1);
    if (error) return this._handleError('getActiveSession', error);
    if (!data || data.length === 0) return null;
    return toCamelCase(data[0]);
  }

  // ─── transcript_chunks ─────────────────────────────────────

  async insertTranscriptChunk(chunk) {
    const row = toSnakeCase(chunk);
    const { data, error } = await this._client
      .from('transcript_chunks')
      .insert(row)
      .select()
      .single();
    if (error) return this._handleError('insertTranscriptChunk', error);
    return toCamelCase(data);
  }

  async getChunksBySession(sessionId, since = null) {
    let query = this._client
      .from('transcript_chunks')
      .select('*')
      .eq('session_id', sessionId)
      .order('start_time', { ascending: true });
    if (since) {
      query = query.gte('start_time', since);
    }
    const { data, error } = await query;
    if (error) return this._handleError('getChunksBySession', error);
    return data.map(toCamelCase);
  }

  // ─── summaries + summary_keywords ──────────────────────────

  async insertSummary(summary) {
    const { keywords, ...summaryData } = summary;
    const summaryRow = toSnakeCase(summaryData);

    const { data: savedSummary, error: summaryError } = await this._client
      .from('summaries')
      .insert(summaryRow)
      .select()
      .single();
    if (summaryError) return this._handleError('insertSummary', summaryError);

    if (keywords && keywords.length > 0) {
      const keywordRows = keywords.map(kw => ({
        ...toSnakeCase(kw),
        summary_id: savedSummary.summary_id,
      }));
      const { error: kwError } = await this._client
        .from('summary_keywords')
        .insert(keywordRows);
      if (kwError) return this._handleError('insertSummary (keywords)', kwError);
    }

    const result = toCamelCase(savedSummary);
    result.keywords = keywords || [];
    return result;
  }

  async getSummariesBySession(sessionId) {
    const { data, error } = await this._client
      .from('summaries')
      .select('*, summary_keywords(*)')
      .eq('session_id', sessionId)
      .order('period_start', { ascending: true });
    if (error) return this._handleError('getSummariesBySession', error);

    return data.map(row => {
      const keywordRows = row.summary_keywords || [];
      delete row.summary_keywords;
      const summary = toCamelCase(row);
      summary.keywords = keywordRows.map(toCamelCase);
      return summary;
    });
  }

  // ─── distraction_events ────────────────────────────────────

  async insertDistractionEvent(event) {
    const row = toSnakeCase(event);
    const { data, error } = await this._client
      .from('distraction_events')
      .insert(row)
      .select()
      .single();
    if (error) return this._handleError('insertDistractionEvent', error);
    return toCamelCase(data);
  }

  async updateDistractionEvent(eventId, updates) {
    const row = toSnakeCase(updates);
    const { data, error } = await this._client
      .from('distraction_events')
      .update(row)
      .eq('event_id', eventId)
      .select()
      .single();
    if (error) return this._handleError('updateDistractionEvent', error);
    return toCamelCase(data);
  }

  async getDistractionEventsBySession(sessionId) {
    const { data, error } = await this._client
      .from('distraction_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('departure_time', { ascending: true });
    if (error) return this._handleError('getDistractionEventsBySession', error);
    return data.map(toCamelCase);
  }

  // ─── 랭킹 / 퍼센타일 ─────────────────────────────────────

  /**
   * 모든 COMPLETED 세션의 집중률(focusRate)을 계산하여 반환한다.
   * focusRate = 1 - (총이탈시간 / 총세션시간)
   */
  async getAllSessionFocusRates() {
    // 완료된 세션 조회
    const { data: sessions, error: sessErr } = await this._client
      .from('lecture_sessions')
      .select('session_id, user_id, start_time, end_time')
      .eq('status', 'COMPLETED')
      .not('end_time', 'is', null);
    if (sessErr) return this._handleError('getAllSessionFocusRates (sessions)', sessErr);
    if (!sessions || sessions.length === 0) return [];

    // 각 세션의 이탈 이벤트 합산
    const sessionIds = sessions.map(s => s.session_id);
    const { data: events, error: evtErr } = await this._client
      .from('distraction_events')
      .select('session_id, duration_seconds')
      .in('session_id', sessionIds);
    if (evtErr) return this._handleError('getAllSessionFocusRates (events)', evtErr);

    // session_id별 총 이탈 시간 집계
    const distractedMap = {};
    for (const e of (events || [])) {
      distractedMap[e.session_id] = (distractedMap[e.session_id] || 0) + e.duration_seconds;
    }

    return sessions.map(s => {
      const totalSec = Math.max(1, Math.round(
        (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 1000
      ));
      const distracted = distractedMap[s.session_id] || 0;
      const focusRate = Math.max(0, Math.min(1, 1 - distracted / totalSec));
      return {
        sessionId: s.session_id,
        userId: s.user_id,
        focusRate,
      };
    });
  }

  // ─── Error handling ────────────────────────────────────────

  _handleError(method, error) {
    console.error(`[SupabaseClient] ${method} failed:`, error.message || error);
    this._connected = false;
    throw error;
  }
}

// 싱글톤 인스턴스
const supabaseClient = new SupabaseClient();
module.exports = supabaseClient;
