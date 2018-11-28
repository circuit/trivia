/**
 * Webhook for Circuit USER.SUBMIT_FORM_DATA event.
 */

'use strict';

const fetch = require('node-fetch');
const utils = require('../utils');
const config = require('../config');
const db = require('../db');

// Circuit domain
const domain = config.domain

// Circuit token
let token, userId;

// Initialize the DB with the right domain
db.init(domain);

/**
 * Cloud function entry point called by the Circuit server
 * when a form is submitted
 */
exports.submitFormData = async (req, res) => {
  if (req.body.type !== 'USER.SUBMIT_FORM_DATA') {
    res.status(500).send('Incorrect type');
    return;
  }
  const { formId, itemId, submitterId, data } = req.body.submitFormData;

  if (formId !== 'trivia') {
    res.status(500).send('Incorrect form');
    return;
  }

  console.log(`Form submission by ${submitterId} on item ${itemId}`);

  // Check if question has expired
  const question = await db.getQuestion(itemId);
  if (!question || question.status === 'expired') {
    console.log(`Question has expired. itemId: ${itemId}`);
    return;
  }

  // Lookup in DB if user has already submitted an answer, if so don't
  // accept this new submission
  const alreadySubmitted = await db.getSubmission(itemId, submitterId);
  if (alreadySubmitted) {
    console.log(`Ignore multiple submissions. userId: ${submitterId}`);
    return;
  }

  // Get token and bot userId from Datastore
  ({token, userId} = await db.getToken());

  const isCorrect = data[0].value === question.correctAnswer;

  // In parallel updating item with submission count and
  // add new submission to DB
  await Promise.all([
    incrementSubmissionCount(itemId),
    db.addSubmission(itemId, submitterId, data[0].value, isCorrect)
  ]);

  res.sendStatus(200);
};

async function incrementSubmissionCount(itemId) {
  // Lookup item in Circuit so it can be updated
  let url = `${domain}/rest/conversations/messages/${itemId}`;

  let item = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  item = await item.json();

  // Increment submission count
  const form = JSON.parse(item.text.formMetaData);
  form.controls[3].text = parseInt(form.controls[3].text) + 1 + ' submission(s)';

  url = `${domain}/rest/conversations/${item.convId}/messages/${itemId}`;
  await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({
      formMetaData: JSON.stringify(form)
    })
  });
}
