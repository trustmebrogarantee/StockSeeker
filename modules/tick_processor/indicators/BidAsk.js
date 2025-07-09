import EventEmitter from "eventemitter3"

export class BidAsk extends EventEmitter {
  constructor(timeWindow = 1000 * 60 * 60 * 24) {
    super()
    this.totalBid = 0
    this.totalAsk = 0

    this.askBidRatio = 0

    this.firstClear = null
    this.timeWindow = timeWindow
    this.isBullish = false

    this.firstBidAfterClear = 0
    this.firstAskAfterClear = 0
    this.history = []
    this.bids = []
    this.asks = []
    this.clearIndex = 0
  }

  processCandle(candle) {
    if (this.firstClear === null) this.firstClear = candle.time
    const deltaStartAskBid = this.totalAsk - this.totalBid
    
    if (candle.time - this.firstClear >= this.timeWindow) {
      this.totalAsk -= this.asks[this.clearIndex]
      this.totalBid -= this.bids[this.clearIndex]
      this.clearIndex++
    }

    this.totalAsk += candle.tradedAskContracts
    this.totalBid += candle.tradedBidContracts

    this.bids.push(candle.tradedBidContracts)
    this.asks.push(candle.tradedAskContracts)

    this.askBidRatio = this.totalAsk / this.totalBid
    this.isBullish = this.totalAsk >= this.totalBid

    const deltaEndAskBid = this.totalAsk - this.totalBid
    if (Math.sign(deltaStartAskBid) !== Math.sign(deltaEndAskBid)) {
      const historyItem = { time: candle.time, isBullish: this.isBullish, ratio: this.askBidRatio }
      this.history.push(historyItem)
      this.emit('ratio-change', historyItem)
    }
  }
}