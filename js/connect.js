/* =========================================================
   connect.js — 连连看连通性判定（0 / 1 / 2 折）
   ---------------------------------------------------------
   棋盘使用「带一圈虚拟边框」的坐标：真实格子位于 r=1..rows、
   c=1..cols；r/c = 0 或 rows+1 / cols+1 属于棋盘外的空白通道，
   允许路径绕出棋盘外再折回来，这是标准连连看规则。

   算法：以 (行, 列, 进入方向) 为状态做 BFS，
        转弯次数 > 2 的状态直接剪枝；
        用「到达该状态的最小转弯数」做去重。
   ========================================================= */
(function (global) {
  "use strict";

  var DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function inside(grid, r, c) {
    return r >= 0 && c >= 0 && r < grid.length && c < grid[0].length;
  }

  /**
   * 判断两个格子能否连通（最多两次转弯）。
   * @param {Array<Array<object|null>>} grid 带边框的占用矩阵；null/0 表示空格
   * @param {{r:number,c:number}} a 起点（带边框坐标）
   * @param {{r:number,c:number}} b 终点（带边框坐标）
   * @returns {Array<{r:number,c:number}>|null} 折线经过的格子坐标（含首尾），不通返回 null
   */
  function findPath(grid, a, b) {
    if (!grid || !grid.length || !grid[0]) return null;
    if (a.r === b.r && a.c === b.c) return null;
    if (!inside(grid, a.r, a.c) || !inside(grid, b.r, b.c)) return null;

    var R = grid.length;
    var C = grid[0].length;
    var vis = [];
    var r, c, d;
    for (r = 0; r < R; r++) {
      vis[r] = [];
      for (c = 0; c < C; c++) vis[r][c] = [9, 9, 9, 9];
    }

    function passable(tr, tc) {
      return (tr === b.r && tc === b.c) || !grid[tr][tc];
    }

    // 从起点迈出第一步：这一步不计转弯
    var queue = [];
    for (d = 0; d < 4; d++) {
      var nr = a.r + DIRS[d][0];
      var nc = a.c + DIRS[d][1];
      if (!inside(grid, nr, nc) || !passable(nr, nc)) continue;
      var first = [{ r: a.r, c: a.c }, { r: nr, c: nc }];
      if (nr === b.r && nc === b.c) return first;
      if (vis[nr][nc][d] > 0) {
        vis[nr][nc][d] = 0;
        queue.push({ r: nr, c: nc, dir: d, turns: 0, path: first });
      }
    }

    for (var i = 0; i < queue.length; i++) {
      var node = queue[i];
      for (var nd = 0; nd < 4; nd++) {
        var tr = node.r + DIRS[nd][0];
        var tc = node.c + DIRS[nd][1];
        if (!inside(grid, tr, tc) || !passable(tr, tc)) continue;
        var turns = node.turns + (nd === node.dir ? 0 : 1);
        if (turns > 2) continue;
        if (vis[tr][tc][nd] <= turns) continue;
        vis[tr][tc][nd] = turns;

        var path = node.path.concat([{ r: tr, c: tc }]);
        if (tr === b.r && tc === b.c) return path;
        queue.push({ r: tr, c: tc, dir: nd, turns: turns, path: path });
      }
    }
    return null;
  }

  /**
   * 在棋盘上找出一组可以消除的同类格子。
   * @param {Array<Array<object|null>>} grid 带边框占用矩阵，格子对象须含 pairId 字段
   * @returns {{a:object,b:object,path:Array}|null}
   */
  function findAnyMove(grid) {
    var groups = {};
    var r, c;
    for (r = 0; r < grid.length; r++) {
      for (c = 0; c < grid[r].length; c++) {
        var cell = grid[r][c];
        if (!cell) continue;
        var key = "p" + cell.pairId;
        (groups[key] || (groups[key] = [])).push({ r: r, c: c });
      }
    }
    var keys = Object.keys(groups);
    for (var k = 0; k < keys.length; k++) {
      var list = groups[keys[k]];
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var path = findPath(grid, list[i], list[j]);
          if (path) return { a: list[i], b: list[j], path: path };
        }
      }
    }
    return null;
  }

  var Connect = { findPath: findPath, findAnyMove: findAnyMove };
  global.Connect = Connect;

  if (typeof module !== "undefined" && module.exports) module.exports = Connect;
})(typeof window !== "undefined" ? window : globalThis);
