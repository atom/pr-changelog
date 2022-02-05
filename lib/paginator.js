'use strict';

require("babel-polyfill");
var linkParser = require('parse-link-header');

var _require = require('./utils'),
    clone = _require.clone;

var Logger = require('./logger');

module.exports = function _callee(originalOptions, func, filterFunc) {
  var getOptions, totalPages, shouldUpdateTotalPagesOnNextPage, updateTotalPages, allResults, results, page;
  return regeneratorRuntime.async(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          updateTotalPages = function updateTotalPages(results) {
            var linkHeader = linkParser(results.headers.link);
            if (linkHeader && linkHeader.last) {
              shouldUpdateTotalPagesOnNextPage = false;
              totalPages = parseInt(linkHeader.last.page);
            } else if (linkHeader && linkHeader.next) {
              shouldUpdateTotalPagesOnNextPage = true;
              totalPages = parseInt(linkHeader.next.page);
            }
          };

          getOptions = function getOptions(page) {
            var options = clone(originalOptions);
            options.per_page = 100;
            options.page = page;
            return options;
          };

          totalPages = 1;
          shouldUpdateTotalPagesOnNextPage = true;
          allResults = void 0;
          _context.next = 7;
          return regeneratorRuntime.awrap(func(getOptions(1)));

        case 7:
          results = _context.sent;

          updateTotalPages(results);

          if (filterFunc) allResults = filterFunc(results);

          _context.prev = 10;
          page = 2;

        case 12:
          if (!(page <= totalPages)) {
            _context.next = 27;
            break;
          }

          Logger.log('Fetching page', page);

          _context.next = 16;
          return regeneratorRuntime.awrap(func(getOptions(page)));

        case 16:
          results = _context.sent;

          if (shouldUpdateTotalPagesOnNextPage && results.length) updateTotalPages(results);

          if (filterFunc) results = filterFunc(results);

          if (!(results == null)) {
            _context.next = 23;
            break;
          }

          return _context.abrupt('break', 27);

        case 23:
          allResults = allResults.concat(results);

        case 24:
          page++;
          _context.next = 12;
          break;

        case 27:
          _context.next = 32;
          break;

        case 29:
          _context.prev = 29;
          _context.t0 = _context['catch'](10);

          Logger.warn(_context.t0.message || _context.t0);

        case 32:
          return _context.abrupt('return', allResults);

        case 33:
        case 'end':
          return _context.stop();
      }
    }
  }, null, this, [[10, 29]]);
};