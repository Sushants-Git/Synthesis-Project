# Project Plan — FlowTx

> **Last updated:** 2026-03-22
> Living document — update after every session.

---

## Vision

A visual, AI-powered transaction builder where users describe intent in plain English and get a drawable, executable flow representing the steps to accomplish it — no static UI required.

---

## Current Status

**Phase:** 0 — Setup & scaffolding
**Active work:** Repo initialized, agents.md and plan.md created

---

## Phases

### Phase 0 — Foundation ✅ (in progress)
- [x] Register for hackathon
- [x] Create repo structure docs (agents.md, plan.md)
- [ ] Scaffold Vite + React + Tailwind project
- [ ] Set up ESLint, TypeScript, Prettier
- [ ] Create AI abstraction layer (OpenAI + Claude switchable)
- [ ] Basic project deploys and runs locally

### Phase 1 — Canvas Core
- [ ] Integrate tldraw (or Excalidraw) into the app
- [ ] Define node types: Wallet, API Call, Approval Gate, Action, Output
- [ ] Build flow renderer: given a JSON flow spec, render it on canvas
- [ ] Make nodes interactive (click to inspect, approve, skip)

### Phase 2 — AI Intent Parser
- [ ] Build prompt input UI
- [ ] Connect to AI layer — parse natural language intent into flow JSON spec
- [ ] Support flow types:
  - [ ] Simple transfer (A → B)
  - [ ] Conditional transfer (A → search → filter → approve → B)
  - [ ] Multi-step (A → API → on-chain action → B)
- [ ] Stream flow generation to canvas in real time

### Phase 3 — Blockchain Integration
- [ ] Connect wallet (MetaMask / wagmi)
- [ ] ENS resolution — resolve names ↔ addresses bidirectionally
- [ ] Execute simple ETH transfers
- [ ] MetaMask Delegation Framework integration (ERC-7715)
  - Intent-based delegations
  - Sub-delegation chains for agent coordination
- [ ] Status Network — gasless transaction execution (gasPrice=0, gas=0)

### Phase 4 — External Integrations
- [ ] Twitter/X API — search for users by criteria (e.g., "best ZK builder")
- [ ] Self Protocol — Self Agent ID / Self Pass for identity verification
- [ ] Octant public goods data APIs (if applicable)
- [ ] ENS Communication track — ENS-powered messaging/payment UX

### Phase 5 — Polish & Submit
- [ ] Conversation log (required by hackathon — document AI-human collaboration)
- [ ] README with demo video / deployed contract links
- [ ] Open source the repo (deadline requirement)
- [ ] Submit to hackathon tracks:
  - MetaMask Best Use of Delegations
  - Self Protocol Integration
  - ENS Identity + Communication + Open Integration
  - Status Network Go Gasless
  - Octant (if applicable)
- [ ] Deploy to production

---

## Example Flows to Demo

### Flow 1: Simple Transfer
> "Send 0.1 ETH from my wallet to vitalik.eth"
```
Wallet (0x...) → ENS Resolve (vitalik.eth → 0xd8da...) → Approval Gate → Transfer 0.1 ETH
```

### Flow 2: Conditional Transfer
> "I have 0.5 ETH, send it to the best ZK builder on Twitter"
```
Wallet → Twitter Search (ZK builders) → AI Filter (rank by relevance) → List Results → User Approval → ENS Resolve → Transfer
```

### Flow 3: Delegated Action
> "Let my agent manage small transfers under 0.01 ETH automatically"
```
User → MetaMask Delegation (ERC-7715, caveat: max 0.01 ETH) → Agent executes autonomously within bounds
```

---

## Prize Checklist

| Prize | Key Requirement | Status |
|-------|-----------------|--------|
| MetaMask $3,000 | ERC-7715 delegation, creative caveat | Not started |
| Self $1,000 | Self Agent ID essential to flow | Not started |
| ENS $400+$400+$300 | ENS names replace hex addresses everywhere | Not started |
| Status Network $50 | Gasless tx on Sepolia testnet | Not started |
| Octant $1,000 | Public goods mechanism/data work | Considering |

---

## Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-03-22 | Use tldraw over Excalidraw | tldraw has better programmatic API for custom nodes |
| 2026-03-22 | AI layer: OpenAI primary, Claude fallback | Flexibility if one API is down |
| 2026-03-22 | Stack: Vite + React + Tailwind | Fast setup, team familiarity |
