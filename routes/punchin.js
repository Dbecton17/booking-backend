
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

// Define Punch In Showcase booking slot times
const punchInSlots = [
  { day: 1, start: "23:00", end: "24:00" }, // Monday
  { day: 3, start: "23:00", end: "24:00" }, // Wednesday
  { day: 4, start: "23:00", end: "24:00" }, // Thursday
  { day: 0, start: "16:00", end: "19:00" }  // Sunday
];

function getNextSlots() {
  const slots = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    const day = date.getDay();
    const slotDef = punchInSlots.find(s => s.day === day);
    if (!slotDef) continue;

    const [startHour, startMin] = slotDef.start.split(":").map(Number);
    const [endHour, endMin] = slotDef.end.split(":").map(Number);

    for (let time = startHour; time < endHour; time += 0.5) {
      const start = new Date(date);
      start.setHours(Math.floor(time), (time % 1) * 60, 0, 0);

      const end = new Date(start);
      end.setMinutes(end.getMinutes() + 30);

      slots.push({
        start: start.toISOString(),
        end: end.toISOString()
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
