export type ISODateTime = string;
export type UUID = string;

export type TradeSide = "buy" | "sell";
export type TradeSource = "csv" | "synthetic" | "connected";
export type BrokerProvider = "zerodha" | "angel_one";
export type FundSource = "surplus" | "savings" | "emergency_fund" | "borrowed";
export type BorrowKind = "none" | "bank_loan" | "instant_loan" | "credit_card" | "other";
export type RiskTier = "L0" | "L1" | "L2" | "L3";
export type PauseOutcome = "waiting" | "continued" | "abandoned" | "expired";
export type SyncStatus = "local_only" | "pending" | "synced" | "conflict" | "failed";
export type BrokerConnectionStatus =
  | "disconnected"
  | "connecting"
  | "live"
  | "reconnecting"
  | "stale"
  | "reauth_required";

export interface Trade {
  id: UUID;
  timestamp: ISODateTime;
  symbol: string;
  side: TradeSide;
  quantity: number;
  pricePaise: number;
  pnlPaise?: number;
  orderId?: string;
  source: TradeSource;
}

export interface BrokerEvent {
  id: UUID;
  userId: UUID;
  provider: BrokerProvider;
  providerEventId: string;
  providerOrderId?: string;
  observedAt: ISODateTime;
  receivedAt: ISODateTime;
  eventType: "order_update" | "trade_update" | "reconciliation";
  status: string;
  symbol?: string;
  side?: TradeSide;
  quantity?: number;
  averagePricePaise?: number;
  pnlPaise?: number;
  dedupeHash: string;
  /** True for replay/sandbox events; never presented as live broker activity. */
  simulated?: boolean;
}

export interface Pact {
  id: UUID;
  userId?: UUID;
  dailyLossLimitPaise: number;
  maximumTradesPerDay: number;
  cooldownAfterLossMinutes: number;
  blockedWindows: ReadonlyArray<{ startMinuteIst: number; endMinuteIst: number }>;
  blockBorrowedFunds: boolean;
  blockEmergencyFunds: boolean;
  revision: number;
  effectiveAt: ISODateTime;
}

export interface CheckIn {
  id: UUID;
  userId?: UUID;
  timestamp: ISODateTime;
  amountPaise: number;
  fundSource: FundSource;
  borrowKind: BorrowKind;
  horizon: "intraday" | "days" | "weeks" | "months" | "years";
  reason: string;
  exitCondition: string;
}

export interface SignalHit {
  signal:
    | "revenge"
    | "overtrade"
    | "late_night"
    | "loss_hold"
    | "pact_breach"
    | "money_source";
  observedValue: number | string | boolean;
  threshold: number | string | boolean;
  contribution: number;
  explanationCode: string;
}

export interface RiskResult {
  assessmentId: UUID;
  score: number;
  tier: RiskTier;
  signalHits: SignalHit[];
  hardRuleOverrides: string[];
  engineVersion: string;
  configVersion: string;
  evaluatedAt: ISODateTime;
}

export interface JournalEntry {
  id: UUID;
  userId?: UUID;
  createdAt: ISODateTime;
  reason: string;
  horizon: CheckIn["horizon"];
  exitCondition: string;
  transcriptSource: "typed" | "on_device_voice";
}

export interface PauseEvent {
  id: UUID;
  userId?: UUID;
  /** Local link used to join a manual check-in to its exact pause and assessment. */
  checkInId?: UUID;
  assessmentId: UUID;
  tier: RiskTier;
  startedAt: ISODateTime;
  expiresAt?: ISODateTime;
  outcome: PauseOutcome;
  revision?: number;
}

export interface SyncMetadata {
  id: UUID;
  userId?: UUID;
  clientCreatedAt: ISODateTime;
  serverReceivedAt?: ISODateTime;
  revision: number;
  idempotencyKey: string;
  syncStatus: SyncStatus;
  lastAttemptAt?: ISODateTime;
}

export interface BrokerConnectionSummary {
  provider: BrokerProvider;
  status: BrokerConnectionStatus;
  expiresAt?: ISODateTime;
  lastEventAt?: ISODateTime;
  lastHeartbeatAt?: ISODateTime;
}

export interface Clock {
  nowEpochMs(): number;
}

export interface Rng {
  next(): number;
}

export interface WorkerDetectRequest {
  history: Trade[];
  pact: Pact;
  checkIn?: Pick<CheckIn, "amountPaise" | "fundSource" | "borrowKind" | "timestamp">;
  nowEpochMs: number;
  config: EngineConfig;
}

export interface EngineConfig {
  version: string;
  weights: Readonly<Record<SignalHit["signal"], number>>;
  tiers: Readonly<{ l1: number; l2: number; l3: number }>;
}
