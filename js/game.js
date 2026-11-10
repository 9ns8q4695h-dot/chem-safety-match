/* =========================================================
   game.js — 游戏主逻辑：棋盘、连线、计时、计分、结算、图鉴
   ---------------------------------------------------------
   结构：
     state        单一状态对象
     buildBoard   生成 DOM 棋盘与格子
     placeTiles   把卡片随机摆到格子上，并保证有解
     onTileClick  选卡、判定、配对/纠错
     timer        基于时间戳的倒计时，暂停/惩罚都不会漂移
   ========================================================= */
(function () {
  "use strict";

  var D = window.GAME_DATA;
  var CFG = D.config;
  var LEVELS = D.levels;

  var dom = {};
  var state = {
    screen: "start",       // start | play | paused | result
    levelIndex: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    wrong: 0,
    pairsLeft: 0,
    hintLeft: 0,
    shuffleLeft: 0,
    matched: [],
    selected: null,
    busy: false,
    tiles: [],
    cells: [],
    grid: null,
    layout: { rows: 5, cols: 8 },
    tilePx: 72,
    gapPx: 8,
    timeLeftMs: 0
  };

  var save = { unlocked: 0, best: {}, sound: true, collected: {}, plays: 0 };
  var timerId = null;
  var timerRunning = false;
  var deadline = 0;
  var lastShownSec = -1;
  var kcTimer = null;
  var toastTimer = null;
  var resizeTimer = null;

  /* ---------------- 工具 ---------------- */
  function $(id) { return document.getElementById(id); }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  function formatSec(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return pad2(Math.floor(sec / 60)) + ":" + pad2(sec % 60);
  }

  /* ---------------- 存档 ---------------- */
  function loadSave() {
    try {
      var raw = window.localStorage.getItem(D.meta.saveKey);
      if (!raw) return;
      var obj = JSON.parse(raw);
      if (obj && typeof obj === "object") {
        save.unlocked = typeof obj.unlocked === "number" ? obj.unlocked : 0;
        save.best = obj.best && typeof obj.best === "object" ? obj.best : {};
        save.sound = obj.sound !== false;
        save.collected = obj.collected && typeof obj.collected === "object" ? obj.collected : {};
        save.plays = typeof obj.plays === "number" ? obj.plays : 0;
      }
    } catch (e) {
      /* 隐私模式或 file:// 下 localStorage 可能被禁用，忽略即可 */
    }
  }

  function persist() {
    try {
      window.localStorage.setItem(D.meta.saveKey, JSON.stringify(save));
    } catch (e) { /* 忽略 */ }
  }

  /* ---------------- 提示 ---------------- */
  function showToast(msg, kind) {
    dom.toast.textContent = msg;
    dom.toast.classList.toggle("is-warn", kind === "warn");
    dom.toast.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      dom.toast.classList.remove("is-show");
    }, 1900);
  }

  /* ---------------- 覆盖层 ---------------- */
  function showOverlay(which) {
    dom.screenStart.hidden = which !== "start";
    dom.screenPause.hidden = which !== "pause";
    dom.screenResult.hidden = which !== "result";
    state.screen = which === "start" ? "start" : which === "pause" ? "paused" : which === "result" ? "result" : "play";
  }

  /* ---------------- 棋盘几何 ---------------- */
  function boardDims() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    /* 手机横屏：屏幕宽而矮，用 4×8 让卡片尽量大，避免文字被压成一条 */
    if (w > h && h <= 520 && w >= 600) return { rows: 4, cols: 8 };
    if (w < 560) return { rows: 7, cols: 5 };
    if (w < 900) return { rows: 6, cols: 6 };
    return { rows: 5, cols: 8 };
  }

  function computeGeometry() {
    var rows = state.layout.rows;
    var cols = state.layout.cols;
    var stageW = Math.max(240, dom.stage.clientWidth - 20);
    var stageH = Math.max(200, dom.stage.clientHeight - 16);
    var gap = 8;
    var tile = Math.min(
      (stageW - gap * (cols - 1)) / cols,
      (stageH - gap * (rows - 1)) / rows
    );
    if (tile < 58) {
      gap = 6;
      tile = Math.min(
        (stageW - gap * (cols - 1)) / cols,
        (stageH - gap * (rows - 1)) / rows
      );
    }
    tile = Math.max(32, Math.min(96, Math.floor(tile)));
    state.tilePx = tile;
    state.gapPx = tile >= 62 ? 8 : 6;
    var board = dom.board;
    board.style.setProperty("--cols", cols);
    board.style.setProperty("--rows", rows);
    board.style.setProperty("--tile", tile + "px");
    board.style.setProperty("--gap", state.gapPx + "px");
  }

  function buildBoard() {
    computeGeometry();
    var rows = state.layout.rows;
    var cols = state.layout.cols;

    dom.board.innerHTML = "";
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "path-layer");
    svg.setAttribute("id", "path-layer");
    svg.setAttribute("aria-hidden", "true");
    dom.board.appendChild(svg);
    dom.pathLayer = svg;

    state.cells = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.r = r;
        cell.dataset.c = c;
        dom.board.appendChild(cell);
        state.cells.push(cell);
      }
    }
  }

  function newGrid() {
    var rows = state.layout.rows;
    var cols = state.layout.cols;
    var grid = [];
    for (var r = 0; r < rows + 2; r++) {
      var line = [];
      for (var c = 0; c < cols + 2; c++) line.push(null);
      grid.push(line);
    }
    return grid;
  }

  function paintTiles() {
    var cols = state.layout.cols;
    for (var i = 0; i < state.cells.length; i++) {
      var cell = state.cells[i];
      while (cell.firstChild) cell.removeChild(cell.firstChild);
    }
    for (var j = 0; j < state.tiles.length; j++) {
      var t = state.tiles[j];
      var cellEl = state.cells[(t.r - 1) * cols + (t.c - 1)];
      if (!cellEl) continue;
      t.el.className = t.baseClass;
      cellEl.appendChild(t.el);
    }
  }

  function placeTiles(tiles) {
    var rows = state.layout.rows;
    var cols = state.layout.cols;
    var total = rows * cols;
    var i, j;

    if (!tiles || !tiles.length) {
      state.tiles = [];
      state.grid = newGrid();
      paintTiles();
      return;
    }

    for (var attempt = 0; attempt < 400; attempt++) {
      var coords = [];
      for (i = 0; i < total; i++) coords.push(i);
      shuffle(coords);

      var grid = newGrid();
      for (i = 0; i < tiles.length; i++) {
        var idx = coords[i];
        var r = Math.floor(idx / cols) + 1;
        var c = (idx % cols) + 1;
        tiles[i].r = r;
        tiles[i].c = c;
        grid[r][c] = tiles[i];
      }
      if (window.Connect.findAnyMove(grid)) {
        state.tiles = tiles;
        state.grid = grid;
        paintTiles();
        return;
      }
    }

    /* 兜底：实在摆不出有解的局面，就把一对放到相邻格 */
    var backup = newGrid();
    for (i = 0; i < tiles.length; i++) {
      var br = Math.floor(i / cols) + 1;
      var bc = (i % cols) + 1;
      tiles[i].r = br;
      tiles[i].c = bc;
      backup[br][bc] = tiles[i];
    }
    state.tiles = tiles;
    state.grid = backup;
    paintTiles();
  }

  /* ---------------- 卡片创建 ---------------- */
  function createTiles(level) {
    var tiles = [];
    var hazards = D.hazards;
    for (var i = 0; i < level.pairs.length; i++) {
      var pair = level.pairs[i];

      var a = { uid: pair.id + "-a", pairId: pair.id, side: "a", pair: pair };
      a.el = document.createElement("button");
      a.el.type = "button";
      a.baseClass = "tile";
      if (pair.a.sign) {
        a.baseClass = "tile tile-sign";
        a.el.innerHTML = '<span class="sign-wrap">' + window.getSignSVG(pair.a.sign) + "</span>";
        a.el.setAttribute("aria-label", "安全标识：" + pair.b.text);
      } else {
        var hz = hazards[pair.a.hazard];
        var chip = hz ? '<span class="hazard-chip ' + hz.cls + '">' + hz.label + "</span>" : "";
        a.el.innerHTML = '<span class="tile-name">' + pair.a.name + "</span>" + chip;
        a.el.setAttribute("aria-label", "危险化学品：" + pair.a.name);
      }
      a.el.className = a.baseClass;
      a.el.dataset.uid = a.uid;
      attachTileEvent(a);

      var b = { uid: pair.id + "-b", pairId: pair.id, side: "b", pair: pair };
      b.el = document.createElement("button");
      b.el.type = "button";
      b.baseClass = "tile";
      b.el.className = b.baseClass;
      b.el.innerHTML = '<span class="tile-text-label">' + pair.b.text + "</span>";
      b.el.setAttribute("aria-label", "含义或措施：" + pair.b.text);
      b.el.dataset.uid = b.uid;
      attachTileEvent(b);

      tiles.push(a, b);
    }
    return shuffle(tiles);
  }

  function attachTileEvent(tile) {
    tile.el.addEventListener("click", function (ev) {
      ev.preventDefault();
      onTileClick(tile);
    });
  }

  /* ---------------- 选卡与判定 ---------------- */
  function onTileClick(tile) {
    if (state.screen !== "play" || state.busy) return;
    window.Sound.play("click");

    if (state.selected === tile) {
      tile.el.classList.remove("is-selected");
      state.selected = null;
      return;
    }

    if (!state.selected) {
      state.selected = tile;
      tile.el.classList.add("is-selected");
      window.Sound.play("select");
      return;
    }

    var first = state.selected;

    if (first.pairId === tile.pairId) {
      var path = window.Connect.findPath(
        state.grid,
        { r: first.r, c: first.c },
        { r: tile.r, c: tile.c }
      );
      if (path) {
        first.el.classList.remove("is-selected");
        state.selected = null;
        doMatch(first, tile, path);
      } else {
        window.Sound.play("blocked");
        showToast("这两张之间被挡住了，清掉挡路的卡片再试");
      }
      return;
    }

    first.el.classList.remove("is-selected");
    state.selected = null;
    doWrong(first, tile);
  }

  function doMatch(a, b, path) {
    state.busy = true;
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    var comboBonus = Math.min(state.combo * CFG.comboStep, CFG.comboMax);
    state.score += CFG.matchScore + comboBonus;
    state.pairsLeft -= 1;
    state.matched.push(a.pair);

    if (state.grid[a.r] && state.grid[a.r][a.c] === a) state.grid[a.r][a.c] = null;
    if (state.grid[b.r] && state.grid[b.r][b.c] === b) state.grid[b.r][b.c] = null;
    state.tiles = state.tiles.filter(function (t) { return t !== a && t !== b; });

    window.Sound.play("match", state.combo);
    drawPath(path);
    a.el.classList.add("is-matched");
    b.el.classList.add("is-matched");
    showKnowledge(a.pair);
    if (!save.collected[a.pair.id]) {
      save.collected[a.pair.id] = true;
      persist();
      updateCodexCount();
    }
    updateHUD();

    setTimeout(function () {
      if (a.el.parentNode) a.el.parentNode.removeChild(a.el);
      if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
      state.busy = false;
      if (state.pairsLeft === 0) {
        levelWin();
        return;
      }
      if (!window.Connect.findAnyMove(state.grid)) autoShuffle();
    }, 340);
  }

  function doWrong(a, b) {
    state.busy = true;
    state.combo = 0;
    state.wrong += 1;
    state.score = Math.max(0, state.score - CFG.wrongScore);
    penaltyTime(CFG.wrongTime);
    a.el.classList.add("is-wrong");
    b.el.classList.add("is-wrong");
    window.Sound.play("wrong");
    showToast("配对错误：" + CFG.wrongScore + " 分、" + CFG.wrongTime + " 秒，连击中断", "warn");
    updateHUD();
    setTimeout(function () {
      a.el.classList.remove("is-wrong");
      b.el.classList.remove("is-wrong");
      state.busy = false;
    }, CFG.wrongFlashMs);
  }

  function autoShuffle() {
    if (!state.tiles.length) return;
    state.selected = null;
    placeTiles(state.tiles);
    window.Sound.play("shuffle");
    showToast("当前没有可消组合，已自动免费洗牌");
  }

  /* ---------------- 连线绘制 ---------------- */
  function drawPath(points) {
    if (!dom.pathLayer) return;
    while (dom.pathLayer.firstChild) dom.pathLayer.removeChild(dom.pathLayer.firstChild);
    var tile = state.tilePx;
    var gap = state.gapPx;
    var str = points.map(function (p) {
      var x = (p.c - 1) * (tile + gap) + tile / 2;
      var y = (p.r - 1) * (tile + gap) + tile / 2;
      return x + "," + y;
    }).join(" ");
    var poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    poly.setAttribute("points", str);
    poly.setAttribute("class", "path-line");
    dom.pathLayer.appendChild(poly);
    setTimeout(function () {
      if (poly.parentNode) poly.parentNode.removeChild(poly);
    }, 620);
  }

  /* ---------------- 计时 ---------------- */
  function startTimer(ms) {
    state.timeLeftMs = ms;
    deadline = Date.now() + ms;
    lastShownSec = -1;
    clearInterval(timerId);
    timerId = setInterval(tick, 200);
    timerRunning = true;
    tick();
    dom.hudTimeChip.classList.toggle("is-warning", false);
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
    timerRunning = false;
  }

  function pauseTimer() {
    if (!timerRunning) return;
    state.timeLeftMs = Math.max(0, deadline - Date.now());
    stopTimer();
  }

  function resumeTimer() {
    if (timerRunning) return;
    deadline = Date.now() + state.timeLeftMs;
    clearInterval(timerId);
    timerId = setInterval(tick, 200);
    timerRunning = true;
    tick();
  }

  function penaltyTime(sec) {
    state.timeLeftMs = Math.max(0, state.timeLeftMs - sec * 1000);
    if (state.screen === "play") {
      deadline -= sec * 1000;
      tick();
    }
  }

  function tick() {
    var left = Math.max(0, deadline - Date.now());
    var sec = Math.ceil(left / 1000);
    if (sec !== lastShownSec) {
      lastShownSec = sec;
      dom.hudTime.textContent = formatSec(sec);
      dom.hudTimeChip.classList.toggle("is-warning", sec <= 20 && state.screen === "play");
      if (state.screen === "play" && sec <= 5 && sec > 0) window.Sound.play("tick");
      state.timeLeftMs = left;
    }
    if (left <= 0 && state.screen === "play") {
      stopTimer();
      levelLose();
    }
  }

  /* ---------------- HUD ---------------- */
  function updateHUD() {
    var level = LEVELS[state.levelIndex];
    dom.hudLevel.textContent = state.levelIndex + 1;
    dom.hudScore.textContent = state.score;
    dom.hudCombo.textContent = state.combo;
    dom.hudComboChip.classList.toggle("is-hot", state.combo >= 3);
    dom.hudLeft.textContent = state.pairsLeft;
    dom.hintCount.textContent = state.hintLeft;
    dom.shuffleCount.textContent = state.shuffleLeft;
    dom.btnHint.disabled = state.hintLeft <= 0 || state.screen !== "play";
    dom.btnShuffle.disabled = state.shuffleLeft <= 0 || state.screen !== "play";
    var done = level.pairs.length - state.pairsLeft;
    dom.progressBar.style.width = (done / level.pairs.length) * 100 + "%";
  }

  function updateCodexCount() {
    dom.codexCount.textContent = Object.keys(save.collected).length;
  }

  /* ---------------- 知识卡 ---------------- */
  function showKnowledge(pair, kind) {
    var k = pair.knowledge;
    dom.kcTitle.textContent = k.title;
    dom.kcBody.textContent = k.body;
    dom.kcBasis.textContent = k.basis;
    dom.kcBadge.textContent = kind === "warn" ? "安全提醒" : "安全知识";
    dom.kcBadge.classList.toggle("is-warn", kind === "warn");
    dom.knowledgeCard.hidden = false;
    dom.knowledgeCard.classList.remove("is-out");
    clearTimeout(kcTimer);
    kcTimer = setTimeout(hideKnowledge, CFG.cardMs);
    if (state.screen === "play" && timerRunning) {
      pauseTimer();
      state.cardHold = true;
    }
  }

  function hideKnowledge() {
    clearTimeout(kcTimer);
    if (dom.knowledgeCard.hidden) return;
    dom.knowledgeCard.classList.add("is-out");
    setTimeout(function () {
      dom.knowledgeCard.hidden = true;
      dom.knowledgeCard.classList.remove("is-out");
      if (state.cardHold) {
        state.cardHold = false;
        if (state.screen === "play") resumeTimer();
      }
    }, 200);
  }

  /* ---------------- 提示 / 洗牌 ---------------- */
  function useHint() {
    if (state.screen !== "play" || state.busy) return;
    if (state.hintLeft <= 0) return;
    var move = window.Connect.findAnyMove(state.grid);
    if (!move) {
      autoShuffle();
      return;
    }
    state.hintLeft -= 1;
    state.score = Math.max(0, state.score - CFG.hintCost);
    updateHUD();
    window.Sound.play("hint");
    if (state.selected) {
      state.selected.el.classList.remove("is-selected");
      state.selected = null;
    }
    var a = state.grid[move.a.r][move.a.c];
    var b = state.grid[move.b.r][move.b.c];
    if (a) a.el.classList.add("is-hint");
    if (b) b.el.classList.add("is-hint");
    drawPath(move.path);
    showToast("提示已用：-" + CFG.hintCost + " 分（剩余 " + state.hintLeft + " 次）");
    setTimeout(function () {
      if (a) a.el.classList.remove("is-hint");
      if (b) b.el.classList.remove("is-hint");
    }, CFG.hintPulseMs);
  }

  function useShuffle() {
    if (state.screen !== "play" || state.busy) return;
    if (state.shuffleLeft <= 0) return;
    state.shuffleLeft -= 1;
    state.score = Math.max(0, state.score - CFG.shuffleCost);
    if (state.selected) {
      state.selected.el.classList.remove("is-selected");
      state.selected = null;
    }
    updateHUD();
    placeTiles(state.tiles);
    window.Sound.play("shuffle");
    showToast("已洗牌：-" + CFG.shuffleCost + " 分（剩余 " + state.shuffleLeft + " 次）");
  }

  /* ---------------- 关卡流程 ---------------- */
  function startLevel(index) {
    if (index < 0 || index >= LEVELS.length) return;
    if (index > save.unlocked) {
      showToast("请先通过前面的关卡解锁", "warn");
      return;
    }
    window.Sound.unlock();
    hideKnowledge();

    var level = LEVELS[index];
    state.levelIndex = index;
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.wrong = 0;
    state.pairsLeft = level.pairs.length;
    state.hintLeft = CFG.hints;
    state.shuffleLeft = CFG.shuffles;
    state.matched = [];
    state.selected = null;
    state.busy = false;

    state.layout = boardDims();
    state.tiles = createTiles(level);
    buildBoard();
    placeTiles(state.tiles);

    showOverlay(null);
    dom.knowledgeCard.hidden = true;
    updateHUD();
    updateCodexCount();
    startTimer(level.time * 1000);
    showToast("第 " + (index + 1) + " 关 · " + level.name + "：" + level.desc);
    window.Sound.play("click");
  }

  function levelWin() {
    stopTimer();
    state.screen = "result";
    hideKnowledge();
    var level = LEVELS[state.levelIndex];
    var secLeft = Math.ceil(state.timeLeftMs / 1000);
    var bonus = secLeft * CFG.finishBonusPerSec + (state.wrong === 0 ? CFG.noMissBonus : 0);
    state.score += bonus;

    var rank = rankOf(secLeft, level.time);

    save.best[state.levelIndex] = Math.max(save.best[state.levelIndex] || 0, state.score);
    if (state.levelIndex + 1 < LEVELS.length) {
      save.unlocked = Math.max(save.unlocked, state.levelIndex + 1);
    }
    for (var i = 0; i < level.pairs.length; i++) save.collected[level.pairs[i].id] = true;
    save.plays += 1;
    persist();
    updateCodexCount();

    dom.resultRank.textContent = rank;
    dom.resultRank.className = "rank-badge rank-" + rank;
    dom.resultTitle.textContent = "通关成功";
    dom.resultDesc.textContent = "第 " + (state.levelIndex + 1) + " 关「" + level.name + "」 · 时间奖励 +" + bonus + " 分";
    fillStats(secLeft);
    fillReview(level, true);
    dom.btnNext.hidden = state.levelIndex >= LEVELS.length - 1;
    dom.btnNext.textContent = "下一关";
    showOverlay("result");
    window.Sound.play("win");
  }

  function levelLose() {
    stopTimer();
    state.screen = "result";
    hideKnowledge();
    var level = LEVELS[state.levelIndex];
    dom.resultRank.textContent = "F";
    dom.resultRank.className = "rank-badge rank-fail";
    dom.resultTitle.textContent = "时间到";
    dom.resultDesc.textContent = "还差 " + state.pairsLeft + " 对没连完。再试一次，先连容易看出来的！";
    fillStats(0);
    fillReview(level, false);
    dom.btnNext.hidden = true;
    showOverlay("result");
    window.Sound.play("lose");
  }

  function rankOf(secLeft, total) {
    var ratio = secLeft / total;
    if (state.wrong === 0 && ratio >= 0.35) return "S";
    if (state.wrong <= 1) return "A";
    if (state.wrong <= 3) return "B";
    return "C";
  }

  function fillStats(secLeft) {
    var items = [
      { label: "最终得分", value: state.score },
      { label: "最高连击", value: state.maxCombo },
      { label: "剩余时间", value: secLeft + "s" },
      { label: "失误次数", value: state.wrong }
    ];
    dom.resultStats.innerHTML = "";
    for (var i = 0; i < items.length; i++) {
      var div = document.createElement("div");
      div.className = "stat";
      var span = document.createElement("span");
      span.textContent = items[i].label;
      var b = document.createElement("b");
      b.textContent = items[i].value;
      div.appendChild(span);
      div.appendChild(b);
      dom.resultStats.appendChild(div);
    }
  }

  function fillReview(level, won) {
    var done = {};
    for (var i = 0; i < state.matched.length; i++) done[state.matched[i].id] = true;
    dom.reviewList.innerHTML = "";
    for (var j = 0; j < level.pairs.length; j++) {
      var pair = level.pairs[j];
      var got = !!done[pair.id];
      var item = document.createElement("div");
      item.className = "review-item" + (got ? "" : " is-missed");

      var h = document.createElement("h4");
      h.textContent = pair.knowledge.title;
      var flag = document.createElement("span");
      flag.className = "ri-flag";
      flag.textContent = got ? "已配对" : "未配对";
      h.appendChild(flag);
      item.appendChild(h);

      var p = document.createElement("p");
      p.textContent = pair.knowledge.body;
      item.appendChild(p);

      var basis = document.createElement("p");
      basis.className = "ri-basis";
      basis.textContent = "依据：" + pair.knowledge.basis;
      item.appendChild(basis);

      dom.reviewList.appendChild(item);
    }
    var count = state.matched.length;
    dom.reviewCount.textContent = count + " / " + level.pairs.length;
    dom.reviewHint.textContent = won
      ? "本关全部知识已收入图鉴，可随时点底部「图鉴」复习。"
      : "这些是本关应掌握的知识点，重玩时可以留意。";
  }

  /* ---------------- 开始界面 ---------------- */
  function renderStart() {
    dom.levelCards.innerHTML = "";
    for (var i = 0; i < LEVELS.length; i++) {
      var level = LEVELS[i];
      var locked = i > save.unlocked;
      var card = document.createElement("button");
      card.type = "button";
      card.className = "level-card" + (locked ? " locked" : "");
      card.dataset.level = i;

      var top = document.createElement("div");
      top.className = "lv-top";
      var num = document.createElement("span");
      num.className = "lv-num";
      num.textContent = "LEVEL " + (i + 1);
      var lock = document.createElement("span");
      lock.className = "lv-lock";
      lock.textContent = locked ? "🔒" : save.best[i] ? "★" : "▸";
      top.appendChild(num);
      top.appendChild(lock);

      var name = document.createElement("span");
      name.className = "lv-name";
      name.textContent = level.name;

      var desc = document.createElement("span");
      desc.className = "lv-desc";
      desc.textContent = level.desc;

      var best = document.createElement("span");
      best.className = "lv-best";
      best.innerHTML = locked ? "通过上一关解锁" : "最高分 <b>" + (save.best[i] || 0) + "</b>";

      card.appendChild(top);
      card.appendChild(name);
      card.appendChild(desc);
      card.appendChild(best);
      card.addEventListener("click", (function (idx) {
        return function () { startLevel(idx); };
      })(i));
      dom.levelCards.appendChild(card);
    }
    dom.btnStart.textContent = save.unlocked > 0 ? "继续挑战" : "开始游戏";
  }

  function goHome() {
    stopTimer();
    hideKnowledge();
    state.screen = "start";
    renderStart();
    updateCodexCount();
    showOverlay("start");
  }

  /* ---------------- 暂停 ---------------- */
  function pauseGame() {
    if (state.screen !== "play") return;
    pauseTimer();
    showOverlay("pause");
    state.selected = null;
    if (dom.knowledgeCard) dom.knowledgeCard.hidden = true;
    state.cardHold = false;
    updateHUD();
  }

  function resumeGame() {
    if (state.screen !== "paused") return;
    showOverlay(null);
    resumeTimer();
    updateHUD();
  }

  /* ---------------- 图鉴 ---------------- */
  function openCodex() {
    var body = dom.codexBody;
    body.innerHTML = "";
    var total = 0;
    for (var i = 0; i < LEVELS.length; i++) {
      var level = LEVELS[i];
      var got = level.pairs.filter(function (p) { return save.collected[p.id]; });
      if (!got.length) continue;
      total += got.length;
      var group = document.createElement("div");
      group.className = "codex-group";
      var h3 = document.createElement("h3");
      h3.textContent = "第 " + (i + 1) + " 关 · " + level.name + "（" + got.length + "/" + level.pairs.length + "）";
      group.appendChild(h3);
      for (var j = 0; j < got.length; j++) {
        var pair = got[j];
        var item = document.createElement("div");
        item.className = "codex-item";
        var h4 = document.createElement("h4");
        h4.textContent = pair.knowledge.title;
        var p = document.createElement("p");
        p.textContent = pair.knowledge.body;
        var basis = document.createElement("p");
        basis.className = "ci-basis";
        basis.textContent = "依据：" + pair.knowledge.basis;
        item.appendChild(h4);
        item.appendChild(p);
        item.appendChild(basis);
        group.appendChild(item);
      }
      body.appendChild(group);
    }
    if (total === 0) {
      var empty = document.createElement("div");
      empty.className = "codex-empty";
      empty.innerHTML = "图鉴还是空的。<br>每成功配对一组卡片，对应的安全知识就会收进这里。";
      body.appendChild(empty);
    }
    dom.modalCodex.hidden = false;
    updateCodexCount();
  }

  function closeCodex() {
    dom.modalCodex.hidden = true;
  }

  /* ---------------- 音效按钮 ---------------- */
  function updateSoundBtn() {
    dom.btnSound.classList.toggle("is-muted", !save.sound);
    dom.btnSound.setAttribute("aria-label", save.sound ? "关闭音效" : "开启音效");
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    dom.btnStart.addEventListener("click", function () {
      var idx = Math.min(save.unlocked, LEVELS.length - 1);
      startLevel(idx);
    });

    dom.btnRules.addEventListener("click", function () {
      dom.rulesPanel.hidden = !dom.rulesPanel.hidden;
      dom.aboutPanel.hidden = true;
    });
    dom.btnAbout.addEventListener("click", function () {
      dom.aboutPanel.hidden = !dom.aboutPanel.hidden;
      dom.rulesPanel.hidden = true;
    });

    dom.btnPause.addEventListener("click", function () {
      if (state.screen === "play") pauseGame();
      else if (state.screen === "paused") resumeGame();
    });
    dom.btnResume.addEventListener("click", resumeGame);
    dom.btnRestart.addEventListener("click", function () { startLevel(state.levelIndex); });
    dom.btnQuit.addEventListener("click", goHome);

    dom.btnRetry.addEventListener("click", function () { startLevel(state.levelIndex); });
    dom.btnNext.addEventListener("click", function () {
      if (state.levelIndex + 1 < LEVELS.length) startLevel(state.levelIndex + 1);
    });
    dom.btnHome.addEventListener("click", goHome);

    dom.btnHint.addEventListener("click", useHint);
    dom.btnShuffle.addEventListener("click", useShuffle);
    dom.btnCodex.addEventListener("click", openCodex);
    dom.codexClose.addEventListener("click", closeCodex);
    dom.modalCodex.addEventListener("click", function (ev) {
      if (ev.target === dom.modalCodex) closeCodex();
    });

    dom.kcClose.addEventListener("click", hideKnowledge);

    dom.btnSound.addEventListener("click", function () {
      save.sound = !save.sound;
      window.Sound.setEnabled(save.sound);
      updateSoundBtn();
      persist();
      if (save.sound) window.Sound.play("click");
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        if (!dom.modalCodex.hidden) { closeCodex(); return; }
        if (state.screen === "play") pauseGame();
        else if (state.screen === "paused") resumeGame();
      }
      if (ev.key === "p" || ev.key === "P") {
        if (state.screen === "play") pauseGame();
        else if (state.screen === "paused") resumeGame();
      }
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden && state.screen === "play") pauseGame();
    });

    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(onResize, 180);
    });

    document.addEventListener("pointerdown", function () {
      window.Sound.unlock();
    }, { once: true });
  }

  function onResize() {
    if (!state.grid) return;
    var dims = boardDims();
    if (dims.rows !== state.layout.rows || dims.cols !== state.layout.cols) {
      state.layout = dims;
      buildBoard();
      placeTiles(state.tiles);
    } else {
      computeGeometry();
    }
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    dom.board = $("board");
    dom.stage = $("stage");
    dom.pathLayer = $("path-layer");
    dom.hudLevel = $("hud-level");
    dom.hudScore = $("hud-score");
    dom.hudCombo = $("hud-combo");
    dom.hudComboChip = $("hud-combo-chip");
    dom.hudLeft = $("hud-left");
    dom.hudTime = $("hud-time");
    dom.hudTimeChip = $("hud-time-chip");
    dom.progressBar = $("progress-bar");
    dom.hintCount = $("hint-count");
    dom.shuffleCount = $("shuffle-count");
    dom.codexCount = $("codex-count");
    dom.btnHint = $("btn-hint");
    dom.btnShuffle = $("btn-shuffle");
    dom.btnCodex = $("btn-codex");
    dom.btnPause = $("btn-pause");
    dom.btnSound = $("btn-sound");
    dom.btnStart = $("btn-start");
    dom.btnRules = $("btn-rules");
    dom.btnAbout = $("btn-about");
    dom.rulesPanel = $("rules-panel");
    dom.aboutPanel = $("about-panel");
    dom.levelCards = $("level-cards");
    dom.knowledgeCard = $("knowledge-card");
    dom.kcBadge = $("kc-badge");
    dom.kcTitle = $("kc-title");
    dom.kcBody = $("kc-body");
    dom.kcBasis = $("kc-basis");
    dom.kcClose = $("kc-close");
    dom.toast = $("toast");
    dom.screenStart = $("screen-start");
    dom.screenPause = $("screen-pause");
    dom.screenResult = $("screen-result");
    dom.resultRank = $("result-rank");
    dom.resultTitle = $("result-title");
    dom.resultDesc = $("result-desc");
    dom.resultStats = $("result-stats");
    dom.reviewList = $("review-list");
    dom.reviewCount = $("review-count");
    dom.reviewHint = $("review-hint");
    dom.btnRetry = $("btn-retry");
    dom.btnNext = $("btn-next");
    dom.btnHome = $("btn-home");
    dom.btnResume = $("btn-resume");
    dom.btnRestart = $("btn-restart");
    dom.btnQuit = $("btn-quit");
    dom.modalCodex = $("modal-codex");
    dom.codexBody = $("codex-body");
    dom.codexClose = $("codex-close");

    loadSave();
    window.Sound.setEnabled(save.sound);
    updateSoundBtn();
    bindEvents();
    renderStart();
    updateCodexCount();
    showOverlay("start");

    /* 调试入口：答辩演示时可查看内部状态 */
    window.__game = { state: state, save: save, startLevel: startLevel };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
