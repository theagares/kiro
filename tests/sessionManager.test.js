const crypto = require('crypto');
const { createSession, endSession, getSession, clearSessions } = require('../backend/services/sessionManager');

const validUserId = () => crypto.randomUUID();

beforeEach(() => {
  clearSessions();
});

describe('SessionManager', () => {
  describe('createSession', () => {
    test('creates a session with ACTIVE status and unique sessionId', async () => {
      const session = await createSession(validUserId(), 'Math 101');
      expect(session.status).toBe('ACTIVE');
      expect(session.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
      expect(session.title).toBe('Math 101');
      expect(session.startTime).toBeInstanceOf(Date);
      expect(session.endTime).toBeNull();
    });

    test('generates unique sessionIds for different sessions', async () => {
      const uid = validUserId();
      const s1 = await createSession(uid, 'Lecture A');
      const s2 = await createSession(uid, 'Lecture B');
      expect(s1.sessionId).not.toBe(s2.sessionId);
    });

    test('stores session retrievable via getSession', async () => {
      const session = await createSession(validUserId(), 'Physics');
      const retrieved = await getSession(session.sessionId);
      expect(retrieved).toEqual(session);
    });

    test('throws when userId is missing', async () => {
      await expect(createSession(null, 'Title')).rejects.toThrow('userId is required');
      await expect(createSession(undefined, 'Title')).rejects.toThrow('userId is required');
      await expect(createSession('', 'Title')).rejects.toThrow('userId is required');
      await expect(createSession('   ', 'Title')).rejects.toThrow('userId is required');
    });

    test('throws when title is missing', async () => {
      const uid = validUserId();
      await expect(createSession(uid, null)).rejects.toThrow('title is required');
      await expect(createSession(uid, undefined)).rejects.toThrow('title is required');
      await expect(createSession(uid, '')).rejects.toThrow('title is required');
      await expect(createSession(uid, '   ')).rejects.toThrow('title is required');
    });
  });

  describe('endSession', () => {
    test('changes status to COMPLETED and records endTime', async () => {
      const session = await createSession(validUserId(), 'History');
      const ended = await endSession(session.sessionId);
      expect(ended.status).toBe('COMPLETED');
      expect(ended.endTime).toBeInstanceOf(Date);
      expect(ended.endTime.getTime()).toBeGreaterThanOrEqual(ended.startTime.getTime());
    });

    test('throws for non-existent sessionId', async () => {
      await expect(endSession(crypto.randomUUID())).rejects.toThrow('Session not found');
    });

    test('throws when session is already completed', async () => {
      const session = await createSession(validUserId(), 'Chemistry');
      await endSession(session.sessionId);
      await expect(endSession(session.sessionId)).rejects.toThrow('Session is not active');
    });
  });

  describe('getSession', () => {
    test('returns null for non-existent sessionId', async () => {
      expect(await getSession(crypto.randomUUID())).toBeNull();
    });

    test('returns the session after creation', async () => {
      const session = await createSession(validUserId(), 'Biology');
      expect(await getSession(session.sessionId)).toEqual(session);
    });

    test('returns updated session after ending', async () => {
      const session = await createSession(validUserId(), 'English');
      await endSession(session.sessionId);
      const retrieved = await getSession(session.sessionId);
      expect(retrieved.status).toBe('COMPLETED');
      expect(retrieved.endTime).not.toBeNull();
    });
  });
});
