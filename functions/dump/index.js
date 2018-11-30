const Datastore = require('@google-cloud/datastore');

// Instantiates a data store client
const datastore = Datastore();

exports.dump = async (req, res) => {

  const ns = req.query.ns || 'trivia';
  const kind = req.query.kind || 'question';
  const order = req.query.order;

  const q = datastore.createQuery(ns, kind);


  if (req.query.purge && req.query.purge.toLowerCase() === 'true') {
    const entities = await datastore.runQuery(q);
    for (let entity of entities[0]) {
      console.log(entity[datastore.KEY]);
      await datastore.delete(entity[datastore.KEY]);
    }
    res.status(200).send(`Deleted ${entities[0].length} records`);
    return;
  }

  if (order) {
    q = q.order(order);
  }

  const result = await datastore.runQuery(q);
  let data = result[0];

  // Sort
  data.forEach((element, i) => {
    element = Object.keys(element).sort().reduce((accumulator, currentValue) => {
      accumulator[currentValue] = element[currentValue];
      return accumulator;
    }, {});
    data[i] = element;
  });

  console.log('data:', data);
  res.status(200).send(data);
}