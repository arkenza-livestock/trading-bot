// trading-bot.js - DÜZELTİLMİŞ VERSİYON
const WebSocket = require('ws');

// TechnicalAnalysis.js'in aynı klasörde olduğunu varsayıyoruz
const TechnicalAnalysis = require('./technicalAnalysis.js');

class TradingBot {
    constructor(settings = {}) {
        this.settings = {
            symbol: 'BTCUSDT',
            interval: '1m',
            minScore: 30,
            minVolume: 1000000,
            ...settings
        };
        
        this.candles = [];
        this.currentCandle = null;
        this.lastProcessedCandle = null;
        this.ws = null;
        this.isRunning = false;
        this.stats = {
            signals: 0,
            lastSignal: null,
            startTime: Date.now()
        };
    }

    start() {
        if (this.isRunning) {
            console.log('Bot zaten çalışıyor');
            return;
        }
        
        console.log(`
╔══════════════════════════════════════╗
║   🤖 KRYPTO TRADING BOT BAŞLATILIYOR  ║
╠══════════════════════════════════════╣
║ Sembol: ${this.settings.symbol.padEnd(30)}║
║ Periyot: ${this.settings.interval.padEnd(29)}║
║ Min Score: ${String(this.settings.minScore).padEnd(28)}║
╚══════════════════════════════════════╝
        `);
        
        this.isRunning = true;
        this.connectWebSocket();
    }

    connectWebSocket() {
        const streamName = `${this.settings.symbol.toLowerCase()}@kline_${this.settings.interval}`;
        const wsUrl = `wss://stream.binance.com:9443/ws/${streamName}`;
        
        console.log(`🔌 WebSocket bağlanıyor: ${streamName}`);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.on('open', () => {
            console.log('✅ WebSocket bağlantısı kuruldu');
            console.log('📊 Veri bekleniyor...');
        });
        
        this.ws.on('message', (data) => {
            try {
                const parsed = JSON.parse(data);
                this.handleKlineData(parsed);
            } catch (err) {
                console.error('Parse hatası:', err.message);
            }
        });
        
        this.ws.on('error', (error) => {
            console.error('❌ WebSocket hatası:', error.message);
        });
        
        this.ws.on('close', () => {
            console.log('⚠️ WebSocket bağlantısı kapandı, 5 saniye sonra yeniden bağlanıyor...');
            setTimeout(() => this.connectWebSocket(), 5000);
        });
    }

    handleKlineData(data) {
        if (!data.k) return;
        
        const kline = data.k;
        const isCandleClosed = kline.x;
        
        if (isCandleClosed) {
            setTimeout(() => {
                this.processClosedCandle(kline);
            }, 2000);
        } else {
            this.currentCandle = this.parseKline(kline);
            this.updateCurrentCandle();
        }
    }

    parseKline(kline) {
        return {
            openTime: kline.t,
            closeTime: kline.T,
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
            volume: parseFloat(kline.v),
            closed: kline.x
        };
    }

    updateCurrentCandle() {
        if (this.currentCandle) {
            const timeStr = new Date().toLocaleTimeString();
            const price = this.currentCandle.close.toFixed(2);
            process.stdout.write(`\r📊 [${timeStr}] Fiyat: $${price} | Hacim: ${(this.currentCandle.volume/1000).toFixed(0)}K     `);
        }
    }

    async processClosedCandle(kline) {
        const newCandle = this.parseKline(kline);
        
        if (this.lastProcessedCandle && this.lastProcessedCandle.closeTime === newCandle.closeTime) {
            return;
        }
        
        this.candles.push(newCandle);
        
        if (this.candles.length > 50) {
            this.candles.shift();
        }
        
        this.lastProcessedCandle = newCandle;
        
        if (this.candles.length < 20) {
            console.log(`\n⏳ Veri toplanıyor... ${this.candles.length}/20`);
            return;
        }
        
        const ticker = await this.fetchTicker();
        if (!ticker) return;
        
        try {
            // Analyze metodunu çağır
            const analysis = TechnicalAnalysis.analyze(this.candles, ticker, {
                min_score: this.settings.minScore,
                min_volume: this.settings.minVolume,
                rsi_period: 14,
                rsi_oversold: 30,
                rsi_overbought: 70
            });
            
            if (analysis && analysis.signal) {
                this.displayResult(analysis);
                
                if (analysis.signal === 'ALIM' && analysis.score >= this.settings.minScore) {
                    this.executeBuySignal(analysis);
                } else if (analysis.signal === 'SATIS') {
                    this.executeSellSignal(analysis);
                }
            }
        } catch (err) {
            console.error('Analiz hatası:', err.message);
        }
    }

    async fetchTicker() {
        try {
            const https = require('https');
            const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${this.settings.symbol}`;
            
            const response = await new Promise((resolve, reject) => {
                https.get(url, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(JSON.parse(data)));
                    res.on('error', reject);
                });
            });
            
            return {
                symbol: response.symbol,
                priceChangePercent: parseFloat(response.priceChangePercent),
                quoteVolume: parseFloat(response.quoteVolume)
            };
        } catch (error) {
            console.error('❌ Ticker alınamadı:', error.message);
            return null;
        }
    }

    displayResult(analysis) {
        const signalEmoji = analysis.signal === 'ALIM' ? '🟢' : analysis.signal === 'SATIS' ? '🔴' : '⚪';
        
        console.log(`
┌─────────────────────────────────────────────────┐
│ ${signalEmoji} ${analysis.symbol} - ${analysis.signal} SİNYALİ (Skor: ${analysis.score}) │
├─────────────────────────────────────────────────┤
│ 💰 Fiyat: $${analysis.price?.toFixed(2) || '?'}                                        │
│ 📊 24s Değişim: ${analysis.change24h > 0 ? '+' : ''}${analysis.change24h?.toFixed(2) || '?'}%                                   │
│ 💧 Hacim: $${((analysis.volume24h || 0) / 1000000).toFixed(1)}M                                      │
│ 🎯 RSI: ${analysis.rsi?.toFixed(1) || '?'}                                              │
│ ⚖️ Risk/Ödül: ${analysis.riskOdul || '?'}x                                            │
├─────────────────────────────────────────────────┤
│ 🎯 Hedef: $${analysis.target?.toFixed(2) || '?'}                                        │
│ 🛑 Stop: $${analysis.stopLoss?.toFixed(2) || '?'}                                       │
└─────────────────────────────────────────────────┘`);

        if (analysis.positive && analysis.positive.length > 0) {
            console.log(`\n✅ POZİTİF FAKTÖRLER:`);
            analysis.positive.forEach(p => console.log(`  ${p}`));
        }
        
        if (analysis.negative && analysis.negative.length > 0) {
            console.log(`\n⚠️ NEGATİF FAKTÖRLER:`);
            analysis.negative.forEach(n => console.log(`  ${n}`));
        }
        
        console.log('\n' + '─'.repeat(50) + '\n');
    }

    executeBuySignal(analysis) {
        this.stats.signals++;
        this.stats.lastSignal = {
            type: 'BUY',
            symbol: analysis.symbol,
            price: analysis.price,
            score: analysis.score,
            time: new Date().toISOString()
        };
        
        console.log(`
╔══════════════════════════════════════════════════╗
║              🟢 ALIM SİNYALİ 🟢                   ║
╠══════════════════════════════════════════════════╣
║ Sembol: ${analysis.symbol.padEnd(45)}║
║ Fiyat: $${analysis.price?.toFixed(2).padEnd(42)}║
║ Skor: ${analysis.score} / 100${' '.repeat(38)}║
║ Hedef: $${analysis.target?.toFixed(2).padEnd(42)}║
║ Stop: $${analysis.stopLoss?.toFixed(2).padEnd(43)}║
╚══════════════════════════════════════════════════╝
        `);
    }

    executeSellSignal(analysis) {
        this.stats.signals++;
        this.stats.lastSignal = {
            type: 'SELL',
            symbol: analysis.symbol,
            price: analysis.price,
            score: analysis.score,
            time: new Date().toISOString()
        };
        
        console.log(`
╔══════════════════════════════════════════════════╗
║              🔴 SATIŞ SİNYALİ 🔴                  ║
╠══════════════════════════════════════════════════╣
║ Sembol: ${analysis.symbol.padEnd(45)}║
║ Fiyat: $${analysis.price?.toFixed(2).padEnd(42)}║
║ Skor: ${analysis.score} / 100${' '.repeat(38)}║
╚══════════════════════════════════════════════════╝
        `);
    }

    stop() {
        if (this.ws) {
            this.ws.close();
        }
        this.isRunning = false;
        console.log('\n🛑 Bot durduruldu');
    }
}

// ============ ÇALIŞTIRMA ============
console.log('Bot başlatılıyor...');

const bot = new TradingBot({
    symbol: 'BTCUSDT',
    interval: '1m',
    minScore: 30,
    minVolume: 1000000
});

bot.start();

process.on('SIGINT', () => {
    bot.stop();
    process.exit();
});
