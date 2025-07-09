export class KnifeDetector {
  constructor(windowSizeSeconds = 60 * 1, priceDropThreshold = 0.03, minTicks = 5) {
    this.windowSizeSeconds = windowSizeSeconds; // Time window in seconds
    this.priceDropThreshold = priceDropThreshold; // Minimum % drop to consider a knife (e.g., 5%)
    this.minTicks = minTicks; // Minimum ticks in window to evaluate
    this.earliestTick = null; // Earliest tick in the window
    this.latestTick = null; // Latest tick in the window
    this.tickCount = 0; // Count ticks to ensure minTicks requirement
  }

  // Process a single tick and return boolean
  processTick(tick) {
    const { time, price } = tick;

    // Initialize or update ticks
    if (!this.earliestTick) {
      this.earliestTick = { time, price };
      this.latestTick = { time, price };
      this.tickCount = 1;
      return false;
    }

    // Update latest tick
    this.latestTick = { time, price };
    this.tickCount++;

    // Check if earliest tick is outside the time window
    const timeThreshold = time - this.windowSizeSeconds * 1000;
    if (this.earliestTick.time < timeThreshold) {
      // Reset to latest tick as the new earliest
      this.earliestTick = { time, price };
      this.tickCount = 1;
      return false;
    }

    // Only evaluate if enough ticks
    if (this.tickCount < this.minTicks) {
      return false;
    }

    // Calculate price drop
    const priceChangePercent = (this.earliestTick.price - this.latestTick.price) / this.earliestTick.price;

    // Return true if price drop exceeds threshold
    return priceChangePercent >= this.priceDropThreshold;
  }

  // Reset the detector
  reset() {
    this.earliestTick = null;
    this.latestTick = null;
    this.tickCount = 0;
  }
}
