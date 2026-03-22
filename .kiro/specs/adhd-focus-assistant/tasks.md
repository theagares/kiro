# Implementation Plan: ADHD 집중 보조 AI (adhd-focus-assistant)

## Overview

JavaScript/Node.js 기반으로 ADHD 대학생의 인지 이탈 방지 및 실시간 학습 보조 AI 웹 애플리케이션을 구현한다. 백엔드는 Express.js, 데이터 유효성 검증은 Zod, 테스트는 Jest + fast-check를 사용한다. 클라이언트는 바닐라 JavaScript 브라우저 확장으로 구현한다.

## Tasks

- [x] 1. 프로젝트 구조 설정 및 핵심 데이터 모델 정의
  - [x] 1.1 프로젝트 초기화 및 디렉토리 구조 생성
    - `npm init`으로 프로젝트 초기화
    - Express.js, Zod, uuid, cors 등 핵심 의존성 설치
    - Jest, fast-check, supertest 등 개발 의존성 설치
    - `backend/`, `client/`, `tests/` 디렉토리 구조 생성
    - jest.config.js 설정
    - _Requirements: 전체_

  - [x] 1.2 Zod 스키마 기반 데이터 모델 정의
    - `backend/models/` 디렉토리에 Zod 스키마 파일 생성
    - LectureSession 스키마: sessionId(UUID), userId(UUID), title(String), startTime, endTime(nullable), status(ACTIVE/PAUSED/COMPLETED)
    - TranscriptChunk 스키마: chunkId, sessionId, text, startTime, endTime, isFinal(boolean), confidence(0.0~1.0)
    - Summary 스키마: summaryId, sessionId, periodStart, periodEnd, mainPoints(string[]), keywords(Keyword[]), rawText
    - Keyword 스키마: word, frequency(integer), importance(0.0~1.0), firstMentionedAt
    - DistractionEvent 스키마: eventId, sessionId, targetUrl, siteName, departureTime, returnTime(nullable), persuasionMessage, durationSeconds(>=0)
    - DistractionStats 스키마: sessionId, totalDistractions, totalDistractedSeconds, averageDistractionSeconds, topDistractingSites, focusRate(0.0~1.0)
    - PersuasionMessage 스키마: message, urgency(LOW/MEDIUM/HIGH), lectureContext, generatedAt
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 1.3 데이터 모델 유효성 검증 속성 테스트 작성
    - **Property 15: 수치 필드 범위 유효성** — confidence, focusRate, importance에 대해 0.0~1.0 범위 밖 값, durationSeconds에 대해 음수 값으로 생성 시 Zod 파싱이 실패하는지 fast-check로 검증
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4**

  - [ ]* 1.4 데이터 모델 단위 테스트 작성
    - 각 Zod 스키마의 유효한 입력 파싱 성공 테스트
    - 각 Zod 스키마의 잘못된 입력 파싱 실패 테스트
    - _Requirements: 11.1, 11.2, 11.3, 11.4_


- [x] 2. 강의 세션 관리 구현
  - [x] 2.1 세션 관리자(SessionManager) 모듈 구현
    - `backend/services/sessionManager.js` 생성
    - createSession(userId, title): 고유 sessionId 생성, ACTIVE 상태로 LectureSession 생성, 인메모리 저장소에 저장
    - endSession(sessionId): 상태를 COMPLETED로 변경, endTime 기록
    - getSession(sessionId): 세션 조회
    - userId 또는 title 누락 시 유효성 오류 반환
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 2.2 세션 생명주기 속성 테스트 작성
    - **Property 1: 세션 생명주기 일관성** — 유효한 userId와 title로 생성된 세션은 ACTIVE 상태이고 고유 sessionId를 가지며, 종료 후 COMPLETED 상태이고 endTime >= startTime인지 fast-check로 검증
    - **Validates: Requirements 1.1, 1.2**

  - [ ]* 2.3 세션 생성 유효성 속성 테스트 작성
    - **Property 2: 세션 생성 유효성 검증** — userId 또는 title이 null/빈 문자열인 입력에 대해 세션 생성이 거부되는지 fast-check로 검증
    - **Validates: Requirement 1.4**

  - [x] 2.4 세션 관리 REST API 엔드포인트 구현
    - `backend/routes/sessions.js` 생성
    - POST /api/sessions — 세션 생성
    - PATCH /api/sessions/:sessionId/end — 세션 종료
    - GET /api/sessions/:sessionId — 세션 조회
    - Zod 스키마를 활용한 요청 유효성 검증 미들웨어
    - _Requirements: 1.1, 1.2, 1.4_

  - [ ]* 2.5 세션 참조 유효성 속성 테스트 작성
    - **Property 16: 세션 참조 유효성** — 존재하지 않거나 비활성인 sessionId로 작업 시도 시 거부되는지 fast-check로 검증
    - **Validates: Requirement 11.5**

- [x] 3. Checkpoint — 세션 관리 검증
  - Ensure all tests pass, ask the user if questions arise.


- [x] 4. 탭 모니터링 및 비학습 사이트 분류 구현
  - [x] 4.1 TabMonitor 클라이언트 모듈 구현
    - `client/tabMonitor.js` 생성
    - visibilitychange 및 focus/blur 이벤트 리스너 등록
    - 탭 전환 시 targetUrl과 timestamp를 포함한 이벤트 발생
    - 탭 복귀 시 returnTimestamp를 포함한 이벤트 발생
    - _Requirements: 2.1, 2.3, 2.4_

  - [ ]* 4.2 탭 이벤트 필드 완전성 속성 테스트 작성
    - **Property 3: 탭 이벤트 필드 완전성** — 탭 전환/복귀 이벤트가 대상 URL(전환 시)과 타임스탬프를 포함하는지 fast-check로 검증
    - **Validates: Requirements 2.1, 2.3**

  - [x] 4.3 SiteClassifier 모듈 구현
    - `backend/services/siteClassifier.js` 생성
    - 기본 비학습 사이트 목록 (유튜브, SNS, 게임 등) URL 패턴 정의
    - isNonStudySite(url): URL 패턴 매칭으로 비학습 여부 판별
    - addToAllowList(pattern): 허용 목록에 사이트 추가
    - addToBlockList(pattern): 차단 목록에 사이트 추가
    - 허용 목록과 차단 목록 모두에 존재 시 허용 목록 우선 적용
    - _Requirements: 2.2, 3.1, 3.2, 3.3, 3.4_

  - [ ]* 4.4 비학습 사이트 분류 일관성 속성 테스트 작성
    - **Property 4: 비학습 사이트 분류 일관성** — 허용 목록 URL은 비학습 아님, 차단 목록 URL은 비학습, 양쪽 모두 포함 시 허용 우선인지 fast-check로 검증
    - **Validates: Requirements 2.2, 3.1, 3.2, 3.3, 3.4**

  - [x] 4.5 사이트 분류 REST API 엔드포인트 구현
    - `backend/routes/sites.js` 생성
    - POST /api/sites/allow — 허용 목록에 사이트 추가
    - POST /api/sites/block — 차단 목록에 사이트 추가
    - POST /api/sites/classify — URL 비학습 여부 판별
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 5. Focus-Harness 서비스 구현
  - [x] 5.1 FocusHarness 서비스 모듈 구현
    - `backend/services/focusHarness.js` 생성
    - handleTabSwitch(event): 비학습 사이트 판별 → LapseHarness에서 맥락 조회 → AIAgent에 설득 메시지 생성 요청
    - handleTabReturn(event): 이탈 시간 계산 및 DistractionEvent 기록
    - getDistractionStats(sessionId): 이탈 통계 계산 및 반환
    - _Requirements: 4.1, 4.2, 4.3, 5.2, 5.3_

  - [ ]* 5.2 이탈 시 맥락 조회 및 설득 메시지 흐름 속성 테스트 작성
    - **Property 5: 이탈 시 맥락 조회 및 설득 메시지 흐름** — 비학습 사이트 탭 전환 시 LapseHarness 맥락 조회 및 AIAgent 설득 메시지 생성 요청이 수행되는지 fast-check로 검증
    - **Validates: Requirements 4.1, 4.2**

  - [ ]* 5.3 PersuasionMessage 필드 완전성 속성 테스트 작성
    - **Property 6: PersuasionMessage 필드 완전성** — 생성된 PersuasionMessage가 message, urgency, lectureContext, generatedAt 필드를 모두 포함하는지 fast-check로 검증
    - **Validates: Requirement 4.3**

  - [ ]* 5.4 DistractionEvent 기록 완전성 속성 테스트 작성
    - **Property 7: DistractionEvent 기록 완전성** — 이탈-복귀 쌍에 대해 모든 필드가 기록되고 durationSeconds가 시각 차이와 일치하는지 fast-check로 검증
    - **Validates: Requirements 5.2, 5.3**

  - [x] 5.5 Focus-Harness REST API 엔드포인트 구현
    - `backend/routes/focus.js` 생성
    - POST /api/focus/tab-switch — 탭 전환 이벤트 처리
    - POST /api/focus/tab-return — 탭 복귀 이벤트 처리
    - GET /api/focus/stats/:sessionId — 이탈 통계 조회
    - _Requirements: 4.1, 4.2, 4.3, 5.2, 5.3, 10.1, 10.2, 10.3_

- [x] 6. Checkpoint — Focus-Harness 검증
  - Ensure all tests pass, ask the user if questions arise.


- [x] 7. Lapse-Harness 서비스 구현
  - [x] 7.1 LapseHarness 서비스 모듈 구현
    - `backend/services/lapseHarness.js` 생성
    - startCapture(sessionId): 텍스트 버퍼 초기화, 요약 타이머 시작 (기본 3분 주기)
    - stopCapture(): 음성 인식 중단, 남은 버퍼 데이터 저장
    - addTranscriptChunk(chunk): TranscriptChunk 생성 및 버퍼 누적
    - getRecentContext(windowSeconds): 시간 범위 내 최근 텍스트와 키워드 반환
    - getSummaryHistory(sessionId): 요약 이력 조회
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 8.1, 8.2_

  - [ ]* 7.2 TranscriptChunk 생성 완전성 속성 테스트 작성
    - **Property 8: TranscriptChunk 생성 완전성** — 생성된 TranscriptChunk가 text, startTime, endTime, isFinal, confidence를 모두 포함하는지 fast-check로 검증
    - **Validates: Requirement 6.2**

  - [ ]* 7.3 텍스트 버퍼 누적 정확성 속성 테스트 작성
    - **Property 9: 텍스트 버퍼 누적 정확성** — 순서대로 수신된 텍스트 청크가 수신 순서대로 버퍼에 누적되는지 fast-check로 검증
    - **Validates: Requirements 6.3, 6.4**

  - [ ]* 7.4 시간 범위 기반 맥락 필터링 속성 테스트 작성
    - **Property 11: 시간 범위 기반 맥락 필터링** — getRecentContext가 지정된 시간 범위 내 데이터만 반환하고, 범위 내 데이터 없으면 빈 맥락 반환하는지 fast-check로 검증
    - **Validates: Requirements 8.1, 8.2**

  - [x] 7.5 Lapse-Harness REST API 엔드포인트 구현
    - `backend/routes/lapse.js` 생성
    - POST /api/lapse/start/:sessionId — 캡처 시작
    - POST /api/lapse/stop/:sessionId — 캡처 중단
    - POST /api/lapse/transcript — 텍스트 청크 수신
    - GET /api/lapse/context/:sessionId — 강의 맥락 조회 (windowSeconds 쿼리 파라미터)
    - GET /api/lapse/summaries/:sessionId — 요약 이력 조회
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 8.1, 8.2_

- [x] 8. AI 에이전트 구현
  - [x] 8.1 AIAgent 서비스 모듈 구현
    - `backend/services/aiAgent.js` 생성
    - generatePersuasion(context, distractionTarget): LLM API 호출로 맥락 기반 설득 메시지 생성
    - summarizeLecture(text, previousKeywords): LLM API 호출로 강의 요약 및 키워드 추출
    - extractKeywords(text): 텍스트에서 키워드 추출
    - 이전 키워드 참조로 요약 간 연속성 유지
    - _Requirements: 4.2, 4.4, 7.1, 7.2, 7.4_

  - [ ]* 8.2 Summary 생성 완전성 속성 테스트 작성
    - **Property 10: Summary 생성 완전성** — AIAgent 요약 응답으로 생성된 Summary가 mainPoints와 keywords를 포함하고, 저장 후 동일 데이터가 조회되는지 fast-check로 검증
    - **Validates: Requirements 7.2, 7.3**

- [x] 9. Checkpoint — Lapse-Harness 및 AI 에이전트 검증
  - Ensure all tests pass, ask the user if questions arise.


- [x] 10. 이탈 통계 추적 구현
  - [x] 10.1 DistractionStats 계산 로직 구현
    - `backend/services/distractionTracker.js` 생성
    - calculateStats(sessionId): DistractionEvent 목록으로부터 totalDistractions, totalDistractedSeconds, averageDistractionSeconds, topDistractingSites, focusRate 계산
    - focusRate = 1.0 - (totalDistractedSeconds / totalSessionSeconds), 0.0~1.0 범위로 클램핑
    - 새 DistractionEvent 기록 시 즉시 통계 갱신
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ]* 10.2 이탈 통계 계산 정확성 속성 테스트 작성
    - **Property 14: 이탈 통계 계산 정확성** — totalDistractions가 이벤트 수와 일치, totalDistractedSeconds가 durationSeconds 합과 일치, focusRate가 0.0~1.0 범위인지 fast-check로 검증
    - **Validates: Requirements 10.1, 10.2, 10.3**

- [x] 11. 클라이언트 UI 구현
  - [x] 11.1 Web Speech API 클라이언트 모듈 구현
    - `client/speechCapture.js` 생성
    - SpeechRecognition API 초기화 및 마이크 입력 캡처
    - onresult 이벤트에서 TranscriptChunk 데이터 생성 후 백엔드 전송
    - 세션 시작/종료 시 음성 인식 시작/중단
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 11.2 알림 UI 컴포넌트 구현
    - `client/notification.js` 생성
    - showNotification(persuasionMessage): 설득 메시지를 오버레이 알림으로 표시
    - urgency 수준에 따른 시각적 차별화 (LOW/MEDIUM/HIGH)
    - _Requirements: 5.1_

  - [x] 11.3 실시간 대시보드 UI 구현
    - `client/dashboard.js` 및 `client/dashboard.html` 생성
    - 타임라인 형태의 요약 카드 렌더링
    - 실시간 텍스트 스트림 표시 영역
    - 이탈 통계 시각화 (총 이탈 횟수, 총 이탈 시간, 평균 이탈 시간, 집중률)
    - 키워드 하이라이트 및 검색 기능
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 11.4 대시보드 상태 반영 속성 테스트 작성
    - **Property 12: 대시보드 상태 반영** — 새 Summary 생성 시 타임라인에 요약 카드가 추가되는지 검증
    - **Validates: Requirements 9.1, 9.2**

  - [ ]* 11.5 키워드 검색 정확성 속성 테스트 작성
    - **Property 13: 키워드 검색 정확성** — 키워드 검색 결과가 해당 키워드를 포함하는 요약만 반환하는지 fast-check로 검증
    - **Validates: Requirement 9.4**

- [x] 12. Checkpoint — 클라이언트 UI 검증
  - Ensure all tests pass, ask the user if questions arise.


- [x] 13. Express.js 서버 통합 및 전체 연결
  - [x] 13.1 Express.js 앱 엔트리포인트 및 라우터 통합
    - `backend/app.js` 생성
    - Express 앱 초기화, CORS 미들웨어, JSON 파싱 설정
    - 모든 라우터 등록 (sessions, sites, focus, lapse)
    - 에러 핸들링 미들웨어 구현
    - _Requirements: 전체_

  - [x] 13.2 컴포넌트 간 연동 구현
    - FocusHarness → LapseHarness 맥락 조회 연동
    - FocusHarness → AIAgent 설득 메시지 생성 연동
    - LapseHarness → AIAgent 요약 생성 연동
    - LapseHarness → SessionManager 데이터 저장 연동
    - 클라이언트 TabMonitor → 백엔드 Focus-Harness API 연동
    - 클라이언트 SpeechCapture → 백엔드 Lapse-Harness API 연동
    - _Requirements: 4.1, 4.2, 7.1, 7.3_

  - [ ]* 13.3 통합 테스트 작성
    - 세션 생성 → 탭 이탈 → 설득 메시지 생성 → 탭 복귀 → 이탈 통계 확인 E2E 흐름 테스트
    - 세션 생성 → 텍스트 청크 수신 → 요약 생성 → 대시보드 업데이트 E2E 흐름 테스트
    - supertest를 활용한 API 통합 테스트
    - _Requirements: 4.1, 4.2, 5.2, 5.3, 7.1, 7.2, 7.3_

- [x] 14. Final Checkpoint — 전체 테스트 통과 확인
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- `*` 표시된 태스크는 선택 사항이며 빠른 MVP를 위해 건너뛸 수 있음
- 각 태스크는 추적 가능성을 위해 특정 요구사항을 참조함
- 체크포인트는 점진적 검증을 보장함
- 속성 테스트(fast-check)는 보편적 정확성 속성을 검증함
- 단위 테스트(Jest)는 특정 예시와 엣지 케이스를 검증함
- 백엔드: Express.js + Zod | 테스트: Jest + fast-check + supertest | 클라이언트: 바닐라 JavaScript
