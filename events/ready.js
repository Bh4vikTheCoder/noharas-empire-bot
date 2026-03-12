// src/events/ready.js
import { ActivityType } from 'discord.js';

const statuses = [
  { name: 'Noharas Empire',        type: ActivityType.Watching },
  { name: 'discord.gg/SRXGYYw4ZE', type: ActivityType.Watching },
];

export default {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`[BOT] Logged in as ${client.user.tag}`);

    let index = 0;

    const rotate = () => {
      client.user.setPresence({
        status: 'online',
        activities: [statuses[index]],
      });
      console.log(`[BOT] Status → Watching ${statuses[index].name}`);
      index = (index + 1) % statuses.length;
    };

    // Set immediately then rotate every 5 seconds
    rotate();
    setInterval(rotate, 5_000);
  },
};