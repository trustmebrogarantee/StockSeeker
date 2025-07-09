import { CoinMClient, MainClient, USDMClient, WebsocketClient, WebsocketAPIClient } from 'binance';
import { CONFIG } from './config.js';
/**
 * Binance API service for HTTP and WebSocket clients.
 */
export class BinanceService {
  /** @returns {MainClient} */
  httpClient() {
    return new MainClient({
      api_key: CONFIG.api.key,
      api_secret: CONFIG.api.secret,
      baseUrl: CONFIG.api.baseUrl
    });
  }

  testnetHttpClient() {
    return new MainClient({
      api_key: CONFIG.testnetApi.key,
      api_secret: CONFIG.testnetApi.secret,
      baseUrl: CONFIG.testnetApi.baseUrl
    })
  }

  /** @returns {WebsocketClient} */
  wsClient() {
    return new WebsocketClient({
      api_key: CONFIG.api.key,
      api_secret: CONFIG.api.secret,
    });
  }

  wsApiClient() {
    return new WebsocketAPIClient({
      api_key: CONFIG.api.key,
      api_secret: CONFIG.api.secret,
    })
  }
}