export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// 학습일은 새벽 5시에 바뀝니다. (새벽 0~4시 59분에 기록하면 전날 학습으로 처리)
export const DAY_START_HOUR = 5
export const studyNow = () => new Date(Date.now() - DAY_START_HOUR * 3600 * 1000)

export const todayStr = () => ymd(studyNow())

export const addDays = (d: Date, n: number) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() + n)
  return x
}

// 주의 시작은 월요일
export const weekStart = (base: Date = studyNow()) => {
  const x = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

export const monthFirst = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
export const monthLast = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0)

export const fmtMin = (m: number) => {
  const h = Math.floor(m / 60)
  const r = m % 60
  return h ? `${h}시간 ${r}분` : `${r}분`
}

