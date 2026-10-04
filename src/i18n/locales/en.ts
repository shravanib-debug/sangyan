export const en = {
  common: {
    appName: "Thehrav",
    tagline: "A private pause between impulse and action.",
    offline: "You are offline. Your core journey is still available.",
    updateReady: "An update is ready.",
    updateNow: "Update when safe",
    install: "Install Thehrav",
    language: "Language",
    continue: "Continue",
    backHome: "Back to home",
    working: "Working…",
    error: "Something went wrong. Please try again.",
    limitation:
      "Thehrav sees broker activity only after it happens. It cannot block an order, including one placed in your broker's own app.",
    foundationNotice: "This screen arrives in a later phase."
  },
  home: {
    title: "Pause before the next decision",
    body: "Thehrav helps you follow rules you made while calm. It does not provide tips or place trades.",
    start: "Start onboarding",
    about: "How Thehrav works",
    checkin: "Check in before a decision",
    pact: "My Pact",
    settings: "Settings and connections",
    inboxTitle: "Waiting for you",
    inboxItem: "A pause from {{time}} is waiting for you.",
    signedInAs: "Signed in as {{email}}",
    logout: "Log out",
    guestNote: "You are using Thehrav as a guest. Your data stays on this device.",
    moreTools: "More tools",
    toolImport: "Import history",
    toolSimulator: "Simulator",
    toolPanic: "Pause companion",
    toolReview: "Process review",
    toolJournal: "Decision journal"
  },
  onboarding: {
    languageTitle: "Select your language",
    privacyTitle: "Privacy & Limitations",
    privacyBody:
      "Thehrav is a behavioral circuit breaker, not an advisor. It does not provide investment tips, place trades, or predict the market. Your raw trading data and voice journals remain on your device by default.",
    acceptPrivacy: "I understand and accept",
    authTitle: "Choose how to use Thehrav",
    authGuest: "Continue as Guest (Local only)",
    authSync: "Sign in (Enable cloud sync)",
    authNote: "You can create an account later to sync data across devices."
  },
  auth: {
    title: "Sign in or create an account",
    email: "Email",
    password: "Password",
    login: "Log in",
    signup: "Sign up",
    cancel: "Cancel",
    unexpected: "An unexpected error occurred."
  },
  pact: {
    title: "My Pact",
    subtitle: "Rules set while calm, enforced during chaos.",
    lossLimitLabel: "Daily Loss Limit (INR)",
    maxTradesLabel: "Max Trades per Day",
    cooldownLabel: "Cooldown after loss (minutes)",
    blockBorrowedLabel: "Block borrowed funds",
    blockEmergencyLabel: "Block emergency funds",
    savePact: "Save Pact",
    tightenImmediate: "Tighter rules apply immediately.",
    loosenDelayed: "Loosening rules takes 24 hours.",
    pendingLoosen: "Loosening in {{hours}}h {{minutes}}m",
    noPendingLoosen: "Active immediately",
    pendingNote: "Your looser rules are waiting out the 24-hour delay. Saving again cancels them.",
    savedTighten: "Saved. Your tighter rules apply now.",
    savedLoosen: "Saved. Your looser rules apply after 24 hours.",
    savedMixed: "Saved. Tighter rules apply now; looser ones apply after 24 hours.",
    savedNone: "Nothing changed. Any waiting loosening was cancelled.",
    toCheckin: "Go to check-in"
  },
  checkin: {
    title: "Decision Check-in",
    subtitle: "Before you act, let's look at the plan.",
    amountLabel: "Trade amount (INR)",
    sourceLabel: "Money source",
    sourceSurplus: "Surplus cash",
    sourceSavings: "Core savings",
    sourceEmergency: "Emergency fund",
    sourceBorrowed: "Borrowed / Credit",
    borrowKindLabel: "Type of borrowing",
    borrowBank: "Bank loan",
    borrowInstant: "Instant loan app",
    borrowCard: "Credit card",
    borrowOther: "Other / friend",
    horizonLabel: "Expected holding period",
    horizonIntraday: "Intraday (Today)",
    horizonDays: "A few days",
    horizonWeeks: "A few weeks",
    horizonMonths: "A few months",
    horizonYears: "Long term (Years)",
    reasonLabel: "Why this trade now?",
    exitLabel: "What is the exit condition?",
    evaluateButton: "Evaluate Decision"
  },
  pause: {
    title: "Cooling-off Pause",
    loading: "Loading your pause…",
    notFound: "This pause could not be found on this device.",
    l0: "Clear to proceed. This matches your Pact.",
    l1: "A few of your own rules were touched. Take a breath and look at your exit plan.",
    l2: "Several of your own rules were touched. Your Pact asks for a 2-minute pause.",
    l3: "Your Pact was breached. The lock you set applies until the timer ends.",
    timer: "Wait {{seconds}}s",
    lockRemaining: "Locked by your Pact for {{minutes}}m {{seconds}}s",
    continue: "I understand, continue anyway",
    abandon: "Step away (Good call)",
    lock: "Action blocked by your pact",
    explanationTitle: "Why are we pausing?",
    scoreLine: "Score {{score}} of 100",
    simulatedBanner: "Simulated replay: this event is synthetic and did not come from your broker.",
    limitationTitle: "Good to know",
    override: {
      money_source_emergency_fund: "Rule applied: emergency money always gets at least a breath-length pause.",
      money_source_borrowed: "Rule applied: borrowed money always gets at least a 2-minute pause.",
      pact_breach_lock: "Rule applied: a Pact breach locks the pause until the cooldown you set has passed."
    }
  },
  signal: {
    revenge: {
      triggered: "A new trade came {{observed}} minutes after a loss (your window is {{threshold}} minutes). Share of score: {{contribution}}."
    },
    overtrade: {
      triggered: "{{observed}} trades in 30 minutes (threshold {{threshold}}). Share of score: {{contribution}}."
    },
    late_night: {
      triggered: "It is {{observed}} IST, inside a no-trade window. Share of score: {{contribution}}."
    },
    loss_hold: {
      triggered: "Losing trades were held {{observed}}x longer than winning ones (threshold {{threshold}}x). Share of score: {{contribution}}."
    },
    breach: {
      max_trades: "{{observed}} trades today; your Pact allows {{threshold}}. Share of score: {{contribution}}.",
      daily_loss: "Today's loss is {{observed}}; your Pact limit is {{threshold}}. Share of score: {{contribution}}.",
      cooldown: "{{observed}} minutes since your last loss; your Pact cooldown is {{threshold}} minutes. Share of score: {{contribution}}."
    },
    source: {
      triggered: "Money source: {{observed}} (lowest-risk source: {{threshold}}). Share of score: {{contribution}}."
    },
    sourceName: {
      surplus: "surplus cash",
      savings: "core savings",
      emergency_fund: "emergency fund",
      borrowed: "borrowed money"
    }
  },
  simulator: {
    title: "Consequence Simulator",
    subtitle: "Illustrative simulation. This is not a forecast.",
    principal: "Starting Capital (INR)",
    leverage: "Leverage",
    lossLimit: "Daily Loss Limit (INR)",
    volatility: "Market Volatility",
    simulate: "Run Simulation",
    baselineRuin: "Wipeout risk (No rules)",
    ruleBoundRuin: "Wipeout risk (With limits)",
    scenarioDependentNote: "These results use the starting capital, leverage, daily loss limit, and volatility above.",
    disclaimer: "These figures are based on mathematical models using random walks. They do not predict actual market movements or your personal trading outcomes.",
    recoveryTitle: "Recovery Required",
    recoveryInvariantNote: "Fixed recovery math: these percentages do not depend on the simulation inputs.",
    recoveryMath: "A {{loss}}% loss requires a {{gain}}% gain to break even.",
    recoveryWipeout: "Wipeout (100% loss) cannot be recovered."
  },
  importHistory: {
    title: "Import History",
    subtitle: "See how Thehrav would have evaluated past trades. Processing happens entirely on your device.",
    selectFile: "Select CSV File",
    processing: "Processing...",
    droppedNotice: "{{count}} rows could not be parsed and were skipped. Raw rejected data is never shown.",
    flaggedTimeline: "Flagged Timeline",
    replayDiffTitle: "Retrospective Difference",
    replayDiffBody: "This shows theoretical pauses based on your rules. Thehrav cannot avoid losses, but it can introduce friction.",
    noFlags: "No rules were breached in the imported dataset.",
    flaggedCount: "{{flagged}} / {{total}} trades flagged",
    quantity: "Qty",
    price: "Price",
    side: {
      buy: "BUY",
      sell: "SELL"
    }
  },
  settings: {
    title: "Settings",
    accountTitle: "Account",
    signedOut: "You are using Thehrav as a guest. Sign in to sync across devices.",
    signIn: "Sign in",
    offlineNote: "You are offline. Account settings need a connection.",
    syncTitle: "Cloud sync",
    syncBody:
      "Sync your Pact, check-ins and pause outcomes across devices. Raw CSV files and audio never leave your device.",
    syncEnable: "Turn on sync",
    syncDisable: "Turn off sync",
    syncOn: "Sync is on.",
    journalSyncLabel: "Also sync the reasons I write (journal text)",
    brokerTitle: "Zerodha connection",
    brokerBody:
      "Optional. Thehrav reads order updates only. It cannot place, change or cancel orders, and you never type your Zerodha password here.",
    brokerConsent:
      "I agree to let Thehrav read my Zerodha order updates to notice patterns. I can disconnect at any time.",
    brokerConnect: "Connect Zerodha",
    brokerDisconnect: "Disconnect and delete access",
    brokerSimulated: "Simulated replay: events are synthetic and do not come from your broker.",
    brokerExpires: "Session ends {{time}}.",
    brokerSignInFirst: "Sign in to connect a broker.",
    status: {
      disconnected: "Not connected",
      connecting: "Connecting…",
      live: "Live: watching order updates",
      reconnecting: "Reconnecting: updates may be delayed",
      stale: "Stale: no recent signal. Monitoring is not live.",
      reauth_required: "Sign-in expired. Connect again to resume."
    },
    notices: {
      consent_required: "Please agree to the connection terms first.",
      replay: "Connected in simulated replay mode.",
      connected: "Zerodha connected.",
      denied: "The Zerodha login was cancelled or denied.",
      state_invalid: "That login link was not valid. Please start again.",
      state_replayed: "That login link was already used. Please start again.",
      exchange_failed: "Zerodha did not complete the login. Please try again.",
      connect_failed: "The connection could not be saved. Please try again.",
      not_configured: "Broker connections are not set up on this server yet."
    },
    pushTitle: "Notifications",
    pushBody: "Get a calm, generic reminder when a pause is waiting. It never shows amounts or symbols.",
    pushEnable: "Turn on notifications",
    pushDisable: "Turn off notifications",
    pushOn: "Notifications are on for this device.",
    pushUnsupported: "This browser does not support notifications.",
    pushDenied: "Notifications are blocked in your browser settings.",
    pushNeedsSync: "Turn on sync first.",
    privacyTitle: "Privacy & Data",
    privacyBody: "Manage your data. Raw CSV and audio never leave your device.",
    exportData: "Export local data",
    deleteLocal: "Delete local data",
    deleteAccount: "Delete cloud account",
    deleteLocalConfirm: "This will permanently delete all data from this device. Are you sure?",
    deleteAccountConfirm: "This will permanently delete your cloud account and all synced data, and log you out. Are you sure?"
  },
  panic: {
    title: "Pause.",
    subtitle: "Breathe. Nothing needs to be decided this minute.",
    whatTitle: "What is happening?",
    whatBody: "You tapped the pause button. That usually means a strong urge to act right away.",
    contextTitle: "Worth remembering",
    point1: "No single trade defines your financial future.",
    point2: "Your rules were made when you were calm. Your Pact is there for moments like this.",
    point3: "You can come back to this decision after the pause.",
    waitBody: "Take a full 5 minutes before making any decision.",
    done: "I have paused. Go back."
  },
  review: {
    title: "Process review",
    subtitle: "Reflecting on recent activity",
    loading: "Loading your review…",
    loadFailed: "The review could not be loaded from this device.",
    emptyTitle: "Nothing to review yet",
    emptyBody: "This review uses only what is stored on this device: trades you import and check-ins you complete. Neither is here yet, so there are no signals to show.",
    emptyImport: "Import trade history",
    emptyCheckin: "Start a check-in",
    intro: "The goal here is not to grade the outcome, since markets are unpredictable, but to look at your process.",
    historyTitle: "Your imported history",
    noTrades: "No trade history has been imported.",
    historySummary: "{{flagged}} of {{total}} imported trades touched your rules.",
    historyNone: "Your rules were not touched in the imported history.",
    signalCount: "{{name}}: {{count}}",
    recentFlaggedTitle: "Most recent flagged trades",
    decisionsTitle: "Your recent decisions",
    decisionsNone: "No check-ins yet.",
    reasonLabel: "Reason",
    exitLabel: "Exit plan",
    tierLabel: "Pause level {{level}}",
    outcome: {
      waiting: "Pause still waiting",
      continued: "You continued",
      abandoned: "You stepped away",
      expired: "Pause expired"
    },
    reflectTitle: "Self-reflection",
    reflectQuestion: "Did you follow the rules you set in your Pact?",
    followed: "Yes, the process was followed",
    breached: "No, rules were breached",
    saved: {
      followed: "Saved on this device ({{time}}): the process was followed.",
      breached: "Saved on this device ({{time}}): rules were breached."
    },
    privacy: "This reflection is private and stays on your device."
  },
  signalNames: {
    revenge: "Quick follow-up after a loss",
    overtrade: "Many trades in a short time",
    late_night: "Late-night trading window",
    loss_hold: "Losses held longer than wins",
    pact_breach: "Pact limit crossed",
    money_source: "Money source"
  },
  signalLine: "Observed {{observed}} (threshold {{threshold}})",
  units: {
    minutes: "{{value}} minutes",
    trades: "{{value}} trades",
    times: "{{value}}x"
  },
  journal: {
    subtitle: "Your past decisions and the signals behind them, kept on this device.",
    loading: "Loading your journal…",
    loadFailed: "The journal could not be loaded from this device.",
    emptyTitle: "No journal entries yet",
    emptyBody: "Entries appear here after you complete a check-in or import trade history. Nothing has been recorded on this device yet.",
    kindCheckin: "Check-in",
    kindTrade: "Flagged imported trade",
    riskLabel: "Risk and pause",
    signalsLabel: "Signals",
    noSignals: "None of your rules were touched.",
    outcomeLabel: "Pause outcome",
    reflectionTitle: "Latest process reflection",
    showMore: "Show more ({{remaining}} left)",
    privacy: "This journal is private and stays on your device."
  },
  screens: {
    onboarding: "Onboarding",
    pact: "My Pact",
    checkin: "Decision check-in",
    pause: "Cooling-off pause",
    journal: "Decision journal",
    import: "Import local history",
    review: "Behavioral review",
    simulator: "Consequence simulator",
    panic: "Pause companion",
    settings: "Settings",
    login: "Sign in for optional sync",
    about: "About Thehrav"
  }
} as const;
