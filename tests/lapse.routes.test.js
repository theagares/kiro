const express = require('express');
const request = require('supertest');
const crypto = require('crypto');
const lapseRouter = require('../backend/routes/lapse');
const { setLapseHarness } = require('../backend/routes/lapse');
const { createLapseHarness } = require('../backend/services/lapseHarness');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/lapse', lapseRouter);
  return app;
}

const validSessionId = () => crypto.randomUUID();

let currentHarness;

beforeEach(() => {
  currentHarness = createLapseHarness();
  setLapseHarness(currentHarness);
});

afterEach(() => {
  currentHarness.clearAll();
});

describe('Lapse REST API', () => {
  describe('POST /api/lapse/start/:sessionId', () => {
    test('returns 200 and starts capture for valid sessionId', async () => {
      const app = createApp();
      const sessionId = validSessionId();

      const res = await request(app)
        .post(`/api/lapse/start/${sessionId}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('capturing');
      expect(res.body.sessionId).toBe(sessionId);
    });

    test('returns 400 for empty sessionId', async () => {
      const app = createApp();

      const res = await request(app)
        .post('/api/lapse/start/%20');

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /api/lapse/stop/:sessionId', () => {
    test('returns 200 with stopped status after capture started', async () => {
      const app = createApp();
      const sessionId = validSessionId();

      // Start capture first
      await request(app).post(`/api/lapse/start/${sessionId}`);

      const res = await request(app)
        .post(`/api/lapse/stop/${sessionId}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('stopped');
    });

    test('returns 200 with null finalSummary when no buffer data', async () => {
      const app = createApp();
      const sessionId = validSessionId();

      await request(app).post(`/api/lapse/start/${sessionId}`);

      const res = await request(app)
        .post(`/api/lapse/stop/${sessionId}`);

      expect(res.status).toBe(200);
      expect(res.body.finalSummary).toBeNull();
    });

    test('returns 200 with null finalSummary when no active capture', async () => {
      const app = createApp();

      const res = await request(app)
        .post(`/api/lapse/stop/${validSessionId()}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('stopped');
      expect(res.body.finalSummary).toBeNull();
    });
  });

  describe('POST /api/lapse/transcript', () => {
    test('returns 201 with created transcript chunk', async () => {
      const app = createApp();
      const sessionId = validSessionId();

      await request(app).post(`/api/lapse/start/${sessionId}`);

      const res = await request(app)
        .post('/api/lapse/transcript')
        .send({
          sessionId,
          text: '교수님이 중간고사 범위를 설명합니다',
          startTime: '2024-01-01T10:00:00Z',
          endTime: '2024-01-01T10:00:05Z',
          isFinal: true,
          confidence: 0.95,
        });

      expect(res.status).toBe(201);
      expect(res.body.chunkId).toBeDefined();
      expect(res.body.sessionId).toBe(sessionId);
      expect(res.body.text).toBe('교수님이 중간고사 범위를 설명합니다');
      expect(res.body.isFinal).toBe(true);
      expect(res.body.confidence).toBe(0.95);
    });

    test('returns 400 when sessionId is missing', async () => {
      const app = createApp();

      const res = await request(app)
        .post('/api/lapse/transcript')
        .send({
          text: 'hello',
          startTime: '2024-01-01T10:00:00Z',
          endTime: '2024-01-01T10:00:05Z',
          isFinal: true,
          confidence: 0.9,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('returns 400 when sessionId is not a valid UUID', async () => {
      const app = createApp();

      const res = await request(app)
        .post('/api/lapse/transcript')
        .send({
          sessionId: 'not-a-uuid',
          text: 'hello',
          startTime: '2024-01-01T10:00:00Z',
          endTime: '2024-01-01T10:00:05Z',
          isFinal: true,
          confidence: 0.9,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('returns 400 when text is empty', async () => {
      const app = createApp();

      const res = await request(app)
        .post('/api/lapse/transcript')
        .send({
          sessionId: validSessionId(),
          text: '',
          startTime: '2024-01-01T10:00:00Z',
          endTime: '2024-01-01T10:00:05Z',
          isFinal: true,
          confidence: 0.9,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('returns 400 when confidence is out of range', async () => {
      const app = createApp();

      const res = await request(app)
        .post('/api/lapse/transcript')
        .send({
          sessionId: validSessionId(),
          text: 'hello',
          startTime: '2024-01-01T10:00:00Z',
          endTime: '2024-01-01T10:00:05Z',
          isFinal: true,
          confidence: 1.5,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('returns 400 when isFinal is missing', async () => {
      const app = createApp();

      const res = await request(app)
        .post('/api/lapse/transcript')
        .send({
          sessionId: validSessionId(),
          text: 'hello',
          startTime: '2024-01-01T10:00:00Z',
          endTime: '2024-01-01T10:00:05Z',
          confidence: 0.9,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/lapse/context/:sessionId', () => {
    test('returns empty context when no active capture', async () => {
      const app = createApp();

      const res = await request(app)
        .get(`/api/lapse/context/${validSessionId()}`);

      expect(res.status).toBe(200);
      expect(res.body.recentText).toBe('');
      expect(res.body.keywords).toEqual([]);
    });

    test('returns context with recent text after adding chunks', async () => {
      const app = createApp();
      const sessionId = validSessionId();
      const now = new Date();

      await request(app).post(`/api/lapse/start/${sessionId}`);

      await request(app)
        .post('/api/lapse/transcript')
        .send({
          sessionId,
          text: '미적분학 기초',
          startTime: new Date(now.getTime() - 10000).toISOString(),
          endTime: now.toISOString(),
          isFinal: true,
          confidence: 0.9,
        });

      const res = await request(app)
        .get(`/api/lapse/context/${sessionId}?windowSeconds=60`);

      expect(res.status).toBe(200);
      expect(res.body.recentText).toContain('미적분학 기초');
    });

    test('respects windowSeconds query parameter', async () => {
      const app = createApp();
      const sessionId = validSessionId();
      const now = new Date();

      await request(app).post(`/api/lapse/start/${sessionId}`);

      // Add an old chunk (120 seconds ago)
      await request(app)
        .post('/api/lapse/transcript')
        .send({
          sessionId,
          text: '오래된 텍스트',
          startTime: new Date(now.getTime() - 120000).toISOString(),
          endTime: new Date(now.getTime() - 115000).toISOString(),
          isFinal: true,
          confidence: 0.9,
        });

      // Query with 10 second window — old chunk should be excluded
      const res = await request(app)
        .get(`/api/lapse/context/${sessionId}?windowSeconds=10`);

      expect(res.status).toBe(200);
      expect(res.body.recentText).toBe('');
    });

    test('returns 400 for invalid windowSeconds', async () => {
      const app = createApp();

      const res = await request(app)
        .get(`/api/lapse/context/${validSessionId()}?windowSeconds=-5`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/windowSeconds/i);
    });

    test('returns 400 for non-numeric windowSeconds', async () => {
      const app = createApp();

      const res = await request(app)
        .get(`/api/lapse/context/${validSessionId()}?windowSeconds=abc`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/windowSeconds/i);
    });
  });

  describe('GET /api/lapse/summaries/:sessionId', () => {
    test('returns empty array when no summaries exist', async () => {
      const app = createApp();
      const sessionId = validSessionId();

      const res = await request(app)
        .get(`/api/lapse/summaries/${sessionId}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test('returns 400 for empty sessionId', async () => {
      const app = createApp();

      const res = await request(app)
        .get('/api/lapse/summaries/%20');

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });
});
