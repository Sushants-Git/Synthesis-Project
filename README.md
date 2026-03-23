<div align="center">
  <img src="./public/banner.png" alt="CAN VVEE banner" width="100%" />
  <br /><br />
  <img src="./public/favicon.png" alt="CAN VVEE logo" width="64" />
  <h1>CAN VVEE</h1>
  <p><strong>Visual AI-powered flow builder for blockchain transactions.</strong></p>
  <p>
    <a href="https://canvvee.vercel.app/">Live Demo</a> ·
    <a href="https://www.youtube.com/watch?v=LZ7WyFWa1l0">Demo Video</a> ·
    <a href="https://github.com/Sushants-Git/Synthesis-Project">Repository</a>
  </p>
</div>

---

## What is CAN VVEE?

CAN VVEE lets anyone build and execute blockchain transaction flows using plain English — no code, no forms, no raw addresses. Describe your intent, get a visual node graph, review each step, execute on-chain.

**Example prompt:**
> *"Fetch the ENS names from the Receivers column of this Google Sheet and send each one 0.005 ETH"*

CAN VVEE generates:
```
Google Sheets → ENS Resolve Batch → Approve → Batch Send ETH
```
…and executes it step by step with wallet confirmation.

---

## How it works

```
User types intent in plain English
          ↓
AI (Claude / GPT-4o) parses intent → FlowSpec JSON (nodes + edges)
          ↓
tldraw renders a visual node graph on an infinite canvas
          ↓
User clicks ⚡ Execute — each node runs in sequence
          ↓
Fund-moving steps require explicit wallet approval before proceeding
          ↓
Transaction executes on-chain, outputs shown in the executor panel
```

---

## Features

- **Prompt-driven flows** — double-click the canvas, describe intent, get a visual plan instantly
- **Step-by-step executor** — nodes run in sequence with per-step outputs; approvals gate every fund movement
- **ENS everywhere** — hex addresses never shown to users; all resolution happens automatically
- **JSON editor** — click Modify → edit raw flow spec → Regenerate Diagram without AI
- **Build your own plugin** — connect any API in minutes, no backend required (see below)
- **Keys never in the bundle** — all API keys injected server-side via Vercel edge functions

---

## Prize Track Integrations

### MetaMask — Best Use of Delegations (ERC-7715)

CAN VVEE uses the MetaMask Delegation Framework to enable **intent-based transaction flows**:

- `metamask:connect` — wallet connection with account detection
- `metamask:send_eth` — single ETH transfer with explicit approval step
- `metamask:batch_send` — send ETH to multiple recipients in one flow; supports both fixed `amount` per recipient and `total_amount` split equally
- `metamask:approve` — transparent gate node: blocks execution until user approves, then passes data through to downstream nodes unchanged
- `metamask:create_delegation` — creates an ERC-7715 delegation with configurable caveats (max amount, recipient allowlist) so an agent can execute transfers autonomously within pre-approved limits

Every fund movement in CAN VVEE requires a MetaMask approval step in the flow. The delegation primitive lets users grant bounded authority to flows without exposing their full wallet.

---

### ENS — Identity, Communication, Open Integration

ENS is the identity layer throughout CAN VVEE. Raw hex addresses are never shown to users:

- `ens:resolve_name` — resolves a single ENS name to an address
- `ens:resolve_batch` — resolves an array of ENS names in parallel; partial success supported (returns resolved + failed counts)
- `ens:lookup_address` — reverse lookup: address → primary ENS name
- **Auto-resolution** — every address in the executor panel is shown as its ENS name where available
- **Wiring** — `ens:resolve_batch` output `addresses[]` wires directly into `metamask:batch_send`, eliminating manual address handling

In practice: a user can describe a flow using only ENS names (`vitalik.eth`, `nick.eth`) and CAN VVEE handles all resolution transparently. No hex addresses ever enter the user's mental model.

---

### Self Protocol — Best Integration

CAN VVEE uses Self Protocol as an **identity gate** in transaction flows:

- `self:verify` — verifies that a resolved address holds a valid Self Pass or Self Agent ID before allowing the flow to continue
- Positioned as a guard node between ENS resolution and ETH send — e.g. `ENS Resolve → Self Verify → Approve → Send ETH`
- Prevents sending to unverified or bot-controlled addresses in automated flows
- The AI flow parser knows to insert `self:verify` when the user says "only if they're verified" or "Sybil-resistant"

---

### Status Network — Go Gasless

CAN VVEE integrates Status Network Sepolia (Chain ID: 1660990954) for **zero-gas transactions**:

- `status:send` — single ETH transfer at gas = 0 (protocol-level gasless, not sponsored)
- `status:batch_send` — batch ETH distribution with no gas fees
- The AI flow parser selects `status:send` over `metamask:send_eth` automatically for small/test transfers
- Deployed contract and gasless tx hashes available in the demo video

Status Network is the recommended integration for hackathon demos and batch airdrops where gas friction would otherwise block participation.

---

## Example Flows

**Sheet airdrop with ENS**
> *"From [this Google Sheet](https://docs.google.com/...), get the ENS addresses from the Receivers column and send each of them 0.005 ETH"*
```
Google Sheets (Receivers column)
  → ENS Resolve Batch          # vitalik.eth → 0xd8dA...
  → Approve                    # review recipient list before funds move
  → Batch Send ETH (0.005 each)
```

**GitHub stars → ETH reward**
> *"Here is a list of builder GitHub IDs — if any repo has more than 1000 stars and 'zk' in the name, send that builder 0.5 ETH"*
```
GitHub Get Repos (per handle)
  → ChatGPT Filter             # "return true if stars > 1000 and name contains zk"
  → Util Filter (keep matches)
  → ENS Resolve Batch
  → Approve
  → Batch Send ETH (0.5 each)
```

**Twitter scout → identity-verified airdrop**
> *"Search Twitter for the top ZK builders, score them using their last 10 tweets, verify identity, and send the top 3 each 0.1 ETH"*
```
Twitter Search ("ZK builder")
  → Twitter Get Batch Tweets   # fetches last 10 tweets per user
  → ChatGPT Score              # rate each builder 1–10
  → Util Filter (score ≥ 8)
  → ENS Resolve Batch
  → Self Protocol Verify       # only verified identities proceed
  → Approve
  → Batch Send ETH (0.1 each)
```

**Identity-gated transfer**
> *"Send 1 ETH to sushant.eth but only if they have a verified identity"*
```
ENS Resolve (sushant.eth → address)
  → Self Protocol Verify
  → Approve
  → Send ETH (1 ETH)
```

**Gasless batch on Status Network**
> *"Send 0.01 ETH to each address in this sheet — no gas fees"*
```
Google Sheets (wallet addresses)
  → Status Network Batch Send  # gas = 0 at protocol level
```

---

## Build Your Own Plugin

CAN VVEE has a built-in **Plugin Builder** — connect any external API as a first-class plugin with no code changes to the app.

### How it works

1. **Define API steps** — add one or more HTTP calls (GET/POST/PUT/DELETE), with URL, headers, and body. Use `{{variable}}` placeholders for dynamic values.

2. **Test live** — hit ▶ Test to fire the real request and inspect the JSON response inline.

3. **Extract outputs** — either click any value in the response tree to map it as an output field, or write a JS transform:
   ```js
   // response = parsed API JSON
   // vars = plugin inputs + previous step outputs
   const items = response.data.filter(u => u.active)
   return {
     addresses: JSON.stringify(items.map(u => u.wallet)),
     count: String(items.length),
   }
   ```
   Then click **← Mark as step outputs** to declare those keys as the plugin's outputs.

4. **Chain steps** — outputs from step 1 become `{{variables}}` available in step 2's URL/body. The data flow is shown visually between steps.

5. **Save** — the plugin appears in the sidebar under "My Plugins". The AI automatically knows about it (name, inputs, outputs) and will suggest it in flows.

### Plugin input/output model

Every plugin in CAN VVEE has typed inputs and outputs (`string` or `string[]`). Outputs from one node wire to inputs of the next by matching key names — no manual wiring needed. Custom plugins follow the same model, so they compose with built-in plugins (ENS, MetaMask, ChatGPT) seamlessly.

---

## Built-in Plugins

| Plugin | Actions | Prize Track |
|--------|---------|-------------|
| 🦊 MetaMask | `connect`, `send_eth`, `batch_send`, `approve`, `create_delegation` | MetaMask Best Use of Delegations |
| 🔷 ENS | `resolve_name`, `resolve_batch`, `lookup_address` | ENS Identity + Communication + Open Integration |
| 🟢 Status Network | `send`, `batch_send` (gas = 0) | Status Network Go Gasless |
| 🪪 Self Protocol | `verify` (Self Pass / Agent ID) | Self Protocol Best Integration |
| 🐦 Twitter | `search_users`, `get_profiles`, `get_tweets`, `get_batch_tweets` | — |
| 🤖 ChatGPT | `process` (score, filter, summarise any list) | — |
| 🐙 GitHub | `get_repos`, `get_contributors` | — |
| 🔧 Util | `filter`, `merge`, `join`, `first`, `collect` | — |
| 📊 Google Sheets | `fetch_rows` (public sheets, no API key) | — |

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite + React 19 + TypeScript + Tailwind CSS |
| Canvas | tldraw 3.9 — custom `flow-node` ShapeUtil |
| AI | OpenAI gpt-4o (primary) + Claude claude-sonnet-4-6 (fallback), switchable |
| Blockchain | viem + wagmi |
| Identity | ENS (viem), Self Protocol |
| Delegation | MetaMask Delegation Framework (ERC-7715) |
| Gasless | Status Network Sepolia (Chain ID: 1660990954) |
| Deploy | Vercel — edge functions proxy all API keys server-side |

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/Sushants-Git/Synthesis-Project
cd Synthesis-Project
npm install
```

### 2. Set up environment variables

```env
# AI provider — "openai" or "claude"
VITE_AI_PROVIDER=openai
VITE_OPENAI_API_KEY=sk-...
VITE_OPENAI_MODEL=gpt-4o
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_CLAUDE_MODEL=claude-sonnet-4-6

# Optional — enables Twitter and GitHub plugins
VITE_TWITTER_BEARER_TOKEN=...
VITE_GITHUB_TOKEN=...
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
| Create a flow | Double-click anywhere on the canvas and describe your intent |
| Execute | Click the flow → **⚡ Execute** |
| Modify | Click the flow → **Modify** → edit JSON or chat with AI |
| Add a single block | Click any action in the sidebar → **+ add** |
| Build a custom plugin | Click **🧩 Build Plugin** in the sidebar |
| Clear canvas | **Clear All** button (top right) |

---

## Contributing

Built during **[The Synthesis](https://synthesis.md)** hackathon — a 14-day online hackathon where AI agents and humans build together.

Human leads: Sushant ([@sushantstwt](https://twitter.com/sushantstwt)) & Vee ([@vee19twt](https://twitter.com/vee19twt))
Agent: Claude (claude-sonnet-4-6, claude-code harness)

Full human-agent conversation log: [conversation.md](./conversation.md)

---

## License

MIT
