
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { google } = require('googleapis');

// Setup OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

const { DateTime } = require("luxon"); // Only if backend — for frontend use CDN

const punchInSlots = [
  { day: 1, start: "18:00", end: "20:00" }, // Monday
  { day: 3, start: "18:00", end: "20:00" }, // Wednesday
  { day: 4, start: "18:00", end: "20:00" }, // Thursday
  { day: 0, start: "11:00", end: "14:00" }  // Sunday
];

function generateSlots() {
  const now = DateTime.now().setZone("America/Chicago");
  const slots = [];

  for (let i = 0; i < 7; i++) {
    const day = now.plus({ days: i });
    const dayOfWeek = day.weekday % 7; // Sunday = 0, Monday = 1, etc.

    const matchingSlot = punchInSlots.find(s => s.day === dayOfWeek);
    if (matchingSlot) {
      const start = DateTime.fromFormat(`${day.toISODate()} ${matchingSlot.start}`, 'yyyy-MM-dd HH:mm', { zone: 'America/Chicago' });
      const end = DateTime.fromFormat(`${day.toISODate()} ${matchingSlot.end}`, 'yyyy-MM-dd HH:mm', { zone: 'America/Chicago' });

      slots.push({
        start: start.toUTC().toISO(),
        end: end.toUTC().toISO()
      });
    }
  }

  return slots;
}


router.get('/api/punchin/available-slots', async (req, res) => {
  try {
    const proposedSlots = getNextSlots();
    const bookedEvents = await calendar.events.list({
      calendarId: 'primary',
      timeMin: proposedSlots[0].start,
      timeMax: proposedSlots[proposedSlots.length - 1].end,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const taken = bookedEvents.data.items.map(e => e.start.dateTime);
    const available = proposedSlots.filter(slot => !taken.includes(slot.start));
    res.json(available);
  } catch (err) {
    console.error("Error fetching Punch In slots:", err);
    res.status(500).json({ error: "Failed to fetch slots" });
  }
});

router.post('/api/punchin/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Punch In Showcase Booking' },
          unit_amount: 15000,
        },
        quantity: 1,
      }],
      success_url: 'https://theoaka.com/#booked',
      cancel_url: 'https://theoaka.com/#cancel',
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe Error (Punch In):", err);
    res.status(500).json({ error: "Could not start checkout" });
  }
});

module.exports = router;
