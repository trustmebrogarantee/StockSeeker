export class RSI {
  constructor(period = 14) {
    this.period = period;
    this.gains = [];
    this.losses = [];
    this.avgGain = 0;
    this.avgLoss = 0;
    this.previousPrice = null;
  }

  /**
   * Processes a new tick and updates the RSI.
   * @param {Object} tick - Tick data with { qty: number, quoteQty: number, time: number, price: number }
   * @returns {number|null} - Current RSI value, or null if not enough data
   */
  processTick(tick) {
    const price = tick.price;

    // Skip first price (no change to calculate)
    if (this.previousPrice === null) {
      this.previousPrice = price;
      return null;
    }

    // Calculate price change
    const change = price - this.previousPrice;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    this.gains.push(gain);
    this.losses.push(loss);

    // Update previous price
    this.previousPrice = price;

    // If enough data, calculate RSI
    if (this.gains.length > this.period) {
      this.gains.shift();
      this.losses.shift();

      if (this.gains.length === this.period) {
        // Initial average gain/loss
        this.avgGain = this.gains.reduce((sum, g) => sum + g, 0) / this.period;
        this.avgLoss = this.losses.reduce((sum, l) => sum + l, 0) / this.period;
      } else {
        // Wilder's smoothing: (previous avg * (period-1) + current) / period
        this.avgGain = (this.avgGain * (this.period - 1) + gain) / this.period;
        this.avgLoss = (this.avgLoss * (this.period - 1) + loss) / this.period;
      }

      // Calculate RS and RSI
      const rs = this.avgLoss === 0 ? Infinity : this.avgGain / this.avgLoss;
      return 100 - (100 / (1 + rs));
    }

    return null;
  }

  /**
   * Returns the current RSI value without processing a new tick.
   * @returns {number|null} - Current RSI value, or null if not enough data
   */
  getCurrentRSI() {
    if (this.gains.length < this.period) return null;
    const rs = this.avgLoss === 0 ? Infinity : this.avgGain / this.avgLoss;
    return 100 - (100 / (1 + rs));
  }
}