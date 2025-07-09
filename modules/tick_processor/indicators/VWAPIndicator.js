export class VWAPIndicator {
  constructor(minutesWindow) {
      this.cumulativePriceVolume = 0;
      this.cumulativeVolume = 0;
      this.vwap = 0;
      this.savedTick = null
      this.minutesWindow = minutesWindow
  }

  processTick(tick) {
    // Expect tick to have { price, qty, timestamp } where timestamp is a Date object or ISO string
    if (this.savedTick === null) this.savedTick = tick.time

    // 60_000 * 60 * 5.5 time: 1800 | 0.05 - 0.07 risk
    // Reset if it's a new trading day
    if (tick.time - this.savedTick > 60_000 * this.minutesWindow) {
        this.reset();
        this.savedTick = tick.time
    }

    // Update cumulative values based on VWAP formula: VWAP = Σ(v_i * p_i) / Σv_i
    this.cumulativePriceVolume += tick.price * tick.qty;
    this.cumulativeVolume += tick.qty;

    // Calculate VWAP
    if (this.cumulativeVolume > 0) {
        this.vwap = this.cumulativePriceVolume / this.cumulativeVolume;
    }

    return this.vwap;
  }

  reset() {
    this.cumulativePriceVolume = 0;
    this.cumulativeVolume = 0;
    this.vwap = 0;
  }

  getCurrentVWAP() {
      return this.vwap;
  }
}