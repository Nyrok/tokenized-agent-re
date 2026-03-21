#!/usr/bin/env node

/**
 * discoverAgent.js — Discovery script for the Tokenized Agent program.
 *
 * Fetches recent transactions involving AGENT_PROGRAM_ID and analyzes:
 * - Instruction discriminators (first 8 bytes of instruction data)
 * - Account lists per instruction type
 * - Inner instructions (CPI events)
 * - Signers and writable accounts
 *
 * Usage:
 *   node tools/discoverAgent.js              # analyze last 20 transactions
 *   node tools/discoverAgent.js --limit=50   # analyze last 50 transactions
 *   node tools/discoverAgent.js --raw        # dump full raw transaction JSON
 */

import 'dotenv/config';
import { connection } from '../utils/rpc.js';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { AGENT_PROGRAM_ID } from '../utils/constants.js';

const args = process.argv.slice(2);
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '20');
const rawMode = args.includes('--raw');

const MIN_GAP_MS = 300;
const rpcQueue = (() => {
    let pending = Promise.resolve();
    return (fn) => {
        pending = pending.then(() => fn()).then(result =>
            new Promise(resolve => setTimeout(() => resolve(result), MIN_GAP_MS))
        );
        return pending;
    };
})();

function toHex(bytes) {
    return Buffer.from(bytes).toString('hex');
}

function summarizeAccounts(accountKeys, ixAccounts) {
    return ixAccounts.map(idx => {
        const key = accountKeys[idx];
        return {
            index: idx,
            pubkey: key.pubkey.toBase58(),
            signer: key.signer,
            writable: key.writable,
        };
    });
}

async function analyzeTransaction(sig, accountKeys) {
    const tx = await rpcQueue(() =>
        connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed',
        })
    );
    if (!tx) return null;

    const result = {
        signature: sig.signature,
        slot: tx.slot,
        blockTime: tx.blockTime,
        instructions: [],
        innerInstructions: [],
    };

    const keys = tx.transaction.message.accountKeys;

    // Analyze outer instructions involving our program
    for (const ix of tx.transaction.message.instructions) {
        const programId = keys[ix.programIdIndex]?.pubkey?.toBase58?.() ??
            (typeof ix.programId === 'string' ? ix.programId : ix.programId?.toBase58?.());

        if (programId !== AGENT_PROGRAM_ID) continue;

        let discriminator = null;
        let dataHex = null;
        let dataLen = 0;

        if (ix.data) {
            const raw = bs58.decode(ix.data);
            discriminator = toHex(raw.slice(0, 8));
            dataHex = toHex(raw);
            dataLen = raw.length;
        }

        const ixAccounts = ix.accounts ?? [];
        result.instructions.push({
            programId,
            discriminator,
            dataLen,
            dataHex,
            accountCount: ixAccounts.length,
            accounts: ixAccounts.map(idx => ({
                index: idx,
                pubkey: keys[idx]?.pubkey?.toBase58() ?? `[${idx}]`,
                signer: keys[idx]?.signer ?? false,
                writable: keys[idx]?.writable ?? false,
            })),
        });
    }

    // Analyze inner instructions (CPI events)
    if (tx.meta?.innerInstructions) {
        for (const innerSet of tx.meta.innerInstructions) {
            for (const ix of innerSet.instructions) {
                const programId = typeof ix.programId === 'string'
                    ? ix.programId
                    : ix.programId?.toBase58?.() ?? keys[ix.programIdIndex]?.pubkey?.toBase58?.();

                if (!ix.data) continue;

                const raw = bs58.decode(ix.data);
                result.innerInstructions.push({
                    ixIndex: innerSet.index,
                    programId,
                    discriminator: toHex(raw.slice(0, 8)),
                    dataLen: raw.length,
                    dataHex: toHex(raw),
                });
            }
        }
    }

    if (rawMode) {
        result._raw = tx;
    }

    return result;
}

async function main() {
    console.log(`\n=== Tokenized Agent Discovery ===`);
    console.log(`Program: ${AGENT_PROGRAM_ID}`);
    console.log(`Fetching last ${limit} signatures...\n`);

    const sigs = await connection.getSignaturesForAddress(
        new PublicKey(AGENT_PROGRAM_ID),
        { limit }
    );

    console.log(`Found ${sigs.length} signatures\n`);

    // Track unique discriminators
    const discriminatorMap = new Map(); // discriminator hex → {count, accounts, dataLens}
    const signerSet = new Set();
    const programSet = new Set([AGENT_PROGRAM_ID]);

    for (let i = 0; i < sigs.length; i++) {
        const sig = sigs[i];
        console.log(`[${i + 1}/${sigs.length}] ${sig.signature.slice(0, 20)}...`);

        const result = await analyzeTransaction(sig);
        if (!result) {
            console.log('  → null (not yet confirmed)\n');
            continue;
        }

        for (const ix of result.instructions) {
            const disc = ix.discriminator;
            if (!discriminatorMap.has(disc)) {
                discriminatorMap.set(disc, { count: 0, exampleAccounts: ix.accounts, dataLens: new Set() });
            }
            const entry = discriminatorMap.get(disc);
            entry.count++;
            entry.dataLens.add(ix.dataLen);

            // Track signers
            for (const acc of ix.accounts) {
                if (acc.signer) signerSet.add(acc.pubkey);
            }

            console.log(`  → Discriminator: ${disc} | accounts: ${ix.accountCount} | data: ${ix.dataLen} bytes`);
            if (ix.accounts.length > 0) {
                console.log(`     Accounts:`);
                for (const acc of ix.accounts) {
                    const flags = [acc.signer ? 'SIGNER' : '', acc.writable ? 'WRITABLE' : ''].filter(Boolean).join('+');
                    console.log(`       [${acc.index}] ${acc.pubkey} ${flags ? `(${flags})` : ''}`);
                }
            }
        }

        if (result.innerInstructions.length > 0) {
            console.log(`  Inner instructions (${result.innerInstructions.length}):`);
            for (const inner of result.innerInstructions) {
                // Collect CPI program IDs
                if (inner.programId !== AGENT_PROGRAM_ID) programSet.add(inner.programId);
                console.log(`    CPI → ${inner.programId.slice(0, 16)}... disc=${inner.discriminator} len=${inner.dataLen}`);
            }
        }
        console.log();
    }

    console.log('\n=== SUMMARY ===\n');
    console.log('Unique discriminators found:');
    for (const [disc, entry] of discriminatorMap) {
        console.log(`  ${disc} — ${entry.count} tx, data sizes: [${[...entry.dataLens].join(', ')}] bytes`);
        console.log(`  Example accounts (${entry.exampleAccounts.length}):`);
        for (const acc of entry.exampleAccounts) {
            const flags = [acc.signer ? 'SIGNER' : '', acc.writable ? 'WRITABLE' : ''].filter(Boolean).join('+');
            console.log(`    [${acc.index}] ${acc.pubkey} ${flags ? `(${flags})` : ''}`);
        }
        console.log();
    }

    console.log('Signers observed:');
    for (const s of signerSet) console.log(`  ${s}`);

    console.log('\nCPI programs involved:');
    for (const p of programSet) console.log(`  ${p}`);
}

main().catch(console.error);
