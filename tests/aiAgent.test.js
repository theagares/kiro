const { createAIAgent } = require('../backend/services/aiAgent');

describe('AIAgent', () => {
  describe('fallback implementation (no llmClient)', () => {
    let agent;

    beforeEach(() => {
      agent = createAIAgent();
    });

    describe('generatePersuasion', () => {
      test('generates message with keywords and HIGH urgency', async () => {
        const context = {
          recentText: '오늘은 중간고사 범위에 대해 설명하겠습니다',
          keywords: ['중간고사', '범위', '3장'],
        };

        const result = await agent.generatePersuasion(context, 'https://www.youtube.com/watch?v=123');

        expect(result.message).toBeDefined();
        expect(result.message.length).toBeGreaterThan(0);
        expect(result.message).toContain('중간고사');
        expect(result.urgency).toBe('HIGH');
      });

      test('generates message with recentText and MEDIUM urgency when no keywords', async () => {
        const context = {
          recentText: '오늘 강의에서는 알고리즘의 시간 복잡도를 다루겠습니다',
          keywords: [],
        };

        const result = await agent.generatePersuasion(context, 'https://twitter.com');

        expect(result.message).toBeDefined();
        expect(result.urgency).toBe('MEDIUM');
      });

      test('generates LOW urgency message when no context available', async () => {
        const context = { recentText: '', keywords: [] };

        const result = await agent.generatePersuasion(context, 'https://www.instagram.com');

        expect(result.message).toBeDefined();
        expect(result.message).toContain('instagram.com');
        expect(result.urgency).toBe('LOW');
      });

      test('extracts site name from URL in message', async () => {
        const context = { recentText: '', keywords: [] };

        const result = await agent.generatePersuasion(context, 'https://www.youtube.com/watch?v=abc');

        expect(result.message).toContain('youtube.com');
      });

      test('handles malformed URL gracefully', async () => {
        const context = { recentText: '', keywords: [] };

        const result = await agent.generatePersuasion(context, 'not-a-url');

        expect(result.message).toBeDefined();
        expect(result.urgency).toBe('LOW');
      });

      test('truncates long recentText in message', async () => {
        const longText = '가'.repeat(100);
        const context = { recentText: longText, keywords: [] };

        const result = await agent.generatePersuasion(context, 'https://youtube.com');

        expect(result.message).toBeDefined();
        expect(result.message).toContain('...');
      });
    });

    describe('summarizeLecture', () => {
      test('extracts main points from text', async () => {
        const text = '오늘은 자료구조를 배웁니다. 배열과 연결 리스트의 차이를 알아봅시다. 시간 복잡도가 중요합니다.';

        const result = await agent.summarizeLecture(text, []);

        expect(result.mainPoints).toBeInstanceOf(Array);
        expect(result.mainPoints.length).toBeGreaterThan(0);
        expect(result.mainPoints.length).toBeLessThanOrEqual(3);
      });

      test('extracts keywords with frequency and importance', async () => {
        const text = '알고리즘 알고리즘 정렬 정렬 정렬 탐색 자료구조';

        const result = await agent.summarizeLecture(text, []);

        expect(result.keywords).toBeInstanceOf(Array);
        expect(result.keywords.length).toBeGreaterThan(0);

        for (const kw of result.keywords) {
          expect(kw.word).toBeDefined();
          expect(kw.frequency).toBeGreaterThanOrEqual(1);
          expect(kw.importance).toBeGreaterThanOrEqual(0);
          expect(kw.importance).toBeLessThanOrEqual(1);
          expect(kw.firstMentionedAt).toBeInstanceOf(Date);
        }
      });

      test('boosts importance for previous keywords (continuity)', async () => {
        const text = '알고리즘 정렬 탐색 알고리즘 정렬';
        const previousKeywords = ['알고리즘'];

        const result = await agent.summarizeLecture(text, previousKeywords);

        const algoKw = result.keywords.find(k => k.word === '알고리즘');
        const sortKw = result.keywords.find(k => k.word === '정렬');

        expect(algoKw).toBeDefined();
        expect(sortKw).toBeDefined();
        // 알고리즘 has same frequency as 정렬 but gets continuity boost
        expect(algoKw.importance).toBeGreaterThanOrEqual(sortKw.importance);
      });

      test('returns empty results for empty text', async () => {
        const result = await agent.summarizeLecture('', []);

        expect(result.mainPoints).toEqual([]);
        expect(result.keywords).toEqual([]);
      });

      test('returns empty results for null text', async () => {
        const result = await agent.summarizeLecture(null, []);

        expect(result.mainPoints).toEqual([]);
        expect(result.keywords).toEqual([]);
      });

      test('limits keywords to max 10', async () => {
        const words = Array.from({ length: 20 }, (_, i) => `단어${i}`);
        const text = words.join(' ');

        const result = await agent.summarizeLecture(text, []);

        expect(result.keywords.length).toBeLessThanOrEqual(10);
      });
    });

    describe('extractKeywords', () => {
      test('extracts keywords with frequency analysis', async () => {
        const text = '머신러닝 딥러닝 머신러닝 신경망 딥러닝 머신러닝';

        const result = await agent.extractKeywords(text);

        expect(result).toBeInstanceOf(Array);
        expect(result.length).toBeGreaterThan(0);

        // 머신러닝 should be first (highest frequency)
        expect(result[0].word).toBe('머신러닝');
        expect(result[0].frequency).toBe(3);
      });

      test('returns keyword objects with required fields', async () => {
        const text = '데이터베이스 인덱스 쿼리 최적화';

        const result = await agent.extractKeywords(text);

        for (const kw of result) {
          expect(kw).toHaveProperty('word');
          expect(kw).toHaveProperty('frequency');
          expect(kw).toHaveProperty('importance');
          expect(kw).toHaveProperty('firstMentionedAt');
          expect(typeof kw.word).toBe('string');
          expect(typeof kw.frequency).toBe('number');
          expect(kw.importance).toBeGreaterThanOrEqual(0);
          expect(kw.importance).toBeLessThanOrEqual(1);
          expect(kw.firstMentionedAt).toBeInstanceOf(Date);
        }
      });

      test('returns empty array for empty text', async () => {
        expect(await agent.extractKeywords('')).toEqual([]);
        expect(await agent.extractKeywords(null)).toEqual([]);
        expect(await agent.extractKeywords(undefined)).toEqual([]);
      });

      test('filters out single-character words', async () => {
        const text = '가 나 다 알고리즘 정렬';

        const result = await agent.extractKeywords(text);

        const singleCharWords = result.filter(k => k.word.length <= 1);
        expect(singleCharWords).toHaveLength(0);
      });

      test('limits to max 10 keywords', async () => {
        const words = Array.from({ length: 20 }, (_, i) => `키워드${i}`);
        const text = words.join(' ');

        const result = await agent.extractKeywords(text);

        expect(result.length).toBeLessThanOrEqual(10);
      });
    });
  });

  describe('with custom llmClient', () => {
    test('delegates generatePersuasion to llmClient', async () => {
      const mockLLM = {
        generateText: jest.fn().mockResolvedValue(
          JSON.stringify({ message: 'LLM 생성 메시지', urgency: 'HIGH' })
        ),
      };
      const agent = createAIAgent({ llmClient: mockLLM });

      const result = await agent.generatePersuasion(
        { recentText: '강의 내용', keywords: ['키워드'] },
        'https://youtube.com'
      );

      expect(mockLLM.generateText).toHaveBeenCalledTimes(1);
      expect(result.message).toBe('LLM 생성 메시지');
      expect(result.urgency).toBe('HIGH');
    });

    test('delegates summarizeLecture to llmClient', async () => {
      const mockLLM = {
        generateText: jest.fn().mockResolvedValue(
          JSON.stringify({
            mainPoints: ['LLM 요약 포인트'],
            keywords: [{ word: 'LLM키워드', frequency: 2, importance: 0.8 }],
          })
        ),
      };
      const agent = createAIAgent({ llmClient: mockLLM });

      const result = await agent.summarizeLecture('강의 텍스트', ['이전키워드']);

      expect(mockLLM.generateText).toHaveBeenCalledTimes(1);
      expect(result.mainPoints).toEqual(['LLM 요약 포인트']);
      expect(result.keywords[0].word).toBe('LLM키워드');
    });

    test('delegates extractKeywords to llmClient', async () => {
      const mockLLM = {
        generateText: jest.fn().mockResolvedValue(
          JSON.stringify({
            keywords: [{ word: '추출키워드', frequency: 3, importance: 0.9 }],
          })
        ),
      };
      const agent = createAIAgent({ llmClient: mockLLM });

      const result = await agent.extractKeywords('텍스트');

      expect(mockLLM.generateText).toHaveBeenCalledTimes(1);
      expect(result[0].word).toBe('추출키워드');
    });

    test('handles malformed LLM response for generatePersuasion', async () => {
      const mockLLM = {
        generateText: jest.fn().mockResolvedValue('not json'),
      };
      const agent = createAIAgent({ llmClient: mockLLM });

      const result = await agent.generatePersuasion(
        { recentText: '', keywords: [] },
        'https://youtube.com'
      );

      expect(result.message).toBe('강의에 집중해주세요!');
      expect(result.urgency).toBe('MEDIUM');
    });

    test('handles malformed LLM response for summarizeLecture', async () => {
      const mockLLM = {
        generateText: jest.fn().mockResolvedValue('invalid'),
      };
      const agent = createAIAgent({ llmClient: mockLLM });

      const result = await agent.summarizeLecture('텍스트', []);

      expect(result.mainPoints).toEqual([]);
      expect(result.keywords).toEqual([]);
    });

    test('handles malformed LLM response for extractKeywords', async () => {
      const mockLLM = {
        generateText: jest.fn().mockResolvedValue('bad response'),
      };
      const agent = createAIAgent({ llmClient: mockLLM });

      const result = await agent.extractKeywords('텍스트');

      expect(result).toEqual([]);
    });

    test('handles LLM returning object directly (not string)', async () => {
      const mockLLM = {
        generateText: jest.fn().mockResolvedValue({
          message: '직접 객체 응답',
          urgency: 'LOW',
        }),
      };
      const agent = createAIAgent({ llmClient: mockLLM });

      const result = await agent.generatePersuasion(
        { recentText: '', keywords: [] },
        'https://youtube.com'
      );

      expect(result.message).toBe('직접 객체 응답');
      expect(result.urgency).toBe('LOW');
    });

    test('applies continuity boost for previous keywords in LLM summary', async () => {
      const mockLLM = {
        generateText: jest.fn().mockResolvedValue(
          JSON.stringify({
            mainPoints: ['포인트'],
            keywords: [
              { word: '이전키워드', frequency: 2, importance: 0.5 },
              { word: '새키워드', frequency: 2, importance: 0.5 },
            ],
          })
        ),
      };
      const agent = createAIAgent({ llmClient: mockLLM });

      const result = await agent.summarizeLecture('텍스트', ['이전키워드']);

      const prevKw = result.keywords.find(k => k.word === '이전키워드');
      const newKw = result.keywords.find(k => k.word === '새키워드');

      // 이전키워드 gets +0.1 continuity boost
      expect(prevKw.importance).toBeGreaterThan(newKw.importance);
    });
  });
});
