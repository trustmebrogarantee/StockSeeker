import { clamp, drawOHLCCandle, drawPriceLevel, getRangeOverlap, maximum, minimum, serverCandleToXOHLC } from "./common";
import get from 'lodash/get'

function generateRoundedYAxisTicks(min, max, options = {}) {
  const {
    minTicks = 5,
    maxTicks = 10,
    baseStep = 0.1,
    decimalPlaces = 2,
  } = options;

  if (min > max) [min, max] = [max, min];
  if (min === max) return [min];

  const range = max - min;
  const roughStep = range / ((minTicks + maxTicks) / 2);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep / baseStep)));
  const normalized = roughStep / (baseStep * magnitude);
  const niceFactor = normalized <= 2 ? 1 : normalized <= 5 ? 2 : 5;
  const step = niceFactor * baseStep * magnitude;

  const start = Math.ceil(min / step) * step;
  const end = Math.floor(max / step) * step;
  const ticks = [];
  for (let t = start; t <= end + step / 2; t += step) {
    ticks.push(Number(t.toFixed(decimalPlaces)));
  }

  return ticks;
}

function calculateAngle(x1, y1, x2, y2) {
  // Вычисляем разницу координат
  const deltaX = x2 - x1;
  const deltaY = y2 - y1;

  // Вычисляем угол в радианах с помощью Math.atan2
  let angleRad = Math.atan2(deltaY, deltaX);

  // Преобразуем в градусы (0 до 360)
  let angleDeg = angleRad * (180 / Math.PI);

  // Нормализуем угол, чтобы он был в диапазоне [0, 360)
  // if (angleDeg < 0) {
  //   angleDeg += 360;
  // }

  return angleDeg - 180;
}

function zigzag(ohlc, threshold) {
  if (!ohlc || ohlc.length === 0) return [];

  const significantPoints = [];
  let direction = null; // Initially null until first significant move
  let lastPrice = ohlc[0].l; // Start with first low
  let maxHigh = ohlc[0].h;
  let maxHighIndex = 0;
  let minLow = ohlc[0].l;
  let minLowIndex = 0;

  // Add the first point as a low
  significantPoints.push({ index: 0, price: ohlc[0].l, type: 'low' });

  for (let i = 1; i < ohlc.length; i++) {
    // Update running max high and min low
    if (ohlc[i].h > maxHigh) {
      maxHigh = ohlc[i].h;
      maxHighIndex = i;
    }
    if (ohlc[i].l < minLow) {
      minLow = ohlc[i].l;
      minLowIndex = i;
    }

    // Determine initial direction if not set
    if (direction === null) {
      if (maxHigh > lastPrice * (1 + threshold)) {
        direction = 'up';
      } else if (minLow < lastPrice * (1 - threshold)) {
        direction = 'down';
      }
      continue;
    }

    if (direction === 'up') {
      // Check for a significant drop from the max high
      if (ohlc[i].l < maxHigh * (1 - threshold)) {
        significantPoints.push({ index: maxHighIndex, price: maxHigh, type: 'high' });
        lastPrice = maxHigh;
        direction = 'down';
        minLow = ohlc[i].l;
        minLowIndex = i;
        maxHigh = ohlc[i].h; // Reset maxHigh for the next uptrend
        maxHighIndex = i;
      }
    } else { // direction === 'down'
      // Check for a significant rise from the min low
      if (ohlc[i].h > minLow * (1 + threshold)) {
        significantPoints.push({ index: minLowIndex, price: minLow, type: 'low' });
        lastPrice = minLow;
        direction = 'up';
        maxHigh = ohlc[i].h;
        maxHighIndex = i;
        minLow = ohlc[i].l; // Reset minLow for the next downtrend
        minLowIndex = i;
      }
    }
  }

  return significantPoints;
}

export class Chart {
  constructor(viewType = 'ohlc', delimiter = 'hour:1', candlesInViewport = 5) {
    this.el = document.createElement('canvas')
    this.ctx = this.el.getContext('2d')
    this.candlesInViewport = candlesInViewport
    this.viewType = viewType
    this.startingCandleShift = 0
    this.candleWidth = 1

    this.userMode = null // 'train-ab-ex-patterns'
    this.trainHighlights = []
    this.trainingHistory = []
    this.blockNewCalls = false

    this.data = []
    this.levels = []
    this.bidAsk = []
    this.streaks = []
    this.volumeProfiles = []
    this.priceActions = null
    this.sma = []
    this.stdDev = []

    this.renderedData = []
    this.renderedLevels = []
    this.renderedBidask = []
    this.renderedStreaks = []
    this.renderedVolumeProfiles = []
    this.renderedPriceActions = []
    this.renderedSma = []
    this.renderedStdDev = []
    this.renderedHighs = []
    this.renderedLows = []
    this.significantPoints = []

    this.delayedRenderCalls = []

    this.highs = []
    this.lows = []

    this.isPanning = false
    
    this.dataSlice = { from: 0, length: 100 }
    
    
    this.lineDataModel = { x: 0, y: 0 }
    this.ohlcDataModel = { x: 0, o: 0, h: 0, l: 0, c: 0 }
    this.scaling = { x: 10, y: 1 }
    this.gap = { minX: 5, x: 10, minY: 5, y: 10  }

    this.movement = { x: 0, y: 0}
    this.crosshairIndex = 0

    this.indicators = {
      priceAction: false,
      bidAsk: false,
      volumeProfile: false,
      streaks: false,
      highLow: false,
      sma: false,
      priceLevel: false
    }
    
    
    this.setSizes()  
    this.setXScaling()
    this.crosshair = { 
      left: (this.el.height - this.timelineHorizontalControl.height) * 0.5,
      top: (this.el.height - this.timelineHorizontalControl.height) * 0.5
    }

    this.subcharts = [
      {
        viewType: 'linear',
        yField: 'extra.cvd',
        xField: 'x',
        paddingTop: () => (this.el.height - this.timelineHorizontalControl.height) * 0.666,
        paddingLeft: () => 0,
        height: () => (this.el.height - this.timelineHorizontalControl.height) * 0.333,
        width: () => this.el.width - this.valueVerticalControl.width
      }
    ]

    this.setupListeners()
    
    this.evaluations = {
      evaluateVolumeAnomaly: (volume) => 0,
      evaluatePositiveVD: (volumeDelta) => 0,
      evaluateNegativeVD: (volumeDelta) => 0
    }

    this.delayedRenderCalls.push(this.setCalculations)
  }

  nextTrainSituation(chosenValue) {
    const storyItem = this.renderedData.flatMap(d =>[d.extra.id, d.o, d.c, d.extra.cvd])
    storyItem.push(chosenValue)
    this.trainingHistory.push(storyItem)
    this.delayedRenderCalls.push(this.setupNextTrainSituation)
  }

  setupNextTrainSituation(renderedData) {
    if (this.userMode === 'train-ab-ex-patterns') {
      for (let i = renderedData.length - 1; i > 0; i--) {
        if (i > 1 && i < renderedData.length - 2) {
          const itemN2 = renderedData[i - 2]
          const itemN1 = renderedData[i - 1]
          const item0 = renderedData[i]
          const itemP1 = renderedData[i + 1]

          const delta = (a) => Math.sign(a.c - a.o) 
          const N1N2 = delta(itemN1) === delta(itemN2)
          const fitsTrainingHighlight = !this.trainHighlights.at(-1) || item0.extra.id > this.trainHighlights.at(-1).extra.id + 1
          if (N1N2 && delta(itemP1) !== delta(itemN2) && fitsTrainingHighlight) {
            this.startingCandleShift = this.data.length - item0.extra.id - 1
            this.trainHighlights.push(item0)
            return item0
          }
        }
      }

      const frame = () => {
        this.startingCandleShift--
        this.delayedRenderCalls.push(this.setupNextTrainSituation)
      }
      requestAnimationFrame(frame)
    }
  }

  enableMode(mode) {
    this.userMode = mode
    if (this.userMode === 'train-ab-ex-patterns') {
      this.scaling.x = 20
      trainAbExPaterns.style.visibility = 'visible'
      this.startingCandleShift = this.data.length - Math.floor(this.candlesInViewport * this.scaling.x) - 100
      this.delayedRenderCalls.push(this.setupNextTrainSituation)
    } else {
      this.trainHighlights = []
      this.startingCandleShift = 0
      trainAbExPaterns.style.visibility = 'hidden'
    }
  }

  element() {
    return this.el
  }

  setSizes() {
    this.bodyBox = document.body.getBoundingClientRect()
    this.el.width = this.bodyBox.width
    this.el.height = this.bodyBox.height - 10
    this.valueVerticalControl = { width: 60, height: this.el.height }
    this.timelineHorizontalControl = { with: this.el.width, height: 60 }
  }

  setCalculations(renderedData) {
    // this.renderedLevels = []
    // for (const level of this.levels) {
    //   if (level.tests.length > 1) {
    //     const overlap = getRangeOverlap([level.tests.at(0), level.tests.at(-1)], [renderedData.at(0).x, renderedData.at(-1).x])
    //     if (overlap.isOverlapping) {
    //       this.renderedLevels.push({ price: level.price, timeStart: overlap.firstPoint, timeEnd: overlap.lastPoint, testsCount: level.tests.length })
    //     }
    //   }
    // }

    // this.renderedBidask = []
    // for (let i = 0; i < this.bidAsk.length; i++) {
    //   const bidAsk = this.bidAsk[i]
    //   const nextBidAsk = this.bidAsk[i + 1]
    //   const overlap = getRangeOverlap([bidAsk.time, nextBidAsk?.time || Date.now()], [renderedData.at(0).x, renderedData.at(-1).x])
    //   if (overlap.isOverlapping) {
    //     this.renderedBidask.push({ timeStart: overlap.firstPoint, timeEnd: overlap.lastPoint, isBullish: bidAsk.isBullish })
    //   }
    // }

    // this.renderedStreaks = []
    // for (const streak of this.streaks) {
    //   for (const deal of streak.deals) {
    //     const overlap = getRangeOverlap([deal.from, deal.to], [renderedData.at(0).x, renderedData.at(-1).x])
    //     if (overlap.isOverlapping) {
    //       this.renderedStreaks.push({ timeStart: overlap.firstPoint, timeEnd: overlap.lastPoint, isBullish: streak.type === 'win', stopLoss: deal.stopLoss, takeProfit: deal.takeProfit, enter: deal.enter })
    //     }
    //   }
    // }

    // this.renderedVolumeProfiles = []
    // for (const volumeProfile of this.volumeProfiles) {
    //   const overlap = getRangeOverlap([volumeProfile.startedAt, volumeProfile.endedAt], [renderedData.at(0).x, renderedData.at(-1).x])
    //   if (overlap.isOverlapping) {
    //     this.renderedVolumeProfiles.push({ timeStart: overlap.firstPoint, timeEnd: overlap.lastPoint, profile: volumeProfile.profile, vah: volumeProfile.vah, val: volumeProfile.val, vpoc: volumeProfile.vpoc, vpocVolume: volumeProfile.profile[volumeProfile.vpocIndex].volume, normality: volumeProfile.normality })
    //   }
    // }

    // this.renderedPriceActions = []
    // if (!this.priceActions) return
    // for (let i = 0; i < this.priceActions.priceEvents.length; i++) {
    //   const priceEvent = this.priceActions.priceEvents[i]
    //   const priceEventTimestamp = this.priceActions.priceEventsTimestamps[i]
    //   const priceEventPrice = this.priceActions.priceEventsPrices[i]
    //   const overlap = getRangeOverlap([priceEventTimestamp, priceEventTimestamp + 1], [renderedData.at(0).x, renderedData.at(-1).x])
    //   if (overlap.isOverlapping) {
    //     this.renderedPriceActions.push({ time: overlap.firstPoint, event: priceEvent, price: priceEventPrice })
    //   }
    // }


    // this.renderedSma = this.sma.slice(this.dataSlice.from, this.dataSlice.length)
    // this.renderedStdDev = this.stdDev.slice(this.dataSlice.from, this.dataSlice.length)
    // this.renderedHighs = []
    // for (let i = 0; i < this.highs.length; i++) {
    //   const high = this.highs[i]
    //   const overlap = getRangeOverlap([high.time, high.time + 1], [renderedData.at(0).x, renderedData.at(-1).x])
    //   if (overlap.isOverlapping) {
    //     this.renderedHighs.push(high)
    //   }
    // }
    
    // this.renderedLows = []
    // for (let i = 0; i < this.lows.length; i++) {
    //   const low = this.lows[i]
    //   const overlap = getRangeOverlap([low.time, low.time + 1], [renderedData.at(0).x, renderedData.at(-1).x])
    //   if (overlap.isOverlapping) {
    //     this.renderedLows.push(low)
    //   }
    // }

    this.significantPoints = zigzag(renderedData, 0.03)
    
    // this.highs = this.highs.sort((a, b) => b.delta - a.delta).filter((p, i, a) => i < Math.floor(a.length * 0.1))
    // this.lows = this.lows.sort((a, b) => b.delta - a.delta).filter((p, i, a) => i < Math.floor(a.length * 0.1))
  }

  setXScaling(e = { deltaY: 0 }) {
    const MIN_SCALE = 5
    const MAX_SCALE = 20000
    this.scaling.x = clamp(
      MIN_SCALE,
      this.scaling.x * Math.pow(1.01, e.deltaY * 0.1),
      MAX_SCALE
    );

    this.delayedRenderCalls.push(this.setCalculations)
  }

  handleMousePan(e) {
    const initialCandleShift = this.startingCandleShift
    const initialCrosshairIndex = this.crosshairIndex

    const move = (e) => {
      this.isPanning = true
      this.movement.x += e.movementX
      const idxMovement = this.crosshairIndex - initialCrosshairIndex 
      this.startingCandleShift = Math.max(0, Math.min(initialCandleShift + idxMovement, this.data.length - Math.floor(this.candlesInViewport * this.scaling.x)))
    };

    const end = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", end);
      this.isPanning = false
      this.movement.x = 0
      this.delayedRenderCalls.push(this.setCalculations)
    };

    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", end);
  };

  handleCrosshairMove(e) {
    const box = this.el.getBoundingClientRect()
    this.crosshair.left = e.pageX - box.left
    this.crosshair.top = e.pageY - box.top
  }

  setupListeners() {
    window.addEventListener('resize', this.setSizes.bind(this))
    document.addEventListener('mousedown', this.handleMousePan.bind(this))
    this.el.addEventListener('mousemove', this.handleCrosshairMove.bind(this))
    this.el.addEventListener('wheel', this.setXScaling.bind(this))
  }

  setLevels(levels) {
    this.levels = levels
  }

  setBidAsk(bidAsk) {
    this.bidAsk = bidAsk
  }

  setStreaks(streaks) {
    this.streaks = streaks
  }

  setVolumeProfiles(vp) {
    this.volumeProfiles = vp
  }

  setPriceActions(pa) {
    this.priceActions = pa
  }

  setSma(sma) {
    this.sma = sma
  }

  setStdDev(stdDev) { 
    this.stdDev = stdDev
  }

  setHighs(highs) {
    this.highs = highs
  }

  setLows(lows) {
    this.lows = lows
  }

  automateRenderingForData(data) {
    if (this.data.length === 0) {
      this.data = data
      this.setCalculations(data.map(serverCandleToXOHLC))
    }
    requestAnimationFrame(() => {
      this.renderData(this.data)
      this.automateRenderingForData(this.data)
    })
  }

  renderSubchart(subchart, renderedData) {
    const chartWidth = subchart.width();
    const chartHeight = subchart.height();
    const ctx = this.ctx

    if (subchart.viewType === 'linear') {
      const prices = renderedData.flatMap(d => {
        const rawY = get(d, subchart.yField)
        return [rawY]
      });
      const minPriceRaw = minimum(prices)
      const maxPriceRaw = maximum(prices)

      const priceBuffer = (maxPriceRaw - minPriceRaw) * 0.1;
      const minPrice = Math.floor(minPriceRaw - priceBuffer);
      const maxPrice = Math.ceil(maxPriceRaw + priceBuffer);
      const priceRange = maxPrice - minPrice;
      const numPriceSteps = 10;
      const rawPriceStep = priceRange / numPriceSteps;

      const timestamps = renderedData.map(d => get(d, subchart.xField));
      const minTime = minimum(timestamps);
      const maxTime = maximum(timestamps);
      const timeRange = maxTime - minTime;
      const viewportSize = Math.floor(this.candlesInViewport * this.scaling.x)

      const priceToY = (price) => {
        const normalized = (price - minPrice) / priceRange;
        return  subchart.paddingTop() + (chartHeight * (1 - normalized) * this.scaling.y);
      };
      const YToPrice = (y) => {
          const normalized = 1 - (y - subchart.paddingTop()) / (chartHeight * this.scaling.y);
          return minPrice + priceRange * normalized;
      };
      const timeToX = (time) => {
        const normalized = (time - minTime) / timeRange;
        return subchart.paddingLeft() + (chartWidth * normalized * this.scaling.y);
      };
      const indexToX = (index) => {
        return subchart.paddingLeft() + (index / viewportSize) * chartWidth
      }

      ctx.beginPath()
      ctx.strokeStyle = 'blue'
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < renderedData.length; i++) {
        const data = renderedData[i]
        const x = indexToX(i)
        const rawY = get(data, subchart.yField)
        const y = priceToY(rawY)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.closePath()
    }
  }

  renderData(data) {
    const subchartsHeights = this.subcharts.reduce((acc, subchart) => acc + subchart.height(), 0)

    const chartWithSubchartsHeight = this.el.height - this.timelineHorizontalControl.height
    const chartWithSubchartsWidth = this.el.width - this.valueVerticalControl.width
    const chartWidth = this.el.width - this.valueVerticalControl.width;
    const chartHeight = this.el.height - this.timelineHorizontalControl.height - subchartsHeights;
    const ctx = this.ctx

    const viewportSize = Math.floor(this.candlesInViewport * this.scaling.x)
    this.dataSlice = { from: Math.max(data.length - viewportSize - this.startingCandleShift, 0), length: Math.min(data.length, Math.max(data.length - this.startingCandleShift, viewportSize)) }
    const renderedData = data.slice(this.dataSlice.from, this.dataSlice.length).map(serverCandleToXOHLC)
    this.renderedData = renderedData

    while (this.delayedRenderCalls.length > 0) this.delayedRenderCalls.shift().call(this, renderedData)

    if (this.viewType === 'ohlc') {
      const prices = renderedData.flatMap(d => [d.o, d.h, d.l, d.c]);
      const minPriceRaw = minimum(prices)
      const maxPriceRaw = maximum(prices)

      const priceBuffer = (maxPriceRaw - minPriceRaw) * 0.1;
      const minPrice = Math.floor(minPriceRaw - priceBuffer);
      const maxPrice = Math.ceil(maxPriceRaw + priceBuffer);
      const priceRange = maxPrice - minPrice;

      const numPriceSteps = 10;
      const rawPriceStep = priceRange / numPriceSteps;

      const timestamps = renderedData.map(d => d.x);
      const minTime = minimum(timestamps);
      const maxTime = maximum(timestamps);
      const timeRange = maxTime - minTime;

      const priceToY = (price) => {
        const normalized = (price - minPrice) / priceRange;
        return  chartHeight * (1 - normalized) * this.scaling.y;
      };
      const yToPrice = (y) => {
        const normalized = 1 - (y) / (chartHeight * this.scaling.y);
        return minPrice + priceRange * normalized;
      };
      const timeToX = (time) => {
        const normalized = (time - minTime) / timeRange;
        return chartWidth * normalized * this.scaling.y;
      };
      const indexToX = (index) => {
        return (index / viewportSize) * chartWidth
      }

      const upColor = 'rgba(26, 152, 129, 1)';
      const downColor = 'rgba(239, 57, 74, 1)';
      const wickColor = '#000000';
      const candleSpacing = chartWidth / (renderedData.length - 1);
      const candleWidth = chartWidth / viewportSize
      this.candleWidth = candleWidth

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.el.width, this.el.height);

      if (this.indicators.bidAsk) {
        for (const bidAsk of this.renderedBidask) {
          const x1 = timeToX(bidAsk.timeStart)
          const x2 = timeToX(bidAsk.timeEnd)
          const dx = Math.abs(x2 - x1)
          ctx.fillStyle = bidAsk.isBullish ? '#15bf221f' : '#ff000012'
          ctx.fillRect(x1, 0, dx, chartHeight)
        }
      }

      if (this.indicators.streaks) {
        for (const streak of this.renderedStreaks) {
          const x1 = timeToX(streak.timeStart)
          const x2 = timeToX(streak.timeEnd)
          const dx = Math.abs(x2 - x1)
          
          const dy = priceToY(streak.stopLoss) - priceToY(streak.takeProfit)
          ctx.fillStyle = streak.isBullish ? '#25cd5159' : '#cd252559'
          ctx.fillRect(x1, priceToY(streak.takeProfit), dx, dy)
          ctx.beginPath();
          ctx.strokeStyle = 'black'
          const enter = priceToY(streak.enter)
          ctx.moveTo(x1, enter)
          ctx.lineTo(x2, enter)
          ctx.closePath();
          ctx.stroke()
        }
      }

      const priceSteps = generateRoundedYAxisTicks(minPrice, maxPrice) 
      for (const priceStep of priceSteps) {
        const y = priceToY(priceStep);
        ctx.beginPath();
        ctx.strokeStyle = '#ebebeb';
        ctx.lineWidth = 1;
        ctx.moveTo(0, y);
        ctx.lineTo(this.el.width, y);
        ctx.stroke();
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(chartWidth, 0, this.valueVerticalControl.width, this.valueVerticalControl.height)
      
      for (const priceStep of priceSteps) {
        const y = priceToY(priceStep);
        ctx.fillStyle = '#000000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(priceStep.toString(), chartWidth + this.valueVerticalControl.width * 0.5, y); // Shifted labels further left
      }

      ctx.strokeStyle = 'lightgrey';
      ctx.moveTo(chartWithSubchartsWidth, 0);
      ctx.lineTo(chartWithSubchartsWidth, chartWithSubchartsHeight);
      ctx.stroke()
      ctx.moveTo(0, chartWithSubchartsHeight);
      ctx.lineTo(chartWithSubchartsWidth, chartWithSubchartsHeight);
      ctx.stroke()

      for (const subchart of this.subcharts) {
        ctx.strokeStyle = 'lightgrey';
        ctx.moveTo(0, subchart.paddingTop());
        ctx.lineTo(subchart.width(), subchart.paddingTop());
        ctx.stroke()
      } 

      let prevDateLabel = null
      for (let i = 0; i < renderedData.length; i++) {
        const data = renderedData[i]
        drawOHLCCandle(ctx, { x: indexToX(i), openY: priceToY(data.o), closeY: priceToY(data.c), highY: priceToY(data.h), lowY: priceToY(data.l), isRising: data.c >= data.o }, { upColor, downColor, candleWidth, wickColor, clusters: [], clusterFiltration: 20000, evaluations: this.evaluations, extra: data.extra })
        if (i === renderedData.length - 1 && this.significantPoints.length > 0) {
          const lastSp = this.significantPoints.at(-1)
          const spItem = renderedData[lastSp.index]
          if (spItem) {
            const candleAngle = calculateAngle(i, data.c, lastSp.index, spItem.c)
          }
          // const spAngle = calculateAngle(i, spItem.c, i, spItem.extra.cvd)
          // console.log({ candleAngle })
        }
        
        if (data.extra.id === this.trainHighlights.at(-1)?.extra.id) {
          ctx.fillStyle = '#4e9bd94a'
          ctx.fillRect(indexToX(i) - candleWidth * 0.5, 0, candleWidth, chartWithSubchartsHeight)
        }

        const prevCandle = renderedData[i - 1]
        if (prevCandle && prevCandle.o > prevCandle.c && data.o > data.c && data.extra.volumeDelta > 0 && data.extra.volumeDelta / data.extra.volume >= 0.1) {
          const x = indexToX(i)
          const y = priceToY(data.l)
          ctx.fillStyle = 'purple'
          ctx.fillRect(x - candleWidth * 0.5, y + 4, candleWidth, 16)
        }

        if (data.extra.startOfDayDateFormatted !== prevDateLabel) {
          ctx.font = '16px Arial';
          ctx.fillStyle = '#303030'
          ctx.fillText(data.extra.startOfDayDateFormatted, indexToX(i), chartWithSubchartsHeight + this.timelineHorizontalControl.height * 0.5 + 8)
          prevDateLabel = data.extra.startOfDayDateFormatted
        }
      }

      if (this.indicators.highLow) {
        for (const high of this.renderedHighs) {
           ctx.fillStyle = 'red'
           ctx.fillRect(timeToX(high.time) - 2, priceToY(high.value) - 2, 4, 4)
         }
 
         for (const low of this.renderedLows) {
           ctx.fillStyle = 'green'
           ctx.fillRect(timeToX(low.time) - 2, priceToY(low.value) - 2, 4, 4)
         }
      }

      if (this.indicators.sma) {
        ctx.beginPath()
        ctx.strokeStyle = 'blue'
        for (let i = 0; i < this.renderedSma.length; i++) {
          const data = renderedData[i]
          const x = timeToX(data.x)
          const y = priceToY(this.renderedSma[i])
          ctx.lineTo(x, y)
          ctx.font = '10px Arial';
          ctx.fillStyle = 'black'
          ctx.fillText(this.renderedStdDev[i].toFixed(2), x, y)
        }
        ctx.stroke()
        ctx.closePath()
      }

      if (this.indicators.volumeProfile) {
        for (const volumeProfile of this.renderedVolumeProfiles) {
          const x1 = timeToX(volumeProfile.timeStart)
          const x2 = timeToX(volumeProfile.timeEnd)
          const dx = Math.abs(x2 - x1)
          ctx.fillStyle = '#000000';
          ctx.font = '12px Arial';
          ctx.fillText(volumeProfile.normality.toFixed(2), x1, priceToY(volumeProfile.profile[0].price)); // Shifted labels further left
          for (let i = 0; i < volumeProfile.profile.length; i++) {
            const volumeLevel = volumeProfile.profile[i]
            const nearestVolumeLevel = volumeProfile.profile[i + 1] || volumeProfile.profile[i - 1]
            let color = '#80808073'
            if (volumeLevel.price === volumeProfile.vpoc) color = '#4b88e373'
            if (volumeLevel.price === volumeProfile.val || volumeLevel.price === volumeProfile.vah) color = '#e34b4b73'
            const levelSizeFactor = volumeLevel.volume / volumeProfile.vpocVolume
            const y = priceToY(volumeLevel.price)
            ctx.fillStyle = color
            const height = Math.max(Math.abs(y - priceToY(nearestVolumeLevel.price)), 1)
            ctx.fillRect(x1, y, dx * levelSizeFactor, height)
          }
        }
      }

      if (this.indicators.priceAction) {
        for (const priceAction of this.renderedPriceActions) {
           ctx.beginPath()
           ctx.fillStyle = 'black'
           ctx.arc(timeToX(priceAction.time), priceToY(priceAction.price), 4, 0, 2 * Math.PI)          
           ctx.fillStyle = 'black'
           ctx.font = '14px Arial'
           ctx.fillText(priceAction.event, timeToX(priceAction.time), priceToY(priceAction.price))
           ctx.fill()
         }
      }
      
      if (this.indicators.priceLevel) {
        const epsilon = 0.02 * 0.5
        for (let i = 0; i < this.renderedLevels.length; i++) {
          const level = this.renderedLevels[i]
          // drawPriceLevel(ctx, { x1: timeToX(level.timeStart), x2: timeToX(level.timeEnd), y1: priceToY(level.price - epsilon), y2: priceToY(level.price + epsilon), testsCount: level.testsCount })
        }
      }

      ctx.beginPath()
      for (let i = 0; i < this.significantPoints.length; i++) {
        const point = this.significantPoints[i]
        const x = indexToX(point.index)
        const y = priceToY(point.price)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.lineWidth = 2
      ctx.strokeStyle = 'blue'
      ctx.stroke()
      ctx.closePath()

      for (const subchart of this.subcharts) {
        this.renderSubchart(subchart, renderedData)
      }
      
      ctx.strokeStyle = 'black'
      ctx.strokeWidth = 1
      ctx.beginPath()
      ctx.setLineDash([5, 15]);
      ctx.moveTo(this.crosshair.left, 0)
      ctx.lineTo(this.crosshair.left, chartWithSubchartsHeight)
      ctx.closePath()
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(0, this.crosshair.top)
      ctx.lineTo(chartWithSubchartsWidth, this.crosshair.top)
      ctx.closePath()
      ctx.stroke()
      ctx.setLineDash([])
      
      const candleIndex = Math.floor((this.crosshair.left + candleWidth * 0.5) / this.candleWidth)
      const ohlc = renderedData[candleIndex]
      this.crosshairIndex = candleIndex
      if (ohlc) {
        ctx.fillStyle = '#4e9bd94a'
        ctx.fillRect(indexToX(candleIndex) - candleWidth * 0.5, 0, candleWidth, chartWithSubchartsHeight)

        ctx.fillStyle = '#43495d8c'
        const t_width = 124
        const t_height = 32
        const t_x = indexToX(candleIndex) + candleWidth * 0.5 + 4
        const t_y = chartWithSubchartsHeight - t_height
        ctx.fillRect(t_x, t_y, t_width, t_height)
        ctx.fillStyle = 'white'
        ctx.fillText(ohlc.extra.dateFormatted, t_x + t_width / 2, t_y + t_height / 2 + 4)

        ctx.fillStyle = '#43495d8c'
        const v_width = 84
        const v_height = 32
        const v_x = chartWithSubchartsWidth - this.valueVerticalControl.width - v_width * 0.3
        const v_y = this.crosshair.top + 4
        ctx.fillRect(v_x, v_y, v_width, v_height)
        ctx.fillStyle = 'white'
        ctx.fillText(yToPrice(this.crosshair.top).toFixed(2), v_x + v_width / 2, v_y + v_height / 2 + 4)
      }

    } else if (this.viewType === 'linear') {
      
    }
  }
}