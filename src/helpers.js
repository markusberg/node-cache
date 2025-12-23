(function() {
  /*
  Generates a random string of given length

  @param {Number} length - length of the returned string
  @param {Boolean} withnumbers [true]

  @return {String} generated random string
  */
  exports.randomString = function(length, withnumbers = true) {
    var chars, i, randomstring, rnum, string_length;
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    if (withnumbers) {
      chars += "0123456789";
    }
    string_length = length || 5;
    randomstring = "";
    i = 0;
    while (i < string_length) {
      rnum = Math.floor(Math.random() * chars.length);
      randomstring += chars.substring(rnum, rnum + 1);
      i++;
    }
    return randomstring;
  };

  /*
  Generates a random number between 0 and `max`

  @param {Number} max

  @return {Number} generated random number
  */
  exports.randomNumber = function(max) {
    return Math.floor(Math.random() * (max + 1));
  };

  /*
  Subtracts all objB keys from objA keys and returns the result.
  Both objects should have identical keys with numeric values

  @param {Object} objA
  @param {Object} objB

  @return {Object} Object with the diffed values
  */
  exports.diffKeys = function(objA, objB) {
    var diff, key;
    diff = {};
    for (key in objA) {
      if (objB.hasOwnProperty(key)) {
        diff[key] = objA[key] - objB[key];
      }
    }
    return diff;
  };

}).call(this);
