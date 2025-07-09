import EventEmitter from "eventemitter3";
import cloneDeep from "lodash/cloneDeep.js"

function normalityScore(marketProfile) {
  const { profile, vpoc } = marketProfile;
  
  // Handle edge cases
  if (!profile || profile.length < 2) return 0;
  
  // First pass: total volume and mean
  const { totalVolume, meanPrice } = profile.reduce((acc, p) => {
      acc.totalVolume += p.volume;
      acc.meanPrice += p.price * p.volume;
      return acc;
  }, { totalVolume: 0, meanPrice: 0 });
  const mean = meanPrice / totalVolume;
  
  // Second pass: variance
  const variance = profile.reduce((sum, p) => 
      sum + p.volume * (p.price - mean) ** 2, 0) / totalVolume;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 1; // Trivially normal if no variation
  
  // Third pass: skewness and kurtosis
  const { skewSum, kurtSum } = profile.reduce((acc, p) => {
      const z = (p.price - mean) / stdDev;
      acc.skewSum += p.volume * z ** 3;
      acc.kurtSum += p.volume * z ** 4;
      return acc;
  }, { skewSum: 0, kurtSum: 0 });
  const skewness = skewSum / totalVolume;
  const kurtosis = kurtSum / totalVolume;
  const excessKurtosis = kurtosis - 3;
  
  // Median price
  let cumulative = 0;
  const halfVolume = totalVolume / 2;
  const median = profile.find(p => (cumulative += p.volume) >= halfVolume).price;
  
  // Central volume fraction
  const centralVolume = profile.reduce((sum, p) => 
      sum + (p.price >= mean - stdDev && p.price <= mean + stdDev ? p.volume : 0), 0);
  const centralFraction = centralVolume / totalVolume;
  
  // Component scores
  const closeness = Math.exp(-((mean - vpoc) ** 2 + (median - vpoc) ** 2 + (mean - median) ** 2) / (3 * stdDev ** 2));
  const skewScore = Math.exp(-(skewness ** 2));
  const kurtScore = Math.exp(-(excessKurtosis ** 2));
  const volumeScore = Math.exp(-((centralFraction - 0.6827) ** 2) / 0.01);
  
  // Overall score: geometric mean
  return Math.pow(closeness * skewScore * kurtScore * volumeScore, 0.25);
}

function roundQuantityTo(number, step) {
  return Number((Math.floor(number / step) * step).toFixed(2))
}

function getStartOfDayUTC(x) {
  const MS_PER_DAY = 86400000;
  return Math.floor(x / MS_PER_DAY) * MS_PER_DAY;
}

function getStartOfWeekUTC(x) {
  const date = new Date(x);
  const day = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const startOfWeekDate = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - day
  ));
  return startOfWeekDate.getTime();
}



export class VP extends EventEmitter {
  constructor(clearInterval = 24 * 60 * 60 * 1000, roundingStep = 0.01) {
    super()
    this.clustersVolumeTotal = 0
    this.clusters = {}
    this.mergedRecentProfile = null

    this.clearInterval = clearInterval
    this.lastClear = null
    this.roundingStep = roundingStep
    this.cache = []
    this.cacheSize = Infinity
  }

  addToCluster(context, tick) {
    const val = roundQuantityTo(tick.price, this.roundingStep)
      if (context.clusters[val]) {
        context.clusters[val].volume += tick.qty
      } else {
        context.clusters[val] = {
          price: val,
          volume: tick.qty
        }
      }
      context.clustersVolumeTotal += tick.qty
  }

  getLastCachedIndicator() {
    if(this.cache.at(-1)) return this.cache.at(-1)
    else return this.getIndicators(this)
  }

  getMergedRecentProfileIndicators() {
    const profile = this.getIndicators(this.mergedRecentProfile)
    profile.normality = normalityScore({ profile: profile.profile.slice(profile.vahIndex, profile.valIndex + 1), vpoc: profile.vpoc })
    return profile
  }

  getIndicators(context = this) {
    const clusters = Object.values(context.clusters);
    if (clusters.length === 0) return this.cache[0]

    const volumeSorted = clusters.toSorted((a, b) => b.volume - a.volume);
    const priceSorted = clusters.toSorted((a, b) => b.price - a.price);

    // standard Gaussian distribution
    const valueAreaPercentage = 0.6827;
    const vPOC = volumeSorted[0];

    const vPOCIndex = priceSorted.indexOf(vPOC);
    const totalVolume = context.clustersVolumeTotal;

    const targetVolume = totalVolume * valueAreaPercentage;
    let currentVolume = vPOC.volume;
    let lowerIndex = vPOCIndex;
    let upperIndex = vPOCIndex;

    while (currentVolume < targetVolume && (lowerIndex > 0 || upperIndex < priceSorted.length - 1)) {
      const nextLowerVolume = lowerIndex > 0 ? priceSorted[lowerIndex - 1].volume : 0;
      const nextUpperVolume = upperIndex < priceSorted.length - 1 ? priceSorted[upperIndex + 1].volume : 0;

      if (nextLowerVolume >= nextUpperVolume && lowerIndex > 0) {
        currentVolume += nextLowerVolume;
        lowerIndex--;
      } else if (upperIndex < priceSorted.length - 1) {
        currentVolume += nextUpperVolume;
        upperIndex++;
      }
    }

    const vah = priceSorted[lowerIndex];
    const val = priceSorted[upperIndex];

    return {
      vahIndex: lowerIndex,
      valIndex: upperIndex,
      vpocIndex: vPOCIndex,
      profile: priceSorted.map(cluster => ({ price: cluster.price, volume: cluster.volume })),
      min: priceSorted.at(-1).price,
      max: priceSorted.at(0).price,
      vpoc: vPOC.price,
      val: val.price,
      vah: vah.price,
      valueAreaVolume: currentVolume,
      totalVolume,
      startedAt: null,
      endedAt: null,
      normality: null,
      closedAtPrice: null
    };
  }

  clearNotActiveClusters(tick) {
    const completeProfile = this.getIndicators(this)
    completeProfile.startedAt = this.lastClear
    completeProfile.endedAt = tick.time
    completeProfile.normality = normalityScore({ profile: completeProfile.profile.slice(completeProfile.vahIndex, completeProfile.valIndex + 1), vpoc: completeProfile.vpoc })
    completeProfile.closedAtPrice = tick.price
    this.mergedRecentProfile = cloneDeep({ clusters: this.clusters, clustersVolumeTotal: this.clustersVolumeTotal })
    
    this.emit('profile-completed', completeProfile)
    this.cache.push(completeProfile)
    this.clustersVolumeTotal = 0
    if (this.cache.length > this.cacheSize) this.cache.unshift()
    this.clusters = {}
  }

  processTick(tick) {
    this.addToCluster(this, tick)
    if (this.mergedRecentProfile) this.addToCluster(this.mergedRecentProfile, tick)
    if (this.lastClear === null) this.lastClear = getStartOfDayUTC(tick.time)
      // console.log(tick.time - this.lastClear, this.clearInterval)
    if (tick.time - this.lastClear > this.clearInterval) {
      this.clearNotActiveClusters(tick)
      this.lastClear = tick.time
    }
  }
}