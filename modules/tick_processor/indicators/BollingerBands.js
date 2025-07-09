export class BollingerBands {
  constructor(period = 20, stdDev = 2) {
      this.period = period;
      this.stdDev = stdDev;
      this.prices = [];
      this.isTickBelowMiddle = false;
      this.values = {
          upper: [],
          middle: [],
          lower: []
      };
      this.bands = {
        time: 0,
        upper: 0,
        middle: 0,
        lower: 0
      }
  }

  // Calculate Simple Moving Average (SMA) for the last period
  calculateSMA() {
      if (this.prices.length < this.period) return null;
      const slice = this.prices.slice(-this.period);
      return slice.reduce((sum, val) => sum + val, 0) / this.period;
  }

  // Calculate Standard Deviation for the last period
  calculateStdDev(sma) {
      if (this.prices.length < this.period) return null;
      const slice = this.prices.slice(-this.period);
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / this.period;
      return Math.sqrt(variance);
  }

  // Process a new tick and update bands
  processTick(tick) {
      // Add new price to the prices array
      this.prices.push(tick.price);

      // Maintain sliding window
      if (this.prices.length > this.period) {
          this.prices.shift();
      }

      // Calculate bands only if we have enough data
      if (this.prices.length < this.period) {
          this.isTickBelowMiddle = false;
          return null;
      }

      // Calculate SMA (middle band)
      const sma = this.calculateSMA();
      if (!sma) {
          this.isTickBelowMiddle = false;
          return null;
      }

      // Calculate Standard Deviation
      const stdDev = this.calculateStdDev(sma);
      if (!stdDev) {
          this.isTickBelowMiddle = false;
          return null;
      }

      // Update isTickBelowMiddle
      this.isTickBelowMiddle = tick.price < sma;

      // Calculate bands
      const deviation = stdDev * this.stdDev;
      this.bands.time = tick.time,
      this.bands.upper = sma + deviation,
      this.bands.middle = sma,
      this.bands.lower = sma - deviation

      // Update values history
      this.values.upper.push(this.bands.upper);
      this.values.middle.push(this.bands.middle);
      this.values.lower.push(this.bands.lower);
  }

  // Get current values
  getValues() {
      return this.values;
  }

  // Clear stored data
  reset() {
      this.prices = [];
      this.isTickBelowMiddle = false;
      this.values = {
          upper: [],
          middle: [],
          lower: []
      };
  }
}