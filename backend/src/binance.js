const axios = require('axios');
const crypto = require('crypto');

// ═══════════════════════════════════════════════
// BINANCE API - PUBLIC ENDPOINTS
// ═══════════════════════════════════════════════

const BASE_URL = 'https://api.binance.com';

async function getKlines(symbol, interval, limit) {
  try {
    var url = BASE_URL + '/api/v3/klines?symbol=' + symbol + '&interval=' + interval + '&limit=' + limit;
    var response = await axios.get(url);
    return response.data;
  } catch(e) {
    console.error('[BINANCE] Klines hatasi (' + symbol + '):', e.message);
    return null;
  }
}

async function getAllTickers() {
  try {
    var response = await axios.get(BASE_URL + '/api/v3/ticker/24hr');
    return response.data;
  } catch(e) {
    console.error('[BINANCE] Ticker hatasi:', e.message);
    return [];
  }
}

// ═══════════════════════════════════════════════
// BINANCE API - PRIVATE (GERÇEK ALIM-SATIM)
// ═══════════════════════════════════════════════

function getBinanceConfig() {
  return {
    apiKey: process.env.BINANCE_API_KEY || '',
    apiSecret: process.env.BINANCE_API_SECRET || '',
    baseUrl: BASE_URL
  };
}

function sign(params, secret) {
  var query = Object.keys(params)
    .sort()
    .map(function(k) { return k + '=' + params[k]; })
    .join('&');
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

async function binanceRequest(method, endpoint, params) {
  var config = getBinanceConfig();
  
  if (!config.apiKey || !config.apiSecret) {
    throw new Error('BINANCE_API_KEY ve BINANCE_API_SECRET tanimlanmamis');
  }

  params.timestamp = Date.now();
  params.signature = sign(params, config.apiSecret);

  var headers = { 'X-MBX-APIKEY': config.apiKey };

  try {
    var response;
    if (method === 'GET') {
      var query = Object.keys(params).map(function(k) { return k + '=' + params[k]; }).join('&');
      response = await axios.get(config.baseUrl + endpoint + '?' + query, { headers: headers });
    } else {
      response = await axios.post(config.baseUrl + endpoint, null, { headers: headers, params: params });
    }
    return response.data;
  } catch(e) {
    if (e.response && e.response.data) {
      throw new Error(JSON.stringify(e.response.data));
    }
    throw e;
  }
}

// Bakiye sorgulama
async function getBalance(asset) {
  var config = getBinanceConfig();
  if (!config.apiKey) return 0;

  try {
    var data = await binanceRequest('GET', '/api/v3/account', {});
    var balance = data.balances.find(function(b) { return b.asset === asset; });
    return balance ? parseFloat(balance.free) : 0;
  } catch(e) {
    console.error('[BINANCE] Bakiye hatasi:', e.message);
    return 0;
  }
}

// Gerçek ALIM (MARKET)
async function realBuy(symbol, usdtAmount, currentPrice) {
  var config = getBinanceConfig();
  if (!config.apiKey) {
    console.log('[BINANCE] ❌ API anahtari yok, alim yapilmadi');
    return null;
  }

  try {
    var symbolFixed = symbol.replace('USDT', '') + 'USDT';
    var quantity = usdtAmount / currentPrice;

    // LOT_SIZE filtresi
    var info = await axios.get(config.baseUrl + '/api/v3/exchangeInfo?symbol=' + symbolFixed);
    var lotFilter = info.data.symbols[0].filters.find(function(f) { return f.filterType === 'LOT_SIZE'; });
    var stepSize = parseFloat(lotFilter.stepSize);
    var precision = Math.floor(Math.log10(1 / stepSize));
    var qty = Math.floor(quantity / stepSize) * stepSize;
    qty = parseFloat(qty.toFixed(Math.max(0, precision)));

    if (qty <= 0) {
      console.log('[BINANCE] ❌ Miktar cok kucuk:', qty);
      return null;
    }

    var params = {
      symbol: symbolFixed,
      side: 'BUY',
      type: 'MARKET',
      quantity: qty
    };

    var result = await binanceRequest('POST', '/api/v3/order', params);
    console.log('[BINANCE] ✅ GERCEK ALIM:', symbolFixed, '| Miktar:', qty, '| Yaklasik:', usdtAmount + ' USDT');
    return result;
  } catch(e) {
    console.error('[BINANCE] ❌ ALIM hatasi:', e.message);
    return null;
  }
}

// Gerçek SATIM (MARKET)
async function realSell(symbol, quantity) {
  var config = getBinanceConfig();
  if (!config.apiKey) {
    console.log('[BINANCE] ❌ API anahtari yok, satis yapilmadi');
    return null;
  }

  try {
    var symbolFixed = symbol.replace('USDT', '') + 'USDT';

    // LOT_SIZE filtresi
    var info = await axios.get(config.baseUrl + '/api/v3/exchangeInfo?symbol=' + symbolFixed);
    var lotFilter = info.data.symbols[0].filters.find(function(f) { return f.filterType === 'LOT_SIZE'; });
    var stepSize = parseFloat(lotFilter.stepSize);
    var precision = Math.floor(Math.log10(1 / stepSize));
    var qty = Math.floor(quantity / stepSize) * stepSize;
    qty = parseFloat(qty.toFixed(Math.max(0, precision)));

    if (qty <= 0) {
      console.log('[BINANCE] ❌ Miktar cok kucuk:', qty);
      return null;
    }

    var params = {
      symbol: symbolFixed,
      side: 'SELL',
      type: 'MARKET',
      quantity: qty
    };

    var result = await binanceRequest('POST', '/api/v3/order', params);
    console.log('[BINANCE] ✅ GERCEK SATIS:', symbolFixed, '| Miktar:', qty);
    return result;
  } catch(e) {
    console.error('[BINANCE] ❌ SATIS hatasi:', e.message);
    return null;
  }
}

module.exports = {
  getKlines: getKlines,
  getAllTickers: getAllTickers,
  getBalance: getBalance,
  realBuy: realBuy,
  realSell: realSell
};
