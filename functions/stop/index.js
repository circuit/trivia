/**
 * Delete all webhook registrations
 */

'use strict';

const fetch = require('node-fetch');
const db = require('../db');
const { domain } = require('../config');

// Initialize the DB with the right domain
db.init(domain);

exports.stop = async (req, res) => {
  try {
    const { token } = await db.getToken();

    if (!token) {
      console.error('No token available to stop webhooks');
      return;
    }

    // Delete previous webhooks
    await fetch(`${domain}/rest/webhooks`, {
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

