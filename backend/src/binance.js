const axios = require('axios');

class BinanceService {
  constructor() {
    this.baseURL = 'https://api.binance.com';
    this.headers = { 'User-Agent': 'Mozilla/5.0 (compatible; TradingBot/1.0)' };
  }

  async getAllTickers() {
    const res = await axios.get(`${this.baseURL}/api/v3/ticker/24hr`, {
      headers: this.headers, timeout: 15000
    });
    return res.data;
  }

  async getKlines(symbol, interval, limit=100) {
    const res = await axios.get(`${this.baseURL}/api/v3/klines`, {
      params: { symbol, interval, limit },
      headers: this.headers, timeout: 10000
    });
    return res.data;
  }

  async getPrice(symbol) {
    const res = await axios.get(`${this.baseURL}/api/v3/ticker/price`, {
      params: { symbol },
      headers: this.headers, timeout: 5000
    });
    return parseFloat(res.data.price);
  }
}

module.exports = new BinanceService();
