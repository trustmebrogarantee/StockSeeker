import { createCanvas } from 'canvas';
import { differenceInDays, differenceInHours, format } from 'date-fns';
import { CONFIG } from '../config.js';
import { Indication } from '../IndicationManager.js';

function generateRoundedYAxisPoints (min, max, _significanceModifier = 1, _stepModifier = 1) {
  const Significance = Math.floor(Math.log10(max - min) - _significanceModifier) * -1
  const Perc = 0.0;
  const Rng = max - min;
  const YMax = Math.ceil((max + (Rng * Perc)) * Math.pow(10, Significance)) / Math.pow(10, Significance);
  const YMin = Math.floor((min - (Rng * Perc)) * Math.pow(10, Significance)) / Math.pow(10, Significance);
  let step =  Math.pow(10, Math.abs(Significance)) * _stepModifier
  let lastItem = YMax
  let items = []
  while (lastItem >= YMin) {
    items.push(lastItem)
    lastItem -= step
  }
  let maxItems = 20
  if (items.length > maxItems) return generateRoundedYAxisPoints(min, max, _significanceModifier, _stepModifier * 2)
  else return items
}

function drawStatistics (ctx, x, y, statistics) {
  const rowHeight = 24
  const padding = 4
  const n = Object.keys(statistics).length - 1

  const width = 320
  const height = n * rowHeight

  const actualWidth = width + padding * 2
  const actualHeight = height + n * (padding)

  const borderColor = '#000'
  const bgColor = '#fff'

  ctx.strokeStyle = borderColor
  ctx.fillRect(x, y, actualWidth, actualHeight)
  ctx.fill()
  
  ctx.fillStyle = bgColor
  ctx.fillRect(x + 0.5, y + 0.5, actualWidth - 1, actualHeight - 1)
  ctx.fill()

  ctx.lineWidth = 0.5
  ctx.strokeStyle - borderColor
  ctx.beginPath();
  ctx.moveTo(x + actualWidth / 2 - 1, y)
  ctx.lineTo(x + actualWidth / 2 - 1, y + actualHeight)
  ctx.stroke()
  ctx.closePath()


  Object.entries(statistics).forEach(([key, value], index) => {
    ctx.fillStyle = '#000000';
    ctx.font = '16px Arial';
    ctx.textAlign = 'left';
    let p = index === 0 ? 0 : padding
    ctx.fillText(key, x + padding, y + rowHeight * index + p + 20)
    ctx.fillText(value, x + width / 2 + padding * 2, y + rowHeight * index + p + 20)
    ctx.fill()

    if (index !== n) {
      ctx.fillStyle = borderColor
      ctx.lineWidth = 0.5
      ctx.strokeStyle - borderColor
      ctx.beginPath();
      ctx.moveTo(x, y + index * rowHeight + p + padding + 22)
      ctx.lineTo(x + actualWidth, y + index * rowHeight + p + padding + 22)
      ctx.stroke()
      ctx.closePath()
    }
  })

  return { width: actualWidth, height: actualHeight }
}

const minimum = (list) => {
  let minimum = list[0]
  for (const value of list) if (value < minimum) minimum = value
  return minimum
}

const maximum = (list) => {
  let maximum = list[0]
  for (const value of list) if (value > maximum) maximum = value
  return maximum
}

// Function to generate a PNG candlestick chart
export function generatePNGChart(title, { indications, candles, statistics }) {
  // Map candles to the expected format
  const candlestickData = candles.map(c => ({
    x: c.time,
    o: c.open,
    c: c.close,
    l: c.low,
    h: c.high,
    sd: c.indicators.standardDeviation,
    sot: c.ticks,
    deltaDivergence: c.indicators.deltaDivergence
  }));

  // Canvas dimensions
  const width = 26400;
  const height = 4400;
  const padding = 100; // Padding for axes and labels

  
  // Create the canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Chart dimensions (excluding padding)
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding;

  // Calculate min/max for scaling with a buffer
  const prices = candlestickData.flatMap(d => [d.o, d.h, d.l, d.c]);
  const minPriceRaw = minimum(prices)
  const maxPriceRaw = maximum(prices)

  // Add a 10% buffer to the price range to prevent overflow
  const priceBuffer = (maxPriceRaw - minPriceRaw) * 0.1;
  const minPrice = Math.floor(minPriceRaw - priceBuffer); // Round down to nearest integer
  const maxPrice = Math.ceil(maxPriceRaw + priceBuffer); // Round up to nearest integer
  const priceRange = maxPrice - minPrice;

  // Round price step to a nice interval (e.g., 1.0 or 0.5)
  const numPriceSteps = 5; // Number of grid lines
  const rawPriceStep = priceRange / numPriceSteps;
  const priceStep = Math.ceil(rawPriceStep * 2) / 2; // Round to nearest 0.5

  const timestamps = candlestickData.map(d => d.x);
  const minTime = minimum(timestamps);
  const maxTime = maximum(timestamps);
  const timeRange = maxTime - minTime;

  // Scale functions
  const priceToY = (price) => {
    const normalized = (price - minPrice) / priceRange;
    return padding + chartHeight * (1 - normalized);
  };

  const timeToX = (time) => {
    const normalized = (time - minTime) / timeRange;
    return padding + chartWidth * normalized;
  };

  // Colors
  const upColor = 'rgba(26, 152, 129, 1)'; // Green for rising
  const downColor = 'rgba(239, 57, 74, 1)'; // Red for falling
  const wickColor = '#000000'; // Black for wicks

  // Draw background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

 // Draw grid lines and labels (Y-axis: price)
 const priceSteps = generateRoundedYAxisPoints(minPrice, maxPrice) 
 
 for (const priceStep of priceSteps) {
   const y = priceToY(priceStep);

   if (y < chartHeight + padding && y > padding) {
     ctx.beginPath();
     ctx.strokeStyle = '#e0e0e0';
     ctx.lineWidth = 1;
     ctx.moveTo(padding, y);
     ctx.lineTo(width - padding, y);
     ctx.stroke();
  
     ctx.fillStyle = '#000000';
     ctx.font = '12px Arial';
     ctx.textAlign = 'right';
     ctx.fillText(priceStep.toFixed(0), padding - 30, y + 5); // Shifted labels further left
   }
 }


  // Draw grid lines and labels (X-axis: time)
  // Calculate pixel spacing per candle
  const candleCount = candlestickData.length;
  const pixelsPerCandle = chartWidth / (candleCount - 1);

  // Estimate label width (approximate, depends on font)
  const labelWidth = 60; // Approximate width of a label in pixels (e.g., "1/4 00:00")
  const minSpacing = labelWidth * 1.5; // Minimum spacing between labels to avoid overlap

  // Calculate how many candles between labels to achieve minimum spacing
  const candlesPerLabel = Math.ceil(minSpacing / pixelsPerCandle);

  // Determine if we should show days, hours, or minutes
  const totalDurationMs = maxTime - minTime;
  const totalDays = differenceInDays(maxTime, minTime);
  const totalHours = differenceInHours(maxTime, minTime);
  const candlesPerDay = (24 * 60) / 15; // 15-minute candles per day
  const candlesPerHour = 4; // 15-minute candles per hour
  let labelMode = 'days'; // Default to showing days
  let labelInterval = candlesPerDay; // Default interval: 1 day

  if (totalDays < 1) {
    // Less than 1 day of data: show minutes (every hour or so)
    labelMode = 'minutes';
    labelInterval = Math.max(candlesPerHour, candlesPerLabel); // At least every hour
  } else if (totalDays <= 3) {
    // 1-3 days of data: show hours (e.g., every 4 hours)
    labelMode = 'hours';
    labelInterval = Math.max(candlesPerHour * 4, candlesPerLabel); // Every 4 hours
  } else {
    // More than 3 days: show days, adjust frequency based on density
    labelInterval = Math.max(candlesPerDay, candlesPerLabel);
  }

  let nextLabelIndex = 0;
  let prevDay = null;
  candlestickData.forEach((data, i) => {
    const time = data.x;
    const x = timeToX(time);

    // Grid line (optional: skip some grid lines if too dense)
    if (i % Math.max(1, Math.floor(candlesPerLabel / 2)) === 0) {
      ctx.beginPath();
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
      ctx.stroke();
    }

    // X-axis label
    if (i >= nextLabelIndex) {
      // Convert timestamp to a Date object (assume UTC for consistency)
      const date = new Date(time)
      const day = date.getDate();
      let labelStr = '';

      if (labelMode === 'days') {
        // Show only date at the start of each day
        if (day !== prevDay) {
          labelStr = format(date, 'dd MMM');
        }
      } else if (labelMode === 'hours' || labelMode === 'minutes') {
        // Show date at the start of each day, otherwise show time
        if (day !== prevDay) {
          labelStr = format(date, 'd/M HH:mm');
        } else {
          labelStr = format(date, 'HH:mm');
        }
      }

      if (labelStr) {
        ctx.fillStyle = '#000000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(labelStr, x, height - padding + 20);
      }

      // Set the next index for label placement
      nextLabelIndex = i + labelInterval;
    }
  });

  // Draw axes
  ctx.beginPath();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();

  // Draw candlesticks
  const candleSpacing = chartWidth / (candlestickData.length - 1); // Space between candlesticks
  const candleWidth = candleSpacing * 0.3; // Reduced candle width for better spacing

  const drawIndication = (indication) => {
    const x = timeToX(indication.tick.time);
    const y = priceToY(indication.tick.price);
    Indication[indication.type].draw(ctx, x, y)
  }

  indications.filter(ind => ind.zIndex === CONFIG.view.chart.zIndex.underCandles).forEach(drawIndication)

  const standardDeviationPath = []
  const speedOfTapePath = []

  function inflect(x, threshold = 1) {
    // Helper function to create shifted arrays
    const shiftArray = (arr, n) => {
      if (n > 0) {
        return [...arr.slice(n), ...Array(n).fill(null)];
      } else {
        return [...Array(Math.abs(n)).fill(null), ...arr.slice(0, arr.length + n)];
      }
    };
  
    // Create up and down shifted arrays
    const up = Array.from({ length: threshold }, (_, i) => shiftArray(x, i + 1));
    const down = Array.from({ length: threshold }, (_, i) => shiftArray(x, -(i + 1)));
  
    // Combine original array with shifted arrays
    const a = x.map((val, i) => [
      val,
      ...up.map(arr => arr[i]),
      ...down.map(arr => arr[i])
    ]);
  
    // Find minima and maxima
    const minima = a
      .map((row, i) => {
        const validValues = row.filter(v => v !== null);
        return validValues.length > 0 && Math.min(...validValues) === row[0] ? i : -1;
      })
      .filter(i => i !== -1);
  
    const maxima = a
      .map((row, i) => {
        const validValues = row.filter(v => v !== null);
        return validValues.length > 0 && Math.max(...validValues) === row[0] ? i : -1;
      })
      .filter(i => i !== -1);
  
    return { minima, maxima };
  }

  // const { maxima } = inflect(candlestickData.flatMap(c => [c.h]), 10)
  // const { minima } = inflect(candlestickData.flatMap(c => [c.l]), 10)

  candlestickData.forEach((data, i) => {
    const x = timeToX(data.x);
    const openY = priceToY(data.o);
    const closeY = priceToY(data.c);
    const highY = priceToY(data.h);
    const lowY = priceToY(data.l);
    const isRising = data.c >= data.o;


    // Draw wick
    ctx.beginPath();
    ctx.strokeStyle = wickColor;
    ctx.lineWidth = 1;
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();
    
    // Draw body
    ctx.fillStyle = isRising ? upColor : downColor;
    // if (data.deltaDivergence) ctx.fillStyle = 'purple'
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.abs(openY - closeY) || 1; // Ensure minimum height
    ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);

    // if (maxima.includes(i)) {
    //   ctx.fillStyle = 'purple'
    //   const bodyTop = highY
    //   ctx.fillRect(x - candleWidth * 5 , bodyTop - 4, candleWidth * 10, 8);
    // }

    // if (minima.includes(i)) {
    //   ctx.fillStyle = 'orange'
    //   const bodyTop = lowY
    //   ctx.fillRect(x - candleWidth * 5 , bodyTop - 4, candleWidth * 10, 8);
    // }

    /* Indicator: Standard Deviation */
    const sdHeight = data.sd / 20
    standardDeviationPath.push([x - candleWidth / 2, height - 100 - sdHeight, candleWidth, sdHeight])

    /* Indicator: Speed of Tape */
    const sotHeight = data.sot * 0.001
    speedOfTapePath.push([x - candleWidth / 2, height - 100 - sotHeight, candleWidth, sotHeight])
  });

  
  for (const [x, y, width, height] of standardDeviationPath) {
    ctx.fillStyle = 'blue';
    ctx.fillRect(x, y, width, height)
  }

  for (const [x, y, width, height] of speedOfTapePath) {
    ctx.fillStyle = 'orange';
    ctx.fillRect(x, y, width, height)
  }

  indications.filter(ind => ind.zIndex === CONFIG.view.chart.zIndex.overCandles).forEach(drawIndication)

  // Add chart title
  const startDate = format(minTime, 'dd.MM.yyyy');
  const endDate = format(maxTime, 'dd.MM.yyyy');
  ctx.fillStyle = '#000000';
  ctx.font = '16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${title} ${startDate} - ${endDate}`, width / 2, padding / 2);

  // Add axis labels
  ctx.fillStyle = '#000000';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Time', width / 2, height - 10);
  ctx.save();
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Price', -height / 2, 20);
  ctx.restore();

  drawStatistics(ctx, 124, 124, statistics)


  return canvas.toBuffer('image/png');
}