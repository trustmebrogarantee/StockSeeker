import chalk from "chalk";
import { _BaseTickProcessor } from "./_BaseTickProcessor.js";
import TelegramBot from 'node-telegram-bot-api'

function adjustQuantity(quantity, stepSize) {
  const precision = Math.log10(1 / stepSize);
  const adjusted = Math.floor(quantity / stepSize) * stepSize;
  return Number(adjusted.toFixed(precision));
}

export class AccountBinance extends _BaseTickProcessor {
  constructor(httpClient, wsClient, minBet = 10, tgBotSecret) {
    super()
    this.money = 0
    this.minBet = minBet
    this.httpClient = httpClient
    this.wsClient = wsClient
    this.updateBalance()
    this.isProcessing = false
    this.tgBot = new TelegramBot(tgBotSecret, { polling: true });
    this.chatId = -4953999520

    this.exchangeInfo = null 
    this.httpClient.getExchangeInfo({ recvWindow: 60000 })
      .then((ei) => {  this.exchangeInfo = ei;  
        console.log(this.exchangeInfo.symbols.find((s) => s.symbol === 'AVAXUSDT').filters.find((f) => f.filterType === 'LOT_SIZE')) })
    
    this.account = null
    this.httpClient.getAccountInformation({ omitZeroBalances: true, recvWindow: 60000 })
      .then(info => { this.account = info })
    
    this.wsClient.subscribeSpotUserDataStream();

    this.wsClient.on('message', (data) => {
      if (data.e === 'executionReport') {
        if (data.o === 'TAKE_PROFIT' && data.X === 'FILLED' && Number(data.Z) > 0) {
          console.log('REAL_PROFIT:', chalk.green(`$${Number(data.Z).toFixed(2)}`))
          this.sendTelegramMessage(`🤑 Executed TAKE_PROFIT`)
          this.updateBalance()
        } else if (data.o === 'STOP_LOSS' && data.X === 'FILLED' && Number(data.Z) > 0) {
          console.log('REAL_LOSS:', chalk.red(`$${Number(data.Z).toFixed(2)}`))
          this.sendTelegramMessage(`😞 Executed STOP_LOSS`)
          this.updateBalance()
        }
      } else if (data.e === 'outboundAccountPosition') {
        this.updateBalance()
      }
    });
  }

  sendTelegramMessage(txt) {
    try {
      this.tgBot.sendMessage(this.chatId, txt);
    } catch (e) {
      console.error(e)
    }
  }

  processTick(tick, lastCandle, prevCandle) {}

  canAffordBet() {
    return this.money > this.minBet
  }

  async updateBalance () {
    setTimeout(async () => {
      try {
        const balance = await this.httpClient.getPrivate('sapi/v1/capital/config/getall', { recvWindow: 60000 })
        const usdtBal = balance.find((assetBal) => assetBal.coin === 'USDT');
        const usdtAvailable = Number(usdtBal?.free);
        this.money = usdtAvailable
        console.log(chalk.bgWhite(chalk.black(`Updated real balance: ${chalk.cyan(`$${this.money}`)}`)))
        this.sendTelegramMessage(`💵 Updated real balance: $${this.money}`)
        this.isProcessing = false
        return usdtAvailable
      } catch (err) {
        console.log('ERROR: COULD NOT UPDATE BALANCE')
        console.error(err)
        process.exit(1)
      }
    }, 1000)
  }

  async addActiveBet({ symbol, tick, id, type, betSize, risk, reward, stopLoss, takeProfit, log, stat }) {
    if (this.isProcessing) return
    this.isProcessing = true
    if (!this.exchangeInfo) return console.error(`Error: No exchange info`)
    const symbolInfo = this.exchangeInfo.symbols.find((s) => s.symbol === symbol);
    if (!symbolInfo) return console.error(`Error: Symbol ${symbol} not found in exchange info`)

    const lotSizeFilter = symbolInfo.filters.find((f) => f.filterType === 'LOT_SIZE');
    const priceFilter = symbolInfo.filters.find((f) => f.filterType === 'PRICE_FILTER');
    const qtyStepSize = parseFloat(lotSizeFilter.stepSize);
    const priceStepSize = parseFloat(priceFilter.tickSize);

    if (type === 'buy') {
      try {
        if (this.money < this.minBet) return
        const ticker = await this.httpClient.getSymbolPriceTicker({ symbol: symbol });
        const lastPrice = ticker?.price;
        if (!lastPrice) return console.error('Error: no price returned')
        const buyAmount = Number((betSize / Number(lastPrice)));
        const buyOrderRequest = {
          symbol: symbol,
          quantity: adjustQuantity(buyAmount, qtyStepSize),
          side: 'BUY',
          type: 'MARKET',
          newOrderRespType: 'FULL',
        };
        
        const buyOrderResult = await this.httpClient.submitNewOrder(buyOrderRequest)
        // const assetAmountBought = buyOrderResult.executedQty;
        const assetFillsMinusFees = buyOrderResult.fills.reduce((sum, fill) => sum + Number(fill.qty) - (fill.commissionAsset !== 'BNB' ? Number(fill.commission) : 0), 0);

        try {
          const sellOrderRequest = {
            symbol: symbol,
            side: 'SELL',
            aboveType: 'TAKE_PROFIT',
            aboveStopPrice: takeProfit,

            belowType: 'STOP_LOSS',
            belowStopPrice: stopLoss,

            newOrderRespType: 'FULL',
            quantity: adjustQuantity(assetFillsMinusFees, qtyStepSize)
          };
          const sellOrderResult = await this.httpClient.submitNewOrderList(sellOrderRequest);
          console.log(
            `${chalk.green('BUY')} ${symbol} EXECUTED:`, 
            `BUY: ${chalk.yellow(buyOrderRequest.quantity)}/${chalk.yellow(`$${lastPrice}`)}/${chalk.yellow(`$${(+buyOrderRequest.quantity * lastPrice).toFixed(2)}`)}`, 
            `BOUGHT: ${sellOrderRequest.quantity}`, 
            'STOP_LOSS:', chalk.yellow(`$${sellOrderRequest.belowStopPrice}`),
            'TAKE_PROFIT:', chalk.yellow(`$${sellOrderRequest.aboveStopPrice}`)
          )
          this.sendTelegramMessage(`💎 Executed: BUY of ${symbol}, bought: ${sellOrderRequest.quantity} at price: $${lastPrice}\nSTOP_LOSS AT: $${sellOrderRequest.belowStopPrice}\nTAKE_PROFIT AT: $${sellOrderRequest.aboveStopPrice}`)
        } catch (err) {
          const sellOrderRequest = {
            symbol: symbol,
            quantity: adjustQuantity(assetFillsMinusFees, qtyStepSize),
            side: 'SELL',
            type: 'MARKET',
            newOrderRespType: 'FULL',
          };
          const sellOrderResult = await this.httpClient.submitNewOrder(sellOrderRequest)
          console.error('Error: request failed: ', e);
          process.exit(1)
        }
        this.emit('bet:new', { symbol, tick, id, type, betSize, risk, reward, stopLoss, takeProfit, log, stat })
        // console.log(`SELL_STOP_LOSS_LIMIT Order result: `, JSON.stringify({ request: sellOrderRequest, response: sellOrderResult }, null, 2));
      } catch (e) {
        console.error('Error: request failed: ', e);
        process.exit(1)
      }
    }
  }
}