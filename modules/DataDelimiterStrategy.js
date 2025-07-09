import EventEmitter from "eventemitter3"

  function roundQuantityTo(number, step) {
    return Number((Math.floor(number / step) * step).toFixed(2))
  }

 /**
   * Calculates the anomaly score for the current volume using the Fixed Historical Window method.
   * @param {number} currentVolume - The volume at the current period (V_{p,T+1}).
   * @param {number[]} historicalVolumes - Array of historical volumes in chronological order [V_{p,1}, V_{p,2}, ..., V_{p,T}].
   * @param {number} N - Number of historical periods to consider (must be >= 2).
   * @returns {number} - The anomaly score, or 0 if the standard deviation is zero.
   * @throws {Error} - If N < 2 or insufficient historical data is provided.
   */
  function calculateFixedWindowScoreFunction(historicalVolumes, N) {
    // Validate N
    if (N < 2) {
        return (value) => 0
    }
    // Check if there’s enough historical data
    if (historicalVolumes.length < N) {
        throw new Error("Insufficient historical data");
    }

    // Take the last N periods from historicalVolumes
    const window = historicalVolumes.slice(-N);

    // Calculate mean: μ = (1/N) * Σ V_t
    const sum = window.reduce((a, b) => a + b, 0);
    const mean = sum / N;

    // Calculate variance: σ² = (1/(N-1)) * Σ (V_t - μ)²
    const sumSquares = window.reduce((a, b) => a + (b - mean) ** 2, 0);
    const variance = sumSquares / (N - 1);

    // Calculate standard deviation
    const stdDev = Math.sqrt(variance);

    // Avoid division by zero; return 0 if standard deviation is zero
    if (stdDev === 0) {
        return (value) => 0;
    }

    // Calculate anomaly score: (V_{p,T+1} - μ) / σ
    return value => (value - mean) / stdDev;
}

export class DataDelimiter extends EventEmitter {
  constructor() {
    super()
    this.candles = []
    this.lastCandle = null
    this.lastCandleId = 0
    this.appendNewCandle()
    this.roundingStep = 0.01
    this.evaluations = {
      evaluateVolumeAnomaly: (volume) => 0,
      evaluatePositiveVD: (volumeDelta) => 0,
      evaluateNegativeVD: (volumeDelta) => 0
    }
    this.lastEvaluationExecution = 0
  }

  static parseTick(tick) {
    const values = tick.split(';');
    const SEVEN_VALUES = 7
    if (values.length !== SEVEN_VALUES) {
      console.log(tick)
      throw new Error(`(DataDelimiter) [Exception]: tick ${tick} does not fit data schema`)
    }
    return {
      id: parseInt(values[0], 10),
      price: parseFloat(values[1]),
      qty: parseFloat(values[2]),
      quoteQty: parseFloat(values[3]),
      time: parseInt(values[4], 10),
      isBuyerMaker: values[5] === 'true',
      isBestMatch: values[6] === 'true'
    }
  }

  calculateEvaluationFunctions() {
    this.lastEvaluationExecution = this.lastCandle.time
    const clusters = this.candles.flatMap(rd => Object.values(rd.clusters).flatMap(c => c.volume))
    const volumeDeltaDivirgenceNegative = this.candles.filter(rd => rd.priceDelta > 0 && rd.volumeDelta < 0).map(rd => Math.abs(rd.volumeDelta))
    const volumeDeltaDivirgencePositive = this.candles.filter(rd => rd.priceDelta < 0 && rd.volumeDelta > 0).map(rd => Math.abs(rd.volumeDelta))
    this.evaluations.evaluateVolumeAnomaly = calculateFixedWindowScoreFunction(clusters, clusters.length)
    this.evaluations.evaluateNegativeVD = calculateFixedWindowScoreFunction(volumeDeltaDivirgenceNegative, volumeDeltaDivirgenceNegative.length)
    this.evaluations.evaluatePositiveVD = calculateFixedWindowScoreFunction(volumeDeltaDivirgencePositive, volumeDeltaDivirgencePositive.length)
  }


  // Overwrite for specific strategy
  splitTickIfCandleOverflow (parsedTick) {
    throw new Error(`(DataDelimiter) [Exception]: splitTickIfCandleOverflow metho is not specified for ${this.prototype.name}`)
    // return [fittingTick, overflowTickIfExists]
  }

  clusterizeCandleTick(tick) {
    const candle = this.lastCandle
    const val = roundQuantityTo(tick.price, this.roundingStep)
    if (candle.clusters[val]) {
      candle.clusters[val].volume += tick.qty
      candle.clusters[val].evaluation = this.evaluations.evaluateVolumeAnomaly(candle.clusters[val].volume)
      if (tick.isBuyerMaker) candle.clusters[val].bid += tick.qty
      else candle.clusters[val].ask += tick.qty
      candle.clusters[val].volumeDelta = candle.clusters[val].ask - candle.clusters[val].bid
    } else {
      candle.clusters[val] = {
        price: val,
        volume: tick.qty,
        bid: tick.isBuyerMaker ? tick.qty : 0,
        ask: tick.isBuyerMaker ? 0 : tick.qty,
        volumeDelta: tick.isBuyerMaker ? -tick.qty : tick.qty,
        position: 'body',
        evaluation: this.evaluations.evaluateVolumeAnomaly(tick.qty),
        absorption: 0
      }
      if (candle.topCluster === null) candle.topCluster = candle.clusters[val]
    }

    if (candle.clusters[val].evaluation > candle.topCluster.evaluation) candle.topCluster = candle.clusters[val]
  }

  appendNewCandle() {
    if (this.lastCandleId !== 0) {
      const candle = this.lastCandle
      for (const cluster of Object.values(this.lastCandle.clusters)) {
        if (cluster.volume > (candle.clusters[candle.poc]?.volume || 0)) candle.poc = cluster.price
        if (cluster.ask > (candle.clusters[candle.pocAsk]?.ask || 0)) candle.pocAsk = cluster.price
        if (cluster.bid > (candle.clusters[candle.pocBid]?.bid || 0)) candle.pocBid = cluster.price
        
        if (candle.close > candle.open) {
          if (cluster.price > candle.close) cluster.position = 'upper-wick'
          else if (cluster.price < candle.open) cluster.position = 'lower-wick'
        } else if (candle.close < candle.open) {
          if (cluster.price < candle.close) cluster.position = 'lower-wick'
          else if (cluster.price > candle.open) cluster.position = 'upper-wick'
        }
      }

      this.emit('candle-close', this.lastCandle, this.candles)
    }

    if (this.evaluations && this.prevCandle && this.prevCandle.time - this.lastEvaluationExecution > 60_000 * 60 * 24 * 7) this.calculateEvaluationFunctions()
    const newCandle = {
      id: ++this.lastCandleId,
      high: null,
      low: null,
      time: null,
      open: null,
      close: null,
      volume: 0,
      quoteVolume: 0,
      ticks: 0,
      tradedAskContracts: 0,
      tradedBidContracts: 0,
      volumeDelta: 0,
      priceDelta: 0,
      cvd: this.lastCandle?.cvd || 0,
      indicators: {
        deltaDivergence: false,
      },
      topCluster: null,
      evaluations: {
        negativeVD: 0,
        positiveVD: 0
      },
      absorption: 0,

      poc: 0,
      pocAsk: 0,
      pocBid: 0,

      clusters: {
        
      },
    }

    this.lastCandle = newCandle
    this.prevCandle = null

    this.candles.push(this.lastCandle)
    // if (this.candles.length > 1005) this.candles.splice(0, 1000)
  }

  supplyLastCandle(parsedTick) {
    const ticks = this.splitTickIfCandleOverflow(parsedTick)
    const [fittingTick, overflowTick] = ticks
    if (fittingTick) {
      if (this.lastCandle.open === null) this.lastCandle.open = fittingTick.price
      if (this.lastCandle.time === null) this.lastCandle.time = fittingTick.time
      if (this.lastCandle.low === null) this.lastCandle.low = fittingTick.price
      if (this.lastCandle.high === null) this.lastCandle.high = fittingTick.price
      
      this.lastCandle.close = fittingTick.price
      this.lastCandle.high = Math.max(this.lastCandle.high, fittingTick.price)
      this.lastCandle.low = Math.min(this.lastCandle.low, fittingTick.price)
      this.lastCandle.volume += fittingTick.qty
      
      if (fittingTick.isBuyerMaker) {
        this.lastCandle.tradedBidContracts += fittingTick.qty
      } else {
        this.lastCandle.tradedAskContracts += fittingTick.qty
      }
      
      this.lastCandle.quoteVolume += fittingTick.quoteQty
      this.lastCandle.priceDelta = parsedTick.price - this.lastCandle.open
      this.lastCandle.volumeDelta = this.lastCandle.tradedAskContracts - this.lastCandle.tradedBidContracts
      this.lastCandle.cvd += (fittingTick.qty * (fittingTick.isBuyerMaker ? -1 : 1)) 
      this.lastCandle.indicators.deltaDivergence = Math.sign(this.lastCandle.volumeDelta) !== Math.sign(this.lastCandle.priceDelta)

      this.clusterizeCandleTick(fittingTick)
      this.lastCandle.evaluations.positiveVD = this.lastCandle.volumeDelta > 0 && this.lastCandle.priceDelta < 0 ? this.evaluations.evaluatePositiveVD(Math.abs(this.lastCandle.volumeDelta)) : 0
      this.lastCandle.evaluations.negativeVD = this.lastCandle.volumeDelta < 0 && this.lastCandle.priceDelta > 0 ? this.evaluations.evaluateNegativeVD(Math.abs(this.lastCandle.volumeDelta)) : 0

      this.lastCandle.ticks++
    }

    if (overflowTick) {
      this.prevCandle = this.lastCandle
      this.appendNewCandle()
      this.supplyLastCandle(overflowTick)
    }
  }

  parseTick(tick) {
    return DataDelimiter.parseTick(tick)
  }
}

export class VolumeDelimiter extends DataDelimiter {
  constructor(size) {
    super()
    this.size = size
  }
  splitTickIfCandleOverflow(parsedTick) {
    if (this.lastCandle.volume + parsedTick.qty <= this.size) return [parsedTick]
    else {
      const id = parsedTick.id
      const price = parsedTick.price
      const volumeOverflow = (this.lastCandle.volume + parsedTick.qty) - this.size
      const quoteVolumeOverflow = volumeOverflow * price
      const time = parsedTick.time
      const isBuyerMaker = parsedTick.isBuyerMaker
      const isBestMatch = parsedTick.isBestMatch

      const qty = parsedTick.qty - volumeOverflow
      const quoteQty = parsedTick.quoteQty - quoteVolumeOverflow
      return [
        { id, price, qty, quoteQty, time, isBuyerMaker, isBestMatch },
        { id, price, qty: volumeOverflow, quoteQty: quoteVolumeOverflow, time, isBuyerMaker, isBestMatch }
      ]
    }
  }
}

export class QuoteVolumeDelimiter extends DataDelimiter {
  constructor(size) {
    super()
    this.size = size
  }
  splitTickIfCandleOverflow(parsedTick) {
    if (this.lastCandle.quoteVolume + parsedTick.quoteQty <= this.size) return [parsedTick]
    else {
      const id = parsedTick.id
      const price = parsedTick.price
      const quoteVolumeOverflow = (this.lastCandle.quoteVolume + parsedTick.quoteQty) - this.size
      const volumeOverflow = quoteVolumeOverflow / price
      const time = parsedTick.time
      const isBuyerMaker = parsedTick.isBuyerMaker
      const isBestMatch = parsedTick.isBestMatch

      const qty = parsedTick.qty - volumeOverflow
      const quoteQty = parsedTick.quoteQty - quoteVolumeOverflow
      return [
        { id, price, qty, quoteQty, time, isBuyerMaker, isBestMatch },
        { id, price, qty: volumeOverflow, quoteQty: quoteVolumeOverflow, time, isBuyerMaker, isBestMatch }
      ]
    }
  }
}


export class TimeDelimiter extends DataDelimiter {
  constructor(size) {
    super()
    this.size = size
  }
  splitTickIfCandleOverflow(parsedTick) {
    if (this.lastCandle.time === null) this.lastCandle.time = parsedTick.time
    if (parsedTick.time - this.lastCandle.time <= this.size) return [parsedTick]
    else return [null, parsedTick]
  }
}

export class TickDelimiter extends DataDelimiter {
  constructor(size) {
    super()
    this.size = size
  }
  splitTickIfCandleOverflow(parsedTick) {
    if (this.lastCandle.ticks <= this.size) return [parsedTick]
    else return [null, parsedTick]
  }
}

function roundtQuantityTo(quantity, stepSize = 0.1) {
  const precision = Math.log10(1 / stepSize);
  const adjusted = Math.floor(quantity / stepSize) * stepSize;
  return Number(adjusted.toFixed(precision));
}

export class PriceDelimiter extends DataDelimiter {
  constructor(size) {
    super()
    this.size = size
  }
  splitTickIfCandleOverflow(parsedTick) {
    if (Math.abs((this.lastCandle.open || parsedTick.price) - parsedTick.price) <= this.size) return [parsedTick]
    else return [null, parsedTick]
  }
}

export class RangeDelimiter extends DataDelimiter {
  constructor(xv) {
    super();
    this.xv = xv;
    this.STEP_PRICE = 0.001
    this.priceXV = this.xv * this.STEP_PRICE
  }

  splitTickIfCandleOverflow(parsedTick) {
    if (this.lastCandle.high === null || this.lastCandle.low === null) {
      return [parsedTick];
    }


    const newOpen = roundtQuantityTo(this.lastCandle.open, this.STEP_PRICE)
    const newClose = roundtQuantityTo(parsedTick.price, this.STEP_PRICE)
    const newCandleDelta = Math.abs(newOpen - newClose)

    const prevCandle = this.candles[this.lastCandleId - 2]

    if (!prevCandle) {
      if (newCandleDelta <= this.priceXV) return [parsedTick];
      else return [null, parsedTick];
    }

    const prevOpen = roundtQuantityTo(prevCandle.open, this.STEP_PRICE)
    const prevClose = roundtQuantityTo(prevCandle.close, this.STEP_PRICE)
    const prevCandleDelta = Math.abs(prevClose - prevOpen)

    const fitsPrevCandleDirection = Math.sign(prevClose - prevOpen) === Math.sign(newClose - newOpen)

    if (fitsPrevCandleDirection) {
      if (newCandleDelta <= this.priceXV) return [parsedTick]
      else return [null, parsedTick];
    } else {
      if (newCandleDelta <= this.priceXV + prevCandleDelta) return [parsedTick];
      else return [null, parsedTick];
    }
  }
}

export class DataDelimiterStrategy {
  constructor (delimiterType, size) {
    if (delimiterType === 'volume') {
      return new VolumeDelimiter(size)
  } else if (delimiterType === 'qoutevolume') {
      return new QuoteVolumeDelimiter(size)
    } else if (delimiterType === 'tick') {
      return new TickDelimiter(size)
    } else if (['hour', 'min', 'sec'].includes(delimiterType)) {
      if (delimiterType === 'hour') size *= 3600 * 1000
      if (delimiterType === 'min') size *= 60 * 1000
      if (delimiterType === 'sec') size *= 1000
      return new TimeDelimiter(size)
    } else if (delimiterType === 'price') {
      return new PriceDelimiter(size)
    } else if (delimiterType === 'rangexv') {
      return new RangeDelimiter(size)
    } else {
      throw new Error(`(DataDelimiterStrategy) [Exception]: Unknown delimiter type: "${delimiterType}"`)
    }
  }
}