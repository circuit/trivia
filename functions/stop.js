/**
 * Delete all webhook registrations
 */

'use strict';

const fetch = require('node-fetch');
const db = require('./shared/db');
const { DOMAIN } = process.env;

// Initialize the DB with the right domain
db.init(DOMAIN);

exports.stop = async (req, res) => {
  try {
    const { token } = await db.getToken();

    if (!token) {
      console.error('No token available to stop webhooks');
      return;
    }

    // Delete previous webhooks
    await fetch(`${DOMAIN}/rest/webhooks`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });

    console.info('Webhooks deleted');
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(500).send(err && err.message);
  }
};

