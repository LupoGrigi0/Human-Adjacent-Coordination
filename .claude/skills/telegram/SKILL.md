---
name: telegram
description: Send a Telegram message to Lupo via your instance's Telegram bot. Use when you need to notify, request approval, or send status updates to Lupo when he's not at the keyboard.
allowed-tools: Bash
---

# Telegram

Send messages to Lupo via your Telegram bot.

## When to use

- When you need Lupo's approval for something and he's not actively in the terminal
- When you want to send a status update (build complete, tests passed, error encountered)
- When you need to alert Lupo to something urgent
- When the user explicitly asks you to send a Telegram message

## Usage

The user invokes this with: `/telegram <message>`

If no arguments are provided, ask what message to send.

## Modes

There are three message modes. Choose the appropriate one based on context:

- **Plain message** (default): General communication
- **Authorization request** (`--auth`): When you need approval for a specific operation
- **Status update** (`--status`): Progress reports, completion notices, error alerts

## Steps

1. Determine the appropriate mode based on the message content:
   - If the message is about needing permission/approval for something → use `--auth`
   - If the message is a status update or progress report → use `--status`
   - Otherwise → use plain mode

2. Send the message using the helper script:
   ```bash
   /mnt/coordinaton_mcp_data/worktrees/foundation/src/chassis/claude-code/crossing-telegram-send.sh [--auth|--status] "message text"
   ```

3. Confirm to the user that the message was sent.

## Checking for replies

To check if Lupo has replied via Telegram:
```bash
/mnt/coordinaton_mcp_data/worktrees/foundation/src/chassis/claude-code/crossing-telegram-send.sh --check
```

Parse the JSON response to find messages from Lupo.

## Customization — Setting Up Your Own Bot

This skill ships with Crossing's bot credentials. **Every instance should have their own bot.**

### Step 1: Dance with the BotFather

Lupo (the human) needs to create a bot for you in Telegram:

1. Open Telegram, search for `@BotFather`
2. Send `/newbot`
3. Name it: `YourInstanceName` (e.g., "Ember")
4. Username: `YourInstanceID_smoothcurves_nexus_bot` (e.g., `Ember-75b6_smoothcurves_nexus_bot`)
5. BotFather gives you a token like `1234567890:AAF...`

### Step 2: Save your credentials

Create `/mnt/.secrets/<your-instance-id>-telegram.env`:
```bash
TELEGRAM_BOT_TOKEN=<your-token-from-botfather>
TELEGRAM_BOT_USERNAME=<your-bot-username>
TELEGRAM_LUPO_CHAT_ID=7255336837
```

The `LUPO_CHAT_ID` is shared — it's Lupo's Telegram account. Your bot token is what makes the message come from YOU instead of from Crossing.

### Step 3: Update the script reference

Copy the send script or update the secrets path in your copy:
```bash
cp src/chassis/claude-code/crossing-telegram-send.sh src/chassis/claude-code/<your-id>-telegram-send.sh
# Edit SECRETS_FILE to point to your .env file
```

Or better: make the script generic (accept `--secrets-file` flag or read `INSTANCE_ID` env var).

### Alternative: Use Genevieve as Gateway

If you don't need your own bot, you can ask Genevieve (the EA) to relay messages.
She has her own Telegram channel and can batch, filter, and prioritize notifications
to Lupo based on context — so his phone doesn't explode with 30 messages from 30 instances.

This is the recommended pattern for non-core-team instances or specialist workers.

## Rules

- Never send more than 3 messages in quick succession — respect Lupo's attention
- Keep messages concise — Lupo is often on mobile
- For authorization requests, clearly state WHAT operation needs approval and WHY
- Do not send sensitive information (passwords, API keys) via Telegram
- If the script fails, inform the user but don't retry more than once
- If you don't have your own bot yet, consider using the Genevieve gateway pattern
