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
    body: 'This is a test message from your Twilio WhatsApp integration!'
  })
  .then(message => {
    console.log('Message sent! SID:', message.sid);
  })
  .catch(error => {
    console.error('Twilio error:', error.message);
  });
