export class ExtremumDetector {
  constructor(threshold = 1, callback = null) {
    this.threshold = threshold; // Lookback window size
    this.callback = callback; // Callback to emit extrema
    this.buffer = []; // Sliding window of prices
  }

  // Process a new tick { price: number }
  processTick({ price, time }) {
    this.buffer.push(price);

    // Trim buffer to maintain window size (2 * threshold + 1)
    const windowSize = 2 * this.threshold + 1;
    if (this.buffer.length > windowSize) {
      this.buffer.shift();
    }

    // Evaluate extrema if enough data
    if (this.buffer.length >= this.threshold + 1) {
      this.evaluateExtrema(price, time);
    }
  }

  // Evaluate if the current price is a minimum or maximum
  evaluateExtrema(currentPrice, time) {
    // Compare with all prices in the buffer
    let isMinima = true;
    let isMaxima = true;

    for (const pastPrice of this.buffer) {
      if (pastPrice === currentPrice) continue; // Skip current price
      if (pastPrice <= currentPrice) isMinima = false; // Not a minimum
      if (pastPrice >= currentPrice) isMaxima = false; // Not a maximum
      if (!isMinima && !isMaxima) break; // Early exit
    }

    // Emit extrema via callback
    if (isMinima && this.callback) {
      this.callback({ type: 'minima', price: currentPrice, time });
    } else if (isMaxima && this.callback) {
      this.callback({ type: 'maxima', price: currentPrice, time });
    } else if (this.callback) {
      this.callback({ type: 'regular', price: currentPrice, time });
    }
  }

  // Reset the detector
  reset() {
    this.buffer = [];
  }
}