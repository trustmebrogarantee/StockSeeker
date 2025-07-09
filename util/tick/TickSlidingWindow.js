export class TickSlidingWindow {
  constructor(timeWindow = 1000, n = 5) {
    this.timeWindow = timeWindow
    this.timestampArray = []
    this.priceArray = []
    this.volumeArray = []
    this.n = n
    this.histogam = new Array(this.n).fill([0, 0, 0])
    this.priceMax = null
    this.priceMin = null
    this.isFirstTick = true
  }

  findMax() {
    let max = this.priceArray[0]
    for (let i = 0; i < this.priceArray.length; i++) if (this.priceArray[i] > max) max = this.priceArray[i]
    return max
  }

  findMin() {
    let min = this.priceArray[0]
    for (let i = 0; i < this.priceArray.length; i++) if (this.priceArray[i] < min) min = this.priceArray[i]
    return min
  }

  supplyHistogram(tick) {
    let levelSize = (this.priceMax - this.priceMin) / this.n
    let VOLUME_INDEX = 2
    let priceDelta = tick.price - this.priceMin
    let level = this.histogam[Math.max(Math.min(Math.floor(priceDelta / levelSize), this.n - 1), 0)]
    if (!level) return
    level[VOLUME_INDEX] += tick.qty
  }

  buildHistogram () {
    let levelSize = Math.max((this.priceMax - this.priceMin), 0.001) / this.n
    let VOLUME_INDEX = 2

    for (let i = 0; i < this.n; i++) {
      this.histogam[i] = [this.priceMin + levelSize * i, this.priceMin + levelSize * (i + 1), 0]
    }

    for (let i = 0; i < this.priceArray.length; i++) {
      let priceDelta = this.priceArray[i] - this.priceMin
      this.histogam[Math.max(Math.min(Math.floor(priceDelta / levelSize), this.n - 1), 0)][VOLUME_INDEX] += this.volumeArray[i] 
    }
  }

  processTick(tick) {
    this.timestampArray.push(tick.time)
    this.priceArray.push(tick.price)
    this.volumeArray.push(tick.qty)
    let maxChanged = false
    let minChanged = false
    
    if (this.isFirstTick) {
      this.priceMax = tick.price
      this.priceMin = tick.price
      this.buildHistogram()
    }
    
    this.isFirstTick = false

    while (tick.time - this.timestampArray[0] > this.timeWindow) {
      if (this.priceArray[0] === this.priceMax) maxChanged = true
      if (this.priceArray[0] === this.priceMin) minChanged = true
      this.timestampArray.shift()
      this.priceArray.shift()
      this.volumeArray.shift()
    }

    if (maxChanged) this.priceMax = this.findMax()
    if (minChanged) this.priceMin = this.findMin()
    if (maxChanged || minChanged) this.buildHistogram() 
    else this.supplyHistogram(tick)
  }

  getEdgeLevels() {
    return [this.histogam.at(1), this.histogam.at(3)]
  }

  isNormalDistribution() {
    return this.getNormalDistributionMatch() > 0.95 && (this.histogam.at(0)[2] + this.histogam.at(-1)[2]) < this.histogam.at(2)[2]
  }
 
  getNormalDistributionMatch() {
    const VOLUME_INDEX = 2;
    const volumes = this.histogam.map(level => level[VOLUME_INDEX]);
    const totalVolume = volumes.reduce((acc, vol) => acc + vol, 0);
    
    if (totalVolume === 0) return 0;

    // Normalize histogram to create empirical CDF
    let empiricalCDF = [];
    let cumulative = 0;
    for (let i = 0; i < this.n; i++) {
      cumulative += volumes[i] / totalVolume;
      empiricalCDF.push(cumulative);
    }

    // Calculate mean and standard deviation of prices
    let mean = 0;
    let count = 0;
    for (let i = 0; i < this.priceArray.length; i++) {
      mean += this.priceArray[i] * this.volumeArray[i];
      count += this.volumeArray[i];
    }
    mean /= count;

    let variance = 0;
    for (let i = 0; i < this.priceArray.length; i++) {
      variance += this.volumeArray[i] * (this.priceArray[i] - mean) ** 2;
    }
    variance /= count;
    const stdDev = Math.sqrt(variance) || 0.001; // Avoid division by zero

    // Calculate theoretical normal CDF for each bin
    const levelSize = (this.priceMax - this.priceMin) / this.n;
    let theoreticalCDF = [];
    for (let i = 0; i < this.n; i++) {
      const x = this.priceMin + levelSize * (i + 1);
      const z = (x - mean) / stdDev;
      // Approximation of the normal CDF using the error function
      const cdf = 0.5 * (1 + Math.tanh(z / Math.sqrt(2)));
      theoreticalCDF.push(cdf);
    }

    // Compute Kolmogorov-Smirnov statistic (max difference between CDFs)
    let maxDiff = 0;
    for (let i = 0; i < this.n; i++) {
      const diff = Math.abs(empiricalCDF[i] - theoreticalCDF[i]);
      maxDiff = Math.max(maxDiff, diff);
    }

    // Convert KS statistic to similarity score (0 to 1)
    // Lower maxDiff means better match, so we invert it
    return Math.max(0, 1 - maxDiff);
  }

  visualizeHistogram() {
    let VOLUME_INDEX = 2
    let visual = ''
    let totalVolume = this.histogam.reduce((acc, q) => acc + q[VOLUME_INDEX], 0)
    for (let level of this.histogam) {
      let max = 30
      const times = level[VOLUME_INDEX] / totalVolume
      visual += `${'█'.repeat(Math.floor(times * max))}${'-'.repeat(Math.floor(max - (times * max)))} (${level[0].toFixed(2)}-${level[1].toFixed(2)}) [${level[VOLUME_INDEX].toFixed(2)}]\n`
    }
    return visual
  }
}