
'use strict';

var multimethod = require('../multimethod');

// higher order accessor utilitiy function
function method (p) {
  return function (o) {
    var m = o[p];
    return m.call.apply(m, arguments);
  }
}


//
// Example adapted from
// Salzman, L., & Aldrich, J. (2005).
// Prototypes with multiple dispatch:
//  An expressive and dynamic object model.
// In ECOOP 2005-Object-Oriented Programming
// (pp. 312-336). Springer Berlin Heidelberg.
//
// http://www.cs.cmu.edu/~aldrich/papers/ecoop05pmd.pdf
//

function Fish         (n) { this.name = n;               }
function Shark        ()  { Fish.apply(this, arguments); }
function HealthyShark ()  { Fish.apply(this, arguments); }
function DyingShark   ()  { Fish.apply(this, arguments); }
function Anchovy      ()  { Fish.apply(this, arguments); }

function addDelegation (base, parent) {
  base.prototype = Object.create(
    parent.prototype, {constructor : base} );
}

addDelegation(Shark, Fish);
addDelegation(HealthyShark, Shark);
addDelegation(DyingShark, Shark);
addDelegation(Anchovy, Fish);

Fish.prototype.swimAway = function (from) {
  console.log(this.name + ' swims away from ' + from.name);
}

Shark.prototype.swallow = function (fish) {
  console.log(this.name + ' the shark swallows ' + fish.name + '. Sorry, ' + fish.name);
}

HealthyShark.prototype.fight = function (shark) {
  console.log(this.name + ' fights ' + shark.name);
  Object.setPrototypeOf(shark, DyingShark.prototype);
}

var encounter = multimethod();

// 0
encounter._(Fish, Fish, function (f, a) {
  console.log('simple encounter between ' + f.name +' and ' + a.name);
});

// 1 - 4
encounter._(Fish, HealthyShark,  method('swimAway'));
encounter._(HealthyShark, Fish,  method('swallow'));
encounter._(HealthyShark, Shark, method('fight'));
encounter._(DyingShark, Fish,    method('swimAway'));

// 5
encounter._(Shark, Number, function (f, n) {
  console.log(f.name + ' the fish encountered the number ' + n + ' and is now learning mathematics');
});

// 6
encounter._(Fish, Number, function (f, n) {
  console.log(f.name + ' is too stupid to understand numbers');
});

// 7
encounter._(Fish, String, function (f, s) {
  console.log(f.name + ' encountered the phrase "' + s + '" and is now learning how to read');
});


var karl  = new HealthyShark('karl');
var heinz = new HealthyShark('heinz');
var fritz = new HealthyShark('fritz');
var andy  = new Anchovy('andy');

// 8
encounter._(heinz, karl, function (k, h) {
  console.log('Karl is that you?', 'Oh, hi Heinz!');
});

//9
encounter._(Shark, Shark, Shark, function () { console.log('Shark attack!'); });

//10
encounter._(Fish, Fish, Fish, function () { console.log('Three little fishes.'); });

//11
encounter._(andy, Object, Object, function () { console.log('Andy and whatever.'); });

