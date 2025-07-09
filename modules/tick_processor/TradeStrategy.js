import chalk from "chalk";
import { _BaseTickProcessor } from "./_BaseTickProcessor.js";
import { AccountBinance } from "./AccountBinance.js";

function adjustQuantity(quantity, stepSize) {
  const precision = Math.log10(1 / stepSize);
  const adjusted = Math.floor(quantity / stepSize) * stepSize;
  return Number(adjusted.toFixed(precision));
}

function roundQuantityTo(number, step) {
  return Number((Math.floor(number / step) * step).toFixed(2))
}

function calculateBuyExodus(tickPrice, stopLoss, takeProfit, accountMoney, distanceFactor = 1, comissionRates = { makerCommissionRate: 0.001, takerCommissionRate: 0.001 }) {
  // Adjust quantity for base asset
  const baseAssetBought = adjustQuantity(accountMoney / tickPrice, 0.01);
  const baseAssetFee = baseAssetBought * comissionRates.makerCommissionRate;
  const actuallyBaseAssetBought = baseAssetBought - baseAssetFee;

  // Fee factor
  const feeFactor = 1 - comissionRates.makerCommissionRate;

  // If stopLoss or takeProfit is null, calculate them for risk/reward = 0.25
  let adjustedStopLoss = stopLoss;
  let adjustedTakeProfit = takeProfit;

  if (stopLoss === null || takeProfit === null) {
    // Default risk distance (1% of tickPrice, scaled by distanceFactor)
    const baseRiskDistance = tickPrice * 0.01;
    const riskDistance = baseRiskDistance * distanceFactor;

    if (stopLoss === null) {
      adjustedStopLoss = adjustQuantity(tickPrice - riskDistance, 0.01);
    }

    if (takeProfit === null) {
      // Calculate takeProfit for risk/reward = 0.25
      const Q = actuallyBaseAssetBought;
      const M = accountMoney;
      const C = feeFactor;
      const S = adjustedStopLoss;

      // risk = (M / (Q * S * C)) - 1
      const risk = (M / (Q * S * C)) - 1;
      // Want reward = risk / 0.25
      const targetReward = risk / 0.25;
      // reward = (Q * T * C / M) - 1
      // T = (targetReward + 1) * M / (Q * C)
      adjustedTakeProfit = adjustQuantity((targetReward + 1) * M / (Q * C), 0.01)
    }
  }
  

  // Calculate quote asset values
  const quoteAssetTakeProfit = actuallyBaseAssetBought * adjustedTakeProfit;
  const quoteAssetTakeProfitFee = quoteAssetTakeProfit * comissionRates.makerCommissionRate;
  const actuallyQuoteAssetTakeProfit = quoteAssetTakeProfit - quoteAssetTakeProfitFee;

  const quoteAssetStopLoss = actuallyBaseAssetBought * adjustedStopLoss;
  const quoteAssetStopLossFee = quoteAssetStopLoss * comissionRates.makerCommissionRate;
  const actuallyQuoteAssetStopLoss = quoteAssetStopLoss - quoteAssetStopLossFee;

  // Calculate risk and reward
  const risk = (accountMoney / actuallyQuoteAssetStopLoss) - 1;
  const reward = (actuallyQuoteAssetTakeProfit / accountMoney) - 1;

  return {
    risk,
    reward,
    moneyOnTakeProfit: actuallyQuoteAssetTakeProfit,
    moneyOnStopLoss: actuallyQuoteAssetStopLoss,
    stopLoss: adjustedStopLoss,
    takeProfit: adjustedTakeProfit
  };
}

// Main function for short position in perpetual futures
function calculateSellExodus(tickPrice, stopLoss, takeProfit, accountMoney, distanceFactor = 1, comissionRates = { makerCommissionRate: 0.001, takerCommissionRate: 0.001 }) {
  const stepSize = 0.01;
  const baseAssetSold = adjustQuantity(accountMoney / tickPrice, stepSize);
  const makerCommissionRate = comissionRates.makerCommissionRate;

  // Set stop loss
  let adjustedStopLoss;
  if (stopLoss === null) {
    const baseRiskDistance = tickPrice * 0.01;
    const riskDistance = baseRiskDistance * distanceFactor;
    adjustedStopLoss = adjustQuantity(tickPrice + riskDistance, stepSize);
  } else {
    adjustedStopLoss = stopLoss;
  }

  // Calculate outcomes at stop loss
  const opening_commission = (baseAssetSold * tickPrice) * makerCommissionRate;
  const closing_commission_stop = (baseAssetSold * adjustedStopLoss) * makerCommissionRate;
  const PnL_stop = (tickPrice - adjustedStopLoss) * baseAssetSold;
  const net_PnL_stop = PnL_stop - opening_commission - closing_commission_stop;
  const moneyOnStopLoss = accountMoney + net_PnL_stop;
  const risk = (accountMoney / moneyOnStopLoss) - 1;

  // Set take profit
  let adjustedTakeProfit;
  if (takeProfit === null) {
    const targetReward = risk / 0.5;
    const takeProfitRaw = tickPrice - (targetReward * accountMoney) / baseAssetSold;
    adjustedTakeProfit = adjustQuantity(takeProfitRaw, stepSize);
  } else {
    adjustedTakeProfit = takeProfit;
  }

  // Calculate outcomes at take profit
  const closing_commission_take = (baseAssetSold * adjustedTakeProfit) * makerCommissionRate;
  const PnL_take = (tickPrice - adjustedTakeProfit) * baseAssetSold;
  const net_PnL_take = PnL_take - opening_commission - closing_commission_take;
  const moneyOnTakeProfit = accountMoney + net_PnL_take;
  const reward = (moneyOnTakeProfit / accountMoney) - 1;

  // Return results
  return {
    risk,
    reward,
    moneyOnTakeProfit,
    moneyOnStopLoss,
    stopLoss: adjustedStopLoss,
    takeProfit: adjustedTakeProfit
  };
}

export class TradeStrategy extends _BaseTickProcessor {
  constructor(analysis, account, symbol, comissionRates, mlClient) {
    super()
    this.analysis = analysis
    this.account = account
    this.symbol = symbol
    this.comissionRates = comissionRates
    this.lastTradeTick = 0;
    this.COOLDOWN_TICKS = 100; // Adjust based on backtest
    this.ticks = 0
    this.mlClient = mlClient
    this.analysis.vp.on('profile-completed', this.defineStrategy.bind(this))
    this.tradeOnCandle = null
    this.profile = null
    this.priceAction = {
      normalProfile: false,
      openInsideValueArea: false,
      openBelowValueArea: false,
      openAboveValueArea: false,
    }

    this.priceEvents = []
    this.priceEventsPrices = []
    this.priceEventsTimestamps = []

    this.eventLastIndex = {
      insideVA: -1,
      outsideVA: -1,
      belowVA: -1,
      aboveVA: -1,
      criticallyAboveVA: -1,
      criticallyBelowVA: -1,
      cameToVal: -1,
      cameToVah: -1,
      skip: -1
    }



    this.balanceBuy = ['normal-profile', 'open-inside-value-area', 'came-to-val']
    this.balanceFalseFalloutBuy = ['normal-profile', 'open-inside-value-area', 'came-to-val', 'fell-off-a-little', 'got-sell-absorbtion']
    this.balanceReturnBuy = ['normal-profile', 'open-below-value-area', 'came-to-val', 'inside-value-area', 'came-to-val']
  }

  async processTick(tick, currentCandle, prevCandle, candles) {
    this.generatePriceEvents(tick, currentCandle, prevCandle, candles)
    // this.buyLowSMAOnPositiveDelta(tick,  currentCandle, prevCandle)
    await this.buyHighDeltaDivergence(tick, currentCandle, prevCandle, candles)
    // this.buyWeakSellerVolume(tick)
    this.ticks++
  }

  registerEvent(name, time, price) {
    this.eventLastIndex[name] = this.priceEvents.length
    this.priceEvents.push(name)
    this.priceEventsTimestamps.push(time)
    this.priceEventsPrices.push(price)
  }

  generatePriceEvents(tick, currentCandle, prevCandle) {
    if (!this.profile) return

    const dVA = this.profile.vah - this.profile.val
    const dVah = tick.price - this.profile.vah
    const dVal = this.profile.val - tick.price

    // 
    if (this.priceEvents.at(-1) === 'insideVA' || this.priceEvents.at(-1) === 'aboveVA') {
      if (tick.price >= this.profile.vah && dVah / dVA <= 0.01) {
        this.registerEvent('cameToVah', tick.time, tick.price)
      }
    }
    if (this.priceEvents.at(-1) === 'cameToVah' || this.priceEvents.at(-1) === 'criticallyAboveVA') {
      if (tick.price < this.profile.vah && Math.abs(dVah) / dVA > 0.1) {
        this.registerEvent('insideVA', tick.time, tick.price)
      }
      if (tick.price >= this.profile.vah && dVah / dVA > 0.1 && dVah / dVA < 0.25) {
        this.registerEvent('aboveVA', tick.time, tick.price)
      } 
    }
    if (this.priceEvents.at(-1) === 'aboveVA') {
      if (tick.price >= this.profile.vah && dVah / dVA >= 0.25) {
        this.registerEvent('criticallyAboveVA', tick.time, tick.price)
      }
    }

    //
    if (this.priceEvents.at(-1) === 'insideVA' || this.priceEvents.at(-1) === 'belowVA') {
      if (tick.price <= this.profile.val && dVal / dVA <= 0.01) {
        this.registerEvent('cameToVal', tick.time, tick.price)
      }
    }
    if (this.priceEvents.at(-1) === 'cameToVal' || this.priceEvents.at(-1) === 'criticallyBelowVA') {
      if (tick.price < this.profile.val && Math.abs(dVal) / dVA > 0.1) {
        this.registerEvent('insideVA', tick.time, tick.price)
      }
      if (tick.price <= this.profile.val && dVal / dVA > 0.1 && dVal / dVA < 0.25) {
        this.registerEvent('belowVA', tick.time, tick.price)
      }
    }
    if (this.priceEvents.at(-1) === 'belowVA') {
      if (tick.price <= this.profile.val && dVal / dVA >= 0.25) {
        this.registerEvent('criticallyBelowVA', tick.time, tick.price)
      }
    }
  }

  async defineStrategy(profile) {
    // this.priceEvents = []
    // this.eventLastIndex = {
    //   insideVA: -1,
    //   outsideVA: -1,
    //   belowVA: -1,
    //   aboveVA: -1,
    //   criticallyAboveVA: -1,
    //   criticallyBelowVA: -1,
    //   cameToVal: -1,
    //   cameToVah: -1
    // }

    this.profile = profile
    this.priceAction.normalProfile = profile.normality >= 0.85
    this.priceAction.openInsideValueArea = profile.closedAtPrice > profile.val && profile.closedAtPrice < profile.vah
    this.priceAction.openBelowValueArea = profile.closedAtPrice < profile.val
    this.priceAction.openAboveValueArea = profile.closedAtPrice > profile.vah

    if (this.priceAction.normalProfile && this.priceAction.openInsideValueArea) {
      this.registerEvent('insideVA', profile.endedAt, profile.closedAtPrice)
    } else {
      this.registerEvent('skip', profile.endedAt, profile.closedAtPrice)
    }

    // const dVA = profile.vah - profile.val
    // const dVah = profile.closedAtPrice - profile.vah
    // const dVal = profile.val - profile.closedAtPrice
    
    // if (this.priceAction.openBelowValueArea) {
    //   if (dVal / dVA <= 0.25) {
    //     this.registerEvent('belowVA', profile.endedAt, profile.closedAtPrice)
    //   } else {
    //     this.registerEvent('criticallyBelowVA', profile.endedAt, profile.closedAtPrice)
    //   }
    // }

    // if (this.priceAction.openAboveValueArea) {
    //   if (dVah / dVA <= 0.25) {
    //     this.registerEvent('aboveVA', profile.endedAt, profile.closedAtPrice)
    //   } else {
    //     this.registerEvent('criticallyAboveVA', profile.endedAt, profile.closedAtPrice)
    //   }
    // }
  }

  async buyHighDeltaDivergence (tick, currentCandle, prevCandle, candles) {
    const { analysis, account } = this
    if (this.analysis.isWarmUp) return;
    if (account instanceof AccountBinance) this.emit('tick', { tick, money: account.money })
    if (account.canAffordBet()) {
      const tickPrice = tick.price;
      const accountMoney = account.money
      const distanceFactor = 4;
      const balanceOrientation = 1000
      const MAX_RISK = 0.02;
      const bet = accountMoney

      /* Just deals 
      │ totalDeals         │ 7306                │
      │ totalWinDeals      │ 1749                │
      │ totalLossDeals     │ 5556                │
      │ activeDeals        │ 1                   │
      │ money              │ 0                   │
      │ totalProfit        │ -15131.233851205028 │
      │ topProfit          │ 32.93263180160011   │
      │ topLoss            │ 13.319964027254994  │
      │ firstBetOfThisMoth │ 1750148676593       │
      │ winrate            │ 0.23942505133470227
      */

      // Надо попытаться опереться на кластеры как способ принятия решений
      // const factor = (tick.price - currentCandle.open) / (prevCandle.open - prevCandle.close)
      // const isPassing = isFinite(factor) && factor > 0.5 && currentCandle.tradedAskContracts > currentCandle.tradedBidContracts
      const lowExtr = analysis.highLow.latestLowExtremum
      const ccDelta = tick.price - currentCandle.open
      const pcDelta = prevCandle.open - prevCandle.close
      const fits = ccDelta > 0 && pcDelta > 0
      const stdDev = analysis.volatility.stdDev

      if (this.tradeOnCandle !== currentCandle && analysis.prevLow.close > prevCandle.close && analysis.prevLow.cvd < prevCandle.cvd && currentCandle.priceDelta > 0.055) {
        // if (
        //   candles.at(-4).priceDelta < 0 &&
        //   candles.at(-3).priceDelta < 0 &&
        //   candles.at(-2).priceDelta > 0 &&
        //   candles.at(-2).volumeDelta > 0
        // ) {
        this.tradeOnCandle = currentCandle
           const { takeProfit, stopLoss, risk, reward } = calculateBuyExodus(tickPrice, null, null, balanceOrientation, distanceFactor, this.comissionRates);

          this.account.addActiveBet({
            type: 'buy',
            tick,
            symbol: this.symbol,
            id: tick.id,
            stopLoss,
            takeProfit,
            betSize: bet,
            risk,
            reward, 
            vwap: '',
            log: analysis.prevLow.cvd / prevCandle.cvd,
            stat: {}
          });
        // }
      }

      // if (prevCandle.absorption < 0 && lowExtr.index === prevCandle.id && fits && ccDelta / pcDelta >= 0.5 && stdDev >= 0.04) {
      
      if (prevCandle.open > prevCandle.close && currentCandle.close > currentCandle.open && prevCandle.volumeDelta > 0 && prevCandle.volumeDelta / prevCandle.volume >= 0.1) {
        // 0.2308 - extr
        // 0.2394
        // 0.241 - absorption + extr + dd
        // 0.245 = absorption
        // 0.255 - absorption + extr

        }
    }
  }

  calculateNNModelFeatures(tick, prevCandle, takeProfit, stopLoss) {
    const { analysis, account } = this
    const { max, vah, vpoc, val, min, valueAreaVolume } = this.analysis.vp.getIndicators()
      
      const statForCache = {}
      for (let i = 0; i < this.analysis.vp.cache.length; i++) {
        const indicator = this.analysis.vp.cache[i]

        statForCache[`volume_profile_index_${i}_priceToMax`] = tick.price / indicator.max
        statForCache[`volume_profile_index_${i}_priceToVah`] = tick.price / indicator.vah
        statForCache[`volume_profile_index_${i}_priceToVal`] = tick.price / indicator.val
        statForCache[`volume_profile_index_${i}_priceToVpoc`] = tick.price / indicator.vpoc
        statForCache[`volume_profile_index_${i}_priceToMin`] = tick.price / indicator.min


        statForCache[`volume_profile_index_${i}_tpRatioToMaxRatio`] = (tick.price / takeProfit) / statForCache[`volume_profile_index_${i}_priceToMax`]
        statForCache[`volume_profile_index_${i}_tpRatioToVahRatio`] = (tick.price / takeProfit) / statForCache[`volume_profile_index_${i}_priceToVah`]
        statForCache[`volume_profile_index_${i}_tpRatioToValRatio`] = (tick.price / takeProfit) / statForCache[`volume_profile_index_${i}_priceToVal`]
        statForCache[`volume_profile_index_${i}_tpRatioToVpocRatio`] = (tick.price / takeProfit) / statForCache[`volume_profile_index_${i}_priceToVpoc`]
        statForCache[`volume_profile_index_${i}_tpRatioToMinRatio`] = (tick.price / takeProfit) / statForCache[`volume_profile_index_${i}_priceToMin`]

        statForCache[`volume_profile_index_${i}_slRatioToMaxRatio`] = (tick.price / stopLoss) / statForCache[`volume_profile_index_${i}_priceToMax`]
        statForCache[`volume_profile_index_${i}_slRatioToVahRatio`] = (tick.price / stopLoss) / statForCache[`volume_profile_index_${i}_priceToVah`]
        statForCache[`volume_profile_index_${i}_slRatioToValRatio`] = (tick.price / stopLoss) / statForCache[`volume_profile_index_${i}_priceToVal`]
        statForCache[`volume_profile_index_${i}_slRatioToVpocRatio`] = (tick.price / stopLoss) / statForCache[`volume_profile_index_${i}_priceToVpoc`]
        statForCache[`volume_profile_index_${i}_slRatioToMinRatio`] = (tick.price / stopLoss) / statForCache[`volume_profile_index_${i}_priceToMin`]

        statForCache[`volume_profile_index_${i}_tpToVpoc`] = takeProfit / indicator.vpoc
        statForCache[`volume_profile_index_${i}_tpToVah`] = takeProfit / indicator.vah
        statForCache[`volume_profile_index_${i}_tpToVal`] = takeProfit / indicator.val
        statForCache[`volume_profile_index_${i}_tpToMin`] = takeProfit / indicator.min
        statForCache[`volume_profile_index_${i}_tpToMax`] = takeProfit / indicator.max

        statForCache[`volume_profile_index_${i}_slToVpoc`] = stopLoss / indicator.vpoc
        statForCache[`volume_profile_index_${i}_slToVah`] = stopLoss / indicator.vah
        statForCache[`volume_profile_index_${i}_slToVal`] = stopLoss / indicator.val
        statForCache[`volume_profile_index_${i}_slToMin`] = stopLoss / indicator.min
        statForCache[`volume_profile_index_${i}_slToMax`] = stopLoss / indicator.max
      }

      return {
        ...statForCache,

        cvdToPriceDiffRatio: analysis.cvdToPriceDiffRatio,
        pcPriceDeltaToVolumeDelta: prevCandle.priceDelta / prevCandle.volumeDelta, 

        priceToTp: tick.price / takeProfit,
        priceToSl: tick.price / stopLoss,

        priceTpRatioToVpocRatio: (tick.price / takeProfit) / (tick.price / vpoc),
        priceTpRatioToValRatio: (tick.price / takeProfit) / (tick.price / val),
        priceTpRatioToVahRatio: (tick.price / takeProfit) / (tick.price / vah),
        priceTpRatioToMinRatio: (tick.price / takeProfit) / (tick.price / min),
        priceTpRatioToMaxRatio: (tick.price / takeProfit) / (tick.price / max),

        priceSlRatioToVpocRatio: (tick.price / stopLoss) / (tick.price / vpoc),
        priceSlRatioToValRatio: (tick.price / stopLoss) / (tick.price / val),
        priceSlRatioToVahRatio: (tick.price / stopLoss) / (tick.price / vah),
        priceSlRatioToMinRatio: (tick.price / stopLoss) / (tick.price / min),
        priceSlRatioToMaxRatio: (tick.price / stopLoss) / (tick.price / max),

        priceToMax: tick.price / max,
        priceToVah: tick.price / vah,
        priceToVal: tick.price / val,
        priceToVpoc: tick.price / vpoc,
        priceToMin: tick.price / min,

        tpToVpoc: takeProfit / vpoc,
        tpToVah: takeProfit / vah,
        tpToVal: takeProfit / val,
        tpToMin: takeProfit / min,
        tpToMax: takeProfit / max,

        slToVpoc: stopLoss / vpoc,
        slToVah: stopLoss / vah,
        slToVal: stopLoss / val,
        slToMin: stopLoss / min,
        slToMax: stopLoss / max,

        

        cvd3ToCpd3: this.analysis.cvd3 / this.analysis.cpd3,

        cvd5toCvd3: this.analysis.cvd5 / this.analysis.cvd3,
        cvd5toCpd3: this.analysis.cvd5 / this.analysis.cpd3,

        cvd5ToCpd5: this.analysis.cvd5 / this.analysis.cpd5,

        cvd10toCvd5: this.analysis.cvd10 / this.analysis.cvd5,
        cvd10toCpd5: this.analysis.cvd10 / this.analysis.cpd5,

        cvd10ToCpd10: this.analysis.cvd10 / this.analysis.cpd10,

        cvd20toCvd10: this.analysis.cvd20 / this.analysis.cvd10,
        cvd20toCpd10: this.analysis.cvd20 / this.analysis.cpd10,

        cvd20ToCpd20: this.analysis.cvd20 / this.analysis.cpd20,

        cvd100toCvd20: this.analysis.cvd100 / this.analysis.cvd20,
        cvd100toCpd20: this.analysis.cvd100 / this.analysis.cpd20,
        cvd100ToCpd100: this.analysis.cvd100 / this.analysis.cpd100,

        vpocToPrice: this.analysis.vPOC / tick.price,
        priceToLocalHigh: tick.price / this.analysis.localHigh,
        priceToLocelLow: tick.price / this.analysis.localLow,
        priceToSma125c: tick.price / this.analysis.sma125c,
        priceToSma400c: tick.price / this.analysis.sma400c,
        vwap95ToSma125c: this.analysis.vwap95m.vwap / this.analysis.sma125c,
        vwap245ToSma400c: this.analysis.vwap245m.vwap / this.analysis.sma400c,
        volumeDeltaToLatestVolumeDeltaSum:  prevCandle.volumeDelta / this.analysis.latestVolumeDeltaSum,
        isBullishDivergenceOnBearishCandle: this.analysis.isBullishDivergenceOnBearishCandle ? 1 : 0,
        tpToVwap95m: takeProfit / this.analysis.vwap95m.vwap,
        slToVwap95m: stopLoss / this.analysis.vwap95m.vwap,
        tpToVwap245m: takeProfit / this.analysis.vwap245m.vwap,
        slToVwap245m: stopLoss / this.analysis.vwap245m.vwap,
        tpToSma125c: takeProfit / this.analysis.sma125c,
        slToSma125c: stopLoss / this.analysis.sma125c,
        tpToSma400c: takeProfit / this.analysis.sma400c,
        slToSma400c: stopLoss / this.analysis.sma400c,
        sma125vToVolumeDelta: this.analysis.sma125v / prevCandle.volumeDelta,
        sma400vToVolumeDelta: this.analysis.sma400v / prevCandle.volumeDelta,
        atr14: (takeProfit - stopLoss) / this.analysis.atr14,
        avgTickCountToPcTicks: prevCandle.ticks / this.analysis.avgTickCount.getAvgTickCount(),
        stopLoss: stopLoss / tickPrice,
        takeProfit: takeProfit / tickPrice,

        pcOpenToClose: prevCandle.open / prevCandle.close,
        pcHighToLow: prevCandle.high / prevCandle.low,
        pcHighToClose: prevCandle.high / prevCandle.close,
        pcHighToOpen: prevCandle.high / prevCandle.open,
        pcLowToClose: prevCandle.low / prevCandle.close,
        pcLowtoOpen: prevCandle.low / prevCandle.open,
        buyVolumeShare: prevCandle.tradedAskContracts / prevCandle.volume,
        sellVolumeShare: prevCandle.tradedBidContracts / prevCandle.volume,
        volumeDeltaShare: prevCandle.volumeDelta / prevCandle.volume,
        pcDivirgence: prevCandle.indicators.deltaDivergence ? 1 : 0,
        vwap95Distance: (tick.price - this.analysis.vwap95m.vwap) / tick.price,
        vwap245Distance: (tick.price - this.analysis.vwap245m.vwap) / tick.price,
        clusterEvaluation: currentCandle.topCluster.evaluation,
        clusterAskBidRatio: (currentCandle.topCluster.ask || 1) / (currentCandle.topCluster.bid || 1)

      }
  }
}