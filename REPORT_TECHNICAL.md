# Rapport Technique — Pump.fun Tokenized Agent
> Reverse engineering complet du programme `AgenTMiC2hvxGebTsgmsD4HHBa8WEcqGFf87iwRRxLo7`
> Date : 2026-03-21

---

## 1. Vue d'ensemble

Le **Tokenized Agent** est un mécanisme de buyback automatisé déployé par Pump.fun. Son rôle : permettre à un token créé sur Pump.fun de racheter automatiquement ses propres tokens (et éventuellement les brûler) à intervalle régulier, financé par un vault SOL alimenté par les achats d'utilisateurs.

Ce n'est **pas** une IA autonome — c'est un programme on-chain (Anchor) + un bot off-chain (le "crank").

---

## 2. Adresses clés

| Rôle | Adresse |
|------|---------|
| **Agent Program** | `AgenTMiC2hvxGebTsgmsD4HHBa8WEcqGFf87iwRRxLo7` |
| **Agent Global State** | `ALeLWphFxNVNXpXFEC4Ssf2Jan1Wki72Us8tXMMrQuQZ` |
| **Agent Event Authority** | `HcAR1LpgSGFxeLyb1vkhsCuN6AtxQsww3E2pMMXkwHqx` |
| **Buyback Crank (bot)** | `GmFrDZT2cdrqykgTikVdXbe8EtCgzUDM9VsDhQnwsUsG` |
| **Pump.fun Program** | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| **pAMM Program (post-grad)** | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` |
| **pfee Program** | `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` |

---

## 3. Structures de données on-chain

### 3.1 AgentConfig (75 bytes) — disc `88f1f2d9ad4d70ba`
**28 479 comptes** — un par token agent

```
offset 0x00 (8)  : discriminator = 88f1f2d9ad4d70ba
offset 0x08 (1)  : bump (u8) — PDA bump seed
offset 0x09 (32) : mint — adresse du token pump.fun
offset 0x29 (32) : fee_recipient — wallet qui reçoit les tokens rachetés
                   (= burn111111111111111111111111111111111111111 pour burn total, ou adresse spécifique)
offset 0x49 (2)  : buyback_bps (u16 LE) — % du SOL utilisé pour le buyback
                   (5000 = 50%, 10000 = 100% = burn intégral)
```

**Statistiques observées (28 479 tokens)** :
- 58% : `bps=10000`, `fee_recipient=burn111111111111111111111111111111111111111` → 100% brûlés
- 16% : `bps=5000` → 50% brûlés, 50% envoyés à un wallet
- 0.6% : `bps=0` → buyback désactivé

### 3.2 AgentBuybackVault (104 bytes) — disc `e1c351e3732b19b1`
**4 342 comptes** — uniquement pour les agents actifs (avec vault SOL)

```
offset 0x00 (8)  : discriminator = e1c351e3732b19b1
offset 0x08 (1)  : bump (u8)
offset 0x09 (32) : mint — adresse du token
offset 0x29 (32) : currency_mint — So11111111111111111111111111111111111111112 (wSOL, 96%) ou EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v (USDC, 4%)
offset 0x49 (8)  : u64_pending — SOL en attente de déploiement (lamports)
offset 0x51 (8)  : u64_lifetime_spent — SOL total dépensé en buybacks (lamports)
offset 0x59 (8)  : u64_reserved — réservé / dernière distribution
offset 0x61 (8)  : u64_volume — volume de trading cumulatif (lamports)
```

**Agent le plus actif** : mint `5QmbJw7mM6tcCdXVy8ftc2bu8izded7Etc57TMA2pump`
- Lifetime buybacks : **857.6 SOL**
- Volume trading : **167 591 SOL**

### 3.3 Global State (401 bytes) — disc `95089ccaa0fcb0d9`
**1 compte unique** (`ALeLWphFxNVNXpXFEC4Ssf2Jan1Wki72Us8tXMMrQuQZ`)

```
offset 0x00 (8)   : discriminator
offset 0x08 (32)  : admin = J9jp8gnPXYjJ7BbJSpqH4AZPtu3YAve3GRQuajnVL3Dj
offset 0x28 (32)  : treasury = CWBSo8QAX3BvaX5iLnfttXPRsgqcwX6iL7c88w9hRctb
offset 0x48 (32)  : crank_or_authority = 5F2XfaTpJgByjaaP3nn8QNxQJcbZUrR7neRwiHYhQgej
offset 0x68 (255) : reserved (zeros)
offset 0x188 (8)  : total_agents_created = 28 477
offset 0x190 (1)  : trailing byte
```

---

## 4. Instructions du programme

### 4.1 InitializeAgent — `b4f8a308315e7e60` (42 bytes, 8 comptes)
Appelée lors de la création du token. Crée les PDAs AgentConfig et AgentBuybackVault.

**Payload (34 bytes après discriminateur)** :
```
bytes 0-31  : fee_recipient (pubkey) — wallet destinataire des tokens rachetés
bytes 32-33 : buyback_bps (u16 LE)
```

**Comptes** :
- [0] Créateur du token (SIGNER+WRITABLE)
- [1] Bonding curve du token (WRITABLE)
- [2] AgentConfig PDA (WRITABLE, créé ici)
- [3-4] Autres PDAs
- [5] Agent Global State
- [6] Agent Event Authority
- [7] Agent Program

### 4.2 Deposit — `912cf62fc0cc5f20` (8 bytes, 15 comptes)
Dépose du SOL dans le vault du token. Appelée par n'importe qui (permissionless).

**Payload** : aucun (8 bytes = discriminateur uniquement)

**Comptes** :
- [0] Déposant (SIGNER+WRITABLE)
- [1] Agent Global State
- [2] wSOL mint
- [3] AgentConfig PDA (WRITABLE)
- [4] AgentBuybackVault PDA (WRITABLE)
- [5-6] SOL vault keypairs (WRITABLE)
- [7-9] Token accounts (WRITABLE)
- [10-13] Programs (Token, ATA, System)
- [14] Agent Event Authority

### 4.3 CloseWSOL/UnwrapSOL — `27ced6a7372cdd51` (8 bytes, 2 comptes)
Ferme un compte wSOL temporaire, retournant les lamports au vault. Appelée uniquement par le crank.

**Comptes** :
- [0] AgentConfig PDA (WRITABLE)
- [1] SOL vault token account (WRITABLE)

### 4.4 Buyback — `5fe7c102f54b7d9b` (37 bytes, 33-40 comptes)
L'instruction principale. Achète des tokens sur Pump.fun/pAMM et les envoie au `fee_recipient` (ou les brûle).

**Payload (29 bytes après discriminateur)** :
```
bytes 0-3   : len (u32 LE) = 25 — longueur des données CPI pump.fun embarquées
bytes 4-11  : pump_buy_discriminator = 66063d1201daebea (hardcodé)
bytes 12-19 : token_amount (u64 LE) — nombre de tokens à acheter
bytes 20-27 : max_sol_cost (u64 LE) — slippage cap en lamports
bytes 28    : flag (bool) = 0x01
```

**Flux de la transaction** (3 instructions dans le même tx) :
```
1. CloseWSOL (27ced6a7372cdd51) — unwrap le wSOL du cycle précédent
2. Deposit    (912cf62fc0cc5f20) — re-dépose le SOL accumulé
3. Buyback    (5fe7c102f54b7d9b) — achète les tokens via CPI → pump.fun / pAMM
```

**CPIs internes du Buyback** :
1. SPL Token ops (sync, transfer, approve)
2. Agent Anchor event `e445a52e51cb9a1d` — log "Deposit" event (106 bytes)
3. Pump.fun `buy` CPI disc `66063d1201daebea` — achat réel sur la bonding curve
4. pfee program `e7257e55cf5b3f34` — paiement priority fee
5. Token-2022 transfer — envoi des tokens achetés au vault
6. System transfers — routing des fees
7. Pump.fun Trade event `e445a52e51cb9a1d` — event log pump (290 bytes)
8. Agent Buyback event `e445a52e51cb9a1d` — event log agent (152 bytes)

**Deux chemins AMM** :
- **33 comptes** : token sur bonding curve Pump.fun (pré-graduation)
- **40 comptes** : token sur pAMM Raydium (post-graduation)

### 4.5 Admin/Config — `291c765a35183fa0` (8-10 bytes, 7 comptes)
Instruction admin rare. Implique le Global State et l'Event Authority. Probablement `UpdateGlobalConfig` ou `SetCrank`.

---

## 5. Structure des fees dans un buyback

Pour un buyback de ~0.134 SOL :

| Destinataire | Montant | Rôle |
|-------------|---------|------|
| `Fb68236fek5ZbBRp9xSiAcEFWRz7rqA1gm1Xnj7mjtfn` | ~0.00134 SOL | Pump.fun fee (1% du trade) |
| `9rPYyANsfQZw3DnDmKE3YCQF5E8oD89UXoHn9JFEhJUz` | ~0.000804 SOL | Creator fee (0.6% pump standard) |
| `BPLNkQyBGn1CVdFL2yRayrgWgHbaVbcvHfDBQJL5rxBg` | ~0.002 SOL | Protocol fee (Pump.fun agent fee) |
| `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` | variable | Priority fee / gas |
| `ByujNrSJuRYCpTWa2Ydw5dpJjZidT17tbLanPpQsyJSV` | variable | Jito tip (optionnel) |

---

## 6. Timing des buybacks — Est-ce déterministe ?

**Réponse : NON. Le timing n'est pas stocké on-chain.**

Les comptes AgentConfig (75 bytes) et AgentBuybackVault (104 bytes) ne contiennent **aucun champ timestamp** (ni `lastBuybackAt`, ni `nextBuybackAt`, ni `buybackInterval`).

Les buybacks sont déclenchés par un **crank off-chain** (`GmFrDZT2cdrqykgTikVdXbe8EtCgzUDM9VsDhQnwsUsG`) qui :
1. Scanne périodiquement tous les AgentBuybackVault
2. Déclenche un buyback quand `u64_pending > seuil_minimum`
3. Opère sur un cycle approximatif de **15 / 45 / 90 minutes** selon l'activité du token

Les gaps observés entre buybacks : 15 min (tokens très actifs), 45-90 min (tokens modérés), plusieurs heures (tokens peu actifs).

**Le SOL accumulé** dans `u64_pending` est la variable déclenchante — pas un timer.

---

## 7. Modèle d'autorisation

| Instruction | Qui peut appeler ? | Vérification on-chain |
|-------------|---------------------|----------------------|
| InitializeAgent | Créateur du token (via Pump.fun) | Oui — contexte de création |
| Deposit | N'importe qui | Probablement non — permissionless |
| CloseWSOL | Crank uniquement | Oui — vérifie le fee payer contre global state |
| Buyback | Crank uniquement | Oui — `global_state.crank == account[0].key` |
| Admin | Admin uniquement | Oui — `global_state.admin == signer` |

---

## 8. Flux complet d'un achat utilisateur → buyback

```
1. User achète un token "AGENT" sur pump.fun
   → 1% fee va au protocole pump.fun
   → Une portion de cette fee est routée vers le AgentBuybackVault du token

2. AgentBuybackVault.u64_pending accumule

3. Le crank (GmFrDZT2cdrqykgTikVdXbe8EtCgzUDM9VsDhQnwsUsG) détecte que pending > seuil
   → Il construit une transaction avec 3 instructions :
     a. CloseWSOL — unwrap cycle précédent
     b. Deposit   — réencaisse le SOL
     c. Buyback   — achète les tokens

4. Le buyback fait un CPI vers pump.fun (buy instruction)
   → Les tokens achetés vont dans un vault token account

5. Les tokens sont transférés vers fee_recipient :
   → Si fee_recipient = burn111111111111111111111111111111111111111 → burn total
   → Sinon → 50% burn + 50% envoyé au wallet désigné

6. L'état est mis à jour :
   → u64_lifetime_spent += SOL dépensé
   → u64_pending = 0
   → AgentConfig.fee_recipient reste burn111... (état final)
```

---

## 9. Inventaire des comptes

| Type | Nombre | SOL total | Taille |
|------|--------|-----------|--------|
| AgentConfig | 28 479 | ~198 SOL | 75 bytes |
| AgentBuybackVault | 4 342 | ~7 SOL | 104 bytes |
| GlobalState | 1 | ~0.004 SOL | 401 bytes |
| **Total** | **32 822** | **~205 SOL** | — |

3 buybacks actuellement en attente (>0.3 SOL chacun) identifiés dans les PDAs.
