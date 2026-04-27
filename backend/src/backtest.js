const BinanceService = require('./binance');
const TechnicalAnalysis = require('./analysis');

class BacktestEngine {

  async runOnce(params, coinData, btcMain, btcH1, btcH4) {
    const {
      stopLoss=2.0, trailingStop=0.5, minProfit=1.5,
      commission=0.1, slippage=0.05, minScore=40,
      tradeAmount=100, maxPositions=3, enableShort=true,
      rsiPeriod=14, rsiOversold=40, rsiOverbought=70, srLookback=20
    } = params;

    const settings = {
      rsi_period:rsiPeriod, rsi_oversold:rsiOversold,
      rsi_overbought:rsiOverbought, sr_lookback:srLookback,
      min_score:minScore, commission_rate:commission, slippage_rate:slippage,
      min_profit_percent:minProfit, stop_loss_percent:stopLoss,
      trailing_stop_percent:trailingStop, min_volume:0
    };

    const availableCoins = Object.keys(coinData);
    const refData = btcMain.length>=50 ? btcMain : coinData[availableCoins[0]].main;
    const totalCost = (commission+slippage)/100*2;

    const coinIndex={};
    for (const sym of availableCoins) {
      coinIndex[sym]={};
      for (const c of coinData[sym].main) coinIndex[sym][parseInt(c[0])]=c;
    }

    const trades=[], openPositions={}, highestPrices={}, lowestPrices={};
    let cachedBtc4H={trend:'BELIRSIZ',guclu:false};
    let cachedBtc1H={trend:'BELIRSIZ',guclu:false};
    let lastBtcUpdate=0;

    for (let i=52; i<refData.length; i++) {
      const candleTime=parseInt(refData[i][0]);

      // Açık pozisyonları kontrol et
      for (const sym of Object.keys(openPositions)) {
        const pos=openPositions[sym];
        const symCandle=coinIndex[sym]?.[candleTime];
        if (!symCandle) continue;
        const posPrice=parseFloat(symCandle[4]);

        if (pos.side==='LONG') {
          if (posPrice>(highestPrices[sym]||pos.entryPrice)) highestPrices[sym]=posPrice;
          const trailStop=(highestPrices[sym]||pos.entryPrice)*(1-trailingStop/100);
          const bruto=((posPrice-pos.entryPrice)/pos.entryPrice)*100;
          const net=bruto-(totalCost*100);
          pos.currentPnlPct=net;
          let reason=null;
          if (net<=-stopLoss) reason='STOP_LOSS';
          else if (bruto>=minProfit&&posPrice<=trailStop) reason='TRAILING_STOP';
          if (reason) {
            const pnl=(posPrice-pos.entryPrice)*pos.quantity-(pos.entryPrice*pos.quantity*totalCost);
            trades.push({ symbol:sym, side:'LONG', entryTime:pos.entryTime, exitTime:new Date(candleTime),
              entryPrice:pos.entryPrice, exitPrice:posPrice, quantity:pos.quantity, reason,
              netPnl:parseFloat(pnl.toFixed(4)), netPnlPct:parseFloat(net.toFixed(2)),
              score:pos.score, trend1H:pos.trend1H, trend4H:pos.trend4H, btcTrend:pos.btcTrend });
            delete openPositions[sym]; delete highestPrices[sym];
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
          if (reason) {
            const pnl=(pos.entryPrice-posPrice)*pos.quantity-(pos.entryPrice*pos.quantity*totalCost);
            trades.push({ symbol:sym, side:'SHORT', entryTime:pos.entryTime, exitTime:new Date(candleTime),
              entryPrice:pos.entryPrice, exitPrice:posPrice, quantity:pos.quantity, reason,
              netPnl:parseFloat(pnl.toFixed(4)), netPnlPct:parseFloat(net.toFixed(2)),
              score:pos.score, trend1H:pos.trend1H, trend4H:pos.trend4H, btcTrend:pos.btcTrend });
            delete openPositions[sym]; delete lowestPrices[sym];
          }
        }
      }

      // Koruma filtreleri
      if (Object.keys(openPositions).length>=maxPositions) continue;
      const zararliVar=Object.values(openPositions).some(p=>(p.currentPnlPct||0)<-0.5);
      if (zararliVar) continue;

      // BTC trend cache
      if (candleTime-lastBtcUpdate>=4*60*60*1000) {
        const h1f=btcH1.filter(c=>parseInt(c[0])<=candleTime);
        const h4f=btcH4.filter(c=>parseInt(c[0])<=candleTime);
        if (h1f.length>=50) cachedBtc1H=TechnicalAnalysis.analyze1H(h1f);
        if (h4f.length>=50) cachedBtc4H=TechnicalAnalysis.analyze4H(h4f);
        lastBtcUpdate=candleTime;
      }

      // BTC ani düşüş
      let btcAniDusus=false;
      if (btcMain.length>=4) {
        const btcSlice=btcMain.filter(c=>parseInt(c[0])<=candleTime);
        if (btcSlice.length>=4) {
          const now=parseFloat(btcSlice[btcSlice.length-1][4]);
          const ago=parseFloat(btcSlice[btcSlice.length-4][4]);
          if (((now-ago)/ago)*100<-1.0) btcAniDusus=true;
        }
      }

      const btcDusus    = cachedBtc4H.trend==='ASAGI'&&cachedBtc1H.trend==='ASAGI';
      const btcYukselis = cachedBtc4H.trend==='YUKARI';

      // Her coin için sinyal ara
      for (const sym of availableCoins) {
        if (openPositions[sym]) continue;

        const symData=coinData[sym];
        const symMain=symData.main.filter(c=>parseInt(c[0])<=candleTime);
        if (symMain.length<52) continue;

        const price=parseFloat(symMain[symMain.length-1][4]);
        const ticker={symbol:sym, priceChangePercent:'0', quoteVolume:'999999999'};
        const analysis=TechnicalAnalysis.analyze(symMain,ticker,settings);
        if (!analysis) continue;

        // 4H trend hesapla
        const symH4=symData.h4.filter(c=>parseInt(c[0])<=candleTime);
        const symH1=symData.h1.filter(c=>parseInt(c[0])<=candleTime);
        const trend4H=TechnicalAnalysis.analyze4H(symH4);
        const trend1H=TechnicalAnalysis.analyze1H(symH1);

        // ── LONG SİNYALİ ─────────────────────────────────
        if (analysis.signal==='ALIM') {
          // BTC korumaları
          if (btcDusus||btcAniDusus) continue;

          // 4H konfirmasyon — LONG için yükseliş veya hafif yükseliş şart
          if (['ASAGI','HAFIF_ASAGI','BELIRSIZ'].includes(trend4H.trend)) continue;
          if (trend4H.trend==='YATAY' && analysis.longSkor<55) continue;

          // 1H konfirmasyon
          if (['ASAGI','BELIRSIZ'].includes(trend1H.trend)) continue;

          if (analysis.longSkor<minScore) continue;

          // Pozisyon boyutu — skora ve trende göre
          let mult=1.0;
          if      (analysis.longSkor>=80) mult=2.0;
          else if (analysis.longSkor>=65) mult=1.5;
          else if (analysis.longSkor>=55) mult=1.25;
          else                            mult=1.0;

          if (trend4H.trend==='YUKARI'&&trend4H.guclu) mult=Math.min(2.0,mult*1.3);
          else if (trend4H.trend==='YUKARI')            mult=Math.min(2.0,mult*1.1);
          if (btcYukselis) mult=Math.min(2.0,mult*1.1);
          mult=Math.min(2.0,Math.max(0.5,mult));

          openPositions[sym]={
            side:'LONG', entryTime:new Date(candleTime), entryPrice:price,
            quantity:(tradeAmount*mult)/price, score:analysis.longSkor,
            trend1H:trend1H.trend, trend4H:trend4H.trend, btcTrend:cachedBtc4H.trend,
            amount:tradeAmount*mult, currentPnlPct:0
          };
          highestPrices[sym]=price;
        }

        // ── SHORT SİNYALİ ────────────────────────────────
        else if (enableShort && analysis.signal==='SATIS') {
          // 4H konfirmasyon — SHORT için düşüş veya hafif düşüş şart
          if (['YUKARI','BELIRSIZ'].includes(trend4H.trend)) continue;
          if (trend4H.trend==='HAFIF_YUKARI') continue;
          if (trend4H.trend==='YATAY' && analysis.shortSkor<55) continue;

          // 1H konfirmasyon
          if (['YUKARI'].includes(trend1H.trend)) continue;

          // BTC yükselişte güçlü short yapma
          if (btcYukselis && trend4H.trend==='YATAY') continue;

          if (Math.abs(analysis.shortSkor)<minScore) continue;

          let mult=1.0;
          if      (Math.abs(analysis.shortSkor)>=80) mult=2.0;
          else if (Math.abs(analysis.shortSkor)>=65) mult=1.5;
          else if (Math.abs(analysis.shortSkor)>=55) mult=1.25;
          else                                        mult=1.0;

          if (['ASAGI'].includes(trend4H.trend)&&trend4H.guclu) mult=Math.min(2.0,mult*1.3);
          else if (['ASAGI','HAFIF_ASAGI'].includes(trend4H.trend)) mult=Math.min(2.0,mult*1.1);
          if (btcDusus) mult=Math.min(2.0,mult*1.2);
          mult=Math.min(2.0,Math.max(0.5,mult));

          openPositions[sym]={
            side:'SHORT', entryTime:new Date(candleTime), entryPrice:price,
            quantity:(tradeAmount*mult)/price, score:analysis.score,
            trend1H:trend1H.trend, trend4H:trend4H.trend, btcTrend:cachedBtc4H.trend,
            amount:tradeAmount*mult, currentPnlPct:0
          };
          lowestPrices[sym]=price;
        }

        if (Object.keys(openPositions).length>=maxPositions) break;
      }
    }

    // Açık pozisyonları kapat
    for (const sym of Object.keys(openPositions)) {
      const pos=openPositions[sym];
      const symMain=coinData[sym]?.main||[];
      const lastPrice=symMain.length>0?parseFloat(symMain[symMain.length-1][4]):pos.entryPrice;
      let pnl=0, pnlPct=0;
      if (pos.side==='LONG') {
        pnl=(lastPrice-pos.entryPrice)*pos.quantity-(pos.entryPrice*pos.quantity*totalCost);
        pnlPct=((lastPrice-pos.entryPrice)/pos.entryPrice*100)-(totalCost*100);
      } else {
        pnl=(pos.entryPrice-lastPrice)*pos.quantity-(pos.entryPrice*pos.quantity*totalCost);
        pnlPct=((pos.entryPrice-lastPrice)/pos.entryPrice*100)-(totalCost*100);
      }
      trades.push({
        symbol:sym, side:pos.side, entryTime:pos.entryTime,
        exitTime:new Date(parseInt(refData[refData.length-1][0])),
        entryPrice:pos.entryPrice, exitPrice:lastPrice, quantity:pos.quantity, reason:'OPEN',
        netPnl:parseFloat(pnl.toFixed(4)), netPnlPct:parseFloat(pnlPct.toFixed(2)),
        score:pos.score, trend1H:pos.trend1H, trend4H:pos.trend4H, btcTrend:pos.btcTrend
      });
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
      trades:trades.sort((a,b)=>new Date(b.entryTime)-new Date(a.entryTime)).slice(0,50)
    };
  }

  async run(params={}) {
    const {
      symbol='BTCUSDT', interval='1h', days=30,
      stopLoss=2.0, trailingStop=0.5, minProfit=1.5,
      commission=0.1, slippage=0.05, minScore=40,
      tradeAmount=100, maxPositions=3, enableShort=true,
      rsiPeriod=14, rsiOversold=40, rsiOverbought=70, srLookback=20,
      optimize=false, symbols=null
    } = params;

    const intervalMinutes=this.getIntervalMinutes(interval);
    const totalCandles=Math.ceil((days*24*60)/intervalMinutes)+100;
    const limit=Math.min(totalCandles,1000);
    const coinList=(symbols&&symbols.length>0)?symbols:[symbol];

    console.log(`Backtest: ${coinList.length} coin | ${interval} | ${days}g | 4H konfirmasyon aktif`);

    const getKlines=async(sym,tf,lim)=>{
      try { const b=new BinanceService('',''); return await b.getKlines(sym,tf,lim)||[]; }
      catch(e) { console.error(`${sym} ${tf}:`,e.message); return []; }
    };

    const coinData={};
    for (const sym of coinList) {
      await new Promise(r=>setTimeout(r,150));
      const main=await getKlines(sym,interval,limit);
      await new Promise(r=>setTimeout(r,100));
      const h1=await getKlines(sym,'1h',500);
      await new Promise(r=>setTimeout(r,100));
      const h4=await getKlines(sym,'4h',300);
      if (main.length>=52) { coinData[sym]={main,h1,h4}; console.log(`✅${sym}:${main.length}`); }
      else console.log(`⚠️${sym}:${main.length}`);
    }

    const available=Object.keys(coinData);
    if (available.length===0) throw new Error('Hiçbir coin için veri çekilemedi');

    let btcMain=[],btcH1=[],btcH4=[];
    if (coinData['BTCUSDT']) {
      btcMain=coinData['BTCUSDT'].main;
      btcH1=coinData['BTCUSDT'].h1;
      btcH4=coinData['BTCUSDT'].h4;
    } else {
      await new Promise(r=>setTimeout(r,150));
      btcMain=await getKlines('BTCUSDT',interval,limit);
      await new Promise(r=>setTimeout(r,100));
      btcH1=await getKlines('BTCUSDT','1h',500);
      await new Promise(r=>setTimeout(r,100));
      btcH4=await getKlines('BTCUSDT','4h',300);
    }

    const runP={stopLoss,trailingStop,minProfit,commission,slippage,minScore,tradeAmount,maxPositions,enableShort,rsiPeriod,rsiOversold,rsiOverbought,srLookback};
    const result=await this.runOnce(runP,coinData,btcMain,btcH1,btcH4);

    return {
      params:{ symbol:coinList.join(','), interval, days, stopLoss, trailingStop, minScore, tradeAmount, maxPositions, enableShort },
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

  getIntervalMinutes(i) {
    return {'1m':1,'3m':3,'5m':5,'15m':15,'30m':30,'1h':60,'4h':240,'1d':1440}[i]||60;
  }
}

module.exports = new BacktestEngine();
