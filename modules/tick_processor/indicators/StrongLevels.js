export class StrongLevels {
  constructor(epsilon = 0.02) {
    this.levels = {}
    this.levelsArr = []
    this.epsilon = epsilon * 0.5
  }

  addPOC(pointOfControlPrice, time) {
    if (this.levels[pointOfControlPrice]) this.levels[pointOfControlPrice].tests.push(time)
    else this.levels[pointOfControlPrice] = { price: pointOfControlPrice, tests: [time] }
    this.levelsArr = Object.values(this.levels).sort((a, b) => a.price - b.price)
  }

  addCluster(clusterPrice, time) {
    if (this.levels[clusterPrice]) this.levels[clusterPrice].tests.push(time)
    else this.levels[clusterPrice] = { price: clusterPrice, tests: [time] }
    this.levelsArr = Object.values(this.levels).sort((a, b) => a.price - b.price)
  }

  checkLevelStrength (level, prevCandle, prevPrevCandle) {
    if (Math.abs(prevPrevCandle.low - level.price) < this.epsilon) {
      if ((prevCandle.low - level.price) > this.epsilon) {
        level.tests.push(prevCandle.time)
      }
    }

    if (Math.abs(prevPrevCandle.high - level.price) < this.epsilon) {
      if ((level.price - prevCandle.high) > this.epsilon) {
        level.tests.push(prevCandle.time)
      }
    }
  }
 
  strongestLevelBetween(lowerPrice, higherPrice) {
    let strongest = null
    for (const level of this.levelsArr) {
      if (level.price > higherPrice) return strongest
      if (level.price >= lowerPrice) {
        if (strongest === null) strongest = level
        if (level.tests.length > strongest.tests.length) strongest = level
      }
    }
    return strongest
  }

  onCandleClose(prevCandle, prevPrevCandle) {
    for (const level of this.levelsArr) this.checkLevelStrength(level, prevCandle, prevPrevCandle)
  }
}