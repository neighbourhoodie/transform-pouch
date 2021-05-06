(function () {
  'use strict'
  // minimal polyfill for phantomjs; in the future, we should do ES5_SHIM=true like pouchdb
  if (!Function.prototype.bind) {
    // eslint-disable-next-line no-extend-native
    Function.prototype.bind = function (oThis) {
      if (typeof this !== 'function') {
        // closest thing possible to the ECMAScript 5
        // internal IsCallable function
        throw new TypeError('Function.prototype.bind - what is trying to be bound is not callable')
      }

      const aArgs = Array.prototype.slice.call(arguments, 1)
      const fToBind = this
      const FNOP = function () {}
      const fBound = function () {
        return fToBind.apply(this instanceof FNOP && oThis
          ? this
          : oThis,
        aArgs.concat(Array.prototype.slice.call(arguments)))
      }

      FNOP.prototype = this.prototype
      fBound.prototype = new FNOP()

      return fBound
    }
  }
})()
