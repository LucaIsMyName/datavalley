export function monthToShowAfterRangeSelect(clicked: Date | undefined, range: { from?: Date; to?: Date }) {
  return clicked ?? range.from ?? range.to
}
