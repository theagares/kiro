const crypto = require('crypto');

describe('Project Setup', () => {
  test('Jest is configured correctly', () => {
    expect(true).toBe(true);
  });

  test('core dependencies are available', () => {
    expect(() => require('express')).not.toThrow();
    expect(() => require('zod')).not.toThrow();
    expect(() => require('cors')).not.toThrow();
  });

  test('Node.js crypto.randomUUID is available for UUID generation', () => {
    const id = crypto.randomUUID();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  test('dev dependencies are available', () => {
    expect(() => require('fast-check')).not.toThrow();
    expect(() => require('supertest')).not.toThrow();
  });
});
