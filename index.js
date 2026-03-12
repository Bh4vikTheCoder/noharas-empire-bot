// src/index.js
import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, ActivityType } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Create client ────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember],
});

// Stores join alert message IDs so they can be deleted after verification
// Map<memberId, alertMessageId>
client.pendingVerifications = new Map();

// Stores active snake games keyed by message ID
// Map<messageId, gameState>
client.snakeGames = new Map();

// ── Load all events from /events ─────────────────────────────────────────────
const eventsPath  = join(__dirname, 'events');
const eventFiles  = readdirSync(eventsPath).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
  const { default: event } = await import(join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
  console.log(`[EVT] Loaded: ${event.name}`);
}

// ── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('[BOT] Login failed:', err.message);
  process.exit(1);
});