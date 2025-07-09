export class CvdPricePairs {
  constructor() {
    this.candleClosePairs = []
    this.changePairs = [0,0]
    this.i = -1
    this.startingPoint = 0
  }

  processCandle(candle) {    
    const priceDelta = candle.priceDelta
    const volumeDelta = candle.volumeDelta
    this.candleClosePairs.push(priceDelta, volumeDelta)

    if (this.i > -1) {
      const prevPriceDelta = this.candleClosePairs[(this.i) * 2]
      const prevVolumeDelta = this.candleClosePairs[(this.i) * 2 + 1]
      
      const priceDeltaChange = Math.abs(priceDelta / prevPriceDelta) * Math.sign(priceDelta)
      const volumeDeltaChange = Math.abs(volumeDelta / prevVolumeDelta) * Math.sign(volumeDelta)
      
      this.changePairs.push(isFinite(priceDeltaChange) ? prevPriceDelta : 0, isFinite(volumeDeltaChange) ? volumeDeltaChange : 0)
    }
    this.i++
  }
}

// 100 50 | Math.abs(50 / 100) * Math.sign(50) | 0.5 + 1
// -100 50 | Math.abs(50 / -100) * Math.sign(50) | 0.5  + 1
// 100 -50 | Math.abs(-50 / 100) * Math.sign(-50) | -0.5 + 1
// -100 -50 | Math.abs(-50 / -100) * Math.sign(-50) | -0.5 + 1