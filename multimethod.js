
'use strict';

module.exports = multimethod;

var Bitset = require('@kmoerman/bitset');


// The multimethod function returns a
// dispatch function, which forwards
// to an instance of the multimethod
// depending on the types of the
// arguments.
function multimethod () {
  var mm   = new MM ();
  var self = mm.dispatch.bind(mm);
  
  self._  = mm.addInstance.bind(mm);
  self.__ = mm.addPureInstance.bind(mm);
  
  return self;
}

// An MM object represents a multimethod, storing a
// a unique ID and providing an interface to add
// implementation instances.
function MM () {
  this.instances = [];
  this.MMobjects = [];
  this.id = MM.methods++;
  this.prefix = '_MM_' + this.id + '_';
  this.arg0 = this.key(0);
  this.arg1 = this.key(1);
}

MM.methods = 0;

// Threshold to change between simple integer
// bitset (32 bits) and a full Bitset object.
MM.maxInstances = 32;

MM.prototype.addInstance = function () {
  var n = arguments.length - 1;
  var f = arguments[n];
  var args = new Array(n);
  for (var i = 0; i < n; ++i) {
    var arg = arguments[i];
    args[i] = typeof arg == 'function' ? arg.prototype
                                       : arg;
  }
  this.saveInstance(f, args); 
}

MM.prototype.addPureInstance = function () {
  var n = arguments.length - 1;
  var f = arguments[n];
  var args = new Array(n);
  for (var i = 0; i < n; ++i)
    args[i] = arguments[i];
  this.saveInstance(f, args);
}

MM.prototype.saveInstance = function (f, args) {
  var id = this.instances.push(f) - 1;
  if (id >= MM.maxInstances) this.grow();
  this.registerArguments(id, args);                      
}

MM.prototype.registerArguments = function (id, args) {
  for (var i = 0; i < args.length; ++i) 
    this.put(this.at(args[i], i), id);
}

MM.prototype.grow = function () {
  this.MMobjects.forEach(function (mm) {
    mm.bitset = Bitset.from(mm.bitset);
  });
  delete this.MMobjects;
  Object.setPrototypeOf(this, MM_XL.prototype);
}

MM.prototype.key = function (arg) {
  return this.prefix + arg;
}

MM.prototype.at = function (obj, arg) {
  var key = this.key(arg);
  if (! obj.hasOwnProperty(key)) {
    var mm = this.create_MM_(obj, key);
    Object.defineProperty(obj, key,
       { value: mm
       , writable: true }); 
    return mm;
  }
  return obj[key];
}

MM.prototype.create_MM_ = function (obj, key) {
  var mm = new _MM_ (key, obj);
  this.MMobjects.push(mm);
  return mm;
}

MM.prototype.put = function (mm, id) {
  mm.bitset |= 1 << id;
}

MM.prototype.dispatch = function () {
  var f;
  switch (arguments.length) {
    case 2  : f = this.lookup2.apply(this, arguments);
    break;
    default : f = this.lookupN.apply(this, arguments);
  }
  return f.apply(this, arguments);
}

MM.prototype.lookup2 = function (a, b) {
  var am = a[this.arg0];
  var bm = b[this.arg1];
  
  if (!(am && bm))
    return this.noInstances([a, b]);
  
  var ab = 0;
  var bb = 0;
  var i  = 0;

  do {
    ab |= am.bitset;
    bb |= bm.bitset;
    i   = ab & bb;
    am  = am.parent();
    bm  = bm.parent();
  } while (!i && am && bm);
  
  if (!i) {
    while (!i && am) {
      ab |= am.bitset;
      am  = am.parent();
      i   = ab & bb;
    }
    
    while (!i && bm) {
      bb |= bm.bitset;
      bm  = bm.parent();
      i   = ab & bb;
    }
  }
  
  // no candidates
  if (i === 0)
    return this.noInstances([a, b]);
  
  // one candidate
  if ((i & i-1) === 0)
    return this.instances[Bitset.msbP2(i)];
  
  // multiple candidates
  return this.resolve([a, b], i);
}


MM.prototype.lookupN = function () {
  var N    = arguments.length;
  var M    = N;
  var ams  = new Array(N);
  var args = new Array(N);
  var abs  = new Array(N);
  var i    = ~0;
  var am;

  for (var j = 0; j < N; ++j) {
    args[j] = arguments[j];
    console.log(this.key(j));
    am = args[j][this.key(j)];
    if (am === undefined)
      return this.noInstances.apply(this, arguments);
    (ams[j] = am.parent()) || (--M);
    abs[j] = am.bitset;
    i &= am.bitset;
  }

  while (!i && M) {
    i = ~0;
    ams.forEach(function (am, j) {
      if (am === undefined)
        i &= abs[j];
      else {
        i &= (abs[j] |= am.bitset);
        (ams[j] = am.parent()) || (--M);
      }
    });
  }

  if (i === 0)
    return this.noInstances(args);
  
  if ((i & i-1) === 0)
    return this.instances[Bitset.msbP2(i)];

  return this.resolve(args, i);

};


// Eager resolve on leftmost specific
MM.prototype.resolve = function (args, is) {
  var i = 0;
  var n = 2;
  var m, b;
  while (i < n) {
    m = args[i][this.key(i)];
    do {
      b = m.bitset;
      m = m.parent();
    } while (m && ((b & is) == 0));
    
    if (b & (b-1))
      return this.instances[Bitset.msbP2(b)];
    else
      is &= b;
    
    ++i;
  }
  
  return this.ambInstances(args, is);
}


// Lookup error handling
MM.prototype.noInstances = function (args) {
  if (console && console.log)
    console.log('MM: no instance', this, args);
  throw new TypeError('No instance for multimethod arguments.');
}

MM.prototype.ambInstances = function (args) {
  if (console && console.log)
    console.log('MM: abiguity', this, args);
  throw new TypeError('Ambiguous instance for multimethod arguments.');
}


// Extra large MM objects, with more than 32 instances
// uses bitset arrays in the argument objects instead
// of plain integers.
// The creation of the _MM_ objects, and the
// registration of instances are affected by this
// change. The lookup algorithm remains the same
// in a semantic sense, but uses the bitset
// methods for union and intersection, instead of
// the plain bitwise operators `|' and `&'.
// Likewise, the resolve method is adapted for
// bitset arrays.
function MM_XL () {}

MM_XL.prototype = Object.create(MM.prototype);
MM_XL.prototype.constructor = MM_XL;

MM_XL.prototype.saveInstance = function (f, args) {
  var id = this.instances.push(f) - 1;
  this.registerArguments(id, args);
}

MM_XL.prototype.create_MM_ = function (obj, key) {
  var mm = new _MM_ (key, obj);
  mm.bitset = Bitset.from(mm.bitset);
  return mm;
}

MM_XL.prototype.put = function (mm, id) {
  mm.bitset.put(id);
}

MM_XL.prototype.lookup2 = function (a, b) {
  var am = a[this.arg0];
  var bm = b[this.arg1];
  var bbs = [];
  
  if (!(am && bm))
    return this.noInstances([a,b]);
  
  var ab = new Bitset();
  var bb = new Bitset();
  var i;
  
  do {
    ab.union(am.bitset);
    bb.union(bm.bitset);
    i   = new Intersection (ab, bb);
    am  = am.parent();
    bm  = bm.parent();
  } while (i.empty && am && bm);
  
  if (i.empty) {
    while (i.empty && am) {
      ab.union(am.bitset);
      i   = new Intersection (ab, bb);
      am  = am.parent();
    }
    
    while (i.empty && bm) {
      bb.union(bm.bitset);
      i   = new Intersection (ab, bb);
      bm  = bm.parent();
    }
  }
  
  // no candidates
  if (i.empty)
    return this.noInstances([a, b]);
  
  // one candidate
  if (i.isSingleton())
    return this.instances[i.max()];
  
  // multiple candidates
  return this.resolve2([a, b], i);
}


MM_XL.prototype.lookupN = function () {
  var N    = arguments.length;
  var M    = N;
  var ams  = new Array(N);
  var abs  = new Array(N);
  var args = new Array(N);
  var i;
  var am;

  for (var j = 0; j < N; ++j) {
    args[j] = arguments[j];
    am = args[j][this.key(j)];
    if (am === undefined)
      return this.noInstances(args);
    (ams[j] = am.parent()) || (--M);
    abs[j] = am.bitset;
    if (j === 0)
      i = (new Bitset()).union(am.bitset);
    else
      i.intersect(am.bitset);
  }

  while (i.isEmpty() && M) {
    i = (new Bitset()).union(abs[0]);
    ams.forEach(function (am, j) {
      if (am === undefined)
        i.intersect(abs[j]);
      else {
        i.intersect(abs[j].union(ams[j].bitset));
        (ams[j] = am.parent()) || (--M);
      }
    });
  }

  if (i.isEmpty())
    return this.noInstances(args);

  if (i.isSingleton())
    return this.instances[i.max()];

  return this.resolve(args, i);

}


// eager resolve on leftmost specific argument
MM_XL.prototype.resolve = function (args, is) {
  var i = 0;
  var n = args.length;
  var m, b;
  while (i < n) {
    m = args[i][this.key(i)];
    do {
      b = m.bitset;
      m = m.parent();
    } while (m && (new Intersection (b, is)).empty);
    
    if (b.isSingleton()) {
      return this.instances[b.max()];
    }
    else
      is.intersect(b);
    
    ++i;
  }
  
  return this.ambInstances(args, is);
}



// Bitset hack for quick detection
// of empty intersections.
function Intersection (a, b) {
  var l = Math.min(a.intArray.length, b.intArray.length);
  var notEmpty = 0;
  this.intArray = new Array (l);
  
  for (var i = 0; i < l; ++i)
    notEmpty |=
      (this.intArray[i] = a.intArray[i] & b.intArray[i]);
  
  this.empty = !notEmpty;
}

Intersection.prototype = Object.create(
  Bitset.prototype, { constructor: Intersection });


// An unenumerable _MM_ object is included
// in all relevant objects, signifying
// which instances of a multimethod are
// supported for a given argument position.
// The supported multimethod instances
// are saved in a bitset.
function _MM_ (key, self) {
  this.key = key;
  this.self = self;
  this.bitset = 0;
}


// Using the self and the key properties
// the parent method goes up the prototype chain
// to look up the next hidden _MM_ object.
_MM_.prototype.parent = function () {
  var proto = Object.getPrototypeOf(this.self);
  return proto ? proto[this.key] : undefined;
}
