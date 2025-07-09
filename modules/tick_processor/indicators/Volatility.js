export class Volatility {
  constructor(smaPeriod = 14) {
    this.candles = [];
    this.smaList = [];
    this.stdDevList = [];
    this.smaSum = 0;
    this.squaredDevSum = 0;
    this.smaPeriod = smaPeriod;
    this.sma = 0;
    this.stdDev = 0;
    this.smaDivider = 1;
    this.count = 0;
  }

  processCandle(candle) {
    this.candles.push(candle);
    this.count = Math.max(1, Math.min(this.candles.length, this.smaPeriod));
    this.smaDivider = this.count * 2;

    const avgPrice = (candle.high + candle.low) / 2;

    if (this.candles.length <= this.smaPeriod) {
      this.smaSum += candle.high + candle.low;
    } else {
      const subtractCandle = this.candles[this.candles.length - (this.smaPeriod + 1)];
      const addCandle = this.candles.at(-1);
      this.smaSum = this.smaSum - (subtractCandle.high + subtractCandle.low) + (addCandle.high + addCandle.low);
    }
    
    this.sma = this.smaSum / this.smaDivider;
    this.smaList.push(this.sma);

    if (this.candles.length <= this.smaPeriod) {
      this.squaredDevSum += Math.pow(avgPrice - this.sma, 2);
    } else {
      const oldestCandle = this.candles[this.candles.length - (this.smaPeriod + 1)];
      const oldestAvgPrice = (oldestCandle.high + oldestCandle.low) / 2;
      const prevSma = this.smaList[this.smaList.length - 2];
      this.squaredDevSum -= Math.pow(oldestAvgPrice - prevSma, 2);
      this.squaredDevSum += Math.pow(avgPrice - this.sma, 2);
    }

    // Use absolute value to prevent negative variance and add epsilon for stability
    const epsilon = 1e-10;
    const variance = (Math.abs(this.squaredDevSum) + epsilon) / this.count;
    this.stdDev = Math.sqrt(variance);
    this.stdDevList.push(this.stdDev);
  }
}