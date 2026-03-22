const express = require('express');
const request = require('supertest');
const crypto = require('crypto');
const sessionsRouter = require('../backend/routes/sessions');
const { clearSessions } = require('../backend/services/sessionManager');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/sessions', sessionsRouter);
  return app;
}

const validUserId = () => crypto.randomUUID();

beforeEach(() => {
  clearSessions();
});

describe('Sessions REST API', () => {
  describe('POST /api/sessions', () => {
    test('creates a session and returns 201', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/sessions')
        .send({ userId: validUserId(), title: 'Math 101' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.sessionId).toBeDefined();
      expect(res.body.title).toBe('Math 101');
      expect(res.body.endTime).toBeNull();
    });

    test('returns 400 when userId is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/sessions')
        .send({ title: 'Math 101' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('returns 400 when title is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/sessions')
        .send({ userId: validUserId() });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('returns 400 when title is empty string', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/sessions')
        .send({ userId: validUserId(), title: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('returns 400 when userId is not a valid UUID', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/sessions')
        .send({ userId: 'not-a-uuid', title: 'Math 101' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('PATCH /api/sessions/:sessionId/end', () => {
    test('ends an active session and returns 200', async () => {
      const app = createApp();
      const createRes = await request(app)
        .post('/api/sessions')
        .send({ userId: validUserId(), title: 'Physics' });

      const sessionId = createRes.body.sessionId;
      const res = await request(app).patch(`/api/sessions/${sessionId}/end`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.endTime).not.toBeNull();
    });

    test('returns 404 for non-existent session', async () => {
      const app = createApp();
      const res = await request(app).patch(`/api/sessions/${crypto.randomUUID()}/end`);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    test('returns 400 when ending an already completed session', async () => {
      const app = createApp();
      const createRes = await request(app)
        .post('/api/sessions')
        .send({ userId: validUserId(), title: 'Chemistry' });

      const sessionId = createRes.body.sessionId;
      await request(app).patch(`/api/sessions/${sessionId}/end`);
      const res = await request(app).patch(`/api/sessions/${sessionId}/end`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not active/i);
    });
  });

  describe('GET /api/sessions/:sessionId', () => {
    test('returns the session by id', async () => {
      const app = createApp();
      const createRes = await request(app)
        .post('/api/sessions')
        .send({ userId: validUserId(), title: 'Biology' });

      const sessionId = createRes.body.sessionId;
      const res = await request(app).get(`/api/sessions/${sessionId}`);

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(sessionId);
      expect(res.body.title).toBe('Biology');
    });

    test('returns 404 for non-existent session', async () => {
      const app = createApp();
      const res = await request(app).get(`/api/sessions/${crypto.randomUUID()}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });
  });
});
