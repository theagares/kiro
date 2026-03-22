-- 1. lecture_sessions
CREATE TABLE lecture_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED'))
);

CREATE INDEX idx_lecture_sessions_user_id ON lecture_sessions(user_id);
CREATE INDEX idx_lecture_sessions_status ON lecture_sessions(status);

-- 2. transcript_chunks
CREATE TABLE transcript_chunks (
  chunk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES lecture_sessions(session_id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_final BOOLEAN NOT NULL DEFAULT false,
  confidence NUMERIC NOT NULL DEFAULT 0
    CHECK (confidence >= 0.0 AND confidence <= 1.0)
);

CREATE INDEX idx_transcript_chunks_session_id ON transcript_chunks(session_id);
CREATE INDEX idx_transcript_chunks_end_time ON transcript_chunks(end_time);

-- 3. summaries
CREATE TABLE summaries (
  summary_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES lecture_sessions(session_id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  main_points JSONB NOT NULL DEFAULT '[]',
  raw_text TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_summaries_session_id ON summaries(session_id);

-- 4. summary_keywords
CREATE TABLE summary_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id UUID NOT NULL REFERENCES summaries(summary_id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  frequency INTEGER NOT NULL DEFAULT 1 CHECK (frequency >= 1),
  importance NUMERIC NOT NULL DEFAULT 0.5
    CHECK (importance >= 0.0 AND importance <= 1.0),
  first_mentioned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_summary_keywords_summary_id ON summary_keywords(summary_id);

-- 5. distraction_events
CREATE TABLE distraction_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES lecture_sessions(session_id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  site_name TEXT NOT NULL,
  departure_time TIMESTAMPTZ NOT NULL,
  return_time TIMESTAMPTZ,
  persuasion_message TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0)
);

CREATE INDEX idx_distraction_events_session_id ON distraction_events(session_id);
