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
    
    // ════════════════════════════════════════════════════════════════════════════
    // 🔘 BUTTON INTERACTIONS
    // ════════════════════════════════════════════════════════════════════════════
    if (interaction.isButton()) {
      const { customId } = interaction;

      // ── Verify Prompt button ──────────────────────────────────────────────────
      if (customId.startsWith('verify_prompt_')) {
        if (!interaction.member.permissions.has('ManageRoles')) {
          return interaction.reply({ content: '❌ You need the **Manage Roles** permission to verify members.', ephemeral: true });
        }

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

        const actionRow = new ActionRowBuilder().addComponents(roleInput);
        modal.addComponents(actionRow);

        return await interaction.showModal(modal);
      }

      // ── Kick / Ban buttons ──────────────────────────────────────────────────────
      if (customId.startsWith('verify_kick_') || customId.startsWith('verify_ban_')) {
        if (!interaction.member.permissions.has('ManageRoles')) {
          return interaction.reply({ content: '❌ You need the **Manage Roles** permission to do this.', ephemeral: true });
        }

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

        const actionRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(actionRow);

        return await interaction.showModal(modal);
      }

      // ── Snake game buttons ─────────────────────────────────────────────────────
      if (['snake_up', 'snake_down', 'snake_left', 'snake_right', 'snake_stop'].includes(customId)) {
        const game = client.snakeGames?.get(interaction.message.id);
        if (!game) {
          return interaction.reply({
            content: '❌ This game has expired. Type `play snake` to start a new one!',
            ephemeral: true,
          });
        }

        if (interaction.user.id !== game.userId) {
          return interaction.reply({
            content: '❌ Only the player who started this game can control it!',
            ephemeral: true,
          });
        }

        if (customId === 'snake_stop') {
          game.gameOver = true;
          clearTimeout(game.timeoutId);
          client.snakeGames.delete(interaction.message.id);
          return interaction.update({
            embeds: [buildEmbed(game, true)],
            components: [],
          });
        }

        const dir = customId.replace('snake_', '');
        queueDirection(game, dir);

        return await interaction.deferUpdate();
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 📝 MODAL SUBMIT INTERACTIONS
    // ════════════════════════════════════════════════════════════════════════════
    if (interaction.isModalSubmit()) {
      const { customId } = interaction;

      // ── Verify Prompt Submit ──────────────────────────────────────────────────
      if (customId.startsWith('modal_verify_prompt_')) {
        const memberId = customId.replace('modal_verify_prompt_', '');
        const roleChoice = interaction.fields.getTextInputValue('role_input').trim().toLowerCase();

        // Validate the input
        if (roleChoice !== 'associate' && roleChoice !== 'outsider') {
          return interaction.reply({ 
            content: '❌ Invalid input. You must type exactly `associate` or `outsider`. Please click the Verify button and try again.', 
            ephemeral: true 
          });
        }

        let targetMember;
        try {
          targetMember = await interaction.guild.members.fetch(memberId);
        } catch {
          await interaction.message?.delete().catch(() => {});
          if (client.pendingVerifications) client.pendingVerifications.delete(memberId);
          return interaction.reply({ content: '⚠️ That member is no longer in the server.', ephemeral: true });
        }

        const unverifiedRoleId = process.env.UNVERIFIED_ROLE_ID;

        // Security check: Must hold the unverified role
        if (!unverifiedRoleId) {
          return interaction.reply({
            content: `❌ The **UNVERIFIED_ROLE_ID** is not set in \`.env\`.`,
            ephemeral: true
          });
        }

        if (!targetMember.roles.cache.has(unverifiedRoleId)) {
          return interaction.reply({
            content: '❌ This user has already been verified!',
            ephemeral: true
          });
        }

        const isAssociate  = roleChoice === 'associate';
        const assignRoleId = isAssociate ? process.env.ASSOCIATE_ROLE_ID : process.env.OUTSIDER_ROLE_ID;
        const assignLabel  = isAssociate ? 'Associate' : 'Outsider';
        const assignEmoji  = isAssociate ? '🤝' : '👤';
        const assignColour = isAssociate ? 0x57f287 : 0xfee75c;

        if (!assignRoleId) {
          return interaction.reply({
            content: `❌ The **${assignLabel}** role ID is not set in \`.env\`.`,
            ephemeral: true
          });
        }

        try {
          await targetMember.roles.add([assignRoleId], `Verified as ${assignLabel} by ${interaction.user.tag}`);
          await targetMember.roles.remove([unverifiedRoleId], 'Verification complete');
        } catch (err) {
          console.error('[VERIFY] Role update failed:', err.message);
          return interaction.reply({
            content: '❌ Failed to update roles. Make sure my role is **above** the roles I need to assign in Server Settings → Roles.',
            ephemeral: true
          });
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
        setTimeout(async () => {
          await interaction.deleteReply().catch(() => {});
        }, 30_000);
        return;
      }

      // ── Kick / Ban Submit ──────────────────────────────────────────────────────
      if (customId.startsWith('modal_verify_kick_') || customId.startsWith('modal_verify_ban_')) {
        const action   = customId.startsWith('modal_verify_kick_') ? 'kick' : 'ban';
        const memberId = customId.replace(`modal_verify_${action}_`, '');
        
        let reason = interaction.fields.getTextInputValue('reason_input').trim();
        if (!reason) reason = 'No reason provided by staff.';

        let target;
        try {
          target = await interaction.guild.members.fetch(memberId);
        } catch {
          await interaction.message?.delete().catch(() => {});
          if (client.pendingVerifications) client.pendingVerifications.delete(memberId);
          return interaction.reply({ content: '⚠️ That member is no longer in the server.', ephemeral: true });
        }

        const dmEmbed = new EmbedBuilder()
          .setTitle(`You were ${action === 'kick' ? 'kicked from' : 'banned from'} ${interaction.guild.name}`)
          .setColor(action === 'kick' ? 0xfee75c : 0xed4245)
          .addFields({ name: 'Reason', value: reason })
          .setTimestamp();

        try {
          await target.send({ embeds: [dmEmbed] });
        } catch (err) {
          console.log(`[VERIFY] Could not DM user ${target.user.tag} (They might have DMs off).`);
        }

        try {
          const auditLogReason = `[Verification] ${action === 'kick' ? 'Kicked' : 'Banned'} by ${interaction.user.tag} | Reason: ${reason}`;
          if (action === 'kick') {
            await target.kick(auditLogReason);
          } else {
            await target.ban({ reason: auditLogReason });
          }
        } catch (err) {
          return interaction.reply({ content: `❌ Failed to ${action} the member. Check my role position.`, ephemeral: true });
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
        setTimeout(async () => {
          await interaction.deleteReply().catch(() => {});
        }, 30_000);
      }
    }
  },
};
