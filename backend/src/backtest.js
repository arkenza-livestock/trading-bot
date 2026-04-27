const BinanceService = require('./binance');
const TechnicalAnalysis = require('./analysis');

class BacktestEngine {

  // ── 4H KAPANIŞINDA SİMÜLASYON ────────────────────────────
  async runOnce(params, coinData, btcMain, btcH1, btcH4, btc1D) {
    const {
      stopLoss=2.0, trailingStop=0.5, minProfit=1.5,
      commission=0.1, slippage=0.05, minScore=40,
      tradeAmount=100, maxPositions=3, enableShort=true,
      timeStopCandles=15
    } = params;

    const settings = {
      commission_rate:commission, slippage_rate:slippage,
      min_profit_percent:minProfit, stop_loss_percent:stopLoss,
      trailing_stop_percent:trailingStop, min_volume:0, min_score:minScore
    };

    const availableCoins = Object.keys(coinData);
    // 4H mumları referans al — 4H kapanışında çalış
    const refData = btcH4.length>=50 ? btcH4 : coinData[availableCoins[0]].h4;
    const totalCost = (commission+slippage)/100*2;

    const trades=[], openPositions={}, highestPrices={}, lowestPrices={};
    const positionOpenTime={};

    // 4H adaylar — önceki 4H'te LONG/SHORT aday seçilmiş coinler
    const adaylar = {};

    for (let i=52; i<refData.length; i++) {
      const candleTime = parseInt(refData[i][0]);

      // ── Açık pozisyonları kontrol et (1H hassasiyetiyle) ─
      for (const sym of Object.keys(openPositions)) {
        const pos = openPositions[sym];

        // 1H mumlardan fiyat al
        const symH1 = coinData[sym]?.h1||[];
        const h1Slice = symH1.filter(c=>parseInt(c[0])<=candleTime);
        if (!h1Slice.length) continue;
        const posPrice = parseFloat(h1Slice[h1Slice.length-1][4]);

        if (pos.side==='LONG') {
          if (posPrice>(highestPrices[sym]||pos.entryPrice)) highestPrices[sym]=posPrice;
          const trailStop=(highestPrices[sym]||pos.entryPrice)*(1-trailingStop/100);
          const bruto=((posPrice-pos.entryPrice)/pos.entryPrice)*100;
          const net=bruto-(totalCost*100);
          pos.currentPnlPct=net;
          let reason=null;
          if (net<=-stopLoss) reason='STOP_LOSS';
          else if (bruto>=minProfit&&posPrice<=trailStop) reason='TRAILING_STOP';
          // Zaman aşımı — timeStopCandles 4H sonra
          else if (timeStopCandles>0 && i-(positionOpenTime[sym]||i) >= timeStopCandles) {
            reason = net > 0 ? 'TIME_STOP_KAR' : 'TIME_STOP_ZARAR';
          }
          if (reason) {
            const pnl=(posPrice-pos.entryPrice)*pos.quantity-(pos.entryPrice*pos.quantity*totalCost);
            trades.push({ symbol:sym, side:'LONG', entryTime:pos.entryTime, exitTime:new Date(candleTime),
              entryPrice:pos.entryPrice, exitPrice:posPrice, quantity:pos.quantity, reason,
              netPnl:parseFloat(pnl.toFixed(4)), netPnlPct:parseFloat(net.toFixed(2)),
              score:pos.score, trend1H:pos.trend1H, trend4H:pos.trend4H, btcTrend:pos.btcTrend });
            delete openPositions[sym]; delete highestPrices[sym]; delete positionOpenTime[sym];
          }
        } else if (pos.side==='SHORT') {
          if (posPrice<(lowestPrices[sym]||pos.entryPrice)) lowestPrices[sym]=posPrice;
          const trailStop=(lowestPrices[sym]||pos.entryPrice)*(1+trailingStop/100);
          const bruto=((pos.entryPrice-posPrice)/pos.entryPrice)*100;
          const net=bruto-(totalCost*100);
          pos.currentPnlPct=net;
          let reason=null;
          if (net<=-stopLoss) reason='STOP_LOSS';
          else if (bruto>=minProfit&&posPrice>=trailStop) reason='TRAILING_STOP';
          else if (timeStopCandles>0 && i-(positionOpenTime[sym]||i) >= timeStopCandles) {
            reason = net > 0 ? 'TIME_STOP_KAR' : 'TIME_STOP_ZARAR';
          }
          if (reason) {
            const pnl=(pos.entryPrice-posPrice)*pos.quantity-(pos.entryPrice*pos.quantity*totalCost);
            trades.push({ symbol:sym, side:'SHORT', entryTime:pos.entryTime, exitTime:new Date(candleTime),
              entryPrice:pos.entryPrice, exitPrice:posPrice, quantity:pos.quantity, reason,
              netPnl:parseFloat(pnl.toFixed(4)), netPnlPct:parseFloat(net.toFixed(2)),
              score:pos.score, trend1H:pos.trend1H, trend4H:pos.trend4H, btcTrend:pos.btcTrend });
            delete openPositions[sym]; delete lowestPrices[sym]; delete positionOpenTime[sym];
          }
        }
      }

      // Koruma filtreleri
      if (Object.keys(openPositions).length>=maxPositions) continue;

      // BTC ani düşüş
      let btcAniDusus=false;
      const btcSlice=btcH4.filter(c=>parseInt(c[0])<=candleTime);
      if (btcSlice.length>=4) {
        const now=parseFloat(btcSlice[btcSlice.length-1][4]);
        const ago=parseFloat(btcSlice[btcSlice.length-4][4]);
        if (((now-ago)/ago)*100<-1.5) btcAniDusus=true;
      }

      // BTC trend
      const btcH4Slice = btcH4.filter(c=>parseInt(c[0])<=candleTime);
      const btcH1Slice = btcH1.filter(c=>parseInt(c[0])<=candleTime);
      const btc1DSlice = btc1D.filter(c=>parseInt(c[0])<=candleTime);
      const btcTrend4H = TechnicalAnalysis.analyze4H(btcH4Slice);
      const btcTrend1D = TechnicalAnalysis.analyze1D(btc1DSlice);
      const btcDusus   = btcTrend4H.trend==='ASAGI'&&btcTrend1D.trend==='ASAGI';
      const btcYukselis= btcTrend4H.trend==='YUKARI'&&btcTrend1D.guclu;

      // ── HER COİN İÇİN 4H SETUP KONTROL ──────────────────
      for (const sym of availableCoins) {
        if (openPositions[sym]) continue;

        const symData = coinData[sym];
        const symH4   = symData.h4.filter(c=>parseInt(c[0])<=candleTime);
        const symH1   = symData.h1.filter(c=>parseInt(c[0])<=candleTime);
        const sym1D   = symData.d1?.filter(c=>parseInt(c[0])<=candleTime)||[];

        if (symH4.length<52) continue;

        const ticker = { symbol:sym, priceChangePercent:'0', quoteVolume:'999999999' };

        // 4H setup analizi
        const setup4H = TechnicalAnalysis.analyze4HSetup(symH4, sym1D, ticker, settings);
        if (!setup4H) continue;

        // Adayları kaydet — bir sonraki 1H'te giriş aranacak
        if (setup4H.setup==='LONG_ADAY' || setup4H.setup==='SHORT_ADAY') {
          adaylar[sym] = { setup4H, time4H:candleTime };
        }

        // 1H giriş zamanlaması — aday varsa kontrol et
        const aday = adaylar[sym];
        if (!aday) continue;
        if (candleTime - aday.time4H > 8*60*60*1000) {
          // 8 saatten eski adayı sil
          delete adaylar[sym];
          continue;
        }

        // 1H'te giriş sinyali ara
        if (symH1.length<52) continue;
        const timing = TechnicalAnalysis.analyze1HTiming(symH1, aday.setup4H, settings);
        if (!timing||timing.signal==='BEKLE') continue;

        // ── LONG GİRİŞ ───────────────────────────────────
        if (timing.signal==='ALIM') {
          if (btcDusus||btcAniDusus) continue;
          if (['ASAGI','HAFIF_ASAGI'].includes(setup4H.trend4H)) continue;
          if (btcTrend1D.trend==='ASAGI') continue;

          const price=parseFloat(symH1[symH1.length-1][4]);
          let mult=1.0;
          if      (timing.score>=90) mult=2.0;
          else if (timing.score>=80) mult=1.5;
          else if (timing.score>=70) mult=1.25;
          if (btcYukselis) mult=Math.min(2.0,mult*1.1);
          mult=Math.min(2.0,Math.max(0.5,mult));

          openPositions[sym]={
            side:'LONG', entryTime:new Date(candleTime), entryPrice:price,
            quantity:(tradeAmount*mult)/price, score:timing.score,
            trend1H:timing.trend1H, trend4H:setup4H.trend4H, btcTrend:btcTrend4H.trend,
            amount:tradeAmount*mult, currentPnlPct:0
          };
          highestPrices[sym]=price;
          positionOpenTime[sym]=i;
          delete adaylar[sym];
        }

        // ── SHORT GİRİŞ ──────────────────────────────────
        else if (enableShort && timing.signal==='SATIS') {
          if (btcYukselis) continue;
          if (['YUKARI','HAFIF_YUKARI'].includes(setup4H.trend4H)) continue;

          const price=parseFloat(symH1[symH1.length-1][4]);
          let mult=1.0;
          if      (Math.abs(timing.score)>=90) mult=2.0;
          else if (Math.abs(timing.score)>=80) mult=1.5;
          else if (Math.abs(timing.score)>=70) mult=1.25;
          if (btcDusus) mult=Math.min(2.0,mult*1.2);
          mult=Math.min(2.0,Math.max(0.5,mult));

          openPositions[sym]={
            side:'SHORT', entryTime:new Date(candleTime), entryPrice:price,
            quantity:(tradeAmount*mult)/price, score:timing.score,
            trend1H:timing.trend1H, trend4H:setup4H.trend4H, btcTrend:btcTrend4H.trend,
            amount:tradeAmount*mult, currentPnlPct:0
          };
          lowestPrices[sym]=price;
          positionOpenTime[sym]=i;
          delete adaylar[sym];
        }

        if (Object.keys(openPositions).length>=maxPositions) break;
      }
    }

    // Açık pozisyonları kapat
    for (const sym of Object.keys(openPositions)) {
      const pos=openPositions[sym];
      const symH1=coinData[sym]?.h1||[];
      const lastPrice=symH1.length>0?parseFloat(symH1[symH1.length-1][4]):pos.entryPrice;
      let pnl=0, pnlPct=0;
      if (pos.side==='LONG') {
        pnl=(lastPrice-pos.entryPrice)*pos.quantity-(pos.entryPrice*pos.quantity*totalCost);
        pnlPct=((lastPrice-pos.entryPrice)/pos.entryPrice*100)-(totalCost*100);
      } else {
        pnl=(pos.entryPrice-lastPrice)*pos.quantity-(pos.entryPrice*pos.quantity*totalCost);
        pnlPct=((pos.entryPrice-lastPrice)/pos.entryPrice*100)-(totalCost*100);
      }
      trades.push({ symbol:sym, side:pos.side, entryTime:pos.entryTime,
        exitTime:new Date(parseInt(refData[refData.length-1][0])),
        entryPrice:pos.entryPrice, exitPrice:lastPrice, quantity:pos.quantity, reason:'OPEN',
        netPnl:parseFloat(pnl.toFixed(4)), netPnlPct:parseFloat(pnlPct.toFixed(2)),
        score:pos.score, trend1H:pos.trend1H, trend4H:pos.trend4H, btcTrend:pos.btcTrend });
    }

    return this.calcStats(trades);
  }

  calcStats(trades) {
    const closed=trades.filter(t=>t.reason!=='OPEN');
    const wins=closed.filter(t=>t.netPnl>0);
    const losses=closed.filter(t=>t.netPnl<=0);
    const totalPnl=trades.reduce((s,t)=>s+t.netPnl,0);
    const winRate=closed.length>0?wins.length/closed.length*100:0;
    const best=trades.reduce((b,t)=>t.netPnlPct>(b?.netPnlPct||-999)?t:b,null);
    const worst=trades.reduce((w,t)=>t.netPnlPct<(w?.netPnlPct||999)?t:w,null);
    const avgWin=wins.length>0?wins.reduce((s,t)=>s+t.netPnlPct,0)/wins.length:0;
    const avgLoss=losses.length>0?losses.reduce((s,t)=>s+t.netPnlPct,0)/losses.length:0;
    const gW=Math.abs(wins.reduce((s,t)=>s+t.netPnl,0));
    const gL=Math.abs(losses.reduce((s,t)=>s+t.netPnl,0));
    const longs=trades.filter(t=>t.side==='LONG');
    const shorts=trades.filter(t=>t.side==='SHORT');
    const shortWins=shorts.filter(t=>t.netPnl>0);
    const coinMap={};
    for (const t of trades) {
      if (!coinMap[t.symbol]) coinMap[t.symbol]={symbol:t.symbol,totalTrades:0,wins:0,losses:0,totalPnl:0};
      coinMap[t.symbol].totalTrades++;
      if (t.reason!=='OPEN') { if(t.netPnl>0) coinMap[t.symbol].wins++; else coinMap[t.symbol].losses++; }
      coinMap[t.symbol].totalPnl+=t.netPnl;
    }
    return {
      totalTrades:trades.length, wins:wins.length, losses:losses.length,
      winRate:parseFloat(winRate.toFixed(1)), totalPnl:parseFloat(totalPnl.toFixed(4)),
      avgWin:parseFloat(avgWin.toFixed(2)), avgLoss:parseFloat(avgLoss.toFixed(2)),
      bestTrade:best?parseFloat(best.netPnlPct.toFixed(2)):0,
      worstTrade:worst?parseFloat(worst.netPnlPct.toFixed(2)):0,
      profitFactor:gL>0?parseFloat((gW/gL).toFixed(2)):999,
      longCount:longs.length, shortCount:shorts.length,
      shortWinRate:shorts.length>0?parseFloat((shortWins.length/shorts.length*100).toFixed(1)):0,
      coinSummaries:Object.values(coinMap).map(c=>({
        ...c, totalPnl:parseFloat(c.totalPnl.toFixed(4)),
        winRate:c.wins+c.losses>0?parseFloat((c.wins/(c.wins+c.losses)*100).toFixed(1)):0
      })).sort((a,b)=>b.totalPnl-a.totalPnl),
      trades:trades.sort((a,b)=>new Date(b.entryTime)-new Date(a.entryTime)).slice(0,100)
    };
  }

  async run(params={}) {
    const {
      symbol='BTCUSDT', days=60,
      stopLoss=2.0, trailingStop=0.5, minProfit=1.5,
      commission=0.1, slippage=0.05, minScore=40,
      tradeAmount=100, maxPositions=3, enableShort=true,
      timeStopCandles=15, symbols=null
    } = params;

    const coinList=(symbols&&symbols.length>0)?symbols:[symbol];
    console.log(`Backtest v19: ${coinList.length} coin | ${days}g | 4H setup + 1H timing`);

    const getKlines=async(sym,tf,lim)=>{
      try { const b=new BinanceService('',''); return await b.getKlines(sym,tf,lim)||[]; }
      catch(e) { console.error(`${sym} ${tf}:`,e.message); return []; }
    };

    const h4Limit = Math.min(Math.ceil(days*24/4)+50, 1000);
    const h1Limit = Math.min(days*24+100, 1000);
    const d1Limit = Math.min(days+50, 365);

    const coinData={};
    for (const sym of coinList) {
      await new Promise(r=>setTimeout(r,200));
      const h4 = await getKlines(sym,'4h',h4Limit);
      await new Promise(r=>setTimeout(r,100));
      const h1 = await getKlines(sym,'1h',h1Limit);
      await new Promise(r=>setTimeout(r,100));
      const d1 = await getKlines(sym,'1d',d1Limit);
      if (h4.length>=52) {
        coinData[sym]={h4,h1,d1};
        console.log(`✅${sym}: 4H:${h4.length} 1H:${h1.length} 1D:${d1.length}`);
      } else {
        console.log(`⚠️${sym}: yetersiz(${h4.length})`);
      }
    }

    const available=Object.keys(coinData);
    if (available.length===0) throw new Error('Veri çekilemedi');

    // BTC verileri
    let btcH4=[],btcH1=[],btc1D=[];
    if (coinData['BTCUSDT']) {
      btcH4=coinData['BTCUSDT'].h4;
      btcH1=coinData['BTCUSDT'].h1;
      btc1D=coinData['BTCUSDT'].d1;
    } else {
      await new Promise(r=>setTimeout(r,200));
      btcH4=await getKlines('BTCUSDT','4h',h4Limit);
      btcH1=await getKlines('BTCUSDT','1h',h1Limit);
      btc1D=await getKlines('BTCUSDT','1d',d1Limit);
    }

    const runP={stopLoss,trailingStop,minProfit,commission,slippage,minScore,tradeAmount,maxPositions,enableShort,timeStopCandles};
    const result=await this.runOnce(runP,coinData,btcH4,btcH1,btcH4,btc1D);

    return {
      params:{ symbol:coinList.join(','), days, stopLoss, trailingStop, minScore, tradeAmount, maxPositions, enableShort, timeStopCandles },
      isMulti:coinList.length>1, optimization:null,
      summary:{
        totalCoins:available.length,
        totalTrades:result.totalTrades, wins:result.wins, losses:result.losses,
        winRate:result.winRate, totalPnl:result.totalPnl,
        avgWin:result.avgWin, avgLoss:result.avgLoss,
        bestTrade:result.bestTrade, worstTrade:result.worstTrade,
        profitFactor:result.profitFactor,
        longCount:result.longCount, shortCount:result.shortCount,
        shortWinRate:result.shortWinRate
      },
      coinSummaries:result.coinSummaries,
      trades:result.trades
    };
  }
}

module.exports = new BacktestEngine();
