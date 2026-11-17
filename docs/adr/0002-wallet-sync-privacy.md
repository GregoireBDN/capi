# ADR 0002 — Reading self-custody wallets from public endpoints

- **Status**: Accepted
- **Date**: 2026-11-14
- **Issue**: #129 (milestone M10 Everyday use)

## Context

Wallet crypto accounts (#127) keep the wallet's public keys: Bitcoin extended public keys (xpub / ypub / zpub), single Bitcoin addresses (`1…`, `3…`, `bc1q…`, `bc1p…`, #248) and EVM `0x` addresses. Their balances are public on chain, so the app can read them instead of asking for exports or typed quantities. But reading the chain means asking someone who has it:

- an **extended public key** reveals every address of the account, past and future, hence its whole history and balance;
- an **address** reveals that address's history; sending several addresses from the same IP in the same minutes lets the endpoint cluster them as one owner;
- the requests come from the **VPS**, whose IP can then be linked to the wallets by the endpoint operator (and by anyone it shares logs with).

Running a Bitcoin full node + Esplora and an EVM node for six chains is out of proportion for one user on a small VPS (hundreds of GB of disk, constant upkeep).

## Decision

1. **Sync is opt-in.** `WALLET_SYNC_ENABLED` defaults to `false`: no chain endpoint is even constructed and nothing is sent; wallet accounts are filled by hand, like manual ones. The owner turns it on knowingly, after reading this ADR.
2. **Keys never leave the server.** Addresses are derived from the extended keys on the server (`@scure/bip32`, BIP44 / 49 / 84, receive and change branches, gap limit 20). Only addresses go out, never the xpub, which would hand over the whole account at once. The address type comes from the key's prefix for `ypub` / `zpub`, and is chosen by the owner for an `xpub` (Ledger Live exports `xpub` for every account type; default native SegWit), or detected (#248): the first receive address of each type (legacy, nested SegWit, native SegWit) is sent once, and the types with history are stored on the key. A single address saved by the owner is sent as it is (no derivation).
3. **Only what the call needs.** Esplora (`GET /address/:address`) receives one address per request; EVM JSON-RPC (`eth_chainId`, `eth_getBalance`, `eth_call balanceOf`) receives the address and token contracts. Never an account name, label, other account, amount or the owner's identity. Token contracts and decimals are looked up from the price provider (CoinGecko `coins/:id`), which receives only the asset id.
4. **Key-less public endpoints by default, self-hosting possible.** Defaults: `mempool.space/api` (Esplora) and publicnode.com JSON-RPC (no account, no API key, privacy-focused). `ESPLORA_URL` and `EVM_RPC_URLS` (per chain id) point at one's own instances, and a chain can be turned off.
5. **Nothing sensitive in logs.** The sync logs the failure reason or the number of synced lines only: never a key, an address, an endpoint URL (it can hold a key), a quantity or a value. Errors of the chain clients carry no URL or body.
6. **Read-only, bounded, resilient.** Requests are rate-limited (3 Esplora requests in flight, spaced 150 ms; JSON-RPC batched by 20 calls), time out (`WALLET_SYNC_TIMEOUT_MS`), and a wallet is synced automatically at most every `WALLET_SYNC_INTERVAL_SECONDS` (10 min) and on demand at most every 30 s. A failure keeps the last synced holdings, flagged stale; it never fails a request.

**Rejected: indexer APIs with a key (Etherscan, Alchemy, Covalent…).** They list every token without a token list, but tie the requests to an account at the provider, add a secret to manage and a terms-of-service dependency, for little gain on a handful of tokens.

**Rejected: sending the xpub to a service that derives the addresses (e.g. blockchain.info `multiaddr`).** Fewer requests, but the third party receives the key to the whole account.

**Rejected: running our own nodes now.** Disproportionate for one user; kept as the documented option through the URL settings.

## Consequences

- With the sync on, mempool.space and publicnode.com can link the VPS IP to the wallet's addresses. Tailscale does not hide it (it protects inbound access, not outbound requests). Routing outbound traffic through Tor or a VPN, or self-hosting the endpoints, are the ways to avoid it.
- Detecting an `xpub`'s type sends three addresses of the account in the same minute, two of them never used: the endpoint learns nothing more than the scan that follows already tells it. Detection runs only while no type with history has been found.
- Tokens are read only when tracked: the account's own assets plus those added with "Ajouter un jeton". An unknown airdrop does not appear (a feature as much as a limit: no spam tokens).
- Public endpoints may rate-limit or go down: the account then shows its last synced holdings as stale until the next sync succeeds.
- Changing an endpoint is a `.env` change and a restart; no data migration.
