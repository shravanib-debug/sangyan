import { Trade, Pact, SignalHit, WorkerDetectRequest } from "./types";
import { evaluateMoneySource } from "./triage";
import { SIZE_ESCALATION } from "../config/defaults";

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
  const currentMinuteIst = istMinuteOfDay(nowEpochMs);

  // Default late night: 23:00 (1380) to 05:00 (300)
  const isDefaultLateNight = currentMinuteIst >= 1380 || currentMinuteIst <= 300;
  const inPactWindow = pactWindowAt(pact, currentMinuteIst) !== null;

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

/** Minute of the day in Asia/Kolkata. */
export function istMinuteOfDay(nowEpochMs: number): number {
  const date = new Date(nowEpochMs);
  const minutes = (date.getUTCHours() * 60 + date.getUTCMinutes() + 330) % 1440;
  return minutes < 0 ? minutes + 1440 : minutes;
}

/** The Pact no-trade window containing this IST minute, if any (windows may wrap midnight). */
export function pactWindowAt(pact: Pact, minuteIst: number): Pact["blockedWindows"][number] | null {
  for (const w of pact.blockedWindows) {
    const inside =
      w.startMinuteIst <= w.endMinuteIst
        ? minuteIst >= w.startMinuteIst && minuteIst <= w.endMinuteIst
        : minuteIst >= w.startMinuteIst || minuteIst <= w.endMinuteIst;
    if (inside) return w;
  }
  return null;
}

/** Notional of the fill observed exactly now (a broker evaluation includes it in history). */
function currentFillNotional(trades: Trade[], nowEpochMs: number, side?: Trade["side"]): number | undefined {
  for (let i = trades.length - 1; i >= 0; i--) {
    const trade = trades[i]!;
    if (new Date(trade.timestamp).getTime() === nowEpochMs && (!side || trade.side === side)) {
      return trade.quantity * trade.pricePaise;
    }
  }
  return undefined;
}

/**
 * Size escalation: the new position is at least `multiple` x the median of the user's
 * recent positions. Explanatory: its weight is 0 in the default config.
 */
export function detectSizeEscalation(
  trades: Trade[],
  nowEpochMs: number,
  proposedAmountPaise: number | undefined,
  rule: { multiple: number; lookbackTrades: number; minimumTrades: number }
): SignalHit | null {
  const amount = proposedAmountPaise ?? currentFillNotional(trades, nowEpochMs, "buy");
  if (amount === undefined) return null;
  const previous = trades
    .filter((t) => t.side === "buy" && new Date(t.timestamp).getTime() < nowEpochMs)
    .slice(-rule.lookbackTrades)
    .map((t) => t.quantity * t.pricePaise)
    .sort((a, b) => a - b);
  if (previous.length < rule.minimumTrades) return null;
  const middle = Math.floor(previous.length / 2);
  const median = previous.length % 2 ? previous[middle]! : (previous[middle - 1]! + previous[middle]!) / 2;
  if (median <= 0 || amount < median * rule.multiple) return null;
  return {
    signal: "size_escalation",
    observedValue: Number((amount / median).toFixed(1)),
    threshold: rule.multiple,
    contribution: 0,
    explanationCode: "signal.size.triggered"
  };
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
export function detectBreach(
  trades: Trade[],
  pact: Pact,
  nowEpochMs: number,
  proposedAmountPaise?: number
): SignalHit | null {
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

  // Per-trade cap the user committed to
  if (pact.maxPositionPaise !== undefined) {
    const amount = proposedAmountPaise ?? currentFillNotional(trades, nowEpochMs);
    if (amount !== undefined && amount > pact.maxPositionPaise) {
      return {
        signal: "pact_breach",
        observedValue: amount,
        threshold: pact.maxPositionPaise,
        contribution: 0,
        explanationCode: "signal.breach.position_size"
      };
    }
  }

  // Trading inside a no-trade window the user committed to
  const window = pactWindowAt(pact, istMinuteOfDay(nowEpochMs));
  if (window) {
    return {
      signal: "pact_breach",
      observedValue: window.startMinuteIst,
      threshold: window.endMinuteIst,
      contribution: 0,
      explanationCode: "signal.breach.window"
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

  const breach = request.pactCommitted
    ? detectBreach(request.history, request.pact, request.nowEpochMs, request.checkIn?.amountPaise)
    : null;
  if (breach) hits.push(breach);

  const source = detectSource(request);
  if (source) hits.push(source);

  const size = detectSizeEscalation(request.history, request.nowEpochMs, request.checkIn?.amountPaise, SIZE_ESCALATION);
  if (size) hits.push(size);

  return hits;
}
