/**
 * Load trivia cloud functions
 */

'use strict';

module.exports = {
  ...require('./start.js'),
  ...require('./stop.js'),
  ...require('./addTextItem.js'),
  ...require('./submitFormData.js'),
  ...require('./datastore.js') // for viewing datastore while developing
}