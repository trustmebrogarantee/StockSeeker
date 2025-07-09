export class VolumeProfile {
  constructor(
    tickSize = 0.1,
    valueAreaPercent = 0.8,
    periodMs = 24 * 60 * 60 * 1000,
    windowSize = null,
    minValueAreaTicks = 500,
    minVolumeThreshold = 1000,
    minLowerTicks = 1 // Ensure at least 1 tick below VPOC for VAL
  ) {
    this.tickSize = tickSize;
    this.valueAreaPercent = valueAreaPercent;
    this.periodMs = periodMs;
    this.windowSize = windowSize;
    this.minValueAreaTicks = minValueAreaTicks;
    this.minVolumeThreshold = minVolumeThreshold;
    this.minLowerTicks = minLowerTicks;
    this.volumeProfile = new Map();
    this.currentPeriodStart = null;
    this.tickCount = 0;
    this.totalVolume = 0;
    this.vpocPrice = 0;
    this.vpocVolume = 0;
    this.pricesSorted = false;
    this.prices = null;
  }

  // Process a single tick and return indicators
  processTick(tick) {
    const tradeTime = parseInt(tick.time);
    const price = Math.round(parseFloat(tick.price) / this.tickSize) * this.tickSize;
    const volume = parseFloat(tick.qty);

    // Check for new period or window slide
    if (this.windowSize) {
      if (this.tickCount >= this.windowSize) {
        this._resetProfile();
      }
      this.tickCount++;
    } else if (!this.currentPeriodStart || tradeTime >= this.currentPeriodStart + this.periodMs) {
      this._resetProfile();
      this.currentPeriodStart = tradeTime - (tradeTime % this.periodMs);
    }

    // Update volume profile
    const currentVolume = (this.volumeProfile.get(price) || 0) + volume;
    this.volumeProfile.set(price, currentVolume);
    this.totalVolume += volume;

    // Update VPOC incrementally
    if (currentVolume > this.vpocVolume) {
      this.vpocPrice = price;
      this.vpocVolume = currentVolume;
    } else if (price === this.vpocPrice && currentVolume < this.vpocVolume) {
      this._recalculateVPOC();
    }

    // Invalidate cached prices
    if (!this.pricesSorted) {
      this.prices = null;
    }

    // Return indicators if volume threshold is met
    if (this.totalVolume >= this.minVolumeThreshold) {
      return this._calculateIndicators();
    }
    return { vpoc: 0, vah: 0, val: 0, totalVolume: this.totalVolume };
  }

  // Reset volume profile
  _resetProfile() {
    this.volumeProfile.clear();
    this.totalVolume = 0;
    this.vpocPrice = 0;
    this.vpocVolume = 0;
    this.tickCount = 0;
    this.pricesSorted = false;
    this.prices = null;
  }

  // Recalculate VPOC
  _recalculateVPOC() {
    this.vpocPrice = 0;
    this.vpocVolume = 0;
    for (const [price, volume] of this.volumeProfile) {
      if (volume > this.vpocVolume) {
        this.vpocVolume = volume;
        this.vpocPrice = price;
      }
    }
  }

  // Calculate VPOC, VAH, and VAL
  _calculateIndicators() {
    if (this.volumeProfile.size === 0 || this.totalVolume < this.minVolumeThreshold) {
      return { vpoc: 0, vah: 0, val: 0, totalVolume: this.totalVolume };
    }

    // Sort prices only if needed
    if (!this.pricesSorted || !this.prices) {
      this.prices = [];
      for (const price of this.volumeProfile.keys()) {
        this.prices.push(price);
      }
      this.prices.sort((a, b) => a - b);
      this.pricesSorted = true;
    }

    // Check for sufficient lower price levels
    const vpocIndex = this.prices.indexOf(this.vpocPrice);
    if (vpocIndex < this.minLowerTicks) {
      // Not enough lower prices for a valid VAL
      return { vpoc: this.vpocPrice, vah: this.vpocPrice, val: this.vpocPrice, totalVolume: this.totalVolume };
    }

    // Calculate value area with balanced expansion
    const targetVolume = this.totalVolume * this.valueAreaPercent;
    let currentVolume = this.vpocVolume;
    let lowerIndex = vpocIndex - 1;
    let upperIndex = vpocIndex + 1;
    let vah = this.vpocPrice;
    let val = this.vpocPrice;
    let ticksCovered = 0;
    let lowerTicks = 0;

    // Expand value area, ensuring at least minLowerTicks below VPOC
    while (
      (currentVolume < targetVolume || ticksCovered < this.minValueAreaTicks || lowerTicks < this.minLowerTicks) &&
      (lowerIndex >= 0 || upperIndex < this.prices.length)
    ) {
      const lowerVolume = lowerIndex >= 0 ? this.volumeProfile.get(this.prices[lowerIndex]) : 0;
      const upperVolume = upperIndex < this.prices.length ? this.volumeProfile.get(this.prices[upperIndex]) : 0;

      // Prioritize lower prices to ensure VAL moves below VPOC
      if (lowerIndex >= 0 && (lowerTicks < this.minLowerTicks || lowerVolume > upperVolume || upperIndex >= this.prices.length)) {
        currentVolume += lowerVolume;
        val = this.prices[lowerIndex];
        lowerIndex--;
        lowerTicks++;
        ticksCovered = Math.round((vah - val) / this.tickSize);
      } else if (upperIndex < this.prices.length) {
        currentVolume += upperVolume;
        vah = this.prices[upperIndex];
        upperIndex++;
        ticksCovered = Math.round((vah - val) / this.tickSize);
      } else if (lowerIndex >= 0) {
        currentVolume += lowerVolume;
        val = this.prices[lowerIndex];
        lowerIndex--;
        lowerTicks++;
        ticksCovered = Math.round((vah - val) / this.tickSize);
      }
    }

    return {
      vpoc: this.vpocPrice,
      vah: vah,
      val: val,
      totalVolume: this.totalVolume
    };
  }
}