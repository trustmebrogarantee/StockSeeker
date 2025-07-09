import { createReadStream } from 'node:fs'
import { DataDelimiter } from '../modules/DataDelimiterStrategy.js';
import CsvReadableStream from 'csv-reader';


export const checkCSVTradeDataIntegrity = async (outputFile) => {
  let currentId = null
  const inputStream = createReadStream(outputFile, 'utf8');
  return new Promise(async (resolve, reject) => {
    const CSVStream = new CsvReadableStream()
    inputStream
      .pipe(CSVStream)
      .on('data', (row) => {
        const parsedTick = DataDelimiter.parseTick(row[0]);
        if (currentId === null) currentId = parsedTick.id
        else if (currentId === parsedTick.id - 1) currentId++
        else reject(new Error(`failed at id: ${parsedTick.id}`))
      })
      .on('end', () => {
        console.log('checkCSVTradeDataIntegrity(): Complete without errors!')
        resolve(true);
      });
  })
}