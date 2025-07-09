import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline';

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function extractTradeDelimiterOptions(str) {
  const regex = /(qoutevolume|volume|min|sec|hour|tick|price|rangexv):(.+)/;
  const match = str.match(regex);
  if (match) {
    return [match[1], Number(match[2])];
  }
  return null;
}

export async function startLoading(progress, message) {
  return new Promise((resolve) => {
    const barLength = 20;
    const updateIntervalMs = 500;

    const updateProgress = () => {
        const percentage = Math.floor((progress.current / progress.total) * 100);
        const filled = Math.min(barLength, Math.floor(barLength * (progress.current / progress.total)))
        const empty = Math.max(0, barLength - filled);
        process.stdout.cursorTo(0);
        process.stdout.clearLine(1);
        process.stdout.write(
            `${message}: [${'█'.repeat(filled)}${'-'.repeat(empty)}] ${percentage}%`
        );
        if (progress.current >= progress.total) {
            clearInterval(intervalId);
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(`${message}: Complete!\n`);
            resolve();
        }
    };
    updateProgress();
    const intervalId = setInterval(updateProgress, updateIntervalMs);
  });
}

export function countLines(filePath) {
  return new Promise((resolve, reject) => {
      let lineCount = 0;
      const readStream = createReadStream(filePath);
      const rl = createInterface({ input: readStream });
      rl.on('line', () => {
          lineCount++;
      });
      rl.on('close', () => {
          resolve(lineCount);
      });
      readStream.on('error', (err) => {
          reject(err);
      });
  });
}

export function aggTickToRegular (aggTick) {
  return {
    id: aggTick.a,
    price: Number(aggTick.p),
    qty: Number(aggTick.q),
    quoteQty: Number(aggTick.p) * Number(aggTick.q),
    time: aggTick.T,
    isBuyerMaker: aggTick.m,
    isBestMatch: aggTick.M
  }
}

export const getRangeOverlap = (indicatorRange, chartRange) => {
    const [indicatorStart, indicatorEnd] = indicatorRange;
    const [chartStart, chartEnd] = chartRange;
    
    // Check if ranges overlap
    if (indicatorStart <= chartEnd && indicatorEnd >= chartStart) {
        // Return the overlapping portion
        return {
            isOverlapping: true,
            firstPoint: Math.max(indicatorStart, chartStart),
            lastPoint: Math.min(indicatorEnd, chartEnd)
        };
    }
    
    return { isOverlapping: false };
}