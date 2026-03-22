const crypto = require('crypto');
const { calculateStats, createDistractionTracker } = require('../backend/services/distractionTracker');

const uuid = () => crypto.randomUUID();

describe('calculateStats', () => {
  const sessionId = uuid();
  const startTime = new Date('2024-01-01T10:00:00Z');
  const endTime = new Date('2024-01-01T11:00:00Z'); // 1 hour = 3600s

  test('returns zero stats for empty events list', () => {
    const stats = calculateStats({ sessionId, events: [], startTime, endTime });

    expect(stats.sessionId).toBe(sessionId);
    expect(stats.totalDistractions).toBe(0);
    expect(stats.totalDistractedSeconds).toBe(0);
    expect(stats.averageDistractionSeconds).toBe(0);
    expect(stats.topDistractingSites).toEqual([]);
    expect(stats.focusRate).toBe(1);
  });

  test('calculates totalDistractions as event count', () => {
    const events = [
      { durationSeconds: 10, siteName: 'youtube.com' },
      { durationSeconds: 20, siteName: 'reddit.com' },
      { durationSeconds: 30, siteName: 'twitter.com' },
    ];
    const stats = calculateStats({ sessionId, events, startTime, endTime });
    expect(stats.totalDistractions).toBe(3);
  });

  test('calculates totalDistractedSeconds as sum of durationSeconds', () => {
    const events = [
      { durationSeconds: 15, siteName: 'youtube.com' },
      { durationSeconds: 25, siteName: 'reddit.com' },
    ];
    const stats = calculateStats({ sessionId, events, startTime, endTime });
    expect(stats.totalDistractedSeconds).toBe(40);
  });

  test('calculates averageDistractionSeconds correctly', () => {
    const events = [
      { durationSeconds: 10, siteName: 'youtube.com' },
      { durationSeconds: 30, siteName: 'reddit.com' },
    ];
    const stats = calculateStats({ sessionId, events, startTime, endTime });
    expect(stats.averageDistractionSeconds).toBe(20);
  });

  test('calculates topDistractingSites sorted by count descending', () => {
    const events = [
      { durationSeconds: 10, siteName: 'youtube.com' },
      { durationSeconds: 20, siteName: 'reddit.com' },
      { durationSeconds: 15, siteName: 'youtube.com' },
      { durationSeconds: 5, siteName: 'youtube.com' },
      { durationSeconds: 8, siteName: 'reddit.com' },
    ];
    const stats = calculateStats({ sessionId, events, startTime, endTime });

    expect(stats.topDistractingSites).toHaveLength(2);
    expect(stats.topDistractingSites[0]).toEqual({ siteName: 'youtube.com', count: 3 });
    expect(stats.topDistractingSites[1]).toEqual({ siteName: 'reddit.com', count: 2 });
  });

  test('calculates focusRate correctly', () => {
    // Session: 3600s, distracted: 360s → focusRate = 1 - 360/3600 = 0.9
    const events = [
      { durationSeconds: 180, siteName: 'youtube.com' },
      { durationSeconds: 180, siteName: 'reddit.com' },
    ];
    const stats = calculateStats({ sessionId, events, startTime, endTime });
    expect(stats.focusRate).toBeCloseTo(0.9, 2);
  });

  test('clamps focusRate to 0.0 when distracted time exceeds session time', () => {
    const shortEnd = new Date('2024-01-01T10:00:10Z'); // 10s session
    const events = [
      { durationSeconds: 50, siteName: 'youtube.com' },
    ];
    const stats = calculateStats({ sessionId, events, startTime, endTime: shortEnd });
    expect(stats.focusRate).toBe(0);
  });

  test('clamps focusRate to 1.0 when no distractions', () => {
    const stats = calculateStats({ sessionId, events: [], startTime, endTime });
    expect(stats.focusRate).toBe(1);
  });

  test('uses current time when endTime is null', () => {
    const recentStart = new Date(Date.now() - 60000); // 60s ago
    const events = [{ durationSeconds: 10, siteName: 'youtube.com' }];
    const stats = calculateStats({ sessionId, events, startTime: recentStart, endTime: null });

    expect(stats.focusRate).toBeGreaterThan(0);
    expect(stats.focusRate).toBeLessThanOrEqual(1);
  });

  test('throws when sessionId is missing', () => {
    expect(() => calculateStats({ events: [], startTime, endTime }))
      .toThrow('sessionId is required');
  });

  test('throws when startTime is missing', () => {
    expect(() => calculateStats({ sessionId, events: [], endTime }))
      .toThrow('startTime is required');
  });

  test('throws when events is not an array', () => {
    expect(() => calculateStats({ sessionId, events: 'bad', startTime, endTime }))
      .toThrow('events must be an array');
  });
});

describe('createDistractionTracker', () => {
  const sessionId = uuid();
  const startTime = new Date('2024-01-01T10:00:00Z');
  const endTime = new Date('2024-01-01T11:00:00Z');

  test('starts with zero stats', () => {
    const tracker = createDistractionTracker({ sessionId, startTime, endTime });
    const stats = tracker.getStats();

    expect(stats.totalDistractions).toBe(0);
    expect(stats.totalDistractedSeconds).toBe(0);
    expect(stats.focusRate).toBe(1);
  });

  test('updates stats immediately when event is added', () => {
    const tracker = createDistractionTracker({ sessionId, startTime, endTime });

    tracker.addEvent({ durationSeconds: 30, siteName: 'youtube.com' });
    const stats1 = tracker.getStats();
    expect(stats1.totalDistractions).toBe(1);
    expect(stats1.totalDistractedSeconds).toBe(30);

    tracker.addEvent({ durationSeconds: 20, siteName: 'reddit.com' });
    const stats2 = tracker.getStats();
    expect(stats2.totalDistractions).toBe(2);
    expect(stats2.totalDistractedSeconds).toBe(50);
  });

  test('getEvents returns a copy of the events list', () => {
    const tracker = createDistractionTracker({ sessionId, startTime, endTime });
    tracker.addEvent({ durationSeconds: 10, siteName: 'youtube.com' });

    const events = tracker.getEvents();
    expect(events).toHaveLength(1);

    // Mutating the returned array should not affect internal state
    events.push({ durationSeconds: 99, siteName: 'fake.com' });
    expect(tracker.getEvents()).toHaveLength(1);
  });

  test('setEndTime updates the end time for stats calculation', () => {
    const tracker = createDistractionTracker({ sessionId, startTime });
    tracker.addEvent({ durationSeconds: 1800, siteName: 'youtube.com' });

    // Set end time to 1 hour after start → 1800/3600 distracted → focusRate = 0.5
    tracker.setEndTime(new Date('2024-01-01T11:00:00Z'));
    const stats = tracker.getStats();
    expect(stats.focusRate).toBeCloseTo(0.5, 2);
  });

  test('throws when sessionId is missing', () => {
    expect(() => createDistractionTracker({ startTime }))
      .toThrow('sessionId is required');
  });

  test('throws when startTime is missing', () => {
    expect(() => createDistractionTracker({ sessionId }))
      .toThrow('startTime is required');
  });

  test('throws when adding invalid event', () => {
    const tracker = createDistractionTracker({ sessionId, startTime, endTime });
    expect(() => tracker.addEvent(null)).toThrow('event must be an object');
  });
});
