import { aggTickToRegular } from "./common.js"

export class Trader {
  constructor(httpClient, wsClient, historyFile, symbol) {
    this.wsClient = wsClient
    this.historyFile = historyFile
    this.ticksToProcess = []
    this.firstWsTick = null
    this.isAnalysisComplete = false
    this.symbol = symbol
    this.prevTickId = null
    this.httpClient = httpClient
    this.blockedToFetch = false
  }

  async subscribeToDataStreams(tickCallback) {
    return new Promise((resolve) => {
      this.wsClient.on('message', async (data) => {
        if (data.e === 'aggTrade' && data.s === this.symbol) {
          const tick = aggTickToRegular(data)

          if (this.isAnalysisComplete && this.prevTickId && tick.id !== this.prevTickId + 1 && !this.blockedToFetch) {
            this.blockedToFetch = true
            let prevTickId = this.prevTickId
            const fetchParams = { fromId: prevTickId, symbol: this.symbol, limit: tick.id - prevTickId }
            const aggTrades = await this.httpClient.getAggregateTrades(fetchParams)
            const missedTrades = aggTrades.map(aggTickToRegular).filter(t => t.id > prevTickId && t.id < tick.id)
            this.ticksToProcess.push(...missedTrades)
            console.log('missed ticks spotted', missedTrades.map(t => t.id))
            this.ticksToProcess.sort((a, b) => a.id - b.id)
            this.blockedToFetch = false
          }

          if (!this.firstWsTick) {
            this.firstWsTick = tick
            this.ticksToProcess.push(tick)
            resolve(this.firstWsTick)
          } else {
            this.ticksToProcess.push(tick)
            if (!this.isAnalysisComplete || this.blockedToFetch) return
            while (this.ticksToProcess.length > 0) {
              const currentTick = this.ticksToProcess.shift()
              this.historyFile.processTick(currentTick, tickCallback)
              this.prevTickId = currentTick.id
            }
          }
        }
      });
      this.wsClient.subscribeSpotAggregateTrades(this.symbol);
    })
  }

  async fillHistoryGapsThenStartAnalysisThenTrade (lookBackRange, tickCallback) {
    const firstTick = await this.subscribeToDataStreams(tickCallback)
    await this.historyFile.fetchHistoricalTrades(firstTick.id)
    await this.historyFile.walkTradeHistory(lookBackRange, tickCallback)
    this.isAnalysisComplete = true
  }
}