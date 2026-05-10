/**
 * ═══════════════════════════════════════════════════════════════════════════
 *   TELEGRAM.JS - TELEGRAM BOT BİLDİRİMLERİ
 *   
 *   📢 Özellikler:
 *   - Sinyal bildirimleri
 *   - İşlem açılıp kapandı bildirimi
 *   - Statü raporları
 *   - Hata uyarıları
 * ═══════════════════════════════════════════════════════════════════════════
 */

const TelegramBot = require('node-telegram-bot-api');

class TelegramService {
  constructor(token, chatId) {
    this.token = token;
    this.chatId = chatId;
    this.enabled = false;

    try {
      this.bot = new TelegramBot(token, { polling: false });
      this.enabled = true;
      console.log('[TELEGRAM] ✅ Bot bağlandı');
    } catch (e) {
      console.warn('[TELEGRAM] ⚠️  Token geçersiz veya bağlantı başarısız');
      this.enabled = false;
    }
  }

  /**
   * Mesaj gönder
   */
  async sendMessage(text) {
    if (!this.enabled || !this.bot) {
      return Promise.resolve(null);
    }

    try {
      return await this.bot.sendMessage(this.chatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
    } catch (e) {
      console.error('[TELEGRAM] Mesaj gönderme hatası:', e.message);
      return null;
    }
  }

  /**
   * Sinyal bildirimi
   */
  async notifySignal(signal) {
    const text = `
🟢 <b>SINYAL: ${signal.symbol}</b>

<b>Taraf:</b> ${signal.side === 'LONG' ? '📈 LONG (AL)' : '📉 SHORT (SAT)'}
<b>Fiyat:</b> $${signal.fiyat.toFixed(8)}
<b>Puan:</b> ${signal.puan}/100
<b>Kural:</b> ${signal.passedCount}/${signal.totalRules}

<b>Stop Loss:</b> $${signal.stop_loss.toFixed(8)}
<b>Take Profit:</b> $${signal.hedef.toFixed(8)}
<b>R/R Oranı:</b> ${signal.riskRewardRatio.toFixed(2)}:1

<b>Trend:</b> ${signal.trend}
<b>RSI:</b> ${signal.rsi.toFixed(1)}
<b>Rejim:</b> ${signal.regime}

<b>Risk:</b> ${signal.risk}
<b>Güven:</b> %${(signal.confidence * 100).toFixed(0)}
    `;

    return this.sendMessage(text);
  }

  /**
   * Pozisyon açıldı bildirimi
   */
  async notifyPositionOpened(signal) {
    const text = `
✅ <b>POZİSYON AÇILDI</b>

<b>Sembol:</b> ${signal.symbol}
<b>Taraf:</b> ${signal.side === 'LONG' ? '📈 LONG' : '📉 SHORT'}
<b>Entry:</b> $${signal.fiyat.toFixed(8)}
<b>S/L:</b> $${signal.stop_loss.toFixed(8)}
<b>T/P:</b> $${signal.hedef.toFixed(8)}

<b>Puan:</b> ${signal.puan}
<b>Güven:</b> %${(signal.confidence * 100).toFixed(0)}
    `;

    return this.sendMessage(text);
  }

  /**
   * Pozisyon kapandı bildirimi
   */
  async notifyPositionClosed(symbol, side, pnl, pnlPercent, reason) {
    const emoji = pnl >= 0 ? '💚' : '❤️';
    const text = `
${emoji} <b>POZİSYON KAPANDI</b>

<b>Sembol:</b> ${symbol}
<b>Taraf:</b> ${side === 'LONG' ? '📈 LONG' : '📉 SHORT'}
<b>Neden:</b> ${reason}

<b>PnL:</b> ${pnl.toFixed(4)} USDT
<b>PnL %:</b> ${pnlPercent.toFixed(2)}%

${pnl >= 0 ? '🎉 <b>KAR!</b>' : '⚠️ <b>ZARAR!</b>'}
    `;

    return this.sendMessage(text);
  }

  /**
   * Bot raporu
   */
  async sendReport(stats) {
    const text = `
📊 <b>BOT RAPORU</b>

<b>Bakiye:</b> ${stats.wallet?.current || 0} USDT
<b>Toplam Kar/Zarar:</b> ${stats.profitability?.totalPnL || 0} USDT (${stats.profitability?.totalPnLPercent || 0}%)

<b>İşlem Sayısı:</b> ${stats.trades?.total || 0}
<b>Kazanan:</b> ${stats.trades?.wins || 0}
<b>Kaybeden:</b> ${stats.trades?.losses || 0}
<b>Kazanç Oranı:</b> %${stats.trades?.winRate || 0}

<b>Sharpe Ratio:</b> ${stats.risk?.sharpeRatio || 0}
<b>Max Drawdown:</b> %${stats.risk?.maxDrawdown || 0}
<b>Profit Factor:</b> ${stats.profitability?.profitFactor || 0}

<b>Açık Pozisyon:</b> ${stats.trades?.open || 0}
<b>Threshold:</b> %${stats.adaptive?.threshold || 65}
    `;

    return this.sendMessage(text);
  }

  /**
   * Hata bildirimi
   */
  async notifyError(title, message) {
    const text = `
⚠️ <b>HATA: ${title}</b>

${message}

<code>${new Date().toLocaleString()}</code>
    `;

    return this.sendMessage(text);
  }

  /**
   * Uyarı bildirimi
   */
  async notifyWarning(title, message) {
    const text = `
🟡 <b>UYARI: ${title}</b>

${message}

<code>${new Date().toLocaleString()}</code>
    `;

    return this.sendMessage(text);
  }

  /**
   * Bilgi bildirimi
   */
  async notifyInfo(title, message) {
    const text = `
ℹ️ <b>${title}</b>

${message}

<code>${new Date().toLocaleString()}</code>
    `;

    return this.sendMessage(text);
  }

  /**
   * BTC Trend bildirimi
   */
  async notifyBTCTrend(btcTrend) {
    const text = `
📈 <b>BTC TREPi GÜNCELLEME</b>

<b>Trend:</b> ${btcTrend.trend}
<b>RSI:</b> ${btcTrend.rsi.toFixed(1)}
<b>ADX:</b> ${btcTrend.strength.toFixed(1)}
<b>Fiyat:</b> $${btcTrend.fiyat.toFixed(0)}
<b>Rejim:</b> ${btcTrend.regime}

<b>Açıklama:</b> ${btcTrend.regimeDescription || '-'}
    `;

    return this.sendMessage(text);
  }

  /**
   * Tarama başladı/bitti bildirimi
   */
  async notifyScanStatus(coinsScanned, signalsFound, duration) {
    const text = `
🔍 <b>TARAMA TAMAMLANDI</b>

<b>Taradı:</b> ${coinsScanned} coin
<b>Sinyal:</b> ${signalsFound} ✅
<b>Süre:</b> ${duration}ms

<code>${new Date().toLocaleString()}</code>
    `;

    return this.sendMessage(text);
  }

  /**
   * Consecutive loss uyarısı
   */
  async notifyConsecutiveLosses(count) {
    const text = `
🚨 <b>UYARI: ART ARDA ${count} KAYBEDILEN İŞLEM</b>

Adaptif threshold artırıldı.
Daha katı sinyal filtreleri uygulanıyor.
    `;

    return this.sendMessage(text);
  }

  /**
   * Bot başlatıldı/durduruldu
   */
  async notifyBotStatus(running) {
    const text = `
${running ? '🚀' : '⏸️'} <b>BOT ${running ? 'BAŞLATILDI' : 'DURDURULDU'}</b>

<code>${new Date().toLocaleString()}</code>
    `;

    return this.sendMessage(text);
  }

  /**
   * İstatistik raporu
   */
  async sendStatsReport(stats) {
    const text = `
📊 <b>DETAYLI İSTATİSTİKLER</b>

<b>=== BAKIYE ===</b>
Güncel: ${stats.wallet.current} USDT
Başlangıç: ${stats.wallet.start} USDT
Değişim: ${stats.wallet.change}%

<b>=== TİCARET ===</b>
Toplam: ${stats.trades.total}
Kazananlar: ${stats.trades.wins}
Kaybedenler: ${stats.trades.losses}
Win Rate: %${stats.trades.winRate}

<b>=== KAR/ZARAR ===</b>
Toplam: ${stats.profitability.totalPnL.toFixed(4)} USDT
Yüzde: %${stats.profitability.totalPnLPercent}
Avg Win: %${stats.profitability.avgWin}
Avg Loss: %${stats.profitability.avgLoss}
Profit Factor: ${stats.profitability.profitFactor}

<b>=== RİSK ===</b>
Sharpe Ratio: ${stats.risk.sharpeRatio}
Max DD: %${stats.risk.maxDrawdown}
Streak: ${stats.risk.winStreak}W/${stats.risk.consecutiveLosses}L
    `;

    return this.sendMessage(text);
  }

  /**
   * Ping test (bot aktif mi kontrol et)
   */
  async ping() {
    try {
      await this.sendMessage('🤖 Ping! Bot aktif ve çalışıyor.');
      return true;
    } catch (e) {
      console.error('[TELEGRAM] Ping başarısız:', e.message);
      return false;
    }
  }
}

module.exports = TelegramService;
