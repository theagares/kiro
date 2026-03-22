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

  // ─── 중요도 신호어 (이 표현 뒤에 오는 단어/개념은 중요도 가중치 부여) ───
  const IMPORTANCE_SIGNALS = [
    '시험에', '시험', '중요', '핵심', '반드시', '꼭', '필수', '주의',
    '기억', '외워', '암기', '출제', '자주', '강조', '포인트', '요점',
    '정리', '결론', '핵심은', '중요한', '중요한건', '중요한것은',
    '시험문제', '시험범위', '출제예정', '출제될', '나온다', '나와요',
    '나옵니다', '중점', '집중', '특히', '반드시 알아야',
  ];

  // ─── 중요도 신호어 주변 문장/단어 추출 ───
  function extractImportantSegments(text) {
    // 문장 단위로 분리
    const sentences = text.split(/[.!?。\n]\s*/).map(s => s.trim()).filter(s => s.length > 2);
    const importantSentences = [];

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      const hasSignal = IMPORTANCE_SIGNALS.some(signal => lower.includes(signal));
      if (hasSignal) {
        importantSentences.push(sentence);
      }
    }

    return importantSentences;
  }

  // ─── 중요 문장에서 핵심 단어 추출 (가중치 포함) ───
  function extractWeightedKeywords(text) {
    const importantSegments = extractImportantSegments(text);
    const wordFreqs = analyzeWordFrequency(text);
    const importantText = importantSegments.join(' ');
    const importantWordFreqs = importantText.length > 0 ? analyzeWordFrequency(importantText) : [];

    // 중요 문장에 등장한 단어 집합
    const importantWordSet = new Set(importantWordFreqs.map(w => w.word));

    const now = new Date();
    const maxFreq = wordFreqs[0] ? wordFreqs[0].frequency : 1;

    return wordFreqs.slice(0, 20).map(({ word, frequency }) => {
      const baseImportance = Math.min(1, frequency / maxFreq);
      // 중요 문장에 등장한 단어면 가중치 +0.4
      const signalBoost = importantWordSet.has(word) ? 0.4 : 0;
      const importance = Math.min(1, baseImportance + signalBoost);
      return { word, frequency, importance: Math.round(importance * 100) / 100, firstMentionedAt: now };
    })
    // importance 기준으로 재정렬
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 10);
  }

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

    // 중요 신호어가 포함된 문장을 mainPoints 우선으로 사용
    const importantSentences = extractImportantSegments(text);
    const allSentences = text
      .split(/[.!?。]\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 5);

    // 중요 문장 우선, 부족하면 일반 문장으로 채움
    const mainPointCandidates = [
      ...importantSentences,
      ...allSentences.filter(s => !importantSentences.includes(s)),
    ];
    const mainPoints = mainPointCandidates.slice(0, 3);

    // 중요도 가중치 적용 키워드 추출
    const prevSet = new Set(previousKeywords || []);
    const keywords = extractWeightedKeywords(text).map(k => ({
      ...k,
      importance: Math.min(1, k.importance + (prevSet.has(k.word) ? 0.1 : 0)),
    }));

    return { mainPoints, keywords };
  }

  // ─── 폴백: 키워드 추출 ───
  function fallbackExtractKeywords(text) {
    if (!text || typeof text !== 'string' || text.trim() === '') {
      return [];
    }
    return extractWeightedKeywords(text);
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

규칙:
- "시험에 나온다", "중요하다", "핵심", "반드시", "꼭 외워" 등 강조 표현이 포함된 문장을 mainPoints 최우선으로 선택하세요.
- keywords는 강조 표현 주변에 등장한 개념어를 importance 높게 설정하세요.
- 단순 빈도가 높아도 강조 표현 없이 등장한 단어는 importance를 낮게 설정하세요.
- 이전 키워드와의 연속성을 유지하세요.
JSON 형식으로 응답: {"mainPoints": ["..."], "keywords": [{"word": "...", "frequency": N, "importance": 0.0~1.0}]}`,
    };
  }

  function buildKeywordPrompt(text) {
    return {
      role: 'system',
      content: `다음 텍스트에서 핵심 키워드를 추출하세요.
텍스트: ${text}

규칙:
- "시험에 나온다", "중요하다", "핵심", "반드시", "꼭 외워" 등 강조 표현 주변의 개념어를 importance 1.0에 가깝게 설정하세요.
- 강조 표현 없이 단순히 자주 등장한 단어는 importance를 낮게 설정하세요.
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
