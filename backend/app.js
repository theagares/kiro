require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const supabaseClient = require('./db/supabaseClient');
const sessionsRouter = require('./routes/sessions');
const sitesRouter = require('./routes/sites');
const focusRouter = require('./routes/focus');
const lapseRouter = require('./routes/lapse');
const { setFocusHarness } = require('./routes/focus');
const { setLapseHarness } = require('./routes/lapse');
const { createAIAgent } = require('./services/aiAgent');
const { createLapseHarness } = require('./services/lapseHarness');
const { createFocusHarness } = require('./services/focusHarness');

const app = express();

// === Supabase 초기화 ===
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  supabaseClient.initialize(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  console.log('[Supabase] Connected:', supabaseClient.isConnected());
} else {
  console.warn('[Supabase] SUPABASE_URL / SUPABASE_ANON_KEY not set — using in-memory fallback');
}

// === 미들웨어 ===
app.use(cors());
app.use(express.json());

// === 정적 파일 서빙 (클라이언트 대시보드) ===
app.use(express.static(path.join(__dirname, '..', 'client')));

// === 공유 서비스 인스턴스 생성 및 의존성 주입 ===
const aiAgent = createAIAgent();
const lapseHarness = createLapseHarness({ aiAgent });
const focusHarness = createFocusHarness({ lapseHarness, aiAgent });

// 라우터에 공유 인스턴스 주입
setFocusHarness(focusHarness);
setLapseHarness(lapseHarness);

// === 라우터 등록 ===
app.use('/api/sessions', sessionsRouter);
app.use('/api/sites', sitesRouter);
app.use('/api/focus', focusRouter);
app.use('/api/lapse', lapseRouter);

// === SPA 폴백: 루트 경로에서 dashboard.html 서빙 ===
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dashboard.html'));
});

// === 글로벌 에러 핸들링 미들웨어 ===
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
  });
});

// === 서버 시작 (직접 실행 시) ===
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`ADHD Focus Assistant server running on port ${PORT}`);
  });
}

module.exports = app;
