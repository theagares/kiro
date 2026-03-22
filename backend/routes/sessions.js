const express = require('express');
const { z } = require('zod');
const { createSession, endSession, getSession } = require('../services/sessionManager');

const router = express.Router();

// === Zod 요청 유효성 검증 스키마 ===

const CreateSessionBodySchema = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1),
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

// === POST /api/sessions — 세션 생성 ===

router.post('/', validateBody(CreateSessionBodySchema), (req, res) => {
  try {
    const { userId, title } = req.validatedBody;
    const session = createSession(userId, title);
    return res.status(201).json(session);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// === PATCH /api/sessions/:sessionId/end — 세션 종료 ===

router.patch('/:sessionId/end', (req, res) => {
  try {
    const session = endSession(req.params.sessionId);
    return res.status(200).json(session);
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

// === GET /api/sessions/:sessionId — 세션 조회 ===

router.get('/:sessionId', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: `Session not found: ${req.params.sessionId}` });
  }
  return res.status(200).json(session);
});

module.exports = router;
