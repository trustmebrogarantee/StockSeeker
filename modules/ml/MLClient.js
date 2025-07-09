import EventEmitter from 'eventemitter3'
import WebSocket from 'ws'
import { readFileSync } from 'node:fs'

export class MLClient {
  constructor () {
    this.mlSocket = new WebSocket('ws://localhost:9070')
    this.lastId = 0
    this.ee = new EventEmitter()
    const fullHeaders = JSON.parse(readFileSync('modules/ml/headers.json', 'utf8'))
    this.headers = fullHeaders.slice(0, fullHeaders.length - 1)

    this.mlSocket.on('open', () => {
      console.log('Connected to ML server')
    })

    this.mlSocket.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString())
        this.ee.emit(response.id.toString(), response)
      } catch (err) {
        console.error('Failed to parse server response:', err.message);
      }
    })
    
    this.mlSocket.on('error', (err) => {
      console.error(err)
    })
  }

  predict(stat) {
    return new Promise(resolve => {
      this.lastId += 1
      let key = this.lastId.toString()
      const sample = []
      for (const header of this.headers) sample.push(stat[header])
      this.ee.once(key, (response) => {
        resolve([response.predicted_class, response.probabilities])
      })
      this.mlSocket.send(JSON.stringify({ id: key, sample }))
    })
  }
}