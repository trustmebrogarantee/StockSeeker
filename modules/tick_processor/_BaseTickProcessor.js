import EventEmitter from "eventemitter3"

export class _BaseTickProcessor extends EventEmitter {
  processTick(tick) {
    throw new Error(`(${this.prototype.name}) [Error]: Method processTick is not specified`)
  }
}