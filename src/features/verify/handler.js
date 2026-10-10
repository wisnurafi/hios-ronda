/**
 * Verify button handler — the public, one-click verify flow.
 *
 * Ports the essence of hios-bot's verificationService.verifyUser for the
 * button path: assign the configured verified role, handle already-verified,
 * and validate the bot can actually assign the role (Manage Roles +
 * hierarchy). Replies are ephemeral; the button itself is public so any
 * member — including brand-new ones — can use it.
 */

const { PermissionFlagsBits, MessageFlags } = require("discord.js");
const { log } = require("../../log");
const { getConfig } = require("./store");

const EPHEMERAL = { flags: MessageFlags.Ephemeral };

/**
 * Core verify logic (mirrors hios-bot verifyUser, minus the DB audit trail).
 * Returns { status: 'verified'|'already_verified', roleName } or throws
 * an Error with a user-facing message.
 */
async function verifyMember(guild, userId) {
  const cfg = getConfig(guild.id);

  if (!cfg.enabled) {
    throw new Error("Verification is currently disabled on this server.");
  }
  if (!cfg.verifiedRoleId) {
    throw new Error("Verification isn't set up yet — ask an admin to configure it.");
  }

  const role =
    guild.roles.cache.get(cfg.verifiedRoleId) ??
    (await guild.roles.fetch(cfg.verifiedRoleId).catch(() => null));
  if (!role) {
    throw new Error("The verified role no longer exists — ask an admin to set it again.");
  }

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error("I need the **Manage Roles** permission to verify you.");
  }
  if (me.roles.highest.position <= role.position) {
    throw new Error(
      `I can't assign the **${role.name}** role — it's above my highest role. Ask an admin to fix the role order.`
    );
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    throw new Error("You don't seem to be in this server anymore.");
  }
  if (member.roles.cache.has(role.id)) {
    return { status: "already_verified", roleName: role.name };
  }

  await member.roles.add(role.id, `Verified via button by ${member.user.tag}`);
  log(`verified ${member.user.tag} in ${guild.name} (+${role.name})`);
  return { status: "verified", roleName: role.name };
}

/** Button interaction entry point. */
async function handleVerifyButton(interaction) {
  // Ack first — role API calls can outlast Discord's 3s window.
  await interaction.deferReply(EPHEMERAL).catch(() => {});

  try {
    const result = await verifyMember(interaction.guild, interaction.user.id);
    if (result.status === "already_verified") {
      await interaction.editReply({
        content: "You're already verified. Nothing to do! ✅",
      });
      return;
    }
    await interaction.editReply({
      content: `You're verified! You've been given the **${result.roleName}** role. Welcome! 🎉`,
    });
  } catch (err) {
    log.warn("verify button error:", err.message);
    try {
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content: `Couldn't verify you: ${err.message}` });
      } else {
        await interaction.reply({ ...EPHEMERAL, content: `Couldn't verify you: ${err.message}` });
      }
    } catch {}
  }
}

module.exports = { handleVerifyButton, verifyMember };
