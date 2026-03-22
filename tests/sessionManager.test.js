const crypto = require('crypto');
const { createSession, endSession, getSession, clearSessions } = require('../backend/services/sessionManager');

const validUserId = () => crypto.randomUUID();

beforeEach(() => {
  clearSessions();
});

describe('SessionManager', () => {
  describe('createSession', () => {
    test('creates a session with ACTIVE status and unique sessionId', () => {
      const session = createSession(validUserId(), 'Math 101');
      expect(session.status).toBe('ACTIVE');
      expect(session.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
      expect(session.title).toBe('Math 101');
      expect(session.startTime).toBeInstanceOf(Date);
      expect(session.endTime).toBeNull();
    });

    test('generates unique sessionIds for different sessions', () => {
      const uid = validUserId();
      const s1 = createSession(uid, 'Lecture A');
      const s2 = createSession(uid, 'Lecture B');
      expect(s1.sessionId).not.toBe(s2.sessionId);
    });

    test('stores session retrievable via getSession', () => {
      const session = createSession(validUserId(), 'Physics');
      const retrieved = getSession(session.sessionId);
      expect(retrieved).toEqual(session);
    });

    test('throws when userId is missing', () => {
      expect(() => createSession(null, 'Title')).toThrow('userId is required');
      expect(() => createSession(undefined, 'Title')).toThrow('userId is required');
      expect(() => createSession('', 'Title')).toThrow('userId is required');
      expect(() => createSession('   ', 'Title')).toThrow('userId is required');
    });

    test('throws when title is missing', () => {
      const uid = validUserId();
      expect(() => createSession(uid, null)).toThrow('title is required');
      expect(() => createSession(uid, undefined)).toThrow('title is required');
      expect(() => createSession(uid, '')).toThrow('title is required');
      expect(() => createSession(uid, '   ')).toThrow('title is required');
    });
  });

  describe('endSession', () => {
    test('changes status to COMPLETED and records endTime', () => {
      const session = createSession(validUserId(), 'History');
      const ended = endSession(session.sessionId);
      expect(ended.status).toBe('COMPLETED');
      expect(ended.endTime).toBeInstanceOf(Date);
      expect(ended.endTime.getTime()).toBeGreaterThanOrEqual(ended.startTime.getTime());
    });

    test('throws for non-existent sessionId', () => {
      expect(() => endSession(crypto.randomUUID())).toThrow('Session not found');
    });

    test('throws when session is already completed', () => {
      const session = createSession(validUserId(), 'Chemistry');
      endSession(session.sessionId);
      expect(() => endSession(session.sessionId)).toThrow('Session is not active');
    });
  });

  describe('getSession', () => {
    test('returns null for non-existent sessionId', () => {
      expect(getSession(crypto.randomUUID())).toBeNull();
    });

    test('returns the session after creation', () => {
      const session = createSession(validUserId(), 'Biology');
      expect(getSession(session.sessionId)).toEqual(session);
    });

    test('returns updated session after ending', () => {
      const session = createSession(validUserId(), 'English');
      endSession(session.sessionId);
      const retrieved = getSession(session.sessionId);
      expect(retrieved.status).toBe('COMPLETED');
      expect(retrieved.endTime).not.toBeNull();
    });
  });
});
