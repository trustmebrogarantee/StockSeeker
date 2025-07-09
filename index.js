import WebSocket from 'ws'
import { createServer } from 'node:http';
import { BinanceService } from './modules/BinanceService.js';
import { TradeHistoryFile } from './modules/TradeHistoryFile.js';
import { CONFIG } from './modules/config.js';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { generatePNGChart } from './modules/view/generateChart.js';
import { Account } from './modules/tick_processor/Account.js';
import { TradeStrategy } from './modules/tick_processor/TradeStrategy.js';
import { Analysis } from './modules/tick_processor/Analysis.js';
import { Statistics } from './modules/Statistics.js';
import { IndicationManager } from './modules/IndicationManager.js';
import { AccountBinance } from './modules/tick_processor/AccountBinance.js';
import { format, parse } from 'date-fns';
import { Trader } from './modules/Trader.js';
import { checkCSVTradeDataIntegrity } from './util/checkCSVTradeDataIntegrity.js';
import { MLClient } from './modules/ml/MLClient.js';

const DATA_SOURCES = {
  binance: 'BINANCE',
  binanceTestnet: 'BINANCE_TESTNET'
}

const MODE = {
  download: 'download',
  analysis: 'analysis',
  charting: 'charting',
  trading: 'trading',
  checkDataIntegrity: 'check-data-integrity',
  testAccount: 'test-account',
  scalping: 'scalping'
}

const MARKET = {
  // USDM client is currently not supported
  usdm: 'USDM',
  spot: 'SPOT'
}

const runOptions = {
  runningMode: MODE.analysis,
  market: MARKET.spot,
  symbol: 'DOTUSDT',
  dataSource: DATA_SOURCES.binance,
  accountSouce: DATA_SOURCES.binanceTestnet,
  ticksLimit: 1000,
  fromId: null,
  fromDate: parse('01.05.2024 00:00:00Z', 'dd.MM.yyyy HH:mm:ssX', new Date()),
  generateChart: false,
  generateCandles: false
}

const tradingAssets = [
  {
    symbol: 'DOTUSDT',
    delimiter: 'volume:10000',
    deltaDiverdenceAt: 0.8,
    fromDate: parse('01.01.2025 00:00:00Z', 'dd.MM.yyyy HH:mm:ssX', new Date())
  },
  {
    symbol: 'ATOMUSDT',
    delimiter: 'volume:1000',
    deltaDiverdenceAt: 0.8,
    fromDate: parse('01.05.2024 00:00:00Z', 'dd.MM.yyyy HH:mm:ssX', new Date())
  },
  {
    symbol: 'LINKUSDT',
    delimiter: 'volume:1000',
    deltaDiverdenceAt: 0.8,
    fromDate: parse('01.05.2024 00:00:00Z', 'dd.MM.yyyy HH:mm:ssX', new Date())
  },
  {
    symbol: 'AVAXUSDT',
    delimiter: 'rangexv:60',
    deltaDiverdenceAt: 0.8,
    fromDate: parse('02.09.2022 00:00:00Z', 'dd.MM.yyyy HH:mm:ssX', new Date())
  },
  {
    symbol: 'ADAUSDT',
    delimiter: 'volume:45000',
    deltaDiverdenceAt: 0.85,
    fromDate: parse('01.09.2022 00:00:00Z', 'dd.MM.yyyy HH:mm:ssX', new Date())
  }
]

async function runMultipleAssets (assets) {
  const dataHttpClient = new BinanceService().httpClient()
  const wss = new WebSocket.Server({ port: 9092 });
  const wsClient = runOptions.runningMode === MODE.trading ? new BinanceService().wsClient() : null;

  if (wsClient) {
    wsClient.on('reconnecting', (data) => {
      console.log('Websocket automatically reconnecting...');
    });
    wsClient.on('reconnected', (data) => {
      console.log('Websocket has reconnected ', data?.wsKey);
    });
    wsClient.on('error', (data) => {
      console.log('Websocket saw error ', data?.wsKey);
    });
}

  const account = new Account(1000, 250)
  const binanceAccount = runOptions.runningMode === MODE.trading ? new AccountBinance(dataHttpClient, wsClient, 10, CONFIG.telegram.secret) : null;
  
  for (const asset of assets) {
    console.log('Running:', asset.symbol)

    const broadcastToClients = (message) => {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ message, asset }));
        }
      });
    }

    const options = { ...runOptions, ...asset }
    const NAME_FOR_FILES = `${options.dataSource}_${options.symbol}_${options.market}_FROM_${format(options.fromDate, 'dd_MM_yyyy_HH_mm_ss')}Z`
    const filePaths = {
      historicalTrades: resolve(CONFIG.paths.cache.historicalTrades, `${NAME_FOR_FILES}.csv`),
      candlesData: resolve(CONFIG.paths.cache.candles, `${NAME_FOR_FILES}.json`),
      charts: resolve(CONFIG.paths.cache.charts, `${NAME_FOR_FILES}.png`),
    }

    const [tick] = await dataHttpClient.getAggregateTrades({ startTime: Number(options.fromDate), symbol: options.symbol, limit: 1 })
    const MAX_ALLOWED_TICKS_PER_REQUEST = 1000

    const tradeHistoryFile = new TradeHistoryFile(dataHttpClient, filePaths.historicalTrades,  {
      symbol: options.symbol,
      limit:  Math.min(options.ticksLimit, MAX_ALLOWED_TICKS_PER_REQUEST),
      fromId: tick.a,
    })

    // const _commissionRates = await detaHttpClient.getCommissionRates({ symbol: options.symbol })
    const comissionRates = {
      symbol: options.symbol,
      makerCommissionRate: 0.001,
      takerCommissionRate: 0.001
    }

    const mlClient = new MLClient()
    const analysis = new Analysis()
    const tradeStrategy = new TradeStrategy(analysis, account, options.symbol, comissionRates, mlClient)
    const stats = new Statistics(account, analysis)
    const indicationManager = new IndicationManager(account, analysis, tradeStrategy)

    const CANDLE_DELIMITER = options.delimiter

    let recentlyClosedCandle = null
    tradeHistoryFile.on('candle-close', (candle, candles) => {
      recentlyClosedCandle = candle
      if (candle) analysis.processCandleClose(candle, candles)
    })

    const tickCallback = async (tick, chart) => {
      analysis.processTick(tick, chart.lastCandle, recentlyClosedCandle, chart.candles)
      await tradeStrategy.processTick(tick, chart.lastCandle, recentlyClosedCandle, chart.candles)
      account.processTick(tick)
    }
  
    if (options.runningMode === MODE.download) {
      await tradeHistoryFile.fetchHistoricalTrades()
    } else if (options.runningMode === MODE.checkDataIntegrity) {
      checkCSVTradeDataIntegrity(filePaths.historicalTrades)
    } else if (options.runningMode === MODE.analysis) {
      let start = Date.now()
      const analytics = await tradeHistoryFile.walkTradeHistory(CANDLE_DELIMITER, tickCallback)
      const statistics = stats.calculateStats()
      account.writeResultsToCSV()
      console.table(statistics)
      let end = Date.now()
      console.log('Execution', ((end - start) / 1000).toFixed(2) + 's');

      const clusterToArray = (cluster) => [cluster.price, cluster.volume, cluster.bid, cluster.ask, cluster.volumeDelta, cluster.position, cluster.evaluation, cluster.absorption]
      broadcastToClients({ assetCandlestics: analytics.delimitedData.candles.map(c => ({ ...c, clusters: Object.values(c.clusters).map(clusterToArray) })) })
      broadcastToClients({ priceLevels: Object.values(analysis.strongLevels.levels) })
      broadcastToClients({ streaks: account.streaks })
      broadcastToClients({ volumeProfiles: analysis.vp.cache })
      broadcastToClients({ priceActions: { priceEvents: tradeStrategy.priceEvents, priceEventsTimestamps: tradeStrategy.priceEventsTimestamps, priceEventsPrices: tradeStrategy.priceEventsPrices } })
      broadcastToClients({ volatility: { sma: analysis.volatility.smaList, stdDev: analysis.volatility.stdDevList } })
      broadcastToClients({ extremum: { highs: analysis.highLow.highs, lows: analysis.highLow.lows } })

      if (options.generateCandles) {
        writeFileSync(filePaths.candlesData, JSON.stringify({ body: { indications: indicationManager.indications, candles: analytics.delimitedData.candles, statistics } }), 'utf8')
        if (options.generateChart) {
          const chart = generatePNGChart(`${options.symbol} ${options.dataSource}`, JSON.parse(readFileSync(filePaths.candlesData, 'utf8')))
          writeFileSync(filePaths.charts, chart, 'utf8');
        }
      }
    } else if (options.runningMode === MODE.charting) {
      const chart = generatePNGChart(`${options.symbol} ${options.dataSource}`, JSON.parse(readFileSync(filePaths.candlesData, 'utf8')))
      writeFileSync(filePaths.charts, chart, 'utf8');
    } else if (options.runningMode === MODE.trading) {
      const trader = new Trader(dataHttpClient, wsClient, tradeHistoryFile, options.symbol)
      tradeStrategy.on('tick', (m) => broadcastToClients(m))
      tradeStrategy.on('tick-filled', (m) => broadcastToClients(m))
      binanceAccount.sendTelegramMessage(`⚙️ Trading bot is running for symbol: ${options.symbol}`)
      binanceAccount.sendTelegramMessage(`⚙️ Using SYSTEM PORTS\nbot: 9000\nclient: 9092\nml_server: 9070`)
      await trader.fillHistoryGapsThenStartAnalysisThenTrade(CANDLE_DELIMITER, tickCallback)
      const statistics = stats.calculateStats()
      console.table(statistics)
      console.log(`Replacing emulator with real account for ${options.symbol}...`)
      tradeStrategy.account = binanceAccount
    } else if (options.runningMode === MODE.testAccount) {
      const wsClient = new BinanceService().wsClient()
      const binance = new AccountBinance(dataHttpClient, wsClient, 10, CONFIG.telegram.secret)
      binance.sendTelegramMessage(`⚙️ Trading bot is running for symbol: ${options.symbol}`)
      binance.sendTelegramMessage(`⚙️ Using SYSTEM PORTS\nbot: 9000\nclient: 9092\nml_server: 9070`)
    } else if (options.runningMode === MODE.scalping) {
  
      const restClient = new BinanceService().httpClient()
      const wsClient = new BinanceService().wsClient()
      const wsApiClient = new BinanceService().wsApiClient()

      const useTicker = (wsClient, onUpdate = null) => {
        const _ticker = {
          bestBid: null,
          bestAsk: null
        }
        wsClient.subscribeSymbolBook_('AVAXUSDT', 'usdm')
        wsClient.on('message', data => {
          if (data.e === 'bookTicker' && data.streamName === 'avaxusdt@bookTicker' && data.wsMarket === 'usdm') {
            _ticker.bestBid = data.b
            _ticker.bestAsk = data.a
            if (onUpdate) onUpdate(_ticker)
          }
        })
        return _ticker
      }

      const useOrderBook = (wsClient, wsApiClient, onUpdate) => {
         const orderBook = {
          lastUpdateId: null,
          bids: new Map(),
          asks: new Map(),
        }
        wsApiClient.getFuturesOrderBook({ symbol: 'AVAXUSDT', limit: 1000 }).then(({ response }) => {
          orderBook.lastUpdateId = response.lastUpdateId;
          for (let i = 0; i < Math.max(response.bids.length, response.asks.length); i++) {
            if (i < response.bids.length) {
            const key = Number(response.bids[i][0])
            const value = Number(response.bids[i][1])
              orderBook.bids.set(key, value)
            }
            if (i < response.asks.length) {
              const key = Number(response.asks[i][0])
              const value = Number(response.asks[i][1])
              orderBook.bids.set(key, value)
            }
          }
        })
      }

      const ticker = useTicker(wsClient)


      // Fetch initial order book snapshot

      // Process WebSocket depth updates
      function processDepthUpdate(data) {
        const { U: firstUpdateId, u: finalUpdateId, pu: prevFinalUpdateId, b: bids, a: asks } = data;

        // Validate update sequence
        if (orderBook.lastUpdateId && firstUpdateId <= orderBook.lastUpdateId + 1 && finalUpdateId >= orderBook.lastUpdateId + 1) {
          // Update bids
          for (const [price, qty] of bids) {
            if (parseFloat(qty) === 0) {
              orderBook.bids.delete(price);
            } else {
              orderBook.bids.set(price, qty);
            }
          }

          // Update asks
          for (const [price, qty] of asks) {
            if (parseFloat(qty) === 0) {
              orderBook.asks.delete(price);
            } else {
              orderBook.asks.set(price, qty);
            }
          }

          orderBook.lastUpdateId = finalUpdateId;
          console.log('Order book updated:', {
            bids: Array.from(orderBook.bids.entries()).slice(0, 5), // Top 5 bids
            asks: Array.from(orderBook.asks.entries()).slice(0, 5), // Top 5 asks
          });
        } else {
          console.warn('Out-of-sync update detected, resyncing...');
          fetchOrderBookSnapshot();
        }
      }

      // Start the process

      async function start() {
        const { result: response } = await wsApiClient.getFuturesOrderBook({ symbol: 'AVAXUSDT', limit: 1000 })
        orderBook.lastUpdateId = response.lastUpdateId;
        for (let i = 0; i < Math.max(response.bids.length, response.asks.length); i++) {
          if (i < response.bids.length) {
            const key = Number(response.bids[i][0])
            const value = Number(response.bids[i][1])
            orderBook.bids.set(key, value)
          }
          if (i < response.asks.length) {
            const key = Number(response.asks[i][0])
            const value = Number(response.asks[i][1])
            orderBook.bids.set(key, value)
          }
        }
        // await fetchOrderBookSnapshot(); // Fetch initial snapshot
        // wsApiClient.subscribe('AVAXUSDT@depth@100ms'); // Subscribe to depth stream
      }

      start();
    }
  }
}

const server = createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$');
})

server.listen(CONFIG.server.port, CONFIG.server.hostname, async () => {
  const assets = ['AVAXUSDT']
  setTimeout(() => {
    runMultipleAssets(tradingAssets.filter(asset => assets.includes(asset.symbol)))
  }, 5000)
});