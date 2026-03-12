// src/index.js
import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, ActivityType } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http'; // <-- Added Node's built-in HTTP module

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Dummy Web Server for Render ──────────────────────────────────────────────
// Render requires web services to bind to a port, otherwise the deploy fails.
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Discord bot is awake and running!');
}).listen(port, () => {
  console.log(`[SERVER] Dummy web server listening on port ${port} to satisfy Render.`);
});

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

// We use an async IIFE here to handle the await cleanly
(async () => {
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
})();
