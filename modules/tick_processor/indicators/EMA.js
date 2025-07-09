export class EMA {
  constructor(period, timeframe = 'tick') {
    this.period = period;
    this.timeframe = timeframe; // 'tick', '1m', '1h', etc.
    this.multiplier = 2 / (period + 1);
    this.ema = null;
    this.lastPrice = null;
    this.lastTime = null;
    this.prices = []; // For timeframe aggregation
  }

  /**
   * Processes a new tick and updates the EMA.
   * @param {Object} tick - Tick data with { qty: number, quoteQty: number, time: number, price: number }
   * @returns {number|null} - Current EMA value, or null if not enough data
   */
  processTick(tick) {
    const price = tick.price;
    const time = tick.time;

    // Handle timeframe aggregation
    if (this.timeframe !== 'tick') {
      this.prices.push(price);
      const timeframeMs = this._parseTimeframe(this.timeframe);
      if (!this.lastTime || time - this.lastTime >= timeframeMs) {
        // Aggregate prices for the timeframe (e.g., average price)
        const aggregatedPrice =
          this.prices.reduce((sum, p) => sum + p, 0) / this.prices.length;
        this.prices = []; // Reset for next timeframe
        this.lastTime = time;
        return this._updateEMA(aggregatedPrice);
      }
      return this.ema;
    }

    // For tick-based EMA
    return this._updateEMA(price);
  }

  /**
   * Internal method to update EMA with a new price.
   * @param {number} price - Price to update EMA
   * @returns {number|null} - Current EMA value, or null if not enough data
   */
  _updateEMA(price) {
    if (this.ema === null) {
      // Initialize with SMA for first period
      this.prices.push(price);
      if (this.prices.length < this.period) return null;
      if (this.prices.length === this.period) {
        this.ema = this.prices.reduce((sum, p) => sum + p, 0) / this.period;
        return this.ema;
      }
    }

    // Calculate new EMA: (price - previous EMA) * multiplier + previous EMA
    this.ema = (price - this.ema) * this.multiplier + this.ema;
    return this.ema;
  }

  /**
   * Parses timeframe string to milliseconds.
   * @param {string} timeframe - e.g., '1m', '1h'
   * @returns {number} - Timeframe in milliseconds
   */
  _parseTimeframe(timeframe) {
    const unit = timeframe.slice(-1);
    const value = parseInt(timeframe.slice(0, -1), 10);
    switch (unit) {
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      default: return 60 * 1000; // Default to 1 minute
    }
  }

  /**
   * Returns the current EMA value without processing a new tick.
   * @returns {number|null} - Current EMA value, or null if not enough data
   */
  getCurrentEMA() {
    return this.ema;
  }
}