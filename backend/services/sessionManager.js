const { LectureSessionSchema, generateUUID } = require('../models/schemas');
const supabaseClient = require('../db/supabaseClient');

// 인메모리 폴백 (Supabase 미연결 시)
const sessions = new Map();

function _useSupabase() {
  return supabaseClient.isConnected();
}

/**
 * 새 강의 세션을 생성한다.
 * @param {string} userId - 사용자 UUID
 * @param {string} title - 강의 제목
 * @returns {Promise<object>} 생성된 LectureSession
 */
async function createSession(userId, title) {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('userId is required and must be a non-empty string');
  }
  if (!title || typeof title !== 'string' || title.trim() === '') {
    throw new Error('title is required and must be a non-empty string');
  }

  const sessionData = {
    sessionId: generateUUID(),
    userId,
    title,
    startTime: new Date(),
    endTime: null,
    status: 'ACTIVE',
  };

  const session = LectureSessionSchema.parse(sessionData);

  if (_useSupabase()) {
    return await supabaseClient.insertSession(session);
  }

  sessions.set(session.sessionId, session);
  return session;
}

/**
 * 세션을 종료한다.
 * @param {string} sessionId - 종료할 세션 ID
 * @returns {Promise<object>} 업데이트된 LectureSession
 */
async function endSession(sessionId) {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  if (session.status !== 'ACTIVE') {
    throw new Error(`Session is not active: ${sessionId}`);
  }

  const updates = { status: 'COMPLETED', endTime: new Date() };

  if (_useSupabase()) {
    return await supabaseClient.updateSession(sessionId, updates);
  }

  const updated = LectureSessionSchema.parse({ ...session, ...updates });
  sessions.set(sessionId, updated);
  return updated;
}

/**
 * 세션을 조회한다.
 * @param {string} sessionId - 조회할 세션 ID
 * @returns {Promise<object|null>} LectureSession 또는 null
 */
async function getSession(sessionId) {
  if (_useSupabase()) {
    return await supabaseClient.getSession(sessionId);
  }
  return sessions.get(sessionId) || null;
}

/**
 * 사용자의 모든 세션을 최신순으로 조회한다.
 * @param {string} userId - 사용자 UUID
 * @returns {Promise<Array>} LectureSession 목록
 */
async function getSessionsByUser(userId) {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('userId is required and must be a non-empty string');
  }
  if (_useSupabase()) {
    return await supabaseClient.getSessionsByUser(userId);
  }
  return [...sessions.values()]
    .filter(s => s.userId === userId)
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
}

/**
 * 현재 활성 세션을 조회한다.
 * @returns {Promise<object|null>}
 */
async function getActiveSession() {
  if (_useSupabase()) {
    return await supabaseClient.getActiveSession();
  }
  const active = [...sessions.values()]
    .filter(s => s.status === 'ACTIVE')
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  return active[0] || null;
}

/**
 * 테스트용: 인메모리 세션을 초기화한다.
 */
function clearSessions() {
  sessions.clear();
}

module.exports = {
  createSession,
  endSession,
  getSession,
  getSessionsByUser,
  getActiveSession,
  clearSessions,
};
