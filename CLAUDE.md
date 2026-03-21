# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

Reverse engineering research on Pump.fun's **Tokenized Agent** on-chain program (`AgenTMiC2hvxGebTsgmsD4HHBa8WEcqGFf87iwRRxLo7`) on Solana mainnet. The program implements an automated token buyback mechanism (not an AI). All findings are documented in `REPORT_TECHNICAL.md` and `REPORT_EXPERIMENTS.md`.

## Setup

Copy `.env.example` to `.env` and fill in:
- `HELIUS_API_KEY` — required for all RPC calls (Helius mainnet endpoint)
- `SECRET_KEY` — wallet secret key as JSON array (only needed for signing transactions)

## Running Tools

```bash
# Scan recent transactions and map instruction discriminators
node tools/discoverAgent.js
node tools/discoverAgent.js --limit=50
node tools/discoverAgent.js --raw          # include full raw tx JSON

# Deep-analyze a specific transaction (hex dumps all instruction data)
node tools/analyzeTransaction.js <signature>
node tools/analyzeTransaction.js --latest  # most recent agent tx
```

No build step, no test suite — this is a pure Node.js ESM research project.

## Architecture

```
utils/
  rpc.js        — Shared Helius Connection (exported as `connection`)
  constants.js  — All known program IDs, account discriminators, instruction discriminators

tools/
  discoverAgent.js      — Bulk tx scan: maps discriminators, account layouts, CPI programs
  analyzeTransaction.js — Single tx deep dive: hex dump + balance changes
```

**Always check `utils/constants.js` first** before hardcoding any address or discriminator — all known program IDs, Anchor discriminators (8-byte hex), and sentinel values (e.g. `BURN_ADDRESS`) are defined there.

## Key Implementation Details

- **ESM throughout** (`"type": "module"` in package.json) — use `import`/`export`, not `require`
- **RPC rate limiting**: `discoverAgent.js` uses a serial queue with 300ms gap between calls to avoid Helius rate limits. Preserve this pattern when adding new batch RPC calls.
- **Discriminators**: All Anchor discriminators are the first 8 bytes of instruction/account data, represented as lowercase hex strings (e.g. `'88f1f2d9ad4d70ba'`).
- **Account decoding**: Accounts are decoded by slicing raw bytes at fixed offsets (not using an IDL). Offsets are documented in `REPORT_TECHNICAL.md` §3 and in `constants.js` comments.
- **Two AMM paths**: Buyback transactions have either 33 accounts (pre-graduation, Pump.fun bonding curve) or 40 accounts (post-graduation, pAMM/Raydium). Account count is the reliable signal for which path is used.

## Program Account Types

| Discriminator | Size | Type | Count |
|--------------|------|------|-------|
| `88f1f2d9ad4d70ba` | 75 bytes | AgentConfig (per-token) | ~28k |
| `e1c351e3732b19b1` | 104 bytes | AgentBuybackVault (per-token) | ~4k |
| `95089ccaa0fcb0d9` | 401 bytes | GlobalState (singleton) | 1 |
