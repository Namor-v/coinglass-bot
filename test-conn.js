// index.js

// 1) Se usi dotenv, richiamalo in cima:
require('dotenv').config();

// 2) Import di axios:
const axios = require('axios');

// 3) Qui puoi mettere l’API key di Coinglass. 
// Se usi dotenv, crea un file .env con una riga tipo:
// CG_API_KEY=la_tua_chiave_segreta
// E qui scrivi:
const CG_API_KEY = process.env.CG_API_KEY || 'fb583335314b4ddd824dc9f324cb62f9';

// 4) Una funzione asincrona per testare la chiamata:
async function testCoinglass() {
  try {
    // Facciamo una GET sulle liquidazioni 1d (modifica a tuo piacere)
    // Ad es. usiamo l'intervallo 1m e limit=1 per avere l’ultima candela
    const url = 'https://open-api-v3.coinglass.com/api/futures/liquidation/v3/aggregated-history';
    const params = {
      exchanges: 'ALL',
      symbol: 'BTC',
      interval: '1m',
      limit: 1
    };
    
    // Eseguiamo la chiamata
    const response = await axios.get(url, {
      headers: {
        'accept': 'application/json',
        'CG-API-KEY': CG_API_KEY,
      },
      params: params
    });
    
    // Stampiamo il risultato
    console.log('Risposta Coinglass:', response.data);

  } catch (error) {
    console.error('Errore nella chiamata Coinglass:', error.message);
  }
}

// 5) Esegui la funzione di test
testCoinglass();
