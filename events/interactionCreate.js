// src/events/interactionCreate.js
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { queueDirection, renderBoard } from '../utils/snakeGame.js';

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

function normalizeName(str) {
  return str.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function buildControls() {
  const up    = new ButtonBuilder().setCustomId('snake_up')   .setEmoji('⬆️').setStyle(ButtonStyle.Primary);
  const down  = new ButtonBuilder().setCustomId('snake_down') .setEmoji('⬇️').setStyle(ButtonStyle.Primary);
  const left  = new ButtonBuilder().setCustomId('snake_left') .setEmoji('⬅️').setStyle(ButtonStyle.Primary);
  const right = new ButtonBuilder().setCustomId('snake_right').setEmoji('➡️').setStyle(ButtonStyle.Primary);
  const stop  = new ButtonBuilder().setCustomId('snake_stop') .setEmoji('🛑').setStyle(ButtonStyle.Danger);

  const blank = (id) => new ButtonBuilder()
    .setCustomId(`blank_${id}`)
    .setLabel('\u200b')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const row1 = new ActionRowBuilder().addComponents(blank('a'), blank('b'), up,    blank('c'), blank('d'));
  const row2 = new ActionRowBuilder().addComponents(blank('e'), left,       down,  right,      stop);

  return [row1, row2];
}

export function buildEmbed(game, stopped = false) {
  const board = renderBoard(game);

  if (stopped) {
    return new EmbedBuilder()
      .setTitle('🛑 Game Stopped')
      .setDescription(board)
      .setColor(0x99aab5)
      .addFields({ name: 'Final Score', value: `🍎 ${game.score}`, inline: true })
      .setFooter({ text: 'Type "play snake" to play again!' });
  }

  if (game.gameOver) {
    return new EmbedBuilder()
      .setTitle('💀 Game Over!')
      .setDescription(board)
      .setColor(0xed4245)
      .addFields({ name: 'Final Score', value: `🍎 ${game.score}`, inline: true })
      .setFooter({ text: 'Type "play snake" to play again!' });
  }

  return new EmbedBuilder()
    .setTitle('🐍 Snake Game')
    .setDescription(board)
    .setColor(0x57f287)
    .addFields({ name: 'Score', value: `🍎 ${game.score}`, inline: true })
    .setFooter({ text: 'Use the buttons to steer — The Snake Will Move Automatically' });
}

export default {
  name: 'interactionCreate',
  async execute(interaction, client) {
    
    if (interaction.isButton()) {
      const { customId } = interaction;

      if (customId.startsWith('unmute_cancel_')) {
        const authorId = customId.replace('unmute_cancel_', '');
        if (interaction.user.id !== authorId) return interaction.reply({ content: '❌ Not your command.', ephemeral: true });
        
        await interaction.message.delete().catch(() => {});
        return;
      }

      if (customId.startsWith('unmute_prompt_')) {
        const authorId = customId.replace('unmute_prompt_', '');
        if (interaction.user.id !== authorId) return interaction.reply({ content: '❌ Not your command.', ephemeral: true });

        const modal = new ModalBuilder()
          .setCustomId('modal_unmute_search')
          .setTitle('Unmute User');

        const searchInput = new TextInputBuilder()
          .setCustomId('search_input')
          .setLabel("Who do you want to unmute?")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(32)
          .setPlaceholder("Type their username here...");

        modal.addComponents(new ActionRowBuilder().addComponents(searchInput));
        return await interaction.showModal(modal);
      }

      if (customId.startsWith('mod_')) {
        const parts = customId.split('_');
        const cmd = parts[1];
        const targetId = parts[2];
        const authorId = parts[3];

        if (interaction.user.id !== authorId) return interaction.reply({ content: '❌ Not your command.', ephemeral: true });

        const modal = new ModalBuilder()
          .setCustomId(`modal_mod_${cmd}_${targetId}`)
          .setTitle(`Details for ${cmd.toUpperCase()}`);

        const reasonInput = new TextInputBuilder()
          .setCustomId('reason_input')
          .setLabel("Reason")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500)
          .setPlaceholder(`Why are you issuing this ${cmd}?`);

        if (cmd !== 'warn') {
          const durationInput = new TextInputBuilder()
            .setCustomId('duration_input')
            .setLabel("Duration (e.g., 10m, 1h, 1d)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10)
            .setPlaceholder("Use s, m, h, or d");
            
          modal.addComponents(new ActionRowBuilder().addComponents(durationInput));
        }

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        return await interaction.showModal(modal);
      }

      if (customId.startsWith('verify_prompt_')) {
        if (!interaction.member.permissions.has('ManageRoles')) return interaction.reply({ content: '❌ You need the **Manage Roles** permission to verify members.', ephemeral: true });

        const memberId = customId.replace('verify_prompt_', '');
        const modal = new ModalBuilder()
          .setCustomId(`modal_verify_prompt_${memberId}`)
          .setTitle(`Verify Member`);

        const roleInput = new TextInputBuilder()
          .setCustomId('role_input')
          .setLabel("Type 'associate' or 'outsider'")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20)
          .setPlaceholder(`associate / outsider`);

        modal.addComponents(new ActionRowBuilder().addComponents(roleInput));
        return await interaction.showModal(modal);
      }

      if (customId.startsWith('verify_kick_') || customId.startsWith('verify_ban_')) {
        if (!interaction.member.permissions.has('ManageRoles')) return interaction.reply({ content: '❌ You need the **Manage Roles** permission to do this.', ephemeral: true });

        const action   = customId.startsWith('verify_kick_') ? 'kick' : 'ban';
        const memberId = customId.replace(`verify_${action}_`, '');

        const modal = new ModalBuilder()
          .setCustomId(`modal_verify_${action}_${memberId}`)
          .setTitle(`Reason for ${action === 'kick' ? 'Kick' : 'Ban'}`);

        const reasonInput = new TextInputBuilder()
          .setCustomId('reason_input')
          .setLabel("Reason (Optional)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
          .setPlaceholder(`Why are you ${action === 'kick' ? 'kicking' : 'banning'} this user?`);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        return await interaction.showModal(modal);
      }

      if (['snake_up', 'snake_down', 'snake_left', 'snake_right', 'snake_stop'].includes(customId)) {
        const game = client.snakeGames?.get(interaction.message.id);
        if (!game) return interaction.reply({ content: '❌ This game has expired.', ephemeral: true });
        if (interaction.user.id !== game.userId) return interaction.reply({ content: '❌ Not your game!', ephemeral: true });

        if (customId === 'snake_stop') {
          game.gameOver = true;
          clearTimeout(game.timeoutId);
          client.snakeGames.delete(interaction.message.id);
          return interaction.update({ embeds: [buildEmbed(game, true)], components: [] });
        }

        queueDirection(game, customId.replace('snake_', ''));
        return await interaction.deferUpdate();
      }
    }

    if (interaction.isModalSubmit()) {
      const { customId } = interaction;

      // ── UNMUTE POPUP SUBMIT (FUZZY SEARCH) ──────────────────────────────────
      if (customId === 'modal_unmute_search') {
        const query = interaction.fields.getTextInputValue('search_input');
        const searchNormalized = normalizeName(query);

        // Targeted fetch to avoid Rate Limits
        await interaction.guild.members.fetch({ query, limit: 30 }).catch(() => {});
        const mutedMembers = interaction.guild.members.cache.filter(m => m.isCommunicationDisabled());

        const targetMember = mutedMembers.find(m => 
          normalizeName(m.user.username).includes(searchNormalized) || 
          (m.displayName && normalizeName(m.displayName).includes(searchNormalized))
        );

        if (!targetMember) {
          return interaction.reply({ content: `❌ Could not find a currently muted user matching \`${query}\`.`, ephemeral: true });
        }

        try {
          await targetMember.timeout(null, `Unmuted by ${interaction.user.tag}`);
        } catch (err) {
          return interaction.reply({ content: '❌ Failed to unmute. Check my role hierarchy.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle('🔊 User Unmuted')
          .setDescription(`**${targetMember.user.tag}** has been unmuted by ${interaction.user}.`)
          .setColor(0x2ecc71)
          .setTimestamp();

        await interaction.message?.delete().catch(() => {});
        const replyMsg = await interaction.reply({ embeds: [embed], fetchReply: true });
        setTimeout(() => replyMsg.delete().catch(() => {}), 25000);
        return;
      }

      // ── MODERATOR POPUP SUBMIT ───────────────────────────────────────────
      if (customId.startsWith('modal_mod_')) {
        const parts = customId.split('_');
        const cmd = parts[2];
        const targetId = parts[3];
        
        const reason = interaction.fields.getTextInputValue('reason_input').trim();
        let durationStr = 'N/A';
        let ms = null;

        if (cmd !== 'warn') {
          durationStr = interaction.fields.getTextInputValue('duration_input').trim();
          ms = parseDuration(durationStr);
          if (!ms) return interaction.reply({ content: '❌ Invalid duration format! Use `10m`, `1h`, etc.', ephemeral: true });
        }

        let targetMember;
        try { targetMember = await interaction.guild.members.fetch(targetId); } catch {
          await interaction.message?.delete().catch(() => {});
          return interaction.reply({ content: '⚠️ That member is no longer in the server.', ephemeral: true });
        }

        if (cmd === 'warn') {
          try { await targetMember.send(`⚠️ You have been **warned** in **${interaction.guild.name}**.\n**Reason:** ${reason}`); } catch {}
          const embed = new EmbedBuilder()
            .setTitle('⚠️ User Warned')
            .setDescription(`**${targetMember.user.tag}** has been warned by ${interaction.user}.\n**Reason:** ${reason}`)
            .setColor(0xfee75c)
            .setTimestamp();
          
          await interaction.message?.delete().catch(() => {});
          const replyMsg = await interaction.reply({ embeds: [embed], fetchReply: true });
          setTimeout(() => replyMsg.delete().catch(() => {}), 25000);
          return;
        }

        const dmEmbed = new EmbedBuilder()
          .setTitle(`You were ${cmd}ed in ${interaction.guild.name}`)
          .setColor(cmd === 'ban' ? 0xed4245 : (cmd === 'kick' ? 0xe67e22 : 0x95a5a6))
          .addFields(
            { name: 'Duration', value: durationStr, inline: true },
            { name: 'Reason', value: reason, inline: true }
          )
          .setTimestamp();
        
        try { await targetMember.send({ embeds: [dmEmbed] }); } catch {}

        try {
          const auditReason = `[Manager ${cmd}] by ${interaction.user.tag} | Time: ${durationStr} | Reason: ${reason}`;
          if (cmd === 'mute') await targetMember.timeout(ms, auditReason);
          else if (cmd === 'kick') await targetMember.kick(auditReason);
          else if (cmd === 'ban') {
            await targetMember.ban({ reason: auditReason });
            setTimeout(() => { interaction.guild.members.unban(targetMember.id).catch(() => {}); }, ms);
          }
        } catch (err) {
          return interaction.reply({ content: `❌ Failed to ${cmd} the user.`, ephemeral: true });
        }

        const confirmEmbed = new EmbedBuilder()
          .setTitle(`✅ User ${cmd.charAt(0).toUpperCase() + cmd.slice(1)}ed`)
          .setDescription(`**${targetMember.user.tag}** has been ${cmd}ed by ${interaction.user}.`)
          .setColor(cmd === 'ban' ? 0xed4245 : (cmd === 'kick' ? 0xe67e22 : 0x95a5a6))
          .addFields(
            { name: 'Duration', value: durationStr, inline: true },
            { name: 'Reason', value: reason, inline: true }
          )
          .setTimestamp();

        await interaction.message?.delete().catch(() => {});
        const replyMsg = await interaction.reply({ embeds: [confirmEmbed], fetchReply: true });
        setTimeout(() => replyMsg.delete().catch(() => {}), 25000);
        return;
      }

      // ── Verify Prompt Submit ──────────────────────────────────────────────────
      if (customId.startsWith('modal_verify_prompt_')) {
        const memberId = customId.replace('modal_verify_prompt_', '');
        const roleChoice = interaction.fields.getTextInputValue('role_input').trim().toLowerCase();

        if (roleChoice !== 'associate' && roleChoice !== 'outsider') return interaction.reply({ content: '❌ Invalid input. Type exactly `associate` or `outsider`.', ephemeral: true });

        let targetMember;
        try { targetMember = await interaction.guild.members.fetch(memberId); } catch {
          await interaction.message?.delete().catch(() => {});
          return interaction.reply({ content: '⚠️ That member is no longer in the server.', ephemeral: true });
        }

        const unverifiedRoleId = process.env.UNVERIFIED_ROLE_ID;
        if (!unverifiedRoleId) return interaction.reply({ content: `❌ The **UNVERIFIED_ROLE_ID** is not set.`, ephemeral: true });
        if (!targetMember.roles.cache.has(unverifiedRoleId)) return interaction.reply({ content: '❌ This user has already been verified!', ephemeral: true });

        const isAssociate  = roleChoice === 'associate';
        const assignRoleId = isAssociate ? process.env.ASSOCIATE_ROLE_ID : process.env.OUTSIDER_ROLE_ID;
        const assignLabel  = isAssociate ? 'Associate' : 'Outsider';
        const assignEmoji  = isAssociate ? '🤝' : '👤';
        const assignColour = isAssociate ? 0x57f287 : 0xfee75c;

        if (!assignRoleId) return interaction.reply({ content: `❌ The **${assignLabel}** role ID is not set.`, ephemeral: true });

        try {
          await targetMember.roles.add([assignRoleId], `Verified as ${assignLabel} by ${interaction.user.tag}`);
          await targetMember.roles.remove([unverifiedRoleId], 'Verification complete');
        } catch (err) {
          return interaction.reply({ content: '❌ Failed to update roles.', ephemeral: true });
        }

        if (interaction.message) await interaction.message.delete().catch(() => {});
        if (client.pendingVerifications) client.pendingVerifications.delete(memberId);

        const embed = new EmbedBuilder()
          .setTitle(`${assignEmoji} Member Verified`)
          .setDescription(`${targetMember} has been verified as **${assignLabel}**.`)
          .setColor(assignColour)
          .addFields(
            { name: 'Role Assigned', value: `<@&${assignRoleId}>`,                              inline: true },
            { name: 'Verified By',   value: `${interaction.user}`,                              inline: true },
            { name: 'Role Removed',  value: `<@&${unverifiedRoleId}>`,                          inline: true },
          )
          .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: `${interaction.guild.name} Verification System` });

        await interaction.reply({ embeds: [embed] });
        setTimeout(async () => { await interaction.deleteReply().catch(() => {}); }, 30_000);
        return;
      }

      // ── Verify Kick / Ban Submit ──────────────────────────────────────────────────────
      if (customId.startsWith('modal_verify_kick_') || customId.startsWith('modal_verify_ban_')) {
        const action   = customId.startsWith('modal_verify_kick_') ? 'kick' : 'ban';
        const memberId = customId.replace(`modal_verify_${action}_`, '');
        
        let reason = interaction.fields.getTextInputValue('reason_input').trim() || 'No reason provided by staff.';

        let target;
        try { target = await interaction.guild.members.fetch(memberId); } catch {
          await interaction.message?.delete().catch(() => {});
          return interaction.reply({ content: '⚠️ That member is no longer in the server.', ephemeral: true });
        }

        const dmEmbed = new EmbedBuilder()
          .setTitle(`You were ${action === 'kick' ? 'kicked from' : 'banned from'} ${interaction.guild.name}`)
          .setColor(action === 'kick' ? 0xfee75c : 0xed4245)
          .addFields({ name: 'Reason', value: reason })
          .setTimestamp();

        try { await target.send({ embeds: [dmEmbed] }); } catch (err) {}

        try {
          const auditLogReason = `[Verification] ${action === 'kick' ? 'Kicked' : 'Banned'} by ${interaction.user.tag} | Reason: ${reason}`;
          if (action === 'kick') await target.kick(auditLogReason);
          else await target.ban({ reason: auditLogReason });
        } catch (err) {
          return interaction.reply({ content: `❌ Failed to ${action} the member.`, ephemeral: true });
        }

        if (interaction.message) await interaction.message.delete().catch(() => {});
        if (client.pendingVerifications) client.pendingVerifications.delete(memberId);

        const emoji = action === 'kick' ? '👢' : '🔨';
        const label = action === 'kick' ? 'Kicked' : 'Banned';
        const colour = action === 'kick' ? 0xfee75c : 0xed4245;

        const confirmEmbed = new EmbedBuilder()
          .setTitle(`${emoji} Member ${label}`)
          .setDescription(`**${target.user.tag}** has been ${label.toLowerCase()} by ${interaction.user}.\n**Reason:** ${reason}`)
          .setColor(colour)
          .setTimestamp();

        await interaction.reply({ embeds: [confirmEmbed] });
        setTimeout(async () => { await interaction.deleteReply().catch(() => {}); }, 30_000);
      }
    }
  },
};
