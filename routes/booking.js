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
  try {
    const now = new Date();
    const oneWeekLater = new Date();
    oneWeekLater.setDate(now.getDate() + 7);

    const events = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: oneWeekLater.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const booked = events.data.items.map((e) => ({
      start: new Date(e.start.dateTime),
      end: new Date(e.end.dateTime),
    }));

    const available = [];
    for (let day = 0; day < 7; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() + day);

      for (let hour = 10; hour < 17; hour++) {
        const start = new Date(date);
        start.setHours(hour, 0, 0, 0);
        const end = new Date(start);
        end.setMinutes(start.getMinutes() + 30);

        const conflict = booked.some(
          (e) => start < e.end && end > e.start
        );

        if (!conflict && start > now) {
          available.push({ start: start.toISOString(), end: end.toISOString() });
        }
      }
    }

    res.json(available);
  } catch (err) {
    console.error('Error fetching slots:', err);
    res.status(500).json({ error: 'Failed to fetch available slots' });
  }
});

/**
 * POST /book-slot
 * Creates a calendar event and returns a Stripe Checkout session
 */
router.post('/book-slot', async (req, res) => {
  const { name, email, slot } = req.body;

  try {
    // Create calendar event
    await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: `Booking: ${name}`,
        description: `Booked by ${email}`,
        start: { dateTime: slot.start },
        end: { dateTime: slot.end },
        attendees: [{ email }],
      },
    });

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: '30-Minute Booking',
            },
            unit_amount: 5000, // $50
          },
          quantity: 1,
        },
      ],
      success_url: 'https://yourdomain.com/success',
      cancel_url: 'https://yourdomain.com/cancel',
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Booking failed' });
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
