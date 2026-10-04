import { Trade, Pact, SignalHit, WorkerDetectRequest } from "./types";
import { evaluateMoneySource } from "./triage";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const IST_OFFSET_MS = 330 * MINUTE_MS;

/** UTC epoch for midnight in Asia/Kolkata on the day containing `nowEpochMs`. */
export function startOfIstDay(nowEpochMs: number): number {
  return Math.floor((nowEpochMs + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

/**
 * Revenge: New position within 15 minutes of a loss, size at least 1.5x, prior loss above configured minimum
 */
export function detectRevenge(
  trades: Trade[],
  nowEpochMs: number,
  proposedAmountPaise?: number,
  minLossPaise: number = 10000
): SignalHit | null {
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

  if (diffMinutes >= 0 && diffMinutes <= 15) {
    // A broker/import evaluation includes the new trade in history. A manual check-in
    // instead supplies its proposed notional amount, which is compared with the losing
    // trade's notional value so the form's amount reaches the same detector rule.
    const subsequentTrades = trades.filter(t => new Date(t.timestamp).getTime() > lossTs);
    const largeTrades = subsequentTrades.filter(t => t.quantity >= (lastLoss!.quantity * 1.5));
    const lastLossNotionalPaise = lastLoss.quantity * lastLoss.pricePaise;
    const proposedPositionIsLarge =
      proposedAmountPaise !== undefined && proposedAmountPaise >= lastLossNotionalPaise * 1.5;

    if (largeTrades.length > 0 || proposedPositionIsLarge) {
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
  const losers = trades.filter(t => t.pnlPaise !== undefined && t.pnlPaise < 0 && (t as Trade & { holdTimeSeconds?: number }).holdTimeSeconds !== undefined);
  const winners = trades.filter(t => t.pnlPaise !== undefined && t.pnlPaise > 0 && (t as Trade & { holdTimeSeconds?: number }).holdTimeSeconds !== undefined);

  if (losers.length >= 3 && winners.length >= 3) {
    // Sort and get median
    const sortHold = (a: Trade, b: Trade) => ((a as Trade & { holdTimeSeconds?: number }).holdTimeSeconds || 0) - ((b as Trade & { holdTimeSeconds?: number }).holdTimeSeconds || 0);
    losers.sort(sortHold);
    winners.sort(sortHold);

    const medLoser = (losers[Math.floor(losers.length / 2)] as Trade & { holdTimeSeconds?: number }).holdTimeSeconds || 0;
    const medWinner = (winners[Math.floor(winners.length / 2)] as Trade & { holdTimeSeconds?: number }).holdTimeSeconds || 0;

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
  const dayMs = startOfIstDay(nowEpochMs);

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
    amountPaise: request.checkIn.amountPaise
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

  const revenge = detectRevenge(request.history, request.nowEpochMs, request.checkIn?.amountPaise);
  if (revenge) hits.push(revenge);

  const overtrade = detectOvertrade(request.history, request.nowEpochMs);
  if (overtrade) hits.push(overtrade);

  const lateNight = detectLateNight(request.pact, request.nowEpochMs);
  if (lateNight) hits.push(lateNight);

  const lossHold = detectLossHold(request.history);
  if (lossHold) hits.push(lossHold);

  const breach = request.pactCommitted ? detectBreach(request.history, request.pact, request.nowEpochMs) : null;
  if (breach) hits.push(breach);

  const source = detectSource(request);
  if (source) hits.push(source);

  return hits;
}
