/**
 * 더미 데이터 시딩 스크립트
 *
 * Supabase에 가상 사용자 세션과 이탈 이벤트를 삽입하여
 * 퍼센타일 비교 기능을 테스트할 수 있게 한다.
 *
 * 사용법: node scripts/seed-dummy-data.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('SUPABASE_URL과 SUPABASE_ANON_KEY를 .env에 설정해주세요.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 더미 사용자 20명, 각각 1~3개 세션
const DUMMY_USERS = 20;
const TITLES = [
  '자료구조 3주차', '운영체제 중간고사 복습', '알고리즘 설계',
  '데이터베이스 개론', '컴퓨터 네트워크', '소프트웨어 공학',
  '인공지능 기초', '웹 프로그래밍', '선형대수학', '확률과 통계',
];
const DISTRACTION_SITES = [
  'https://www.youtube.com/watch?v=abc',
  'https://www.instagram.com/explore',
  'https://www.reddit.com/r/programming',
  'https://twitter.com/home',
  'https://www.facebook.com',
  'https://www.tiktok.com',
  'https://namu.wiki/random',
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function extractHostname(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

async function seed() {
  console.log('🌱 더미 데이터 시딩 시작...\n');

  // 테이블 존재 여부 확인
  const { error: checkErr } = await supabase
    .from('lecture_sessions')
    .select('session_id')
    .limit(1);

  if (checkErr && checkErr.message.includes('Could not find')) {
    console.error('❌ 테이블이 아직 생성되지 않았습니다.');
    console.error('');
    console.error('Supabase 대시보드 → SQL Editor에서 아래 파일의 SQL을 실행해주세요:');
    console.error('  1. supabase/migrations/001_create_tables.sql');
    console.error('  2. supabase/migrations/002_rls_policies.sql');
    console.error('');
    console.error('실행 후 다시 이 스크립트를 실행하세요.');
    process.exit(1);
  }

  let totalSessions = 0;
  let totalEvents = 0;

  for (let u = 0; u < DUMMY_USERS; u++) {
    const userId = crypto.randomUUID();
    const sessionsCount = randomInt(1, 3);

    for (let s = 0; s < sessionsCount; s++) {
      // 세션: 30분~120분 전에 시작, 20분~90분 동안 진행
      const daysAgo = randomInt(0, 30);
      const hoursAgo = randomInt(1, 12);
      const startTime = new Date(Date.now() - daysAgo * 86400000 - hoursAgo * 3600000);
      const durationMin = randomInt(20, 90);
      const endTime = new Date(startTime.getTime() + durationMin * 60000);
      const sessionId = crypto.randomUUID();
      const title = randomChoice(TITLES);

      const { error: sessErr } = await supabase
        .from('lecture_sessions')
        .insert({
          session_id: sessionId,
          user_id: userId,
          title,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          status: 'COMPLETED',
        });

      if (sessErr) {
        console.error(`세션 삽입 실패 (user ${u}, session ${s}):`, sessErr.message);
        continue;
      }
      totalSessions++;

      // 이탈 이벤트: 0~8회 (집중률 다양하게)
      const distractionCount = randomInt(0, 8);
      let cursor = startTime.getTime() + randomInt(60, 300) * 1000;

      for (let d = 0; d < distractionCount; d++) {
        if (cursor >= endTime.getTime() - 30000) break;

        const departureTime = new Date(cursor);
        const distractSec = randomInt(5, 180);
        const returnTime = new Date(cursor + distractSec * 1000);

        if (returnTime.getTime() >= endTime.getTime()) break;

        const targetUrl = randomChoice(DISTRACTION_SITES);
        const eventId = crypto.randomUUID();

        const { error: evtErr } = await supabase
          .from('distraction_events')
          .insert({
            event_id: eventId,
            session_id: sessionId,
            target_url: targetUrl,
            site_name: extractHostname(targetUrl),
            departure_time: departureTime.toISOString(),
            return_time: returnTime.toISOString(),
            persuasion_message: '강의에 집중해주세요!',
            duration_seconds: distractSec,
          });

        if (evtErr) {
          console.error(`이벤트 삽입 실패:`, evtErr.message);
        } else {
          totalEvents++;
        }

        // 다음 이탈까지 1~5분 간격
        cursor = returnTime.getTime() + randomInt(60, 300) * 1000;
      }
    }

    process.stdout.write(`\r  사용자 ${u + 1}/${DUMMY_USERS} 완료`);
  }

  console.log(`\n\n✅ 시딩 완료: ${totalSessions}개 세션, ${totalEvents}개 이탈 이벤트`);
}

seed().catch(err => {
  console.error('시딩 실패:', err);
  process.exit(1);
});
