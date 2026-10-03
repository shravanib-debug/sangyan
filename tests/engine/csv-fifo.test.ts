import { describe, it, expect } from "vitest";
import { parseBrokerCsv } from "../../src/engine/csv-parser";
import { pairFifo } from "../../src/engine/fifo";

describe("CSV Parser and FIFO Pairing", () => {
  it("drops PII columns and parses canonical fields, ignoring BOM/CRLF", () => {
    const csv = "\uFEFFSymbol,Side,Qty,Price,Time,Name,Account\r\nRELIANCE,Buy,100,2500,2026-10-03T10:00:00Z,John Doe,12345\r\n";
    const result = parseBrokerCsv(csv);
    
    expect(result.droppedRows).toBe(0);
    expect(result.trades.length).toBe(1);
    
    const trade = result.trades[0];
    expect(trade.symbol).toBe("RELIANCE");
    expect(trade.side).toBe("buy");
    expect(trade.quantity).toBe(100);
    expect(trade.pricePaise).toBe(250000);
    
    // @ts-ignore
    expect(trade.Name).toBeUndefined();
    // @ts-ignore
    expect(trade.Account).toBeUndefined();
  });

  it("handles partial fills, flips, and shorts", () => {
    const csv = `Symbol,Side,Qty,Price,Time
TCS,Buy,100,3000,2026-10-03T10:00:00Z
TCS,Buy,50,3010,2026-10-03T10:05:00Z
TCS,Sell,120,3050,2026-10-03T10:10:00Z
TCS,Sell,60,3020,2026-10-03T10:15:00Z
TCS,Buy,30,3000,2026-10-03T10:20:00Z`;

    const parsed = parseBrokerCsv(csv);
    const fifo = pairFifo(parsed.trades);

    expect(fifo.length).toBe(5);

    // 1. Buy 100
    expect(fifo[0].pnlPaise).toBeUndefined();
    // 2. Buy 50
    expect(fifo[1].pnlPaise).toBeUndefined();
    
    // 3. Sell 120 (Matches 100 from T1, 20 from T2)
    // T1 buy = 3000 * 100 = 300000
    // T2 buy = 3010 * 20 = 60200
    // Total cost = 360200
    // Sell = 3050 * 120 = 366000
    // PnL = 366000 - 360200 = 5800 (580000 paise)
    expect(fifo[2].pnlPaise).toBe(580000);
    expect(fifo[2].holdTimeSeconds).toBeGreaterThan(0);

    // After T3, remaining long position is 30 from T2.
    // 4. Sell 60 (Matches 30 from T2, then flips to 30 short)
    // T2 buy = 3010 * 30 = 90300
    // Sell = 3020 * 30 = 90600
    // PnL = 90600 - 90300 = 300 (30000 paise)
    expect(fifo[3].pnlPaise).toBe(30000);

    // 5. Buy 30 (Matches 30 short from T4)
    // Short sell price = 3020
    // Buy cover price = 3000
    // PnL = (3020 - 3000) * 30 = 600 (60000 paise)
    expect(fifo[4].pnlPaise).toBe(60000);
  });
  
  it("merges fills by order ID or exactly identical timestamp", () => {
    const csv = `Symbol,Side,Qty,Price,Time,Order ID
INFY,Buy,20,1500,2026-10-03T11:00:00Z,ORD1
INFY,Buy,30,1505,2026-10-03T11:00:05Z,ORD1
HDFC,Sell,10,1600,2026-10-03T11:30:00Z,
HDFC,Sell,10,1600,2026-10-03T11:30:00Z,`;
    
    const parsed = parseBrokerCsv(csv);
    // Should merge the two INFY fills (same order ID)
    // Should merge the two HDFC fills (no order ID, but same timestamp, symbol, side)
    expect(parsed.trades.length).toBe(2);
    
    const infy = parsed.trades.find(t => t.symbol === "INFY")!;
    expect(infy.quantity).toBe(50);
    // VWAP: (20*1500 + 30*1505)/50 = 1503 -> 150300 paise
    expect(infy.pricePaise).toBe(150300);
    
    const hdfc = parsed.trades.find(t => t.symbol === "HDFC")!;
    expect(hdfc.quantity).toBe(20);
    expect(hdfc.pricePaise).toBe(160000);
  });
});
