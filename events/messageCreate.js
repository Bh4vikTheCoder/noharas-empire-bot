// src/events/messageCreate.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createGame }   from '../utils/snakeGame.js';
import { buildEmbed, buildControls } from './interactionCreate.js';

// ── Helper Function: Parse Time Strings (e.g., 10m, 1h, 1d) ───────────────
function parseDuration(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const val = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  if (unit === 's') return val * 1000;
  if (unit === 'm') return val * 60000;
  if (unit === 'h') return val * 3600000;
  if (unit === 'd') return val * 86400000;
  return null;
}

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

      if (!['ban', 'warn', 'mute', 'kick', 'userinfo', 'unmute'].includes(cmd)) return;

      // ── UNMUTE COMMAND ────────────────────────────────────────────────────────
      if (cmd === 'unmute') {
        // Fetch members to ensure cache is populated
        await message.guild.members.fetch();
        const mutedMembers = message.guild.members.cache.filter(m => m.isCommunicationDisabled());

        const listStr = mutedMembers.size > 0 
          ? mutedMembers.map(m => `• **${m.user.tag}**`).join('\n')
          : 'Nobody is currently muted.';

        const embed = new EmbedBuilder()
          .setTitle('🔇 Muted Users List')
          .setDescription(listStr)
          .setColor(0x95a5a6)
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`unmute_prompt_${message.author.id}`)
            .setLabel('Unmute User')
            .setEmoji('🔊')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`unmute_cancel_${message.author.id}`)
            .setLabel('Cancel Action')
            .setStyle(ButtonStyle.Secondary)
        );

        const replyMsg = await message.reply({ embeds: [embed], components: [row] });

        // Auto-delete both the command and the response after 25s
        setTimeout(() => message.delete().catch(() => {}), 25000);
        setTimeout(() => replyMsg.delete().catch(() => {}), 25000);
        return;
      }

      // Everything else requires a target
      const targetArg = args.shift();
      if (!targetArg) {
        return message.reply(`⚠️ Please specify a user to moderate (e.g., \`manager ${cmd} username\`).`)
          .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
      }

      let targetMember;
      
      const targetMatch = targetArg.match(/^<@!?(\d+)>$/);
      const possibleId = targetMatch ? targetMatch[1] : targetArg;

      if (/^\d{17,19}$/.test(possibleId)) {
        try { targetMember = await message.guild.members.fetch(possibleId); } catch {} 
      }

      if (!targetMember) {
        try {
          const searchResults = await message.guild.members.fetch({ query: targetArg, limit: 1 });
          targetMember = searchResults.first();
        } catch {}
      }

      if (!targetMember) {
        return message.reply('❌ Could not find that member. Ensure they are in the server.')
          .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
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

      // ── USERINFO
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

      // ── HYBRID LOGIC: INSTANT EXECUTION ──
      if (cmd === 'warn' && args.length > 0) {
        const reason = args.join(' ');
        
        try { await targetMember.send(`⚠️ You have been **warned** in **${message.guild.name}**.\n**Reason:** ${reason}`); } catch {}

        const embed = new EmbedBuilder()
          .setTitle('⚠️ User Warned')
          .setDescription(`**${targetMember.user.tag}** has been warned by ${message.author}.\n**Reason:** ${reason}`)
          .setColor(0xfee75c)
          .setTimestamp();
        
        const replyMsg = await message.reply({ embeds: [embed] });
        setTimeout(() => message.delete().catch(() => {}), 25000);
        setTimeout(() => replyMsg.delete().catch(() => {}), 25000);
        return;
      }

      if (['ban', 'mute', 'kick'].includes(cmd) && args.length >= 2) {
        const durationStr = args[0];
        const ms = parseDuration(durationStr);
        
        if (ms) {
          const reason = args.slice(1).join(' ');

          const dmEmbed = new EmbedBuilder()
            .setTitle(`You were ${cmd}ed in ${message.guild.name}`)
            .setColor(cmd === 'ban' ? 0xed4245 : (cmd === 'kick' ? 0xe67e22 : 0x95a5a6))
            .addFields(
              { name: 'Duration', value: durationStr, inline: true },
              { name: 'Reason', value: reason, inline: true }
            )
            .setTimestamp();
          
          try { await targetMember.send({ embeds: [dmEmbed] }); } catch {}

          try {
            const auditReason = `[Manager ${cmd}] by ${message.author.tag} | Time: ${durationStr} | Reason: ${reason}`;
            if (cmd === 'mute') await targetMember.timeout(ms, auditReason);
            else if (cmd === 'kick') await targetMember.kick(auditReason);
            else if (cmd === 'ban') {
              await targetMember.ban({ reason: auditReason });
              setTimeout(() => { message.guild.members.unban(targetMember.id).catch(() => {}); }, ms);
            }
          } catch (err) {
            return message.reply(`❌ Failed to ${cmd} the user. Check my role hierarchy in Server Settings.`);
          }

          const confirmEmbed = new EmbedBuilder()
            .setTitle(`✅ User ${cmd.charAt(0).toUpperCase() + cmd.slice(1)}ed`)
            .setDescription(`**${targetMember.user.tag}** has been ${cmd}ed by ${message.author}.`)
            .setColor(cmd === 'ban' ? 0xed4245 : (cmd === 'kick' ? 0xe67e22 : 0x95a5a6))
            .addFields(
              { name: 'Duration', value: durationStr, inline: true },
              { name: 'Reason', value: reason, inline: true }
            )
            .setTimestamp();

          const replyMsg = await message.reply({ embeds: [confirmEmbed] });
          setTimeout(() => message.delete().catch(() => {}), 25000);
          setTimeout(() => replyMsg.delete().catch(() => {}), 25000);
          return;
        }
      }

      // ── HYBRID LOGIC: BUTTON FALLBACK ──
      const customId = `mod_${cmd}_${targetMember.id}_${message.author.id}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(customId)
          .setLabel(`Provide Details for ${cmd.toUpperCase()} on ${targetMember.user.username}`)
          .setEmoji('📝')
          .setStyle(ButtonStyle.Primary)
      );

      const promptMsg = await message.reply({
        content: `**${message.author}**, click the button below to fill out the details.`,
        components: [row]
      });

      // Also Auto-delete the prompt after 25s
      setTimeout(() => message.delete().catch(() => {}), 25000);
      setTimeout(() => promptMsg.delete().catch(() => {}), 25000);
    }
  },
};
