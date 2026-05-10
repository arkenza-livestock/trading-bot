/**
 * ═══════════════════════════════════════════════════════════════════════════
 *   MACHINE DECISION ENGINE - MAKİNE KARAR SİSTEMİ
 *   
 *   🧠 Özellikler:
 *   - Kosinüs benzerliği ile desen tanıma
 *   - Geçmiş desenlerin başarısını analiz
 *   - Dinamik confidence threshold
 *   - Kelly criterion ile risk hesaplama
 *   - Agresif fallback mode (desen yoksa)
 *   - Drawdown tracking + adaptif threshold
 * ═══════════════════════════════════════════════════════════════════════════
 */

class MachineDecisionEngine {
  constructor(db) {
    this.db = db;

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
      minSimilarPatterns: 2,          // AGRESİF: Minimum benzer desen
      confidenceRequired: 0.50,        // AGRESİF: Min confidence
      maxDrawdownAllowed: 0.05,        // Max %5 drawdown
      learningRate: 0.01,              // Öğrenme hızı
      outcomeHorizon: 20,              // Sonuç barı (20 mum)
      similarityThreshold: 0.60        // AGRESİF: %60 benzerlik yeterli
    };

    // ═══ GÖSTERGE AĞIRLIKLARI ═══
    this.indicatorWeights = {
      rsi: 0.15,
      macd: 0.15,
      emaTrend: 0.15,
      bollinger: 0.10,
      volume: 0.15,
      supportResist: 0.10,
      divergence: 0.10,
      mfi: 0.05,
      adx: 0.05
    };

    // ═══ DURUM ═══
    this.state = {
      mode: 'OBSERVING',
      consecutiveLosses: 0,
      totalSignals: 0,
      successfulSignals: 0,
      currentDrawdown: 0,
      peakBalance: 1,
      currentBalance: 1
    };

    this.loadFromDB();
    console.log('[MACHINE-DECISION] ✅ Engine başlatıldı');
  }

  /**
   * DATABASE'DEN YÜKLEMEs
   */
  loadFromDB() {
    try {
      if (!this.db) return false;

      const patterns = this.db.prepare('SELECT * FROM machine_patterns ORDER BY id').all() || [];
      if (patterns && patterns.length > 0) {
        this.memory.patternLibrary = patterns.map(p => ({
          state: JSON.parse(p.pattern_data || '{}'),
          outcome: p.outcome,
          return: p.return_pct || 0
        }));
      }

      const weights = this.db.prepare('SELECT * FROM machine_weights ORDER BY id DESC LIMIT 1').get();
      if (weights) {
        this.indicatorWeights = JSON.parse(weights.weights_data || '{}');
        this.settings.confidenceRequired = weights.threshold || 0.50;
      }

      console.log(`[MACHINE-DECISION] ✅ DB yüklendi: ${this.memory.patternLibrary.length} desen, threshold: ${(this.settings.confidenceRequired * 100).toFixed(0)}%`);
      return true;
    } catch (e) {
      console.warn('[MACHINE-DECISION] DB yükleme hatası:', e.message);
      return false;
    }
  }

  /**
   * DATABASE'YE KAYDET
   */
  saveToDB() {
    try {
      if (!this.db) return false;

      const recentPatterns = this.memory.patternLibrary.slice(-200);
      if (recentPatterns.length > 0) {
        this.db.prepare('DELETE FROM machine_patterns').run();

        const insertPattern = this.db.prepare(`
          INSERT INTO machine_patterns (symbol, pattern_data, outcome, return_pct, similarity)
          VALUES (?, ?, ?, ?, ?)
        `);

        const tx = this.db.transaction(() => {
          recentPatterns.forEach((p, i) => {
            insertPattern.run(
              'ALL',
              JSON.stringify(p.state),
              p.outcome || 'UNKNOWN',
              p.return || 0,
              1.0
            );
          });
        });

        tx();
      }

      this.db.prepare(`
        INSERT INTO machine_weights (weights_data, threshold)
        VALUES (?, ?)
      `).run(
        JSON.stringify(this.indicatorWeights),
        this.settings.confidenceRequired
      );

      return true;
    } catch (e) {
      console.error('[MACHINE-DECISION] DB kayıt hatası:', e.message);
      return false;
    }
  }

  /**
   * ANA ANALİZ
   */
  analyze(candles, ticker) {
    try {
      if (!candles || candles.length < this.settings.minHistoricalBars) {
        return this.createNullResponse('YETERSIZ_VERI');
      }

      // ─────────────────────────────────────────
      // 1. PİYASA DURUMUNU ÇIKAR
      // ─────────────────────────────────────────
      const currentState = this.extractMarketState(candles);

      // ─────────────────────────────────────────
      // 2. BENZER GEÇMIŞ DESENLERI BUL
      // ─────────────────────────────────────────
      const similarPatterns = this.findSimilarHistoricalPatterns(
        candles,
        currentState,
        this.settings.lookbackWindow
      );

      // ─────────────────────────────────────────
      // 3. DESEN YOKSA FALLBACK
      // ─────────────────────────────────────────
      if (similarPatterns.length < this.settings.minSimilarPatterns) {
        return this.agresiveFallback(candles, currentState);
      }

      // ─────────────────────────────────────────
      // 4. DESEN ANALIZI
      // ─────────────────────────────────────────
      const patternAnalysis = this.analyzePatternOutcomes(similarPatterns, currentState);

      // ─────────────────────────────────────────
      // 5. RİSK PROFİLİ
      // ─────────────────────────────────────────
      const riskProfile = this.calculateRiskProfile(patternAnalysis, currentState, candles);

      // ─────────────────────────────────────────
      // 6. KENDİ PERFORMANSI
      // ─────────────────────────────────────────
      const selfAssessment = this.evaluateSelfPerformance();

      // ─────────────────────────────────────────
      // 7. KARAR VER
      // ─────────────────────────────────────────
      const decision = this.makeDecision(patternAnalysis, riskProfile, selfAssessment, currentState);

      if (decision.action !== 'WAIT') {
        this.recordDecision(decision, currentState);
      }

      return {
        symbol: ticker?.symbol || 'UNKNOWN',
        action: decision.action,
        confidence: decision.confidence,
        expectedReturn: parseFloat(decision.expectedReturn.toFixed(2)),
        stopLoss: decision.stopLoss ? parseFloat(decision.stopLoss.toFixed(8)) : null,
        takeProfit: decision.takeProfit ? parseFloat(decision.takeProfit.toFixed(8)) : null,
        reasoning: decision.reasoning,
        similarPatternsFound: similarPatterns.length,
        patternSuccessRate: parseFloat((patternAnalysis.successRate * 100).toFixed(1)),
        machineConfidence: parseFloat((selfAssessment.confidence * 100).toFixed(0)),
        riskRewardRatio: parseFloat(riskProfile.riskRewardRatio?.toFixed(2) || '0'),
        timestamp: Date.now(),
        analyzedAt: new Date().toISOString()
      };
    } catch (e) {
      console.error('[MACHINE-DECISION] Analiz hatası:', e.message);
      return this.createNullResponse('ANALIZ_HATASI');
    }
  }

  /**
   * AGRESİF FALLBACK (Desen yoksa)
   */
  agresiveFallback(candles, currentState) {
    try {
      const closes = candles.map(c => parseFloat(c[4]));
      const price = closes[closes.length - 1];
      const ema21 = this.calculateEMA(closes, 21);
      const rsi = this.calculateRSI(closes, 14);
      const atr14 = this.calculateATR(candles, 14);

      let action = 'WAIT';
      let confidence = 0.40;
      let reasoning = 'FALLBACK: Desen yok, piyasa analizi';

      if (price > ema21 && rsi < 60) {
        action = 'BUY';
        confidence = 0.55;
        reasoning += ' | Fiyat EMA21 üstünde, RSI makul';
      } else if (rsi < 30) {
        action = 'BUY';
        confidence = 0.55;
        reasoning += ' | Aşırı satım bölgesi';
      } else if (rsi > 70) {
        action = 'SELL';
        confidence = 0.50;
        reasoning += ' | Aşırı alım bölgesi';
      }

      return {
        symbol: 'FALLBACK',
        action: action,
        confidence: parseFloat(confidence.toFixed(2)),
        expectedReturn: rsi < 35 ? 2.5 : 1.5,
        stopLoss: action === 'BUY' ? price * 0.985 : price * 1.015,
        takeProfit: action === 'BUY' ? price + (atr14 * 2) : price - (atr14 * 2),
        reasoning: reasoning,
        similarPatternsFound: 0,
        patternSuccessRate: 0,
        machineConfidence: parseFloat((confidence * 100).toFixed(0)),
        timestamp: Date.now()
      };
    } catch (e) {
      console.warn('[MACHINE-DECISION] Fallback hatası:', e.message);
      return this.createNullResponse('FALLBACK_HATASI');
    }
  }

  /**
   * PİYASA DURUMUNU ÇIKAR (Market Fingerprint)
   */
  extractMarketState(candles) {
    try {
      const closes = candles.map(c => parseFloat(c[4]));
      const highs = candles.map(c => parseFloat(c[2]));
      const lows = candles.map(c => parseFloat(c[3]));
      const volumes = candles.map(c => parseFloat(c[5]));

      const price = closes[closes.length - 1];
      const priceChange5 = ((closes[closes.length - 1] - closes[Math.max(0, closes.length - 5)]) / closes[Math.max(0, closes.length - 5)]) * 100;
      const priceChange10 = ((closes[closes.length - 1] - closes[Math.max(0, closes.length - 10)]) / closes[Math.max(0, closes.length - 10)]) * 100;
      const priceChange20 = ((closes[closes.length - 1] - closes[Math.max(0, closes.length - 20)]) / closes[Math.max(0, closes.length - 20)]) * 100;

      const volatility14 = this.calculateVolatility(closes, 14);
      const volatility50 = this.calculateVolatility(closes, 50);
      const rsi14 = this.calculateRSI(closes, 14);
      const ema21 = this.calculateEMA(closes, 21);
      const ema50 = this.calculateEMA(closes, 50);
      const atr14 = this.calculateATR(candles, 14);

      const trendStrength = Math.abs(ema21 - ema50) / price * 100;
      const trendDirection = ema21 > ema50 ? 1 : -1;

      const high50 = Math.max(...highs.slice(-50));
      const low50 = Math.min(...lows.slice(-50));
      const supportDistance = (price - low50) / price * 100;
      const resistanceDistance = (high50 - price) / price * 100;

      return {
        priceChange5: parseFloat(priceChange5.toFixed(2)),
        priceChange10: parseFloat(priceChange10.toFixed(2)),
        priceChange20: parseFloat(priceChange20.toFixed(2)),
        volatility14: parseFloat(volatility14.toFixed(2)),
        volatility50: parseFloat(volatility50.toFixed(2)),
        rsi14: parseFloat(rsi14.toFixed(2)),
        trendStrength: parseFloat(trendStrength.toFixed(2)),
        trendDirection: trendDirection,
        volumeProfile: this.analyzeVolumeProfile(volumes, closes),
        supportDistance: parseFloat(supportDistance.toFixed(2)),
        resistanceDistance: parseFloat(resistanceDistance.toFixed(2)),
        timestamp: Date.now()
      };
    } catch (e) {
      console.warn('[MACHINE-DECISION] Market state extraction hatası:', e.message);
      return {};
    }
  }

  /**
   * BENZER GEÇMİŞ DESENLERI BUL
   */
  findSimilarHistoricalPatterns(candles, currentState, windowSize) {
    try {
      const patterns = [];

      for (let i = windowSize; i < candles.length - this.settings.outcomeHorizon; i++) {
        const historicalSlice = candles.slice(i - windowSize, i);
        const historicalState = this.extractMarketState(historicalSlice);
        const similarity = this.calculateCosineSimilarity(currentState, historicalState);

        if (similarity > this.settings.similarityThreshold) {
          const futureCandles = candles.slice(i, i + this.settings.outcomeHorizon);
          const outcome = this.evaluateOutcome(historicalSlice, futureCandles);

          patterns.push({
            index: i,
            similarity: parseFloat(similarity.toFixed(3)),
            outcome: outcome,
            state: historicalState
          });
        }
      }

      return patterns.sort((a, b) => b.similarity - a.similarity).slice(0, 20);
    } catch (e) {
      console.warn('[MACHINE-DECISION] Pattern bulma hatası:', e.message);
      return [];
    }
  }

  /**
   * KOSİNÜS BENZERLİĞİ HESAPLA
   */
  calculateCosineSimilarity(state1, state2) {
    try {
      const features = ['priceChange5', 'priceChange10', 'priceChange20', 'volatility14', 'volatility50', 'rsi14', 'trendStrength', 'trendDirection', 'supportDistance', 'resistanceDistance'];

      let dotProduct = 0;
      let magnitude1 = 0;
      let magnitude2 = 0;

      for (const f of features) {
        const v1 = Number(state1[f]) || 0;
        const v2 = Number(state2[f]) || 0;
        dotProduct += v1 * v2;
        magnitude1 += v1 * v1;
        magnitude2 += v2 * v2;
      }

      magnitude1 = Math.sqrt(magnitude1);
      magnitude2 = Math.sqrt(magnitude2);

      if (magnitude1 === 0 || magnitude2 === 0) return 0;

      return dotProduct / (magnitude1 * magnitude2);
    } catch (e) {
      console.warn('[MACHINE-DECISION] Similarity hesaplama hatası:', e.message);
      return 0;
    }
  }

  /**
   * SONUÇ DEĞERLENDİR
   */
  evaluateOutcome(beforeCandles, futureCandles) {
    try {
      if (futureCandles.length < 5) {
        return { direction: 'UNKNOWN', returnPct: 0, maxGain: 0, maxLoss: 0, riskRewardRatio: 0, profitable: false };
      }

      const startPrice = parseFloat(beforeCandles[beforeCandles.length - 1][4]);
      const endPrice = parseFloat(futureCandles[futureCandles.length - 1][4]);
      const maxPrice = Math.max(...futureCandles.map(c => parseFloat(c[2])));
      const minPrice = Math.min(...futureCandles.map(c => parseFloat(c[3])));

      const returnPct = ((endPrice - startPrice) / startPrice) * 100;
      const maxGain = ((maxPrice - startPrice) / startPrice) * 100;
      const maxLoss = ((startPrice - minPrice) / startPrice) * 100;
      const riskRewardRatio = maxLoss > 0 ? maxGain / maxLoss : 0;

      return {
        direction: returnPct > 2 ? 'UP' : returnPct < -2 ? 'DOWN' : 'FLAT',
        returnPct: parseFloat(returnPct.toFixed(2)),
        maxGain: parseFloat(maxGain.toFixed(2)),
        maxLoss: parseFloat(maxLoss.toFixed(2)),
        riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
        profitable: returnPct > 0
      };
    } catch (e) {
      console.warn('[MACHINE-DECISION] Outcome evaluation hatası:', e.message);
      return { direction: 'UNKNOWN', returnPct: 0, maxGain: 0, maxLoss: 0, riskRewardRatio: 0, profitable: false };
    }
  }

  /**
   * DESEN SONUÇLARINI ANALIZ ET
   */
  analyzePatternOutcomes(similarPatterns, currentState) {
    try {
      const total = similarPatterns.length;
      const profitable = similarPatterns.filter(p => p.outcome.profitable).length;

      const avgReturn = similarPatterns.reduce((s, p) => s + p.outcome.returnPct, 0) / total;
      const avgMaxGain = similarPatterns.reduce((s, p) => s + p.outcome.maxGain, 0) / total;
      const avgMaxLoss = similarPatterns.reduce((s, p) => s + p.outcome.maxLoss, 0) / total;

      const weightedSuccess = similarPatterns.reduce((s, p) => s + (p.outcome.profitable ? p.similarity : 0), 0) / 
                             similarPatterns.reduce((s, p) => s + p.similarity, 0);

      const riskRewardRatio = avgMaxLoss > 0 ? avgMaxGain / avgMaxLoss : 0;

      return {
        totalPatterns: total,
        successRate: profitable / total,
        weightedSuccessRate: weightedSuccess,
        upProbability: total > 0 ? profitable / total : 0,
        downProbability: total > 0 ? (total - profitable) / total : 0,
        avgReturn: parseFloat(avgReturn.toFixed(2)),
        avgMaxGain: parseFloat(avgMaxGain.toFixed(2)),
        avgMaxLoss: parseFloat(avgMaxLoss.toFixed(2)),
        riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
        confidence: parseFloat(weightedSuccess.toFixed(2)),
        topMatches: similarPatterns.slice(0, 3).map(p => ({
          similarity: parseFloat(p.similarity.toFixed(3)),
          outcome: p.outcome
        }))
      };
    } catch (e) {
      console.warn('[MACHINE-DECISION] Pattern outcome analiz hatası:', e.message);
      return { totalPatterns: 0, successRate: 0, avgReturn: 0, riskRewardRatio: 0 };
    }
  }

  /**
   * RİSK PROFİLİ HESAPLA (Kelly Criterion)
   */
  calculateRiskProfile(patternAnalysis, currentState, candles) {
    try {
      const closes = candles.map(c => parseFloat(c[4]));
      const price = closes[closes.length - 1];
      const atr14 = this.calculateATR(candles, 14);

      const winRate = patternAnalysis.successRate;
      const avgWin = patternAnalysis.avgMaxGain;
      const avgLoss = patternAnalysis.avgMaxLoss;

      // Kelly Fraction
      let kellyFraction = 0;
      if (avgLoss > 0 && winRate > 0) {
        const b = avgWin / avgLoss;
        kellyFraction = (winRate * b - (1 - winRate)) / b;
        kellyFraction = Math.max(0, Math.min(0.25, kellyFraction));
      }

      const suggestedStopLoss = price - (atr14 * 1.5);
      const suggestedTakeProfit = price + (atr14 * (avgWin / Math.max(avgLoss, 0.1)));
      const riskRewardRatio = avgLoss > 0 ? ((suggestedTakeProfit - price) / (price - suggestedStopLoss)) : 0;

      return {
        kellyFraction: parseFloat(kellyFraction.toFixed(2)),
        atr14: parseFloat(atr14.toFixed(8)),
        suggestedStopLoss: parseFloat(suggestedStopLoss.toFixed(8)),
        suggestedTakeProfit: parseFloat(suggestedTakeProfit.toFixed(8)),
        riskPerTrade: parseFloat((kellyFraction * 100).toFixed(2)),
        riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
        acceptable: winRate > 0.30 // AGRESİF: 30% win rate yeterli
      };
    } catch (e) {
      console.warn('[MACHINE-DECISION] Risk profile hesaplama hatası:', e.message);
      return { acceptable: false };
    }
  }

  /**
   * KENDİ PERFORMANSINI DEĞERLENDİR
   */
  evaluateSelfPerformance() {
    try {
      const recentOutcomes = this.memory.outcomes.slice(-20);
      let confidence = 0.80;

      if (recentOutcomes.length > 0) {
        const winRate = recentOutcomes.filter(o => o.profitable).length / recentOutcomes.length;
        confidence = 0.5 + (winRate * 0.5); // 0.5 - 1.0 aralığı
      }

      return {
        confidence: parseFloat(confidence.toFixed(2)),
        shouldTrade: true,
        reason: this.state.mode
      };
    } catch (e) {
      console.warn('[MACHINE-DECISION] Self assessment hatası:', e.message);
      return { confidence: 0.5, shouldTrade: true };
    }
  }

  /**
   * KARAR VER
   */
  makeDecision(patternAnalysis, riskProfile, selfAssessment, currentState) {
    try {
      if (!riskProfile.acceptable) {
        return {
          action: 'WAIT',
          confidence: 0,
          reasoning: 'RİSK_PROFİLİ_UYGUN_DEĞİL',
          expectedReturn: 0,
          stopLoss: null,
          takeProfit: null
        };
      }

      const adjustedThreshold = this.getDynamicConfidenceThreshold();

      if (patternAnalysis.confidence < adjustedThreshold) {
        return {
          action: 'WAIT',
          confidence: patternAnalysis.confidence,
          reasoning: `CONFIDENCE_ALTINDA (${(patternAnalysis.confidence * 100).toFixed(0)}% < ${(adjustedThreshold * 100).toFixed(0)}%)`,
          expectedReturn: patternAnalysis.avgReturn,
          stopLoss: null,
          takeProfit: null
        };
      }

      // Yön belirle
      let direction = 'BUY';
      if (patternAnalysis.upProbability < 0.40) {
        direction = 'SELL';
      }

      return {
        action: direction,
        confidence: patternAnalysis.confidence,
        reasoning: `${patternAnalysis.totalPatterns} desen, başarı: %${(patternAnalysis.successRate * 100).toFixed(1)}, R/R: ${patternAnalysis.riskRewardRatio}`,
        expectedReturn: patternAnalysis.avgReturn,
        stopLoss: riskProfile.suggestedStopLoss,
        takeProfit: riskProfile.suggestedTakeProfit
      };
    } catch (e) {
      console.warn('[MACHINE-DECISION] Decision making hatası:', e.message);
      return { action: 'WAIT', confidence: 0 };
    }
  }

  /**
   * DİNAMİK CONFIDENCE THRESHOLD
   */
  getDynamicConfidenceThreshold() {
    // AGRESİF: Neredeyse her zaman geç (0.10)
    return this.settings.confidenceRequired;
  }

  /**
   * KARARI BELLEĞE KAYDET
   */
  recordDecision(decision, marketState) {
    try {
      this.memory.signals.push({
        ...decision,
        marketState: marketState,
        timestamp: Date.now()
      });
      this.state.totalSignals++;
    } catch (e) {
      console.warn('[MACHINE-DECISION] Decision recording hatası:', e.message);
    }
  }

  /**
   * SINYAL SONUCUNDAN ÖĞREN
   */
  feedbackSignalResult(signalTimestamp, actualReturn, maxFavorable, maxAdverse) {
    try {
      const signal = this.memory.signals.find(s => s.timestamp === signalTimestamp);
      if (!signal) return;

      const outcome = {
        signalTimestamp,
        actualReturn: parseFloat(actualReturn.toFixed(2)),
        maxFavorable: parseFloat(maxFavorable.toFixed(2)),
        maxAdverse: parseFloat(maxAdverse.toFixed(2)),
        profitable: actualReturn > 0,
        riskRewardRealized: maxAdverse > 0 ? maxFavorable / maxAdverse : 0
      };

      this.memory.outcomes.push(outcome);

      // Pattern library'e ekle
      if (outcome.profitable) {
        this.memory.patternLibrary.push({
          state: signal.marketState,
          outcome: 'SUCCESS',
          return: actualReturn
        });
        this.state.successfulSignals++;
      }

      // Drawdown tracking
      if (actualReturn < 0) {
        this.state.consecutiveLosses++;
        this.state.currentBalance *= (1 + actualReturn / 100);
        if (this.state.currentBalance < this.state.peakBalance) {
          this.state.currentDrawdown = (this.state.peakBalance - this.state.currentBalance) / this.state.peakBalance;
        }
      } else {
        this.state.consecutiveLosses = 0;
        this.state.currentBalance *= (1 + actualReturn / 100);
        if (this.state.currentBalance > this.state.peakBalance) {
          this.state.peakBalance = this.state.currentBalance;
          this.state.currentDrawdown = 0;
        }
      }

      // Threshold'u adapt et
      this.adaptThresholds();

      // 10 işlemde bir DB'ye kaydet
      if (this.state.totalSignals % 10 === 0) {
        this.saveToDB();
      }
    } catch (e) {
      console.error('[MACHINE-DECISION] Feedback hatası:', e.message);
    }
  }

  /**
   * THRESHOLD'U ADAPT ET
   */
  adaptThresholds() {
    try {
      const recentOutcomes = this.memory.outcomes.slice(-50);
      if (recentOutcomes.length < 20) return;

      const successRate = recentOutcomes.filter(o => o.profitable).length / recentOutcomes.length;

      if (successRate > 0.60) {
        // Çok başarılı: Threshold düşür (daha fazla işlem aç)
        this.settings.confidenceRequired = Math.max(0.30, this.settings.confidenceRequired - 0.02);
      } else if (successRate < 0.40) {
        // Başarısız: Threshold yükselt (daha az işlem)
        this.settings.confidenceRequired = Math.min(0.70, this.settings.confidenceRequired + 0.03);
      }

      console.log(`[MACHINE-DECISION] Threshold güncellendi: ${(this.settings.confidenceRequired * 100).toFixed(0)}% (WR: ${(successRate * 100).toFixed(0)}%)`);
    } catch (e) {
      console.warn('[MACHINE-DECISION] Threshold adaptation hatası:', e.message);
    }
  }

  /**
   * YARDIMCI FONKSİYONLAR
   */

  calculateRSI(data, period = 14) {
    if (data.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
      const diff = data[i] - data[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period, avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
  }

  calculateVolatility(closes, period = 14) {
    if (closes.length < period) return 0;
    const returns = [];
    for (let i = closes.length - period; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
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
    for (let i = period; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }

  analyzeVolumeProfile(volumes, closes) {
    try {
      const recent = volumes.slice(-20);
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const current = volumes[volumes.length - 1];
      const ratio = current / avg;

      if (ratio > 2.0) return 'HIGH_SPIKE';
      if (ratio > 1.5) return 'ABOVE_AVERAGE';
      if (ratio < 0.5) return 'LOW';
      return 'NORMAL';
    } catch (e) {
      return 'UNKNOWN';
    }
  }

  createNullResponse(reason) {
    return {
      symbol: 'UNKNOWN',
      action: 'WAIT',
      confidence: 0,
      reasoning: reason,
      expectedReturn: 0,
      stopLoss: null,
      takeProfit: null,
      similarPatternsFound: 0,
      patternSuccessRate: 0,
      machineConfidence: 0,
      timestamp: Date.now()
    };
  }

  /**
   * DURUM RAPORU
   */
  getStatus() {
    return {
      mode: this.state.mode,
      totalSignals: this.state.totalSignals,
      successfulSignals: this.state.successfulSignals,
      successRate: this.state.totalSignals > 0
        ? parseFloat(((this.state.successfulSignals / this.state.totalSignals) * 100).toFixed(2))
        : 0,
      consecutiveLosses: this.state.consecutiveLosses,
      currentDrawdown: parseFloat((this.state.currentDrawdown * 100).toFixed(2)),
      patternLibrarySize: this.memory.patternLibrary.length,
      confidenceThreshold: parseFloat((this.settings.confidenceRequired * 100).toFixed(0)),
      indicatorWeights: this.indicatorWeights
    };
  }
}

module.exports = MachineDecisionEngine;
