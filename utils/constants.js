export const PUMP_FUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PAMM_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'; // post-graduation AMM

// Agent Program
export const AGENT_PROGRAM_ID = 'AgenTMiC2hvxGebTsgmsD4HHBa8WEcqGFf87iwRRxLo7';
export const AGENT_GLOBAL_STATE = 'ALeLWphFxNVNXpXFEC4Ssf2Jan1Wki72Us8tXMMrQuQZ'; // 401 bytes, disc=95089ccaa0fcb0d9
export const AGENT_EVENT_AUTHORITY = 'HcAR1LpgSGFxeLyb1vkhsCuN6AtxQsww3E2pMMXkwHqx';
export const AGENT_CRANK_WALLET = 'GmFrDZT2cdrqykgTikVdXbe8EtCgzUDM9VsDhQnwsUsG'; // bot executor, regular keypair

// Global State fields (decoded from 401-byte account)
export const AGENT_ADMIN = 'J9jp8gnPXYjJ7BbJSpqH4AZPtu3YAve3GRQuajnVL3Dj';
export const AGENT_TREASURY = 'CWBSo8QAX3BvaX5iLnfttXPRsgqcwX6iL7c88w9hRctb';

// Account discriminators (8-byte Anchor disc, hex)
export const DISC_AGENT_CONFIG = '88f1f2d9ad4d70ba';        // 75 bytes — per-token config PDA
export const DISC_AGENT_BUYBACK_VAULT = 'e1c351e3732b19b1'; // 104 bytes — per-token vault stats
export const DISC_AGENT_GLOBAL_STATE = '95089ccaa0fcb0d9';  // 401 bytes — global singleton

// Instruction discriminators (hex)
export const IX_INITIALIZE_AGENT = 'b4f8a308315e7e60'; // 42 bytes, 8 accounts
export const IX_DEPOSIT = '912cf62fc0cc5f20';           // 8 bytes, 15 accounts — permissionless
export const IX_CLOSE_WSOL = '27ced6a7372cdd51';        // 8 bytes, 2 accounts — crank only
export const IX_BUYBACK = '5fe7c102f54b7d9b';           // 37 bytes, 33-40 accounts — crank only
export const IX_ADMIN_CONFIG = '291c765a35183fa0';       // 10 bytes, 7 accounts — admin only

// Anchor CPI event discriminator (outer wrapper for all emitted events)
export const ANCHOR_EVENT_DISC = 'e445a52e51cb9a1d';

// Stablecoins for multi-asset routing
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
export const USD1_MINT = null; // not yet identified

// Sentinel value: fee_recipient = burn111... means 100% of tokens are burned
export const BURN_ADDRESS = 'burn111111111111111111111111111111111111111';

// Fee recipients (from decoded buyback transactions)
export const PUMP_FEE_RECIPIENT = 'Fb68236fek5ZbBRp9xSiAcEFWRz7rqA1gm1Xnj7mjtfn';
export const AGENT_PROTOCOL_FEE = 'BPLNkQyBGn1CVdFL2yRayrgWgHbaVbcvHfDBQJL5rxBg'; // ~0.002 SOL per buyback
export const PFEE_PROGRAM = 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ';
export const PUMP_EVENT_AUTHORITY = 'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1';

// Pump.fun buy instruction discriminator (embedded in buyback payload)
export const PUMP_BUY_DISC = '66063d1201daebea';
