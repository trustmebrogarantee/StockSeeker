export class AvgTickCount {
  constructor(period = 20) {
    this.period = period;
    this.tickCountHistory = [];
    this.avgTickCount = 0;
  }

  processCandle(candle) {
    if (!candle || typeof candle.ticks !== 'number') {
      return; // Skip if candle or ticks is missing/invalid
    }

    this.tickCountHistory.push(candle.ticks);
    if (this.tickCountHistory.length > this.period) {
      this.tickCountHistory.shift(); // Remove oldest tick count
    }

    this.avgTickCount = this.tickCountHistory.reduce((sum, count) => sum + count, 0) / Math.min(this.tickCountHistory.length, this.period);
  }

  getAvgTickCount() {
    return this.avgTickCount;
  }
}