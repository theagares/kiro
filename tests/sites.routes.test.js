const express = require('express');
const request = require('supertest');
const sitesRouter = require('../backend/routes/sites');
const { resetLists } = require('../backend/services/siteClassifier');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/sites', sitesRouter);
  return app;
}

beforeEach(() => {
  resetLists();
});

describe('Sites REST API', () => {
  describe('POST /api/sites/allow', () => {
    test('adds a pattern to the allow list and returns 200', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/sites/allow')
        .send({ pattern: 'youtube.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Added to allow list');
      expect(res.body.pattern).toBe('youtube.com');
    });

    test('allowed site is no longer classified as non-study', async () => {
      const app = createApp();
      await request(app)
        .post('/api/sites/allow')
        .send({ pattern: 'youtube.com' });

      const res = await request(app)
        .post('/api/sites/classify')
        .send({ url: 'https://youtube.com/watch?v=123' });

      expect(res.status).toBe(200);
      expect(res.body.isNonStudySite).toBe(false);
    });

    test('returns 400 when pattern is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/sites/allow')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('returns 400 when pattern is empty string', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/sites/allow')
        .send({ pattern: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/sites/block', () => {
    test('adds a pattern to the block list and returns 200', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/sites/block')
        .send({ pattern: 'games.example.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Added to block list');
      expect(res.body.pattern).toBe('games.example.com');
    });

    test('blocked site is classified as non-study', async () => {
      const app = createApp();
      await request(app)
        .post('/api/sites/block')
        .send({ pattern: 'games.example.com' });

      const res = await request(app)
        .post('/api/sites/classify')
        .send({ url: 'https://games.example.com/play' });

      expect(res.status).toBe(200);
      expect(res.body.isNonStudySite).toBe(true);
    });

    test('returns 400 when pattern is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/sites/block')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/sites/classify', () => {
    test('classifies a default non-study site as non-study', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/sites/classify')
        .send({ url: 'https://www.youtube.com/watch?v=abc' });

      expect(res.status).toBe(200);
      expect(res.body.isNonStudySite).toBe(true);
      expect(res.body.url).toBe('https://www.youtube.com/watch?v=abc');
    });

    test('classifies a study site as non-study false', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/sites/classify')
        .send({ url: 'https://scholar.google.com' });

      expect(res.status).toBe(200);
      expect(res.body.isNonStudySite).toBe(false);
    });

    test('allow list takes priority over block list', async () => {
      const app = createApp();
      // youtube.com is in default block list; add it to allow list
      await request(app)
        .post('/api/sites/allow')
        .send({ pattern: 'youtube.com' });

      const res = await request(app)
        .post('/api/sites/classify')
        .send({ url: 'https://youtube.com/edu' });

      expect(res.status).toBe(200);
      expect(res.body.isNonStudySite).toBe(false);
    });

    test('returns 400 when url is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/sites/classify')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('returns 400 when url is empty string', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/sites/classify')
        .send({ url: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });
});
