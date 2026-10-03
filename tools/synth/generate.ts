import fs from "fs";
import path from "path";
import { createRng } from "../../src/engine/rng";
import { TradeSide } from "../../src/engine/types";

interface SyntheticTrade {
  Symbol: string;
  Side: TradeSide;
  Qty: number;
  Price: number;
  Time: string;
}

function toCsv(trades: SyntheticTrade[]): string {
  let csv = "Symbol,Side,Qty,Price,Time\n";
  for (const t of trades) {
    csv += `${t.Symbol},${t.Side === "buy" ? "Buy" : "Sell"},${t.Qty},${t.Price},${t.Time}\n`;
  }
  return csv;
}

function randomChoice<T>(rng: any, arr: T[]): T {
  const i = Math.floor(rng.next() * arr.length);
  return arr[i]!;
}

function generateCalm() {
  const rng = createRng(1001);
  const trades: SyntheticTrade[] = [];
  let ts = new Date("2026-10-01T10:00:00Z").getTime();

  for (let i = 0; i < 4; i++) {
    const symbol = randomChoice(rng, ["RELIANCE", "TCS", "HDFC"]);
    const price = Math.floor(1000 + rng.next() * 500);
    trades.push({ Symbol: symbol, Side: "buy", Qty: 50, Price: price, Time: new Date(ts).toISOString() });
    
    // Hold for 3 hours
    ts += 3 * 3600 * 1000;
    
    // Sell for a small profit or loss
    const sellPrice = price + (rng.next() > 0.5 ? 20 : -10);
    trades.push({ Symbol: symbol, Side: "sell", Qty: 50, Price: sellPrice, Time: new Date(ts).toISOString() });
    
    // Next day
    ts += 24 * 3600 * 1000;
  }
  return toCsv(trades);
}

function generateRevenge() {
  const rng = createRng(1002);
  const trades: SyntheticTrade[] = [];
  let ts = new Date("2026-10-02T10:00:00Z").getTime();
  
  // Initial trade: a loss
  trades.push({ Symbol: "INFY", Side: "buy", Qty: 100, Price: 1500, Time: new Date(ts).toISOString() });
  ts += 2 * 3600 * 1000;
  trades.push({ Symbol: "INFY", Side: "sell", Qty: 100, Price: 1400, Time: new Date(ts).toISOString() }); // 10k loss

  // Revenge trade: immediately after (within 10 mins), 2x quantity
  ts += 5 * 60 * 1000;
  trades.push({ Symbol: "INFY", Side: "buy", Qty: 200, Price: 1400, Time: new Date(ts).toISOString() });
  
  return toCsv(trades);
}

function generateOvertrader() {
  const rng = createRng(1003);
  const trades: SyntheticTrade[] = [];
  let ts = new Date("2026-10-03T10:00:00Z").getTime();
  
  // 10 trades within 30 minutes
  for (let i = 0; i < 10; i++) {
    const side = i % 2 === 0 ? "buy" : "sell";
    trades.push({ Symbol: "ITC", Side: side, Qty: 100, Price: 400 + i, Time: new Date(ts).toISOString() });
    ts += 2 * 60 * 1000; // 2 minutes apart
  }
  return toCsv(trades);
}

function generateLateNight() {
  const rng = createRng(1004);
  const trades: SyntheticTrade[] = [];
  
  // Late night IST is e.g. 1 AM (19:30 UTC previous day)
  let ts = new Date("2026-10-03T19:30:00Z").getTime(); 
  
  trades.push({ Symbol: "CRYPTO-BTC", Side: "buy", Qty: 1, Price: 5000000, Time: new Date(ts).toISOString() });
  return toCsv(trades);
}

function main() {
  const fixturesDir = path.join(__dirname, "../../fixtures");
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  // Acceptance: every fixture is visibly labelled synthetic
  const writeFixture = (name: string, content: string) => {
    fs.writeFileSync(path.join(fixturesDir, name), content, "utf8");
    console.log(`Generated synthetic fixture: ${name}`);
  };

  writeFixture("synthetic_calm.csv", generateCalm());
  writeFixture("synthetic_revenge.csv", generateRevenge());
  writeFixture("synthetic_overtrader.csv", generateOvertrader());
  writeFixture("synthetic_late_night.csv", generateLateNight());
}

main();
