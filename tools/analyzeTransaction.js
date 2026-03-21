#!/usr/bin/env node

/**
 * analyzeTransaction.js — Deep analysis of a single Agent transaction.
 *
 * Dumps all accounts (with signer/writable flags), instruction data (hex),
 * and all inner instruction data for full reverse engineering.
 *
 * Usage:
 *   node tools/analyzeTransaction.js <signature>
 *   node tools/analyzeTransaction.js --latest     # analyze most recent tx
 */

import 'dotenv/config';
import { connection } from '../utils/rpc.js';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { AGENT_PROGRAM_ID } from '../utils/constants.js';

function toHex(bytes) {
    return Buffer.from(bytes).toString('hex');
}

function hexDump(bytes, label) {
    console.log(`\n  ${label} (${bytes.length} bytes):`);
    // Print in groups of 8 bytes with offset
    for (let i = 0; i < bytes.length; i += 8) {
        const chunk = bytes.slice(i, i + 8);
        const hex = [...chunk].map(b => b.toString(16).padStart(2, '0')).join(' ');
        const offset = i.toString(16).padStart(4, '0');
        console.log(`    ${offset}: ${hex.padEnd(23)} | ${[...chunk].map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('')}`);
    }
}

async function main() {
    const args = process.argv.slice(2);
    let signature;

    if (args.includes('--latest') || args.length === 0) {
        console.log(`Fetching latest tx for ${AGENT_PROGRAM_ID}...`);
        const sigs = await connection.getSignaturesForAddress(
            new PublicKey(AGENT_PROGRAM_ID), { limit: 1 }
        );
        if (!sigs.length) { console.log('No transactions found'); return; }
        signature = sigs[0].signature;
        console.log(`Using: ${signature}\n`);
    } else {
        signature = args[0];
    }

    const tx = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
    });

    if (!tx) { console.log('Transaction not found'); return; }

    const accountKeys = tx.transaction.message.accountKeys;

    console.log(`=== Transaction ${signature} ===`);
    console.log(`Slot: ${tx.slot} | Block time: ${new Date(tx.blockTime * 1000).toISOString()}`);
    console.log(`Fee payer: ${accountKeys[0].pubkey.toBase58()} (always signer)`);
    console.log(`Error: ${tx.meta?.err ? JSON.stringify(tx.meta.err) : 'none'}`);

    console.log(`\n--- All Account Keys (${accountKeys.length}) ---`);
    accountKeys.forEach((k, i) => {
        const flags = [k.signer ? 'SIGNER' : '', k.writable ? 'WRITABLE' : ''].filter(Boolean).join('+');
        console.log(`  [${i.toString().padStart(2)}] ${k.pubkey.toBase58()} ${flags ? `(${flags})` : ''}`);
    });

    console.log(`\n--- Outer Instructions ---`);
    for (const ix of tx.transaction.message.instructions) {
        // In getParsedTransaction, PartiallyDecodedInstruction has programId as PublicKey
        const programId = ix.programId?.toBase58?.() ?? ix.programId;
        const isAgent = programId === AGENT_PROGRAM_ID;

        console.log(`\n  Program: ${programId}${isAgent ? ' ← AGENT' : ''}`);

        if (ix.data) {
            const raw = bs58.decode(ix.data);
            console.log(`  Discriminator: ${toHex(raw.slice(0, 8))}`);
            hexDump(raw, 'Raw data');
        }

        if (ix.accounts) {
            console.log(`  Accounts (${ix.accounts.length}):`);
            ix.accounts.forEach((pubkey, i) => {
                const pkStr = pubkey?.toBase58?.() ?? pubkey.toString();
                // Look up signer/writable flags from accountKeys
                const keyInfo = accountKeys.find(k => k.pubkey.toBase58() === pkStr);
                const flags = keyInfo ? [keyInfo.signer ? 'SIGNER' : '', keyInfo.writable ? 'WRITABLE' : ''].filter(Boolean).join('+') : '?';
                console.log(`    [${i}] ${pkStr} ${flags ? `(${flags})` : ''}`);
            });
        }
    }

    console.log(`\n--- Inner Instructions ---`);
    if (!tx.meta?.innerInstructions?.length) {
        console.log('  None');
    } else {
        for (const innerSet of tx.meta.innerInstructions) {
            console.log(`\n  For outer instruction [${innerSet.index}]:`);
            for (let j = 0; j < innerSet.instructions.length; j++) {
                const ix = innerSet.instructions[j];
                const programId = ix.programId?.toBase58?.() ?? ix.programId;
                console.log(`\n    [${j}] Program: ${programId}`);

                if (ix.data) {
                    const raw = bs58.decode(ix.data);
                    console.log(`    Discriminator: ${toHex(raw.slice(0, 8))}`);
                    hexDump(raw, 'Raw data');

                    // If this looks like an Anchor event (discriminator e445a52e51cb9a1d), show subarray(16) too
                    if (toHex(raw.slice(0, 8)) === 'e445a52e51cb9a1d') {
                        console.log(`    → Anchor event payload (subarray(8), len=${raw.length - 8}):`);
                        hexDump(raw.slice(8), 'Event payload');
                    }
                }

                if (ix.accounts) {
                    console.log(`    Accounts (${ix.accounts.length}):`, ix.accounts.map(p => {
                        const s = p?.toBase58?.() ?? p.toString();
                        return s.slice(0, 12) + '...';
                    }).join(', '));
                }
            }
        }
    }

    // Log balance changes
    if (tx.meta?.preBalances && tx.meta?.postBalances) {
        console.log(`\n--- SOL Balance Changes ---`);
        for (let i = 0; i < accountKeys.length; i++) {
            const delta = tx.meta.postBalances[i] - tx.meta.preBalances[i];
            if (delta !== 0) {
                const sign = delta > 0 ? '+' : '';
                console.log(`  ${accountKeys[i].pubkey.toBase58()} ${sign}${(delta / 1e9).toFixed(9)} SOL`);
            }
        }
    }
}

main().catch(console.error);
