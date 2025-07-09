export class VolumeSMA {
  constructor(period) {
    this.period = period;
    this.volumeQueue = []; // Stores volume values
    this.sum = 0; // Running sum of volumes
  }

  /**
   * Processes a new tick and updates the SMA.
   * @param {Object} tick - Tick data with { qty: number, quoteQty: number, time: number, price: number }
   * @returns {number|null} - Current SMA value, or null if not enough data
   */
  processTick(tick) {
    // Use qty as the volume metric
    const volume = tick.qty;

    // Add new volume to queue and update sum
    this.volumeQueue.push(volume);
    this.sum += volume;

    // If queue exceeds period, remove oldest volume
    if (this.volumeQueue.length > this.period) {
      const oldestVolume = this.volumeQueue.shift();
      this.sum -= oldestVolume;
    }

    // Return SMA if enough data points are available
    if (this.volumeQueue.length === this.period) {
      return this.sum / this.period;
    }

    // Return null if not enough data for SMA
    return null;
  }

  /**
   * Returns the current SMA value without processing a new tick.
   * @returns {number|null} - Current SMA value, or null if not enough data
   */
  getCurrentSMA() {
    if (this.volumeQueue.length === this.period) {
      return this.sum / this.period;
    }
    return null;
  }
}