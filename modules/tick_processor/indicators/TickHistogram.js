import { createSlidingWindow } from '@stdlib/utils';
import { mean } from '@stdlib/stats/base/mean';
import { variance } from '@stdlib/stats/base/variance';
import { round } from '@stdlib/math/base/special/round';
import { createCanvas } from 'canvas';
import fs from 'fs';

// Configuration
const TIME_WINDOW_MS = 60000; // 1 minute
const NUM_PRICE_LEVELS = 5; // Number of price levels
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Data structure to hold tick data and histogram
class TickHistogram {
  constructor() {
    this.window = createSlidingWindow(TIME_WINDOW_MS, { key: 'time' });
    this.histogram = new Map(); // Price level -> volume
  }

  // Process a new tick
  addTick(tick) {
    this.window.push(tick);
    this.updateHistogram();
  }

  // Update histogram based on current window
  updateHistogram() {
    this.histogram.clear();
    if (this.window.length === 0) return;

    // Get min and max prices
    const prices = Array.from(this.window).map(tick => tick.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    if (minPrice === maxPrice) return; // Avoid division by zero

    // Calculate price range and step
    const priceRange = maxPrice - minPrice;
    const priceLevelStep = priceRange / (NUM_PRICE_LEVELS - 1);
    
    // Determine precision based on price range
    const pricePrecision = Math.max(2, Math.ceil(-Math.log10(priceLevelStep)) + 1);
    const priceScale = Math.pow(10, pricePrecision);

    // Distribute volume to price levels
    for (const tick of this.window) {
      // Calculate which price level this tick belongs to
      const normalizedPrice = (tick.price - minPrice) / priceRange;
      const levelIndex = Math.round(normalizedPrice * (NUM_PRICE_LEVELS - 1));
      const priceLevel = round(minPrice + levelIndex * priceLevelStep, pricePrecision);
      
      const currentVolume = this.histogram.get(priceLevel) || 0;
      this.histogram.set(priceLevel, currentVolume + tick.qty);
    }
  }

  // Get current histogram as array of { price, volume }
  getHistogram() {
    return Array.from(this.histogram.entries())
      .map(([price, volume]) => ({ price, volume }))
      .sort((a, b) => a.price - b.price);
  }

  // Calculate similarity to normal distribution (0 to 1)
  normalityScore() {
    const histogram = this.getHistogram();
    if (histogram.length < 3) return 0; // Not enough data

    // Extract volumes
    const volumes = histogram.map(h => h.volume);

    // Calculate mean and standard deviation of volumes
    const mu = mean(volumes);
    const sigma = Math.sqrt(variance(volumes));

    if (sigma === 0) return 0; // No variation

    // Perform Anderson-Darling test approximation
    let adStatistic = 0;
    const n = volumes.length;

    for (let i = 0; i < n; i++) {
      const z = (volumes[i] - mu) / sigma;
      const cdf = 0.5 * (1 + Math.erf(z / Math.sqrt(2)));
      if (cdf === 0 || cdf === 1) continue;
      const term = (2 * i + 1) * Math.log(cdf) + (2 * (n - i) - 1) * Math.log(1 - cdf);
      adStatistic += term;
    }

    adStatistic = -n - adStatistic / n;

    // Convert AD statistic to similarity score (heuristic)
    const score = Math.exp(-adStatistic / 2);
    return Math.min(Math.max(score, 0), 1);
  }

  // Visualize histogram using Canvas and save as PNG
  visualizeHistogram() {
    const histogram = this.getHistogram();
    if (histogram.length === 0) {
      console.log('No data to visualize');
      return;
    }

    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Clear canvas with white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Set margins
    const margin = { top: 50, right: 50, bottom: 100, left: 100 };
    const width = CANVAS_WIDTH - margin.left - margin.right;
    const height = CANVAS_HEIGHT - margin.top - margin.bottom;

    // Get data ranges
    const prices = histogram.map(h => h.price);
    const volumes = histogram.map(h => h.volume);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const maxVolume = Math.max(...volumes, 1); // Avoid division by zero

    // Draw bars
    const barWidth = width / histogram.length * 0.8;
    ctx.fillStyle = 'blue';

    histogram.forEach((data, i) => {
      const x = margin.left + i * (width / histogram.length);
      const barHeight = (data.volume / maxVolume) * height;
      const y = CANVAS_HEIGHT - margin.bottom - barHeight;
      ctx.fillRect(x, y, barWidth, barHeight);
    });

    // Draw axes
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, CANVAS_HEIGHT - margin.bottom);
    ctx.lineTo(CANVAS_WIDTH - margin.right, CANVAS_HEIGHT - margin.bottom);
    ctx.stroke();

    // Draw labels
    ctx.fillStyle = 'black';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Price Levels Histogram', CANVAS_WIDTH / 2, margin.top / 2);
    ctx.textAlign = 'right';
    ctx.fillText('Volume', margin.left / 2, margin.top + height / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Price', CANVAS_WIDTH / 2, margin.top + height + margin.bottom / 2);

    // Draw price ticks (show min and max prices)
    ctx.font = '12px Arial';
    ctx.fillText(minPrice.toFixed(2), margin.left, CANVAS_HEIGHT - margin.bottom + 20);
    ctx.fillText(maxPrice.toFixed(2), CANVAS_WIDTH - margin.right, CANVAS_HEIGHT - margin.bottom + 20);

    // Draw volume ticks (show max volume)
    ctx.textAlign = 'right';
    ctx.fillText(maxVolume.toFixed(2), margin.left - 10, margin.top + 10);

    // Save to PNG
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync('histogram.png', buffer);
    console.log('Histogram visualization saved to histogram.png');
  }
}

// Example usage
async function main() {
  const histogram = new TickHistogram();

  // Simulate tick data
  const simulateTick = () => ({
    time: Date.now(),
    qty: Math.random() * 10,
    quoteQty: Math.random() * 100,
    price: 50000 + (Math.random() - 0.5) * 1000,
    isBuyerMaker: Math.random() > 0.5
  });

  // Add ticks at intervals
  const interval = setInterval(() => {
    histogram.addTick(simulateTick());
    const histData = histogram.getHistogram();
    const normality = histogram.normalityScore();
    console.log('Histogram:', histData.slice(0, 5), '...');
    console.log('Normality Score:', normality.toFixed(4));
    histogram.visualizeHistogram();
  }, 1000);

  // Stop after 10 seconds
  setTimeout(() => clearInterval(interval), 10000);
}

if (import.meta.url === new URL(import.meta.url).href) {
  main();
}

export { TickHistogram };