-- ============================================================
-- Supabase 대시보드 SQL Editor에서 실행하세요.
-- 인증 없이 anon 키로 접근할 수 있도록 RLS 정책을 설정합니다.
-- ============================================================

-- 기존 RLS 정책 제거 (있으면)
DROP POLICY IF EXISTS "Users can access own sessions" ON lecture_sessions;
DROP POLICY IF EXISTS "Users can access own transcript chunks" ON transcript_chunks;
DROP POLICY IF EXISTS "Users can access own summaries" ON summaries;
DROP POLICY IF EXISTS "Users can access own summary keywords" ON summary_keywords;
DROP POLICY IF EXISTS "Users can access own distraction events" ON distraction_events;

-- anon 전체 접근 허용 정책 (개발/해커톤용)
CREATE POLICY "Allow all access" ON lecture_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON transcript_chunks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON summaries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON summary_keywords FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON distraction_events FOR ALL USING (true) WITH CHECK (true);
