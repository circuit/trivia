/**
 * Single webhook cloud function that is invoked by Circuit webhooks
 * CONVERSATION.ADD_ITEM and USER.SUBMIT_FORM_DATA.
 * CONVERSATION.ADD_ITEM is invoked for any new Circuit message
 * USER.SUBMIT_FORM_DATA is triggered when a user sibmits an answer
 *
 * Done as a single cloud function to reduce the cold start time for
 * submitting an answer.
 */

'use strict';

const fetch = require('node-fetch');
const structjson = require('./structjson');
const dialogFlow = require('./dialogFlow');
const utils = require('./utils');
const db = require('./db');

const ANSWER_TIME = 20; // in seconds

// Circuit domain
const { DOMAIN } = process.env;

// Circuit token and bot userId
let token, userId;

// Initialize the DB with the right domain
db.init(DOMAIN);

// Intents for DialogFlow
const Intents = {
  NEW_QUESTION: 'New question',
  LIST_CATEGORIES: 'List categories',
  SHOW_STATS: 'Show stats',
  ABOUT: 'About',
  HELP: 'Help'
}

/**
 * Get category IDs for its name
 * @param {String} name
 */
function getCategoryId(name) {
  const Categories = {
    'General Knowledge': 9,
    'Sports': 21,
    'Geography': 22,
    'History': 23,
    'Entertainment': [10, 11, 12, 13, 14, 16],
    'Science': [17, 18, 19]
  }
  const c = Categories[name];
  if (Array.isArray(c)) {
    return c[Math.floor(Math.random() * c.length)];
  }
  return c;
}

/**
 * Post a new question
 * @param {String} convId Conversation ID
 * @param {String} parentItemId Parent Item ID
 * @param {String} agentParams DialogFlow agent response parameters
 */
async function postNewQuestion(convId, parentItemId, agentParams) {
  console.log(`postNewQuestion, convId=${convId}, parentItemId=${parentItemId}`);

  let url = 'https://opentdb.com/api.php?amount=1&type=multiple';
  agentParams && agentParams.difficulty && (url += `&difficulty=${agentParams.difficulty.toLowerCase()}`);
  agentParams && agentParams.category && (url += `&category=${getCategoryId(agentParams.category)}`);

  let res = await fetch(url);
  res = await res.json();
  res = res.results[0];

  let form = {
    id: 'trivia',
    controls: [{
      type: 'LABEL',
      text: `<b>${res.question}</b>`
    }, {
      name: 'choices',
      type: 'RADIO',
      options: []
    }, {
      type: 'BUTTON',
      options: [{
        text: 'Submit',
        action: 'submit',
        notification: 'Answer submitted'
      }]
    }, {
      type: 'LABEL',
      text: '0 submissions'
    }]
  }

  const choices = [res.correct_answer].concat(res.incorrect_answers);
  utils.shuffle(choices);
  choices.forEach(choice => {
    form.controls[1].options.push({
      text: choice,
      value: choice
    });
  });

  let content = `Here is ${res.difficulty === 'easy' ? 'an <b>easy</b>' : 'a <b>' + res.difficulty + '</b>'} question of category <b>${res.category}</b>.<br>`;
  content += `You have ${ANSWER_TIME} seconds to answer.`;

  url = `${DOMAIN}/rest/conversations/${convId}/messages`;
  parentItemId && (url += `/${parentItemId}`);

  let item = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({
      content: content,
      formMetaData: JSON.stringify(form)
    })
  });
  item = await item.json();

  res.convId = item.convId;
  res.itemId = item.itemId;
  res.form = JSON.stringify(form);
  await db.addQuestion(res);

  // Wait some time
  await utils.timeout(ANSWER_TIME * 1000);

  // Mark question as expired
  await db.expireQuestion(item.itemId);

  // Wait 1 more second to make sure question is not updated by submitDataForm
  await utils.timeout(1000);

  // Get users with correct answer from DB in order of submission timestamp
  const submissions = await db.getSubmissionsByItemId(item.itemId);
  let winners = submissions
    .filter(s => s.value === res.correct_answer)
    .map(s => s.submitterId);

  // Build result
  content = `Here is ${res.difficulty === 'easy' ? 'an <b>easy</b>' : 'a <b>' + res.difficulty + '</b>'} question of category <b>${res.category}</b>.`;
  content += `<br>Time's up.`;

  if (winners.length) {
    // Get their names
    url = `${DOMAIN}/rest/users/list?name=${winners.join(',')}`;

    let users = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    users = await users.json();

    winners = users.map(u => u.displayName);
  }

  let resultText = '';
  if (!submissions.length) {
    resultText += 'Sorry you are out of time. Try again.';
  } else if (winners.length) {
    resultText += `Correct answers from: <b>${winners.join(', ')}</b>`;
  } else {
    resultText += 'No correct answers submitted &#128542';
  }

  form = {
    id: 'trivia',
    controls: [{
      type: 'LABEL',
      text: `<b>${res.question}</b>`
    }, {
      type: 'LABEL',
      text: `The correct answer is: <b>${res.correct_answer}</b>`
    }, {
      type: 'LABEL',
      text: resultText
    }]
  }

  // Post result
  url = `${DOMAIN}/rest/conversations/${convId}/messages/${item.itemId}`;
  await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({
      content: content,
      formMetaData: JSON.stringify(form)
    })
  });
}

/**
 * Post a message
 * @param {String} convId Conversation ID
 * @param {String} parentItemId Parent Item ID. Posted as comment is parameter is present.
 */
async function showStats(convId, parentItemId) {
  console.log(`showStats, convId=${convId}, parentItemId=${parentItemId}`);

  const stats = await db.getStats();

  const userIds = Object.keys(stats.users);
  let users = [];

  for (let i = 0; i < userIds.length; i = i + 6) {
    let userIdsPart = userIds.slice(i, i + 6);
  	let url = `${DOMAIN}/rest/users/list?name=${userIdsPart.join(',')}`;
    console.log(`url`, url);
  	let usersPart = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
  	});
    usersPart = await usersPart.json();
    [].push.apply(users, usersPart);
  }

  console.log('users:', users);
  users.forEach(u => stats.users[u.userId].name = u.displayName);

  // Convert to array and sort
  users = Object.keys(stats.users)
    .map(id => stats.users[id])
    .sort((a, b) => b.percentage - a.percentage);

  let content = `Total questions posted: <b>${stats.questionCount}</b>`;
  content += `<br>Total answers submitted: <b>${stats.submissionCount}</b>`;
  if (users.length) {
    content += '<br><br>The percentages for correct answers are:<br><ol>';
    users.map(u => content += `<li>${u.name}: ${u.percentage}%</li>`);
    content += '</ol>';
  }

  let url = `${DOMAIN}/rest/conversations/${convId}/messages`;
  parentItemId && (url += `/${parentItemId}`);

  await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({content: content})
  });
}


/**
 * Post a message
 * @param {String} convId Conversation ID
 * @param {String} parentItemId Parent Item ID. Posted as comment is parameter is present.
 * @param {String} content Message content
 */
async function postMessage(convId, parentItemId, content) {
  console.log(`listCategories, convId=${convId}, parentItemId=${parentItemId}`);

  let url = `${DOMAIN}/rest/conversations/${convId}/messages`;
  parentItemId && (url += `/${parentItemId}`);

  await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({content: content})
  });
}

async function handleConversationAddItem(req, res) {
  const item = req.body && req.body.item;
  console.log('addTextItem called for item: ', item.itemId);

  // Get token and bot userId from Datastore
  ({token, userId} = await db.getToken());

  console.log(`token data fetched: ${token}, ${userId}`);

  if (item.creatorId === userId) {
    // Message sent by bot. Skip it.
    console.log('Message sent by bot. Skip it.');
    res.sendStatus(200);
    return;
  }

  if (!item.text) {
    // Not a text item. Skip it.
    console.log('Not a text item. Skip it.');
    res.sendStatus(200);
    return;
  }

  const msg = utils.getMentionedContent(item.text.content, userId);
  if (!msg) {
    // User is not mentioned, skip it. Once the new API is available to
    // only get the event when being mentioned, this will not be needed
    res.sendStatus(200);
    return;
  }

  // Send request and log result
  try {

    const result = await dialogFlow.detectIntent(msg);
    console.log(`Query: ${result.queryText}`);
    if (result.intent) {
      console.log(`Intent: ${result.intent.displayName}`);

      // Convert struct parameters to JSON
      const parms = structjson.structProtoToJson(result.parameters);

      // item.text.parentId is for backwards compatibility
      const parentId = item.parentId || item.text.parentId || item.itemId;

      switch (result.intent.displayName) {
        case Intents.NEW_QUESTION:
        await postNewQuestion(item.convId, parentId, parms);
        break;
        case Intents.SHOW_STATS:
        await showStats(item.convId, parentId);
        break;
        default:
        await postMessage(item.convId, parentId, result.fulfillmentText);
        break;
      }
    } else {
      console.log('No intent matched.');
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('ERROR:', err);
    await postMessage(item.convId, item.itemId, `Error: ${err && err.message}`);
    res.status(500).send(err && err.message);
  }
}

async function handleUserSubmitFormData(req, res) {
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
    res.status(500).send('Question has expired');
    return;
  }

  // Lookup in DB if user has already submitted an answer, if so don't
  // accept this new submission
  const alreadySubmitted = await db.getSubmission(itemId, submitterId);
  if (alreadySubmitted) {
    console.log(`Ignore multiple submissions. userId: ${submitterId}`);
    res.status(500).send('Already submitted');
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
}

async function incrementSubmissionCount(itemId) {
  // Lookup item in Circuit so it can be updated
  let url = `${DOMAIN}/rest/conversations/messages/${itemId}`;

  let item = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  item = await item.json();

  // Increment submission count
  const form = JSON.parse(item.text.formMetaData);
  form.controls[3].text = parseInt(form.controls[3].text) + 1 + ' submission(s)';

  url = `${DOMAIN}/rest/conversations/${item.convId}/messages/${itemId}`;
  await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({
      formMetaData: JSON.stringify(form)
    })
  });
}

exports.webhook = async (req, res) => {
  switch (req.body.type) {
    case 'CONVERSATION.ADD_ITEM':
    await handleConversationAddItem(req, res);
    break;
    case 'USER.SUBMIT_FORM_DATA':
    await handleUserSubmitFormData(req, res);
    break;
    default:
    const msg = `Unknown type ${req.body.type}`;
    console.log(msg);
    res.status(200).send(msg);
  }
}



