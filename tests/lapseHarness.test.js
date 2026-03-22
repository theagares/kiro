const crypto = require('crypto');
const { createLapseHarness } = require('../backend/services/lapseHarness');

const validSessionId = () => crypto.randomUUID();

// Mock AIAgent
function createMockAIAgent(response = {
  mainPoints: ['교수님이 중간고사 범위를 설명함', '3장부터 5장까지'],
  keywords: [
    { word: '중간고사', frequency: 3, importance: 0.9, firstMentionedAt: new Date() },
    { word: '범위', frequency: 2, importance: 0.7, firstMentionedAt: new Date() },
  ],
}) {
  return {
    summarizeLecture: jest.fn().mockResolvedValue(response),
    extractKeywords: jest.fn().mockResolvedValue(response.keywords),
  };
}

describe('LapseHarness', () => {
  let harness;
  let mockAI;

  beforeEach(() => {
    jest.useFakeTimers();
    mockAI = createMockAIAgent();
    harness = createLapseHarness({ aiAgent: mockAI, summaryIntervalMs: 180000 });
  });

  afterEach(() => {
    harness.clearAll();
    jest.useRealTimers();
  });

  describe('startCapture', () => {
    test('initializes capture for a session', () => {
      const sessionId = validSessionId();
      harness.startCapture(sessionId);

      expect(harness.getActiveSessionId()).toBe(sessionId);
    });

    test('throws when sessionId is missing', () => {
      expect(() => harness.startCapture('')).toThrow('sessionId is required');
      expect(() => harness.startCapture(null)).toThrow('sessionId is required');
      expect(() => harness.startCapture(undefined)).toThrow('sessionId is required');
    });

    test('stops previous capture when starting new session', () => {
      const session1 = validSessionId();
      const session2 = validSessionId();

      harness.startCapture(session1);
      harness.startCapture(session2);

      expect(harness.getActiveSessionId()).toBe(session2);
    });

    test('starts summary timer with configured interval', async () => {
      const sessionId = validSessionId();
      harness.startCapture(sessionId);

      // Add a chunk so the timer has data to summarize
      harness.addTranscriptChunk({
        sessionId,
        text: '테스트 텍스트',
        startTime: new Date(),
        endTime: new Date(),
        isFinal: true,
        confidence: 0.95,
      });

      // Advance timer by 3 minutes to trigger one interval
      jest.advanceTimersByTime(180000);

      // Allow the async summary callback to resolve
      await Promise.resolve();
      await Promise.resolve();

      expect(mockAI.summarizeLecture).toHaveBeenCalled();
    });
  });

  describe('stopCapture', () => {
    test('stops capture and clears active session', async () => {
      const sessionId = validSessionId();
      harness.startCapture(sessionId);

      await harness.stopCapture();

      expect(harness.getActiveSessionId()).toBeNull();
    });

    test('saves remaining buffer data on stop', async () => {
      const sessionId = validSessionId();
      harness.startCapture(sessionId);

      harness.addTranscriptChunk({
        sessionId,
        text: '남은 버퍼 데이터',
        startTime: new Date(),
        endTime: new Date(),
        isFinal: true,
        confidence: 0.9,
      });

      const summary = await harness.stopCapture();

      expect(summary).not.toBeNull();
      expect(summary.rawText).toBe('남은 버퍼 데이터');
      expect(mockAI.summarizeLecture).toHaveBeenCalledWith('남은 버퍼 데이터', []);
    });

    test('returns null when no active session', async () => {
      const result = await harness.stopCapture();
      expect(result).toBeNull();
    });

    test('returns null when buffer is empty', async () => {
      const sessionId = validSessionId();
      harness.startCapture(sessionId);

      const result = await harness.stopCapture();
      expect(result).toBeNull();
    });
  });

  describe('addTranscriptChunk', () => {
    test('creates and stores a TranscriptChunk', () => {
      const sessionId = validSessionId();
      const now = new Date();

      const chunk = harness.addTranscriptChunk({
        sessionId,
        text: '안녕하세요 오늘 강의를 시작하겠습니다',
        startTime: now,
        endTime: new Date(now.getTime() + 5000),
        isFinal: true,
        confidence: 0.95,
      });

      expect(chunk.chunkId).toBeDefined();
      expect(chunk.sessionId).toBe(sessionId);
      expect(chunk.text).toBe('안녕하세요 오늘 강의를 시작하겠습니다');
      expect(chunk.isFinal).toBe(true);
      expect(chunk.confidence).toBe(0.95);
      expect(chunk.startTime).toBeInstanceOf(Date);
      expect(chunk.endTime).toBeInstanceOf(Date);
    });

    test('accumulates text in buffer in order', () => {
      const sessionId = validSessionId();
      harness.startCapture(sessionId);
      const now = new Date();

      harness.addTranscriptChunk({
        sessionId,
        text: '첫 번째',
        startTime: now,
        endTime: new Date(now.getTime() + 1000),
        isFinal: true,
        confidence: 0.9,
      });

      harness.addTranscriptChunk({
        sessionId,
        text: '두 번째',
        startTime: new Date(now.getTime() + 1000),
        endTime: new Date(now.getTime() + 2000),
        isFinal: true,
        confidence: 0.85,
      });

      harness.addTranscriptChunk({
        sessionId,
        text: '세 번째',
        startTime: new Date(now.getTime() + 2000),
        endTime: new Date(now.getTime() + 3000),
        isFinal: true,
        confidence: 0.92,
      });

      const chunks = harness.getTranscriptChunks(sessionId);
      expect(chunks).toHaveLength(3);
      expect(chunks[0].text).toBe('첫 번째');
      expect(chunks[1].text).toBe('두 번째');
      expect(chunks[2].text).toBe('세 번째');
    });

    test('throws when chunk is missing sessionId', () => {
      expect(() => harness.addTranscriptChunk(null)).toThrow('chunk with sessionId is required');
      expect(() => harness.addTranscriptChunk({})).toThrow('chunk with sessionId is required');
    });

    test('validates chunk data via Zod schema', () => {
      const sessionId = validSessionId();
      expect(() => harness.addTranscriptChunk({
        sessionId,
        text: 'test',
        startTime: new Date(),
        endTime: new Date(),
        isFinal: true,
        confidence: 1.5, // out of range
      })).toThrow();
    });
  });

  describe('getRecentContext', () => {
    test('returns recent text within time window', () => {
      const sessionId = validSessionId();
      harness.startCapture(sessionId);

      const now = new Date();

      // Add chunk within window (30 seconds ago)
      harness.addTranscriptChunk({
        sessionId,
        text: '최근 텍스트',
        startTime: new Date(now.getTime() - 30000),
        endTime: new Date(now.getTime() - 25000),
        isFinal: true,
        confidence: 0.9,
      });

      const context = harness.getRecentContext(60);

      expect(context.recentText).toBe('최근 텍스트');
      expect(context.keywords).toEqual([]);
    });

    test('returns empty context when no active session', () => {
      const context = harness.getRecentContext(60);

      expect(context.recentText).toBe('');
      expect(context.keywords).toEqual([]);
    });

    test('returns empty context when no chunks in time window', () => {
      const sessionId = validSessionId();
      harness.startCapture(sessionId);

      const now = new Date();

      // Add chunk outside window (5 minutes ago)
      harness.addTranscriptChunk({
        sessionId,
        text: '오래된 텍스트',
        startTime: new Date(now.getTime() - 600000),
        endTime: new Date(now.getTime() - 590000),
        isFinal: true,
        confidence: 0.9,
      });

      const context = harness.getRecentContext(60);

      expect(context.recentText).toBe('');
      expect(context.keywords).toEqual([]);
    });

    test('returns keywords from most recent summary', async () => {
      const sessionId = validSessionId();
      harness.startCapture(sessionId);

      const now = new Date();

      // Add chunk and trigger summary
      harness.addTranscriptChunk({
        sessionId,
        text: '중간고사 범위 설명',
        startTime: new Date(now.getTime() - 10000),
        endTime: new Date(now.getTime() - 5000),
        isFinal: true,
        confidence: 0.9,
      });

      await harness.triggerSummaryManually(sessionId);

      // Add another chunk within window
      harness.addTranscriptChunk({
        sessionId,
        text: '새로운 텍스트',
        startTime: new Date(now.getTime() - 3000),
        endTime: now,
        isFinal: true,
        confidence: 0.9,
      });

      const context = harness.getRecentContext(60);

      expect(context.recentText).toContain('새로운 텍스트');
      expect(context.keywords).toContain('중간고사');
      expect(context.keywords).toContain('범위');
    });
  });

  describe('getSummaryHistory', () => {
    test('returns empty array for session with no summaries', () => {
      const sessionId = validSessionId();
      const history = harness.getSummaryHistory(sessionId);
      expect(history).toEqual([]);
    });

    test('returns summaries after manual trigger', async () => {
      const sessionId = validSessionId();
      harness.startCapture(sessionId);

      const now = new Date();
      harness.addTranscriptChunk({
        sessionId,
        text: '강의 내용 텍스트',
        startTime: now,
        endTime: new Date(now.getTime() + 5000),
        isFinal: true,
        confidence: 0.9,
      });

      await harness.triggerSummaryManually(sessionId);

      const history = harness.getSummaryHistory(sessionId);
      expect(history).toHaveLength(1);
      expect(history[0].summaryId).toBeDefined();
      expect(history[0].sessionId).toBe(sessionId);
      expect(history[0].mainPoints).toEqual(['교수님이 중간고사 범위를 설명함', '3장부터 5장까지']);
      expect(history[0].keywords).toHaveLength(2);
      expect(history[0].rawText).toBe('강의 내용 텍스트');
    });

    test('throws when sessionId is missing', () => {
      expect(() => harness.getSummaryHistory('')).toThrow('sessionId is required');
      expect(() => harness.getSummaryHistory(null)).toThrow('sessionId is required');
    });

    test('accumulates multiple summaries', async () => {
      const sessionId = validSessionId();
      harness.startCapture(sessionId);

      const now = new Date();

      // First batch
      harness.addTranscriptChunk({
        sessionId,
        text: '첫 번째 배치',
        startTime: now,
        endTime: new Date(now.getTime() + 5000),
        isFinal: true,
        confidence: 0.9,
      });
      await harness.triggerSummaryManually(sessionId);

      // Second batch
      harness.addTranscriptChunk({
        sessionId,
        text: '두 번째 배치',
        startTime: new Date(now.getTime() + 180000),
        endTime: new Date(now.getTime() + 185000),
        isFinal: true,
        confidence: 0.88,
      });
      await harness.triggerSummaryManually(sessionId);

      const history = harness.getSummaryHistory(sessionId);
      expect(history).toHaveLength(2);
    });
  });

  describe('triggerSummaryManually', () => {
    test('returns null when no active session', async () => {
      const result = await harness.triggerSummaryManually();
      expect(result).toBeNull();
    });

    test('returns null when buffer is empty', async () => {
      const sessionId = validSessionId();
      harness.startCapture(sessionId);

      const result = await harness.triggerSummaryManually(sessionId);
      expect(result).toBeNull();
    });

    test('passes previous keywords to aiAgent', async () => {
      const sessionId = validSessionId();
      harness.startCapture(sessionId);

      const now = new Date();

      // First summary
      harness.addTranscriptChunk({
        sessionId,
        text: '첫 번째 텍스트',
        startTime: now,
        endTime: new Date(now.getTime() + 5000),
        isFinal: true,
        confidence: 0.9,
      });
      await harness.triggerSummaryManually(sessionId);

      // Second summary
      harness.addTranscriptChunk({
        sessionId,
        text: '두 번째 텍스트',
        startTime: new Date(now.getTime() + 180000),
        endTime: new Date(now.getTime() + 185000),
        isFinal: true,
        confidence: 0.9,
      });
      await harness.triggerSummaryManually(sessionId);

      // Second call should include previous keywords
      expect(mockAI.summarizeLecture).toHaveBeenCalledTimes(2);
      expect(mockAI.summarizeLecture).toHaveBeenLastCalledWith(
        '두 번째 텍스트',
        ['중간고사', '범위']
      );
    });

    test('clears buffer after summary', async () => {
      const sessionId = validSessionId();
      harness.startCapture(sessionId);

      harness.addTranscriptChunk({
        sessionId,
        text: '텍스트',
        startTime: new Date(),
        endTime: new Date(),
        isFinal: true,
        confidence: 0.9,
      });

      await harness.triggerSummaryManually(sessionId);

      // Buffer should be empty, so next trigger returns null
      const result = await harness.triggerSummaryManually(sessionId);
      expect(result).toBeNull();
    });

    test('handles string keywords from aiAgent', async () => {
      const stringKeywordAI = {
        summarizeLecture: jest.fn().mockResolvedValue({
          mainPoints: ['포인트 1'],
          keywords: ['키워드1', '키워드2'],
        }),
      };
      const h = createLapseHarness({ aiAgent: stringKeywordAI });
      const sessionId = validSessionId();
      h.startCapture(sessionId);

      h.addTranscriptChunk({
        sessionId,
        text: '텍스트',
        startTime: new Date(),
        endTime: new Date(),
        isFinal: true,
        confidence: 0.9,
      });

      const summary = await h.triggerSummaryManually(sessionId);

      expect(summary.keywords).toHaveLength(2);
      expect(summary.keywords[0].word).toBe('키워드1');
      expect(summary.keywords[1].word).toBe('키워드2');

      h.clearAll();
    });
  });

  describe('clearAll', () => {
    test('clears all stored data and timers', () => {
      const sessionId = validSessionId();
      harness.startCapture(sessionId);

      harness.addTranscriptChunk({
        sessionId,
        text: '텍스트',
        startTime: new Date(),
        endTime: new Date(),
        isFinal: true,
        confidence: 0.9,
      });

      harness.clearAll();

      expect(harness.getActiveSessionId()).toBeNull();
      expect(harness.getTranscriptChunks(sessionId)).toEqual([]);
      expect(harness.getSummaryHistory(sessionId)).toEqual([]);
    });
  });

  describe('works without aiAgent dependency', () => {
    test('generates summary with empty defaults when no aiAgent', async () => {
      const h = createLapseHarness();
      const sessionId = validSessionId();
      h.startCapture(sessionId);

      h.addTranscriptChunk({
        sessionId,
        text: '텍스트 없는 AI',
        startTime: new Date(),
        endTime: new Date(),
        isFinal: true,
        confidence: 0.9,
      });

      const summary = await h.triggerSummaryManually(sessionId);

      expect(summary).not.toBeNull();
      expect(summary.mainPoints).toEqual([]);
      expect(summary.keywords).toEqual([]);
      expect(summary.rawText).toBe('텍스트 없는 AI');

      h.clearAll();
    });
  });
});
