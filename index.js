
module.exports = multimethod

function mm (x) {
  this.fs = []
  this.object = x
}

mm.prototype.define = function (f) {
  this.fs.push(f)
}

mm.prototype.lookup = function () {
  const p = Object.getPrototypeOf(this.object)
  return [p === null ? ERROR : p, this.fs]
}

const ERROR =
  { lookup () { return [this, [this.fail]]; }
  , fail     : () => () =>
      { throw new TypeError ('no matching multimethod resolution') }
  , multiple : () => matches =>
      { throw new TypeError ('Non-unique multimethod resolution') }
  }

function define (x, Fi, f) {
  let m = x[Fi]
  if (!m || m.object !== x)
    Object.defineProperty(x, Fi, {value : m = new mm (x)})

  m.define(f)
}

function lookup (xs, ss) {
  const T = (1 << xs.length) - 1
  const partial = (new Map ()).set(ERROR.fail, T)
  const matches = new Set ()

  const xs_ = xs.slice()

  while (matches.size === 0)
    xs_.forEach((x,i) => {
      const s = ss[i]
      const [x_, fs] = (x[s] || ERROR).lookup()
      fs.forEach(f => {
        const c = (partial.get(f) || 0) | (1<<i)
        partial.set(f, c)
        if (c === T)
          matches.add(f)
      })
      xs_[i] = x_
    })

  if (matches.size === 1)
    return matches[0]
  else
    return ERROR.multiple(matches)
}


function multimethod (...ds) {

  const ss = []

  function sym (i) {
    let s = ss[i]
    if (!s) {
      s = ss[i] = Symbol(i)
      ERROR[s] = ERROR
    }
    return s
  }

  //const sym = F.lookup([], Symbol)

  function self (...args) {
    return lookup(args, ss).apply(this, args)
  }

  self.define = (...ds) =>
    (typeof ds[ds.length-1] === 'function' ? [ds] : ds)
      .forEach(xsf => {
        const xs = xsf.slice(0,-1)
        const f  = xsf[xsf.length - 1]
        xs.forEach((x,i) => define(x, sym(i), f))
      })
  self._ = self.define

  self.define(...ds)

  return self;
}
