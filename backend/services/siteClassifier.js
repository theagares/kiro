// 기본 비학습 사이트 URL 패턴 목록
const DEFAULT_NON_STUDY_PATTERNS = [
  'youtube.com',
  'youtu.be',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'reddit.com',
  'twitch.tv',
  'netflix.com',
  'discord.com',
  'snapchat.com',
  'pinterest.com',
  'steam.com',
  'steampowered.com',
  'roblox.com',
  'epicgames.com',
  'namu.wiki',
  'dcinside.com',
  'fmkorea.com',
];

// 차단 목록 (기본 패턴 + 사용자 추가)
const blockList = new Set(DEFAULT_NON_STUDY_PATTERNS);

// 허용 목록 (사용자 추가)
const allowList = new Set();

/**
 * URL 문자열에서 호스트명을 추출한다.
 * @param {string} url
 * @returns {string} 소문자 호스트명 또는 원본 문자열
 */
function extractHostname(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    // URL 파싱 실패 시 소문자로 변환하여 그대로 사용
    return url.toLowerCase();
  }
}

/**
 * 주어진 패턴이 호스트명에 매칭되는지 확인한다.
 * @param {string} hostname
 * @param {string} pattern
 * @returns {boolean}
 */
function matchesPattern(hostname, pattern) {
  const lowerPattern = pattern.toLowerCase();
  return hostname === lowerPattern || hostname.endsWith('.' + lowerPattern);
}

/**
 * URL이 비학습 사이트인지 판별한다.
 * 허용 목록과 차단 목록 모두에 존재 시 허용 목록 우선 적용.
 * @param {string} url
 * @returns {boolean} 비학습 사이트이면 true
 */
function isNonStudySite(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const hostname = extractHostname(url);

  // 허용 목록 우선 확인
  for (const pattern of allowList) {
    if (matchesPattern(hostname, pattern)) {
      return false;
    }
  }

  // 차단 목록 확인
  for (const pattern of blockList) {
    if (matchesPattern(hostname, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * 허용 목록에 사이트 패턴을 추가한다.
 * @param {string} pattern - URL 패턴 (예: 'youtube.com')
 */
function addToAllowList(pattern) {
  if (!pattern || typeof pattern !== 'string' || pattern.trim() === '') {
    throw new Error('pattern is required and must be a non-empty string');
  }
  allowList.add(pattern.toLowerCase().trim());
}

/**
 * 차단 목록에 사이트 패턴을 추가한다.
 * @param {string} pattern - URL 패턴 (예: 'example-game.com')
 */
function addToBlockList(pattern) {
  if (!pattern || typeof pattern !== 'string' || pattern.trim() === '') {
    throw new Error('pattern is required and must be a non-empty string');
  }
  blockList.add(pattern.toLowerCase().trim());
}

/**
 * 테스트용: 허용/차단 목록을 초기 상태로 리셋한다.
 */
function resetLists() {
  blockList.clear();
  DEFAULT_NON_STUDY_PATTERNS.forEach((p) => blockList.add(p));
  allowList.clear();
}

module.exports = {
  isNonStudySite,
  addToAllowList,
  addToBlockList,
  resetLists,
};
