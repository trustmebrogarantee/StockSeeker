export class CVDAngleTracker {
  constructor(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    this.maxAge = maxAgeMs;
    this.cleanupInterval = 1000; // every 1000 ticks
    this.tickCounter = 0;

    this.cvd = 0;
    this.lastTickTime = 0;

    this.priceHistory = [];
    this.cvdHistory = [];

    this.priceExtremums = [];
    this.cvdExtremums = [];

    this.prevPriceDir = 0;
    this.prevCvdDir = 0;

    this.priceStartIdx = 0;
    this.cvdStartIdx = 0;
  }

  processTick(tick) {
    const { price, qty, isBuyerMaker, time } = tick;
    this.lastTickTime = time;
    this.tickCounter++;

    this.cvd += isBuyerMaker ? -qty : qty;

    this.priceHistory.push({ price, time });
    this.cvdHistory.push({ cvd: this.cvd, time });

    this.detectExtremum(this.priceHistory, this.priceExtremums, 'price');
    this.detectExtremum(this.cvdHistory, this.cvdExtremums, 'cvd');

    if (this.tickCounter % this.cleanupInterval === 0) {
      this.cleanupOldData();
    }

    return this.computeAngleToLastExtremums();
  }

  detectExtremum(history, extremumList, type) {
    const len = history.length;
    if (len < 2) return;

    const prev = history[len - 2];
    const curr = history[len - 1];

    const prevVal = type === 'price' ? prev.price : prev.cvd;
    const currVal = type === 'price' ? curr.price : curr.cvd;

    const dir = currVal > prevVal ? 1 : currVal < prevVal ? -1 : 0;

    const prevDirProp = type === 'price' ? 'prevPriceDir' : 'prevCvdDir';
    const prevDir = this[prevDirProp];

    if (prevDir !== 0 && dir !== 0 && dir !== prevDir) {
      extremumList.push({
        index: history.length - 2,
        value: prevVal,
        type: prevDir === 1 ? 'max' : 'min',
        time: prev.time,
      });
    }

    this[prevDirProp] = dir;
  }

  cleanupOldData() {
    const threshold = this.lastTickTime - this.maxAge;

    this.priceStartIdx = this.findStartIndex(this.priceHistory, threshold, 'price');
    this.cvdStartIdx = this.findStartIndex(this.cvdHistory, threshold, 'cvd');

    if (this.priceStartIdx > 0) {
      this.priceHistory.splice(0, this.priceStartIdx);
    }

    if (this.cvdStartIdx > 0) {
      this.cvdHistory.splice(0, this.cvdStartIdx);
    }

    // this.priceExtremums = this.priceExtremums.filter(e => e.time >= threshold);
    // this.cvdExtremums = this.cvdExtremums.filter(e => e.time >= threshold);
  }

  findStartIndex(arr, threshold, type) {
    for (let i = 0; i < arr.length; i++) {
      if ((type === 'price' ? arr[i].time : arr[i].time) >= threshold) {
        return i;
      }
    }
    return arr.length;
  }

  computeAngleToLastExtremums() {
    if (this.priceExtremums.length === 0 || this.cvdExtremums.length === 0) return null;

    const priceNow = this.priceHistory[this.priceHistory.length - 1];
    const cvdNow = this.cvdHistory[this.cvdHistory.length - 1];

    const lastPriceExt = this.priceExtremums[this.priceExtremums.length - 1];
    const lastCvdExt = this.cvdExtremums[this.cvdExtremums.length - 1];

    const x1 = lastCvdExt.value;
    const y1 = lastPriceExt.value;
    const x2 = cvdNow.cvd;
    const y2 = priceNow.price;

    const dx = x2 - x1;
    const dy = y2 - y1;

    const angleRad = Math.atan2(dy, dx);
    const angleDeg = angleRad * (180 / Math.PI);

    return angleDeg;
  }
}
