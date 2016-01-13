module.exports = {
  clone: function(obj) {
    var temp = {}
    for(var key in obj) {
      if(Object.prototype.hasOwnProperty.call(obj, key)) {
        temp[key] = obj[key];
      }
    }
    return temp
  },

  filter: function(arr, func) {
    let newArr = []
    arr = arr || []
    for (let obj of arr)
      if (func(obj))
        newArr.push(obj)
    return newArr
  }
}
