export class HighLow {
  constructor(volatility, window = 100) {
    this.volatility = volatility;
    this.window = window;
    this.highs = [];
    this.lows = [];
    this.threshold = 0;
    this.highExtremum = [];
    this.lowExtremum = [];
    this.latestHighExtremum = null;
    this.latestLowExtremum = null;
  }

  processCandle(candle) {
    const highItem = { delta: Math.abs(candle.high - this.volatility.sma), value: candle.high, index: candle.id, time: candle.time };
    const lowItem = { delta: Math.abs(candle.low - this.volatility.sma), value: candle.low, index: candle.id, time: candle.time };

    if (highItem.value > this.volatility.sma && highItem.value - candle.open > this.volatility.stdDev * 2) {
      this.highs.push(highItem);
      this.latestHighExtremum = highItem
    }

    if (lowItem.value < this.volatility.sma && candle.open - lowItem.value > this.volatility.stdDev * 2) {
      this.lows.push(lowItem);
      this.latestLowExtremum = lowItem
    }
   
  }

  rebuildHeap(k) {
    const allItems = [...this.highs, ...this.lows];
    allItems.sort((a, b) => b.delta - a.delta);
    this.heap = new MinHeap((a, b) => a.delta - b.delta);
    const topItems = allItems.slice(0, k);
    topItems.forEach(item => this.heap.push(item));
  }

  getLatestHighExtremum() {
    return this.latestHighExtremum;
  }

  getLatestLowExtremum() {
    return this.latestLowExtremum;
  }

  getAllTopItems() {
    return 
  }

  getHistoricalTopItems() {
    return 
  }
}