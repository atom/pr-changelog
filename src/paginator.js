require("babel-polyfill")
var linkParser = require('parse-link-header')

module.exports = async function(originalOptions, func) {
  function getOptions(page) {
    let options = clone(originalOptions)
    options.per_page = 100
    options.page = page
    return options
  }
  let results = await func(getOptions(1))
  let allResults = results

  let linkHeader = linkParser(results.meta.link)
  let totalPages = (linkHeader && linkHeader.last) ? linkHeader.last.page : 1;

  try {
    for (let page = 2; page <= totalPages; page++) {
      results = await func(getOptions(page))
      console.log('have page', page);
      allResults = allResults.concat(results)
    }
  }
  catch (e) {
    console.log(e.message);
  }

  return allResults
}

function clone(obj) {
  var temp = {}
  for(var key in obj) {
    if(Object.prototype.hasOwnProperty.call(obj, key)) {
      temp[key] = obj[key];
    }
  }
  return temp
}
