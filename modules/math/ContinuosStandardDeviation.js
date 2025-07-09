export class SD_1 {
  constructor() {
      this.count = 0;
      this.mean = 0;
      this.sumOfSquares = 0; // For sum of x_i^2
      this.sum = 0; // For sum of x_i
  }

  // Add a new data point and update stats
  add(value) {
      this.count++;
      this.sum += value;
      this.sumOfSquares += value * value;

      // Update mean incrementally
      this.mean = this.sum / this.count;

      return this;
  }

  // Get the current standard deviation
  standardDeviation() {
      if (this.count === 0) return 0;
      // SD = sqrt((sum of x_i^2 / N) - (mean)^2)
      return Math.sqrt(this.sumOfSquares / this.count - this.mean * this.mean);
  }

  // Get the current mean
  getMean() {
      return this.mean;
  }
}

export class SD_2 {
  constructor() {
      this.count = 0;
      this.mean = 0;
      this.sumOfSquares = 0;
      this.sum = 0;
  }

  add(value) {
      this.count++;
      this.sum += value;
      this.sumOfSquares += value * value;
      this.mean = this.sum / this.count;
      return this;
  }

  standardDeviation() {
      if (this.count <= 1) return 0; // Для выборки нужно как минимум 2 значения
      return Math.sqrt(this.sumOfSquares / this.count - this.mean * this.mean) * Math.sqrt(this.count / (this.count - 1));
  }

  getMean() {
      return this.mean;
  }
}