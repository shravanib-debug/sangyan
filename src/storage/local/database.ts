import Dexie, { type EntityTable } from "dexie";

import type { CheckIn, JournalEntry, Pact, PauseEvent, RiskResult, SyncMetadata, Trade } from "@/engine/types";

export interface LocalSetting {
  key: string;
  value: unknown;
}

export interface SyncQueueItem extends SyncMetadata {
  entityType: "pact" | "checkin" | "journal" | "pause";
  payload: unknown;
  attempts?: number;
  lastError?: string;
}

export class ThehravDatabase extends Dexie {
  trades!: EntityTable<Trade, "id">;
  pacts!: EntityTable<Pact, "id">;
  checkins!: EntityTable<CheckIn, "id">;
  riskAssessments!: EntityTable<RiskResult, "assessmentId">;
  journal!: EntityTable<JournalEntry, "id">;
  pauses!: EntityTable<PauseEvent, "id">;
  settings!: EntityTable<LocalSetting, "key">;
  syncQueue!: EntityTable<SyncQueueItem, "id">;

  constructor() {
    super("thehrav");
    this.version(1).stores({
      trades: "id,timestamp,source,orderId",
      pacts: "id,userId,revision,effectiveAt",
      checkins: "id,userId,timestamp,fundSource",
      riskAssessments: "assessmentId,evaluatedAt,tier",
      journal: "id,userId,createdAt",
      pauses: "id,userId,assessmentId,startedAt,outcome",
      settings: "key",
      syncQueue: "id,userId,entityType,syncStatus,clientCreatedAt"
    });
  }
}

export const localDatabase = new ThehravDatabase();
