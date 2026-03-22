const express = require('express');
const request = require('supertest');
const crypto = require('crypto');
const focusRouter = require('../backend/routes/focus');
const { setFocusHarness } = require('../backend/routes/focus');
const { createFocusHarness } = require('../backend/services/focusHarness');
const { createSession, clearSessions } = require('../backend/services/sessionManager');

const validUserId = () => crypto.randomUUID();

function createMockLapseHarness() {
  return {
    getRecentContext: jest.fn().mockResolvedValue({
      recentText: '교수님이 중간고사 범위를 설명 중입니다',
      keywords: ['중간고사', '범위'],
    }),
  };
}

function createMockAIAgent() {
  return {
    generatePersuasion: jest.fn().mockResolvedValue({
      message: '지금 교수님이 중간고사 범위를 말씀 중이에요!',
      urgency: 'HIGH',
    }),
  };
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/focus', focusRouter);
  return app;
}

beforeEach(() => {
  clearSessions();
  // Reset to a fresh FocusHarness with mocks for each test
  const harness = createFocusHarness({
    lapseHarness: createMockLapseHarness(),
    aiAgent: createMockAIAgent(),
  });
  setFocusHarness(harness);
});

describe('Focus REST API', () => {
  describe('POST /api/focus/tab-switch', () => {
    test('returns 200 with persuasion message for non-study site', async () => {
      const app = createApp();
      const session = await createSession(validUserId(), 'Math 101');

      const res = await request(app)
        .post('/api/focus/tab-switch')
        .send({
          sessionId: session.sessionId,
          targetUrl: 'https://www.youtube.com/watch?v=abc',
          timestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.persuasion).not.toBeNull();
      expect(res.body.persuasion.message).toBe('지금 교수님이 중간고사 범위를 말씀 중이에요!');
      expect(res.body.persuasion.urgency).toBe('HIGH');
    });

    test('returns 200 with persuasion for any site (study site included)', async () => {
      const app = createApp();
      const session = await createSession(validUserId(), 'Math 101');

      const res = await request(app)
        .post('/api/focus/tab-switch')
        .send({
          sessionId: session.sessionId,
          targetUrl: 'https://docs.google.com/document',
          timestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.persuasion).not.toBeNull();
      expect(res.body.persuasion.message).toBeDefined();
    });

    test('returns 400 when sessionId is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/focus/tab-switch')
        .send({
          targetUrl: 'https://youtube.com',
          timestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('returns 400 when sessionId is not a valid UUID', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/focus/tab-switch')
        .send({
          sessionId: 'not-a-uuid',
          targetUrl: 'https://youtube.com',
          timestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('returns 400 when targetUrl is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/focus/tab-switch')
        .send({
          sessionId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('returns 400 when timestamp is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/focus/tab-switch')
        .send({
          sessionId: crypto.randomUUID(),
          targetUrl: 'https://youtube.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('returns 404 when session does not exist', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/focus/tab-switch')
        .send({
          sessionId: crypto.randomUUID(),
          targetUrl: 'https://youtube.com',
          timestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    test('returns 400 when session is not active', async () => {
      const app = createApp();
      const { endSession } = require('../backend/services/sessionManager');
      const session = await createSession(validUserId(), 'English');
      await endSession(session.sessionId);

      const res = await request(app)
        .post('/api/focus/tab-switch')
        .send({
          sessionId: session.sessionId,
          targetUrl: 'https://youtube.com',
          timestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not active/i);
    });
  });

  describe('POST /api/focus/tab-return', () => {
    test('returns 200 with distraction event after tab switch and return', async () => {
      const app = createApp();
      const session = await createSession(validUserId(), 'Physics');
      const departureTime = '2024-01-01T10:00:00Z';
      const returnTime = '2024-01-01T10:00:30Z';

      // First, trigger a tab switch
      await request(app)
        .post('/api/focus/tab-switch')
        .send({
          sessionId: session.sessionId,
          targetUrl: 'https://www.youtube.com/watch?v=test',
          timestamp: departureTime,
        });

      // Then, trigger a tab return
      const res = await request(app)
        .post('/api/focus/tab-return')
        .send({
          sessionId: session.sessionId,
          timestamp: returnTime,
        });

      expect(res.status).toBe(200);
      expect(res.body.event).not.toBeNull();
      expect(res.body.event.sessionId).toBe(session.sessionId);
      expect(res.body.event.durationSeconds).toBe(30);
      expect(res.body.event.targetUrl).toBe('https://www.youtube.com/watch?v=test');
    });

    test('returns 200 with null event when no pending departure', async () => {
      const app = createApp();
      const session = await createSession(validUserId(), 'Art');

      const res = await request(app)
        .post('/api/focus/tab-return')
        .send({
          sessionId: session.sessionId,
          timestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.event).toBeNull();
    });

    test('returns 400 when sessionId is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/focus/tab-return')
        .send({
          timestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('returns 400 when sessionId is not a valid UUID', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/focus/tab-return')
        .send({
          sessionId: 'invalid',
          timestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('returns 400 when timestamp is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/focus/tab-return')
        .send({
          sessionId: crypto.randomUUID(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/focus/stats/:sessionId', () => {
    test('returns stats for session with no distractions', async () => {
      const app = createApp();
      const session = await createSession(validUserId(), 'Philosophy');

      const res = await request(app)
        .get(`/api/focus/stats/${session.sessionId}`);

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(session.sessionId);
      expect(res.body.totalDistractions).toBe(0);
      expect(res.body.totalDistractedSeconds).toBe(0);
      expect(res.body.averageDistractionSeconds).toBe(0);
      expect(res.body.topDistractingSites).toEqual([]);
      expect(res.body.focusRate).toBeGreaterThanOrEqual(0);
      expect(res.body.focusRate).toBeLessThanOrEqual(1);
    });

    test('returns updated stats after distractions', async () => {
      const app = createApp();
      const session = await createSession(validUserId(), 'Economics');

      // Distraction 1
      await request(app)
        .post('/api/focus/tab-switch')
        .send({
          sessionId: session.sessionId,
          targetUrl: 'https://www.youtube.com',
          timestamp: '2024-01-01T10:00:00Z',
        });
      await request(app)
        .post('/api/focus/tab-return')
        .send({
          sessionId: session.sessionId,
          timestamp: '2024-01-01T10:00:30Z',
        });

      // Distraction 2
      await request(app)
        .post('/api/focus/tab-switch')
        .send({
          sessionId: session.sessionId,
          targetUrl: 'https://www.reddit.com',
          timestamp: '2024-01-01T10:01:00Z',
        });
      await request(app)
        .post('/api/focus/tab-return')
        .send({
          sessionId: session.sessionId,
          timestamp: '2024-01-01T10:01:20Z',
        });

      const res = await request(app)
        .get(`/api/focus/stats/${session.sessionId}`);

      expect(res.status).toBe(200);
      expect(res.body.totalDistractions).toBe(2);
      expect(res.body.totalDistractedSeconds).toBe(50);
      expect(res.body.focusRate).toBeGreaterThanOrEqual(0);
      expect(res.body.focusRate).toBeLessThanOrEqual(1);
    });

    test('returns 404 for non-existent session', async () => {
      const app = createApp();
      const res = await request(app)
        .get(`/api/focus/stats/${crypto.randomUUID()}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });
  });
});
