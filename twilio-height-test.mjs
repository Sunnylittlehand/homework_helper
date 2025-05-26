import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config();

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

client.messages
  .create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: process.env.TWILIO_WHATSAPP_TO,
    body: 'How tall am I? (Test message from your Twilio WhatsApp integration)'
  })
  .then(message => {
    console.log('Height test message sent! SID:', message.sid);
  })
  .catch(error => {
    console.error('Twilio error:', error.message);
  });
