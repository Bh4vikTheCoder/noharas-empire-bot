// src/events/ready.js
import { ActivityType } from 'discord.js';

const statuses = [
  { name: 'Noharas Empire',        type: ActivityType.Watching },
  { name: 'discord.gg/SRXGYYw4ZE', type: ActivityType.Watching },
];

export default {
  // Changed from 'ready' to 'clientReady' to fix the discord.js v15 warning
  name: 'clientReady', 
  once: true,
  execute(client) {
    console.log(`[BOT] Logged in as ${client.user.tag}`);

    let index = 0;

    const rotate = () => {
      client.user.setPresence({
        status: 'online',
        activities: [statuses[index]],
      });
      // console.log(`[BOT] Status → Watching ${statuses[index].name}`); // Commented out to stop spamming your Render logs!
      index = (index + 1) % statuses.length;
    };

    rotate();
    setInterval(rotate, 5_000);
  },
};
