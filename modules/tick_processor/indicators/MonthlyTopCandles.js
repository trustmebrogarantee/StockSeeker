export class MonthlyTopCandles {
  constructor() {
    this.monthStart = null

    this.monthTimeDelta = 30 * 24 * 60 * 60 * 1000
    this.monthCandles = []

    this.volumeAnomaly = null
    this.negativeDeltaAnomaly = null
    this.positiveDeltaAnomaly = null
    this.topN = null
  }

  processCandle(candle) {
    if (this.monthStart === null) this.monthStart = candle.time
    if (candle.time - this.monthStart >= this.monthTimeDelta) {
      this.topN = Math.floor(this.monthCandles.length * 0.1)
      this.monthCandles.sort((a, b) => b.volume - a.volume)
      this.volumeAnomaly = this.monthCandles[this.topN - 1].volume * 0.1
      this.monthCandles.sort((a, b) => b.volumeDelta - a.volumeDelta)
      this.positiveDeltaAnomaly = this.monthCandles[this.topN - 1].volumeDelta * 0.1
      this.negativeDeltaAnomaly = this.monthCandles.at(-this.topN).volumeDelta * 0.1
      this.monthCandles = []
      this.monthStart = candle.time
    }
    this.monthCandles.push(candle)
  }
}