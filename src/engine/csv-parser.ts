import Papa from "papaparse";
import { Trade, TradeSide } from "./types";

export interface ParsedRow {
  timestamp: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  pricePaise: number;
  orderId?: string;
}

export interface ParseResult {
  trades: ParsedRow[];
  droppedRows: number;
  errors: string[];
}

export function parseBrokerCsv(csvString: string): ParseResult {
  const result: ParseResult = { trades: [], droppedRows: 0, errors: [] };
  
  const parsed = Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    result.errors = parsed.errors.map((e) => e.message);
  }

  const rawRows = parsed.data as Record<string, string>[];

  for (const rawRow of rawRows) {
    const row: Record<string, string> = {};
    for (const key of Object.keys(rawRow)) {
      row[key.toLowerCase().trim().replace(/^\uFEFF/, '')] = rawRow[key];
    }

    // Map aliases
    const symbol = row["symbol"] || row["instrument"];
    const sideStr = (row["side"] || row["type"])?.toLowerCase();
    const qtyStr = row["qty."] || row["quantity"] || row["qty"];
    const priceStr = row["price"] || row["avg. price"];
    const timeStr = row["time"] || row["trade date"] || row["timestamp"];
    const orderId = row["order id"] || row["order_id"];

    if (!symbol || !sideStr || !qtyStr || !priceStr || !timeStr) {
      result.droppedRows++;
      continue;
    }

    let side: TradeSide;
    if (sideStr.includes("buy") || sideStr === "b") {
      side = "buy";
    } else if (sideStr.includes("sell") || sideStr === "s") {
      side = "sell";
    } else {
      result.droppedRows++;
      continue;
    }

    const quantity = parseInt(qtyStr, 10);
    const price = parseFloat(priceStr);

    if (isNaN(quantity) || isNaN(price)) {
      result.droppedRows++;
      continue;
    }

    // Normalize IST to UTC ISO string
    // Assuming timeStr is like "2026-10-03 10:15:00" in IST
    // A robust parser would parse dates. For now:
    let isoDate: string;
    try {
      // If it's already an ISO string:
      if (timeStr.includes("T") && timeStr.endsWith("Z")) {
        isoDate = new Date(timeStr).toISOString();
      } else {
        // Append IST offset for Date parsing if missing
        // simple parsing
        const d = new Date(timeStr + " GMT+0530");
        if (isNaN(d.getTime())) {
          // fallback to just Date
          const d2 = new Date(timeStr);
          if (isNaN(d2.getTime())) {
            result.droppedRows++;
            continue;
          }
          isoDate = d2.toISOString();
        } else {
          isoDate = d.toISOString();
        }
      }
    } catch {
      result.droppedRows++;
      continue;
    }

    result.trades.push({
      symbol: symbol.trim(),
      side,
      quantity,
      pricePaise: Math.round(price * 100),
      timestamp: isoDate,
      orderId: orderId?.trim(),
    });
  }

  // Merge fills: same symbol, side, orderId (if available) or exactly same timestamp
  result.trades = mergeFills(result.trades);
  // Sort by timestamp
  result.trades.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return result;
}

function mergeFills(rows: ParsedRow[]): ParsedRow[] {
  const merged: ParsedRow[] = [];
  const map = new Map<string, ParsedRow>();

  for (const row of rows) {
    const key = row.orderId 
      ? row.orderId 
      : `${row.symbol}-${row.side}-${row.timestamp}`;

    if (map.has(key)) {
      const existing = map.get(key)!;
      const totalQty = existing.quantity + row.quantity;
      const totalCost = existing.pricePaise * existing.quantity + row.pricePaise * row.quantity;
      existing.quantity = totalQty;
      existing.pricePaise = Math.round(totalCost / totalQty);
    } else {
      map.set(key, { ...row });
    }
  }

  return Array.from(map.values());
}
