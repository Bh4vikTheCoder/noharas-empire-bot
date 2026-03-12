// src/events/messageCreate.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createGame }   from '../utils/snakeGame.js';
import { buildEmbed, buildControls } from './interactionCreate.js';

export default {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    const lower   = content.toLowerCase();

    // ════════════════════════════════════════════════════════════════════════════
    // 🐍  SNAKE GAME
    // ════════════════════════════════════════════════════════════════════════════
    if (lower === 'play snake') {
      const snakeChannelId = process.env.SNAKE_CHANNEL_ID;

      if (snakeChannelId && message.channel.id !== snakeChannelId) {
        const warningMsg = await message.reply({
          content: `❌ You can only use this command in <#${snakeChannelId}>!`
        });
        
        setTimeout(() => {
          warningMsg.delete().catch(() => {});
          message.delete().catch(() => {});
        }, 5000);
        return;
      }

      await message.delete().catch(() => {});

      const game = createGame(message.author.id);

      const sent = await message.channel.send({
        content: `🎮 **${message.author.username}'s Snake Game** — only you can control it!`,
        embeds: [buildEmbed(game)],
        components: buildControls(),
      });

      if (!client.snakeGames) client.snakeGames = new Map();
      client.snakeGames.set(sent.id, game);

      const { step } = await import('../utils/snakeGame.js');

      const gameTick = async () => {
        if (game.gameOver) return;

        step(game);

        if (game.gameOver) {
          clearTimeout(game.timeoutId);
          client.snakeGames.delete(sent.id);
          await sent.edit({
            content: `🎮 **${message.author.username}'s Snake Game**`,
            embeds: [buildEmbed(game)],
            components: [],
          }).catch(() => {});
          return;
        }

        if (!game.isEditing) {
          game.isEditing = true;
          await sent.edit({
            embeds: [buildEmbed(game)],
            components: buildControls(),
          }).catch(() => {});
          game.isEditing = false;
        }

        if (!game.gameOver) {
          game.timeoutId = setTimeout(gameTick, 1500);
        }
      };

      game.timeoutId = setTimeout(gameTick, 1500);
      return;
    }

    // ════════════════════════════════════════════════════════════════════════════
    // ✅  VERIFICATION
    // ════════════════════════════════════════════════════════════════════════════
    if (lower.startsWith('verify')) {
      const verifyChannelId = process.env.VERIFICATION_CHANNEL_ID;
      if (verifyChannelId && message.channel.id !== verifyChannelId) return;

      const pattern = /^verify\s+<@!?(\d+)>\s+(associate|outsider)$/i;
      const match   = content.match(pattern);

      if (!match) {
        return message.reply({
          content:
            '⚠️ **Invalid format.** Correct usage:\n' +
            '`verify @user associate`\n' +
            '`verify @user outsider`',
        }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 8000));
      }

      const [, targetId, roleKeyword] = match;

      if (!message.member.permissions.has('ManageRoles')) {
        return message.reply({ content: '❌ You need the **Manage Roles** permission to verify members.' })
          .then(msg => setTimeout(() => msg.delete().catch(() => {}), 6000));
      }

      let targetMember;
      try {
        targetMember = await message.guild.members.fetch(targetId);
      } catch {
        return message.reply({ content: '❌ Could not find that member. Are they still in the server?' });
      }

      const unverifiedRoleId = process.env.UNVERIFIED_ROLE_ID;
      
      if (!unverifiedRoleId) {
        return message.reply({ content: '❌ The **UNVERIFIED_ROLE_ID** is not set in `.env`.' })
          .then(msg => setTimeout(() => msg.delete().catch(() => {}), 6000));
      }

      if (!targetMember.roles.cache.has(unverifiedRoleId)) {
        return message.reply({ content: '❌ This user has already been verified!' })
          .then(msg => setTimeout(() => msg.delete().catch(() => {}), 6000));
      }

      const associateRoleId  = process.env.ASSOCIATE_ROLE_ID;
      const outsiderRoleId   = process.env.OUTSIDER_ROLE_ID;

      const isAssociate  = roleKeyword.toLowerCase() === 'associate';
      const assignRoleId = isAssociate ? associateRoleId : outsiderRoleId;
      const assignLabel  = isAssociate ? 'Associate' : 'Outsider';
      const assignEmoji  = isAssociate ? '🤝' : '👤';
      const assignColour = isAssociate ? 0x57f287 : 0xfee75c;

      if (!assignRoleId) {
        return message.reply({
          content: `❌ The **${assignLabel}** role ID is not set in \`.env\` (${isAssociate ? 'ASSOCIATE_ROLE_ID' : 'OUTSIDER_ROLE_ID'}).`,
        });
      }

      try {
        await targetMember.roles.add([assignRoleId], `Verified as ${assignLabel} by ${message.author.tag}`);
        await targetMember.roles.remove([unverifiedRoleId], 'Verification complete — unverified role removed');
      } catch (err) {
        console.error('[VERIFY] Role update failed:', err.message);
        return message.reply({
          content: '❌ Failed to update roles. Make sure my role is **above** the roles I need to assign in Server Settings → Roles.',
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`${assignEmoji} Member Verified`)
        .setDescription(`${targetMember} has been verified as **${assignLabel}**.`)
        .setColor(assignColour)
        .addFields(
          { name: 'Role Assigned', value: `<@&${assignRoleId}>`,                              inline: true },
          { name: 'Verified By',   value: `${message.member}`,                                inline: true },
          { name: 'Role Removed',  value: `<@&${unverifiedRoleId}>`,                          inline: true },
        )
        .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: `${message.guild.name} Verification System` });

      const successMsg = await message.channel.send({ embeds: [embed] });
      setTimeout(() => successMsg.delete().catch(() => {}), 30_000);

      setTimeout(() => message.delete().catch(() => {}), 30_000);

      if (client.pendingVerifications?.has(targetMember.id)) {
        const alertMessageId = client.pendingVerifications.get(targetMember.id);
        const alertMessage   = await message.channel.messages.fetch(alertMessageId).catch(() => null);
        if (alertMessage) await alertMessage.delete().catch(() => {});
        client.pendingVerifications.delete(targetMember.id);
      }
      return;
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 🛡️  MANAGER COMMANDS (Mod Suite)
    // ════════════════════════════════════════════════════════════════════════════
    if (lower.startsWith('manager ')) {
      if (!message.member.permissions.has('ModerateMembers') && !message.member.permissions.has('ManageRoles')) {
        return message.reply({ content: '❌ You need Staff permissions to use manager commands.' })
          .then(msg => setTimeout(() => msg.delete().catch(() => {}), 6000));
      }

      const args = content.slice(8).trim().split(/\s+/);
      const cmd = args.shift()?.toLowerCase();

      if (!['ban', 'warn', 'mute', 'kick', 'userinfo'].includes(cmd)) return;

      const targetArg = args.shift();
      if (!targetArg) {
        return message.reply(`⚠️ Please specify a user to moderate (e.g., \`manager ${cmd} @user\`).`);
      }

      const targetMatch = targetArg.match(/^<@!?(\d+)>$/);
      const targetId = targetMatch ? targetMatch[1] : targetArg;
      
      let targetMember;
      try {
        targetMember = await message.guild.members.fetch(targetId);
      } catch {
        return message.reply('❌ Could not find that member. Ensure they are in the server.');
      }

      // Safety checks
      if (cmd !== 'userinfo') {
        if (targetMember.id === message.author.id) {
          return message.reply('❌ You cannot moderate yourself!');
        }
        if (message.member.roles.highest.position <= targetMember.roles.highest.position) {
          return message.reply('❌ You cannot moderate a member with an equal or higher role than you.');
        }
      }

      // ── USERINFO (Bypasses the popup)
      if (cmd === 'userinfo') {
        const roles = targetMember.roles.cache
          .filter(r => r.id !== message.guild.id)
          .sort((a, b) => b.position - a.position)
          .map(r => `<@&${r.id}>`)
          .join(', ') || 'None';

        const embed = new EmbedBuilder()
          .setTitle(`User Info: ${targetMember.user.tag}`)
          .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
          .setColor(0x5865f2)
          .addFields(
            { name: 'User ID', value: targetMember.id, inline: true },
            { name: 'Joined Server', value: `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>`, inline: true },
            { name: 'Account Created', value: `<t:${Math.floor(targetMember.user.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'Roles', value: roles }
          )
          .setFooter({ text: `Requested by ${message.author.username}` })
          .setTimestamp();
        
        return message.reply({ embeds: [embed] });
      }

      // ── Trigger the Setup Button for Ban, Warn, Mute, Kick
      // Custom ID format: mod_cmd_targetId_authorId
      const customId = `mod_${cmd}_${targetMember.id}_${message.author.id}`;
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(customId)
          .setLabel(`Provide Details for ${cmd.toUpperCase()}`)
          .setEmoji('📝')
          .setStyle(ButtonStyle.Primary)
      );

      const promptMsg = await message.reply({
        content: `**${message.author}**, click the button below to fill out the reason ${cmd !== 'warn' ? 'and duration ' : ''}for this action.`,
        components: [row]
      });

      // Cleanup the prompt if they don't click it within 60 seconds
      setTimeout(() => promptMsg.delete().catch(() => {}), 60000);
    }
  },
};
