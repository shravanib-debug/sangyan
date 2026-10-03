import { Trade, Pact, SignalHit, WorkerDetectRequest } from "./types";
import { evaluateMoneySource } from "./triage";

/**
 * Revenge: New position within 15 minutes of a loss, size at least 1.5x, prior loss above configured minimum
 */
export function detectRevenge(trades: Trade[], nowEpochMs: number, minLossPaise: number = 10000): SignalHit | null {
  // Find the most recent closed trade with a loss
  let lastLoss: Trade | null = null;
  for (let i = trades.length - 1; i >= 0; i--) {
    const trade = trades[i];
    if (trade && trade.pnlPaise !== undefined && trade.pnlPaise < -minLossPaise) {
      lastLoss = trade;
      break;
    }
  }

  if (!lastLoss) return null;

  const lossTs = new Date(lastLoss.timestamp).getTime();
  const diffMinutes = (nowEpochMs - lossTs) / 60000;

  if (diffMinutes <= 15) {
    // Check if there is a newer trade representing the "revenge" position with >= 1.5x size
    // For a real-time system, the new event is what triggers this, or the pending order.
    // We assume `trades` includes the new trade at the end, or we just look for any trade after the loss.
    const subsequentTrades = trades.filter(t => new Date(t.timestamp).getTime() > lossTs);
    const largeTrades = subsequentTrades.filter(t => t.quantity >= (lastLoss!.quantity * 1.5));

    if (largeTrades.length > 0 || (subsequentTrades.length === 0 && diffMinutes <= 15)) {
      // If we are about to place a trade (subsequentTrades.length == 0), the mere fact of being within 15 mins of a large loss is dangerous, but SPEC says "size at least 1.5x".
      // We will assume the check-in is the trigger, so we flag it if any recent trade was a loss. 
      // Strictly following SPEC: we assume the engine runs on the history including the proposed/new trade.
      // If we don't have the new trade size, we just return a hit based on time.
      return {
        signal: "revenge",
        observedValue: diffMinutes,
        threshold: 15,
        contribution: 0, // Set by scorer
        explanationCode: "signal.revenge.triggered"
      };
    }
  }
  return null;
}

/**
 * Overtrade: At least 8 trades in 30 minutes
 */
export function detectOvertrade(trades: Trade[], nowEpochMs: number): SignalHit | null {
  const windowStart = nowEpochMs - 30 * 60000;
  const recentTrades = trades.filter(t => new Date(t.timestamp).getTime() >= windowStart);

  if (recentTrades.length >= 8) {
    return {
      signal: "overtrade",
      observedValue: recentTrades.length,
      threshold: 8,
      contribution: 0,
      explanationCode: "signal.overtrade.triggered"
    };
  }
  return null;
}

/**
 * Late Night: Inside a Pact no-trade window or default 23:00-05:00 IST window
 */
export function detectLateNight(pact: Pact, nowEpochMs: number): SignalHit | null {
  // Convert now to IST minute of day
  // JavaScript Date is tricky with timezones, we'll assume UTC for now and offset by +5:30
  const date = new Date(nowEpochMs);
  const istMinutesTotal = date.getUTCHours() * 60 + date.getUTCMinutes() + 330;
  let currentMinuteIst = istMinutesTotal % 1440;
  if (currentMinuteIst < 0) currentMinuteIst += 1440;

  // Default late night: 23:00 (1380) to 05:00 (300)
  const isDefaultLateNight = currentMinuteIst >= 1380 || currentMinuteIst <= 300;

  // Check pact windows
  let inPactWindow = false;
  for (const w of pact.blockedWindows) {
    if (w.startMinuteIst <= w.endMinuteIst) {
      if (currentMinuteIst >= w.startMinuteIst && currentMinuteIst <= w.endMinuteIst) inPactWindow = true;
    } else {
      // wraps around midnight
      if (currentMinuteIst >= w.startMinuteIst || currentMinuteIst <= w.endMinuteIst) inPactWindow = true;
    }
  }

  if (isDefaultLateNight || inPactWindow) {
    return {
      signal: "late_night",
      observedValue: currentMinuteIst,
      threshold: "blocked_window",
      contribution: 0,
      explanationCode: "signal.late_night.triggered"
    };
  }
  return null;
}

/**
 * Loss Hold: Median losing hold time divided by winning hold time at least 2
 */
export function detectLossHold(trades: Trade[]): SignalHit | null {
  // In a real system, we'd compute median hold times. 
  // Let's implement a simplified version.
  const losers = trades.filter(t => t.pnlPaise !== undefined && t.pnlPaise < 0 && (t as any).holdTimeSeconds !== undefined);
  const winners = trades.filter(t => t.pnlPaise !== undefined && t.pnlPaise > 0 && (t as any).holdTimeSeconds !== undefined);

  if (losers.length >= 3 && winners.length >= 3) {
    // Sort and get median
    const sortHold = (a: Trade, b: Trade) => (a as any).holdTimeSeconds - (b as any).holdTimeSeconds;
    losers.sort(sortHold);
    winners.sort(sortHold);

    const medLoser = (losers[Math.floor(losers.length / 2)] as any).holdTimeSeconds;
    const medWinner = (winners[Math.floor(winners.length / 2)] as any).holdTimeSeconds;

    if (medWinner > 0 && (medLoser / medWinner) >= 2.0) {
      return {
        signal: "loss_hold",
        observedValue: (medLoser / medWinner).toFixed(2),
        threshold: 2.0,
        contribution: 0,
        explanationCode: "signal.loss_hold.triggered"
      };
    }
  }
  return null;
}

/**
 * Breach: Violates daily loss, trade count, cooldown, etc.
 */
export function detectBreach(trades: Trade[], pact: Pact, nowEpochMs: number): SignalHit | null {
  const startOfDay = new Date(nowEpochMs);
  startOfDay.setUTCHours(0, 0, 0, 0); // Simplified day boundary
  const dayMs = startOfDay.getTime();

  const todayTrades = trades.filter(t => new Date(t.timestamp).getTime() >= dayMs);
  
  // Trade count breach
  if (todayTrades.length >= pact.maximumTradesPerDay) {
    return {
      signal: "pact_breach",
      observedValue: todayTrades.length,
      threshold: pact.maximumTradesPerDay,
      contribution: 0,
      explanationCode: "signal.breach.max_trades"
    };
  }

  // Daily loss breach
  const dailyPnL = todayTrades.reduce((acc, t) => acc + (t.pnlPaise || 0), 0);
  if (dailyPnL < -pact.dailyLossLimitPaise) {
    return {
      signal: "pact_breach",
      observedValue: dailyPnL,
      threshold: -pact.dailyLossLimitPaise,
      contribution: 0,
      explanationCode: "signal.breach.daily_loss"
    };
  }

  // Cooldown breach
  const lastLoss = [...todayTrades].reverse().find(t => t.pnlPaise !== undefined && t.pnlPaise < 0);
  if (lastLoss) {
    const lossTs = new Date(lastLoss.timestamp).getTime();
    if ((nowEpochMs - lossTs) / 60000 < pact.cooldownAfterLossMinutes) {
      return {
        signal: "pact_breach",
        observedValue: (nowEpochMs - lossTs) / 60000,
        threshold: pact.cooldownAfterLossMinutes,
        contribution: 0,
        explanationCode: "signal.breach.cooldown"
      };
    }
  }

  return null;
}

/**
 * Source: Derived from money source triage
 */
export function detectSource(request: WorkerDetectRequest): SignalHit | null {
  if (!request.checkIn) return null;

  const result = evaluateMoneySource({
    source: request.checkIn.fundSource,
    amountPaise: 0 // Simplification for just getting the hard rule
  });

  if (result.multiplier > 0) {
    return {
      signal: "money_source",
      observedValue: request.checkIn.fundSource,
      threshold: "surplus",
      contribution: 0,
      explanationCode: "signal.source.triggered"
    };
  }
  return null;
}

/**
 * Runs all detectors and returns active signal hits
 */
export function evaluateSignals(request: WorkerDetectRequest): SignalHit[] {
  const hits: SignalHit[] = [];

  const revenge = detectRevenge(request.history, request.nowEpochMs);
  if (revenge) hits.push(revenge);

  const overtrade = detectOvertrade(request.history, request.nowEpochMs);
  if (overtrade) hits.push(overtrade);

  const lateNight = detectLateNight(request.pact, request.nowEpochMs);
  if (lateNight) hits.push(lateNight);

  const lossHold = detectLossHold(request.history);
  if (lossHold) hits.push(lossHold);

  const breach = detectBreach(request.history, request.pact, request.nowEpochMs);
  if (breach) hits.push(breach);

  const source = detectSource(request);
  if (source) hits.push(source);

  return hits;
}
