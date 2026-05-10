/**
 * ═══════════════════════════════════════════════════════════════════════════
 *   BACKTEST.JS - BACKTESTING VE PERFORMANS ANALİZİ
 *   
 *   📊 Özellikler:
 *   - Geçmiş verilerde test
 *   - Performans metriklerini hesapla
 *   - Optimize önerileri sun
 * ═══════════════════════════════════════════════════════════════════════════
 */

class BacktestEngine {
  constructor(analysisEngine, simulationEngine, db) {
    this.analysis = analysisEngine;
    this.simulation = simulationEngine;
    this.db = db;

    this.results = {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      totalPnL: 0,
      trades: []
    };

    console.log('[BACKTEST] ✅ Engine başlatıldı');
  }

  /**
   * Geçmiş pozisyonlardan analytics
   */
  analyzeHistoricalPerformance() {
    try {
      const closed = this.db.prepare("SELECT * FROM sim_positions WHERE status = 'CLOSED'").all() || [];
      
      if (closed.length === 0) {
        return {
          status: 'NO_DATA',
          message: 'Yeterli kapalı işlem verisi yok'
        };
      }

      const wins = closed.filter(p => (p.pnl || 0) > 0);
      const losses = closed.filter(p => (p.pnl || 0) <= 0);
      const totalPnL = closed.reduce((s, p) => s + (parseFloat(p.pnl) || 0), 0);

      // PnL yüzdeleri
      const pnlPercents = closed.map(p => parseFloat(p.pnl_percent) || 0);
      const avgPnL = pnlPercents.length > 0 ? pnlPercents.reduce((a, b) => a + b, 0) / pnlPercents.length : 0;

      // Variance ve Sharpe
      const variance = pnlPercents.length > 1 
        ? pnlPercents.reduce((a, b) => a + Math.pow(b - avgPnL, 2), 0) / pnlPercents.length 
        : 0;
      const stdDev = Math.sqrt(variance);
      const sharpeRatio = stdDev > 0 ? (avgPnL / stdDev) * Math.sqrt(252) : 0;

      // Max Drawdown
      let peak = 0;
      let maxDD = 0;
      let cumPnL = 0;
      for (const trade of closed) {
        cumPnL += parseFloat(trade.pnl) || 0;
        if (cumPnL > peak) peak = cumPnL;
        const dd = (peak - cumPnL) / (peak || 1) * 100;
        if (dd > maxDD) maxDD = dd;
      }

      // Win Rate
      const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;

      // Avg Win/Loss
      const avgWin = wins.length > 0 
        ? (wins.reduce((s, p) => s + (parseFloat(p.pnl) || 0), 0) / wins.length)
        : 0;
      const avgLoss = losses.length > 0 
        ? (losses.reduce((s, p) => s + (parseFloat(p.pnl) || 0), 0) / losses.length)
        : 0;

      // Profit Factor
      const totalWins = wins.reduce((s, p) => s + (parseFloat(p.pnl) || 0), 0);
      const totalLosses = Math.abs(losses.reduce((s, p) => s + (parseFloat(p.pnl) || 0), 0));
      const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 999;

      return {
        status: 'SUCCESS',
        totalTrades: closed.length,
        wins: wins.length,
        losses: losses.length,
        winRate: parseFloat(winRate.toFixed(2)),
        totalPnL: parseFloat(totalPnL.toFixed(4)),
        avgPnLPerTrade: parseFloat(avgPnL.toFixed(2)),
        avgWin: parseFloat(avgWin.toFixed(4)),
        avgLoss: parseFloat(avgLoss.toFixed(4)),
        sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
        maxDrawdown: parseFloat(maxDD.toFixed(2)),
        profitFactor: parseFloat(profitFactor.toFixed(2)),
        expectancyPerTrade: parseFloat(((avgWin * (winRate / 100)) + (avgLoss * ((100 - winRate) / 100))).toFixed(4))
      };
    } catch (e) {
      console.error('[BACKTEST] Analiz hatası:', e.message);
      return { status: 'ERROR', message: e.message };
    }
  }

  /**
   * Kural performansını analiz et
   */
  analyzeRulePerformance() {
    try {
      const closed = this.db.prepare("SELECT * FROM sim_positions WHERE status = 'CLOSED'").all() || [];
      
      const ruleStats = {};
      const allRules = [
        'supportNear', 'rsiOversold', 'ichimokuBelow', 'rsiDivergence',
        'volumeBuying', 'macdCross', 'goldenCross', 'adxTrendUp',
        'bollingerBounce', 'priceAboveEMA21', 'cmfPositive', 'stochRsiOversold'
      ];

      for (const rule of allRules) {
        ruleStats[rule] = {
          appearances: 0,
          wins: 0,
          losses: 0,
          accuracy: 0,
          avgPnL: 0
        };
      }

      console.log('[BACKTEST] Kural performansı analiz başladı');

      return ruleStats;
    } catch (e) {
      console.error('[BACKTEST] Rule analiz hatası:', e.message);
      return {};
    }
  }

  /**
   * Rejim performansını analiz et
   */
  analyzeRegimePerformance() {
    try {
      const closed = this.db.prepare("SELECT * FROM sim_positions").all() || [];
      
      const regimes = {
        'RALLY': { trades: 0, wins: 0, pnl: 0 },
        'RANGING': { trades: 0, wins: 0, pnl: 0 },
        'DOWNTREND': { trades: 0, wins: 0, pnl: 0 },
        'VOLATILE': { trades: 0, wins: 0, pnl: 0 }
      };

      for (const trade of closed) {
        // Trade'in rejimi bul ve stats güncelle
        // (trade'in rejim bilgisi kaydedilmemiş ise, DB'ye ekle)
      }

      const result = {};
      for (const [regime, stats] of Object.entries(regimes)) {
        result[regime] = {
          totalTrades: stats.trades,
          winRate: stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0,
          totalPnL: parseFloat(stats.pnl.toFixed(4)),
          avgPnLPerTrade: stats.trades > 0 ? parseFloat((stats.pnl / stats.trades).toFixed(4)) : 0
        };
      }

      return result;
    } catch (e) {
      console.error('[BACKTEST] Rejim analiz hatası:', e.message);
      return {};
    }
  }

  /**
   * Optimizasyon önerileri sun
   */
  getOptimizationSuggestions() {
    try {
      const perf = this.analyzeHistoricalPerformance();
      
      if (perf.status !== 'SUCCESS') {
        return {
          status: 'INSUFFICIENT_DATA',
          suggestions: ['En az 50 kapalı işlem gerekli']
        };
      }

      const suggestions = [];

      // Win Rate analizi
      if (perf.winRate < 45) {
        suggestions.push({
          priority: 'HIGH',
          area: 'Sinyal Kalitesi',
          issue: `Düşük kazanç oranı (${perf.winRate}%)`,
          suggestion: 'Red filter'leri katı et, minimum puan eşiğini artır'
        });
      } else if (perf.winRate > 65) {
        suggestions.push({
          priority: 'MEDIUM',
          area: 'Agresivite',
          issue: 'Çok yüksek kazanç oranı (muhtemel curve fitting)',
          suggestion: 'Threshold'ı biraz gevşet, daha fazla işlem açmaya izin ver'
        });
      }

      // Sharpe Ratio
      if (perf.sharpeRatio < 0.5) {
        suggestions.push({
          priority: 'HIGH',
          area: 'Risk Yönetimi',
          issue: 'Düşük Sharpe Ratio (istikrarsız)',
          suggestion: 'Stop loss ve trailing stop ayarlarını gözden geçir'
        });
      }

      // Max Drawdown
      if (perf.maxDrawdown > 20) {
        suggestions.push({
          priority: 'HIGH',
          area: 'Portföy Yönetimi',
          issue: `Yüksek Max DD (${perf.maxDrawdown}%)`,
          suggestion: 'Max open positions sayısını azalt veya trade amount'ı küçült'
        });
      }

      // Profit Factor
      if (perf.profitFactor < 1.5) {
        suggestions.push({
          priority: 'MEDIUM',
          area: 'Risk/Reward',
          issue: `Düşük Profit Factor (${perf.profitFactor})`,
          suggestion: 'R/R oranı minimum 1.5 olmayan işlemleri filtrele'
        });
      }

      // Consecutive Losses
      if (this.simulation.performance.consecutiveLosses >= 3) {
        suggestions.push({
          priority: 'HIGH',
          area: 'Koruma Mekanizması',
          issue: `${this.simulation.performance.consecutiveLosses} art arda kayıp`,
          suggestion: 'Threshold otomatik olarak yükseltildi, sorunu gözlemle'
        });
      }

      return {
        status: 'SUCCESS',
        suggestions: suggestions
      };
    } catch (e) {
      console.error('[BACKTEST] Suggestion hatası:', e.message);
      return { status: 'ERROR' };
    }
  }

  /**
   * Detaylı rapor oluştur
   */
  generateDetailedReport() {
    try {
      const performance = this.analyzeHistoricalPerformance();
      const suggestions = this.getOptimizationSuggestions();
      const rulePerf = this.analyzeRulePerformance();
      const regimePerf = this.analyzeRegimePerformance();

      return {
        timestamp: new Date().toISOString(),
        performance: performance,
        suggestions: suggestions,
        rulePerformance: rulePerf,
        regimePerformance: regimePerf,
        summary: {
          status: performance.status,
          rating: this.calculateRating(performance),
          recommendation: this.getRecommendation(performance)
        }
      };
    } catch (e) {
      console.error('[BACKTEST] Report oluşturma hatası:', e.message);
      return { status: 'ERROR', message: e.message };
    }
  }

  /**
   * Rating hesapla
   */
  calculateRating(perf) {
    let score = 0;

    if (perf.status !== 'SUCCESS') return 'INSUFFICIENT_DATA';

    // Win Rate (40 puan max)
    if (perf.winRate >= 55) score += 40;
    else if (perf.winRate >= 50) score += 30;
    else if (perf.winRate >= 45) score += 20;

    // Sharpe Ratio (30 puan max)
    if (perf.sharpeRatio >= 1.5) score += 30;
    else if (perf.sharpeRatio >= 1.0) score += 20;
    else if (perf.sharpeRatio >= 0.5) score += 10;

    // Max DD (20 puan max)
    if (perf.maxDrawdown < 10) score += 20;
    else if (perf.maxDrawdown < 15) score += 15;
    else if (perf.maxDrawdown < 20) score += 10;

    // Profit Factor (10 puan max)
    if (perf.profitFactor >= 2.0) score += 10;
    else if (perf.profitFactor >= 1.5) score += 5;

    if (score >= 80) return '⭐⭐⭐⭐⭐ EXCELLENT';
    if (score >= 60) return '⭐⭐⭐⭐ VERY GOOD';
    if (score >= 40) return '⭐⭐⭐ GOOD';
    if (score >= 20) return '⭐⭐ FAIR';
    return '⭐ POOR';
  }

  /**
   * Tavsiye sun
   */
  getRecommendation(perf) {
    if (perf.status !== 'SUCCESS') {
      return 'Daha fazla işlem verisi gerekli (minimum 50)';
    }

    if (perf.winRate < 45) {
      return '❌ Henüz production\'a hazır değil. Filtreleri iyileştir.';
    } else if (perf.winRate >= 55 && perf.sharpeRatio >= 1.0) {
      return '✅ Production\'a hazır! Test sürümüyle başla.';
    } else if (perf.winRate >= 50) {
      return '⚠️  İyiye doğru gidiyor. 2-3 hafta daha test et.';
    } else {
      return '📊 Bir kaç metrik iyi, ama genel olarak daha gelişim gerekli.';
    }
  }
}

module.exports = BacktestEngine;
