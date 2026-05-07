/**
 * ═══════════════════════════════════════════════════════════
 *   MAKİNE ÖĞRENMESİ TABANLI ADAPTİF KARAR SİSTEMİ (AGRESİF)
 *   - Benzerlik eşiği esnetildi (%60)
 *   - Minimum desen sayısı düşürüldü (2)
 *   - Hiç desen yoksa piyasa trendine göre fallback karar
 * ═══════════════════════════════════════════════════════════
 */

class MachineDecisionEngine {

  constructor() {
    // ═══ BELLEK ═══
    this.memory = {
      signals: [],
      outcomes: [],
      patternLibrary: [],
      regimeHistory: [],
      indicatorReliability: {}
    };

    // ═══ PARAMETRELER ═══
    this.settings = {
      minHistoricalBars: 200,
      lookbackWindow: 100,
      minSimilarPatterns: 2,      // <--- AGRESİF: 5'ten 2'ye düşürüldü
      confidenceRequired: 0.50,   // <--- AGRESİF: 0.70'ten 0.50'ye düşürüldü
      maxDrawdownAllowed: 0.05,
      learningRate: 0.01,
      outcomeHorizon: 20
    };

    // ═══ GÖSTERGE AĞIRLIKLARI ═══
    this.indicatorWeights = {
      rsi: 0.15, macd: 0.15, emaTrend: 0.15, bollinger: 0.10,
      volume: 0.15, supportResist: 0.10, divergence: 0.10, mfi: 0.05, adx: 0.05
    };

    // ═══ DURUM ═══
    this.state = {
      mode: 'OBSERVING', consecutiveLosses: 0, totalSignals: 0,
      successfulSignals: 0, currentDrawdown: 0, peakBalance: 1, currentBalance: 1
    };
  }

  // ═══════════════════════════════════════════
  // VERİTABANINA KAYDET (KALICI)
  // ═══════════════════════════════════════════
  saveToDB() {
    try {
      const db = require('./database');
      const recentPatterns = this.memory.patternLibrary.slice(-200);
      if (recentPatterns.length > 0) {
        const stmt = db.prepare('INSERT OR REPLACE INTO machine_patterns (id, symbol, pattern_data, outcome, return_pct, similarity) VALUES (?,?,?,?,?,?)');
        db.prepare('DELETE FROM machine_patterns').run();
        const tx = db.transaction(() => {
          recentPatterns.forEach((p, i) => { stmt.run(i + 1, 'ALL', JSON.stringify(p.state), p.outcome, p.return || 0, 1.0); });
        });
        tx();
      }
      const wStmt = db.prepare('INSERT INTO machine_weights (weights_data, threshold) VALUES (?,?)');
      wStmt.run(JSON.stringify(this.indicatorWeights), this.settings.confidenceRequired);
      return true;
    } catch(e) { console.error('[MAKINE] DB kayit hatasi:', e.message); return false; }
  }

  loadFromDB() {
    try {
      const db = require('./database');
      const patterns = db.prepare('SELECT * FROM machine_patterns ORDER BY id').all();
      if (patterns && patterns.length > 0) {
        this.memory.patternLibrary = patterns.map(p => ({ state: JSON.parse(p.pattern_data || '{}'), outcome: p.outcome, return: p.return_pct || 0 }));
      }
      const weights = db.prepare('SELECT * FROM machine_weights ORDER BY id DESC LIMIT 1').get();
      if (weights) {
        this.indicatorWeights = JSON.parse(weights.weights_data || '{}');
        this.settings.confidenceRequired = weights.threshold || 0.50;
      }
      console.log(`[MAKINE] ✅ DB yuklendi: ${this.memory.patternLibrary.length} desen, esik:%${Math.round(this.settings.confidenceRequired*100)}`);
      return true;
    } catch(e) { console.error('[MAKINE] DB yukleme hatasi:', e.message); return false; }
  }

  analyze(candles, ticker) {
    if (!candles || candles.length < this.settings.minHistoricalBars) {
      return this.createNullResponse('YETERSIZ_VERI');
    }

    const currentState = this.extractMarketState(candles);
    const similarPatterns = this.findSimilarHistoricalPatterns(candles, currentState, this.settings.lookbackWindow);

    // AGRESİF FALLBACK: Hiç benzer desen bulunamazsa piyasa verisine göre karar ver
    if (similarPatterns.length < this.settings.minSimilarPatterns) {
      return this.agresifFallback(candles, currentState);
    }

    const patternAnalysis = this.analyzePatternOutcomes(similarPatterns, currentState);
    const riskProfile = this.calculateRiskProfile(patternAnalysis, currentState, candles);
    const selfAssessment = this.evaluateSelfPerformance();
    const decision = this.makeDecision(patternAnalysis, riskProfile, selfAssessment, currentState);

    if (decision.action !== 'WAIT') {
      this.recordDecision(decision, currentState);
    }

    return {
      symbol: ticker?.symbol || 'UNKNOWN',
      action: decision.action,
      confidence: decision.confidence,
      expectedReturn: decision.expectedReturn,
      stopLoss: decision.stopLoss,
      takeProfit: decision.takeProfit,
      reasoning: decision.reasoning,
      similarPatternsFound: similarPatterns.length,
      patternSuccessRate: patternAnalysis.successRate,
      machineConfidence: selfAssessment.confidence,
      timestamp: Date.now()
    };
  }

  // ═══════════════════════════════════════════
  // AGRESİF FALLBACK: Hiç desen yoksa piyasa verisine göre karar
  // ═══════════════════════════════════════════
  agresifFallback(candles, currentState) {
    const closes = candles.map(c => parseFloat(c[4]));
    const price = closes[closes.length - 1];
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const ema21 = this.calculateEMA(closes, 21);
    const rsi = this.calculateRSI(closes, 14);

    let action = 'WAIT';
    let confidence = 0.40; // Düşük güven
    let reasoning = 'FALLBACK: Desen bulunamadi, piyasa analizi';

    if (price > ema21) {
      action = 'BUY';
      reasoning += ' | Fiyat EMA21 ustunde';
      confidence = 0.55;
      if (rsi < 40) { confidence = 0.60; reasoning += ' | RSI uygun'; }
    } else if (rsi < 30) {
      action = 'BUY';
      confidence = 0.55;
      reasoning += ' | Asiri satim bolgesi';
    }

    return {
      symbol: 'FALLBACK',
      action: action,
      confidence: confidence,
      stopLoss: price * 0.985,
      takeProfit: price * 1.03,
      reasoning: reasoning,
      similarPatternsFound: 0,
      patternSuccessRate: 0,
      machineConfidence: confidence,
      timestamp: Date.now()
    };
  }

  // ═══════════════════════════════════════════
  // PİYASA PARMAK İZİ
  // ═══════════════════════════════════════════
  extractMarketState(candles) {
    const closes  = candles.map(c => parseFloat(c[4]));
    const highs   = candles.map(c => parseFloat(c[2]));
    const lows    = candles.map(c => parseFloat(c[3]));
    const volumes = candles.map(c => parseFloat(c[5]));
    const price   = closes[closes.length - 1];

    return {
      price, priceChange5: ((price - closes[closes.length - 6]) / closes[closes.length - 6]) * 100,
      priceChange10: ((price - closes[closes.length - 11]) / closes[closes.length - 11]) * 100,
      priceChange20: ((price - closes[closes.length - 21]) / closes[closes.length - 21]) * 100,
      volatility14: this.calculateVolatility(closes, 14), volatility50: this.calculateVolatility(closes, 50),
      volatilityRatio: 0, trendStrength: 0, trendDirection: 0,
      rsi14: this.calculateRSI(closes, 14), rsiSlope: 0,
      volumeProfile: this.analyzeVolumeProfile(volumes, closes), volumeChange: 0,
      supportDistance: 0, resistanceDistance: 0, higherHighs: 0, lowerLows: 0,
      consolidationScore: 0, indicatorConsensus: 0
    };
  }

  findSimilarHistoricalPatterns(candles, currentState, windowSize) {
    const patterns = [];
    for (let i = windowSize; i < candles.length - 25; i++) {
      const historicalSlice = candles.slice(i - windowSize, i);
      const historicalState = this.extractMarketState(historicalSlice);
      const similarity = this.calculateCosineSimilarity(currentState, historicalState);
      if (similarity > 0.60) { // <--- AGRESİF: 0.80'den 0.60'a düşürüldü
        const futureCandles = candles.slice(i, i + this.settings.outcomeHorizon);
        const outcome = this.evaluateOutcome(historicalSlice, futureCandles);
        patterns.push({ index: i, similarity, outcome, state: historicalState });
      }
    }
    return patterns.sort((a, b) => b.similarity - a.similarity).slice(0, 20);
  }

  calculateCosineSimilarity(state1, state2) {
    const features = ['priceChange5','priceChange10','priceChange20','volatility14','volatility50','rsi14','trendStrength','trendDirection','volumeProfile','supportDistance','resistanceDistance'];
    let dotProduct = 0, magnitude1 = 0, magnitude2 = 0;
    for (const f of features) {
      const v1 = Number(state1[f]) || 0, v2 = Number(state2[f]) || 0;
      dotProduct += v1 * v2; magnitude1 += v1 * v1; magnitude2 += v2 * v2;
    }
    magnitude1 = Math.sqrt(magnitude1); magnitude2 = Math.sqrt(magnitude2);
    if (magnitude1 === 0 || magnitude2 === 0) return 0;
    return dotProduct / (magnitude1 * magnitude2);
  }

  evaluateOutcome(beforeCandles, futureCandles) {
    if (futureCandles.length < 5) return { direction: 'UNKNOWN', return: 0 };
    const startPrice = parseFloat(beforeCandles[beforeCandles.length - 1][4]);
    const endPrice = parseFloat(futureCandles[futureCandles.length - 1][4]);
    const maxPrice = Math.max(...futureCandles.map(c => parseFloat(c[2])));
    const minPrice = Math.min(...futureCandles.map(c => parseFloat(c[3])));
    const returnPct = ((endPrice - startPrice) / startPrice) * 100;
    const maxGain = ((maxPrice - startPrice) / startPrice) * 100;
    const maxLoss = ((startPrice - minPrice) / startPrice) * 100;
    return { direction: returnPct > 2 ? 'UP' : returnPct < -2 ? 'DOWN' : 'FLAT', returnPct, maxGain, maxLoss, riskRewardRatio: maxLoss > 0 ? maxGain / maxLoss : 0, profitable: returnPct > 0 };
  }

  analyzePatternOutcomes(similarPatterns, currentState) {
    const total = similarPatterns.length;
    const profitable = similarPatterns.filter(p => p.outcome.profitable).length;
    const avgReturn = similarPatterns.reduce((s, p) => s + p.outcome.returnPct, 0) / total;
    const avgMaxGain = similarPatterns.reduce((s, p) => s + p.outcome.maxGain, 0) / total;
    const avgMaxLoss = similarPatterns.reduce((s, p) => s + p.outcome.maxLoss, 0) / total;
    const weightedSuccess = similarPatterns.reduce((s, p) => s + (p.outcome.profitable ? p.similarity : 0), 0) / similarPatterns.reduce((s, p) => s + p.similarity, 0);
    return { totalPatterns: total, successRate: profitable / total, weightedSuccessRate: weightedSuccess, upProbability: total > 0 ? profitable / total : 0, downProbability: total > 0 ? (total - profitable) / total : 0, avgReturn, avgMaxGain, avgMaxLoss, riskRewardRatio: avgMaxLoss > 0 ? avgMaxGain / avgMaxLoss : 0, confidence: weightedSuccess, topMatches: similarPatterns.slice(0,3).map(p => ({similarity:p.similarity,outcome:p.outcome})) };
  }

  calculateRiskProfile(patternAnalysis, currentState, candles) {
    const closes = candles.map(c => parseFloat(c[4]));
    const price = closes[closes.length - 1];
    const atr14 = this.calculateATR(candles, 14);
    const winRate = patternAnalysis.successRate;
    const avgWin = patternAnalysis.avgMaxGain;
    const avgLoss = patternAnalysis.avgMaxLoss;
    let kellyFraction = 0;
    if (avgLoss > 0 && winRate > 0) {
      const b = avgWin / avgLoss;
      kellyFraction = (winRate * b - (1 - winRate)) / b;
      kellyFraction = Math.max(0, Math.min(0.25, kellyFraction));
    }
    return { kellyFraction, atr14, suggestedStopLoss: price - (atr14 * 1.5), suggestedTakeProfit: price + (atr14 * avgWin / Math.max(avgLoss, 0.1)), riskPerTrade: kellyFraction * 100, acceptable: winRate > 0.3 }; // <--- AGRESİF: risk acceptable kriteri düşürüldü
  }

  evaluateSelfPerformance() {
    return { confidence: 0.80, shouldTrade: true, reason: 'AGRESIF_MOD' }; // <--- AGRESİF: Her zaman trade'e izin ver
  }

  makeDecision(patternAnalysis, riskProfile, selfAssessment, currentState) {
    if (!riskProfile.acceptable) return { action: 'WAIT', confidence: 0, reasoning: 'RISK_PROFILI_UYGUN_DEGIL', expectedReturn: 0, stopLoss: null, takeProfit: null };
    const adjustedThreshold = this.getDynamicConfidenceThreshold();
    if (patternAnalysis.confidence < adjustedThreshold) return { action: 'WAIT', confidence: patternAnalysis.confidence, reasoning: `GUVEN_ESIGI_ALTINDA`, expectedReturn: patternAnalysis.avgReturn, stopLoss: null, takeProfit: null };
    const direction = patternAnalysis.upProbability > 0.40 ? 'BUY' : (patternAnalysis.downProbability > 0.60 ? 'SELL' : 'BUY'); // <--- AGRESİF: Hafif üstünlükte bile yön ver
    return { action: direction, confidence: patternAnalysis.confidence, reasoning: `${patternAnalysis.totalPatterns} desen, basari:%${(patternAnalysis.successRate*100).toFixed(1)}`, expectedReturn: patternAnalysis.avgReturn, stopLoss: riskProfile.suggestedStopLoss, takeProfit: riskProfile.suggestedTakeProfit };
  }

  getDynamicConfidenceThreshold() { return 0.10; } // <--- AGRESİF: Neredeyse her zaman geç

  recordDecision(decision, marketState) {
    this.memory.signals.push({ ...decision, marketState, timestamp: Date.now() });
    this.state.totalSignals++;
  }

  feedbackSignalResult(signalTimestamp, actualReturn, maxFavorable, maxAdverse) {
    const signal = this.memory.signals.find(s => s.timestamp === signalTimestamp);
    if (!signal) return;
    const outcome = { signalTimestamp, actualReturn, maxFavorable, maxAdverse, profitable: actualReturn > 0, riskRewardRealized: maxAdverse > 0 ? maxFavorable / maxAdverse : 0 };
    this.memory.outcomes.push(outcome);
    if (outcome.profitable) { this.memory.patternLibrary.push({ state: signal.marketState, outcome: 'SUCCESS', return: actualReturn }); this.state.successfulSignals++; }
    if (actualReturn < 0) { this.state.consecutiveLosses++; this.state.currentBalance *= (1 + actualReturn / 100); if (this.state.currentBalance < this.state.peakBalance) { this.state.currentDrawdown = (this.state.peakBalance - this.state.currentBalance) / this.state.peakBalance; } }
    else { this.state.consecutiveLosses = 0; this.state.currentBalance *= (1 + actualReturn / 100); if (this.state.currentBalance > this.state.peakBalance) { this.state.peakBalance = this.state.currentBalance; this.state.currentDrawdown = 0; } }
    this.adaptThresholds();
  }

  adaptThresholds() {
    const recentOutcomes = this.memory.outcomes.slice(-50);
    if (recentOutcomes.length < 20) return;
    const successRate = recentOutcomes.filter(o => o.profitable).length / recentOutcomes.length;
    if (successRate > 0.60) { this.settings.confidenceRequired = Math.max(0.30, this.settings.confidenceRequired - 0.02); }
    else if (successRate < 0.40) { this.settings.confidenceRequired = Math.min(0.70, this.settings.confidenceRequired + 0.03); }
  }

  calculateRSI(data, period = 14) {
    if (data.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) { const diff = data[i] - data[i - 1]; if (diff > 0) gains += diff; else losses -= diff; }
    const avgGain = gains / period, avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
  }

  calculateVolatility(closes, period = 14) {
    if (closes.length < period) return 0;
    const returns = [];
    for (let i = closes.length - period; i < closes.length; i++) { returns.push((closes[i] - closes[i - 1]) / closes[i - 1]); }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * 100;
  }

  calculateATR(candles, period = 14) {
    const trValues = [];
    for (let i = 1; i < candles.length; i++) {
      const h = parseFloat(candles[i][2]), l = parseFloat(candles[i][3]), pc = parseFloat(candles[i - 1][4]);
      trValues.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    if (trValues.length < period) return trValues.reduce((a, b) => a + b, 0) / trValues.length;
    return trValues.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  calculateEMA(data, period) {
    if (data.length < period) return data[data.length - 1];
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
    return ema;
  }

  analyzeVolumeProfile(volumes, closes) {
    const recent = volumes.slice(-20);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const current = volumes[volumes.length - 1];
    const ratio = current / avg;
    if (ratio > 2.0) return 'HIGH_SPIKE';
    if (ratio > 1.5) return 'ABOVE_AVERAGE';
    if (ratio < 0.5) return 'LOW';
    return 'NORMAL';
  }

  createNullResponse(reason) {
    return { symbol: 'UNKNOWN', action: 'WAIT', confidence: 0, reasoning: reason, expectedReturn: 0, stopLoss: null, takeProfit: null, similarPatternsFound: 0, patternSuccessRate: 0, machineConfidence: 0, timestamp: Date.now() };
  }
}

module.exports = MachineDecisionEngine;
