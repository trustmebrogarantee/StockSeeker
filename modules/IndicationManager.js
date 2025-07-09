import { CONFIG } from "./config.js"

/**
 * @typedef {Object} IndicationMap
 * @property {typeof BasicChartIndication} basic
 * @property {typeof DotChartIndication} dot - 
 * @property {typeof CandleIndication} candle
 * @property {typeof BuyIndication} buy
 * @property {typeof SellIndication} sell
 * @property {typeof BuyTakeProfitIndication} buyTakeProfit
 * @property {typeof SellTakeProfitIndication} sellTakeProfit
 * @property {typeof VolumeChatIndication} volume
 * @property {typeof BuyStopLossIndication} buyStopLoss
 * @property {typeof SellStopLossIndication} sellStopLoss
 * @property {typeof PriceMaximaIndication} priceMaxima
 * @property {typeof PriceMinimaIndication} priceMinima
 * @property {typeof AnomalyCluster} anomalyCluster
 * @property {typeof BullishDeltaDivirgence} bullishDeltaDivirgence
 * @property {typeof BearishDeltaDivirgence} bearishDeltaDivirgence
 */

/* Chart Indications */
class BasicChartIndication {
  constructor(tick) {
    this.tick = tick
    this.type = 'basic'
    this.zIndex = CONFIG.view.chart.zIndex.underCandles
  }

  static draw() {
    throw new Error(`(BasicChartIndication) [Error]: Method "draw()" is not implemented for indicator ${this.prototype.name}`)
  }
}

class DotChartIndication extends BasicChartIndication {
  constructor(tick) {
    super(tick)
    this.type = 'dot'
    this.zIndex = CONFIG.view.chart.zIndex.overCandles
  }

  static draw(ctx, x, y) {
    ctx.strokeStyle = 'black'
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.stroke();
  }
}

class AnomalyCluster extends BasicChartIndication {
  constructor(tick, ratio) {
    super(tick, ratio)
    this.type = 'anomalyCluster'
    this.ratio = ratio
    this.zIndex = CONFIG.view.chart.zIndex.overCandles
  }

  static draw(ctx, x, y) {
    const width = 12
    const height = 12
    ctx.fillStyle = '#800080a3'
    ctx.beginPath();
    ctx.fillRect(x - width * 0.5, y - height * 0.5, width, height);
    ctx.fill();
  }
}

/* Candle Indications */
class CandleIndication extends BasicChartIndication {
  constructor(tick, candleId) {
    super(tick)
    this.type = 'candle'
    this.candleId = candleId
    this.zIndex = CONFIG.view.chart.zIndex.overCandles
  }
}

class BuyIndication extends CandleIndication {
  constructor(tick, candleId) {
    super(tick, candleId)
    this.type = 'buy'
  }
  static draw(ctx, x, y) {
    ctx.strokeStyle = 'green'
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.stroke();
  }
}

class SellIndication extends CandleIndication {
  constructor(tick, candleId) {
    super(tick, candleId)
    this.type = 'sell'
  }
  static draw(ctx, x, y) {
    ctx.strokeStyle = 'yellow'
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.stroke();
  }
}

class BuyTakeProfitIndication extends CandleIndication {
  constructor(tick, candleId) {
    super(tick, candleId)
    this.type = 'buyTakeProfit'
  }
  static draw(ctx, x, y) {
    ctx.fillStyle = 'green'
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fill();
  }
}

class SellTakeProfitIndication extends CandleIndication {
  constructor(tick, candleId) {
    super(tick, candleId)
    this.type = 'sellTakeProfit'
  }
  static draw(ctx, x, y) {
    ctx.fillStyle = 'yellow'
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fill();
  }
}

class BuyStopLossIndication extends CandleIndication {
  constructor(tick, candleId) {
    super(tick, candleId)
    this.type = 'buyStopLoss'
  }
  static draw(ctx, x, y) {
    ctx.fillStyle = 'red'
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fill();
  }
}

class SellStopLossIndication extends CandleIndication {
  constructor(tick, candleId) {
    super(tick, candleId)
    this.type = 'sellStopLoss'
  }
  static draw(ctx, x, y) {
    ctx.fillStyle = 'orange'
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fill();
  }
}

class BullishDeltaDivirgence extends CandleIndication {
  constructor(tick, candleId) {
    super(tick, candleId)
    this.type = 'bullishDeltaDivirgence'
  }

  static draw(ctx, x, y) {
    ctx.fillStyle = 'blue'
    ctx.beginPath();
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.fill();
  }
}

class BearishDeltaDivirgence extends CandleIndication {
  constructor(tick, candleId) {
    super(tick, candleId)
    this.type = 'bearishDeltaDivirgence'
  }
  static draw(ctx, x, y) {
    ctx.fillStyle = 'purple'
    ctx.beginPath();
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.fill();
  }
}

class PriceMaximaIndication extends CandleIndication {
  constructor(tick, candleId) {
    super(tick, candleId)
    this.type = 'priceMaxima'
  }
  static draw(ctx, x, y) {
    ctx.fillStyle = 'green'
    ctx.beginPath();
    ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.fill();
  }
}

class PriceMinimaIndication extends CandleIndication {
  constructor(tick, candleId) {
    super(tick, candleId)
    this.type = 'priceMinima'
  }
  static draw(ctx, x, y) {
    ctx.fillStyle = 'red'
    ctx.beginPath();
    ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.fill();
  }
}

class VolumeChatIndication extends CandleIndication {
  constructor(tick, candleId) {
    super(tick, candleId)
    this.type = 'volume'
  }
}

/** @type {IndicationMap} */
export const Indication = {
  basic: BasicChartIndication,
  dot: DotChartIndication,
  candle: CandleIndication,
  buy: BuyIndication,
  sell: SellIndication,
  buyTakeProfit: BuyTakeProfitIndication,
  sellTakeProfit: SellTakeProfitIndication,
  volume: VolumeChatIndication,
  buyStopLoss: BuyStopLossIndication,
  sellStopLoss: SellStopLossIndication,
  priceMaxima: PriceMaximaIndication,
  priceMinima: PriceMinimaIndication,
  anomalyCluster: AnomalyCluster,
  bearishDeltaDivirgence: BearishDeltaDivirgence,
  bullishDeltaDivirgence: BullishDeltaDivirgence
}

/** @class */
export class IndicationManager {
  /** @constructor */
  constructor(account, analysis, tradeStrategy) {
    /** @type {IndicationInstance[]} */
    this.indications = []

    account.on('bet:new', bet => {
      if (bet.type === 'buy') this.addIndication('buy', bet.tick)
      else if (bet.type === 'sell') this.addIndication('sell', bet.tick)
    })

    account.on('bet:take-profit', (_, bet)  => {
      if (bet.type === 'buy') this.addIndication('buyTakeProfit', bet.tick)
      else if (bet.type === 'sell') this.addIndication('sellTakeProfit', bet.tick)
    })

    account.on('bet:stop-loss', (_, bet)  => {
      if (bet.type === 'buy') this.addIndication('buyStopLoss', bet.tick)
      else if (bet.type === 'sell') this.addIndication('sellStopLoss', bet.tick)
    })

    // analysis.on('price-maxima', (partialTick) => {
    //    this.addIndication('priceMaxima', partialTick)
    // })

    // analysis.on('price-minima', (partialTick) => {
    //   this.addIndication('priceMinima', partialTick)
    // })

    // analysis.on('anomaly-cluster', (tick, volume) => {
    //   this.addIndication('anomalyCluster', tick)
    // })

    // analysis.on('bullish-delta-divirgence', (tick, candleId) => {
    //   this.addIndication('bullishDeltaDivirgence', tick, candleId)
    // })
    // analysis.on('bearish-delta-divirgence', (tick, candleId) => {
    //   this.addIndication('bearishDeltaDivirgence', tick, candleId)
    // })
  }
  /**
   * @param {keyof IndicationMap} type
   * @param {number} tick
   * @param {string|number} [candle]
   */
  addIndication(type, tick, candle) {
    this.indications.push(new Indication[type](tick, candle))
  }
}