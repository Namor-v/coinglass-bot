// telegram.js

require('dotenv').config();
const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'INSERISCI_IL_TUO_TOKEN';
const MY_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'INSERISCI_CHAT_ID';

async function sendTelegramAlert(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const response = await axios.post(url, {
      chat_id: MY_CHAT_ID,
      text: message
    });
    console.log('Messaggio Telegram inviato:', response.data);
  } catch (error) {
    console.error('Errore invio Telegram:', error);
  }
}

// Esempio di test:
sendTelegramAlert('Ciao dal mio bot in Node!');
