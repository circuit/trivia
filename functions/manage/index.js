/**
 * Cloud Functions to manage the trivia app
 * start: gets an OAuth token,then registers a CONVERSATION.ADD_ITEM
 *        and USER.SUBMIT_FORM_DATA webhook with the Circuit REST API
 *        which starts up the Trivia Bot.
 * stop:  unregisters the Circuit webhooks
 */

'use strict';

const fetch = require('node-fetch');
const simpleOauth2 = require('simple-oauth2');
const datastore = require('@google-cloud/datastore')();

const { DOMAIN, CLIENT_ID, CLIENT_SECRET, CLOUD_FN_HOST } = process.env;

// Define datastore namespace based on system
const ns = 'trivia_' + DOMAIN.split('//')[1];

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
    const key = datastore.key({
      namespace: ns,
      path: ['token', DOMAIN]
    });
    const entity = {
      key: key,
      data: {
        domain: DOMAIN,
        userId,
        token,
        created:  new Date().toJSON()
      }
    }
    await datastore.upsert(entity);

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
      body: `url=${encodeURI(`${CLOUD_FN_HOST}/webhook`)}&filter=USER.SUBMIT_FORM_DATA`
    });
    console.log(`Webhook ${webhookId} created for USER.SUBMIT_FORM_DATA`);

    // Register new webhook for CONVERSATION.ADD_ITEM
    webhookId = await fetch(`${DOMAIN}/rest/webhooks`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token
      },
      body: `url=${encodeURI(`${CLOUD_FN_HOST}/webhook`)}&filter=CONVERSATION.ADD_ITEM`
    });
    console.log(`Webhook ${webhookId} created for CONVERSATION.ADD_ITEM`);

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(500).send(err && err.message);
  }
};

exports.stop = async (req, res) => {
  try {
    const key = datastore.key({
      namespace: ns,
      path: ['token', DOMAIN]
    });
    const entity = await datastore.get(key);

    if (!entity.length) {
      console.error('No token available to stop webhooks. Run start first to get a token again.');
      return;
    }
    const token = entity[0].token;

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
