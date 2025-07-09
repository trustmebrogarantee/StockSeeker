const roundPriceTo = (price, roundUnit) => {
  return Math.round(price * roundUnit) / roundUnit
}

export const clusterAccess = {
  priceLevel: 0,
  quoteQty: 1,
  position: 2,
  lastUpdate: 3,
}

export class VolumeClusters {
  constructor(roundUnit = 10, clusterLimit = 20) {
    this.roundUnit = 1 / roundUnit
    this.clusterLimit = clusterLimit

    this.clustersMap = new Map()
    this.clustersList = []
    
    this.lastClusterAddition = 0
    this.clearInterval = 60_000
  }

  hasCluster (clusterPrice) {
    return this.clustersMap.has(clusterPrice)
  }

  amongTopClusters (price) {
    const priceLevel = roundPriceTo(price, this.roundUnit)
    if (!this.hasCluster(priceLevel)) return false
    return this.clustersMap.get(priceLevel)[clusterAccess.position] < this.clusterLimit    
  }

  closestTopClusters (price) {
    const fromCluster = roundPriceTo(price, this.roundUnit)
    let closestLowerCluster = fromCluster
    let closestHigherCluster = fromCluster
    for(let i = 0; i < Math.min(this.clusterLimit, this.clustersList.length); i++) {
      const clusterPrice = this.clustersList[i][clusterAccess.priceLevel]

      if (clusterPrice < closestHigherCluster && clusterPrice > fromCluster) {
        closestHigherCluster = clusterPrice
      } else if (closestHigherCluster === fromCluster && clusterPrice > fromCluster) {
        closestHigherCluster = clusterPrice
      }
      if (clusterPrice > closestLowerCluster && clusterPrice < fromCluster) {
        closestLowerCluster = clusterPrice
      } else if (closestLowerCluster === fromCluster && clusterPrice < fromCluster) {
        closestLowerCluster = clusterPrice
      }
    }
    return { closestLowerCluster: this.clustersMap.get(closestLowerCluster), closestHigherCluster: this.clustersMap.get(closestHigherCluster) }
  }

  addCluster(clusterPrice, tick) {
    const cluster = [clusterPrice, tick.quoteQty, this.clustersList.length, tick.time]
    this.clustersMap.set(clusterPrice, cluster)
    this.clustersList.push(cluster)
    this.lastClusterAddition = tick.time
  }

  supplyCluster(clusterPrice, tick) {
    const cluster = this.clustersMap.get(clusterPrice)
    cluster[clusterAccess.quoteQty] += tick.quoteQty
    cluster[clusterAccess.lastUpdate] = tick.time

    let position = cluster[clusterAccess.position]
    if (position !== 0 && this.clustersList[position][clusterAccess.quoteQty] > this.clustersList[position - 1][clusterAccess.quoteQty]) {
      this.swapClusters(position, position - 1)
    }
  }

  swapClusters(pos1, pos2) {
    let pos1Cluster = this.clustersList[pos1]
    let pos2Cluster = this.clustersList[pos2]

    this.clustersList[pos1] = pos2Cluster
    pos1Cluster[clusterAccess.position] = pos2

    this.clustersList[pos2] = pos1Cluster
    pos2Cluster[clusterAccess.position] = pos1
  }

  clearNotRelevantClusters(tick) {
    for (let i; i < this.clustersList.length; i++) {
      if (i > this.clusterLimit - 1) {
        if (tick.time > this.clustersList[i][clusterAccess.lastUpdate] + this.clearInterval) {
          const deletedCluster = this.clustersList[i]
          this.clustersList.splice(i, 1)
          this.clustersMap.delete(deletedCluster[clusterAccess.priceLevel])
        }
      }
    }
    for (let i = this.clusterLimit; i < this.clustersList.length; i++) {
      this.clustersList[i][clusterAccess.position] = i
    }
  }

  processTick(tick) {
    const clusterPrice = roundPriceTo(tick.price, this.roundUnit)
    if (this.hasCluster(clusterPrice)) this.supplyCluster(clusterPrice, tick)
    else this.addCluster(clusterPrice, tick)
    if (tick.time > this.lastClusterAddition + this.clearInterval) this.clearNotRelevantClusters(tick)
  }
}