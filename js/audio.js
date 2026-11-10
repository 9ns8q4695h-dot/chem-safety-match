/* =========================================================
   audio.js — 用 Web Audio 现场合成音效
   ---------------------------------------------------------
   · 不加载任何外部音频文件，因此没有版权与路径问题；
   · 首次点击/触摸后才创建 AudioContext（浏览器自动播放策略）；
   · 所有音量都压得较低，课堂上不刺耳。
   ========================================================= */
(function (global) {
  "use strict";

  var ctx = null;
  var master = null;
  var enabled = true;
  var unlocked = false;

  function ensureContext() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function resume() {
    if (ctx && ctx.state === "suspended" && ctx.resume) ctx.resume();
  }

  /** 一个带包络的简单音 */
  function tone(opt) {
    if (!enabled) return;
    var ac = ensureContext();
    if (!ac) return;
    resume();
    var t0 = ac.currentTime + (opt.delay || 0);
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = opt.type || "sine";
    osc.frequency.setValueAtTime(opt.from, t0);
    if (opt.to && opt.to !== opt.from) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, opt.to), t0 + opt.duration);
    }
    var peak = opt.gain == null ? 0.6 : opt.gain;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, opt.duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + opt.duration + 0.02);
  }

  /** 短噪声，用于洗牌/失败 */
  function noise(duration, gainValue) {
    if (!enabled) return;
    var ac = ensureContext();
    if (!ac) return;
    resume();
    var len = Math.floor(ac.sampleRate * duration);
    var buffer = ac.createBuffer(1, len, ac.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    var src = ac.createBufferSource();
    src.buffer = buffer;
    var filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1200;
    var gain = ac.createGain();
    gain.gain.value = gainValue == null ? 0.25 : gainValue;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  var SOUNDS = {
    click: function () {
      tone({ from: 520, to: 640, duration: 0.06, type: "sine", gain: 0.35 });
    },
    select: function () {
      tone({ from: 620, to: 760, duration: 0.08, type: "sine", gain: 0.4 });
    },
    match: function (combo) {
      var lift = Math.min(combo || 0, 5) * 30;
      tone({ from: 660 + lift, to: 660 + lift, duration: 0.09, type: "sine", gain: 0.4 });
      tone({ from: 880 + lift, duration: 0.12, type: "triangle", gain: 0.3, delay: 0.07 });
      tone({ from: 1180 + lift, duration: 0.16, type: "sine", gain: 0.22, delay: 0.15 });
    },
    wrong: function () {
      tone({ from: 190, to: 110, duration: 0.28, type: "sawtooth", gain: 0.28 });
      tone({ from: 140, to: 90, duration: 0.3, type: "square", gain: 0.12, delay: 0.02 });
    },
    blocked: function () {
      tone({ from: 300, to: 260, duration: 0.12, type: "triangle", gain: 0.25 });
    },
    hint: function () {
      tone({ from: 980, to: 1320, duration: 0.12, type: "sine", gain: 0.3 });
    },
    shuffle: function () {
      noise(0.22, 0.2);
      tone({ from: 420, to: 700, duration: 0.18, type: "triangle", gain: 0.2, delay: 0.05 });
    },
    tick: function () {
      tone({ from: 1000, duration: 0.03, type: "square", gain: 0.1 });
    },
    win: function () {
      var notes = [523, 659, 784, 1047];
      for (var i = 0; i < notes.length; i++) {
        tone({ from: notes[i], duration: 0.22, type: "triangle", gain: 0.32, delay: i * 0.11 });
      }
    },
    lose: function () {
      tone({ from: 420, to: 300, duration: 0.3, type: "triangle", gain: 0.28 });
      tone({ from: 300, to: 180, duration: 0.5, type: "sawtooth", gain: 0.2, delay: 0.18 });
    },
    unlock: function () {
      tone({ from: 784, duration: 0.12, type: "sine", gain: 0.3 });
      tone({ from: 1047, duration: 0.2, type: "sine", gain: 0.3, delay: 0.1 });
    }
  };

  var Sound = {
    /** 必须在用户手势里调用一次，否则移动端可能没有声音 */
    unlock: function () {
      ensureContext();
      resume();
      unlocked = true;
    },
    play: function (name, arg) {
      if (!enabled) return;
      var fn = SOUNDS[name];
      if (fn) fn(arg);
    },
    setEnabled: function (on) {
      enabled = !!on;
      if (enabled) {
        ensureContext();
        resume();
      }
    },
    isEnabled: function () {
      return enabled;
    },
    isUnlocked: function () {
      return unlocked;
    }
  };

  global.Sound = Sound;
})(window);
