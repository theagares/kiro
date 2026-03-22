-- RLS 활성화
ALTER TABLE lecture_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE summary_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE distraction_events ENABLE ROW LEVEL SECURITY;

-- lecture_sessions: 본인 데이터만 접근
CREATE POLICY "Users can access own sessions"
  ON lecture_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- transcript_chunks: 본인 세션의 청크만 접근
CREATE POLICY "Users can access own transcript chunks"
  ON transcript_chunks FOR ALL
  USING (session_id IN (SELECT session_id FROM lecture_sessions WHERE user_id = auth.uid()))
  WITH CHECK (session_id IN (SELECT session_id FROM lecture_sessions WHERE user_id = auth.uid()));

-- summaries: 본인 세션의 요약만 접근
CREATE POLICY "Users can access own summaries"
  ON summaries FOR ALL
  USING (session_id IN (SELECT session_id FROM lecture_sessions WHERE user_id = auth.uid()))
  WITH CHECK (session_id IN (SELECT session_id FROM lecture_sessions WHERE user_id = auth.uid()));

-- summary_keywords: 본인 세션의 키워드만 접근
CREATE POLICY "Users can access own summary keywords"
  ON summary_keywords FOR ALL
  USING (summary_id IN (
    SELECT s.summary_id FROM summaries s
    JOIN lecture_sessions ls ON s.session_id = ls.session_id
    WHERE ls.user_id = auth.uid()
  ))
  WITH CHECK (summary_id IN (
    SELECT s.summary_id FROM summaries s
    JOIN lecture_sessions ls ON s.session_id = ls.session_id
    WHERE ls.user_id = auth.uid()
  ));

-- distraction_events: 본인 세션의 이탈 이벤트만 접근
CREATE POLICY "Users can access own distraction events"
  ON distraction_events FOR ALL
  USING (session_id IN (SELECT session_id FROM lecture_sessions WHERE user_id = auth.uid()))
  WITH CHECK (session_id IN (SELECT session_id FROM lecture_sessions WHERE user_id = auth.uid()));
