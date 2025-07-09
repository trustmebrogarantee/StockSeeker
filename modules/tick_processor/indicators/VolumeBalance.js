export class VolumeBalance {
  constructor() {
      this.buyerVolume = 0
      this.sellerVolume = 0
      this.buySellBalance = 0
      this.savedTick = null
  }

  processTick(tick) {
      // Expect tick to have { price, qty, timestamp } where timestamp is a Date object or ISO string
      if (this.savedTick === null) this.savedTick = tick.time

      // 60_000 * 60 * 5.5 time: 1800 | 0.05 - 0.07 risk
      // Reset if it's a new trading day
      if (tick.time - this.savedTick > 60_000 * 60) {
          this.reset();
          this.savedTick = tick.time
      }

      // Update cumulative values based on VWAP formula: VWAP = Σ(v_i * p_i) / Σv_i
      if (tick.isBuyerMaker) {
        this.sellerVolume += tick.qty
      } else {
        this.buyerVolume += tick.qty
      }

      this.buySellBalance = this.buyerVolume / (this.buyerVolume + this.sellerVolume)
  }

  reset() {
    this.buyerVolume = 0
    this.sellerVolume = 0
    this.butSellBalance = 0
  }

  getCurrentVWAP() {
      return this.vwap;
  }
}