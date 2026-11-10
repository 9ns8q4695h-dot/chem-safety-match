/* =========================================================
   signs.js — 安全标识 SVG（全部自绘，无外部素材/版权风险）
   ---------------------------------------------------------
   图形配色遵循 GB 2894-2008 的基本约定：
     · 禁止标志：白底、红色圆环+红色斜杠、黑色图形
     · 警告标志：黄色正三角形、黑色边框、黑色图形
     · 指令标志：蓝色圆形、白色图形
     · 提示标志：绿色方形、白色图形
   ========================================================= */
(function (global) {
  "use strict";

  var RED = "#e02424";
  var BLACK = "#141414";
  var YELLOW = "#ffd100";
  var BLUE = "#1f5fbf";
  var GREEN = "#009944";
  var WHITE = "#ffffff";

  function svg(inner) {
    return '<svg viewBox="0 0 100 100" role="img" aria-hidden="true" focusable="false">' + inner + "</svg>";
  }

  /* 禁止标志外框：白底红环 + 左上到右下的红斜杠 */
  function prohibition(symbol) {
    return svg(
      '<circle cx="50" cy="50" r="43" fill="' + WHITE + '" stroke="' + RED + '" stroke-width="9"/>' +
      '<g fill="' + BLACK + '">' + symbol + "</g>" +
      '<line x1="19" y1="81" x2="81" y2="19" stroke="' + RED + '" stroke-width="9" stroke-linecap="round"/>'
    );
  }

  /* 警告标志外框：黄色三角形 + 黑色边框 */
  function warning(symbol) {
    return svg(
      '<path d="M50 7 L95 88 H5 Z" fill="' + YELLOW + '" stroke="' + BLACK + '" stroke-width="7" stroke-linejoin="round"/>' +
      '<g fill="' + BLACK + '">' + symbol + "</g>"
    );
  }

  /* 指令标志外框：蓝色圆形 + 白色图形 */
  function mandatory(symbol) {
    return svg(
      '<circle cx="50" cy="50" r="44" fill="' + BLUE + '"/>' +
      '<g fill="' + WHITE + '">' + symbol + "</g>"
    );
  }

  /* 提示标志外框：绿色方形 + 白色图形 */
  function safeCondition(symbol) {
    return svg(
      '<rect x="6" y="6" width="88" height="88" rx="9" fill="' + GREEN + '"/>' +
      '<g fill="' + WHITE + '">' + symbol + "</g>"
    );
  }

  var SIGNS = {
    /* 禁止吸烟：一支带烟气的香烟 */
    "no-smoking": prohibition(
      '<rect x="27" y="53" width="44" height="10" rx="3"/>' +
      '<rect x="23" y="53" width="6" height="10" rx="2" fill="#b45309"/>' +
      '<path d="M57 48c4-4 4-8 0-12" fill="none" stroke="' + BLACK + '" stroke-width="3.4" stroke-linecap="round"/>' +
      '<path d="M66 48c4-4 4-8 0-12" fill="none" stroke="' + BLACK + '" stroke-width="3.4" stroke-linecap="round"/>'
    ),

    /* 禁止烟火：火焰 + 斜杠 */
    "no-fire": prohibition(
      '<path d="M50 30c8 8 13 14 13 23 0 8-6 14-13 14s-13-6-13-14c0-6 4-11 8-16 1 4 3 6 5 7 1-6-1-10 0-14z"/>'
    ),

    /* 当心腐蚀：液滴落在手/板上，产生腐蚀痕迹 */
    "warning-corrosive": warning(
      '<path d="M23 64c0-3 3-6 6-6h14l6 8h22c3 0 6 3 6 6v6c0 3-3 6-6 6H29c-3 0-6-3-6-6z"/>' +
      '<path d="M43 20c0 0 9 11 9 16 0 5-4 9-9 9s-9-4-9-9c0-5 9-16 9-16z"/>' +
      '<path d="M66 22c0 0 6 8 6 12 0 4-3 6-6 6s-6-2-6-6c0-4 6-12 6-12z"/>' +
      '<path d="M40 76l3 6M52 74l3 8M64 76l3 6" stroke="' + BLACK + '" stroke-width="3" stroke-linecap="round" fill="none"/>'
    ),

    /* 当心爆炸：爆炸的球体 + 冲击线 */
    "warning-explosive": warning(
      '<circle cx="50" cy="56" r="17"/>' +
      '<path d="M50 30v-9M50 82v9M32 38l-7-7M68 38l7-7M24 56h-9M76 56h9M32 74l-7 7M68 74l7 7" stroke="' + BLACK + '" stroke-width="5" stroke-linecap="round" fill="none"/>'
    ),

    /* 当心触电：闪电 */
    "warning-electric": warning(
      '<path d="M55 22 L33 55 h13 l-4 24 24-34 H52 z"/>'
    ),

    /* 必须戴防护眼镜：眼镜 */
    "must-goggles": mandatory(
      '<path d="M18 48h64v10c0 11-8 18-19 18h-4c-7 0-11-3-13-9-2 6-6 9-13 9h-4c-11 0-19-7-19-18V48z"/>' +
      '<rect x="8" y="45" width="7" height="10" rx="3" fill="' + BLUE + '"/>' +
      '<rect x="85" y="45" width="7" height="10" rx="3" fill="' + BLUE + '"/>' +
      '<rect x="32" y="78" width="10" height="8" rx="2" fill="' + BLUE + '"/>'
    ),

    /* 必须戴防毒面具：面罩 */
    "must-mask": mandatory(
      '<path d="M50 20c-16 0-28 11-28 27 0 5 1 9 2 12l10-2 3 11c4 6 12 9 20 9s14-3 18-8l3-12 10 2c1-3 2-7 2-12 0-16-12-27-27-27z"/>' +
      '<circle cx="39" cy="50" r="8" fill="' + BLUE + '"/>' +
      '<circle cx="61" cy="50" r="8" fill="' + BLUE + '"/>' +
      '<circle cx="50" cy="70" r="5" fill="' + BLUE + '"/>'
    ),

    /* 必须穿防护服：穿连体防护服的人形 */
    "must-suit": mandatory(
      '<circle cx="50" cy="26" r="9"/>' +
      '<path d="M33 39h34l6 26h-8l-3 24H38l-3-24h-8z"/>' +
      '<rect x="44" y="44" width="12" height="32" rx="3" fill="' + BLUE + '"/>' +
      '<rect x="22" y="66" width="11" height="7" rx="3"/>' +
      '<rect x="67" y="66" width="11" height="7" rx="3"/>'
    ),

    /* 紧急出口：门 + 奔跑的人 + 箭头 */
    exit: safeCondition(
      '<path d="M84 32v36H64V32z" fill="none" stroke="' + WHITE + '" stroke-width="7"/>' +
      '<path d="M64 50H20" fill="none" stroke="' + WHITE + '" stroke-width="7"/>' +
      '<path d="M30 40 L18 50 L30 60" fill="none" stroke="' + WHITE + '" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="74" cy="46" r="4.2" fill="' + BLUE + '"/>' +
      '<path d="M70 52l-6 8 7 6M64 60l-8 2M70 52l6 3" stroke="' + BLUE + '" stroke-width="3.4" fill="none" stroke-linecap="round"/>'
    ),

    /* 紧急洗眼器：眼睛 + 水滴 */
    eyewash: safeCondition(
      '<path d="M14 52c10-14 22-21 36-21s26 7 36 21c-10 14-22 21-36 21S24 66 14 52z" fill="none" stroke="' + WHITE + '" stroke-width="6"/>' +
      '<circle cx="50" cy="52" r="10"/>' +
      '<path d="M50 12c-5 7-8 12-8 16a8 8 0 0 0 16 0c0-4-3-9-8-16z"/>' +
      '<path d="M28 20c-3 4-5 7-5 9a5 5 0 0 0 10 0c0-2-2-5-5-9z"/>' +
      '<path d="M72 20c-3 4-5 7-5 9a5 5 0 0 0 10 0c0-2-2-5-5-9z"/>'
    )
  };

  global.SIGNS = SIGNS;
  global.getSignSVG = function (id) {
    return SIGNS[id] || "";
  };
})(window);
