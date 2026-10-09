const settings = Object.freeze({
  updateRateMs: 10,
  // Dry: follows the finger, but randomly gets stuck and then jumps free
  bumpChance: 0.02,   // chance of getting stuck per px moved
  stuckMs: 50,       // max time stuck (ms)
  kick: 50,           // max jump when breaking free (px)
  // Wet: slippery and keeps sliding
  gain: 1.2,          // moves a bit more than your finger
  slide: 0.9          // 0 = stops at once, 1 = slides forever
});


/**
 * @typedef {{ x:number, y:number }} Point
 * @typedef {{
 *  el: HTMLElement,
 *  side: 'dry' | 'wet',
 *  finger: Point,
 *  lastFinger: Point,
 *  pos: Point,
 *  vel: Point,
 *  stuckMs: number,
 *  released: boolean
 * }} Dot
 */


/** @type {{ dots: Record<string, Dot> }} */
let state = Object.freeze({ dots: {} });


/** @param {number} max */
const random = (max) => Math.random() * max;


/**
 * Create a dot where the finger is
 * @param {number} x
 * @param {number} y
 * @returns {Dot}
 */
const createDot = (x, y) => {
  const el = document.createElement(`div`);
  // Style is set here so it works even without the CSS in index.html
  Object.assign(el.style, {
    position: `absolute`, width: `60px`, height: `60px`, margin: `-30px 0 0 -30px`,
    borderRadius: `50%`, background: `#e6e6e6`, pointerEvents: `none`
  });
  document.body.append(el);
  const side = x < window.innerWidth / 2 ? `dry` : `wet`;
  return { el, side, finger: { x, y }, lastFinger: { x, y }, pos: { x, y }, vel: { x: 0, y: 0 }, stuckMs: 0, released: false };
};


/**
 * Move one dot a step
 * @param {Dot} dot
 * @returns {Dot}
 */
const updateDot = (dot) => {
  let { pos, vel, stuckMs } = dot;
  const dx = dot.released ? 0 : dot.finger.x - dot.lastFinger.x;
  const dy = dot.released ? 0 : dot.finger.y - dot.lastFinger.y;


  if (dot.side === `dry`) {
    if (stuckMs > 0) {
      // Stuck: don't move. When time is up, jump towards the finger
      stuckMs -= settings.updateRateMs;
      if (stuckMs <= 0) {
        const angle = Math.atan2(dot.finger.y - pos.y, dot.finger.x - pos.x) + random(1.6) - 0.8;
        const size = random(settings.kick);
        vel = { x: Math.cos(angle) * size, y: Math.sin(angle) * size };
      }
    } else {
      // Follow the finger, the jump fades out fast
      vel = { x: vel.x * 0.5, y: vel.y * 0.5 };
      pos = { x: dot.finger.x + vel.x, y: dot.finger.y + vel.y };
      // Random bump: the more you move, the bigger the chance
      if (Math.random() < Math.hypot(dx, dy) * settings.bumpChance) stuckMs = random(settings.stuckMs);
    }
  } else {
    // Wet: keep old speed, add finger movement, slide
    vel = {
      x: vel.x * settings.slide + dx * settings.gain * (1 - settings.slide),
      y: vel.y * settings.slide + dy * settings.gain * (1 - settings.slide)
    };
    pos = { x: pos.x + vel.x, y: pos.y + vel.y };
  }


  // Stay on your own half of the screen
  const half = window.innerWidth / 2;
  const minX = dot.side === `dry` ? 0 : half;
  pos = { x: Math.max(minX, Math.min(minX + half, pos.x)), y: pos.y };


  return Object.freeze({ ...dot, pos, vel, stuckMs, lastFinger: dot.finger });
};


const update = () => {
  /** @type {Record<string, Dot>} */
  const dots = {};
  for (const [id, dot] of Object.entries(state.dots)) {
    const moved = updateDot(dot);
    // A released dot is removed when it has stopped
    if (moved.released && (moved.side === `dry` || Math.hypot(moved.vel.x, moved.vel.y) < 0.1)) {
      moved.el.remove();
    } else {
      dots[id] = moved;
    }
  }
  saveState({ dots });
};


const use = () => {
  for (const dot of Object.values(state.dots)) {
    dot.el.style.left = `${dot.pos.x}px`;
    dot.el.style.top = `${dot.pos.y}px`;
  }
};


/**
 * Change one dot (or create it if it doesn't exist)
 * @param {string} id
 * @param {Partial<Dot>} changes
 */
const saveDot = (id, changes) => {
  saveState({ dots: { ...state.dots, [id]: Object.freeze({ ...state.dots[id], ...changes }) } });
};


/** @param {PointerEvent} event */
function onPointerDown(event) {
  if (event.pointerType === `mouse`) return; // the mouse has its own dots
  saveDot(String(event.pointerId), createDot(event.x, event.y));
}


/** @param {PointerEvent} event */
function onPointerMove(event) {
  // Mouse: one mouse moves two dots, one on each side
  if (event.pointerType === `mouse`) {
    const dry = { x: event.x / 2, y: event.y };
    const wet = { x: event.x / 2 + window.innerWidth / 2, y: event.y };
    if (!state.dots.mouseDry) {
      saveDot(`mouseDry`, createDot(dry.x, dry.y));
      saveDot(`mouseWet`, createDot(wet.x, wet.y));
    }
    saveDot(`mouseDry`, { finger: dry });
    saveDot(`mouseWet`, { finger: wet });
    return;
  }
  // Finger or stylus
  const id = String(event.pointerId);
  if (state.dots[id]) saveDot(id, { finger: { x: event.x, y: event.y } });
}


/** @param {PointerEvent} event */
function onPointerUp(event) {
  const id = String(event.pointerId);
  if (event.pointerType === `mouse` || !state.dots[id]) return;
  // Move it to a new id so the finger can start a fresh dot
  const dots = { ...state.dots };
  dots[`released-${Date.now()}-${id}`] = Object.freeze({ ...dots[id], released: true });
  delete dots[id];
  saveState({ dots });
}


function setup() {
  console.log(`Ice sketch is running`); // check the console (F12) to see this
  document.addEventListener(`pointerdown`, onPointerDown);
  document.addEventListener(`pointermove`, onPointerMove);
  document.addEventListener(`pointerup`, onPointerUp);
  document.addEventListener(`pointercancel`, onPointerUp);
  setInterval(() => {
    update();
    use();
  }, settings.updateRateMs);
}


setup();


/** @param {Partial<typeof state>} s */
function saveState(s) {
  state = Object.freeze({ ...state, ...s });
}