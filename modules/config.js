/**
 * @typedef {Object} Config
 * @property {{ cache: { historicalTrades: string, candles: string } }} paths
 * @property {{ key: string, secret: string, baseUrl: string }} api
 * @property {{ key: string, secret: string, baseUrl: string }} testnetApi
 * @property {{ hostname: string, port: number }} server
 * @property {{ chart: { zIndex: { underCandles: number, candles: number, overCandles: number } } }} view
 */

/**
 * Configuration constant
 * @type {Config}
 */
export const CONFIG = {
  paths: {
    cache: {
      historicalTrades: process.env.HISTORICAL_TRADES_PATH || './cache/historical_trades',
      candles: process.env.CANDLES_DATA_PATH || './cache/candles',
      charts: process.env.CHARTS_PATH || './cache/charts'
    },
  },
  api: {
    key: process.env.API_KEY || '***',
    secret: process.env.API_SECRET || '***',
    baseUrl: process.env.BASE_URL || 'https://api.binance.com',
  },
  testnetApi: {
    key: process.env.TESTNET_API_KEY || '***',
    secret: process.env.TESTNET_API_SECRET || '***',
    baseUrl: process.env.TESTNET_API_BASE_URL || 'https://testnet.binance.vision',
  },
  server: {
    hostname: process.env.SERVER_HOSTNAME || '127.0.0.1',
    port: parseInt(process.env.SERVER_PORT, 10) || 3000,
  },
  telegram: {
    secret: process.env.TG_BOT_SECRET || '***'
  },
  view: {
    chart: {
      zIndex: {
        underCandles: 10,
        candles: 20,
        overCandles: 30
      }
    }
  }
};