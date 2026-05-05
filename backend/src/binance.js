const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = 'https://api.binance.com';

// ═══════════════════════════════════════════
// PUBLIC ENDPOINTS
// ═══════════════════════════════════════════

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

// ═══════════════════════════════════════════
// AYARLARDAN API ANAHTARI OKUMA
// ═══════════════════════════════════════════

function getBinanceKeys() {
  try {
    var db = require('./database');
    var rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('binance_api_key','binance_api_secret')").all();
    var settings = {};
    rows.forEach(function(r) { settings[r.key] = r.value; });
    return {
      apiKey: settings.binance_api_key || '',
      apiSecret: settings.binance_api_secret || ''
    };
  } catch(e) {
    return { apiKey: '', apiSecret: '' };
  }
}

// ═══════════════════════════════════════════
// PRIVATE (GERÇEK ALIM-SATIM)
// ═══════════════════════════════════════════

function sign(params, secret) {
  var query = Object.keys(params)
    .sort()
    .map(function(k) { return k + '=' + params[k]; })
    .join('&');
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

async function binanceRequest(method, endpoint, params) {
  var keys = getBinanceKeys();
  
  if (!keys.apiKey || !keys.apiSecret) {
    throw new Error('Binance API anahtarlari ayarlarda tanimlanmamis');
  }

  params.timestamp = Date.now();
  params.signature = sign(params, keys.apiSecret);

  var headers = { 'X-MBX-APIKEY': keys.apiKey };

  try {
    var response;
    if (method === 'GET') {
      var query = Object.keys(params).map(function(k) { return k + '=' + params[k]; }).join('&');
      response = await axios.get(BASE_URL + endpoint + '?' + query, { headers: headers });
    } else {
      response = await axios.post(BASE_URL + endpoint, null, { headers: headers, params: params });
    }
    return response.data;
  } catch(e) {
    if (e.response && e.response.data) {
      throw new Error(JSON.stringify(e.response.data));
    }
    throw e;
  }
}

async function getBalance(asset) {
  var keys = getBinanceKeys();
  if (!keys.apiKey) return 0;

  try {
    var data = await binanceRequest('GET', '/api/v3/account', {});
    var balance = data.balances.find(function(b) { return b.asset === asset; });
    return balance ? parseFloat(balance.free) : 0;
  } catch(e) {
    console.error('[BINANCE] Bakiye hatasi:', e.message);
    return 0;
  }
}

async function realBuy(symbol, usdtAmount, currentPrice) {
  var keys = getBinanceKeys();
  if (!keys.apiKey) {
    console.log('[BINANCE] ❌ API anahtari yok, alim yapilmadi');
    return null;
  }

  try {
    var symbolFixed = symbol.replace('USDT', '') + 'USDT';
    var quantity = usdtAmount / currentPrice;

    var info = await axios.get(BASE_URL + '/api/v3/exchangeInfo?symbol=' + symbolFixed);
    var lotFilter = info.data.symbols[0].filters.find(function(f) { return f.filterType === 'LOT_SIZE'; });
    var stepSize = parseFloat(lotFilter.stepSize);
    var precision = Math.floor(Math.log10(1 / stepSize));
    var qty = Math.floor(quantity / stepSize) * stepSize;
    qty = parseFloat(qty.toFixed(Math.max(0, precision)));

    if (qty <= 0) {
      console.log('[BINANCE] ❌ Miktar cok kucuk:', qty);
      return null;
    }

    var params = { symbol: symbolFixed, side: 'BUY', type: 'MARKET', quantity: qty };
    var result = await binanceRequest('POST', '/api/v3/order', params);
    console.log('[BINANCE] ✅ GERCEK ALIM:', symbolFixed, '| Miktar:', qty, '| Yaklasik:', usdtAmount + ' USDT');
    return result;
  } catch(e) {
    console.error('[BINANCE] ❌ ALIM hatasi:', e.message);
    return null;
  }
}

async function realSell(symbol, quantity) {
  var keys = getBinanceKeys();
  if (!keys.apiKey) {
    console.log('[BINANCE] ❌ API anahtari yok, satis yapilmadi');
    return null;
  }

  try {
    var symbolFixed = symbol.replace('USDT', '') + 'USDT';

    var info = await axios.get(BASE_URL + '/api/v3/exchangeInfo?symbol=' + symbolFixed);
    var lotFilter = info.data.symbols[0].filters.find(function(f) { return f.filterType === 'LOT_SIZE'; });
    var stepSize = parseFloat(lotFilter.stepSize);
    var precision = Math.floor(Math.log10(1 / stepSize));
    var qty = Math.floor(quantity / stepSize) * stepSize;
    qty = parseFloat(qty.toFixed(Math.max(0, precision)));

    if (qty <= 0) {
      console.log('[BINANCE] ❌ Miktar cok kucuk:', qty);
      return null;
    }

    var params = { symbol: symbolFixed, side: 'SELL', type: 'MARKET', quantity: qty };
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
