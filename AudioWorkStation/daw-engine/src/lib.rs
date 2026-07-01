// daw-engine/src/lib.rs
// Thin FFI wrapper around the `freeverb` crate (https://crates.io/crates/freeverb).
// Compiled to wasm32-unknown-unknown; consumed by public/worklets/reverb-processor.js.
//
// Parameter → crate API mapping
// ─────────────────────────────
//   SIZE      (0–1)  ┐  combined as  set_room_size(size × (0.05 + decay × 0.95))
//   DECAY     (0–1)  ┘  so each knob independently shapes the RT60.
//   DAMPING   (0–1)  →  set_dampening(damping)
//   DIFFUSION (0–1)  →  set_width(diffusion)   (closest available parameter)
//
// Build:
//   rustup target add wasm32-unknown-unknown
//   cargo build --target wasm32-unknown-unknown --release
//   cp target/wasm32-unknown-unknown/release/daw_engine.wasm \
//      ../daw-frontend/public/wasm/daw_engine.wasm

use freeverb::Freeverb;
use std::alloc::{alloc, dealloc, Layout};

// ── Wrapper ───────────────────────────────────────────────────────────────────
struct Engine {
    rv:       Freeverb<f32>,
    size:     f32,
    decay:    f32,
}

impl Engine {
    fn new(sample_rate: usize) -> Self {
        let mut rv = Freeverb::new(sample_rate);
        // Output is 100% wet — wet/dry mixing is handled by the Web Audio graph
        rv.set_wet(1.0f32);
        rv.set_dry(0.0f32);
        rv.set_width(1.0f32);  // full stereo width by default

        let mut e = Engine { rv, size: 0.5, decay: 1.0 };
        e.apply_room();
        e
    }

    // SIZE × DECAY drives room_size.
    //   size=1, decay=1  →  room_size = 1.0  (longest possible tail)
    //   size=1, decay=0  →  room_size = 0.05 (very tight even in a "big" room)
    //   size=0, decay=1  →  room_size = 0.0  (no sustain at all)
    fn apply_room(&mut self) {
        let effective = self.size * (0.05 + self.decay * 0.95);
        self.rv.set_room_size(effective);
    }
}

// ── Heap allocator helpers ────────────────────────────────────────────────────
// The AudioWorklet allocates four f32 arrays in WASM linear memory for I/O.

#[unsafe(no_mangle)]
pub extern "C" fn alloc_f32(count: i32) -> i32 {
    let layout = Layout::array::<f32>(count as usize).unwrap();
    unsafe { alloc(layout) as i32 }
}

#[unsafe(no_mangle)]
pub extern "C" fn free_f32(ptr: i32, count: i32) {
    if ptr == 0 { return; }
    let layout = Layout::array::<f32>(count as usize).unwrap();
    unsafe { dealloc(ptr as *mut u8, layout) };
}

// ── Engine lifecycle ──────────────────────────────────────────────────────────

/// Create an Engine; `sample_rate` is passed from AudioWorkletGlobalScope.sampleRate.
/// Returns an opaque i32 handle.
#[unsafe(no_mangle)]
pub extern "C" fn freeverb_create(sample_rate: i32) -> i32 {
    let bx = Box::new(Engine::new(sample_rate as usize));
    Box::into_raw(bx) as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn freeverb_destroy(ptr: i32) {
    if ptr != 0 {
        unsafe { drop(Box::from_raw(ptr as *mut Engine)) };
    }
}

// ── Process ───────────────────────────────────────────────────────────────────

/// Process `n` stereo samples. All ptr args are byte offsets into WASM memory.
#[unsafe(no_mangle)]
pub extern "C" fn freeverb_process(
    ptr:   i32,
    in_l:  i32, in_r:  i32,
    out_l: i32, out_r: i32,
    n:     i32,
) {
    if ptr == 0 { return; }
    let e = unsafe { &mut *(ptr as *mut Engine) };
    let n = n as usize;

    let in_l  = in_l  as *const f32;
    let in_r  = in_r  as *const f32;
    let out_l = out_l as *mut f32;
    let out_r = out_r as *mut f32;

    for i in 0..n {
        let il = unsafe { *in_l.add(i) };
        let ir = unsafe { *in_r.add(i) };
        let (ol, or_) = e.rv.tick((il, ir));
        unsafe { *out_l.add(i) = ol; *out_r.add(i) = or_; }
    }
}

// ── Parameter setters ─────────────────────────────────────────────────────────

#[unsafe(no_mangle)]
pub extern "C" fn freeverb_set_size(ptr: i32, value: f32) {
    if ptr == 0 { return; }
    let e = unsafe { &mut *(ptr as *mut Engine) };
    e.size = value.clamp(0.0, 1.0);
    e.apply_room();
}

#[unsafe(no_mangle)]
pub extern "C" fn freeverb_set_decay(ptr: i32, value: f32) {
    if ptr == 0 { return; }
    let e = unsafe { &mut *(ptr as *mut Engine) };
    e.decay = value.clamp(0.0, 1.0);
    e.apply_room();
}

#[unsafe(no_mangle)]
pub extern "C" fn freeverb_set_damping(ptr: i32, value: f32) {
    if ptr == 0 { return; }
    let e = unsafe { &mut *(ptr as *mut Engine) };
    e.rv.set_dampening(value.clamp(0.0, 1.0));
}

/// DIFFUSION is mapped to Freeverb's stereo width — the crate's closest
/// equivalent to allpass diffusion density.
#[unsafe(no_mangle)]
pub extern "C" fn freeverb_set_diffusion(ptr: i32, value: f32) {
    if ptr == 0 { return; }
    let e = unsafe { &mut *(ptr as *mut Engine) };
    e.rv.set_width(value.clamp(0.0, 1.0));
}
