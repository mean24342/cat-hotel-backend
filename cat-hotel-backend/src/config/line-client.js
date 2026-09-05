// Messaging API client (for the Official Account / bot) and the
// bot-sdk middleware config used to verify webhook signatures.
// This is a SEPARATE channel from LINE Login - see README for why.
const line = require('@line/bot-sdk');
const env = require('./env');

const messagingConfig = {
  channelSecret: env.lineMessaging.channelSecret,
  channelAccessToken: env.lineMessaging.channelAccessToken,
};

const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: messagingConfig.channelAccessToken,
});

module.exports = { line, messagingConfig, lineClient };
