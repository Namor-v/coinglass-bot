require('dotenv').config();
const express = require('express');
const axios = require('axios');

// 1) Environment variables or default values
const CG_API_KEY = process.env.CG_API_KEY || 'YOUR_COINGLASS_API_KEY';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'YOUR_TELEGRAM_CHAT_ID';
const PORT = process.env.PORT || 3000;

// 2) Default thresholds (LONG / SHORT) and default polling interval (in ms)
let longThreshold = 5_000_000;       // e.g. 5M USD
let shortThreshold = 10_000_000;     // e.g. 10M USD
let pollingIntervalMs = 60_000;      // 60,000 ms = 60 seconds

// Variables to display the latest candle data in the web page
let lastLongLiq = 0;
let lastShortLiq = 0;

// We will store the timer interval ID, so we can re-schedule it if changed
let intervalId = null;

// 3) Function to send a Telegram message
async function sendTelegramAlert(message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message
        });
        console.log('Telegram alert sent:', message);
    } catch (error) {
        console.error('Error sending Telegram alert:', error.response?.data || error.message);
    }
}

/**
 * 4) Function that queries Coinglass and checks thresholds.
 *    Includes optional retry logic (max 3 attempts) if we get ECONNRESET or ETIMEDOUT.
 */
async function checkLiquidations(retryCount = 0) {
    const url = 'https://open-api-v3.coinglass.com/api/futures/liquidation/v3/aggregated-history';
    const params = {
        exchanges: 'ALL',
        symbol: 'BTC',
        interval: '1m',
        limit: 1, // get only the latest candle
    };

    try {
        const response = await axios.get(url, {
            headers: {
                accept: 'application/json',
                'CG-API-KEY': CG_API_KEY,
            },
            params: params,
            timeout: 5000, // 5 seconds timeout
        });

        const data = response.data?.data || [];
        if (data.length > 0) {
            const lastCandle = data[0];
            lastLongLiq = parseFloat(lastCandle.longLiquidationUsd || 0);
            lastShortLiq = parseFloat(lastCandle.shortLiquidationUsd || 0);

            console.log(`Latest candle - Long: ${lastLongLiq}, Short: ${lastShortLiq}`);

            // Check if LONG exceeds threshold
            if (lastLongLiq > longThreshold) {
                await sendTelegramAlert(
                    `CG LONG Liquidations\n` +
                    `BTCUSDT.P Long Liquidations: $${lastLongLiq.toLocaleString()}\n\n` +
                    `© 2025 VORFX | All rights reserved.`
                );
            }

            // Check if SHORT exceeds threshold
            if (lastShortLiq > shortThreshold) {
                await sendTelegramAlert(
                    `CG SHORT Liquidations\n` +
                    `BTCUSDT.P Short Liquidations: $${lastShortLiq.toLocaleString()}\n\n` +
                    `© 2025 VORFX | All rights reserved.`
                );
            }
        }

    } catch (error) {
        console.error('Error while calling Coinglass:', error.code || error.message);

        // Optional: retry logic if connection was reset or timed out
        if (
            (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') &&
            retryCount < 3
        ) {
            const nextAttempt = retryCount + 1;
            console.log(`Retrying request (attempt ${nextAttempt}) in 5s...`);
            setTimeout(() => checkLiquidations(nextAttempt), 5000);
        }
    }
}

// 5) Schedule the check using setInterval, storing the interval ID
function scheduleCheckLiquidations() {
    // If an interval is already running, clear it
    if (intervalId) clearInterval(intervalId);

    // Create a new interval with the current polling interval
    intervalId = setInterval(() => {
        checkLiquidations();
    }, pollingIntervalMs);

    console.log(
        `Polling scheduled every ${(pollingIntervalMs / 1000).toFixed(1)} seconds.`
    );
}

// Start the initial scheduling
scheduleCheckLiquidations();

// 6) Set up the Express server
const app = express();
app.use(express.urlencoded({ extended: true }));

// GET / => Simple HTML form to display and set thresholds + interval
app.get('/', (req, res) => {
    res.send(`
    <h1>BTC Liquidations Dashboard</h1>
    
    <p>
      <strong>Latest candle data:</strong><br>
      Long Liquidations: ${lastLongLiq.toLocaleString()} <br>
      Short Liquidations: ${lastShortLiq.toLocaleString()}
    </p>
    <hr>
    <form method="POST" action="/set-params">
      <label>Long Threshold (USD):</label>
      <input type="number" name="longThreshold" value="${longThreshold}" step="1000" /><br><br>

      <label>Short Threshold (USD):</label>
      <input type="number" name="shortThreshold" value="${shortThreshold}" step="1000" /><br><br>

      <label>Polling Interval (seconds):</label>
      <input type="number" name="pollInterval" value="${(pollingIntervalMs / 1000)}" step="1" /><br><br>

      <button type="submit">Save Settings</button>
    </form>
    <hr>
    <p>
      <strong>Current settings:</strong><br>
      Long Threshold > $${longThreshold.toLocaleString()} <br>
      Short Threshold > $${shortThreshold.toLocaleString()} <br>
      Polling Interval: ${(pollingIntervalMs / 1000).toLocaleString()} seconds
    </p>
  `);
});

// POST /set-params => Updates thresholds and polling interval
app.post('/set-params', (req, res) => {
    const lt = parseFloat(req.body.longThreshold);
    const st = parseFloat(req.body.shortThreshold);
    const pi = parseFloat(req.body.pollInterval);

    if (!isNaN(lt)) {
        longThreshold = lt;
    }
    if (!isNaN(st)) {
        shortThreshold = st;
    }
    if (!isNaN(pi) && pi > 0) {
        // convert from seconds to milliseconds
        pollingIntervalMs = pi * 1000;
        // reschedule the interval
        scheduleCheckLiquidations();
    }

    // Redirect back to the homepage
    res.redirect('/');
});

// 7) Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
