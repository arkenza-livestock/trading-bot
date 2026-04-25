const axios = require('axios');
const crypto = require('crypto');

class BinanceService {
  constructor(apiKey, apiSecret) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = 'https://api.binance.com';
    this.requestWeight = 0;
    this.weightResetTime = Date.now() + 60000;
  }

  // Rate limit takibi
  async checkRateLimit(weight) {
    const now = Date.now();
    if (now > this.weightResetTime) {
      this.requestWeight = 0;
      this.weightResetTime = now + 60000;
    }
    this.requestWeight += weight;
    if (this.requestWeight > 1000) {
      const waitMs = this.weightResetTime - now + 1000;
      console.log(`Rate limit koruması: ${waitMs}ms bekleniyor`);
      await new Promise(r => setTimeout(r, waitMs));
      this.requestWeight = weight;
      this.weightResetTime = Date.now() + 60000;
    }
  }

  sign(params) {
    const query = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
    return crypto.createHmac('sha256', this.apiSecret).update(query).digest('hex');
  }

  async request(method, path, params = {}, signed = false, weight = 1) {
    await this.checkRateLimit(weight);
    if (signed) {
      params.timestamp = Date.now();
      params.signature = this.sign(params);
    }
    const config = {
      method,
      url: `${this.baseUrl}${path}`,
      headers: { 'X-MBX-APIKEY': this.apiKey || '' },
      params: method === 'GET' ? params : undefined,
      data: method !== 'GET' ? new URLSearchParams(params).toString() : undefined,
      timeout: 10000
    };
    const res = await axios(config);
    return res.data;
  }

  // Tüm tickerları tek istekle çek (weight: 40)
  async getAllTickers() {
    return this.request('GET', '/api/v3/ticker/24hr', {}, false, 40);
  }

  // Birden fazla coin için mini ticker (weight: 4)
  async getMiniTickers() {
    return this.request('GET', '/api/v3/ticker/bookTicker', {}, false, 4);
  }

  // Tek coin klines (weight: 2)
  async getKlines(symbol, interval = '3m', limit = 50) {
    return this.request('GET', '/api/v3/klines', { symbol, interval, limit }, false, 2);
  }

  // Toplu klines çekme — rate limit korumalı
  async getMultipleKlines(symbols, interval = '3m', limit = 50) {
    const results = {};
    for (const symbol of symbols) {
      try {
        results[symbol] = await this.getKlines(symbol, interval, limit);
        await new Promise(r => setTimeout(r, 80)); // 80ms bekleme
      } catch (err) {
        console.error(`${symbol} klines hatası:`, err.message);
        results[symbol] = null;
      }
    }
    return results;
  }

  // Hesap bakiyesi (weight: 20)
  async getBalance() {
    return this.request('GET', '/api/v3/account', {}, true, 20);
  }

  async getUSDTBalance() {
    const account = await this.getBalance();
    const usdt = account.balances.find(b => b.asset === 'USDT');
    return usdt ? parseFloat(usdt.free) : 0;
  }

  // Market order (weight: 1)
  async placeOrder(symbol, side, quantity) {
    return this.request('POST', '/api/v3/order', {
      symbol, side, type: 'MARKET',
      quantity: parseFloat(quantity).toFixed(6)
    }, true, 1);
  }

  // Anlık fiyat (weight: 2)
  async getPrice(symbol) {
    const data = await this.request('GET', '/api/v3/ticker/price', { symbol }, false, 2);
    return parseFloat(data.price);
  }
}

module.exports = BinanceService;
