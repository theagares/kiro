const crypto = require('crypto');
const request = require('supertest');
const app = require('../backend/app');
const { createSession, clearSessions } = require('../backend/services/sessionManager');

const validUserId = () => crypto.randomUUID();

beforeEach(() => {
  clearSessions();
});

describe('Component Integration (app.js DI wiring)', () => {
  describe('FocusHarness → LapseHarness + AIAgent integration', () => {
    test('tab-switch on non-study site returns persuasion with lecture context', async () => {
      const session = await createSession(validUserId(), 'Math 101');
      const sessionId = session.sessionId;

      // Start lapse capture and add transcript data
      await request(app).post(`/api/lapse/start/${sessionId}`);
      await request(app)
        .post('/api/lapse/transcript')
        .send({
          sessionId,
          text: '미적분학에서 도함수의 정의를 살펴보겠습니다',
          startTime: new Date(Date.now() - 5000).toISOString(),
          endTime: new Date().toISOString(),
          isFinal: true,
          confidence: 0.92,
        });

      // Trigger tab switch — FocusHarness should query LapseHarness for context
      // and use AIAgent to generate persuasion
      const res = await request(app)
        .post('/api/focus/tab-switch')
        .send({
          sessionId,
          targetUrl: 'https://www.youtube.com/watch?v=abc',
          timestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.persuasion).not.toBeNull();
      expect(res.body.persuasion.message).toBeDefined();
      expect(res.body.persuasion.urgency).toBeDefined();
      expect(res.body.persuasion.lectureContext).toBeDefined();
      expect(res.body.persuasion.generatedAt).toBeDefined();

      // Clean up
      await request(app).post(`/api/lapse/stop/${sessionId}`);
    });

    test('tab-switch then tab-return records distraction event', async () => {
      const session = await createSession(validUserId(), 'Physics');
      const sessionId = session.sessionId;
      const departure = '2024-06-01T10:00:00Z';
      const returnTime = '2024-06-01T10:00:45Z';

      await request(app)
        .post('/api/focus/tab-switch')
        .send({ sessionId, targetUrl: 'https://www.youtube.com', timestamp: departure });

      const res = await request(app)
        .post('/api/focus/tab-return')
        .send({ sessionId, timestamp: returnTime });

      expect(res.status).toBe(200);
      expect(res.body.event).not.toBeNull();
      expect(res.body.event.durationSeconds).toBe(45);
    });

    test('distraction stats reflect recorded events', async () => {
      const session = await createSession(validUserId(), 'Chemistry');
      const sessionId = session.sessionId;

      await request(app)
        .post('/api/focus/tab-switch')
        .send({ sessionId, targetUrl: 'https://www.youtube.com', timestamp: '2024-06-01T10:00:00Z' });
      await request(app)
        .post('/api/focus/tab-return')
        .send({ sessionId, timestamp: '2024-06-01T10:00:20Z' });

      const res = await request(app).get(`/api/focus/stats/${sessionId}`);

      expect(res.status).toBe(200);
      expect(res.body.totalDistractions).toBe(1);
      expect(res.body.totalDistractedSeconds).toBe(20);
      expect(res.body.focusRate).toBeGreaterThanOrEqual(0);
      expect(res.body.focusRate).toBeLessThanOrEqual(1);
    });
  });

  describe('LapseHarness → AIAgent summary integration', () => {
    test('lapse capture stores transcript and returns context', async () => {
      const session = await createSession(validUserId(), 'Biology');
      const sessionId = session.sessionId;

      await request(app).post(`/api/lapse/start/${sessionId}`);

      await request(app)
        .post('/api/lapse/transcript')
        .send({
          sessionId,
          text: '세포 분열 과정에서 DNA 복제가 먼저 일어납니다',
          startTime: new Date(Date.now() - 3000).toISOString(),
          endTime: new Date().toISOString(),
          isFinal: true,
          confidence: 0.88,
        });

      const res = await request(app)
        .get(`/api/lapse/context/${sessionId}?windowSeconds=60`);

      expect(res.status).toBe(200);
      expect(res.body.recentText).toContain('세포 분열');

      await request(app).post(`/api/lapse/stop/${sessionId}`);
    });
  });
});
