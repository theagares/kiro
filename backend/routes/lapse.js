const express = require('express');
const { z } = require('zod');
const { createLapseHarness } = require('../services/lapseHarness');

const router = express.Router();

// === 공유 LapseHarness 인스턴스 (기본 의존성 없이 생성, 외부에서 주입 가능) ===

let lapseHarness = createLapseHarness();

/**
 * LapseHarness 인스턴스를 교체한다 (테스트 또는 통합 시 의존성 주입용).
 * @param {object} instance - 새 LapseHarness 인스턴스
 */
function setLapseHarness(instance) {
  lapseHarness = instance;
}

/**
 * 현재 LapseHarness 인스턴스를 반환한다.
 * @returns {object}
 */
function getLapseHarness() {
  return lapseHarness;
}

// === Zod 요청 유효성 검증 스키마 ===

const TranscriptBodySchema = z.object({
  sessionId: z.string().uuid(),
  text: z.string().min(1),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  isFinal: z.boolean(),
  confidence: z.number().min(0).max(1),
});

// === 유효성 검증 미들웨어 ===

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues,
      });
    }
    req.validatedBody = result.data;
    next();
  };
}

// === POST /api/lapse/start/:sessionId — 캡처 시작 ===

router.post('/start/:sessionId', (req, res) => {
  try {
    lapseHarness.startCapture(req.params.sessionId);
    return res.status(200).json({ status: 'capturing', sessionId: req.params.sessionId });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// === POST /api/lapse/stop/:sessionId — 캡처 중단 ===

router.post('/stop/:sessionId', async (req, res) => {
  try {
    const finalSummary = await lapseHarness.stopCapture();
    return res.status(200).json({ status: 'stopped', finalSummary });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// === POST /api/lapse/transcript — 텍스트 청크 수신 ===

router.post('/transcript', validateBody(TranscriptBodySchema), (req, res) => {
  try {
    const chunk = lapseHarness.addTranscriptChunk(req.validatedBody);
    return res.status(201).json(chunk);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// === GET /api/lapse/context/:sessionId — 강의 맥락 조회 ===

router.get('/context/:sessionId', (req, res) => {
  try {
    const windowSeconds = req.query.windowSeconds
      ? parseInt(req.query.windowSeconds, 10)
      : 60;

    if (isNaN(windowSeconds) || windowSeconds <= 0) {
      return res.status(400).json({ error: 'windowSeconds must be a positive integer' });
    }

    const context = lapseHarness.getRecentContext(windowSeconds);
    return res.status(200).json(context);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// === GET /api/lapse/summaries/:sessionId — 요약 이력 조회 ===

router.get('/summaries/:sessionId', (req, res) => {
  try {
    const summaries = lapseHarness.getSummaryHistory(req.params.sessionId);
    return res.status(200).json(summaries);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// === POST /api/lapse/trigger-summary/:sessionId — 수동 요약 트리거 ===

router.post('/trigger-summary/:sessionId', async (req, res) => {
  try {
    const summary = await lapseHarness.triggerSummaryManually(req.params.sessionId);
    if (!summary) {
      return res.status(200).json({ message: '요약할 텍스트가 없습니다.' });
    }
    return res.status(201).json(summary);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
module.exports.setLapseHarness = setLapseHarness;
module.exports.getLapseHarness = getLapseHarness;
