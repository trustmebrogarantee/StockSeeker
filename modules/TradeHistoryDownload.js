import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { aggTickToRegular, startLoading } from './common.js';

export class TradeHistoryDownload {
  constructor(httpClient, outputFile, fetchParams) {
    this.httpClient = httpClient
    this.outputFile = outputFile
    this.fetchParams = fetchParams
    this.stream = createWriteStream(this.outputFile, { flags: 'a' });
    this.stream.on('finish', () => this.log('INFO', 'All data written successfully'));
    this.stream.on('error', (err) => this.log('ERROR', 'Stream error', { error: err.message }));
    this.isOutputCSVFileExisting = existsSync(this.outputFile)

    this.lastWrittenQueueIndex = 0
    this.isLoaded = false
    this.writeQueue = []
  }

  async start(callback, toId = null) {
    if (this.isOutputCSVFileExisting) {
      this.fetchParams.fromId = await this.findLastTradeId()
      this.fetchParams.fromId += 1
    }

    const REAL_LIMIT = this.fetchParams.limit
    
    return new Promise((resolve, reject) => {
      const RATE_LIMIT_DELAY = (60_000 / 5000) * 4;
      let index = 1

      if (this.fetchParams.limit <= 0) {
        this.isLoaded = true
        resolve()
        return
      }
      
      const fetchNextTrade = () => {
        setTimeout(() => {
          let localIndex = index
          let fetchParams = { fromId: this.fetchParams.fromId, limit: this.fetchParams.limit, symbol: this.fetchParams.symbol }
          if (toId) fetchParams.limit = Math.min(toId - fetchParams.fromId, REAL_LIMIT)
          if (fetchParams.limit < 1) {
            console.log(`(TradeHistoryDownload) [Info]: ${fetchParams.symbol} history is loaded!`);
            resolve()
            return
          }

          this.httpClient.getAggregateTrades(fetchParams)
            .then(aggTrades => {
              if (this.isLoaded) return
              if (aggTrades.length === 0) {
                this.isLoaded = true
                console.log(`(TradeHistoryDownload) [Info]: ${fetchParams.symbol} history is loaded!`);
                resolve()
                return
              }
              this.writeQueue.push({ trades: aggTrades.map(aggTickToRegular), index: localIndex })
              this.resolveWriteQueue(callback)
            })
            .catch(error => {
              console.error(error)
              reject(error)
            })
            
            this.fetchParams.fromId += this.fetchParams.limit
            index++
            fetchNextTrade()
          }, RATE_LIMIT_DELAY)
        }
      fetchNextTrade()
    })
  }

  tradesToCSV(trades) {
    let CSVContent = ''
    for (const trade of trades) {
      CSVContent += `${trade.id};${trade.price};${trade.qty};${trade.quoteQty};${trade.time};${trade.isBuyerMaker};${trade.isBestMatch}\n`
    }
    return CSVContent
  }

  resolveWriteQueue(callback) {
    for (let i = 0; i < this.writeQueue.length; i++) {
      const queueItem = this.writeQueue[i]
      if (queueItem.index - 1 === this.lastWrittenQueueIndex) {
        let written = false;
        const firstTrade = queueItem.trades.at(0)
        const lastTrade = queueItem.trades.at(-1)
        written = this.stream.write(this.tradesToCSV(queueItem.trades))
        this.lastWrittenQueueIndex = queueItem.index
        this.writeQueue.splice(i, 1)
        if (callback) callback(firstTrade.id, lastTrade.id, lastTrade.time);
      }
    }
  }

  findLastTradeId() {
    return new Promise((resolve) => {
      const readStream = createReadStream(this.outputFile);
      const rl = createInterface({ input: readStream });
      let lastLine = null;
      rl.on('line', (line) => {        
        if (line) lastLine = line;
      });
      rl.on('close', () => {
        if (lastLine) {
          const [id] = lastLine.split(';');
          resolve(parseInt(id, 10));
        } else {
          resolve(this.fetchParams.fromId);
        }
      });
      readStream.on('error', (err) => {
        if (err.code === 'ENOENT') {
          resolve(this.fetchParams.fromId);
        } else {
          this.log('ERROR', 'Failed to read output file', { error: err.message });
          resolve(this.fetchParams.fromId);
        }
      });
    });
  }
}