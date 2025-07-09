import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import readline from "node:readline";
import { createInterface } from 'node:readline';
import { aggTickToRegular, countLines, delay, extractTradeDelimiterOptions, startLoading } from './common.js';
import { DataDelimiterStrategy } from './DataDelimiterStrategy.js';
import CsvReadableStream from 'csv-reader';
import chalk from 'chalk';
import { TradeHistoryDownload } from './TradeHistoryDownload.js';
import { EventEmitter } from 'eventemitter3';

export class TradeHistoryFile extends EventEmitter {
  constructor(httpClient, outputFile, fetchParams) {
    super()
    this.httpClient = httpClient;
    this.outputFile = outputFile
    this.isOutputCSVFileExisting = existsSync(this.outputFile)
    this.stream = null
    this.fetchParams = fetchParams;
    this.lastTrade = null;
    this.prevLastTrade = null;
    this.isFirstRun = true;
    this.delimitedData = null
    this.progress = { current: 1, total: Number.MAX_SAFE_INTEGER }
    this.isAnalysisComplete = false
  }

  log(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level}: ${message}`, metadata);
  }

  async walkTradeHistory(candleDelimiter, tickCallback) {
    this.isAnalysisComplete = false
    const [delimiterType, size] = extractTradeDelimiterOptions(candleDelimiter);
    this.delimitedData = new DataDelimiterStrategy(delimiterType, size);
    const statistics = { delimitedData: this.delimitedData };
    this.progress = { current: 1, total: Number.MAX_SAFE_INTEGER };

    this.delimitedData.on('candle-close', (data, candles) => {
      if (data) this.emit('candle-close', data, candles)
    })

    if (!this.isOutputCSVFileExisting) {
      console.error(chalk.red(`(walkTradeHistory) [Error]: Cannot find CSV data ${this.outputFile}. First download it with fetchHistoricalTrades()`))
      return { statistics }
    }    

    // this.progress.total = await countLines(this.outputFile);
    const inputStream = createReadStream(this.outputFile, 'utf8');
    const readInterface = readline.createInterface({ input: inputStream })

    for await (const line of readInterface){
      const parsedTick = this.delimitedData.parseTick(line)
      await this.processTick(parsedTick, tickCallback, this.progress)
    }

    this.emit('analysis:complete', statistics)
    this.isAnalysisComplete = true
    console.log(this.progress.current)
    return statistics;
  }

  async processTick(parsedTick, tickCallback, progress) {
    this.delimitedData.supplyLastCandle(parsedTick);
    await tickCallback(parsedTick, this.delimitedData);
    if (progress) progress.current++;
  }

  async fetchHistoricalTrades (toId = null) {
    const download = new TradeHistoryDownload(this.httpClient, this.outputFile, this.fetchParams)
    return download.start((firstTrade, lastTrade, lastTradeTime) => {
      this.log('INFO', 'Trades written', {
        fromId: firstTrade,
        toId: lastTrade,
        date: new Date(lastTradeTime).toLocaleString(),
      })
    }, toId)
  }
}