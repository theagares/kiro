const { LectureSessionSchema, generateUUID } = require('../models/schemas');

// In-memory session store
const sessions = new Map();

/**
 * 새 강의 세션을 생성한다.
 * @param {string} userId - 사용자 UUID
 * @param {string} title - 강의 제목
 * @returns {object} 생성된 LectureSession
 */
function createSession(userId, title) {
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
  sessions.set(session.sessionId, session);
  return session;
}

/**
 * 세션을 종료한다.
 * @param {string} sessionId - 종료할 세션 ID
 * @returns {object} 업데이트된 LectureSession
 */
function endSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  if (session.status !== 'ACTIVE') {
    throw new Error(`Session is not active: ${sessionId}`);
  }

  const updated = {
    ...session,
    status: 'COMPLETED',
    endTime: new Date(),
  };

  const validated = LectureSessionSchema.parse(updated);
  sessions.set(sessionId, validated);
  return validated;
}

/**
 * 세션을 조회한다.
 * @param {string} sessionId - 조회할 세션 ID
 * @returns {object|null} LectureSession 또는 null
 */
function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

/**
 * 테스트용: 모든 세션을 초기화한다.
 */
function clearSessions() {
  sessions.clear();
}

module.exports = {
  createSession,
  endSession,
  getSession,
  clearSessions,
};
