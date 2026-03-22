const express = require('express');
const { z } = require('zod');
const { isNonStudySite, addToAllowList, addToBlockList } = require('../services/siteClassifier');

const router = express.Router();

// === Zod 요청 유효성 검증 스키마 ===

const PatternBodySchema = z.object({
  pattern: z.string().min(1),
});

const ClassifyBodySchema = z.object({
  url: z.string().min(1),
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

// === POST /api/sites/allow — 허용 목록에 사이트 추가 ===

router.post('/allow', validateBody(PatternBodySchema), (req, res) => {
  try {
    const { pattern } = req.validatedBody;
    addToAllowList(pattern);
    return res.status(200).json({ message: 'Added to allow list', pattern });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// === POST /api/sites/block — 차단 목록에 사이트 추가 ===

router.post('/block', validateBody(PatternBodySchema), (req, res) => {
  try {
    const { pattern } = req.validatedBody;
    addToBlockList(pattern);
    return res.status(200).json({ message: 'Added to block list', pattern });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// === POST /api/sites/classify — URL 비학습 여부 판별 ===

router.post('/classify', validateBody(ClassifyBodySchema), (req, res) => {
  const { url } = req.validatedBody;
  const nonStudy = isNonStudySite(url);
  return res.status(200).json({ url, isNonStudySite: nonStudy });
});

module.exports = router;
