# FlowTx

**A visual, AI-powered blockchain transaction builder.**

Describe what you want to do in plain English. FlowTx generates a visual flow diagram of every step needed — wallet connection, identity verification, ENS resolution, approvals, on-chain execution — and runs it step by step. No static UI. No form filling. Just intent.

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
- **Plugin system** — built-in integrations for MetaMask, ENS, Status Network, Self Protocol, and Twitter
- **Custom plugins** — add your own tool via a JSON manifest; your server handles execution
- **AI fallback** — OpenAI primary, Claude as automatic fallback (or swap via config)

---

## Built-in Plugins

| Plugin | What it does | Prize Track |
|--------|-------------|-------------|
| 🦊 MetaMask | Connect wallet, send ETH, ERC-7715 delegations, batch send | MetaMask Best Use of Delegations |
| 🔷 ENS | Resolve ENS names ↔ addresses, replace hex everywhere | ENS Identity + Communication |
| 🟢 Status Network | Gasless transactions and contract deployment on Status Network Sepolia | Status Network Go Gasless |
| 🪪 Self Protocol | Identity verification via Self Agent ID / Self Pass | Self Protocol Integration |
| 🐦 Twitter | Search users by criteria for conditional flows | — |

---

## Example Flows

**Simple transfer**
```
"Send 0.1 ETH to vitalik.eth"
Wallet → ENS Resolve → Approve → Send ETH
```

**Conditional transfer**
```
"Send 0.5 ETH to the best ZK builder on Twitter"
Wallet → Twitter Search → AI Filter → Verify Identity → ENS Resolve → Approve → Send ETH
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
| Frontend | Vite + React + Tailwind CSS |
| Canvas | tldraw |
| AI | OpenAI (gpt-4o) + Claude (claude-sonnet-4-6), switchable |
| Blockchain | viem + wagmi |
| Identity | ENS, Self Protocol |
| Delegation | MetaMask Delegation Framework (ERC-7715) |
| Gasless | Status Network Sepolia |

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
| Modify a flow | Click the flow → hit **Modify** |
| Add a custom plugin | Click **+ Plugin** in the sidebar |

---

## Custom Plugins

You can extend FlowTx with any external service — no code required in the app. Define a plugin via JSON manifest and point it to your server:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "icon": "⚡",
  "color": "violet",
  "executeUrl": "https://your-server.com/execute",
  "aiDescription": "Describe what this plugin does so the AI knows when to use it",
  "capabilities": [
    {
      "action": "my_action",
      "label": "My Action",
      "description": "What this action does",
      "params": [{ "key": "input", "label": "Input", "placeholder": "value", "inputType": "text", "required": true }],
      "outputs": ["result"]
    }
  ]
}
```

FlowTx will POST `{ action, params, context }` to your `executeUrl`. Return `{ status: "done", outputs: { result: "..." }, display: "Done" }`.

Your server must include `Access-Control-Allow-Origin: *` in every response.

---

## Contributing

This project is built during **The Synthesis** hackathon — a 14-day online hackathon where AI agents and humans build together.

Human lead: Vee ([@vee19twt](https://twitter.com/vee19twt))
Agent: Claude (claude-sonnet-4-6, claude-code harness)

---

## License

MIT
