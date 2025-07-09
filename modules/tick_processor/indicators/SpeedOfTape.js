export class SpeedOfTape {
    constructor(unit = 1000, medianAlpha = 0.05) {
        this.unit = unit; // Time interval in milliseconds
        this.medianAlpha = medianAlpha; // Smoothing factor for median approximation
        this.ticks = 0; // Current tick count
        this.prevTimestamp = null; // Timestamp of last interval (numeric)
        this.speed = 0; // Raw Speed of Tape (ticks per second)
        this.medianEstimate = 0; // Approximated median (robust central tendency)
        this.resetPeriod = 24 * 60 * 60 * 1000; // Milliseconds in a day
    }
  
    processTick(tick) {
        this.ticks++;
        if (this.prevTimestamp === null) {
            this.prevTimestamp = tick.time;
        }
  
        const timeDiff = tick.time - this.prevTimestamp;
        if (timeDiff < 0) {
            // Non-monotonic timestamp, reset to current tick
            this.reset();
            this.prevTimestamp = tick.time;
            return { raw: 0, geometricMedian: 0 };
        }
  
        // Reset if it's a new trading day (time difference exceeds a day)
        if (timeDiff > this.resetPeriod) {
            this.reset();
            this.prevTimestamp = tick.time;
            this.ticks = 1; // Count current tick
            return { raw: 0, geometricMedian: 0 };
        }
  
        // Calculate raw speed (ticks per second)
        this.speed = timeDiff > 0 ? (this.ticks / timeDiff) * 1000 : 0;
  
        // Update median estimate (online approximation)
        if (this.speed > this.medianEstimate) {
            this.medianEstimate += this.medianAlpha * (this.speed - this.medianEstimate);
        } else if (this.speed < this.medianEstimate) {
            this.medianEstimate -= this.medianAlpha * (this.medianEstimate - this.speed);
        }
        // If equal, no update needed
  
        // Reset interval when unit is reached
        if (timeDiff >= this.unit) {
            this.prevTimestamp = tick.time;
            this.ticks = 0;
        }
  
        return { raw: this.speed, geometricMedian: this.medianEstimate };
    }
  
    reset() {
        this.ticks = 0;
        this.prevTimestamp = null;
        this.speed = 0;
        this.medianEstimate = 0;
    }
  }