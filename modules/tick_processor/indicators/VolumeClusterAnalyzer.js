export class VolumeClusterAnalyzer {
  constructor(config = {}) {
    // Configuration parameters
    this.priceBinSize = config.priceBinSize || 0.01; // Price bin size (e.g., 0.01 for crypto)
    this.maxBins = config.maxBins || 1000; // Maximum number of price bins to store
    this.windowSizeMs = config.windowSizeMs || 60 * 60 * 1000; // Time window (e.g., 1 hour)
    this.minVolumeThreshold = config.minVolumeThreshold || 100; // Minimum volume for clusters
    this.maxBufferSize = config.maxBufferSize || 100; // Max ticks in buffer for extremum detection

    // Internal state
    this.priceVolumeMap = new Map(); // { binPrice: { volume, quoteVolume } }
    this.tickBuffer = new Array(this.maxBufferSize).fill(null); // Circular buffer
    this.bufferIndex = 0; // Current index in circular buffer
    this.bufferCount = 0; // Number of ticks in buffer
    this.minPrice = Infinity; // Min price in window
    this.maxPrice = -Infinity; // Max price in window
    this.minPriceTime = 0; // Time of min price
    this.maxPriceTime = 0; // Time of max price
    this.lastTime = 0; // Last tick time
    this.binAccessOrder = []; // Track bin access for LRU pruning
  }

  // Process a single tick
  processTick(tick) {
    const { qty, quoteQty, price, time } = tick;

    // Update price bin volume
    this.updatePriceVolume(price, qty, quoteQty);

    // Update tick buffer and extremums
    this.updateTickBuffer(price, time);

    // Prune old data
    this.pruneOldData();

    // Detect extremum clusters
    return this.detectExtremumClusters();
  }

  // Update volume for a price bin
  updatePriceVolume(price, qty, quoteQty) {
    const binPrice = Math.floor(price / this.priceBinSize) * this.priceBinSize;
    const current = this.priceVolumeMap.get(binPrice) || { volume: 0, quoteVolume: 0 };
    current.volume += qty;
    current.quoteVolume += quoteQty;
    this.priceVolumeMap.set(binPrice, current);

    // Update bin access order for LRU
    this.binAccessOrder = this.binAccessOrder.filter(p => p !== binPrice);
    this.binAccessOrder.push(binPrice);

    // Prune excess bins if over limit
    if (this.priceVolumeMap.size > this.maxBins) {
      const oldestBin = this.binAccessOrder.shift();
      this.priceVolumeMap.delete(oldestBin);
    }
  }

  // Update tick buffer and track min/max prices
  updateTickBuffer(price, time) {
    this.lastTime = Math.max(this.lastTime, time);

    // Store only price and time in buffer
    this.tickBuffer[this.bufferIndex] = { price, time };
    this.bufferIndex = (this.bufferIndex + 1) % this.maxBufferSize;
    this.bufferCount = Math.min(this.bufferCount + 1, this.maxBufferSize);

    // Update min/max prices
    if (price < this.minPrice || time - this.minPriceTime > this.windowSizeMs) {
      this.minPrice = price;
      this.minPriceTime = time;
    }
    if (price > this.maxPrice || time - this.maxPriceTime > this.windowSizeMs) {
      this.maxPrice = price;
      this.maxPriceTime = time;
    }
  }

  // Prune old ticks and low-volume bins
  pruneOldData() {
    const timeThreshold = this.lastTime - this.windowSizeMs;

    // Prune old ticks from buffer
    for (let i = 0; i < this.bufferCount; i++) {
      const index = (this.bufferIndex - this.bufferCount + i + this.maxBufferSize) % this.maxBufferSize;
      const tick = this.tickBuffer[index];
      if (tick && tick.time < timeThreshold) {
        this.tickBuffer[index] = null;
        this.bufferCount--;
      }
    }

    // Prune low-volume bins
    for (const [binPrice, data] of this.priceVolumeMap) {
      if (data.volume < this.minVolumeThreshold) {
        this.priceVolumeMap.delete(binPrice);
        this.binAccessOrder = this.binAccessOrder.filter(p => p !== binPrice);
      }
    }

    // Recalculate min/max if needed
    if (this.bufferCount === 0 || this.lastTime - this.minPriceTime > this.windowSizeMs) {
      this.minPrice = Infinity;
      this.minPriceTime = 0;
    }
    if (this.bufferCount === 0 || this.lastTime - this.maxPriceTime > this.windowSizeMs) {
      this.maxPrice = -Infinity;
      this.maxPriceTime = 0;
    }
    for (let i = 0; i < this.bufferCount; i++) {
      const index = (this.bufferIndex - this.bufferCount + i + this.maxBufferSize) % this.maxBufferSize;
      const tick = this.tickBuffer[index];
      if (tick && tick.time >= timeThreshold) {
        this.minPrice = Math.min(this.minPrice, tick.price);
        this.maxPrice = Math.max(this.maxPrice, tick.price);
        if (this.minPrice === tick.price) this.minPriceTime = tick.time;
        if (this.maxPrice === tick.price) this.maxPriceTime = tick.time;
      }
    }
  }

  // Detect volume clusters at extremum prices
  detectExtremumClusters() {
    const clusters = [];

    // Check volume at min price
    if (this.minPrice !== Infinity && this.minPriceTime > this.lastTime - this.windowSizeMs) {
      const binPrice = Math.floor(this.minPrice / this.priceBinSize) * this.priceBinSize;
      const volumeData = this.priceVolumeMap.get(binPrice);
      if (volumeData && volumeData.volume >= this.minVolumeThreshold) {
        clusters.push({
          price: binPrice,
          volume: volumeData.volume,
          quoteVolume: volumeData.quoteVolume,
          type: 'low',
          time: this.minPriceTime
        });
      }
    }

    // Check volume at max price
    if (this.maxPrice !== -Infinity && this.maxPriceTime > this.lastTime - this.windowSizeMs) {
      const binPrice = Math.floor(this.maxPrice / this.priceBinSize) * this.priceBinSize;
      const volumeData = this.priceVolumeMap.get(binPrice);
      if (volumeData && volumeData.volume >= this.minVolumeThreshold) {
        clusters.push({
          price: binPrice,
          volume: volumeData.volume,
          quoteVolume: volumeData.quoteVolume,
          type: 'high',
          time: this.maxPriceTime
        });
      }
    }

    return clusters;
  }
}