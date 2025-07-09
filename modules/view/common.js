import { startOfDay, format } from 'date-fns';

export const minimum = (list) => {
  let minimum = list[0]
  for (const value of list) if (value < minimum) minimum = value
  return minimum
}

export const maximum = (list) => {
  let maximum = list[0]
  for (const value of list) if (value > maximum) maximum = value
  return maximum
}

export const drawClusters = (ctx, clusters, { x, highY, lowY, candleWidth, clusterFiltration, evaluations }) => {
  ctx.beginPath();
  ctx.lineWidth = 1;
  const clustersArr = Object.values(clusters).sort((a, b) => b.price - a.price)
  const candleTop = Math.min(highY, lowY);
  const candleHeight = Math.abs(highY - lowY) || 1

  const clusterHeight = candleHeight / clustersArr.length
  for (let i = 0; i < clustersArr.length; i++) {
    const cluster = clustersArr[i]
    const _x = x - candleWidth / 2
    const _y = candleTop + clusterHeight * i
    ctx.fillStyle = cluster.volume >= clusterFiltration ? 'purple' : '#16355161'
    ctx.fillRect(_x, _y, candleWidth, clusterHeight)
    ctx.font = `${Math.floor(candleWidth * 0.15)}px serif`;
     if (cluster.absorption < 0) {
      ctx.fillStyle = 'blue'
      ctx.fillRect(_x, _y, candleWidth, clusterHeight)
    } else if (cluster.absorption > 0) {
      ctx.fillStyle = 'orange'
      ctx.fillRect(_x, _y, candleWidth, clusterHeight)
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = cluster.position === 'upper-wick' ? 'green' : cluster.position === 'lower-wick' ? 'red' : 'black'
    ctx.fillText(`${parseInt(cluster.bid)}x${parseInt(cluster.ask)}`, _x, _y + candleWidth * 0.12)
    
    const volumeEvaluation = cluster.evaluation
    if (volumeEvaluation >= 5) {
      ctx.fillStyle = '#6813f152'
      const size = 5 * volumeEvaluation * 0.2
      const halfSize = size * 0.5
      ctx.fillRect(x - halfSize, _y - halfSize + clusterHeight * 0.5, size, size)
    }
  }
}

export const drawOHLCCandle = (ctx, { x, openY, closeY, highY, lowY, isRising }, { upColor, downColor, candleWidth, wickColor, clusters, clusterFiltration, evaluations, extra }) => {
  ctx.beginPath();
  ctx.strokeStyle = wickColor;
  ctx.lineWidth = 1;
  ctx.moveTo(x, highY);
  ctx.lineTo(x, lowY);
  ctx.stroke();
  ctx.fillStyle = isRising ? upColor : downColor;
  const bodyTop = Math.min(openY, closeY);
  const bodyHeight = Math.abs(openY - closeY) || 1; // Ensure minimum height
  ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
  if (clusters) {
    drawClusters(ctx, clusters, { x, highY, lowY, candleWidth, clusterFiltration, evaluations })
  }
  const candleTop = Math.min(highY, lowY);
  const candleHeight = Math.abs(highY - lowY) || 1
  
  if (extra.evaluations.positiveVD > 1) {
    ctx.beginPath();
    const size = Math.sqrt(1 * extra.evaluations.positiveVD) * 2
    ctx.fillStyle = '#008000c7'
    ctx.arc(x, candleTop + candleHeight + size + 1, size, 0, 2 * Math.PI);
    ctx.fill()
  }

  if (extra.evaluations.negativeVD > 1) {
    ctx.beginPath();
    const size = Math.sqrt(1 * extra.evaluations.negativeVD) * 2
    ctx.fillStyle = '#f713138c'
    ctx.arc(x, candleTop - size * 2 - 1, size, 0, 2 * Math.PI);
    ctx.fill()
  }
}

function getRoseColor(factor) {
    // Validate factor range (1 to 100)
    const clampedFactor = Math.max(1, Math.min(100, factor));
    
    // Base rose color RGB (e.g., a soft rose: #E8B3C2)
    const baseR = 232; // Red component
    const baseG = 179; // Green component
    const baseB = 194; // Blue component
    
    // Calculate alpha (1 = nearly transparent, 100 = more opaque)
    const alpha = clampedFactor / 100; // Maps 1-100 to 0.01-1
    
    // Darken color by reducing RGB values based on factor
    // At factor 100, reduce to ~20% of original to approach dark rose
    const darkening = 1 - (clampedFactor - 1) / 99 * 0.8; // 1 to 0.2
    const r = Math.round(baseR * darkening);
    const g = Math.round(baseG * darkening);
    const b = Math.round(baseB * darkening);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const drawPriceLevel = (ctx, { x1, x2, y1, y2, testsCount }) => {
  if (testsCount < 5) return
  ctx.beginPath();
  ctx.fillStyle = getRoseColor(testsCount)
  const _x1 = Math.min(x1, x2)
  const _y1 = Math.min(y1, y2)
  const dx = Math.abs(x1 - x2)
  const dy = Math.abs(y1 - y2)
  ctx.fillRect(_x1, _y1, dx, dy)
}



export const serverCandleToOHLC = (c) => {
  return {
    o: c.open,
    c: c.close,
    l: c.low,
    h: c.high
  }
}

export const serverCandleToXOHLC = (c) => {
  const date = new Date(c.time)
  const startDay = startOfDay(new Date(c.time))
  return {
    x: c.time,
    o: c.open,
    c: c.close,
    l: c.low,
    h: c.high,
    extra: {
      id: c.id,
      cvd: c.cvd,
      clusters: c.clusters,
      volumeDelta: c.volumeDelta,
      priceDelta: c.priceDelta,
      volume: c.volume,
      evaluations: c.evaluations,
      startOfDayTimestamp: startDay.getTime(),
      startOfDayDateFormatted: format(startDay, 'dd MMM') ,
      dateFormatted: format(date, 'HH:mm dd MMM') 
    }
  }
}

export const clamp = (min, val, max) => Math.min(
  max, 
  Math.max(val, min)
)

export const getRangeOverlap = (indicatorRange, chartRange) => {
    const [indicatorStart, indicatorEnd] = indicatorRange;
    const [chartStart, chartEnd] = chartRange;
    
    // Check if ranges overlap
    if (indicatorStart <= chartEnd && indicatorEnd >= chartStart) {
        // Return the overlapping portion
        return {
            isOverlapping: true,
            firstPoint: Math.max(indicatorStart, chartStart),
            lastPoint: Math.min(indicatorEnd, chartEnd)
        };
    }
    
    return { isOverlapping: false };
}