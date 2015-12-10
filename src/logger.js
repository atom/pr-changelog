var util = require('util')
var verbose = true

module.exports = {
  setVerbose: function(isVerbose) {
    verbose = isVerbose
  },

  log: function() {
    if (verbose)
      console.error(util.format.apply(util.format, arguments))
  },

  warn: function() {
    console.warn(util.format.apply(util.format, arguments))
  }
}
