export class Absorption {
  constructor(topMonthlyCandles) {
    this.topMonthlyCandles = topMonthlyCandles
    this.prevLowerAbsorption = { price: 0, delta: 0 }
  }

  processCandle(candle) {
    for (const cluster of Object.values(candle.clusters)) {
      if (cluster.position === 'upper-wick' && cluster.volume >= this.topMonthlyCandles.volumeAnomaly && cluster.volumeDelta >= this.topMonthlyCandles.positiveDeltaAnomaly) {
        cluster.absorption = Math.log(cluster.volume + cluster.volumeDelta)
        candle.absorption = cluster.absorption
      } else if (cluster.position === 'lower-wick' && cluster.volume >= this.topMonthlyCandles.volumeAnomaly && cluster.volumeDelta <= this.topMonthlyCandles.negativeDeltaAnomaly) {
        cluster.absorption = Math.log(cluster.volume + Math.abs(cluster.volumeDelta)) * -1
        candle.absorption = cluster.absorption
      }
    }
  }
}