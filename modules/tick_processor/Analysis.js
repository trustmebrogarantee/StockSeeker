import { SD_2 } from "../math/ContinuosStandardDeviation.js";
import { _BaseTickProcessor } from "./_BaseTickProcessor.js";
import { createRequire } from 'node:module';
import { ExtremumDetector } from './indicators/ExtremumDetector.js'

import { SpeedOfTape } from "./indicators/SpeedOfTape.js";
import { VolumeClusters } from "./indicators/VolumeClusters.js";
import { VWAPIndicator } from "./indicators/VWAPIndicator.js";
import { Volume } from "./indicators/Volume.js";
import { BollingerBands } from "./indicators/BollingerBands.js";
import { VolumeSMA } from "./indicators/VolumeSMA.js";
import { RSI } from "./indicators/RSI.js";
import { EMA } from "./indicators/EMA.js";
import { ATR } from "./indicators/ATR.js";
import { KnifeDetector } from "./indicators/KnifeDetector.js";
import chalk from "chalk";
import { VolumeProfile } from "./indicators/VolumeProfile.js";
import { TickSlidingWindow } from "../../util/tick/TickSlidingWindow.js";
import { VolumeBalance } from "./indicators/VolumeBalance.js";
import { VolumeClusterAnalyzer } from "./indicators/VolumeClusterAnalyzer.js";
import { AvgTickCount } from "./indicators/AvgTickCount.js";
import { VP } from "./indicators/VP.js";
import { CVDAngleTracker } from "./indicators/CvdAngleTracker.js";
import { StrongLevels } from "./indicators/StrongLevels.js";
import { BidAsk } from "./indicators/BidAsk.js";
import { MonthlyTopCandles } from "./indicators/MonthlyTopCandles.js";
import { Absorption } from "./indicators/Absorption.js";
import { CvdPricePairs } from "./indicators/CvdPricePairs.js";
import { Volatility } from "./indicators/Volatility.js";
import { HighLow } from "./indicators/HighLow.js";

let prevHigh = null
let prevLow = null

function calculateNearestHigh (candle) {
  if (!prevHigh) prevHigh = candle.high
  if (!prevLow) prevLow = candle.low
  if (candle.low > prevLow && candle.high > prevHigh) prevHigh = candle.high
  if (candle.low < prevLow && candle.high < prevHigh) prevLow = candle.low
}

function calculateSMA(ohlcData, lookback, priceType = 'close') {
  const startFrom = ohlcData.length - 2
  let sum = 0
  for (let i = startFrom; i > startFrom - lookback; i--) {
    sum += ohlcData[i][priceType]
  }
  return sum / lookback
}

function calculateATR(ohlcData, period) {
  const startFrom = ohlcData.length - 2; // -2 because last candle is not yet formed
  let sum = 0;
  for (let i = startFrom; i > startFrom - period; i--) {
    const high = ohlcData[i].high;
    const low = ohlcData[i].low;
    const prevClose = ohlcData[i - 1].close;
    const trueRange = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    sum += trueRange;
  }
  return sum / period;
}

function calculateVolumeDeltaSum(ohlcData, period = 5) {
  const startFrom = ohlcData.length - 3; // -3 because last candle is not yet formed and we do not count prev
  let sum = 0;
  for (let i = startFrom; i > startFrom - period; i--) {
    sum += ohlcData[i].volumeDelta
  }
  return sum;
}

function calculateCVD (ohlcData, period = 10) {
  const startFrom = ohlcData.length - 2
  let cvd = 0
  for (let i = startFrom; i > startFrom - period; i--) {
    cvd += ohlcData[i].volumeDelta
  }
  return cvd
}

function calculateCPD (ohlcData, period) {
  const startFrom = ohlcData.length - 2
  let cpd = 0
  for (let i = startFrom; i > startFrom - period; i--) {
    cpd += ohlcData[i].priceDelta
  }
  return cpd === 0 ? 0.1 : cpd
}

export class Analysis extends _BaseTickProcessor {
  constructor() {
    super()
    this.isDeltaDivergence = false
    this.priceDeviation = new SD_2() 
    this.volumeDeviation = new SD_2()
    this.isWarmUp = true
    this.ticks = 0
    this.prevCandle = null
    this.prevPrevCandle = null
    this.window = new TickSlidingWindow(1000 * 60 * 60 * 24)

    this.isPriceMaxima = false
    this.isPriceMinima = false

    this.bearishSeria = 0
    this.isBullishDivergenceOnBearishCandle = false
    this.isAnomalyCluster = false

    
    this.knifeEvent = null
    this.volumeClusters = new VolumeClusters(0.01)
    this.cvdToPriceDiffRatio = 0
    
    this.vwap95m = new VWAPIndicator(95)
    this.vwap245m = new VWAPIndicator(245)
    
    // this.speedOfTape = new SpeedOfTape()
    // this.volume = new Volume()
    // this.bollingerBands = new BollingerBands(11, 2)
    // this.volumeSMA = new VolumeSMA(20)
    // this.rsi = new RSI(14)
    // this.ema = new EMA(50)
    // this.atr = new ATR(10)
    // this.knifeDetector = new KnifeDetector()
    this.volumeProfile = new VolumeProfile()
    this.vPOC = 0
    // this.volumeBalance = new VolumeBalance()
    // this.volumeClusterAnalyzer = new VolumeClusterAnalyzer({
      //   priceBinSize: 0.01,
      //   windowSizeMs: 60 * 60 * 1000, // 1 hour
      //   minVolumeThreshold: 4000,
      //   extremumLookbackTicks: 10000
      // })
      // this.volumeDominanceOverPrice = 0
    this.sma125c = 0
    this.sma125v = 0.1
    
    this.sma400c = 0
    this.sma400v = 0.1
    
    this.sma100c = 0
    this.latestVolumeDeltaSum = 0
    
    this.highDeltaDivergenceFormedAt = null
    this.highDeltaDivergence = false
    this.highDeltaDivergenceActivatedAt = null
    this.isWeakSellerVolume = false
    
    this.avgTickCount = new AvgTickCount(20)
    this.atr14 = 0
    this.candleVolumeDelimiter = 1
    this.localHigh = null
    this.localLow = null

    this.cvd100 = 0
    this.cpd100 = 0
    
    this.cvd20 = 0
    this.cpd20 = 0

    this.cvd10 = 0
    this.cpd10 = 0

    this.cvd5 = 0
    this.cpd5 = 0

    this.cvd3 = 0
    this.cpd3 = 0

    this.vp = new VP()
    this.strongLevels = new StrongLevels()

    this.pocClusters = []
    this.pocExhaustionRow = 0

    this.highExtremums3i = []
    this.lowExtremums3i = []

    this.highExtremums6i = []
    this.lowExtremums6i = []

    this.highExtremums12i = []
    this.lowExtremums12i = []

    this.prevLow = null

    // this.bidAsk1h = new BidAsk(60 * 60 * 1000)
    // this.bidAsk24h = new BidAsk(24 * 60 * 60 * 1000)
    // this.bidAsk7d = new BidAsk(7 * 24 * 60 * 60 * 1000)
    this.vp.on('profile-completed', profile => {
      this.strongLevels.addPOC(profile.vpoc, profile.vpocTime)
    })

    this.monthlyTopCandles = new MonthlyTopCandles()
    this.absorption = new Absorption(this.monthlyTopCandles)

    this.cvdPricePairs = new CvdPricePairs()

    this.volatility = new Volatility(7)
    this.highLow = new HighLow(this.volatility)

    // this.cvdAngleTracker = new CVDAngleTracker()
  }

  // Is extremum ? look for delta ?

  processCandleClose(recentlyClosedCandle, candles) {
    this.candleVolumeDelimiter = recentlyClosedCandle.volume
    this.monthlyTopCandles.processCandle(recentlyClosedCandle)
    this.absorption.processCandle(recentlyClosedCandle)
    this.cvdPricePairs.processCandle(recentlyClosedCandle)
    this.volatility.processCandle(recentlyClosedCandle)
    this.highLow.processCandle(recentlyClosedCandle)

    if (candles.length > 80) {
      const window = candles.slice(candles.length - 15, candles.length - 5)
      let min = window[0]
      for (let i = 0; i < window.length; i++) {
        if (window[i].close < min) min = window[i]
      }
      this.prevLow = min
    }

    if (candles.at(-2)) {
      const pocCluster = recentlyClosedCandle.clusters[recentlyClosedCandle.poc]
      const prevCluster = this.pocClusters.at(-1) || { volume: 0, price: 0, bid: 0, ask: 0 }
      if (pocCluster.price > prevCluster.price) this.pocExhaustionRow++
      else this.pocExhaustionRow = 0
      this.pocClusters.push(pocCluster)
    }

    if (candles.length % 3 === 0) {
      let high_i = candles.length - 3
      let low_i = candles.length - 3
      for (let i = candles.length - 2; i < candles.length; i++) {
        if (candles[i].high > candles[high_i].high) high_i = i
        if (candles[i].low < candles[low_i].low) low_i = i
      }
      this.highExtremums3i.push(high_i)
      this.lowExtremums3i.push(low_i)
      if (candles.length % 6 === 0) {
        this.highExtremums6i.push(candles[this.highExtremums3i.at(-1)].high > candles[this.highExtremums3i.at(-2)].high ? this.highExtremums3i.at(-1) : this.highExtremums3i.at(-2))
      }
      if (candles.length % 12 === 0) {

      }
    }




    // 90.17
    // this.bidAsk1h.processCandle(recentlyClosedCandle)
    // this.bidAsk24h.processCandle(recentlyClosedCandle)
    // this.bidAsk7d.processCandle(recentlyClosedCandle)

    if (recentlyClosedCandle.topCluster.evaluation >= 5) {
      this.strongLevels.addCluster(recentlyClosedCandle.topCluster.price, recentlyClosedCandle.time)
    }

    if (candles.at(-2)) {
      this.strongLevels.onCandleClose(recentlyClosedCandle, candles.at(-2))
    }

    const SMA_L = 125
    if (candles.length > SMA_L + 1) {
      this.sma125c = calculateSMA(candles, SMA_L)
      this.sma125v = calculateSMA(candles, SMA_L, 'volumeDelta') 
    }

    const SMA400_L = 400
    if (candles.length > SMA400_L + 1) {
      this.sma400c = calculateSMA(candles, SMA400_L)
      this.sma400v = calculateSMA(candles, SMA400_L, 'volumeDelta') 
    }
    
    const ATR14_L = 14
    if (candles.length > ATR14_L + 1) {
      this.atr14 = calculateATR(candles, ATR14_L)
    }

    const LVDS = 5
    if (candles.length > LVDS + 2) {
      this.latestVolumeDeltaSum = calculateVolumeDeltaSum(candles, 5)
    }

    if (candles.length > 2) {
      const currentCandle = recentlyClosedCandle
      const prevCandle = candles[candles.length - 3]
      this.cvdToPriceDiffRatio = (currentCandle.volumeDelta / prevCandle.volumeDelta) / ((currentCandle.priceDelta || 0.001) / (prevCandle.priceDelta || 0.001))
    }

    /*
        const CVD100_L = 100
    if (candles.length > CVD100_L + 1) {
      this.cvd100 = calculateCVD(candles, CVD100_L)
    }
    const CPD100_L = 100
    if (candles.length > CPD100_L + 1) {
      this.cpd100 = calculateCPD(candles, CPD100_L)
    }

    const CVD20_L = 20
    if (candles.length > CVD20_L + 1) {
      this.cvd20 = calculateCVD(candles, CVD20_L)
    }
    const CPD20_L = 20
    if (candles.length > CPD20_L + 1) {
      this.cpd20 = calculateCPD(candles, CPD20_L)
    }

    const CVD10_L = 10
    if (candles.length > CVD10_L + 1) {
      this.cvd10 = calculateCVD(candles, CVD10_L)
    }
    const CPD10_L = 10
    if (candles.length > CPD10_L + 1) {
      this.cpd10 = calculateCPD(candles, CPD10_L)
    }

    const CVD5_L = 5
    if (candles.length > CVD5_L + 1) {
      this.cvd5 = calculateCVD(candles, CVD5_L)
    }
    const CPD5_L = 5
    if (candles.length > CPD5_L + 1) {
      this.cpd5 = calculateCPD(candles, CPD5_L)
    }

    const CVD3_L = 3
    if (candles.length > CVD3_L + 1) {
      this.cvd3 = calculateCVD(candles, CVD3_L)
    }
    const CPD3_L = 3
    if (candles.length > CPD3_L + 1) {
      this.cpd3 = calculateCPD(candles, CPD3_L)
    }
    */

    const CVD100_L = 100
    if (candles.length > CVD100_L + 1) {
      this.cvd100 = calculateCVD(candles, CVD100_L)
    }
    const CPD100_L = 100
    if (candles.length > CPD100_L + 1) {
      this.cpd100 = calculateCPD(candles, CPD100_L)
    }

    const CVD20_L = 20
    if (candles.length > CVD20_L + 1) {
      this.cvd20 = calculateCVD(candles, CVD20_L)
    }
    const CPD20_L = 20 // 10
    if (candles.length > CPD20_L + 1) {
      this.cpd20 = calculateCPD(candles, CPD20_L)
    }

    const CVD10_L = 10
    if (candles.length > CVD10_L + 1) {
      this.cvd10 = calculateCVD(candles, CVD10_L)
    }
    const CPD10_L = 10
    if (candles.length > CPD10_L + 1) {
      this.cpd10 = calculateCPD(candles, CPD10_L)
    }

    const CVD5_L = 5
    if (candles.length > CVD5_L + 1) {
      this.cvd5 = calculateCVD(candles, CVD5_L)
    }
    const CPD5_L = 5
    if (candles.length > CPD5_L + 1) {
      this.cpd5 = calculateCPD(candles, CPD5_L)
    }

    const CVD3_L = 3
    if (candles.length > CVD3_L + 1) {
      this.cvd3 = calculateCVD(candles, CVD3_L)
    }
    const CPD3_L = 3
    if (candles.length > CPD3_L + 1) {
      this.cpd3 = calculateCPD(candles, CPD3_L)
    }



    calculateNearestHigh(recentlyClosedCandle)
    this.localHigh = prevHigh
    this.localLow = prevLow

    this.avgTickCount.processCandle(recentlyClosedCandle)

    this.isBullishDivergenceOnBearishCandle = recentlyClosedCandle.volumeDelta > 0 && recentlyClosedCandle.volumeDelta / recentlyClosedCandle.volume >= 0.41
    this.isWeakSellerVolume = recentlyClosedCandle.priceDelta < 0 && recentlyClosedCandle.volumeDelta < 0 && this.sma150v > 0 && Math.abs(recentlyClosedCandle.volumeDelta) / this.sma150v < 0.45
  }

  processTick(tick, currentCandle) {
    // this.cvdAngleTracker.processTick(tick)
    this.vwap95m.processTick(tick)
    this.vwap245m.processTick(tick)
    this.vPOC = this.volumeProfile.processTick(tick).vpoc
    this.vp.processTick(tick)



    // Calculate highDeltaDivergenceFormedAt
    if (this.prevCandle) {
      const isCandleCloseDivergence = this.prevCandle.volumeDelta > 0 &&
                                      this.prevCandle.priceDelta < 0

      this.highDeltaDivergence = isCandleCloseDivergence
    }
  
    // We do not trade on if isWarmUp is true
    if (this.isWarmUp === true && this.ticks > 1_000_000) this.isWarmUp = false
    
    this.prevCandle = currentCandle
    this.ticks++
  }
}