# 구현 결정

## 2026-11-16: 원격 PostgreSQL 17 사용

초기 프롬프트는 PostgreSQL 15를 고정 스택으로 지정했다. 새로 만든 Supabase `apptech` 프로젝트(`uhisjleftevizjfudeip`)가 PostgreSQL 17.11.0.019임을 확인했고, 사용자가 기존 PostgreSQL 17 프로젝트 사용과 마이그레이션 적용을 선택했다. 로컬 Supabase 설정도 PostgreSQL 17로 맞춘다. 원문 기획 파일은 변경하지 않고 이 결정을 별도로 기록한다.

원격 프로젝트에 `0001_init.sql`을 적용하고 Auth의 기본 URL과 추가 복귀 URL을 `offlinetime://auth/callback`에 맞췄다. 로컬 PostgreSQL 17.11에서 마이그레이션 초기화와 M0 인증·프로필·RLS 검증을 다시 통과했다. Apple·Google 제공자는 아직 인증 정보가 없어 비활성 상태다.
