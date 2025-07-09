export class HypothesisOrchestrator {
  constructor() {
    this.hypothesisTypes = [
      'market-tactic-bull-reversal', 
      'market-tactic-bear-reversal', 
      'market-tactic-balance',

      'market-operative-bull-reversal', 
      'market-operative-bear-reversal', 
      'market-operative-balance',

      'market-strategic-bull-reversal', 
      'market-strategic-bear-reversal'
    ]

  }

  checkHypothesis(hypothesis, analysis) {
    const scores = hypothesis.checkFeatures(analysis) 
    return (scores.reduce((a, b) => a + b, 0) / scores.length) > 0.5
  }
}

export class HypothesisMarketTacticBullReversal {
  constructor() {
    this.name = 'market-tactic-bull-reversal'
  }

  // checkFeatures(analysis) {
  //   if ()
  // }
}