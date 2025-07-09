import { writeFileSync } from "node:fs"

export class Statistics {
  constructor(account, analysis) {
    this.totalDeals = 0
    this.totalWinDeals = 0
    this.totalLossDeals = 0
    this.activeDeals = 0
    this.money = account.money
    this.totalProfit = 0
    this.topProfit = 0
    this.topLoss = 0
    this.analysis = analysis
    this.firstBetOfThisMoth = null
    this.mediumData = { loss: [], profit: [] }
    this.analyze = {
      loss: [],
      profit: []
    }

    this.lossHistogram = {
      "0": 0,
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 0,
      "6": 0,
      "7": 0,
      "8": 0,
      "9": 0,
      "10": 0
    }

    this.profitHistogram = {
      "0": 0,
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 0,
      "6": 0,
      "7": 0,
      "8": 0,
      "9": 0,
      "10": 0
    }
    
    account.on('bet:new', (bet) => {
      if (this.firstBetOfThisMoth === null || bet.tick.time > this.firstBetOfThisMoth + 60_000 * 60 * 24 * 30) {
        // console.log(' Month start: ' + new Date(this.firstBetOfThisMoth).toLocaleString(), this.totalWinDeals / (this.totalDeals - this.activeDeals))
        this.firstBetOfThisMoth = bet.tick.time
      }
      this.totalDeals++
      this.activeDeals++
    })

    account.on('bet:take-profit', (dealProfit, bet) => {
      this.mediumData.profit.push(bet.log)
      this.analyze.profit.push(bet.stat)
      this.totalProfit += dealProfit
      this.activeDeals--
      this.totalWinDeals++
      if (dealProfit > this.topProfit) this.topProfit = dealProfit
      if (`${bet.log}` in this.profitHistogram) this.profitHistogram[bet.log]++
    })

    account.on('bet:stop-loss', (dealLoss, bet) => {
      this.mediumData.loss.push(bet.log)
      this.analyze.loss.push(bet.stat)
      this.totalProfit -= dealLoss
      this.activeDeals--
      this.totalLossDeals++
      if (dealLoss > this.topLoss) this.topLoss = dealLoss
      if (`${bet.log}` in this.lossHistogram) this.lossHistogram[bet.log]++
    })

    account.on('money:change', (money) => {
      this.money = money
    })
  }

  
  calculateStats() {
    const x = {
      ...this,
      winrate: this.totalWinDeals / (this.totalDeals - this.activeDeals),
      mediumLogLoss: this.mediumData.loss.reduce((acc, d) => acc + d, 0) / this.mediumData.loss.length,
      mediumLogProfit: this.mediumData.profit.reduce((acc, d) => acc + d, 0) / this.mediumData.profit.length,
      maxForLoss: Math.max(...this.mediumData.loss),
      maxForProfit: Math.max(...this.mediumData.profit),
      minForLoss: Math.min(...this.mediumData.loss),
      minForProfit: Math.min(...this.mediumData.profit),
    }
    
    delete x.analysis
    delete x.mediumData
    delete x.lossHistogram
    delete x.profitHistogram

    setTimeout(() => {
      console.log('Profit Histogram')
      console.table(this.profitHistogram) 
      console.log('------------------')
      console.log('Loss Histogram')
      console.table(this.lossHistogram) 
    })
    // writeFileSync('loss.json', JSON.stringify(this.analyze.loss), 'utf8')
    // writeFileSync('profit.json', JSON.stringify(this.analyze.profit), 'utf8')
    delete x.analyze
    return x
  }
}