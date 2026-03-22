const express = require('express');
const { z } = require('zod');
const { createFocusHarness } = require('../services/focusHarness');

const router = express.Router();

// === 공유 FocusHarness 인스턴스 (기본 의존성 없이 생성, 외부에서 주입 가능) ===

let focusHarness = createFocusHarness();

/**
 * FocusHarness 인스턴스를 교체한다 (테스트 또는 통합 시 의존성 주입용).
 * @param {object} instance - 새 FocusHarness 인스턴스
 */
function setFocusHarness(instance) {
  focusHarness = instance;
}

/**
 * 현재 FocusHarness 인스턴스를 반환한다.
 * @returns {object}
 */
function getFocusHarness() {
  return focusHarness;
}

// === Zod 요청 유효성 검증 스키마 ===

const TabSwitchBodySchema = z.object({
  sessionId: z.string().uuid(),
  targetUrl: z.string().min(1),
  timestamp: z.coerce.date(),
});

const TabReturnBodySchema = z.object({
  sessionId: z.string().uuid(),
  timestamp: z.coerce.date(),
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

// === POST /api/focus/tab-switch — 탭 전환 이벤트 처리 ===

router.post('/tab-switch', validateBody(TabSwitchBodySchema), async (req, res) => {
  try {
    const { sessionId, targetUrl, timestamp } = req.validatedBody;
    const result = await focusHarness.handleTabSwitch({ sessionId, targetUrl, timestamp });
    return res.status(200).json({ persuasion: result });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes('not active')) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

// === POST /api/focus/tab-return — 탭 복귀 이벤트 처리 ===

router.post('/tab-return', validateBody(TabReturnBodySchema), async (req, res) => {
  try {
    const { sessionId, timestamp } = req.validatedBody;
    const result = focusHarness.handleTabReturn({ sessionId, timestamp });
    return res.status(200).json({ event: result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// === GET /api/focus/stats/:sessionId — 이탈 통계 조회 ===

router.get('/stats/:sessionId', (req, res) => {
  try {
    const stats = focusHarness.getDistractionStats(req.params.sessionId);
    return res.status(200).json(stats);
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
module.exports.setFocusHarness = setFocusHarness;
module.exports.getFocusHarness = getFocusHarness;
