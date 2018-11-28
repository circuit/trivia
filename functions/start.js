/**
 * Registers a CONVERSATION.ADD_ITEM and USER.SUBMIT_FORM_DATA webhook
 * with the Circuit REST API which starts up the Trivia Bot.
 */

'use strict';

const fetch = require('node-fetch');
const simpleOauth2 = require('simple-oauth2');
const db = require('./shared/db');
const { DOMAIN, CLIENT_ID, CLIENT_SECRET, CLOUD_FN_HOST } = process.env;

// Initialize the DB with the right domain
db.init(DOMAIN);

async function authenticate () {
  try {
    const oauth2 = simpleOauth2.create({
      client: {
        id: CLIENT_ID,
        secret: CLIENT_SECRET
      },
      auth: {
        tokenHost: DOMAIN
      }
    });

    const token = await oauth2.clientCredentials.getToken({scope: 'ALL'})
    console.log('Circuit Client Credentials Token: ', token);

    // Get bot user object
    let user = await fetch(`${DOMAIN}/rest/users/profile`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token.access_token }
    });
    user = await user.json();
    console.log('Logged on as: ', user.emailAddress);

    return {
      userId: user.userId,
      token: token.access_token
    }
  } catch (err) {
    console.error(err);
  }
}

exports.start = async (req, res) => {
  try {
    // Authenticate with Circuit for a specific domain
    const { userId, token } = await authenticate();

    // Save/update token in Cloud Datastore
    await db.saveToken(userId, token);

    // Delete previous webhooks
    await fetch(`${DOMAIN}/rest/webhooks`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });

    // Register new webhook for USER.SUBMIT_FORM_DATA
    let webhookId = await fetch(`${DOMAIN}/rest/webhooks`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token
      },
      body: `url=${encodeURI(`${CLOUD_FN_HOST}/submitFormData`)}&filter=USER.SUBMIT_FORM_DATA`
    });
    console.log(`Webhook ${webhookId} created for USER.SUBMIT_FORM_DATA`);

    // Register new webhook for CONVERSATION.ADD_ITEM
    webhookId = await fetch(`${DOMAIN}/rest/webhooks`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token
      },
      body: `url=${encodeURI(`${CLOUD_FN_HOST}/addTextItem`)}&filter=CONVERSATION.ADD_ITEM`
    });
    console.log(`Webhook ${webhookId} created for CONVERSATION.ADD_ITEM`);

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(500).send(err && err.message);
  }
};

