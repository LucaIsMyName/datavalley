export function calendarBounds(today = new Date()) {
  const year = today.getFullYear()
  return {
    startMonth: new Date(year - 100, 0, 1),
    endMonth: new Date(year + 100, 11, 1),
  }
}
