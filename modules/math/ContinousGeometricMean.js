export class ContinuousGeometricMean {
  constructor() {
    this.logSum = 0;
    this.count = 0;
    this.compensation = 0; // Для алгоритма Кахана
  }

  add(value) {
    if (value <= 0) throw new Error("Value must be positive");
    const logValue = Math.log(value);
    const y = logValue - this.compensation; // Коррекция
    const t = this.logSum + y;
    this.compensation = (t - this.logSum) - y;
    this.logSum = t;
    this.count += 1;
  }

  getMean() {
    if (this.count === 0) return 0;
    return Math.exp(this.logSum / this.count);
  }

  reset() {
    this.logSum = 0;
    this.count = 0;
    this.compensation = 0;
  }
}