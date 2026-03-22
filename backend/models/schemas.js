const { z } = require('zod');
const crypto = require('crypto');

// === Enums ===

const SessionStatus = z.enum(['ACTIVE', 'PAUSED', 'COMPLETED']);
const Urgency = z.enum(['LOW', 'MEDIUM', 'HIGH']);

// === Keyword 스키마 ===

const KeywordSchema = z.object({
  word: z.string().min(1),
  frequency: z.int().min(1),
  importance: z.number().min(0).max(1),
  firstMentionedAt: z.date(),
});

// === LectureSession 스키마 ===

const LectureSessionSchema = z.object({
  sessionId: z.uuid(),
  userId: z.uuid(),
  title: z.string().min(1),
  startTime: z.date(),
  endTime: z.date().nullable(),
  status: SessionStatus,
});

// === TranscriptChunk 스키마 ===

const TranscriptChunkSchema = z.object({
  chunkId: z.uuid(),
  sessionId: z.uuid(),
  text: z.string(),
  startTime: z.date(),
  endTime: z.date(),
  isFinal: z.boolean(),
  confidence: z.number().min(0).max(1),
});

// === Summary 스키마 ===

const SummarySchema = z.object({
  summaryId: z.uuid(),
  sessionId: z.uuid(),
  periodStart: z.date(),
  periodEnd: z.date(),
  mainPoints: z.array(z.string()),
  keywords: z.array(KeywordSchema),
  rawText: z.string(),
});

// === DistractionEvent 스키마 ===

const DistractionEventSchema = z.object({
  eventId: z.uuid(),
  sessionId: z.uuid(),
  targetUrl: z.string().url(),
  siteName: z.string().min(1),
  departureTime: z.date(),
  returnTime: z.date().nullable(),
  persuasionMessage: z.string(),
  durationSeconds: z.number().int().min(0),
});

// === SiteCount (topDistractingSites 항목) ===

const SiteCountSchema = z.object({
  siteName: z.string().min(1),
  count: z.int().min(0),
});

// === DistractionStats 스키마 ===

const DistractionStatsSchema = z.object({
  sessionId: z.uuid(),
  totalDistractions: z.int().min(0),
  totalDistractedSeconds: z.int().min(0),
  averageDistractionSeconds: z.number().min(0),
  topDistractingSites: z.array(SiteCountSchema),
  focusRate: z.number().min(0).max(1),
});

// === PersuasionMessage 스키마 ===

const PersuasionMessageSchema = z.object({
  message: z.string().min(1),
  urgency: Urgency,
  lectureContext: z.string(),
  generatedAt: z.date(),
});

// === 헬퍼: UUID 생성 ===

function generateUUID() {
  return crypto.randomUUID();
}

module.exports = {
  SessionStatus,
  Urgency,
  KeywordSchema,
  LectureSessionSchema,
  TranscriptChunkSchema,
  SummarySchema,
  DistractionEventSchema,
  SiteCountSchema,
  DistractionStatsSchema,
  PersuasionMessageSchema,
  generateUUID,
};
