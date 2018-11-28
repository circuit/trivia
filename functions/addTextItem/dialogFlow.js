'use strict';

const projectId = 'circuit-trivia';
const sessionId = 'circuit-trivia-session-id';
const languageCode = 'en-US';

// Instantiate a DialogFlow client.
const dialogflow = require('dialogflow');
const sessionClient = new dialogflow.SessionsClient();

// Define session path
const sessionPath = sessionClient.sessionPath(projectId, sessionId);

exports.detectIntent = msg => {

  // The text query request.
  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: msg,
        languageCode: languageCode,
      },
    },
  };

  // Send request and log result
  return sessionClient
    .detectIntent(request)
    .then(responses => {
      console.log('Detected intent');
      return responses[0].queryResult;
    });
};


