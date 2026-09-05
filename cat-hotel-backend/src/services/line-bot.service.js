// Chatbot command logic, dispatched by the webhook route (see
// routes/line-webhook.routes.js). Each LINE "event" (message, follow,
// postback, etc.) is handled independently and failures are isolated
// per-event so one bad message never breaks the whole webhook batch
// LINE sent us.
const { lineClient } = require('../config/line-client');
const userService = require('../services/user.service');
const pointsService = require('../services/points.service');
const messageLog = require('../services/line-message-log.service');

async function replyText(replyToken, text) {
  await lineClient.replyMessage({
    replyToken,
    messages: [{ type: 'text', text }],
  });
}

/**
 * The "Points" command: a signed-up user sends the word "Points" (case
 * insensitive) in the OA chat, and the bot replies with their current
 * balance and tier - read straight from PostgreSQL, no LINE-side state
 * involved. This is the same points.service used by the REST API, so
 * the balance shown here is always consistent with what the web
 * frontend shows.
 */
async function handlePointsCommand(event, lineUserId) {
  const user = await userService.getUserByLineId(lineUserId);

  if (!user) {
    // This LINE user has messaged the OA but never completed LINE
    // Login on our site, so we have no row for them yet.
    await replyText(
      event.replyToken,
      'We don\u2019t have an account for you yet. Please sign in on our website first, then try again!'
    );
    return;
  }

  const balance = await pointsService.getBalance(user.id);
  const tierLine = balance.tier_name ? ` (${balance.tier_name} tier)` : '';
  await replyText(
    event.replyToken,
    `Hi ${user.display_name}! You currently have ${balance.points_balance} points${tierLine}.`
  );
}

async function handleUnknownText(event) {
  await replyText(
    event.replyToken,
    'Sorry, I didn\u2019t understand that. Try sending "Points" to check your balance.'
  );
}

/**
 * Routes a single LINE webhook event to the right handler. Only
 * text-message events are handled for now; other event types
 * (follow, unfollow, postback, image, etc.) are logged and ignored -
 * extend this switch as more bot features are added.
 */
async function handleEvent(event) {
  const lineUserId = event.source?.userId ?? null;
  // Look up our internal user id (if any) purely for logging purposes -
  // command handlers below do their own lookup/error-handling.
  const knownUser = lineUserId ? await userService.getUserByLineId(lineUserId) : null;

  if (event.type === 'message' && event.message.type === 'text') {
    await messageLog.logMessage({
      userId: knownUser?.id,
      direction: 'inbound',
      messageType: 'text',
      payload: { text: event.message.text, lineUserId },
    });

    const command = event.message.text.trim().toLowerCase();

    if (command === 'points') {
      await handlePointsCommand(event, lineUserId);
    } else {
      await handleUnknownText(event);
    }
    return;
  }

  // Non-text events (follow/unfollow/postback/sticker/...) - no-op for now.
}

module.exports = { handleEvent };
