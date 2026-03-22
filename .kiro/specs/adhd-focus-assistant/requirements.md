# 요구사항 문서

## 소개

ADHD 대학생의 인지 이탈을 방지하고 실시간 학습을 보조하는 AI 웹 애플리케이션의 요구사항을 정의한다. 본 시스템은 Focus-Harness(행동 제어)와 Lapse-Harness(정보 보조) 두 핵심 모듈로 구성되며, 브라우저 확장 클라이언트, 백엔드 서버, 데이터 저장소의 3계층 아키텍처를 따른다.

## 용어집

- **TabMonitor**: 브라우저 탭 전환을 감지하고 비학습 사이트 이동 여부를 판별하는 클라이언트 모듈
- **FocusHarness**: 탭 이탈 시 AI 기반 맥락 설득 메시지를 생성하여 학생을 강의로 복귀시키는 서비스
- **LapseHarness**: 실시간 음성 인식 텍스트를 수집하고 주기적으로 AI 요약을 생성하는 서비스
- **AIAgent**: LLM을 활용하여 설득 메시지 생성 및 강의 내용 요약을 수행하는 에이전트
- **Dashboard**: 강의 요약, 키워드, 이탈 통계를 실시간으로 시각화하는 UI 컴포넌트
- **비학습_사이트**: 유튜브, SNS, 게임 등 학습과 무관한 웹사이트
- **설득_메시지**: 현재 강의 맥락을 기반으로 생성된 맞춤형 복귀 유도 알림
- **요약_주기**: LapseHarness가 AI 요약을 트리거하는 시간 간격 (기본 3분)
- **강의_세션**: 학생이 강의를 시작하고 종료할 때까지의 단위 기간
- **텍스트_청크**: Web Speech API로부터 수신된 음성 인식 텍스트 단위

## 요구사항

### 요구사항 1: 강의 세션 관리

**사용자 스토리:** 학생으로서, 강의 세션을 시작하고 종료할 수 있어야 한다. 그래야 시스템이 해당 강의 동안의 집중 보조 기능을 활성화할 수 있다.

#### 수용 기준

1. WHEN 학생이 강의 세션을 시작하면, THE 시스템 SHALL 고유한 sessionId를 가진 LectureSession을 ACTIVE 상태로 생성한다
2. WHEN 학생이 강의 세션을 종료하면, THE 시스템 SHALL 해당 LectureSession의 상태를 COMPLETED로 변경하고 endTime을 기록한다
3. WHILE 강의 세션이 ACTIVE 상태인 동안, THE 시스템 SHALL TabMonitor와 LapseHarness를 활성 상태로 유지한다
4. IF 세션 생성 시 userId 또는 title이 누락되면, THEN THE 시스템 SHALL 세션 생성을 거부하고 유효성 오류를 반환한다

### 요구사항 2: 탭 전환 감지

**사용자 스토리:** 학생으로서, 시스템이 내가 비학습 사이트로 이동하는 것을 자동으로 감지해야 한다. 그래야 적절한 시점에 집중 유도를 받을 수 있다.

#### 수용 기준

1. WHEN 학생이 다른 탭으로 전환하면, THE TabMonitor SHALL 대상 URL과 타임스탬프를 포함한 탭 전환 이벤트를 발생시킨다
2. WHEN 탭 전환 이벤트가 발생하면, THE TabMonitor SHALL 대상 URL을 비학습 사이트 목록과 대조하여 비학습 여부를 판별한다
3. WHEN 학생이 강의 탭으로 복귀하면, THE TabMonitor SHALL 복귀 타임스탬프를 포함한 탭 복귀 이벤트를 발생시킨다
4. THE TabMonitor SHALL visibilitychange 및 focus/blur 브라우저 이벤트를 통해 탭 전환을 감지한다

### 요구사항 3: 비학습 사이트 분류

**사용자 스토리:** 학생으로서, 어떤 사이트가 비학습 사이트인지 직접 설정할 수 있어야 한다. 그래야 내 학습 환경에 맞는 맞춤형 집중 관리를 받을 수 있다.

#### 수용 기준

1. THE TabMonitor SHALL URL 패턴 기반으로 비학습 사이트를 분류한다 (유튜브, SNS, 게임 등 기본 목록 포함)
2. WHEN 학생이 허용 목록에 사이트를 추가하면, THE TabMonitor SHALL 해당 사이트를 비학습 사이트 판별에서 제외한다
3. WHEN 학생이 차단 목록에 사이트를 추가하면, THE TabMonitor SHALL 해당 사이트를 비학습 사이트로 분류한다
4. IF 대상 URL이 허용 목록과 차단 목록 모두에 존재하면, THEN THE TabMonitor SHALL 허용 목록을 우선 적용한다

### 요구사항 4: 맥락 기반 설득 메시지 생성

**사용자 스토리:** 학생으로서, 비학습 사이트로 이동했을 때 현재 강의 내용과 관련된 맞춤형 메시지를 받아야 한다. 그래야 단순 차단이 아닌 자연스러운 복귀 동기를 얻을 수 있다.

#### 수용 기준

1. WHEN 비학습 사이트로의 탭 전환이 감지되면, THE FocusHarness SHALL LapseHarness로부터 현재 강의 맥락(최근 텍스트, 키워드)을 조회한다
2. WHEN 강의 맥락이 확보되면, THE FocusHarness SHALL AIAgent에 대상 URL과 강의 맥락을 전달하여 설득 메시지 생성을 요청한다
3. WHEN AIAgent가 설득 메시지를 반환하면, THE FocusHarness SHALL 메시지, 긴급도(LOW/MEDIUM/HIGH), 강의 맥락을 포함한 PersuasionMessage를 생성한다
4. THE AIAgent SHALL 단순 경고가 아닌 현재 강의 내용을 기반으로 한 맞춤형 설득 메시지를 생성한다

### 요구사항 5: 설득 메시지 알림 표시

**사용자 스토리:** 학생으로서, 설득 메시지를 즉시 확인할 수 있는 알림을 받아야 한다. 그래야 강의로 빠르게 복귀할 수 있다.

#### 수용 기준

1. WHEN FocusHarness가 PersuasionMessage를 생성하면, THE 알림_UI SHALL 해당 메시지를 학생에게 표시한다
2. WHEN 학생이 강의 탭으로 복귀하면, THE FocusHarness SHALL 이탈 시간을 DistractionEvent에 기록한다
3. THE FocusHarness SHALL 각 이탈 이벤트의 대상 URL, 사이트명, 이탈 시각, 복귀 시각, 설득 메시지, 이탈 시간(초)을 기록한다

### 요구사항 6: 실시간 음성 인식

**사용자 스토리:** 학생으로서, 강의 음성이 실시간으로 텍스트로 변환되어야 한다. 그래야 잠시 집중을 놓쳐도 강의 내용을 텍스트로 확인할 수 있다.

#### 수용 기준

1. WHEN 강의 세션이 시작되면, THE LapseHarness SHALL Web Speech API를 통해 마이크 입력의 실시간 음성-텍스트 변환을 시작한다
2. WHEN Web Speech API가 인식 결과를 반환하면, THE LapseHarness SHALL 텍스트, 시작 시각, 종료 시각, isFinal 여부, confidence 값을 포함한 TranscriptChunk를 생성한다
3. THE LapseHarness SHALL 인식된 텍스트를 내부 버퍼에 누적하고 세션 관리자를 통해 저장한다
4. WHEN 강의 세션이 종료되면, THE LapseHarness SHALL 음성 인식을 중단하고 남은 버퍼 데이터를 저장한다

### 요구사항 7: 주기적 강의 요약 생성

**사용자 스토리:** 학생으로서, 강의 내용이 일정 주기마다 자동으로 요약되어야 한다. 그래야 멍때리다 정신을 차려도 바로 강의 흐름을 파악할 수 있다.

#### 수용 기준

1. WHILE 강의 세션이 ACTIVE 상태인 동안, THE LapseHarness SHALL 요약 주기(기본 3분)마다 누적된 텍스트 버퍼를 AIAgent에 전달하여 요약을 요청한다
2. WHEN AIAgent가 요약을 반환하면, THE LapseHarness SHALL 핵심 포인트(mainPoints)와 키워드(keywords)를 포함한 Summary를 생성한다
3. WHEN Summary가 생성되면, THE LapseHarness SHALL 세션 관리자를 통해 해당 요약을 저장하고 Dashboard에 업데이트를 전송한다
4. THE AIAgent SHALL 이전 키워드 목록을 참조하여 요약 간 연속성을 유지한다

### 요구사항 8: 강의 맥락 제공

**사용자 스토리:** Focus-Harness 모듈이 설득 메시지를 생성하기 위해 현재 강의 맥락을 조회할 수 있어야 한다. 그래야 맥락에 맞는 설득 메시지가 만들어진다.

#### 수용 기준

1. WHEN FocusHarness가 강의 맥락을 요청하면, THE LapseHarness SHALL 지정된 시간 범위(windowSeconds) 내의 최근 텍스트와 키워드를 반환한다
2. IF 요청된 시간 범위 내에 텍스트 데이터가 없으면, THEN THE LapseHarness SHALL 빈 맥락 객체를 반환한다

### 요구사항 9: 실시간 대시보드 표시

**사용자 스토리:** 학생으로서, 강의 요약과 키워드를 실시간 대시보드에서 확인할 수 있어야 한다. 그래야 강의 흐름을 한눈에 파악할 수 있다.

#### 수용 기준

1. WHEN 새로운 Summary가 생성되면, THE Dashboard SHALL 타임라인에 해당 요약 카드를 추가한다
2. WHILE 강의 세션이 ACTIVE 상태인 동안, THE Dashboard SHALL 실시간 텍스트 스트림을 표시한다
3. THE Dashboard SHALL 이탈 통계(총 이탈 횟수, 총 이탈 시간, 평균 이탈 시간, 집중률)를 시각화한다
4. THE Dashboard SHALL 키워드를 하이라이트 표시하고 검색 기능을 제공한다

### 요구사항 10: 이탈 통계 추적

**사용자 스토리:** 학생으로서, 강의 중 나의 집중도 통계를 확인할 수 있어야 한다. 그래야 학습 습관을 개선할 수 있다.

#### 수용 기준

1. WHEN FocusHarness가 이탈 통계를 조회하면, THE 시스템 SHALL 총 이탈 횟수, 총 이탈 시간(초), 평균 이탈 시간, 상위 이탈 사이트 목록, 집중률을 포함한 DistractionStats를 반환한다
2. THE 시스템 SHALL 집중률(focusRate)을 0.0에서 1.0 사이의 값으로 계산한다 (1.0은 완벽한 집중)
3. WHEN 새로운 DistractionEvent가 기록되면, THE 시스템 SHALL DistractionStats를 즉시 갱신한다

### 요구사항 11: 데이터 유효성 검증

**사용자 스토리:** 시스템 관리자로서, 모든 데이터가 정의된 유효성 규칙을 준수해야 한다. 그래야 데이터 무결성이 보장된다.

#### 수용 기준

1. THE 시스템 SHALL TranscriptChunk의 confidence 값을 0.0에서 1.0 범위로 제한한다
2. THE 시스템 SHALL DistractionStats의 focusRate 값을 0.0에서 1.0 범위로 제한한다
3. THE 시스템 SHALL Keyword의 importance 값을 0.0에서 1.0 범위로 제한한다
4. THE 시스템 SHALL DistractionEvent의 durationSeconds 값을 0 이상으로 제한한다
5. THE 시스템 SHALL 모든 sessionId가 활성 세션을 참조하는지 검증한다
