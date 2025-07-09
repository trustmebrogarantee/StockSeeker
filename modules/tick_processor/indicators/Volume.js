import { ContinuousGeometricMean } from "../../math/ContinousGeometricMean.js";

export class Volume extends ContinuousGeometricMean {
  constructor() {
    super()
  }

  processTick(tick) {
    this.add(tick.qty)
  }
} 