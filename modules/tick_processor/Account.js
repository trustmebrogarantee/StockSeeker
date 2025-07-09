import chalk from "chalk";
import { _BaseTickProcessor } from "./_BaseTickProcessor.js";
import { writeFileSync } from "node:fs";

export class Account extends _BaseTickProcessor {
  constructor(money = 0, minBet = Number.MAX_SAFE_INTEGER, silent = false) {
    super()
    this.money = money
    this.minBet = minBet
    this.activeBets = {}
    this.silent = silent
    this.csv = {
      txt: '',
      headers: null,
      data: [],
      dataJSON: [],
      lastAdded: ''
    },
    this.streaks = []
    this.currentStreak = { type: null, length: 0, deals: [] }
  }
  processTick(tick) {
    for (const deal of Object.values(this.activeBets)) {
      if (deal.type === 'buy') {
        if (tick.price <= deal.stopLoss) {
          this.resolveActiveBet(deal.id, false, tick)
        }
        else if (tick.price >= deal.takeProfit) {
          this.resolveActiveBet(deal.id, true, tick)
        }
      } else if (deal.type === 'sell') {
        if (tick.price >= deal.stopLoss) {
          this.resolveActiveBet(deal.id, false, tick)
        }
        else if (tick.price <= deal.takeProfit) {
          this.resolveActiveBet(deal.id, true, tick)
        }
      }
    }
  }
  canAffordBet() {
    return this.money > this.minBet
  }
  
  addActiveBet({ tick, id, type, betSize, risk, reward, stopLoss, takeProfit, log, stat }) {
    if (this.canAffordBet()) {
      this.money -= betSize
      this.emit('money:change', this.money)
      this.activeBets[id] = { tick, id, type, betSize, risk, reward, stopLoss, takeProfit, log, stat }
      this.emit('bet:new', this.activeBets[id])
    } 
  }

  addStatToCSV(stat, numWin) {
    const headers = []
    const dataRow = []
    for (const key of Object.keys(stat)) {
      headers.push(key)
      dataRow.push(stat[key])
    }
    headers.push('class')
    const y = numWin ? 'takeProfit' : 'stopLoss'
    dataRow.push(y)
    if (!this.csv.headers) this.csv.headers = headers
    this.csv.data.push(dataRow.join(','))
    this.csv.dataJSON.push(dataRow)
    this.csv.lastAdded = y
    // console.log(this.csv.lastAdded)
  }

  manageStreak(type = null, bet, oldTick, newTick) {
    if (type === 'win') {
      if (this.currentStreak.type === 'loss') {
        if (this.currentStreak.length >= 1) {
          this.streaks.push({ type: 'loss', from: this.currentStreak.deals.at(0).from, to: this.currentStreak.deals.at(-1).to, length: this.currentStreak.length, deals: this.currentStreak.deals })
        }
        this.currentStreak.deals = []
        this.currentStreak.length = 0
      }
    } else if (type === 'loss') {
      if (this.currentStreak.type === 'win') {
        if (this.currentStreak.length >= 1) {
          this.streaks.push({ type: 'win', from: this.currentStreak.deals.at(0).from, to: this.currentStreak.deals.at(-1).to, length: this.currentStreak.length, deals: this.currentStreak.deals })
        }
        this.currentStreak.deals = []
        this.currentStreak.length = 0
      }
    }
    this.currentStreak.type = type
    this.currentStreak.length++
    this.currentStreak.deals.push({ from: oldTick.time, to: newTick.time, enter: oldTick.price, stopLoss: bet.stopLoss, takeProfit: bet.takeProfit })
  }

  resolveActiveBet(id, isWin, tick) {
    const bet = this.activeBets[id]
    const oldTick = bet.tick
    bet.tick = tick
    if (isWin) {
      this.manageStreak('win', bet, oldTick, tick)
      const profit = (bet.betSize * bet.reward)
      this.money += bet.betSize + profit
      this.emit('bet:take-profit', profit, this.activeBets[id])
      if (!this.silent) console.log(`PROFIT:${bet.type}:`, chalk.green(profit.toFixed(2)), `Balance: $${this.money.toFixed(2)}`, `log: ${this.activeBets[id].log}`, new Date(this.activeBets[id].tick.time).toLocaleString())
      /* if (this.csv.lastAdded !== 'takeProfit') */ this.addStatToCSV(this.activeBets[id].stat, 1)
    } else {
      this.manageStreak('loss', bet, oldTick, tick)
      const loss = (bet.betSize * bet.risk)
      this.money += bet.betSize - loss
      this.emit('bet:stop-loss', loss, this.activeBets[id])
      if (!this.silent) console.log(`LOSS__:${bet.type}:`, chalk.red(loss.toFixed(2)), `Balance: $${this.money.toFixed(2)}`, `log: ${this.activeBets[id].log}`, new Date(this.activeBets[id].tick.time).toLocaleString())
      /* if (this.csv.lastAdded !== 'stopLoss') */ this.addStatToCSV(this.activeBets[id].stat, 0)
    }
    this.emit('money:change', this.money)
    this.emit('bet:remove', this.activeBets[id])
    delete this.activeBets[id]
  }

  writeResultsToCSV() {
    // writeFileSync('modules/ml/headers.json', JSON.stringify(this.csv.headers), 'utf8')
    // writeFileSync('modules/ml/deals.csv', this.csv.data.join('\n'), 'utf8')
  }
}