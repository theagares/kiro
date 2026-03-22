const {
  isNonStudySite,
  addToAllowList,
  addToBlockList,
  resetLists,
} = require('../backend/services/siteClassifier');

beforeEach(() => {
  resetLists();
});

describe('SiteClassifier', () => {
  describe('isNonStudySite — 기본 비학습 사이트 판별', () => {
    test('기본 차단 목록의 사이트를 비학습으로 판별한다', () => {
      expect(isNonStudySite('https://www.youtube.com/watch?v=abc')).toBe(true);
      expect(isNonStudySite('https://facebook.com')).toBe(true);
      expect(isNonStudySite('https://www.instagram.com/explore')).toBe(true);
      expect(isNonStudySite('https://twitter.com/home')).toBe(true);
      expect(isNonStudySite('https://www.reddit.com/r/all')).toBe(true);
      expect(isNonStudySite('https://www.twitch.tv/streams')).toBe(true);
      expect(isNonStudySite('https://www.tiktok.com')).toBe(true);
    });

    test('학습 관련 사이트를 비학습으로 판별하지 않는다', () => {
      expect(isNonStudySite('https://scholar.google.com')).toBe(false);
      expect(isNonStudySite('https://stackoverflow.com')).toBe(false);
      expect(isNonStudySite('https://en.wikipedia.org')).toBe(false);
      expect(isNonStudySite('https://github.com')).toBe(false);
    });

    test('서브도메인도 매칭한다', () => {
      expect(isNonStudySite('https://m.youtube.com/watch')).toBe(true);
      expect(isNonStudySite('https://mobile.twitter.com')).toBe(true);
    });

    test('잘못된 입력에 대해 false를 반환한다', () => {
      expect(isNonStudySite(null)).toBe(false);
      expect(isNonStudySite(undefined)).toBe(false);
      expect(isNonStudySite('')).toBe(false);
      expect(isNonStudySite(123)).toBe(false);
    });
  });

  describe('addToBlockList — 차단 목록 추가', () => {
    test('새 사이트를 차단 목록에 추가하면 비학습으로 판별된다', () => {
      expect(isNonStudySite('https://example-game.com')).toBe(false);
      addToBlockList('example-game.com');
      expect(isNonStudySite('https://example-game.com')).toBe(true);
    });

    test('서브도메인도 차단된다', () => {
      addToBlockList('newsite.com');
      expect(isNonStudySite('https://www.newsite.com/page')).toBe(true);
      expect(isNonStudySite('https://sub.newsite.com')).toBe(true);
    });

    test('빈 패턴은 거부한다', () => {
      expect(() => addToBlockList('')).toThrow('pattern is required');
      expect(() => addToBlockList(null)).toThrow('pattern is required');
      expect(() => addToBlockList('   ')).toThrow('pattern is required');
    });
  });

  describe('addToAllowList — 허용 목록 추가', () => {
    test('허용 목록에 추가하면 비학습에서 제외된다', () => {
      expect(isNonStudySite('https://youtube.com')).toBe(true);
      addToAllowList('youtube.com');
      expect(isNonStudySite('https://youtube.com')).toBe(false);
    });

    test('서브도메인도 허용된다', () => {
      addToAllowList('youtube.com');
      expect(isNonStudySite('https://www.youtube.com/watch')).toBe(false);
      expect(isNonStudySite('https://m.youtube.com')).toBe(false);
    });

    test('빈 패턴은 거부한다', () => {
      expect(() => addToAllowList('')).toThrow('pattern is required');
      expect(() => addToAllowList(null)).toThrow('pattern is required');
      expect(() => addToAllowList('   ')).toThrow('pattern is required');
    });
  });

  describe('허용 목록 우선 적용', () => {
    test('허용 목록과 차단 목록 모두에 존재 시 허용 목록이 우선한다', () => {
      // youtube.com은 기본 차단 목록에 있음
      expect(isNonStudySite('https://youtube.com')).toBe(true);

      // 허용 목록에도 추가
      addToAllowList('youtube.com');
      expect(isNonStudySite('https://youtube.com')).toBe(false);
    });

    test('사용자가 추가한 차단+허용 패턴에서도 허용 우선', () => {
      addToBlockList('custom-site.com');
      addToAllowList('custom-site.com');
      expect(isNonStudySite('https://custom-site.com')).toBe(false);
    });
  });

  describe('resetLists — 목록 초기화', () => {
    test('초기화 후 기본 차단 목록만 남는다', () => {
      addToAllowList('youtube.com');
      addToBlockList('custom.com');
      resetLists();

      expect(isNonStudySite('https://youtube.com')).toBe(true);
      expect(isNonStudySite('https://custom.com')).toBe(false);
    });
  });
});
