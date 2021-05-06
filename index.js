'use strict';

var Promise = require('lie');
var utils = require('./pouch-utils');
var wrappers = require('pouchdb-wrappers');
var immediate = require('immediate');

function isntInternalKey(key) {
  return key[0] !== '_';
}

function isUntransformable(doc) {
  var isLocal = typeof doc._id === 'string' && utils.isLocalId(doc._id);

  if (isLocal) {
    return true;
  }

  if (doc._deleted) {
    return Object.keys(doc).filter(isntInternalKey).length === 0;
  }

  return false;
}

// api.filter provided for backwards compat with the old "filter-pouch"
exports.transform = exports.filter = function transform(config) {
  var db = this;
  console.log('*** *** transform start');
  var incoming = function (doc) {
    console.log('*** *** incoming transform 1');
    if (!isUntransformable(doc) && config.incoming) {
      console.log('*** *** incoming transform 2');
      return config.incoming(utils.clone(doc));
    }
    console.log('*** *** incoming transform 3');
    return doc;
  };
  var outgoing = function (doc) {
    console.log('*** *** outgoing transform 1');
    if (!isUntransformable(doc) && config.outgoing) {
      console.log('*** *** outgoing transform 2');
      return config.outgoing(utils.clone(doc));
    }
    console.log('*** *** outgoing transform 3');
    return doc;
  };

  var handlers = {};

  if (db.type() === 'http') {
    handlers.query = function (orig) {
      console.log('*** *** handlers.query start');
      var none = {};
      return orig().then(function (res) {
        return utils.Promise.all(res.rows.map(function (row) {
          if (row.doc) {
            return outgoing(row.doc);
          }
          return none;
        })).then(function (resp) {
          resp.forEach(function (doc, i) {
            if (doc === none) {
              return;
            }
            res.rows[i].doc = doc;
          });
          return res;
        });
      });
    };
  }

  handlers.get = function (orig) {
    console.log('*** *** handlers.get start');

    return orig().then(function (res) {
      if (Array.isArray(res)) {
        var none = {};
        // open_revs style, it's a list of docs
        return utils.Promise.all(res.map(function (row) {
          if (row.ok) {
            return outgoing(row.ok);
          }
          return none;
        })).then(function (resp) {
          resp.forEach(function (doc, i) {
            if (doc === none) {
              return;
            }
            res[i].ok = doc;
          });
          return res;
        });
      } else {
        return outgoing(res);
      }
    });
  };

  handlers.bulkDocs = function (orig, args) {
    console.log('*** *** handlers.bulkDocs start');

    for (var i = 0; i < args.docs.length; i++) {
      args.docs[i] = incoming(args.docs[i]);
    }
    return Promise.all(args.docs).then(function (docs) {
      args.docs = docs;
      return orig();
    });
  };

  handlers.allDocs = function (orig) {
    console.log('*** *** handlers.allDocs start');

    return orig().then(function (res) {
      var none = {};
      return utils.Promise.all(res.rows.map(function (row) {
        if (row.doc) {
          return outgoing(row.doc);
        }
        return none;
      })).then(function (resp) {
        resp.forEach(function (doc, i) {
          if (doc === none) {
            return;
          }
          res.rows[i].doc = doc;
        });
        return res;
      });
    });
  };

  handlers.bulkGet = function (orig) {
    console.log('*** *** handlers.bulkGet start');
    return orig().then(function (res) {
      var none = {};
      return utils.Promise.all(res.results.map(function (result) {
        if (result.id && result.docs && Array.isArray(result.docs)) {
          return {
            docs: result.docs.map(function(doc) {
              if (doc.ok) {
                return {ok: outgoing(doc.ok)};
              } else {
                return doc;
              }
            }),
            id: result.id
          };
        } else {
          return none;
        }
      })).then(function (results) {
        return {results: results};
      });
    });
  };
  
  handlers.changes = function (orig) {
    console.log('*** *** handlers.changes start');
    function modifyChange(change) {
      if (change.doc) {
        return utils.Promise.resolve(outgoing(change.doc)).then(function (doc) {
          change.doc = doc;
          return change;
        });
      }
      return utils.Promise.resolve(change);
    }

    function modifyChanges(res) {
      if (res.results) {
        return utils.Promise.all(res.results.map(modifyChange)).then(function (results) {
          res.results = results;
          return res;
        });
      }
      return utils.Promise.resolve(res);
    }

    var changes = orig();
    // override some events
    var origOn = changes.on;
    changes.on = function (event, listener) {
      if (event === 'change') {
        return origOn.apply(changes, [event, function (change) {
          modifyChange(change).then(function (resp) {
            immediate(function () {
              listener(resp);
            });
          });
        }]);
      } else if (event === 'complete') {
        return origOn.apply(changes, [event, function (res) {
          modifyChanges(res).then(function (resp) {
            process.nextTick(function () {
              listener(resp);
            });
          });
        }]);
      }
      return origOn.apply(changes, [event, listener]);
    };

    var origThen = changes.then;
    changes.then = function (resolve, reject) {
      return origThen.apply(changes, [function (res) {
        return modifyChanges(res).then(resolve, reject);
      }, reject]);
    };
    return changes;
  };
  console.log('*** *** handlers', Object.keys(handlers));
  wrappers.installWrapperMethods(db, handlers);
};

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports);
}
