import { addDays, ymd } from '@/lib/dates'

const toDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// 승인된 학습 날짜들로 연속 공부일을 계산합니다.
// - current: 오늘(학습일)까지 이어진 연속 일수. 오늘 아직 기록이 없으면 어제부터 셉니다.
// - best: 지금까지의 최장 연속 일수, days: 공부한 날 수
export function streaks(dates: string[], today: string) {
  const set = new Set(dates)
  let day = toDate(today)
  if (!set.has(ymd(day))) day = addDays(day, -1)
  let current = 0
  while (set.has(ymd(day))) {
    current++
    day = addDays(day, -1)
  }
  let best = 0
  let run = 0
  let prev: Date | null = null
  for (const s of [...set].sort()) {
    run = prev && ymd(addDays(prev, 1)) === s ? run + 1 : 1
    best = Math.max(best, run)
    prev = toDate(s)
  }
  return { current, best, days: set.size }
}

