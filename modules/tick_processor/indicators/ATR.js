export class ATR {
  constructor(period = 14) {
    this.period = period;
    this.trueRanges = [];
    this.previousClose = null;
    this.avgTR = 0;
  }

  /**
   * Processes a new tick and updates the ATR.
   * @param {Object} tick - Tick data with { qty: number, quoteQty: number, time: number, price: number }
   * @returns {number|null} - Current ATR value, or null if not enough data
   */
  processTick(tick) {
    const price = tick.price;

    // Skip first tick (no previous close)
    if (this.previousClose === null) {
      this.previousClose = price;
      return null;
    }

    // Calculate true range: max(high-low, |high-prevClose|, |low-prevClose|)
    // Since we only have tick price, assume high/low are same for simplicity
    const high = price;
    const low = price;
    const prevClose = this.previousClose;
    const trueRange = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );

    this.trueRanges.push(trueRange);
    this.previousClose = price;

    // If enough data, calculate ATR
    if (this.trueRanges.length > this.period) {
      this.trueRanges.shift();

      if (this.trueRanges.length === this.period && this.avgTR === 0) {
        // Initial ATR
        this.avgTR = this.trueRanges.reduce((sum, tr) => sum + tr, 0) / this.period;
      } else {
        // Wilder's smoothing: (previous ATR * (period-1) + current TR) / period
        this.avgTR = (this.avgTR * (this.period - 1) + trueRange) / this.period;
      }

      return this.avgTR;
    }

    return null;
  }

  /**
   * Returns the current ATR value without processing a new tick.
   * @returns {number|null} - Current ATR value, or null if not enough data
   */
  getCurrentATR() {
    return this.trueRanges.length === this.period ? this.avgTR : null;
  }
}