const crypto = require('crypto');
const { createFocusHarness } = require('../backend/services/focusHarness');
const { createSession, clearSessions } = require('../backend/services/sessionManager');

const validUserId = () => crypto.randomUUID();

// Mock LapseHarness
function createMockLapseHarness(context = { recentText: '교수님이 중간고사 범위를 설명 중입니다', keywords: ['중간고사', '범위'] }) {
  return {
    getRecentContext: jest.fn().mockResolvedValue(context),
  };
}

// Mock AIAgent
function createMockAIAgent(response = { message: '지금 교수님이 중간고사 범위를 말씀 중이에요!', urgency: 'HIGH' }) {
  return {
    generatePersuasion: jest.fn().mockResolvedValue(response),
  };
}

beforeEach(() => {
  clearSessions();
});

describe('FocusHarness', () => {
  describe('handleTabSwitch', () => {
    test('returns null for study sites', async () => {
      const session = createSession(validUserId(), 'Math 101');
      const harness = createFocusHarness({
        lapseHarness: createMockLapseHarness(),
        aiAgent: createMockAIAgent(),
      });

      const result = await harness.handleTabSwitch({
        sessionId: session.sessionId,
        targetUrl: 'https://docs.google.com/document',
        timestamp: new Date(),
      });

      expect(result).toBeNull();
    });

    test('returns PersuasionMessage for non-study sites', async () => {
      const session = createSession(validUserId(), 'Math 101');
      const mockLapse = createMockLapseHarness();
      const mockAI = createMockAIAgent();
      const harness = createFocusHarness({
        lapseHarness: mockLapse,
        aiAgent: mockAI,
      });

      const result = await harness.handleTabSwitch({
        sessionId: session.sessionId,
        targetUrl: 'https://www.youtube.com/watch?v=abc',
        timestamp: new Date(),
      });

      expect(result).not.toBeNull();
      expect(result.message).toBe('지금 교수님이 중간고사 범위를 말씀 중이에요!');
      expect(result.urgency).toBe('HIGH');
      expect(result.lectureContext).toBe('교수님이 중간고사 범위를 설명 중입니다');
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    test('calls lapseHarness.getRecentContext on non-study site', async () => {
      const session = createSession(validUserId(), 'Physics');
      const mockLapse = createMockLapseHarness();
      const mockAI = createMockAIAgent();
      const harness = createFocusHarness({
        lapseHarness: mockLapse,
        aiAgent: mockAI,
      });

      await harness.handleTabSwitch({
        sessionId: session.sessionId,
        targetUrl: 'https://www.instagram.com',
        timestamp: new Date(),
      });

      expect(mockLapse.getRecentContext).toHaveBeenCalledWith(60);
    });

    test('calls aiAgent.generatePersuasion with context and targetUrl', async () => {
      const session = createSession(validUserId(), 'History');
      const context = { recentText: '역사 강의 내용', keywords: ['역사'] };
      const mockLapse = createMockLapseHarness(context);
      const mockAI = createMockAIAgent();
      const harness = createFocusHarness({
        lapseHarness: mockLapse,
        aiAgent: mockAI,
      });

      const targetUrl = 'https://www.reddit.com';
      await harness.handleTabSwitch({
        sessionId: session.sessionId,
        targetUrl,
        timestamp: new Date(),
      });

      expect(mockAI.generatePersuasion).toHaveBeenCalledWith(context, targetUrl);
    });

    test('throws when sessionId is missing', async () => {
      const harness = createFocusHarness();
      await expect(
        harness.handleTabSwitch({ targetUrl: 'https://youtube.com', timestamp: new Date() })
      ).rejects.toThrow('sessionId, targetUrl, and timestamp are required');
    });

    test('throws when session does not exist', async () => {
      const harness = createFocusHarness();
      await expect(
        harness.handleTabSwitch({
          sessionId: crypto.randomUUID(),
          targetUrl: 'https://youtube.com',
          timestamp: new Date(),
        })
      ).rejects.toThrow('Session not found');
    });

    test('throws when session is not active', async () => {
      const { endSession } = require('../backend/services/sessionManager');
      const session = createSession(validUserId(), 'English');
      endSession(session.sessionId);

      const harness = createFocusHarness();
      await expect(
        harness.handleTabSwitch({
          sessionId: session.sessionId,
          targetUrl: 'https://youtube.com',
          timestamp: new Date(),
        })
      ).rejects.toThrow('Session is not active');
    });

    test('works with default fallbacks when no dependencies injected', async () => {
      const session = createSession(validUserId(), 'Chemistry');
      const harness = createFocusHarness();

      const result = await harness.handleTabSwitch({
        sessionId: session.sessionId,
        targetUrl: 'https://www.youtube.com',
        timestamp: new Date(),
      });

      expect(result).not.toBeNull();
      expect(result.message).toBe('강의에 집중해주세요!');
      expect(result.urgency).toBe('MEDIUM');
    });
  });

  describe('handleTabReturn', () => {
    test('records DistractionEvent with correct duration', async () => {
      const session = createSession(validUserId(), 'Biology');
      const harness = createFocusHarness({
        lapseHarness: createMockLapseHarness(),
        aiAgent: createMockAIAgent(),
      });

      const departureTime = new Date('2024-01-01T10:00:00Z');
      const returnTime = new Date('2024-01-01T10:00:30Z');

      await harness.handleTabSwitch({
        sessionId: session.sessionId,
        targetUrl: 'https://www.youtube.com/watch?v=test',
        timestamp: departureTime,
      });

      const event = harness.handleTabReturn({
        sessionId: session.sessionId,
        timestamp: returnTime,
      });

      expect(event).not.toBeNull();
      expect(event.sessionId).toBe(session.sessionId);
      expect(event.targetUrl).toBe('https://www.youtube.com/watch?v=test');
      expect(event.siteName).toBe('www.youtube.com');
      expect(event.departureTime).toEqual(departureTime);
      expect(event.returnTime).toEqual(returnTime);
      expect(event.durationSeconds).toBe(30);
      expect(event.persuasionMessage).toBe('지금 교수님이 중간고사 범위를 말씀 중이에요!');
    });

    test('returns null when no pending departure', () => {
      const session = createSession(validUserId(), 'Art');
      const harness = createFocusHarness();

      const result = harness.handleTabReturn({
        sessionId: session.sessionId,
        timestamp: new Date(),
      });

      expect(result).toBeNull();
    });

    test('throws when sessionId is missing', () => {
      const harness = createFocusHarness();
      expect(() =>
        harness.handleTabReturn({ timestamp: new Date() })
      ).toThrow('sessionId and timestamp are required');
    });

    test('stores event retrievable via getDistractionEvents', async () => {
      const session = createSession(validUserId(), 'Music');
      const harness = createFocusHarness({
        lapseHarness: createMockLapseHarness(),
        aiAgent: createMockAIAgent(),
      });

      await harness.handleTabSwitch({
        sessionId: session.sessionId,
        targetUrl: 'https://twitter.com',
        timestamp: new Date('2024-01-01T10:00:00Z'),
      });

      harness.handleTabReturn({
        sessionId: session.sessionId,
        timestamp: new Date('2024-01-01T10:01:00Z'),
      });

      const events = harness.getDistractionEvents(session.sessionId);
      expect(events).toHaveLength(1);
      expect(events[0].durationSeconds).toBe(60);
    });

    test('clears pending departure after return', async () => {
      const session = createSession(validUserId(), 'PE');
      const harness = createFocusHarness({
        lapseHarness: createMockLapseHarness(),
        aiAgent: createMockAIAgent(),
      });

      await harness.handleTabSwitch({
        sessionId: session.sessionId,
        targetUrl: 'https://facebook.com',
        timestamp: new Date(),
      });

      harness.handleTabReturn({
        sessionId: session.sessionId,
        timestamp: new Date(),
      });

      // Second return should return null
      const result = harness.handleTabReturn({
        sessionId: session.sessionId,
        timestamp: new Date(),
      });
      expect(result).toBeNull();
    });
  });

  describe('getDistractionStats', () => {
    test('returns zero stats for session with no distractions', () => {
      const session = createSession(validUserId(), 'Philosophy');
      const harness = createFocusHarness();

      const stats = harness.getDistractionStats(session.sessionId);

      expect(stats.sessionId).toBe(session.sessionId);
      expect(stats.totalDistractions).toBe(0);
      expect(stats.totalDistractedSeconds).toBe(0);
      expect(stats.averageDistractionSeconds).toBe(0);
      expect(stats.topDistractingSites).toEqual([]);
      expect(stats.focusRate).toBeGreaterThanOrEqual(0);
      expect(stats.focusRate).toBeLessThanOrEqual(1);
    });

    test('calculates correct stats after multiple distractions', async () => {
      const session = createSession(validUserId(), 'Economics');
      const harness = createFocusHarness({
        lapseHarness: createMockLapseHarness(),
        aiAgent: createMockAIAgent(),
      });

      // First distraction: youtube, 30 seconds
      await harness.handleTabSwitch({
        sessionId: session.sessionId,
        targetUrl: 'https://www.youtube.com',
        timestamp: new Date('2024-01-01T10:00:00Z'),
      });
      harness.handleTabReturn({
        sessionId: session.sessionId,
        timestamp: new Date('2024-01-01T10:00:30Z'),
      });

      // Second distraction: youtube, 20 seconds
      await harness.handleTabSwitch({
        sessionId: session.sessionId,
        targetUrl: 'https://www.youtube.com',
        timestamp: new Date('2024-01-01T10:01:00Z'),
      });
      harness.handleTabReturn({
        sessionId: session.sessionId,
        timestamp: new Date('2024-01-01T10:01:20Z'),
      });

      // Third distraction: reddit, 10 seconds
      await harness.handleTabSwitch({
        sessionId: session.sessionId,
        targetUrl: 'https://www.reddit.com',
        timestamp: new Date('2024-01-01T10:02:00Z'),
      });
      harness.handleTabReturn({
        sessionId: session.sessionId,
        timestamp: new Date('2024-01-01T10:02:10Z'),
      });

      const stats = harness.getDistractionStats(session.sessionId);

      expect(stats.totalDistractions).toBe(3);
      expect(stats.totalDistractedSeconds).toBe(60);
      expect(stats.averageDistractionSeconds).toBe(20);
      expect(stats.topDistractingSites[0].siteName).toBe('www.youtube.com');
      expect(stats.topDistractingSites[0].count).toBe(2);
      expect(stats.topDistractingSites[1].siteName).toBe('www.reddit.com');
      expect(stats.topDistractingSites[1].count).toBe(1);
      expect(stats.focusRate).toBeGreaterThanOrEqual(0);
      expect(stats.focusRate).toBeLessThanOrEqual(1);
    });

    test('throws when sessionId is missing', () => {
      const harness = createFocusHarness();
      expect(() => harness.getDistractionStats(null)).toThrow('sessionId is required');
    });

    test('throws when session does not exist', () => {
      const harness = createFocusHarness();
      expect(() => harness.getDistractionStats(crypto.randomUUID())).toThrow('Session not found');
    });
  });

  describe('clearAll', () => {
    test('clears all stored data', async () => {
      const session = createSession(validUserId(), 'Sociology');
      const harness = createFocusHarness({
        lapseHarness: createMockLapseHarness(),
        aiAgent: createMockAIAgent(),
      });

      await harness.handleTabSwitch({
        sessionId: session.sessionId,
        targetUrl: 'https://youtube.com',
        timestamp: new Date(),
      });
      harness.handleTabReturn({
        sessionId: session.sessionId,
        timestamp: new Date(),
      });

      harness.clearAll();

      const events = harness.getDistractionEvents(session.sessionId);
      expect(events).toHaveLength(0);
    });
  });
});
