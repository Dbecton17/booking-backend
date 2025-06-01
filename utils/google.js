const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// 🔐 You’ll add a token here manually for now
oauth2Client.setCredentials({
  refresh_token: 'your_google_refresh_token_here'
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

async function createBookingEvent({ summary, description, startTime, endTime }) {
  const event = {
    summary,
    description,
    start: {
      dateTime: startTime,
      timeZone: 'America/Chicago',
    },
    end: {
      dateTime: endTime,
      timeZone: 'America/Chicago',
    },
  };

  return await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  });
}

module.exports = { createBookingEvent };