# Rapport d'Expériences — Tokenized Agent Reverse Engineering
> Toutes les pistes explorées, résultats et conclusions
> Date : 2026-03-21

---

## Expérience 1 : Discovery du programme

### Hypothèse
Le programme Tokenized Agent a un prefix vanity similaire à Mayhem (`MAyh`).

### Méthode
Recherche via Helius RPC et transactions pump.fun récentes.

### Résultat
Programme trouvé directement : **`AgenTMiC2hvxGebTsgmsD4HHBa8WEcqGFf87iwRRxLo7`** (prefix `Agen`).

---

## Expérience 2 : Discovery des discriminateurs

### Méthode
`tools/discoverAgent.js --limit=50` — récupère les 50 dernières transactions du programme et log les discriminateurs (8 premiers bytes de chaque instruction).

### Résultats

| Discriminateur | Bytes | Comptes | Identifié comme |
|---------------|-------|---------|----------------|
| `b4f8a308315e7e60` | 42 | 8 | **InitializeAgent** |
| `912cf62fc0cc5f20` | 8 | 15 | **Deposit** |
| `27ced6a7372cdd51` | 8 | 2 | **CloseWSOL** |
| `5fe7c102f54b7d9b` | 37 | 33-40 | **Buyback** |
| `291c765a35183fa0` | 10 | 7 | **Admin/Config** |

### Erreur initiale
Le premier script `discoverAgent.js` traitait les `ix.accounts` comme des index (arrays d'entiers) alors que `getParsedTransaction` retourne des `PublicKey[]` directement. Corrigé dans `analyzeTransaction.js` via un `.find()` sur la table des account keys.

---

## Expérience 3 : Identification du wallet "bot"

### Hypothèse
`E8K852D7FiLw2AKq6NwKe4htQoKQtwLpYoBSxHRBy3Nw` est le wallet d'exécution des buybacks.

### Méthode
Analyse des transactions récentes pour trouver le fee payer récurrent.

### Résultat : INCORRECTE
`E8K852D7FiLw2AKq6NwKe4htQoKQtwLpYoBSxHRBy3Nw` exécute des opérations Mayhem Mode + CreateV2 — ce n'est PAS le crank agent.

Le vrai crank est **`GmFrDZT2cdrqykgTikVdXbe8EtCgzUDM9VsDhQnwsUsG`** (13.94 SOL, wallet régulier, signe 100% des transactions agent analysées).

---

## Expérience 4 : Décodage de BGqnrzV8Hy4JJokDS2BFLmW8hnBeidUfgvZRb1ytuPgY

### Contexte
L'utilisateur signalait que cette adresse était "un wallet créé par le contrat agent qui stocke de la data et des fonds".

### Méthode
Lecture du compte via `getAccountInfo`, hex dump complet, décodage champ par champ.

### Résultat
C'est un PDA **AgentConfig** (75 bytes), propriété du programme agent.

**Décodage complet** :
```
disc    (8) = 88f1f2d9ad4d70ba
bump    (1) = 255
mint   (32) = 3Paziz9uAV1rdy9FtwF5g1syjP5mci9FMsZ6oPHgpump
addr2  (32) = 2hn1e1YJ2YxSpbdbz97Qvc3vhvK5TQVcmWeFW6Q2rjzW
bps     (2) = 5000 (50%)
```

Le compte contient **uniquement de la configuration**, pas de SOL significatif (juste le rent minimum ~0.00141 SOL). Les fonds réels sont dans des vault keypairs séparés.

---

## Expérience 5 : Décodage du Global State (401 bytes)

### Méthode
`getAccountInfo('ALeLWphFxNVNXpXFEC4Ssf2Jan1Wki72Us8tXMMrQuQZ')` + hex dump.

### Résultat
Structure décodée :
- Admin wallet : `J9jp8gnPXYjJ7BbJSpqH4AZPtu3YAve3GRQuajnVL3Dj`
- Treasury : `CWBSo8QAX3BvaX5iLnfttXPRsgqcwX6iL7c88w9hRctb`
- 255 bytes réservés (zeros)
- Total agents créés : **28 477**

---

## Expérience 6 : Inventaire complet via getProgramAccounts

### Méthode
`getProgramAccounts(AGENT_PROGRAM_ID)` sans filtre — retourne tous les comptes propriété du programme.

### Résultat
- **32 822 comptes** au total
- **~205 SOL** verrouillés dans les PDAs
- 3 types distincts identifiés par discriminateur

### Insight clé
Les comptes avec plus de 0.3 SOL sont des agents en attente de buyback — détectables en temps réel via cette requête.

---

## Expérience 7 : Le timing est-il déterministe ?

### Question
Est-ce que le prochain buyback est calculable depuis les données on-chain ?

### Méthode
1. Analyse de tous les champs des comptes AgentConfig et AgentBuybackVault
2. Recherche de valeurs ressemblant à des timestamps Unix (>1 700 000 000)
3. Observation des gaps entre transactions buyback pour un agent actif

### Résultat : NON — timing non déterministe
- **Aucun champ timestamp** dans aucun type de compte
- Le crank off-chain surveille `u64_pending` et déclenche quand le seuil est atteint
- Gaps observés : 15 min / 45 min / 90 min selon l'activité (pattern off-chain non previsible)

### Conclusion
On peut prédire **l'ordre de grandeur** (token actif → buyback dans les 15-30 min), mais pas le moment exact. Le timing dépend d'une logique off-chain dans le bot de Pump.fun.

---

## Expérience 8 : PDA seed brute-force

### Méthode
Test de 20+ patterns de seeds pour reproduire l'adresse `BGqnrzV8Hy4JJokDS2BFLmW8hnBeidUfgvZRb1ytuPgY` depuis son mint :
- `["agent", mint]`
- `["agent-state", mint]`
- `["tokenized-agent", mint]`
- `["agent_state", mint]`
- `["state", mint]`
- `[mint]`
- Et combinaisons avec creator wallet

### Résultat : INCONNU
Aucun pattern testé ne reproduit l'adresse correcte. Les seeds probablement incluent :
- Le wallet du créateur
- Un nonce ou compteur interne
- Un identifiant spécifique à la plateforme

---

## Expérience 9 : Analyse du modèle d'autorisation

### Question
Quelqu'un d'autre que le crank peut-il déclencher un buyback ?

### Méthode
1. Analyse de 30+ transactions buyback — qui signe ?
2. Vérification des comptes non-writable dans l'instruction (dont le global state)
3. Recherche de transactions buyback failées signées par des wallets inconnus

### Résultat : Autorisation stricte
- 30/30 transactions signées exclusivement par `GmFrDZT2cdrqykgTikVdXbe8EtCgzUDM9VsDhQnwsUsG`
- Le Global State est passé comme compte non-writable (lecture seule) → utilisé pour vérifier le signer
- Aucune tentative d'usurpation trouvée dans les transactions échouées
- **Verdict** : Le buyback est protégé. Un attaquant ne peut pas déclencher de buyback.

---

## Expérience 10 : Exploitation — Front-run des buybacks

### Vecteur
Acheter le token juste avant le buyback du crank, vendre après.

### Signal détectable
Via `getProgramAccounts` : trouver les AgentBuybackVault avec `u64_pending > seuil`.

### Analyse de faisabilité

**Avantages** :
- Signal on-chain visible en temps réel (le montant pending est dans le compte)
- Impact prix prévisible (AMM constant-product)

**Obstacles** :
- Le crank utilise probablement des **Jito bundles** (atomique, impossible à front-run entre les slots)
- Même si le buyback est lisible, le crank peut inclure un tip Jito pour garantir l'inclusion en tête de bloc
- Le `max_sol_cost` dans le payload est le montant max — l'achat réel peut être inférieur

**Verdict** : MEDIUM — faisable sur les petits tokens (bonding curve phase 1) sans Jito, difficile sur les gros tokens.

**Profit estimé** :
- Buyback de 0.5 SOL sur phase 1 = ~15% price impact
- Front-buy 0.1 SOL → gain ~0.01-0.02 SOL par événement
- Viable seulement sur tokens avec buybacks fréquents et sans protection MEV

---

## Expérience 11 : Exploitation — Slippage Griefing

### Vecteur
Acheter le token juste avant le buyback pour faire échouer l'instruction avec une erreur de slippage.

### Mécanisme
Le buyback encode `max_sol_cost` (slippage cap) dans ses 37 bytes de payload. Si le prix du token augmente (via un achat avant), le nombre de tokens obtenables pour ce SOL diminue. Si le prix monte assez, le buyback échoue (`SlippageExceeded`).

### Résultat
**Faisabilité : HAUTE** pour les petits tokens (phase 1, faibles réserves).

**Effet** :
- Le SOL reste bloqué dans `u64_pending` du vault
- Le crank retente au prochain cycle (15-90 min plus tard)
- Si le griefing est répété : accumulation d'un backlog important

**Profit pour l'attaquant** :
- L'attaquant achète puis revend (round-trip ~1-2% de frais)
- Pertes négligeables si le prix revient après le buyback raté

**Limites** :
- Si le crank utilise Jito bundles : le griefing nécessite d'être dans le même bloc → très coûteux
- Le crank peut ajuster `max_sol_cost` dynamiquement → mitigation possible côté Pump.fun

---

## Expérience 12 : Exploitation — Récupération de fonds des PDAs

### Vecteur
Les PDAs du programme contiennent ~205 SOL au total. Peut-on les drainer ?

### Analyse
1. Les PDAs sont propriété du programme agent (`AgenTMiC2hvxGebTsgmsD4HHBa8WEcqGFf87iwRRxLo7`)
2. Seul le programme peut déplacer le SOL de ses PDAs (règle fondamentale Solana)
3. Les instructions trouvées (Deposit, Buyback, CloseWSOL) transfèrent toujours vers des destinations fixées par le programme

**Verdict** : IMPOSSIBLE sans contrôle du programme. Les PDAs ne peuvent être drainées que via une instruction qui le permet, et aucune instruction permissionless de withdrawal n'a été identifiée.

**Exception** : Le SOL dans les vault keypairs RÉGULIERS (non-PDA, ex: `s6iy4y9aZRKXENuwFdg2qCn2fptLSEUmeLBXR23u8d7`) n'est pas protégé by-design — mais c'est le SOL du créateur, et ces wallets semblent être des one-time addresses.

---

## Expérience 13 : Analyse de la Deposit instruction

### Question
La Deposit instruction est-elle vraiment permissionless ? Peut-on abuser d'elle ?

### Observation
- Au moins 4 wallets différents ont appelé Deposit (adresses partielles capturées — full recovery nécessite re-fetch : `4uKEpD66...`, `GmFrDZT2cdrqykgTikVdXbe8EtCgzUDM9VsDhQnwsUsG`, `bwamJzzt...`, `D62HTTnw...`)
- Confirme : permissionless pour le dépôt
- Le déposant paie ~0.017 SOL par dépôt (création de comptes + fees)

### Vecteur potentiel : Donation malicieuse
Un attaquant pourrait déposer du SOL dans le vault d'un token *concurrent* pour déclencher des buybacks accélérés et manipuler son prix. Mais c'est un avantage pour le token, pas un exploit.

**Verdict** : La Deposit instruction ne présente pas de vecteur d'exploitation évident.

---

## Expérience 14 : Analyse des wallets `addr2` (champ dans AgentConfig)

### Contexte
Le champ `addr2` (offset 41, 32 bytes) dans les AgentConfig contient une adresse.

### Observation
- Seulement **5 valeurs uniques** sur 32 815 comptes
- Dont `burn111111111111111111111111111111111111111` (58% = burn total)
- Les 4 autres sont des wallets avec des soldes significatifs :
  - `78N177fzNJpp8pG49xDv1efYcTMSzo9tPTKEA9mAVkh2` : **558 SOL**
  - `67oaJaaqLmgrx8rvxuy3ZsCn4hfCdyqoBNoSbSyCwSPQ` : 1.39 SOL
  - `GhMTEMJA1dRs3kpZn4psuogRkpYB27Eay4CZURwSknnR` : 0.046 SOL

### Conclusion
`addr2` n'est **pas** le wallet du créateur du token — il y a seulement 5 valeurs uniques sur 28 479 tokens. Ce sont des wallets de la plateforme (tiers partenaires ou fee recipients de Pump.fun).

---

## Résumé des vecteurs d'exploitation

| Vecteur | Faisabilité | Profit | Difficulté |
|---------|-------------|--------|------------|
| Front-run buyback | MOYENNE | 0.01-0.02 SOL/event | Élevée (Jito) |
| Slippage griefing | HAUTE | Indirect (concurrents) | Faible |
| Drain des PDAs | IMPOSSIBLE | — | — |
| Buyback non autorisé | IMPOSSIBLE | — | — |
| Donation malicieuse | LÉGALE | Indirect | Faible |
| Achat avant gros buybacks prévisibles | MOYENNE | Variable | Élevée |

---

## Conclusions

### Ce qui fonctionne (exploitation légale/éthique)
1. **Monitoring des vaults** : `getProgramAccounts` en temps réel pour identifier les gros buybacks imminents
2. **Front-buying** sur tokens sans protection MEV : acheter avant un buyback détectable, vendre après
3. **Détection de tokens avec buybacks réguliers** : tokens à fort `u64_lifetime_spent` = bonne activité, price support naturel

### Ce qui ne fonctionne pas
1. Drain direct des PDAs → impossible (restriction Solana)
2. Appel non autorisé du buyback → rejeté on-chain
3. Prédire le moment exact du prochain buyback → timing off-chain non exposé

### Le vrai avantage informationnel
La donnée la plus précieuse est **`u64_lifetime_spent`** dans les AgentBuybackVault. Un token avec 857 SOL de buybacks cumulatifs a un support de prix structurel très fort — c'est une donnée que peu de traders lisent on-chain.

---

## Fichiers créés

| Fichier | Description |
|---------|-------------|
| `tools/discoverAgent.js` | Discovery des discriminateurs |
| `tools/analyzeTransaction.js` | Analyse deep d'une transaction |
| `utils/constants.js` | Program IDs et adresses connues |
| `utils/rpc.js` | Connexion Helius |
| `REPORT_TECHNICAL.md` | Ce rapport technique |
| `REPORT_EXPERIMENTS.md` | Ce rapport d'expériences |
