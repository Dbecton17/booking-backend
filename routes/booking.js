const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { google } = require('googleapis');

// OAuth2 client setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

/**
 * GET /available-slots
 * Returns available 30-minute time slots for the next 7 days between 10am–5pm
 */
router.get('/available-slots', async (req, res) => {
  const fixedSlot = {
    start: new Date('2025-06-08T17:00:00-05:00').toISOString(),
    end: new Date('2025-06-08T19:00:00-05:00').toISOString(),
  };

  try {
    const events = await calendar.events.list({
      calendarId: 'primary',
      timeMin: fixedSlot.start,
      timeMax: fixedSlot.end,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const count = events.data.items.length;

    if (count >= 10) {
      return res.json([]); // fully booked
    }

    res.json([fixedSlot]);
  } catch (err) {
    console.error('Error checking group slot:', err);
    res.status(500).json({ error: 'Failed to fetch slot' });
  }
});


/**
 * POST /webhook
 * Handles Stripe webhook for completed payments
 */
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook Error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('✅ Payment received:', session.id);
    // Optional: Add logic for confirmation or database logging
  }

  res.status(200).send('Webhook received');
});

module.exports = router;
