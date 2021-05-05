/*
This snippet demonstrates a bug in transform-pouch
in which the 'incoming' handler is never run against CouchDB,
but it is when using a local database.
*/

// const PouchDB = require('pouchdb')
var PouchDB = require("add link to pouch node module folder");
PouchDB.plugin(require('./'))

const { USE_COUCH, COUCH_URL } = process.env
const DB_PATH = 'transform-pouch-bug'
const DB_NAME = USE_COUCH ? `${COUCH_URL}/${DB_PATH}` : DB_PATH

const db = new PouchDB(DB_NAME)
let incoming = false
let outgoing = false
db.transform({
  incoming: function (doc) {
    incoming = true
    return doc
  },
  outgoing: function (doc) {
    outgoing = true
    return doc
  }
})

Promise.resolve().then(async () => {
  await db.put({ _id: 'a' })
  const doc = await db.get('a')
  if (!outgoing) { console.error('`outgoing` handler never ran!') }
  if (!incoming) { console.error('`incoming` handler never ran!') }
  if (outgoing && incoming) { console.log('Both handlers ran.') }
}).catch((err) => {
  console.trace(err)
}).then(() => {
  return db.destroy()
})