require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Telegraf } = require('telegraf');

// 1) Environment variables or default values
const CG_API_KEY = process.env.CG_API_KEY || 'YOUR_COINGLASS_API_KEY';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'YOUR_TELEGRAM_CHAT_ID';
const PORT = process.env.PORT || 3000;

// 2) Default thresholds (LONG / SHORT) and default polling interval (in ms)
let longThreshold = 5_000_000;   // e.g. 5M USD
let shortThreshold = 10_000_000; // e.g. 10M USD
let pollingIntervalMs = 60_000;  // default 60 seconds

// Variables to display the latest candle data in the web page
let lastLongLiq = 0;
let lastShortLiq = 0;

// Store the last LONG or SHORT liquidation value we already alerted
let lastLongAlertValue = null;
let lastShortAlertValue = null;

// We will store the timer interval ID, so we can re-schedule it if changed
let intervalId = null;

// ---- Utility functions for formatting ----
function formatWithCommasAndDot(value) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function truncToDecimals(num, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.floor(num * factor) / factor;
}
function formatShortValue(value) {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    const truncated = truncToDecimals(millions, 2);
    return truncated.toString() + 'M';
  } else if (value >= 1_000) {
    const thousands = value / 1_000;
    const truncated = Math.floor(thousands);
    return truncated.toString() + 'K';
  } else {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}

// ---- Initialize Telegraf Bot ----
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
bot.launch().then(() => {
  console.log('Telegraf bot launched successfully.');
});

/**
 * Function to send a Telegram message via Telegraf.
 * Returns true if successful, false otherwise.
 */
async function sendTelegramAlert(message) {
  try {
    await bot.telegram.sendMessage(TELEGRAM_CHAT_ID, message);
    console.log('Telegram alert sent:', message);
    return true;
  } catch (error) {
    console.error('Error sending Telegram alert:', error.message);
    return false;
  }
}

/**
 * Function that queries Coinglass and checks thresholds.
 * Includes optional retry logic if we get ECONNRESET or ETIMEDOUT.
 */
async function checkLiquidations(retryCount = 0) {
  const url = 'https://open-api-v3.coinglass.com/api/futures/liquidation/v3/aggregated-history';
  const params = {
    exchanges: 'ALL',
    symbol: 'BTC',
    interval: '5m', // aggiornamenti ogni minuto
    limit: 1,       // prendi solo l'ultima candela
  };

  try {
    const response = await axios.get(url, {
      headers: {
        accept: 'application/json',
        'CG-API-KEY': CG_API_KEY,
      },
      params: params,
      timeout: 5000, // 5s timeout
    });

    const data = response.data?.data || [];
    if (data.length > 0) {
      const lastCandle = data[0];
      lastLongLiq = parseFloat(lastCandle.longLiquidationUsd || 0);
      lastShortLiq = parseFloat(lastCandle.shortLiquidationUsd || 0);

      console.log(`Latest candle - Long: ${lastLongLiq}, Short: ${lastShortLiq}`);

      // --- Check LONG ---
      if (lastLongLiq > longThreshold) {
        if (lastLongAlertValue === null || lastLongLiq !== lastLongAlertValue) {
          const fullFormat = formatWithCommasAndDot(lastLongLiq);
          const shortFormat = formatShortValue(lastLongLiq);

          const success = await sendTelegramAlert(
            `CG LONG Liquidations\n` +
            `BTCUSDT.P Long Liquidations: $${fullFormat}\n` +
            `($${shortFormat})\n\n` +
            `© 2025 VORFX | All rights reserved.`
          );
          if (success) {
            lastLongAlertValue = lastLongLiq;
          }
        }
      }

      // --- Check SHORT ---
      if (lastShortLiq > shortThreshold) {
        if (lastShortAlertValue === null || lastShortLiq !== lastShortAlertValue) {
          const fullFormat = formatWithCommasAndDot(lastShortLiq);
          const shortFormat = formatShortValue(lastShortLiq);

          const success = await sendTelegramAlert(
            `CG SHORT Liquidations\n` +
            `BTCUSDT.P Short Liquidations: $${fullFormat}\n` +
            `($${shortFormat})\n\n` +
            `© 2025 VORFX | All rights reserved.`
          );
          if (success) {
            lastShortAlertValue = lastShortLiq;
          }
        }
      }
    }

  } catch (error) {
    console.error('Error while calling Coinglass:', error.code || error.message);
    if ((error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') && retryCount < 3) {
      const nextAttempt = retryCount + 1;
      console.log(`Retrying request (attempt ${nextAttempt}) in 5s...`);
      setTimeout(() => checkLiquidations(nextAttempt), 5000);
    }
  }
}

// Schedule the check using setInterval
function scheduleCheckLiquidations() {
  if (intervalId) clearInterval(intervalId);

  intervalId = setInterval(() => {
    checkLiquidations();
  }, pollingIntervalMs);

  console.log(`Polling scheduled every ${(pollingIntervalMs / 1000).toFixed(1)} seconds.`);
}
scheduleCheckLiquidations();

// ---- Set up the Express server ----
const app = express();
app.use(express.urlencoded({ extended: true }));

// GET / => Dashboard with auto-refresh using pollingIntervalMs
app.get('/', (req, res) => {
  const refreshSeconds = pollingIntervalMs / 1000;
  res.send(`
    <html>
      <head>
        <meta http-equiv="refresh" content="${refreshSeconds}">
        <title>BTC Liquidations Dashboard (Telegraf version)</title>
      </head>
      <body>
        <h1>BTC Liquidations Dashboard (Telegraf version)</h1>
        <p>
          <strong>Latest candle data:</strong><br>
          Long Liquidations: ${lastLongLiq.toLocaleString()}<br>
          Short Liquidations: ${lastShortLiq.toLocaleString()}
        </p>
        <hr>
        <form method="POST" action="/set-params">
          <label>Long Threshold (USD):</label>
          <input type="number" name="longThreshold" value="${longThreshold}" step="1000" /><br><br>
          <label>Short Threshold (USD):</label>
          <input type="number" name="shortThreshold" value="${shortThreshold}" step="1000" /><br><br>
          <label>Polling Interval (seconds):</label>
          <input type="number" name="pollInterval" value="${refreshSeconds}" step="1" /><br><br>
          <button type="submit">Save Settings</button>
        </form>
        <hr>
        <p>
          <strong>Current settings:</strong><br>
          Long Threshold > $${longThreshold.toLocaleString()}<br>
          Short Threshold > $${shortThreshold.toLocaleString()}<br>
          Polling Interval: ${refreshSeconds.toLocaleString()} seconds
        </p>
      </body>
    </html>
  `);
});

// POST /set-params => Update thresholds and polling interval
app.post('/set-params', (req, res) => {
  const lt = parseFloat(req.body.longThreshold);
  const st = parseFloat(req.body.shortThreshold);
  const pi = parseFloat(req.body.pollInterval);

  if (!isNaN(lt)) longThreshold = lt;
  if (!isNaN(st)) shortThreshold = st;
  if (!isNaN(pi) && pi > 0) {
    pollingIntervalMs = pi * 1000;
    scheduleCheckLiquidations();
  }

  res.redirect('/');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
