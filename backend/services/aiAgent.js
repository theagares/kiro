/**
 * AIAgent 서비스 팩토리.
 * LLM을 활용하여 설득 메시지 생성 및 강의 내용 요약을 수행한다.
 * llmClient가 제공되지 않으면 규칙 기반/템플릿 기반 폴백 구현을 사용한다.
 *
 * @param {object} [deps] - 의존성 주입
 * @param {object} [deps.llmClient] - LLM 클라이언트 (generateText 메서드 필요)
 * @returns {object} AIAgent 인스턴스
 */
function createAIAgent({ llmClient } = {}) {

  // ─── 한국어 불용어 목록 ───
  const STOP_WORDS = new Set([
    '이', '그', '저', '것', '수', '등', '및', '또', '더', '를', '을',
    '에', '의', '가', '는', '은', '로', '으로', '와', '과', '도',
    '에서', '까지', '부터', '한', '할', '하는', '된', '되는', '있는',
    '없는', '하고', '하며', '대한', '위한', '통해', '대해', '있다',
    '없다', '한다', '된다', '이다', '아닌', '같은', '다른',
  ]);

  // ─── 사이트명 추출 헬퍼 ───
  function extractSiteName(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  // ─── 단어 빈도 분석 ───
  function analyzeWordFrequency(text) {
    if (!text || typeof text !== 'string' || text.trim() === '') {
      return [];
    }

    const words = text
      .replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOP_WORDS.has(w));

    const freq = {};
    for (const word of words) {
      freq[word] = (freq[word] || 0) + 1;
    }

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([word, frequency]) => ({ word, frequency }));
  }

  // ─── 폴백: 설득 메시지 생성 ───
  function fallbackGeneratePersuasion(context, distractionTarget) {
    const siteName = extractSiteName(distractionTarget);
    const keywords = context.keywords || [];
    const recentText = context.recentText || '';

    let message;
    let urgency = 'MEDIUM';

    if (keywords.length > 0) {
      const keywordStr = keywords.slice(0, 3).join(', ');
      message = `지금 강의에서 "${keywordStr}" 관련 내용을 다루고 있어요. ${siteName} 대신 강의에 집중해보세요!`;
      urgency = 'HIGH';
    } else if (recentText.length > 0) {
      const snippet = recentText.length > 50
        ? recentText.substring(0, 50) + '...'
        : recentText;
      message = `강의가 진행 중이에요: "${snippet}" — ${siteName}은(는) 나중에 확인해도 늦지 않아요!`;
      urgency = 'MEDIUM';
    } else {
      message = `${siteName}(으)로 이동하려고 하시네요. 강의에 집중해주세요!`;
      urgency = 'LOW';
    }

    return { message, urgency };
  }

  // ─── 폴백: 강의 요약 ───
  function fallbackSummarizeLecture(text, previousKeywords) {
    if (!text || typeof text !== 'string' || text.trim() === '') {
      return { mainPoints: [], keywords: [] };
    }

    // 문장 분리 후 주요 포인트 추출
    const sentences = text
      .split(/[.!?。]\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 5);

    // 상위 3개 문장을 mainPoints로 사용
    const mainPoints = sentences.slice(0, 3);

    // 키워드 추출
    const wordFreqs = analyzeWordFrequency(text);
    const prevSet = new Set(previousKeywords || []);

    const now = new Date();
    const keywords = wordFreqs.slice(0, 10).map(({ word, frequency }) => {
      // 이전 키워드에 포함된 경우 importance 가중치 부여 (연속성 유지)
      const continuityBoost = prevSet.has(word) ? 0.2 : 0;
      const maxFreq = wordFreqs[0] ? wordFreqs[0].frequency : 1;
      const baseImportance = Math.min(1, frequency / maxFreq);
      const importance = Math.min(1, baseImportance + continuityBoost);

      return {
        word,
        frequency,
        importance: Math.round(importance * 100) / 100,
        firstMentionedAt: now,
      };
    });

    return { mainPoints, keywords };
  }

  // ─── 폴백: 키워드 추출 ───
  function fallbackExtractKeywords(text) {
    if (!text || typeof text !== 'string' || text.trim() === '') {
      return [];
    }

    const wordFreqs = analyzeWordFrequency(text);
    const now = new Date();

    return wordFreqs.slice(0, 10).map(({ word, frequency }) => {
      const maxFreq = wordFreqs[0] ? wordFreqs[0].frequency : 1;
      const importance = Math.min(1, frequency / maxFreq);

      return {
        word,
        frequency,
        importance: Math.round(importance * 100) / 100,
        firstMentionedAt: now,
      };
    });
  }

  // ─── 공개 API ───

  /**
   * 맥락 기반 설득 메시지를 생성한다.
   * @param {object} context - 강의 맥락 { recentText, keywords }
   * @param {string} distractionTarget - 이동 대상 URL
   * @returns {Promise<{message: string, urgency: string}>}
   */
  async function generatePersuasion(context, distractionTarget) {
    if (llmClient && typeof llmClient.generateText === 'function') {
      const prompt = buildPersuasionPrompt(context, distractionTarget);
      const response = await llmClient.generateText(prompt);
      return parsePersuasionResponse(response);
    }

    return fallbackGeneratePersuasion(context, distractionTarget);
  }

  /**
   * 강의 텍스트를 요약하고 키워드를 추출한다.
   * @param {string} text - 강의 텍스트
   * @param {string[]} previousKeywords - 이전 요약의 키워드 목록
   * @returns {Promise<{mainPoints: string[], keywords: Array}>}
   */
  async function summarizeLecture(text, previousKeywords) {
    if (llmClient && typeof llmClient.generateText === 'function') {
      const prompt = buildSummaryPrompt(text, previousKeywords);
      const response = await llmClient.generateText(prompt);
      return parseSummaryResponse(response, previousKeywords);
    }

    return fallbackSummarizeLecture(text, previousKeywords);
  }

  /**
   * 텍스트에서 키워드를 추출한다.
   * @param {string} text - 대상 텍스트
   * @returns {Promise<Array>}
   */
  async function extractKeywords(text) {
    if (llmClient && typeof llmClient.generateText === 'function') {
      const prompt = buildKeywordPrompt(text);
      const response = await llmClient.generateText(prompt);
      return parseKeywordResponse(response);
    }

    return fallbackExtractKeywords(text);
  }

  // ─── LLM 프롬프트 빌더 (llmClient 사용 시) ───

  function buildPersuasionPrompt(context, distractionTarget) {
    const siteName = extractSiteName(distractionTarget);
    return {
      role: 'system',
      content: `당신은 ADHD 학생의 집중을 돕는 AI 보조입니다. 학생이 ${siteName}(으)로 이동하려 합니다.
현재 강의 맥락: ${context.recentText || '없음'}
키워드: ${(context.keywords || []).join(', ') || '없음'}
강의 내용을 기반으로 학생이 강의로 돌아오도록 설득하는 짧은 메시지를 생성하세요.
JSON 형식으로 응답: {"message": "...", "urgency": "LOW|MEDIUM|HIGH"}`,
    };
  }

  function buildSummaryPrompt(text, previousKeywords) {
    return {
      role: 'system',
      content: `다음 강의 텍스트를 요약하세요.
이전 키워드: ${(previousKeywords || []).join(', ') || '없음'}
텍스트: ${text}
이전 키워드와의 연속성을 유지하며 요약하세요.
JSON 형식으로 응답: {"mainPoints": ["..."], "keywords": [{"word": "...", "frequency": N, "importance": 0.0~1.0}]}`,
    };
  }

  function buildKeywordPrompt(text) {
    return {
      role: 'system',
      content: `다음 텍스트에서 핵심 키워드를 추출하세요.
텍스트: ${text}
JSON 형식으로 응답: {"keywords": [{"word": "...", "frequency": N, "importance": 0.0~1.0}]}`,
    };
  }

  // ─── LLM 응답 파서 (llmClient 사용 시) ───

  function parsePersuasionResponse(response) {
    try {
      const parsed = typeof response === 'string' ? JSON.parse(response) : response;
      return {
        message: parsed.message || '강의에 집중해주세요!',
        urgency: ['LOW', 'MEDIUM', 'HIGH'].includes(parsed.urgency) ? parsed.urgency : 'MEDIUM',
      };
    } catch {
      return { message: '강의에 집중해주세요!', urgency: 'MEDIUM' };
    }
  }

  function parseSummaryResponse(response, previousKeywords) {
    try {
      const parsed = typeof response === 'string' ? JSON.parse(response) : response;
      const prevSet = new Set(previousKeywords || []);
      const now = new Date();

      const keywords = (parsed.keywords || []).map(k => ({
        word: k.word,
        frequency: k.frequency || 1,
        importance: Math.min(1, (k.importance || 0.5) + (prevSet.has(k.word) ? 0.1 : 0)),
        firstMentionedAt: now,
      }));

      return {
        mainPoints: parsed.mainPoints || [],
        keywords,
      };
    } catch {
      return { mainPoints: [], keywords: [] };
    }
  }

  function parseKeywordResponse(response) {
    try {
      const parsed = typeof response === 'string' ? JSON.parse(response) : response;
      const now = new Date();
      return (parsed.keywords || []).map(k => ({
        word: k.word,
        frequency: k.frequency || 1,
        importance: k.importance || 0.5,
        firstMentionedAt: now,
      }));
    } catch {
      return [];
    }
  }

  return {
    generatePersuasion,
    summarizeLecture,
    extractKeywords,
  };
}

module.exports = { createAIAgent };
