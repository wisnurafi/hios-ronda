const config = require("./config");

/**
 * Bot owners (OWNER_IDS env): super-admins above per-server Administrators.
 * An owner can manage dashboards in any guild, admin or not.
 */
function isBotOwner(userId) {
  return !!userId && config.owners.includes(String(userId));
}

module.exports = { isBotOwner };
