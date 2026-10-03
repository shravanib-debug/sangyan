import { Trade, TradeSide } from "./types";
import { ParsedRow } from "./csv-parser";

export interface FifoTrade extends Trade {
  // PnL in paise for the closed portion of the trade
  pnlPaise?: number;
  holdTimeSeconds?: number;
}

interface OpenPosition {
  tradeId: string;
  timestamp: string;
  quantity: number;
  pricePaise: number;
}

export function pairFifo(parsedRows: ParsedRow[]): FifoTrade[] {
  const result: FifoTrade[] = [];
  const queues = new Map<string, { side: TradeSide; positions: OpenPosition[] }>();

  let tradeCounter = 1;

  for (const row of parsedRows) {
    const tradeId = `csv-trade-${tradeCounter++}`;
    let pnlPaise = 0;
    let holdTimeWeightedSum = 0;
    let matchedQty = 0;
    
    let remainingQty = row.quantity;
    
    if (!queues.has(row.symbol)) {
      queues.set(row.symbol, { side: row.side, positions: [] });
    }
    
    const queueState = queues.get(row.symbol)!;

    if (queueState.positions.length === 0 || queueState.side === row.side) {
      // Open or add to position
      queueState.side = row.side;
      queueState.positions.push({
        tradeId,
        timestamp: row.timestamp,
        quantity: row.quantity,
        pricePaise: row.pricePaise,
      });
      
      result.push({
        id: tradeId,
        timestamp: row.timestamp,
        symbol: row.symbol,
        side: row.side,
        quantity: row.quantity,
        pricePaise: row.pricePaise,
        source: "csv",
        orderId: row.orderId,
      });
    } else {
      // Opposite side: match FIFO
      while (remainingQty > 0 && queueState.positions.length > 0) {
        const head = queueState.positions[0];
        const matchQty = Math.min(head.quantity, remainingQty);
        
        // Calculate PnL for the matched quantity
        const isLong = queueState.side === "buy";
        const buyPrice = isLong ? head.pricePaise : row.pricePaise;
        const sellPrice = isLong ? row.pricePaise : head.pricePaise;
        
        pnlPaise += (sellPrice - buyPrice) * matchQty;
        
        // Calculate holding time (seconds)
        const t1 = new Date(head.timestamp).getTime();
        const t2 = new Date(row.timestamp).getTime();
        const holdTimeSec = Math.max(0, (t2 - t1) / 1000);
        holdTimeWeightedSum += holdTimeSec * matchQty;
        
        matchedQty += matchQty;
        remainingQty -= matchQty;
        head.quantity -= matchQty;
        
        if (head.quantity === 0) {
          queueState.positions.shift();
        }
      }
      
      // If there is still remaining qty, it flips the position
      if (remainingQty > 0) {
        queueState.side = row.side;
        queueState.positions.push({
          tradeId,
          timestamp: row.timestamp,
          quantity: remainingQty,
          pricePaise: row.pricePaise,
        });
      }
      
      const avgHoldTimeSec = matchedQty > 0 ? holdTimeWeightedSum / matchedQty : undefined;
      
      result.push({
        id: tradeId,
        timestamp: row.timestamp,
        symbol: row.symbol,
        side: row.side,
        quantity: row.quantity,
        pricePaise: row.pricePaise,
        source: "csv",
        pnlPaise: matchedQty > 0 ? pnlPaise : undefined,
        orderId: row.orderId,
        // @ts-ignore - we add holdTimeSeconds to help signals
        holdTimeSeconds: avgHoldTimeSec,
      });
    }
  }

  return result;
}
