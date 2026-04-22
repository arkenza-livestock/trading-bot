const axios = require('axios');
const crypto = require('crypto');

class BinanceService {
  constructor(apiKey, apiSecret) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = 'https://api.binance.com';
  }

  sign(params) {
    const query = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
    return crypto.createHmac('sha256', this.apiSecret).update(query).digest('hex');
  }

  async request(method, path, params = {}, signed = false) {
    if (signed) {
      params.timestamp = Date.now();
      params.signature = this.sign(params);
    }
    const config = {
      method,
      url: `${this.baseUrl}${path}`,
      headers: { 'X-MBX-APIKEY': this.apiKey },
      params: method === 'GET' ? params : undefined,
      data: method !== 'GET' ? new URLSearchParams(params).toString() : undefined
    };
    const res = await axios(config);
    return res.data;
  }

  async getAllTickers() {
    return this.request('GET', '/api/v3/ticker/24hr');
  }

  async getKlines(symbol, interval = '4h', limit = 100) {
    return this.request('GET', '/api/v3/klines', { symbol, interval, limit });
  }

  async getBalance() {
    return this.request('GET', '/api/v3/account', {}, true);
  }

  async getUSDTBalance() {
    const account = await this.getBalance();
    const usdt = account.balances.find(b => b.asset === 'USDT');
    return usdt ? parseFloat(usdt.free) : 0;
  }

  async placeOrder(symbol, side, quantity) {
    return this.request('POST', '/api/v3/order', {
      symbol, side, type: 'MARKET',
      quantity: quantity.toFixed(6)
    }, true);
  }

  async getPrice(symbol) {
    const data = await this.request('GET', '/api/v3/ticker/price', { symbol });
    return parseFloat(data.price);
  }
}

module.exports = BinanceService;
