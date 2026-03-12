// src/events/guildMemberAdd.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export default {
  name: 'guildMemberAdd',
  async execute(member, client) {
    const channelId = process.env.VERIFICATION_CHANNEL_ID;
    const pingRole1 = process.env.PING_ROLE_1_ID;
    const pingRole2 = process.env.PING_ROLE_2_ID;

    if (!channelId) {
      return console.warn('[VERIFY] VERIFICATION_CHANNEL_ID is not set in .env');
    }

    const channel = member.guild.channels.cache.get(channelId);
    if (!channel) {
      return console.warn('[VERIFY] Verification channel not found — check VERIFICATION_CHANNEL_ID');
    }

    const role1Mention = pingRole1 ? `<@&${pingRole1}>` : '`[Role 1 not set]`';
    const role2Mention = pingRole2 ? `<@&${pingRole2}>` : '`[Role 2 not set]`';

    const embed = new EmbedBuilder()
      .setTitle('🔔 New Member Pending For Verification')
      .setDescription(
        `${member} Welcome To Th\n\n` +
        `**To verify them, as a Staff Or A Ceo, You must type:**\n` +
        `\`\`\`\n` +
        `verify @${member.user.username} associate\n` +
        `  — or —\n` +
        `verify @${member.user.username} outsider\n` +
        `\`\`\``
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setColor(0x5865f2)
      .addFields(
        { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'User ID',         value: member.id,                                                  inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `${member.guild.name} Verification System` });

    // ── Kick / Ban buttons — store member ID in customId so we know who to action ──
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`verify_kick_${member.id}`)
        .setLabel('Kick')
        // .setEmoji('👢') // Temporarily commented out to test for encoding issues
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`verify_ban_${member.id}`)
        .setLabel('Ban')
        // .setEmoji('🔨') // Temporarily commented out to test for encoding issues
        .setStyle(ButtonStyle.Danger),
    );

    try {
      const alertMessage = await channel.send({
        content: `${role1Mention} ${role2Mention} — A new member needs verification!`,
        embeds: [embed],
        components: [row],
      });

      if (!client.pendingVerifications) client.pendingVerifications = new Map();
      client.pendingVerifications.set(member.id, alertMessage.id);

      console.log(`[VERIFY] Join alert sent for ${member.user.tag}`);
    } catch (error) {
      // If Discord rejects the buttons, this will tell us exactly why!
      console.error('[VERIFY ERROR] Failed to send the join alert message:', error);
    }
  },
};
