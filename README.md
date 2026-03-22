<div align="center">
  <img src="./public/banner.png" alt="CAN VVEE banner" width="100%" />
  <br /><br />
  <img src="./public/favicon.png" alt="CAN VVEE logo" width="64" />
  <h1>CAN VVEE</h1>
  <p><strong>Visual AI-powered flow builder for blockchain transactions.</strong></p>
</div>

---

Describe what you want in plain English. CAN VVEE generates a visual flow diagram of every step needed — wallet connection, identity verification, ENS resolution, approvals, on-chain execution — and runs it step by step. No static UI. No form filling. Just intent.

---

## How it works

```
"Send 0.5 ETH to the best ZK builder on Twitter"
                        ↓
              AI parses your intent
                        ↓
  Draws a flow: Wallet → Twitter Search → Filter → Verify Identity → ENS Resolve → Approve → Send ETH
                        ↓
        You review the plan, approve each step
                        ↓
              Transaction executes on-chain
```

---

## Features

- **Prompt-driven flows** — double-click the canvas or draw a frame, type your intent, get a visual plan
- **Step-by-step executor** — each node runs in sequence; fund movements require explicit approval
- **ENS everywhere** — names like `vitalik.eth` are resolved automatically, never shown as raw hex
- **Plugin system** — built-in integrations for MetaMask, ENS, Status Network, Self Protocol, Twitter, GitHub, ChatGPT
- **Build your own plugin** — define steps, write JS transforms, wire inputs/outputs — no backend required
- **JSON editor** — click Modify → edit the raw flow spec → Regenerate Diagram without touching the AI
- **Keys never exposed** — API keys are injected server-side via Vercel edge functions, never bundled

---

## Built-in Plugins

| Plugin | What it does | Prize Track |
|--------|-------------|-------------|
| 🦊 MetaMask | Connect wallet, send ETH, ERC-7715 delegations, batch send | MetaMask Best Use of Delegations |
| 🔷 ENS | Resolve ENS names ↔ addresses, batch resolve | ENS Identity + Communication |
| 🟢 Status Network | Gasless transactions on Status Network Sepolia | Status Network Go Gasless |
| 🪪 Self Protocol | Identity verification via Self Agent ID / Self Pass | Self Protocol Integration |
| 🐦 Twitter | Search users, fetch profiles, fetch tweets for AI scoring | — |
| 🤖 ChatGPT | Score, filter, or summarise any list with a custom prompt | — |
| 🐙 GitHub | Fetch repos and contributors for analysis | — |
| 🔧 Util | filter, merge, join, first — array manipulation primitives | — |

---

## Example Flows

**Simple transfer**
```
"Send 0.1 ETH to vitalik.eth"
Wallet → ENS Resolve → Approve → Send ETH
```

**Sheet airdrop**
```
"Fetch addresses from this Google Sheet and send them each 0.01 ETH"
Google Sheets → ENS Resolve Batch → Approve → Batch Send ETH
```

**Conditional transfer**
```
"Send 0.5 ETH to the best ZK builder on Twitter"
Twitter Search → Get Profiles → ChatGPT Score → Filter → Approve → Send ETH
```

**Delegated agent action**
```
"Let my agent handle transfers under 0.01 ETH automatically"
Wallet → Create Delegation (ERC-7715, max 0.01 ETH caveat) → Agent executes autonomously
```

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite + React 19 + TypeScript + Tailwind CSS |
| Canvas | tldraw 3.9 — custom flow-node shape |
| AI | OpenAI (gpt-4o) + Claude (claude-sonnet-4-6), switchable |
| Blockchain | viem + wagmi |
| Identity | ENS, Self Protocol |
| Delegation | MetaMask Delegation Framework (ERC-7715) |
| Gasless | Status Network Sepolia |
| Deploy | Vercel (edge functions for API proxying) |

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/Sushants-Git/Synthesis-Project
cd Synthesis-Project
npm install
```

### 2. Set up environment variables

Create a `.env` file in the root:

```env
# AI Provider — "openai" or "claude"
VITE_AI_PROVIDER=openai

VITE_OPENAI_API_KEY=sk-...
VITE_OPENAI_MODEL=gpt-4o

VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_CLAUDE_MODEL=claude-sonnet-4-6

VITE_TWITTER_BEARER_TOKEN=...
VITE_GITHUB_TOKEN=...         # optional, increases rate limit
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Usage

| Action | How |
|--------|-----|
| Create a flow | Double-click anywhere on the canvas and type your intent |
| Draw a frame first | Press `F`, draw a frame, then type inside it |
| Execute a flow | Click the flow → hit **⚡ Execute** |
| Modify a flow | Click the flow → hit **Modify** → edit JSON or chat |
| Add a block directly | Click any action in the sidebar → **+ add** |
| Build a plugin | Click **🧩 Build Plugin** in the sidebar |

---

## Build Your Own Plugin

Add any external API as a plugin — no changes to the app required. In the Plugin Builder:

1. Add API steps (GET/POST, with URL and body)
2. Write a JS transform to extract outputs from the response
3. Define input/output field names
4. Save — your plugin appears in the sidebar and the AI knows about it

The AI will automatically suggest your plugin when it fits the user's intent.

---

## Contributing

Built during **The Synthesis** hackathon — a 14-day online hackathon where AI agents and humans build together.

Human leads: Sushant ([@sushantstwt](https://twitter.com/sushantstwt)) & Vee ([@vee19twt](https://twitter.com/vee19twt))
Agent: Claude (claude-sonnet-4-6, claude-code harness)

---

## License

MIT
