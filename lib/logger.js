'use strict';

var util = require('util');
var verbose = true;

module.exports = {
  setVerbose: function setVerbose(isVerbose) {
    verbose = isVerbose;
  },

  log: function log() {
    if (verbose) console.error(util.format.apply(util.format, arguments));
  },

  warn: function warn() {
    console.warn(util.format.apply(util.format, arguments));
  }
};