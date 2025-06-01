const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
router.post('/create-checkout-session', async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: '30-Min Booking',
            },
            unit_amount: 5000, // $50.00
          },
          quantity: 1,
        },
      ],
      success_url: 'https://booking-backend-kmy5.onrender.com/success',
      cancel_url: 'https://booking-backend-kmy5.onrender.com/cancel',
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
router.post('/webhook', async (req, res) => {
  let event;

  try {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('⚠️ Webhook Error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('✅ Payment received:', session);

    // TODO: Add Google Calendar event creation here
  }

  res.status(200).send('Webhook received');
});

module.exports = router;