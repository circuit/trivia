/**
 * Authenticates the Bot and returns the Access Token
 */

'use strict';

const Datastore = require('@google-cloud/datastore');

// Instantiates a data store client
const datastore = Datastore();
let ns, domain;

function init(url) {
  domain = url;
  ns = 'trivia_' + url.split('//')[1];
}

async function saveToken(userId, token) {
  // Use the domain (e.g. https://circuitsandbox.net) as key
  const key = datastore.key({
    namespace: ns,
    path: ['token', domain]
  });
  const entity = {
    key: key,
    data: { domain, userId, token }
  }

  await datastore.upsert(entity);
  console.log(`Token for domain ${domain} added to Datastore`);
}

async function getToken() {
  const key = datastore.key({
    namespace: ns,
    path: ['token', domain]
  });
  const entity = await datastore.get(key);
  return entity[0];
}


async function addQuestion(data) {
  // Use the itemId as key
  const key = datastore.key({
    namespace: ns,
    path: ['question', data.itemId]
  });
  const entity = {
    key: key,
    data: [
      {
        name: 'convId',
        value: data.convId,
      },
      {
        name: 'itemId',
        value: data.itemId,
      },
      {
        name: 'created',
        value: new Date().toJSON(),
      },
      {
        name: 'category',
        value: data.category,
      },
      {
        name: 'question',
        value: data.question,
        excludeFromIndexes: true,
      },
      {
        name: 'difficulty',
        value: data.difficulty
      },
      {
        name: 'correctAnswer',
        value: data.correct_answer,
      },
      {
        name: 'incorrectAnswers',
        value: data.incorrect_answers
      },
      {
        name: 'status',
        value: 'active'
      },
    ],
  };

  await datastore.save(entity);
  console.log(`Question ${key.id} added to Datastore`);
}

async function getQuestion(itemId) {
  const key = datastore.key({
    namespace: ns,
    path: ['question', itemId]
  });
  const entity = await datastore.get(key);
  return entity[0];
}

function updateEntity (key, property, newValue) {
  const transaction = datastore.transaction();

  return transaction.run()
    .then(() => transaction.get(key))
    .then((result) => {
      const entity = result[0];

      entity[property] = newValue;

      transaction.save({
          key: key,
          data: entity
      });

      return transaction.commit();
    })
    .catch(() => transaction.rollback());
}

async function expireQuestion(itemId) {
  const key = datastore.key({
    namespace: ns,
    path: ['question', itemId]
  });

  return updateEntity(key, 'status', 'expired');
};

async function getSubmission(itemId, submitterId) {
  const key = datastore.key({
    namespace: ns,
    path: ['submission', `${itemId}:${submitterId}`]
  });
  const entity = await datastore.get(key);
  return entity[0];
}

async function addSubmission(itemId, submitterId, value, correct) {
  const key = datastore.key({
    namespace: ns,
    path: ['submission', `${itemId}:${submitterId}`]
  });
  const entity = {
    key: key,
    data: {
      itemId: itemId,
      submitterId: submitterId,
      created: new Date().toJSON(),
      value: value,
      correct: !!correct
    }
  }

  await datastore.upsert(entity);
  console.log(`Submission for item ${itemId} and submitter ${submitterId} added to Datastore`);
}

async function getSubmissionsByItemId(itemId) {
  const q = datastore
    .createQuery(ns, 'submission')
    .filter('itemId', '=', itemId)
    .order('created', {
      descending: true,
    });

  const entities = await datastore.runQuery(q);
  return entities[0];
}

function groupBy(xs, key) {
  return xs.reduce((rv, x) => {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
}

async function getStats() {
  let q = datastore
    .createQuery(ns, 'submission')
    .select(['submitterId', 'correct']);

  let entities = await datastore.runQuery(q);
  const submission = entities[0];

  const users = {};
  submission.forEach(s => {
    if (!users[s.submitterId]) {
      users[s.submitterId] = {
        correct: 0,
        incorrect: 0
      }
    }
    if (s.correct) {
      users[s.submitterId].correct++;
    } else {
      users[s.submitterId].incorrect++;
    }
  });

  for (let id in users) {
    const u = users[id];
    u.percentage = u.incorrect ? Math.round(100 * u.correct / (u.incorrect + u.correct)) : 1;
  }

  q = datastore
    .createQuery(ns, 'question')
    .select(['itemId']);
  entities = await datastore.runQuery(q);
  const questionCount = entities[0].length

  return {
    users: users,
    submissionCount: submission.length,
    questionCount: questionCount
  }
}

module.exports = {
  init,
  saveToken,
  getToken,
  addQuestion,
  getQuestion,
  expireQuestion,
  getSubmissionsByItemId,
  getSubmission,
  addSubmission,
  getStats
}