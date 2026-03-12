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

      // ── Kick / Ban buttons from the join verification alert ───────────────────
      if (customId.startsWith('verify_kick_') || customId.startsWith('verify_ban_')) {
        // Only members with Manage Roles permission can use these
        if (!interaction.member.permissions.has('ManageRoles')) {
          return interaction.reply({ content: '❌ You need the **Manage Roles** permission to do this.', ephemeral: true });
        }

        const action   = customId.startsWith('verify_kick_') ? 'kick' : 'ban';
        const memberId = customId.replace(`verify_${action}_`, '');

        // 1. Create the Modal
        const modal = new ModalBuilder()
          .setCustomId(`modal_verify_${action}_${memberId}`)
          .setTitle(`Reason for ${action === 'kick' ? 'Kick' : 'Ban'}`);

        // 2. Create the Text Input
        const reasonInput = new TextInputBuilder()
          .setCustomId('reason_input')
          .setLabel("Reason (Optional)")
          .setStyle(TextInputStyle.Paragraph) // Multi-line text box
          .setRequired(false) // Make it optional
          .setMaxLength(500)
          .setPlaceholder(`Why are you ${action === 'kick' ? 'kicking' : 'banning'} this user?`);

        // 3. Add the text input to an action row, then to the modal
        const actionRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(actionRow);

        // 4. Show the modal to the staff member
        return await interaction.showModal(modal);
      }

      // ── Snake game buttons ─────────────────────────────────────────────────────
      const snakeButtons = ['snake_up', 'snake_down', 'snake_left', 'snake_right', 'snake_stop'];
      if (snakeButtons.includes(customId)) {
        const game = client.snakeGames?.get(interaction.message.id);
        if (!game) {
          return interaction.reply({
            content: '❌ This game has expired. Type `play snake` to start a new one!',
            ephemeral: true,
          });
        }

        // Only the player who started can steer
        if (interaction.user.id !== game.userId) {
          return interaction.reply({
            content: '❌ Only the player who started this game can control it!',
            ephemeral: true,
          });
        }

        // Stop button — clear the interval and end the game
        if (customId === 'snake_stop') {
          clearInterval(game.intervalId);
          client.snakeGames.delete(interaction.message.id);
          return interaction.update({
            embeds: [buildEmbed(game, true)],
            components: [],
          });
        }

        // Queue the new direction — the interval will apply it on the next tick
        const dir = customId.replace('snake_', '');
        queueDirection(game, dir);

        // Acknowledge the button press silently
        return await interaction.deferUpdate();
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 📝 MODAL SUBMIT INTERACTIONS
    // ════════════════════════════════════════════════════════════════════════════
    if (interaction.isModalSubmit()) {
      const { customId } = interaction;

      if (customId.startsWith('modal_verify_kick_') || customId.startsWith('modal_verify_ban_')) {
        const action   = customId.startsWith('modal_verify_kick_') ? 'kick' : 'ban';
        const memberId = customId.replace(`modal_verify_${action}_`, '');
        
        // Get the reason from the modal, or set a default if left blank
        let reason = interaction.fields.getTextInputValue('reason_input').trim();
        if (!reason) reason = 'No reason provided by staff.';

        let target;
        try {
          target = await interaction.guild.members.fetch(memberId);
        } catch {
          // Member already left — just clean up the alert message
          await interaction.message?.delete().catch(() => {});
          if (client.pendingVerifications) client.pendingVerifications.delete(memberId);
          return interaction.reply({ content: '⚠️ That member is no longer in the server.', ephemeral: true });
        }

        // 1. DM the user BEFORE kicking/banning them
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

        // 2. Execute the Kick or Ban
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

        // 3. Remove the original join alert message
        if (interaction.message) await interaction.message.delete().catch(() => {});
        if (client.pendingVerifications) client.pendingVerifications.delete(memberId);

        // 4. Post confirmation in the channel and delete it after 30s
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
