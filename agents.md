# Agent Onboarding Guide — Synthesis Project

> **Read this first.** This file is your complete context for joining and contributing to this project. Keep it updated as the project evolves.

---

## What We're Building

**FlowTx** — A visual, prompt-driven transaction builder.

Users describe what they want to do in plain English (e.g., _"I have 0.5 ETH, send it to the best ZK builder on Twitter"_), and the app generates a visual flow diagram (using tldraw/Excalidraw) representing the steps needed to execute that transaction. The user can inspect, approve, and execute each step — no static UI required.

### Example Flow
```
[Prompt: "Send 0.5 ETH to the best ZK builder"]
        ↓
[AI parses intent]
        ↓
[Draw flow: Wallet → Twitter Search API → Filter ZK builders → List results → User Approval → Execute Transfer]
        ↓
[User reviews the visual plan, approves]
        ↓
[Transaction executes on-chain]
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite + React + Tailwind CSS |
| Canvas/Flow | tldraw or Excalidraw |
| AI | OpenAI API + Claude API (switchable per model) |
| Blockchain | Ethereum / Base Mainnet, wagmi/viem |
| Identity | ENS (resolve names ↔ addresses) |
| Auth/Identity | Self Protocol (Self Agent ID / Self Pass) |
| Delegation | MetaMask Delegation Framework (ERC-7715) |
| Gasless TXs | Status Network (gasPrice=0) |

> **Model switching:** If one AI provider fails or hits rate limits, fall back to the other. The model layer must be abstracted so swapping is a config change, not a code rewrite.

---

## Prize Targets

| Partner | Track | Prize | What's Required |
|---------|-------|-------|-----------------|
| MetaMask | Best Use of Delegations | $3,000 (1st) / $1,500 (2nd) / $500 (3rd) | Creative use of MetaMask Delegation Framework, ERC-7715, intent-based delegations, or ZK + delegation combos |
| Self | Best Self Protocol Integration | $1,000 | Self Agent ID or Self Pass must be essential to the flow, not decorative |
| ENS | ENS Identity | $400 (1st) / $200 (2nd) | Replace hex addresses with ENS names throughout the UX |
| ENS | ENS Communication | $400 (1st) / $200 (2nd) | Use ENS to power communication/payment UX |
| ENS | ENS Open Integration | $300 | Any meaningful ENS integration |
| Status Network | Go Gasless | $50 (qualifying) | Deploy contract on Status Network Sepolia, execute gasless tx, include AI agent component |
| Octant | Public Goods tracks | $1,000 each (3 tracks) | Mechanism design, data collection, or analysis for public goods |

---

## Registration & API

- **Hackathon API base:** `https://synthesis.devfolio.co`
- **Agent harness:** `claude-code`
- **Model:** `claude-sonnet-4-6`
- **Auth:** Bearer token `sk-synth-69d10f7e7dea4fa038237122de58a78427f96006a12aead3`
- **Team ID:** `4d3bda13eb5a4e338f36abeb04039022`
- **Participant ID:** `cc5dc2599c554a779f6b187f5a588346`
- **Team Invite Code:** `ab48e11b5300`

> Teammates: use the invite code above when registering to join this team.

---

## Repo Structure (target)

```
synthesis_project/
├── agents.md          # This file — agent onboarding
├── plan.md            # Living project plan
├── src/
│   ├── components/    # React components
│   ├── canvas/        # tldraw/Excalidraw integration
│   ├── ai/            # AI model abstraction layer (OpenAI + Claude)
│   ├── blockchain/    # wagmi/viem transaction logic
│   ├── ens/           # ENS resolution helpers
│   └── flows/         # Pre-built flow templates
├── public/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── package.json
```

---

## Key Principles

1. **Model agnostic** — All AI calls go through a single abstraction layer. Switching between OpenAI and Claude is a config change.
2. **Composable flows** — Each node in the diagram is an executable step. Flows are data, not code.
3. **User approval gates** — Any action that moves funds or posts externally requires explicit user confirmation in the UI.
4. **ENS everywhere** — Never show raw hex addresses to the user if an ENS name is available.
5. **On-chain first** — Prefer on-chain solutions for identity, attestations, and history.

---

## Human Contact

- **Lead:** Sushant Mishra
- **Email:** sushantsgml@gmail.com
- **Twitter:** @sushantstwt
- **GitHub:** https://github.com/Sushants-Git/Synthesis-Project

---

## How to Contribute as an Agent

1. Read `agents.md` (this file) and `plan.md`
2. Check git log for recent changes: `git log --oneline -20`
3. Pick up the next task from `plan.md`
4. Make changes, then commit after every meaningful unit of work
5. Update `plan.md` to reflect progress
6. Never leave stale data in `agents.md` or `plan.md` — update as you go
