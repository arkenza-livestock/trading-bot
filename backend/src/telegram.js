const https = require('https');

class TelegramService {
  constructor(token, chatId) {
    this.token = token;
    this.chatId = chatId;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async sendMessage(text) {
    if (!this.token || !this.chatId) return;
    return new Promise((resolve) => {
      const body = JSON.stringify({
        chat_id: this.chatId,
        text: text,
        parse_mode: 'HTML'
      });
      const options = {
        hostname: 'api.telegram.org',
        path: `/bot${this.token}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };
      const req = https.request(options, (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      });
      req.on('error', (err) => {
        console.error('Telegram hata:', err.message);
        resolve();
      });
      req.write(body);
      req.end();
    });
  }

  async sendSignal(analysis) {
    if (!this.token || !this.chatId) return;

    const simdi = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    const riskEmoji = analysis.risk === 'DUSUK' ? '🟢' : analysis.risk === 'ORTA' ? '🟡' : '🔴';
    const skorEmoji = analysis.score >= 70 ? '🔥' : analysis.score >= 50 ? '⚡' : '✅';

    const hacim = analysis.volume24h >= 1e9
      ? `$${(analysis.volume24h / 1e9).toFixed(2)}B`
      : `$${(analysis.volume24h / 1e6).toFixed(1)}M`;

    let msg = '';
    msg += `${skorEmoji} <b>ALIM SİNYALİ — ${analysis.symbol}</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💰 Fiyat: <code>${analysis.price}</code> USDT\n`;
    msg += `📊 Skor: <b>${analysis.score}/100</b> | ${riskEmoji} Risk: <b>${analysis.risk}</b>\n`;
    msg += `📅 ${simdi}\n`;
    msg += `💧 Hacim: ${hacim} | 📈 %${analysis.change24h?.toFixed(2)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `<b>📊 TEKNİK ANALİZ</b>\n`;
    msg += `• RSI: <code>${analysis.rsi}</code>\n`;
    msg += `• Momentum: ${analysis.momentum > 0 ? '📈' : '📉'} ${analysis.momentum}\n`;
    msg += `• Hacim: ${analysis.hacimOran}x ortalama\n`;
    msg += `• Alım Baskısı: %${analysis.alimOran?.toFixed(0)}\n`;
    msg += `• S/R Pozisyon: %${analysis.srPozisyon?.toFixed(0)}\n`;
    msg += `• ATR: %${analysis.atrPct}\n\n`;

    if (analysis.positive?.length > 0) {
      msg += `<b>✅ POZİTİF</b>\n`;
      analysis.positive.slice(0, 4).forEach(p => {
        msg += `${p}\n`;
      });
      msg += '\n';
    }

    if (analysis.negative?.length > 0) {
      msg += `<b>⚠️ RİSK</b>\n`;
      analysis.negative.slice(0, 3).forEach(n => {
        msg += `${n}\n`;
      });
      msg += '\n';
    }

    msg += `<b>🎯 HEDEFLER</b>\n`;
    msg += `• Hedef: <code>${analysis.target}</code> USDT\n`;
    msg += `• Stop Loss: <code>${analysis.stopLoss}</code> USDT\n`;
    msg += `• R/R: ${analysis.riskOdul}x\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `<i>Kripto Sinyal Botu • 5M</i>`;

    await this.sendMessage(msg);
  }

  async sendPositionClosed(symbol, reason, pnlPct, pnlUsdt) {
    if (!this.token || !this.chatId) return;
    const emoji = pnlUsdt >= 0 ? '✅' : '❌';
    const simdi = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    let msg = `${emoji} <b>POZİSYON KAPANDI — ${symbol}</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📋 Sebep: <b>${reason}</b>\n`;
    msg += `💰 Net PnL: <b>${pnlUsdt >= 0 ? '+' : ''}${parseFloat(pnlUsdt).toFixed(4)} USDT</b>\n`;
    msg += `📊 Net %: <b>${pnlUsdt >= 0 ? '+' : ''}${parseFloat(pnlPct).toFixed(2)}%</b>\n`;
    msg += `🕐 ${simdi}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━`;
    await this.sendMessage(msg);
  }

  async sendDailyReport(stats) {
    if (!this.token || !this.chatId) return;
    const simdi = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    let msg = `📊 <b>GÜNLÜK RAPOR</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📅 ${simdi}\n`;
    msg += `💰 Toplam PnL: <b>${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl} USDT</b>\n`;
    msg += `🎯 Kazanma Oranı: <b>%${stats.winRate}</b>\n`;
    msg += `✅ Kazanan: ${stats.wins} | ❌ Kaybeden: ${stats.losses}\n`;
    msg += `🔍 Toplam Sinyal: ${stats.totalSignals}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━`;
    await this.sendMessage(msg);
  }
}

module.exports = TelegramService;
