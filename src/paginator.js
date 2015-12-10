require("babel-polyfill")
let linkParser = require('parse-link-header')
let {clone} = require('./utils')
let Logger = require('./logger')

module.exports = async function(originalOptions, func, filterFunc) {
  function getOptions(page) {
    let options = clone(originalOptions)
    options.per_page = 100
    options.page = page
    return options
  }

  let totalPages = 1
  let shouldUpdateTotalPagesOnNextPage = true

  function updateTotalPages(results) {
    let linkHeader = linkParser(results.meta.link)
    if (linkHeader && linkHeader.last) {
      shouldUpdateTotalPagesOnNextPage = false
      totalPages = parseInt(linkHeader.last.page)
    }
    else if (linkHeader && linkHeader.next) {
      shouldUpdateTotalPagesOnNextPage = true
      totalPages = parseInt(linkHeader.next.page)
    }
  }

  let allResults
  let results = await func(getOptions(1))
  updateTotalPages(results)

  if (filterFunc) allResults = filterFunc(results)

  try {
    for (let page = 2; page <= totalPages; page++) {
      Logger.log('Fetching page', page);

      results = await func(getOptions(page))
      if (shouldUpdateTotalPagesOnNextPage && results.length)
        updateTotalPages(results)

      if (filterFunc) results = filterFunc(results)

      if (results == null)
        break
      else
        allResults = allResults.concat(results)
    }
  }
  catch (e) {
    Logger.warn(e.message || e);
  }

  return allResults
}
