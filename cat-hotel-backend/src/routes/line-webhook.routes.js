const express = require('express');
const { line, messagingConfig } = require('../config/line-client');
const lineBotService = require('../services/line-bot.service');

const router = express.Router();

/**
 * IMPORTANT: `line.middleware(messagingConfig)` needs the RAW request
 * body to compute and verify the `X-Line-Signature` header (HMAC-SHA256
 * of the body, keyed by the channel secret). If express.json() has
 * already parsed/consumed the body before this middleware runs, the
 * signature check will fail for every request.
 *
 * That's why this router is mounted BEFORE app.use(express.json()) in
 * app.js - see the comment there. Do not move this route below the
 * global JSON body parser.
 */
router.post(
  '/webhook',
  line.middleware(messagingConfig),
  async (req, res) => {
    // Acknowledge LINE immediately with 200. LINE expects a fast
    // response (~within a few seconds) and will retry the whole
    // webhook delivery if it doesn't get one - so we respond first,
    // then process events. Errors inside individual event handlers
    // are caught per-event so they can't crash this response.
    res.status(200).end();

    const events = req.body.events || [];
    await Promise.all(
      events.map((event) =>
        lineBotService.handleEvent(event).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Error handling LINE event:', event.type, err);
        })
      )
    );
  }
);

module.exports = router;
