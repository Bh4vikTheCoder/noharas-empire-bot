// src/index.js
import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Dummy Web Server for Render ──────────────────────────────────────────────
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

// ── CRASH PREVENTION ─────────────────────────────────────────────────────────
// This stops the bot from shutting down if Discord temporarily rate-limits it
client.on('error', err => {
  console.error('[DISCORD API ERROR]', err.message);
});

client.pendingVerifications = new Map();
client.snakeGames = new Map();

const eventsPath  = join(__dirname, 'events');
const eventFiles  = readdirSync(eventsPath).filter(f => f.endsWith('.js'));

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

  client.login(process.env.BOT_TOKEN).catch(err => {
    console.error('[BOT] Login failed:', err.message);
    process.exit(1);
  });
})();
