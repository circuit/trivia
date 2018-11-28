'use strict';

const htmlToText = require('html-to-text');

function createMentionedUsersArray(msg) {
  var mentionedUsers = [];
  // We cannot guarantee the order of the attributes within the span, so we need
  // to split the patterns.
  var mentionPattern = /<span.*?class=["']mention["'].*?>/g;
  var abbrPattern = /abbr=["'](.*?)["']/;
  var match = mentionPattern.exec(msg);

  while (match !== null) {
      var abbr = abbrPattern.exec(match[0]);
      abbr = abbr && abbr[1];
      if (mentionedUsers.indexOf(abbr) === -1) {
          mentionedUsers.push(abbr);
      }
      match = mentionPattern.exec(msg);
  }

  return mentionedUsers;
};

function getMentionedContent(content, userId) {
  const userIds = createMentionedUsersArray(content);
  if (userIds.includes(userId)) {
    // Remove mentions (spans)
    content = content.replace(/<span[^>]*>([^<]+)<\/span>/g, '');
    // Remove html if any in the question and trim result
    return htmlToText.fromString(content).trim();
  }
}

/**
 * Shuffle an array
 * @param {Array} a
 */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Timer
 * @param {Number} ms Duration
 */
function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  createMentionedUsersArray,
  getMentionedContent,
  shuffle,
  timeout
}