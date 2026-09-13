"use strict";(()=>{var mn=`/* eslint-disable */
/**
 * @hyzyn/dsh-docker \u2014 \u9762\u677F\u6837\u5F0F\u8868\u3002
 *
 * \u8BBE\u8BA1\u7EA6\u5B9A\uFF08\u6539\u6837\u5F0F\u524D\u5148\u8BFB\u8FD9\u6BB5\uFF09\uFF1A
 *   - \u989C\u8272/\u8FB9\u6846/\u9634\u5F71\u4E00\u5F8B\u8D70 DSH \u5B98\u65B9 token\uFF08--dsw-*\uFF09\uFF0C\u76AE\u80A4\u5207\u6362\u81EA\u52A8\u8DDF\u968F\uFF1B
 *   - \u51E0\u4F55\uFF08\u5706\u89D2 / \u63A7\u4EF6\u9AD8\u5EA6 / \u95F4\u8DDD\uFF09\u7EDF\u4E00\u7528 --dk-* \u4EE4\u724C\uFF0C\u7981\u6B62\u5728\u89C4\u5219\u91CC\u5199\u9B54\u6CD5\u6570\u5B57\uFF1B
 *   - \u4E09\u6863\u5C42\u7EA7\uFF1Abase\uFF08\u9762\u677F\u5E95\uFF09\u2192 layer-2\uFF08\u680F / \u5361\u7247\u5E95\uFF09\u2192 layer-3\uFF08\u884C / \u8F93\u5165\u5E95\uFF09\uFF1B
 *   - \u4EA4\u4E92\u5143\u7D20\u5FC5\u987B\u6709 hover / active / :focus-visible / :disabled \u56DB\u6001\uFF1B
 *   - \u72B6\u6001\u8272\u53EA\u7528\u5728\u5FBD\u7AE0\u4E0E\u8FDB\u5EA6\u6761\u4E0A\uFF0C\u6B63\u6587\u4FDD\u6301\u4E2D\u6027\uFF0C\u907F\u514D\u5F69\u8272\u566A\u97F3\u3002
 *
 * \u7531 scripts/build-client.mjs \u4EE5 text loader \u5185\u8054\u8FDB client.js\u3002
 */

/* ============================ \u8BBE\u8BA1\u4EE4\u724C ============================ */

/*
 * \u4EE4\u724C\u58F0\u660E\u5728 :where(html, body) \u4E0A\u2014\u2014\u4E0D\u80FD\u53EA\u653E :root\uFF1ADSH \u7684\u660E\u6697\u4E3B\u9898\u6302\u5728
 * body[data-ds-dark-theme] \u4E0A\u8986\u76D6 --dsw-*\uFF0C\u800C var() \u5728\u300C\u58F0\u660E\u5B83\u7684\u5143\u7D20\u300D\u4E0A\u5C31
 * \u5B8C\u6210\u66FF\u6362\uFF1B\u53EA\u5728 :root \u58F0\u660E\u4F1A\u6C38\u8FDC\u62FF\u5230\u6D45\u8272\u503C\u3002
 */
:where(html, body) {
  --dk-r-xs: 4px;
  --dk-r-sm: 6px;
  --dk-r-md: 8px;
  --dk-r-lg: 10px;
  --dk-r-xl: 12px;
  --dk-r-pill: 999px;
  --dk-h-sm: 24px;
  --dk-h-md: 28px;
  --dk-h-lg: 32px;
  --dk-gap-xs: 4px;
  --dk-gap-sm: 6px;
  --dk-gap-md: 8px;
  --dk-gap-lg: 12px;
  --dk-gap-xl: 16px;
  /* \u8BBE\u7F6E\u5361\u7247\u6807\u9898\u884C\u5185\u8FB9\u8DDD\uFF1A\u5BF9\u9F50 DSH \u5185\u7F6E\u5361\u7247 / \u5176\u4ED6\u63D2\u4EF6\u5361\u7247\uFF08pM_pluginCard\u3001tt_card\uFF09 */
  --dk-pad-cardHead: 14px 16px;
  --dk-mono: "SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --dk-ease: cubic-bezier(.2, .8, .2, 1);
  --dk-dur: .16s;
  --dk-accent: var(--dsw-alias-state-business-primary, #4d6bfe);
  --dk-danger: var(--dsw-alias-state-error-primary, #d1242f);
  --dk-success: var(--dsw-alias-state-success-primary, #1a7f37);
  --dk-warn: var(--dsw-alias-state-warn-primary, #bf8700);
  --dk-border: var(--dsw-alias-border-l1, rgba(127, 127, 127, .22));
  --dk-border-strong: var(--dsw-alias-border-l2, rgba(127, 127, 127, .32));
  --dk-hover: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .1));
  --dk-hover-solid: var(--dsw-alias-interactive-bg-hover-solid, rgba(127, 127, 127, .16));
  --dk-label: var(--dsw-alias-label-primary, #1a1a1a);
  --dk-label-2: var(--dsw-alias-label-secondary, #555);
  --dk-label-dimmed: var(--dsw-alias-label-dimmed, var(--dk-label-3));
  --dk-label-3: var(--dsw-alias-label-tertiary, #888);
  --dk-surface: var(--dsw-alias-bg-base, #fff);
  --dk-surface-solid: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base, #fff));
  --dk-surface-2: var(--dsw-alias-bg-layer-2, #f2f2f2);
  --dk-surface-3: var(--dsw-alias-bg-layer-3, #e8e8e8);
  --dk-input: var(--dsw-specific-input-major, var(--dsw-alias-bg-base, #fff));
  --dk-shadow: 0 16px 40px -12px rgba(0, 0, 0, .32), var(--dsw-shadow-lv3, 0 4px 12px rgba(0, 0, 0, .12));
  --dk-shadow-lg: 0 32px 72px -24px rgba(0, 0, 0, .48), 0 2px 8px rgba(0, 0, 0, .16);
  --dk-ring: 0 0 0 2px color-mix(in srgb, var(--dk-accent) 42%, transparent);
  --dk-log-bg: #0b0e14;
  --dk-log-fg: #d7dce5;
}

/* ============================ \u901A\u7528 ============================ */

.dk_backdrop ::selection,
.dk_card ::selection {
  background: color-mix(in srgb, var(--dk-accent) 32%, transparent);
}

.dk_backdrop *,
.dk_card *,
[data-dsh-docker-entry] {
  scrollbar-width: thin;
  scrollbar-color: var(--dk-border-strong) transparent;
}

.dk_backdrop *::-webkit-scrollbar,
.dk_card *::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.dk_backdrop *::-webkit-scrollbar-thumb,
.dk_card *::-webkit-scrollbar-thumb {
  background: var(--dk-border-strong);
  border: 3px solid transparent;
  border-radius: var(--dk-r-pill);
  background-clip: content-box;
}

/* ============================ \u4FA7\u8FB9\u680F\u5165\u53E3 ============================ */

[data-dsh-docker-entry] {
  position: relative;
  /* \u4E0E tty \u4FA7\u8FB9\u680F\u5165\u53E3\u540C\u56E0\uFF1A\u5BBF\u4E3B\u65E0\u5168\u5C40 box-sizing reset\uFF0Cwidth:100% + \u5DE6\u53F3 padding
     \u5728 content-box \u4E0B\u4F1A\u6BD4\u5BB9\u5668\u5BBD 24px\uFF0C\u591A\u51FA\u7684\u53F3\u4FA7\u4F1A\u88AB\u4FA7\u8FB9\u680F\u88C1\u6389\uFF08hover \u5E95\u8272\u7F3A\u4E00\u89D2\uFF09\u3002 */
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  width: 100%;
  min-width: 0;
  height: var(--dk-h-lg);
  padding: 0 var(--dk-gap-lg);
  border-radius: var(--dk-r-md);
  color: var(--dk-label-2);
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition: background var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease);
}

[data-dsh-docker-entry]:hover {
  background: var(--dk-hover);
  color: var(--dk-label);
}

[data-dsh-docker-entry]:focus-visible {
  outline: none;
  box-shadow: var(--dk-ring);
}

.dk_entryIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: currentColor;
}

.dk_entryLabel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* \u4FA7\u8FB9\u680F\u6298\u53E0\uFF08DSH \u5916\u58F3\u5728\u7956\u5148\u5143\u7D20\u4E0A\u6253 data-sidebar-collapsed\uFF09\uFF1A\u53EA\u7559\u56FE\u6807\uFF0C
   \u4E0E tty \u7684\u7EC8\u7AEF\u5165\u53E3\u540C\u5F62\u2014\u2014\u5426\u5219\u6807\u7B7E\u4F1A\u4ECE\u7A84\u680F\u91CC\u6EA2\u51FA\u4E00\u6761\u7AD6\u6761 */
[data-sidebar-collapsed] [data-dsh-docker-entry] {
  justify-content: center;
  width: 100%;
  /* \u6298\u53E0 rail \u91CC\u5BBF\u4E3B\u7684\u884C\u662F 36\xD736\uFF0C\u8DDF\u9F50\uFF08\u4E0E tty \u5165\u53E3\u4E00\u81F4\uFF09 */
  height: 36px;
  padding: 0;
  margin: 0;
}

[data-sidebar-collapsed] .dk_entryLabel {
  display: none;
}

[data-sidebar-collapsed] .dk_entryBadge {
  margin-left: 0;
  padding-left: 0;
}

.dk_entryBadge {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--dk-gap-xs);
  font-size: 11px;
  color: var(--dk-label-3);
  font-variant-numeric: tabular-nums;
}

.dk_entryDot {
  width: 6px;
  height: 6px;
  border-radius: var(--dk-r-pill);
  background: var(--dk-label-3);
}

.dk_entryDot[data-state="ok"] { background: var(--dk-success); }
.dk_entryDot[data-state="error"] { background: var(--dk-danger); }
.dk_entryDot[data-state="loading"] { background: var(--dk-warn); }

/* ============================ \u5F39\u7A97\u9AA8\u67B6 ============================ */

.dk_backdrop {
  position: fixed;
  inset: 0;
  z-index: 2140;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(8px, 3vh, 32px);
  background: color-mix(in srgb, #000 42%, transparent);
  backdrop-filter: blur(2px);
  animation: dk_fade var(--dk-dur) var(--dk-ease);
}

@keyframes dk_fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.dk_panel {
  display: flex;
  flex-direction: column;
  width: min(1180px, 100%);
  height: min(820px, 100%);
  min-height: 420px;
  overflow: hidden;
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-xl);
  background: var(--dk-surface-solid);
  color: var(--dk-label);
  box-shadow: var(--dk-shadow-lg);
  font-size: 13px;
  line-height: 1.5;
}

/*
 * dock \u6A21\u5F0F\uFF080.3.0\uFF09\uFF1A\u9762\u677F\u957F\u5728 tty \u9762\u677F\u7684\u53F3\u4FA7\u6302\u8F7D\u4F4D\u91CC\uFF0C\u6491\u6EE1\u5BBF\u4E3B\u5373\u53EF\u2014\u2014
 * \u5916\u6846 / \u5706\u89D2 / \u9634\u5F71 / \u6700\u5C0F\u9AD8\u5EA6\u90FD\u662F\u300C\u72EC\u7ACB\u5F39\u7A97\u300D\u7684\u88C5\u9970\uFF0C\u6302\u5728\u522B\u4EBA\u680F\u91CC\u8981\u5168\u53BB\u6389\u3002
 */
.dk_panelDock {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

/* ---- \u4EA4\u4E92\u5F0F\u7EC8\u7AEF\u62BD\u5C49\uFF08ttyTerminal.mount \u5C31\u5730\u5D4C\u5165\uFF0C0.15.0\uFF09 ---- */
.dk_drawer {
  position: relative; /* \u9876\u90E8\u62D6\u62FD\u6761\u7684\u5B9A\u4F4D\u57FA\u51C6 */
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  height: min(46%, 380px);
  min-height: 180px;
  border-top: 1px solid var(--dk-border-strong);
  background: var(--dk-surface-2);
  animation: dk_drawerIn var(--dk-dur) var(--dk-ease);
}

/* \u62D6\u62FD\u6761\uFF1A\u8D34\u7740\u62BD\u5C49\u4E0A\u6CBF\uFF0C\u9F20\u6807\u8FDB\u5165\u624D\u663E\u5F62\uFF08\u5E38\u6001\u4E0D\u6253\u6270\u7EC8\u7AEF\u5185\u5BB9\uFF09 */
.dk_drawerResize {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  height: 5px;
  cursor: ns-resize;
}

.dk_drawerResize:hover { background: color-mix(in srgb, var(--dk-accent) 55%, transparent); }

/*
 * \u6298\u53E0\uFF1A\u53EA\u628A\u62BD\u5C49\u538B\u5230\u6807\u9898\u680F\u9AD8\u5EA6\uFF08\u6B63\u6587\u9690\u85CF\uFF09\uFF0C**\u4E0D\u5378\u8F7D**\u6302\u8F7D\u70B9\u2014\u2014tty \u90A3\u8FB9\u7684
 * xterm \u4E0E PTY \u4F1A\u8BDD\u7167\u65E7\u8DD1\u7740\uFF0C\u5C55\u5F00\u5373\u539F\u6837\u56DE\u6765\u3002
 */
.dk_drawer[data-collapsed="1"] {
  height: auto; /* \u53EA\u5269\u6807\u9898\u680F\uFF08\u6B63\u6587 display:none\uFF09\uFF0C\u522B\u5199\u6B7B\u9AD8\u5EA6\uFF1Aheader \u662F\u5185\u5BB9\u76D2 + \u5185\u8FB9\u8DDD */
  min-height: 0;
}

.dk_drawer[data-collapsed="1"] .dk_drawerResize,
.dk_drawer[data-collapsed="1"] .dk_drawerBody { display: none; }

.dk_drawerFold .dk_iconGlyph { transition: transform var(--dk-dur) var(--dk-ease); }
.dk_drawer[data-collapsed="1"] .dk_drawerFold .dk_iconGlyph { transform: rotate(180deg); }

@keyframes dk_drawerIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

.dk_drawerHead {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  flex: 0 0 auto;
  min-height: 34px;
  padding: var(--dk-gap-xs) var(--dk-gap-lg);
  border-bottom: 1px solid var(--dk-border);
}

.dk_drawerIcon {
  display: inline-flex;
  flex: none;
  color: var(--dk-accent);
}

.dk_drawerTitle {
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dk_drawerHint {
  flex: none;
  color: var(--dk-label-3);
  font-size: 11px;
  white-space: nowrap;
}

/* \u6302\u8F7D\u70B9\uFF1Atty \u4F1A\u5F80\u91CC\u585E\u4E00\u4E2A\u7EDD\u5BF9\u5B9A\u4F4D\u7684 .tt_term\uFF08\u590D\u7528\u7EC8\u7AEF\u9762\u677F\u540C\u4E00\u5957\u6837\u5F0F\uFF09 */
.dk_drawerBody {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  background: var(--dk-log-bg);
}

.dk_header {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  flex: 0 0 auto;
  flex-wrap: wrap;
  min-height: 44px;
  padding: var(--dk-gap-sm) var(--dk-gap-lg);
  border-bottom: 1px solid var(--dk-border);
  background: var(--dk-surface-2);
}

/* \u8BE6\u60C5\u5934\uFF1A\u8FD4\u56DE + \u5BB9\u5668\u540D + \u72B6\u6001 + \u76EE\u6807\u4E3B\u673A +\uFF08\u65E5\u5FD7\u9875\u5DE5\u5177\u6761\uFF09+ \u5173\u95ED */
.dk_headerDetail { gap: var(--dk-gap-sm); }

.dk_logTools {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  flex-wrap: wrap;
}

.dk_titleIcon {
  display: inline-flex;
  align-items: center;
  color: var(--dk-accent);
}

.dk_title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .2px;
}

.dk_headerSpacer { flex: 1 1 auto; }

.dk_iconBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dk-h-md);
  height: var(--dk-h-md);
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--dk-r-sm);
  background: transparent;
  color: var(--dk-label-2);
  cursor: pointer;
  transition: background var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease), opacity var(--dk-dur) var(--dk-ease);
}

.dk_iconBtn:hover { background: var(--dk-hover); color: var(--dk-label); }
.dk_iconBtn:focus-visible { outline: none; box-shadow: var(--dk-ring); }
.dk_iconBtn:disabled { opacity: .45; cursor: not-allowed; }

/*
 * \u5237\u65B0\u4E2D\u7684\u56FE\u6807\u81EA\u5DF1\u8F6C\uFF08data-spin \u7531\u5404\u5904\u7684 refresh \u6309\u94AE\u6309 loading \u6253\uFF09\uFF1A
 * \u6BD4\u5728\u6309\u94AE\u65C1\u8FB9\u53E6\u6302\u4E00\u4E2A\u72EC\u7ACB spinner \u76F4\u89C2\u2014\u2014\u7528\u6237\u521A\u70B9\u7684\u5C31\u662F\u8FD9\u9897\u3002
 */
.dk_iconBtn[data-spin="1"] { color: var(--dk-accent); }
.dk_iconBtn[data-spin="1"] > span { animation: dk_spin .8s linear infinite; }

/* ============================ \u5DE5\u5177\u680F ============================ */

.dk_toolbar {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  flex: 0 0 auto;
  flex-wrap: wrap;
  padding: var(--dk-gap-md) var(--dk-gap-lg);
  border-bottom: 1px solid var(--dk-border);
}

/*
 * dock \u6A21\u5F0F\u4E0B\u6CA1\u6709\u9762\u677F\u5934\u90E8\uFF0C\u5237\u65B0 / \u53EA\u8BFB\u5FBD\u6807\u6302\u5230\u5DE5\u5177\u6761\u672B\u5C3E\u5E76\u9760\u53F3\uFF1A
 * margin-left:auto \u5728\u4E0D\u6362\u884C\u65F6\u628A\u5B83\u63A8\u5230\u6574\u884C\u6700\u53F3\uFF0C\u6362\u884C\u65F6\u8D34\u5230\u6700\u540E\u4E00\u884C\u7684\u53F3\u7AEF\u2014\u2014
 * \u4E0E\u300C\u8FC7\u6EE4 / \u7B5B\u9009\u63A7\u4EF6\u4ECE\u5DE6\u5F80\u53F3\u6392\u300D\u533A\u5206\u5F00\uFF0C\u907F\u514D\u5237\u65B0\u88AB\u5F53\u6210\u5DE5\u5177\u6761\u7684\u7B2C\u4E00\u4E2A\u7B5B\u9009\u9879\u3002
 */
.dk_toolbarEnd {
  display: inline-flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  margin-left: auto;
}

.dk_select,
.dk_input {
  height: var(--dk-h-lg);
  padding: 0 var(--dk-gap-md);
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-sm);
  background: var(--dk-input);
  color: var(--dk-label);
  font-size: 13px;
  font-family: inherit;
  transition: border-color var(--dk-dur) var(--dk-ease), box-shadow var(--dk-dur) var(--dk-ease);
}

/*
 * \u8F93\u5165\u6846\u4E00\u5F8B\u53EF\u6536\u7F29\uFF1A\u4EE5\u524D\u8FD9\u91CC\u662F min-width: 180px\uFF0C\u9047\u5230\u7A84\u5BB9\u5668\uFF08\u8BBE\u7F6E\u9762\u677F ~600px \u65F6
 * \u6BCF\u5217\u53EA\u6709 ~180px\uFF09\u4F1A\u628A\u5217\u6491\u7834\u3001\u548C\u9694\u58C1\u5B57\u6BB5\u53E0\u5728\u4E00\u8D77\u3002\u5BBD\u5EA6\u4EA4\u7ED9\u5BB9\u5668\u7684\u6805\u683C/\u5F39\u6027\u5E03\u5C40\u51B3\u5B9A\u3002
 */
.dk_input { min-width: 0; }
.dk_select:focus-visible,
.dk_input:focus-visible {
  outline: none;
  border-color: var(--dk-accent);
  box-shadow: var(--dk-ring);
}

.dk_search { flex: 1 1 200px; min-width: 160px; }

/* \u5DE5\u5177\u6761\u91CC\u7684\u7ED3\u679C\u8BA1\u6570\uFF08\u955C\u50CF\uFF1A23 / 23 \u4E2A\u955C\u50CF\uFF09\uFF1A\u522B\u88AB\u538B\u7F29\uFF0C\u6570\u5B57\u7B49\u5BBD */
.dk_searchCount { flex: none; font-variant-numeric: tabular-nums; }

.dk_seg {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-2);
  /*
   * \u5206\u6BB5\u4ECE\u4E09\u6BB5\u957F\u5230\u4E94\u6BB5\uFF08\u5BB9\u5668/\u955C\u50CF/Compose/\u7F51\u7EDC/\u5377\uFF09\u540E\uFF0C520px \u7684 dock \u7A84\u680F\u91CC\u53EF\u80FD\u653E\u4E0D\u4E0B\uFF1A
   * \u5141\u8BB8\u8FD9\u4E00\u6BB5\u81EA\u5DF1\u6A2A\u5411\u6EDA\u52A8\uFF0C\u800C\u4E0D\u662F\u6574\u4E2A\u5DE5\u5177\u6761\u6362\u884C\u6216\u505A\u4E8C\u7EA7\u83DC\u5355\uFF08\u5207\u9875\u662F\u9AD8\u9891\u52A8\u4F5C\uFF0C
   * \u591A\u4E00\u6B21\u70B9\u51FB\u4E0D\u5212\u7B97\uFF09\u3002\u6EDA\u52A8\u6761\u9690\u85CF\uFF0C\u9760\u4E24\u7AEF\u7684\u88C1\u5207\u7ED9\u51FA\u300C\u8FD8\u6709\u5185\u5BB9\u300D\u7684\u6697\u793A\u3002
   */
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

.dk_seg::-webkit-scrollbar { display: none; }

.dk_segBtn {
  /* \u4E0D\u53C2\u4E0E\u538B\u7F29\uFF1A\u5426\u5219\u7A84\u680F\u91CC\u4E94\u6BB5\u4F1A\u88AB\u538B\u6210\u300C\u5BB9/\u955C/Co/\u7F51/\u5377\u300D\u8FD9\u79CD\u534A\u622A\u5B57 */
  flex: none;
  height: var(--dk-h-sm);
  padding: 0 var(--dk-gap-md);
  border: none;
  border-radius: var(--dk-r-xs);
  background: transparent;
  color: var(--dk-label-2);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease);
}

.dk_segBtn:hover { color: var(--dk-label); }
.dk_segBtn[data-on="1"] {
  background: var(--dk-surface-solid);
  color: var(--dk-label);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .12);
}

.dk_check {
  display: inline-flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  font-size: 12px;
  color: var(--dk-label-2);
  cursor: pointer;
  user-select: none;
}

.dk_check input { accent-color: var(--dk-accent); }

/* ============================ \u6309\u94AE ============================ */

.dk_btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--dk-gap-sm);
  height: var(--dk-h-md);
  padding: 0 var(--dk-gap-lg);
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-sm);
  background: var(--dk-surface-solid);
  color: var(--dk-label);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--dk-dur) var(--dk-ease), border-color var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease);
}

.dk_btn:hover { background: var(--dk-hover); }
.dk_btn:active { background: var(--dk-hover-solid); }
.dk_btn:focus-visible { outline: none; box-shadow: var(--dk-ring); }
.dk_btn:disabled { opacity: .45; cursor: not-allowed; }

.dk_btnPrimary {
  border-color: transparent;
  background: var(--dk-accent);
  color: #fff;
}

.dk_btnPrimary:hover { background: color-mix(in srgb, var(--dk-accent) 86%, #000); }

.dk_btnDanger { border-color: color-mix(in srgb, var(--dk-danger) 40%, transparent); color: var(--dk-danger); }
.dk_btnDanger:hover { background: color-mix(in srgb, var(--dk-danger) 12%, transparent); }

/* ============================ \u4E3B\u4F53 / \u5BB9\u5668\u5361\u7247 ============================ */

.dk_body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.dk_main {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: var(--dk-gap-lg);
}

.dk_grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--dk-gap-lg);
}

.dk_card {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-sm);
  padding: var(--dk-gap-lg);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-lg);
  background: var(--dk-surface-solid);
  cursor: pointer;
  transition: border-color var(--dk-dur) var(--dk-ease), box-shadow var(--dk-dur) var(--dk-ease), transform var(--dk-dur) var(--dk-ease);
}

.dk_card:hover {
  border-color: var(--dk-border-strong);
  box-shadow: var(--dk-shadow);
}

.dk_card:focus-visible { outline: none; box-shadow: var(--dk-ring); }

.dk_card[data-selected="1"] {
  border-color: var(--dk-accent);
  box-shadow: var(--dk-ring);
}

.dk_cardHead {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  min-width: 0;
}

.dk_cardName {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dk_cardRows {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-xs);
  margin-top: var(--dk-gap-xs);
}

.dk_cardRow {
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: var(--dk-gap-md);
  align-items: baseline;
  font-size: 12px;
}

.dk_cardLabel {
  color: var(--dk-label-3);
}

.dk_cardValue {
  min-width: 0;
  color: var(--dk-label-2);
  font-family: var(--dk-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dk_actionBar {
  display: flex;
  gap: var(--dk-gap-xs);
  margin-top: var(--dk-gap-sm);
  padding-top: var(--dk-gap-sm);
  border-top: 1px solid var(--dk-border);
}

.dk_actionBar .dk_iconBtn {
  border: 1px solid var(--dk-border);
  background: var(--dk-surface-2);
}

.dk_actionBar .dk_iconBtn:hover:not(:disabled) {
  background: var(--dk-hover-solid);
  color: var(--dk-label);
}

/* \u300C\u67E5\u770B\u300D\u4E0E\u300C\u53D8\u66F4\u300D\u4E24\u7EC4\u4E4B\u95F4\u7684\u7AD6\u7EBF\u5206\u9694 */
.dk_actionBarSep {
  flex: none;
  width: 1px;
  margin: 4px var(--dk-gap-sm);
  background: var(--dk-border-strong);
}

/* \u5220\u9664\u662F\u7834\u574F\u6027\u4E14\u4E0D\u53EF\u6062\u590D\uFF1A\u5728\u53D8\u66F4\u7EC4\u5185\u518D\u989D\u5916\u7559\u4E00\u70B9\u8DDD\u79BB\uFF0C\u522B\u548C\u300C\u91CD\u542F\u300D\u6328\u7740\u70B9\u9519 */
.dk_actionBar .dk_iconBtnDanger {
  margin-left: var(--dk-gap-xs);
}

.dk_iconBtnDanger { color: var(--dk-danger); }
.dk_iconBtnDanger:hover:not(:disabled) { background: color-mix(in srgb, var(--dk-danger) 14%, transparent); }

.dk_iconGlyph { display: inline-flex; align-items: center; }

/* ============================ \u5FBD\u7AE0 ============================ */

.dk_badge {
  display: inline-flex;
  align-items: center;
  gap: var(--dk-gap-xs);
  height: 20px;
  padding: 0 var(--dk-gap-sm);
  border-radius: var(--dk-r-pill);
  border: 1px solid var(--dk-border-strong);
  background: var(--dk-surface-2);
  color: var(--dk-label-2);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  /* \u542F\u505C\u540E\u72B6\u6001\u5FBD\u6807\u4F1A\u4ECE\u300C\u8FD0\u884C\u4E2D\u300D\u7FFB\u5230\u300C\u5DF2\u505C\u6B62\u300D\uFF1A\u7ED9\u4E2A\u8FC7\u6E21\uFF0C\u522B\u786C\u5207 */
  transition: background-color var(--dk-dur) var(--dk-ease), border-color var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease);
}

.dk_badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: var(--dk-r-pill);
  background: currentColor;
  opacity: .8;
}

.dk_badge[data-state="running"] { color: var(--dk-success); border-color: color-mix(in srgb, var(--dk-success) 36%, transparent); background: color-mix(in srgb, var(--dk-success) 10%, transparent); }
.dk_badge[data-state="exited"] { color: var(--dk-label-3); }
.dk_badge[data-state="paused"] { color: var(--dk-warn); border-color: color-mix(in srgb, var(--dk-warn) 36%, transparent); background: color-mix(in srgb, var(--dk-warn) 10%, transparent); }
.dk_badge[data-state="restarting"] { color: var(--dk-warn); }
.dk_badge[data-state="dead"] { color: var(--dk-danger); border-color: color-mix(in srgb, var(--dk-danger) 36%, transparent); background: color-mix(in srgb, var(--dk-danger) 10%, transparent); }
.dk_badge[data-state="unhealthy"] { color: var(--dk-danger); }
.dk_badge[data-state="created"] { color: var(--dk-label-2); }
.dk_badge[data-state="unknown"] { color: var(--dk-label-3); }

.dk_tag {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 var(--dk-gap-sm);
  border-radius: var(--dk-r-xs);
  background: var(--dk-surface-3);
  color: var(--dk-label-2);
  font-size: 11px;
}

/* ============================ \u5BB9\u5668\u8BE6\u60C5\uFF08\u6574\u680F\uFF09 ============================ */

.dk_detail {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}


.dk_detailTitle {
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dk_detailSub {
  flex: none;
  color: var(--dk-label-3);
  font-size: 11px;
  font-family: var(--dk-mono);
}

.dk_tabs {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-xs);
  flex: 0 0 auto;
  padding: 0 var(--dk-gap-lg);
  border-bottom: 1px solid var(--dk-border);
}

.dk_filterBar {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  flex: 1 1 auto;
  min-width: 0;
  /* \u53F3\u4FA7\u7ED9\u8BA1\u6570\u7559\u56FA\u5B9A\u69FD\uFF0892px \u2248 4 \u4F4D\u6570 + \u300C\u884C\u5339\u914D\u300D\uFF09\uFF0C\u8F93\u5165\u6846\u5BBD\u5EA6\u56E0\u6B64\u6052\u5B9A */
  padding: var(--dk-gap-xs) 92px var(--dk-gap-xs) 0;
}

.dk_tab {
  height: var(--dk-h-lg);
  padding: 0 var(--dk-gap-md);
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--dk-label-2);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.dk_tab:hover { color: var(--dk-label); }
.dk_tab[data-on="1"] { color: var(--dk-label); border-bottom-color: var(--dk-accent); }

.dk_detailBody {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: var(--dk-gap-lg);
}

/* ============================ \u65E5\u5FD7\u89C6\u56FE ============================ */

.dk_logs {
  position: relative; /* \u300C\u56DE\u5230\u5E95\u90E8\u300D\u6D6E\u5C42\u5B9A\u4F4D\u57FA\u51C6 */
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  margin: calc(-1 * var(--dk-gap-lg));
}


.dk_toolLabel {
  color: var(--dk-label-3);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .4px;
}

.dk_selectSm { height: var(--dk-h-md); padding: 0 var(--dk-gap-sm); font-size: 12px; }

.dk_pill {
  min-width: 44px;
  height: var(--dk-h-md);
  padding: 0 var(--dk-gap-md);
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-pill);
  background: var(--dk-surface-2);
  color: var(--dk-label-3);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease), border-color var(--dk-dur) var(--dk-ease);
}

.dk_pill:hover { background: var(--dk-hover); }
.dk_pill:focus-visible { outline: none; box-shadow: var(--dk-ring); }

.dk_pill[data-on="1"] {
  border-color: color-mix(in srgb, var(--dk-success) 46%, transparent);
  background: color-mix(in srgb, var(--dk-success) 16%, transparent);
  color: var(--dk-success);
  font-weight: 600;
}

/* \u300C\u805A\u5408\u9009\u62E9\u300D\u6FC0\u6D3B\u6001\uFF1A\u8FD9\u662F\u300C\u8FDB\u5165\u9009\u62E9\u6A21\u5F0F\u300D\u800C\u4E0D\u662F\u300C\u67D0\u4E2A\u5F00\u5173\u5DF2\u5F00\u300D\uFF0C\u7528\u5F3A\u8C03\u8272 */
.dk_pillPick[data-on="1"] {
  border-color: color-mix(in srgb, var(--dk-accent) 52%, transparent);
  background: color-mix(in srgb, var(--dk-accent) 18%, transparent);
  color: var(--dk-accent);
  font-weight: 600;
}

/* FOLLOW \u6FC0\u6D3B\u6001\u7528\u5F3A\u8C03\u8272\uFF08\u4E0E AUTO REFRESH \u7684\u6210\u529F\u7EFF\u533A\u5206\u5F00\uFF1A\u5B9E\u65F6\u6D41\u5728\u63A8 vs \u8F6E\u8BE2\u5F00\u7740\uFF09 */
.dk_pillFollow[data-on="1"] {
  border-color: color-mix(in srgb, var(--dk-accent) 52%, transparent);
  background: color-mix(in srgb, var(--dk-accent) 18%, transparent);
  color: var(--dk-accent);
}

.dk_pill:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.dk_pill:disabled:hover { background: var(--dk-surface-2); }

/* FOLLOW \u8FDE\u63A5\u72B6\u6001\u884C\uFF1A\u5C0F\u5706\u70B9 + \u6587\u6848\uFF08\u8FDE\u63A5\u9519\u8BEF\u53EA\u5728\u8FD9\u91CC\u8868\u8FBE\uFF0C\u4E0D\u5F39\u6A2A\u5E45\u5237\u5C4F\uFF09 */
.dk_followState {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  flex: 0 0 auto;
  padding: var(--dk-gap-xs) var(--dk-gap-lg);
  border-bottom: 1px solid var(--dk-border);
  background: var(--dk-surface-2);
  color: var(--dk-label-3);
  font-size: 11px;
}

.dk_followState::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dk-label-3);
}

.dk_followState[data-state="open"]::before { background: var(--dk-success); }
.dk_followState[data-state="connecting"]::before,
.dk_followState[data-state="reconnecting"]::before { background: var(--dk-warn); }
.dk_followState[data-state="closed"]::before { background: var(--dk-danger); }

/* FOLLOW \u6682\u505C\u81EA\u52A8\u6EDA\u52A8\u65F6\u7684\u300C\u56DE\u5230\u5E95\u90E8\u300D\u6D6E\u5C42\uFF08\u4E0D\u5360\u5E03\u5C40\uFF0C\u51FA\u73B0/\u6D88\u5931\u4E0D\u6324\u52A8\u65E5\u5FD7\uFF09 */
.dk_backToBottom {
  position: absolute;
  right: var(--dk-gap-lg);
  bottom: var(--dk-gap-lg);
  z-index: 2;
  height: var(--dk-h-md);
  padding: 0 var(--dk-gap-md);
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-pill);
  background: var(--dk-surface-2);
  color: var(--dk-label);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0, 0, 0, .28);
}

.dk_backToBottom:hover { background: var(--dk-hover-solid); }
.dk_backToBottom:focus-visible { outline: none; box-shadow: var(--dk-ring); }


/* \u8FC7\u6EE4\u8F93\u5165\u6846\u5E38\u9A7B\uFF1B\u6E05\u7A7A\u6309\u94AE\u6D6E\u5728\u6846\u5185\u53F3\u4FA7\uFF08\u7EDD\u5BF9\u5B9A\u4F4D \u2192 \u51FA\u73B0/\u6D88\u5931\u90FD\u4E0D\u6324\u52A8\u5E03\u5C40\uFF09 */
.dk_filterWrap {
  position: relative;
  display: flex;
  flex: 1 1 200px;
  min-width: 0;
}

.dk_filterInput {
  flex: 1 1 auto;
  height: var(--dk-h-md);
  min-width: 0;
  /* \u5E38\u9A7B\u53F3\u4FA7\u5185\u8FB9\u8DDD\u7ED9\u6E05\u9664\u6309\u94AE\u7559\u4F4D\uFF1A\u5185\u8FB9\u8DDD\u8DDF\u7740\u5185\u5BB9\u53D8\u4F1A\u6539 flex \u57FA\u51C6\uFF0C\u53CD\u800C\u6324\u52A8\u8F93\u5165\u6846 */
  padding-right: 28px;
}

.dk_filterClear {
  position: absolute;
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: var(--dk-r-sm);
  background: transparent;
  color: var(--dk-label-3);
  cursor: pointer;
}

.dk_filterClear:hover { background: var(--dk-hover); color: var(--dk-label); }
.dk_filterClear:focus-visible { outline: none; box-shadow: var(--dk-ring); }
/* \u8BA1\u6570\uFF08\u300C201 \u884C\u300D/\u300C1 / 201 \u884C\u5339\u914D\u300D\uFF09\u53F3\u5BF9\u9F50\u5728\u56FA\u5B9A\u69FD\u91CC\uFF1A\u6587\u6848\u53D8\u957F\u4E5F\u4E0D\u4F1A\u628A\u8F93\u5165\u6846\u6324\u52A8 */
.dk_filterCount {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  white-space: nowrap;
  color: var(--dk-label-3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.dk_logBody {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: var(--dk-gap-md) var(--dk-gap-lg);
  background: var(--dk-log-bg);
  color: var(--dk-log-fg);
  font-family: var(--dk-mono);
  font-size: 12px;
  line-height: 1.6;
}

.dk_logLine {
  white-space: pre-wrap;
  word-break: break-word;
}

.dk_logLine mark {
  background: color-mix(in srgb, var(--dk-warn) 62%, transparent);
  color: inherit;
  border-radius: 2px;
}

.dk_logLevel {
  margin-right: var(--dk-gap-sm);
  font-weight: 600;
}

.dk_logLevel[data-level="TRACE"] { color: #8a93a5; }
.dk_logLevel[data-level="DEBUG"] { color: #8a93a5; }
.dk_logLevel[data-level="INFO"] { color: #6ea8fe; }
.dk_logLevel[data-level="WARN"] { color: #e0a94a; }
.dk_logLevel[data-level="ERROR"] { color: #ff6b6b; }
.dk_logLevel[data-level="FATAL"] { color: #ff6b6b; font-weight: 700; }

.dk_logTs { margin-right: var(--dk-gap-sm); color: #7f8899; }
.dk_logText { color: inherit; }
.dk_logMore { color: #7f8899; font-style: italic; }

/* \u952E\u503C\u884C */
.dk_kv {
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: var(--dk-gap-xs) var(--dk-gap-md);
  font-size: 12px;
}

.dk_kvKey { color: var(--dk-label-3); }
.dk_kvVal { color: var(--dk-label); word-break: break-all; }
.dk_kvValMono { font-family: var(--dk-mono); }

/* \u65E5\u5FD7 */
.dk_logBar {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  flex-wrap: wrap;
  margin-bottom: var(--dk-gap-sm);
}

.dk_logBar .dk_input { height: var(--dk-h-md); min-width: 0; }

.dk_logBox {
  margin: 0;
  padding: var(--dk-gap-md);
  border-radius: var(--dk-r-md);
  background: var(--dk-log-bg);
  color: var(--dk-log-fg);
  font-family: var(--dk-mono);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: none;
}

.dk_logBox mark {
  background: color-mix(in srgb, var(--dk-warn) 55%, transparent);
  color: inherit;
  border-radius: 2px;
}

/* \u7EDF\u8BA1 */
.dk_stats {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.dk_stats th,
.dk_stats td {
  padding: var(--dk-gap-sm) var(--dk-gap-md);
  border-bottom: 1px solid var(--dk-border);
  text-align: left;
  white-space: nowrap;
}

.dk_stats th {
  color: var(--dk-label-3);
  font-weight: 500;
}

.dk_stats td.dk_num { font-family: var(--dk-mono); text-align: right; }

.dk_bar {
  position: relative;
  width: 72px;
  height: 6px;
  border-radius: var(--dk-r-pill);
  background: var(--dk-surface-3);
  overflow: hidden;
}

.dk_barFill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: var(--dk-r-pill);
  background: var(--dk-accent);
  transition: width var(--dk-dur) var(--dk-ease);
}

.dk_barFill[data-warn="1"] { background: var(--dk-warn); }
.dk_barFill[data-danger="1"] { background: var(--dk-danger); }

/* ============================ \u955C\u50CF\u8868 ============================ */

.dk_tableWrap { overflow: auto; }

/*
 * \u955C\u50CF\u9875\uFF1A\u641C\u7D22\u6846\u5DF2\u7ECF\u5728\u5DE5\u5177\u6761\uFF08\u56FA\u5B9A\u533A\uFF09\uFF0C\u8FD9\u91CC\u518D\u8BA9\u8868\u4F53\u81EA\u5DF1\u6EDA\u3001\u8868\u5934\u9489\u4F4F\u2014\u2014
 * \u957F\u955C\u50CF\u5217\u8868\u6EDA\u5230\u5E95\u65F6\u5217\u540D\uFF08\u955C\u50CF / \u5927\u5C0F / \u521B\u5EFA / ID\uFF09\u4ECD\u7136\u770B\u5F97\u89C1\u3002
 */
.dk_mainImages {
  display: flex;
  flex-direction: column;
  /* auto \u800C\u4E0D\u662F hidden\uFF1A\u6A2A\u5E45 / \u7A7A\u6001\u5728\u77EE\u9762\u677F\u91CC\u4ECD\u53EF\u6EDA\uFF0C\u4E0D\u4F1A\u88AB\u88C1\u6389 */
  overflow: auto;
}

.dk_imagesView {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.dk_mainImages .dk_tableWrap {
  flex: 1 1 auto;
  min-height: 0;
}

.dk_images thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--dk-surface-solid);
}

.dk_images {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.dk_images th,
.dk_images td {
  padding: var(--dk-gap-sm) var(--dk-gap-md);
  border-bottom: 1px solid var(--dk-border);
  text-align: left;
  white-space: nowrap;
}

.dk_images th { color: var(--dk-label-3); font-weight: 500; }
.dk_images td.dk_mono { font-family: var(--dk-mono); }
.dk_images tbody tr:hover { background: var(--dk-hover); }

/* ============================ \u4E34\u65F6\u591A\u9009\u805A\u5408 ============================ */

/*
 * \u52FE\u9009\u6846\uFF1A\u7EAF CSS \u753B\u65B9\u6846 + \u52FE\uFF08\u7528\u771F\u5B9E <input type="checkbox"> \u4F1A\u5E26\u8FDB\u6D4F\u89C8\u5668\u539F\u751F
 * \u5C3A\u5BF8/\u5BF9\u9F50\u5DEE\u5F02\uFF0C\u8FD8\u8981\u5904\u7406\u53EA\u8BFB\u6001\uFF09\u3002\u672A\u52FE\u9009\u65F6\u628A\u52FE\u7684\u5B57\u8272\u8BBE\u6210\u900F\u660E\uFF0C\u5F62\u72B6\u4ECD\u7136\u5360\u4F4D\uFF0C
 * \u6240\u4EE5\u52FE\u9009/\u53D6\u6D88\u4E0D\u4F1A\u8BA9\u5361\u7247\u5934\u90E8\u6A2A\u5411\u6296\u52A8\u3002
 */
.dk_pick {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-xs);
  background: var(--dk-input);
  color: transparent;
  font-size: 11px;
  line-height: 1;
  transition: background var(--dk-dur) var(--dk-ease), border-color var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease);
}

.dk_pick::after { content: '\u2713'; }
.dk_pick[data-on="1"] { background: var(--dk-accent); border-color: var(--dk-accent); color: #fff; }

/* \u9009\u62E9\u6001\uFF1A\u6574\u5F20\u5361\u7247\u5C31\u662F\u52FE\u9009\u5F00\u5173\uFF0C\u52A8\u4F5C\u6761\u6536\u8D77\uFF08\u5426\u5219\u4E00\u8FB9\u591A\u9009\u4E00\u8FB9\u80FD\u70B9\u5230\u542F\u505C\u5220\uFF09 */
.dk_card[data-pick="1"] .dk_actionBar { display: none; }
.dk_card[data-picked="1"] { border-color: var(--dk-accent); box-shadow: var(--dk-ring); }

/* \u805A\u5408\u64CD\u4F5C\u6761\uFF1A\u5939\u5728\u5DE5\u5177\u6761\u4E0E\u6B63\u6587\u4E4B\u95F4\u7684\u4E00\u6761\u6A2A\u680F\uFF0C\u8BA1\u6570\u9760\u5DE6\u3001\u6309\u94AE\u9760\u53F3 */
.dk_pickBar {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  flex: 0 0 auto;
  flex-wrap: wrap;
  padding: var(--dk-gap-sm) var(--dk-gap-lg);
  border-bottom: 1px solid var(--dk-border);
  background: var(--dk-surface-2);
}

.dk_pickCount {
  font-size: 12px;
  font-weight: 600;
  color: var(--dk-label);
  font-variant-numeric: tabular-nums;
}

/* \u63D0\u793A\u5728\u7A84\u680F\u91CC\u53EF\u4EE5\u6362\u884C\uFF0C\u4F46\u4E0D\u8981\u6491\u7834\u884C */
.dk_pickHint { min-width: 0; }

/* ============================ \u4E8B\u4EF6\u6D3B\u52A8\u6761 ============================ */

/*
 * \u6D3B\u52A8\u6761\uFF1A\u8D34\u5728\u5BB9\u5668\u5217\u8868\u5934\u90E8\u7684\u4E00\u6761\u7A84\u680F\u3002\u9ED8\u8BA4\u5C55\u5F00\u3001\u53EF\u6298\u53E0\u2014\u2014\u6298\u53E0\u53EA\u6536\u8D77\u660E\u7EC6\uFF0C
 * \u4E8B\u4EF6\u6D41\u7167\u5E38\u8DD1\uFF08\u5B83\u4E0D\u662F\u6682\u505C\u5F00\u5173\uFF09\uFF0C\u6240\u4EE5\u6298\u53E0\u6001\u4E5F\u8981\u7559\u7740\u6807\u9898\u4E0E\u72B6\u6001\u70B9\u3002
 */
.dk_activity {
  flex: 0 0 auto;
  margin-bottom: var(--dk-gap-lg);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-2);
  overflow: hidden;
}

.dk_activityHead {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  width: 100%;
  min-width: 0;
  padding: var(--dk-gap-sm) var(--dk-gap-lg);
  border: none;
  background: transparent;
  color: var(--dk-label);
  font-family: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.dk_activityHead:hover { background: var(--dk-hover); }
.dk_activityHead:focus-visible { outline: none; box-shadow: var(--dk-ring); }
.dk_activityTitle { flex: none; font-weight: 600; letter-spacing: .3px; }

/* \u72B6\u6001\u70B9\u6CBF\u7528 .dk_followState \u7684\u8BED\u4E49\u8272\uFF0C\u4F46\u5185\u8054\u5728\u6807\u9898\u884C\u91CC\u3001\u4E0D\u5360\u6574\u884C\u4E5F\u6CA1\u6709\u4E0B\u8FB9\u6846 */
.dk_activityState {
  display: inline-flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  flex: none;
  color: var(--dk-label-3);
  font-size: 11px;
}

.dk_activityState::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dk-label-3);
}

.dk_activityState[data-state="open"]::before { background: var(--dk-success); }
.dk_activityState[data-state="connecting"]::before,
.dk_activityState[data-state="reconnecting"]::before { background: var(--dk-warn); }
.dk_activityState[data-state="closed"]::before,
.dk_activityState[data-state="unsupported"]::before { background: var(--dk-danger); }

.dk_activityChevron {
  flex: none;
  display: inline-flex;
  color: var(--dk-label-3);
  transition: transform var(--dk-dur) var(--dk-ease);
}

.dk_activity[data-open="1"] .dk_activityChevron { transform: rotate(180deg); }

.dk_activityList {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dk-gap-sm);
  padding: 0 var(--dk-gap-lg) var(--dk-gap-md);
}

.dk_activityEmpty {
  padding: 0 var(--dk-gap-lg) var(--dk-gap-md);
  color: var(--dk-label-3);
  font-size: 11px;
}

.dk_activityItem {
  display: inline-flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  max-width: 100%;
  padding: 2px var(--dk-gap-sm);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-xs);
  background: var(--dk-surface-solid);
  font-size: 11px;
}

.dk_activityTime {
  color: var(--dk-label-3);
  font-family: var(--dk-mono);
  font-variant-numeric: tabular-nums;
}

.dk_activityName {
  max-width: 200px;
  color: var(--dk-label);
  font-family: var(--dk-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dk_activityAction { color: var(--dk-label-2); }

/* \u52A8\u4F5C\u7740\u8272\uFF1Astart \u662F\u300C\u8D77\u6765\u4E86\u300D\uFF0Cdie / oom / kill \u662F\u300C\u51FA\u4E8B\u4E86\u300D\uFF0Chealth \u53EA\u9648\u8FF0\u72B6\u6001 */
.dk_activityItem[data-action="start"] .dk_activityAction { color: var(--dk-success); font-weight: 600; }
.dk_activityItem[data-action="die"] .dk_activityAction,
.dk_activityItem[data-action="oom"] .dk_activityAction,
.dk_activityItem[data-action="kill"] .dk_activityAction { color: var(--dk-danger); font-weight: 600; }
.dk_activityItem[data-action="stop"] .dk_activityAction,
.dk_activityItem[data-action="destroy"] .dk_activityAction { color: var(--dk-warn); }
.dk_activityItem[data-action="health_status"] .dk_activityAction { color: var(--dk-label-2); font-style: italic; }

/* ==================== \u53D8\u66F4\u64CD\u4F5C\u7684\u300C\u6267\u884C\u4E2D\u300D\u6001 ==================== */

/*
 * \u542F\u505C\u5220\u5728\u98DE\u7684\u65F6\u5019\uFF08docker stop / rm \u8981\u7B49\u5BB9\u5668\u771F\u7684\u9000\u51FA\uFF0C\u79D2\u7EA7\u5230\u5341\u51E0\u79D2\uFF09\uFF1A
 *   1. \u6B63\u5728\u8DD1\u7684\u90A3\u4E2A\u6309\u94AE\u628A\u56FE\u6807\u6362\u6210\u8F6C\u5708\uFF08\u89C1 IconAction \u7684 busy\uFF09\uFF1B
 *   2. \u540C\u4E00\u5F20\u5361\u7247\u7684\u5176\u5B83\u53D8\u66F4\u6309\u94AE\u7F6E\u7070\u538B\u6697\uFF0C\u76F4\u89C2\u8868\u793A\u300C\u8FD9\u4E00\u7EC4\u5148\u522B\u52A8\u300D\uFF1B
 *   3. \u5361\u7247\u63CF\u8FB9\u8D70\u5F3A\u8C03\u8272\uFF0C\u626B\u5217\u8868\u65F6\u80FD\u770B\u51FA\u54EA\u51E0\u5F20\u6B63\u5728\u5904\u7406\u3002
 * \u7F6E\u7070\u6309\u94AE\u672C\u8EAB\u6709 opacity .45\uFF0Cbusy \u7684\u90A3\u4E2A\u8981\u9876\u6389\u5B83\uFF0C\u5426\u5219\u8F6C\u5708\u4E5F\u8DDF\u7740\u53D8\u6DE1\u3002
 */
.dk_iconBtn[data-busy="1"] { color: var(--dk-accent); }
.dk_iconBtn[data-busy="1"]:disabled { opacity: 1; cursor: progress; }
.dk_card[data-pending="1"] .dk_actionBar .dk_iconBtn:not([data-busy="1"]) { opacity: .4; }
.dk_card[data-pending="1"] { border-color: color-mix(in srgb, var(--dk-accent) 45%, transparent); }

/* \u786E\u8BA4\u6846\u91CC\u7684\u300C\u6267\u884C\u4E2D\u2026\u300D\uFF1A\u8F6C\u5708 + \u6587\u6848\u5E76\u6392\uFF0C\u4E0D\u6491\u7834\u6309\u94AE\u9AD8\u5EA6 */
.dk_confirmBusy { display: inline-flex; align-items: center; gap: var(--dk-gap-sm); }

/* \u5FD9\u788C\u7684\u786E\u8BA4\u952E\u540C\u6837\u8981\u9876\u6389 .dk_btn:disabled \u7684 .45\uFF0C\u5426\u5219\u300C\u6267\u884C\u4E2D\u2026\u300D\u770B\u4E0D\u6E05\uFF08\u53D6\u6D88\u952E\u4FDD\u6301\u7F6E\u7070\uFF09 */
.dk_confirm[data-busy="1"] .dk_btnDanger { opacity: 1; cursor: progress; }

/* ==================== \u7F51\u7EDC / \u5377\u5217\u8868 ==================== */

/*
 * \u53EF\u70B9\u51FB\u7684\u8868\u683C\u884C\uFF08\u7F51\u7EDC / \u5377\u5217\u8868\uFF1A\u884C = \u8FDB\u8BE6\u60C5\u7684\u5165\u53E3\uFF09\u3002
 * \u53EA\u7ED9 cursor + hover \u63D0\u793A\uFF0C\u4E0D\u52A0\u4E0B\u5212\u7EBF\u2014\u2014\u8868\u683C\u91CC\u6EE1\u5C4F\u4E0B\u5212\u7EBF\u4F1A\u66F4\u96BE\u770B\u3002
 */
.dk_rowClickable { cursor: pointer; }
.dk_rowClickable:hover { background: var(--dk-hover); }

/* \u6302\u8F7D\u70B9\u5217\uFF1A\u8DEF\u5F84\u5F88\u957F\uFF0C\u6491\u5BBD\u8868\u683C\u4F1A\u628A\u522B\u7684\u5217\u6324\u6CA1\uFF0C\u8FD9\u91CC\u9650\u5BBD + \u7701\u7565\u53F7\uFF0Ctitle \u91CC\u7ED9\u5168\u91CF */
.dk_pathCell { max-width: 420px; overflow: hidden; text-overflow: ellipsis; }

/* ============================ \u7A7A\u6001 / \u63D0\u793A ============================ */

.dk_empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--dk-gap-md);
  padding: 48px var(--dk-gap-lg);
  color: var(--dk-label-3);
  text-align: center;
}

.dk_emptyTitle { font-size: 13px; color: var(--dk-label-2); }
.dk_emptyHint { font-size: 12px; max-width: 420px; line-height: 1.6; }

.dk_banner {
  display: flex;
  align-items: flex-start;
  gap: var(--dk-gap-sm);
  margin: 0 0 var(--dk-gap-lg);
  padding: var(--dk-gap-md) var(--dk-gap-lg);
  border: 1px solid color-mix(in srgb, var(--dk-danger) 32%, transparent);
  border-radius: var(--dk-r-md);
  background: color-mix(in srgb, var(--dk-danger) 8%, transparent);
  color: var(--dk-label);
  font-size: 12px;
  line-height: 1.6;
}

.dk_banner[data-kind="warn"] {
  border-color: color-mix(in srgb, var(--dk-warn) 32%, transparent);
  background: color-mix(in srgb, var(--dk-warn) 8%, transparent);
}

.dk_banner[data-kind="info"] {
  border-color: var(--dk-border-strong);
  background: var(--dk-surface-2);
}

.dk_bannerIcon { flex: 0 0 auto; margin-top: 1px; color: currentColor; }
.dk_bannerBody { flex: 1 1 auto; min-width: 0; }
.dk_bannerAction { flex: 0 0 auto; display: inline-flex; align-items: center; }

/* ============================ \u786E\u8BA4\u6846 ============================ */

.dk_confirmBackdrop {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--dk-gap-lg);
  background: color-mix(in srgb, #000 40%, transparent);
}

.dk_confirm {
  width: min(420px, 100%);
  padding: var(--dk-gap-xl);
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-lg);
  background: var(--dk-surface-solid);
  box-shadow: var(--dk-shadow-lg);
}

.dk_confirmTitle { font-size: 13px; font-weight: 600; margin-bottom: var(--dk-gap-md); }
.dk_confirmText { font-size: 12px; color: var(--dk-label-2); line-height: 1.7; margin-bottom: var(--dk-gap-lg); }
.dk_confirmActions { display: flex; justify-content: flex-end; gap: var(--dk-gap-md); }

/* ============================ \u8BBE\u7F6E\u5361\u7247 ============================ */

/*
 * \u5916\u6846\u4E0E DSH \u5185\u7F6E\u5361\u7247 / \u5176\u4ED6\u63D2\u4EF6\u5361\u7247\uFF08pM_pluginCard\u3001tt_card\uFF09\u540C\u4E00\u5957\u5EA6\u91CF\uFF1A
 * border-l2 + bg-layer-3\uFF08\u5C55\u5F00\u65F6 layer-2\uFF09\u300112px \u5706\u89D2\u3001\u6807\u9898\u884C 14/16\u3001
 * \u6807\u9898 14px/600\u3001\u63CF\u8FF0 12px/label-secondary\u3002
 * \u4E4B\u524D\u662F\u5185\u8054\u7684 10px \u5706\u89D2 + \u66F4\u6D45\u7684\u8FB9\u6846 + 13px \u6807\u9898\uFF0C\u5728\u8BBE\u7F6E\u5217\u8868\u91CC\u4E00\u773C\u5C31\u662F\u300C\u53E6\u4E00\u5957\u300D\u3002
 */
.dk_settingsCard {
  list-style: none;
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-xl);
  background: var(--dk-surface-3);
  transition: border-color var(--dk-dur) var(--dk-ease), background var(--dk-dur) var(--dk-ease);
}

.dk_settingsCard:hover { border-color: var(--dk-label-dimmed); }
.dk_settingsCardOpen { background: var(--dk-surface-2); border-color: var(--dk-label-dimmed); }

.dk_settingsHead {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-lg);
  width: 100%;
  padding: var(--dk-pad-cardHead);
  border: 0;
  border-radius: var(--dk-r-xl);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.dk_settingsHead:focus-visible { outline: none; box-shadow: var(--dk-ring); }
.dk_settingsHeadText { display: flex; flex-direction: column; gap: var(--dk-gap-xs); flex: 1; min-width: 0; }
.dk_settingsName { color: var(--dk-label); font-size: 14px; font-weight: 600; line-height: 1.4; }
/* dsh-plugin-kit \u5957\u4EF6\u5FBD\u6807\uFF08\u7EA6\u5B9A\u89C1 @hyzyn/dsh-kit README\uFF1A\u5168\u90E8 kit \u8BBE\u7F6E\u5361\u7247\u5171\u7528\uFF09 */
.dshkit_badge {
  flex: none;
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  letter-spacing: 0.02em;
  color: var(--dk-label-2, var(--dsw-alias-label-dimmed));
  background: var(--dk-bg-2, var(--dsw-alias-bg-layer-2));
  border: 1px solid var(--dk-border, var(--dsw-alias-border-l1));
}
.dk_settingsDesc { color: var(--dk-label-2); font-size: 12px; line-height: 1.5; }

.dk_settingsChevron {
  flex: none;
  display: inline-flex;
  color: var(--dk-label-3);
  transition: transform var(--dk-dur) var(--dk-ease);
}

.dk_settingsCardOpen .dk_settingsChevron { transform: rotate(180deg); }

.dk_settingsBody {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-lg);
  padding: 2px var(--dk-gap-xl) var(--dk-gap-xl);
  color: var(--dk-label);
  font-size: 13px;
}

.dk_cardSection {
  margin-top: var(--dk-gap-xs);
  padding-bottom: var(--dk-gap-xs);
  border-bottom: 1px solid var(--dk-border);
  color: var(--dk-label-3);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .3px;
}

.dk_field {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-sm);
  min-width: 0;
}

/*
 * \u6807\u7B7E\u884C\u9AD8\u5FC5\u987B\u9501\u6B7B\u3002
 * \u4E2D\u6587\u8D70 PingFang SC \u56DE\u9000\u5B57\u4F53\uFF0C\u884C\u6846\u6BD4\u7EAF\u62C9\u4E01\u6587\u672C\u9AD8 ~2.5px\uFF0816.5 vs 14\uFF09\uFF1B\u6805\u683C\u662F
 * align-items:start\uFF0C\u540C\u4E00\u884C\u91CC\u300Cdocker CLI\u300D\u548C\u300C\u7EDF\u8BA1\u5237\u65B0\u95F4\u9694\uFF08\u79D2\uFF09\u300D\u7684\u8F93\u5165\u6846\u5C31\u4F1A
 * \u5DEE 2.5px \u9519\u5F00\uFF0C\u57FA\u7EBF\u4E5F\u9AD8\u4F4E\u4E0D\u9F50\u3002\u7ED9\u6B7B\u884C\u9AD8\u540E\u4E24\u79CD\u6587\u672C\u7684\u884C\u6846\u7B49\u9AD8\uFF0C\u8F93\u5165\u6846\u9876\u8FB9\u5BF9\u9F50\u3002
 * \u522B\u5220\u6210 line-height: normal \u2014\u2014 \u4E00\u5220\u5C31\u9000\u56DE\u5B57\u4F53\u5EA6\u91CF\u51B3\u5B9A\u884C\u6846\u3002
 */
.dk_label { font-size: 12px; line-height: 1.4; color: var(--dk-label-2); }
.dk_hint { font-size: 11px; color: var(--dk-label-3); line-height: 1.6; }
.dk_row { display: flex; align-items: center; gap: var(--dk-gap-md); flex-wrap: wrap; }

/*
 * \u8BBE\u7F6E\u5361\u7247\u7684\u5B57\u6BB5\u6805\u683C\uFF1A**\u7B49\u5BBD** 3 \u5217\uFF08\u7A84\u5C4F 2 \u5217\uFF09\u3002
 * \u4E0D\u8981\u518D\u7ED9\u5355\u4E2A\u5B57\u6BB5\u8DE8\u5217\u2014\u2014\u7B2C\u4E00\u884C\u8DE8 2 \u5217\u3001\u7B2C\u4E8C\u884C\u5355\u5217\uFF0C\u884C\u4E0E\u884C\u4E4B\u95F4\u5BBD\u5EA6\u4E0D\u4E00\u81F4\uFF0C
 * \u770B\u8D77\u6765\u6BD4\u4E0D\u5BF9\u9F50\u8FD8\u4E71\uFF08v0.1.22 \u7684\u6559\u8BAD\uFF09\u3002
 */
.dk_fieldGrid {
  display: grid;
  /* auto-fit + minmax\uFF1A\u5217\u5BBD\u8DDF\u7740**\u5BB9\u5668**\u8D70\uFF0C\u800C\u4E0D\u662F\u89C6\u53E3 \u2014\u2014 \u8BBE\u7F6E\u9762\u677F\u672C\u8EAB\u53EF\u80FD\u662F\u7A84\u7684\u3002
     \u5361\u7247 ~966px \u2192 3 \u5217\uFF1B~570px \u2192 2 \u5217\uFF1B\u518D\u7A84 \u2192 1 \u5217\uFF0C\u6C38\u8FDC\u4E0D\u4F1A\u53E0 */
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--dk-gap-lg) var(--dk-gap-xl);
  align-items: start;
}

.dk_fieldGrid .dk_input,
.dk_fieldGrid .dk_select { min-width: 0; }

/* \u6570\u5B57\u8F93\u5165\u53BB\u6389\u6D4F\u89C8\u5668\u539F\u751F\u4E0A\u4E0B\u7BAD\u5934\uFF1A\u5404\u5E73\u53F0\u6837\u5F0F\u4E0D\u4E00\uFF0C\u8FD8\u4F1A\u5403\u6389\u53F3\u5185\u8FB9\u8DDD */
.dk_input[type="number"] {
  -moz-appearance: textfield;
  appearance: textfield;
  font-variant-numeric: tabular-nums;
}

.dk_input[type="number"]::-webkit-outer-spin-button,
.dk_input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/*
 * \u76EE\u6807\u884C\u4E0E\u5185\u8054 SSH \u5B57\u6BB5\u5171\u7528\u540C\u4E00\u5957\u5217\u5BBD\u6A21\u677F\uFF081fr \xB7 96px \xB7 1fr \xB7 150px\uFF09\uFF0C
 * \u5185\u8054\u5757\u6574\u5BBD\u94FA\u5F00 \u2192 host/port/username/auth \u6B63\u597D\u843D\u5728\u76EE\u6807\u540D/\u7C7B\u578B/\u8FDE\u63A5\u7C3F/\u64CD\u4F5C\u5217\u4E0B\u65B9\u3002
 */
.dk_targetRow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px minmax(0, 1fr) minmax(0, 150px);
  gap: var(--dk-gap-sm);
  align-items: center;
  padding: var(--dk-gap-sm);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-2);
}

/* \u5220\u9664\u6309\u94AE\u9760\u53F3\uFF0C\u4E0D\u8DDF\u7740\u5217\u5BBD\u88AB\u62C9\u957F */
.dk_targetRow > .dk_btnDanger { justify-self: end; }

.dk_targetInline {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: minmax(0, 1fr) 96px minmax(0, 1fr) minmax(0, 150px);
  gap: var(--dk-gap-sm);
  align-items: center;
}

/* \u51ED\u636E\u5360\u524D\u4E09\u5217\uFF0C\u590D\u9009\u6846\u56FA\u5B9A\u7B2C 4 \u5217\uFF08\u4E0E\u4E0A\u9762\u7684 auth \u4E0B\u62C9\u4E0A\u4E0B\u5BF9\u9F50\uFF09 */
.dk_targetInline > .dk_credential { grid-column: 1 / span 3; }
.dk_targetInline > .dk_check { grid-row: 2; grid-column: 4; }

.dk_targetRow .dk_input,
.dk_targetRow .dk_select {
  height: var(--dk-h-md);
  min-width: 0;
}

.dk_targetHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dk-gap-md);
}

.dk_msg { font-size: 12px; }
.dk_msg[data-kind="ok"] { color: var(--dk-success); }
.dk_msg[data-kind="error"] { color: var(--dk-danger); }

.dk_spin {
  display: inline-block;
  width: 13px;
  height: 13px;
  border: 2px solid var(--dk-border-strong);
  border-top-color: var(--dk-accent);
  border-radius: 50%;
  animation: dk_spin .7s linear infinite;
}

@keyframes dk_spin { to { transform: rotate(360deg); } }

.dk_srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* \u7A84\u5C4F\uFF1A\u62BD\u5C49\u6539\u4E3A\u8986\u76D6\u6574\u680F */
@media (max-width: 860px) {
  .dk_body { flex-direction: column; }
  .dk_targetRow,
  .dk_targetInline { grid-template-columns: minmax(0, 1fr) 80px; }
  .dk_targetInline > .dk_credential { grid-column: 1 / -1; }
  .dk_targetInline > .dk_check { grid-row: auto; grid-column: 2; }
  .dk_cardRow { grid-template-columns: 40px 1fr; }
  .dk_projectRow { grid-template-columns: 96px 1fr auto; }
  .dk_projectImage,
  .dk_projectPorts { display: none; }
}

/* ============================ \u955C\u50CF\u8BE6\u60C5 ============================ */

/* \u955C\u50CF\u8868\u6700\u540E\u4E00\u5217\uFF08\u64CD\u4F5C\uFF09\uFF1A\u5BBD\u5EA6\u6536\u5230\u5185\u5BB9\u3001\u6309\u94AE\u53F3\u5BF9\u9F50\uFF0C\u4E0D\u8DDF\u6570\u636E\u5217\u62A2\u5BBD\u5EA6 */
.dk_colActions { width: 1%; white-space: nowrap; text-align: right; }
.dk_rowActions { display: inline-flex; align-items: center; gap: var(--dk-gap-xs); }

.dk_layerList {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 220px;
  overflow: auto;
}

.dk_layerItem {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  font-size: 12px;
  color: var(--dk-label-2);
}

.dk_layerIndex {
  flex: none;
  width: 36px;
  color: var(--dk-label-3);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.dk_layerId { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dk_labelList { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.dk_labelItem { display: grid; grid-template-columns: minmax(0, 240px) 1fr; gap: var(--dk-gap-md); }
.dk_labelKey { color: var(--dk-label-3); font-family: var(--dk-mono); overflow-wrap: anywhere; }
.dk_labelVal { color: var(--dk-label); font-family: var(--dk-mono); overflow-wrap: anywhere; }

.dk_historyTable td { vertical-align: top; }
.dk_historyCmd { max-width: 440px; overflow: hidden; text-overflow: ellipsis; }

/* ============================ \u955C\u50CF\u62C9\u53D6\u8FDB\u5EA6 ============================ */

.dk_pullBody { gap: var(--dk-gap-md); }

.dk_pullBox {
  flex: 1 1 auto;
  min-height: 180px;
  margin-top: var(--dk-gap-md);
  padding: var(--dk-gap-md);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-md);
  background: var(--dk-log-bg);
  color: var(--dk-log-fg);
  font-family: var(--dk-mono);
  font-size: 12px;
  line-height: 1.5;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.dk_pullLine { min-height: 1.5em; }
/* \u9010\u5C42\u72B6\u6001\u884C\uFF1A\u5C42\u952E\u7531 data-key \u6807\u51FA\uFF0C\u7ED9\u5C42\u72B6\u6001\u4E00\u70B9\u8272\u5F69\u533A\u5206 */
.dk_pullLine[data-key] { color: color-mix(in srgb, var(--dk-log-fg) 82%, var(--dk-accent)); }

/* ============================ \u7EDF\u8BA1\u5B9E\u65F6\u8DDF\u968F ============================ */

.dk_statsView {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-md);
  flex: 1 1 auto;
  min-height: 0;
}

.dk_statsBar { display: flex; align-items: center; gap: var(--dk-gap-sm); flex-wrap: wrap; }
.dk_trend { display: inline-flex; align-items: center; gap: var(--dk-gap-sm); }

.dk_spark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 22px;
  color: var(--dk-accent);
}

.dk_spark svg { display: block; width: 96px; height: 22px; overflow: visible; }
.dk_spark[data-alert="1"] { color: var(--dk-danger); }
.dk_sparkEmpty { font-size: 11px; color: var(--dk-label-3); }

/* ============================ Compose \u9879\u76EE ============================ */

.dk_projects { display: flex; flex-direction: column; gap: var(--dk-gap-lg); }

.dk_project {
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-2);
  overflow: hidden;
  cursor: pointer;
  transition: border-color var(--dk-dur) var(--dk-ease), box-shadow var(--dk-dur) var(--dk-ease);
}

.dk_project:hover { border-color: var(--dk-border-strong); }
.dk_project:focus-visible { outline: none; box-shadow: var(--dk-ring); }
.dk_projectHead { display: flex; align-items: center; gap: var(--dk-gap-md); padding: var(--dk-gap-md) var(--dk-gap-lg); }
.dk_projectIcon { display: inline-flex; align-items: center; color: var(--dk-accent); }
.dk_projectName { font-size: 13px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dk_projectRows { display: flex; flex-direction: column; border-top: 1px solid var(--dk-border); }

.dk_projectRow {
  display: grid;
  grid-template-columns: 120px minmax(120px, 1.1fr) auto minmax(120px, 1.2fr) minmax(80px, 1fr);
  align-items: center;
  gap: var(--dk-gap-md);
  padding: var(--dk-gap-sm) var(--dk-gap-lg);
  font-size: 12px;
  border-top: 1px solid var(--dk-border);
}

.dk_projectRow:first-child { border-top: none; }
.dk_projectSvc { color: var(--dk-label-2); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dk_projectContainer { font-family: var(--dk-mono); color: var(--dk-label); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dk_projectImage { font-family: var(--dk-mono); color: var(--dk-label-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dk_projectPorts { color: var(--dk-label-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dk_composeTable td { vertical-align: middle; }

/* \u805A\u5408\u65E5\u5FD7\u7684 [service] \u524D\u7F00\uFF08\u540C\u4E00\u4EFD\u65E5\u5FD7\u7740\u8272\uFF0C\u53EA\u591A\u4E00\u4E2A\u6765\u6E90\u6807\u7B7E\uFF09 */
.dk_logSvc { margin-right: 6px; color: var(--dk-accent); font-weight: 600; }
`;var Qt="/api/dsh-docker",fn="dsh-docker-style";function Ut(){if(document.getElementById(fn)!==null)return;let i=document.createElement("style");i.id=fn,i.textContent=mn,document.head.appendChild(i)}async function Y(i,p){let e=await fetch(Qt+i,{...p,headers:{"content-type":"application/json",...p?.headers??{}}}),o=null;try{o=await e.json()}catch{}if(!e.ok){let q=o!==null&&typeof o.error=="string"?o.error:`HTTP ${String(e.status)}`;throw new Error(q)}if(o!==null&&o.ok===!1)throw new Error(typeof o.error=="string"?o.error:"\u8BF7\u6C42\u5931\u8D25");return o}var K={config:()=>Y("/config"),saveConfig:i=>Y("/config",{method:"POST",body:JSON.stringify(i)}),targets:()=>Y("/targets"),probe:i=>Y("/probe",{method:"POST",body:JSON.stringify({target:i})}),containers:(i,p)=>Y("/containers",{method:"POST",body:JSON.stringify({target:i,all:p})}),inspect:(i,p)=>Y("/inspect",{method:"POST",body:JSON.stringify({target:i,id:p})}),logs:(i,p,e)=>Y("/logs",{method:"POST",body:JSON.stringify({target:i,id:p,...e})}),stats:(i,p)=>Y("/stats",{method:"POST",body:JSON.stringify({target:i,ids:p})}),images:i=>Y("/images",{method:"POST",body:JSON.stringify({target:i})}),imageInspect:(i,p)=>Y("/images/inspect",{method:"POST",body:JSON.stringify({target:i,ref:p})}),imageRemove:(i,p)=>Y("/images/remove",{method:"POST",body:JSON.stringify({target:i,ref:p})}),imagePrune:i=>Y("/images/prune",{method:"POST",body:JSON.stringify({target:i})}),networks:i=>Y("/networks",{method:"POST",body:JSON.stringify({target:i})}),networkInspect:(i,p)=>Y("/networks/inspect",{method:"POST",body:JSON.stringify({target:i,name:p})}),networkRemove:(i,p)=>Y("/networks/remove",{method:"POST",body:JSON.stringify({target:i,name:p})}),networkPrune:i=>Y("/networks/prune",{method:"POST",body:JSON.stringify({target:i})}),volumes:i=>Y("/volumes",{method:"POST",body:JSON.stringify({target:i})}),volumeInspect:(i,p)=>Y("/volumes/inspect",{method:"POST",body:JSON.stringify({target:i,name:p})}),volumeRemove:(i,p)=>Y("/volumes/remove",{method:"POST",body:JSON.stringify({target:i,name:p})}),volumePrune:i=>Y("/volumes/prune",{method:"POST",body:JSON.stringify({target:i})}),action:(i,p,e)=>Y("/action",{method:"POST",body:JSON.stringify({target:i,action:p,id:e})}),exec:(i,p,e,o)=>Y("/exec",{method:"POST",body:JSON.stringify({target:i,id:p,command:e,timeoutSec:o})})};function Tt(i,p){return Qt+i+"?"+new URLSearchParams(p).toString()}function La(i){return i==null||!Number.isFinite(i)?"\u2014":i.toFixed(i>=10?1:2)+"%"}function Ta(i){return i.hostPort===void 0?String(i.containerPort)+"/"+i.protocol:String(i.hostPort)+"\u2192"+String(i.containerPort)+"/"+i.protocol}function Et(i){if(!Array.isArray(i)||i.length===0)return"\u65E0\u7AEF\u53E3\u6620\u5C04";let p=new Set,e=[];for(let o of i){let q=Ta(o);p.has(q)||(p.add(q),e.push(q))}return e.join("  ")}function gt(i){let p=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(i);return p===null?i:p[1]+" "+p[2]}function It(i){if(i==null||!Number.isFinite(i)||i<0)return"\u2014";let p=["B","kB","MB","GB","TB"],e=i,o=0;for(;e>=1e3&&o<p.length-1;)e/=1e3,o+=1;return(o===0?String(Math.round(e)):e.toFixed(e>=100?0:1))+" "+p[o]}function Ea(i){return{running:"\u8FD0\u884C\u4E2D",exited:"\u5DF2\u505C\u6B62",created:"\u5DF2\u521B\u5EFA",paused:"\u5DF2\u6682\u505C",restarting:"\u91CD\u542F\u4E2D",dead:"dead",removing:"\u5220\u9664\u4E2D",unknown:"\u672A\u77E5"}[i]??i}function Ia(i,p){let e=new Blob([p],{type:"text/plain;charset=utf-8"}),o=URL.createObjectURL(e),q=document.createElement("a");q.href=o,q.download=i,q.click(),setTimeout(()=>URL.revokeObjectURL(o),1e3)}function vn(i){return"docker exec -it '"+String(i).replaceAll("'","'\\''")+"' sh"}var Re=null,He=null,Ot=null,De=null,en=[],qt=0,Rt=null,Dt=!1;function Rn(i){Dt=i,Rt!==null&&Rt.set(i)}function Dn(i){Rn(!(i!==null&&typeof i=="object"&&i.enabled===!1))}function Wt(i){i!==null&&typeof i=="object"&&(De=i),qt=Date.now(),Dn(De)}async function Bt(){let i=!0;try{De=(await K.config()).config,qt=Date.now(),Dn(De)}catch(p){i=!1,console.warn("[dsh-docker] \u914D\u7F6E\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(p instanceof Error?p.message:String(p)))}try{en=(await K.targets()).targets??[],qt=Date.now()}catch(p){Dt&&(i=!1,console.warn("[dsh-docker] \u76EE\u6807\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(p instanceof Error?p.message:String(p))))}return i}async function Oa(i,p){let e=Xt(i,p);return e!==void 0?e:(await Bt(),Xt(i,p))}function Xt(i,p){let e=De!==null&&Array.isArray(De.targets)?De.targets:[];if(typeof p=="string"&&p!==""){let D=e.find(G=>G.kind==="ssh"&&G.book===p);if(D!==void 0)return D.name}let o=typeof i?.host=="string"?i.host:"";if(o==="")return;let q=Number(i?.port),k=Number.isInteger(q)&&q>0?q:22;for(let D of en){if(D.kind!=="ssh"||typeof D.label!="string")continue;let G=/^([^@]+)@(.+?)(?::(\d+))?$/.exec(D.label);if(G!==null&&G[2]===o&&Number(G[3]??22)===k)return D.name}}var bn='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',Ma='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',ze='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',ye='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7"/><path d="M11.5 4.5l-7 7"/></svg>',Ba='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.4l7.4 4.6L5 12.6z"/></svg>',Ra='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.2"/></svg>',Da='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',Mt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.6h10"/><path d="M6.2 4.6V3.4a.8.8 0 0 1 .8-.8h2a.8.8 0 0 1 .8.8v1.2"/><path d="M4.6 4.6l.6 8a.9.9 0 0 0 .9.8h3.8a.9.9 0 0 0 .9-.8l.6-8"/></svg>';var Pa='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v7.2"/><path d="M5 7.4L8 10.4l3-3"/><path d="M3.4 12.8h9.2"/></svg>',ja='<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6l5.8 10.4H2.2z"/><path d="M8 6.4v3.2"/><path d="M8 11.6h.01"/></svg>',_n='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l3.5 3L3 11"/><path d="M8.5 11H13"/></svg>',yn='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 4.5h10"/><path d="M3 8h10"/><path d="M3 11.5h6"/></svg>',Aa='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3.5 12.5v-4"/><path d="M7 12.5v-8"/><path d="M10.5 12.5v-5"/><path d="M13 12.5v-2"/></svg>',Fe='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 8h-9"/><path d="M7 4.5L3.5 8 7 11.5"/></svg>',Yt='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5L8 10.5l4-4"/></svg>',Ha='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6v6.4"/><path d="M5.3 6.5L8 9.2l2.7-2.7"/><path d="M3 11.4v1.2a.8.8 0 0 0 .8.8h8.4a.8.8 0 0 0 .8-.8v-1.2"/></svg>',za='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="9" rx="1.2"/><path d="M2.5 10.2L5.6 7.6l2.4 2 2.1-1.7 3.4 2.9"/><path d="M6 6.2h.01"/></svg>',$t='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.4 12.6h9.2"/><path d="M5.2 9.6l3.1-3.1"/><path d="M8.4 3.6l2.4 2.4"/><path d="M10.6 6.2l1.8 1.8-3.2 1.2-1.2 3.2-1.8-1.8z"/></svg>',xn='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.4 5.9L8 2.8l5.6 3.1L8 9z"/><path d="M2.4 8.4L8 11.5l5.6-3.1"/><path d="M2.4 10.9L8 14l5.6-3.1"/></svg>';var Fa='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="3.2" r="1.7"/><circle cx="3.4" cy="12.2" r="1.7"/><circle cx="12.6" cy="12.2" r="1.7"/><path d="M6.7 4.6L4.5 10.6"/><path d="M9.3 4.6l2.2 6"/><path d="M5.1 12.2h5.8"/></svg>',Va='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="8" cy="4.2" rx="4.6" ry="1.9"/><path d="M3.4 4.2v7.6c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9V4.2"/><path d="M3.4 8c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9"/></svg>',Pn=6,Zt=8;function wn(i){return i>Zt?{canRun:!1,hint:"\u6700\u591A "+String(Zt)+" \u4E2A\u5BB9\u5668\uFF0C\u6D4F\u89C8\u5668\u5E76\u53D1\u957F\u8FDE\u63A5\u6709\u9650\u5236"}:i>Pn?{canRun:!0,hint:"\u8FDE\u63A5\u6570\u8F83\u591A\uFF0C\u6D4F\u89C8\u5668\u5E76\u53D1\u957F\u8FDE\u63A5\u6709\u9650\u5236"}:i<2?{canRun:!1,hint:i===0?"":"\u81F3\u5C11\u9009\u62E9 2 \u4E2A\u5BB9\u5668"}:{canRun:!0,hint:""}}function Nn(i,p){return i.includes(p)?i.filter(e=>e!==p):[...i,p]}function Sn(i,p){let e=new Set(p.map(q=>q.id)),o=i.filter(q=>e.has(q));return o.length===i.length?i:o}function Cn(i,p){let e=new Map(i.map(o=>[o.id,o]));return p.map(o=>e.get(o)).filter(o=>o!==void 0)}var Ln=50,Tn=8,En=500;function In(i,p,e){let o=[p,...i];return o.length>e?o.slice(0,e):o}function On(i){if(typeof i!="number"||!Number.isFinite(i))return"--:--:--";let p=new Date(i*1e3);if(Number.isNaN(p.getTime()))return"--:--:--";let e=o=>String(o).padStart(2,"0");return e(p.getHours())+":"+e(p.getMinutes())+":"+e(p.getSeconds())}function Mn(i){let p=typeof i.action=="string"?i.action:"";return p===""?"?":p.indexOf("die")!==0||i.exitCode===null||i.exitCode===void 0?p:p+"("+String(i.exitCode)+")"}function Bn(i,p){let e=null;return{schedule(){e!==null&&clearTimeout(e),e=setTimeout(()=>{e=null,p()},i)},cancel(){e!==null&&(clearTimeout(e),e=null)}}}window.__ModuleLoader__.load({id:"@hyzyn/dsh-docker",factory:i=>{let p=i("react"),{jsx:e,jsxs:o}=i("react/jsx-runtime"),{createRoot:q}=i("react-dom/client"),{useState:k,useEffect:D,useRef:G,useCallback:ue}=p;function jn(t,a,l){if(a==="")return t;let s=t.toLowerCase(),m=a.toLowerCase(),r=[],h=0,v=s.indexOf(m),d=0;for(;v>=0&&d<500;)v>h&&r.push(t.slice(h,v)),r.push(e("mark",{children:t.slice(v,v+m.length)},l+"-m"+String(d))),h=v+m.length,d+=1,v=s.indexOf(m,h);return h<t.length&&r.push(t.slice(h)),r}function tn(t){let a=Array.isArray(t.rows)?t.rows:[],l=Array.isArray(t.mono)?t.mono:[];return o("div",{className:"dk_kv",children:a.flatMap(([s,m],r)=>[e("div",{className:"dk_kvKey",children:s},"k"+String(r)),e("div",{className:"dk_kvVal"+(l.indexOf(s)>=0?" dk_kvValMono":""),children:m},"v"+String(r))])})}function ht(t){let a=t.health==="unhealthy"?"unhealthy":t.state,l=t.health==="unhealthy"?"\u4E0D\u5065\u5EB7":Ea(t.state);return e("span",{className:"dk_badge","data-state":a,title:t.status??"",children:l})}function J(t){return o("div",{className:"dk_banner","data-kind":t.kind??"error",children:[e("span",{className:"dk_bannerIcon",dangerouslySetInnerHTML:{__html:ja}},"icon"),o("div",{className:"dk_bannerBody",children:[e("div",{children:t.title}),t.hint===void 0?null:e("div",{className:"dk_hint",style:{marginTop:4},children:t.hint})]},"body"),t.action===void 0?null:e("div",{className:"dk_bannerAction",children:t.action},"action")]})}function $e(t){let a=t.busy===!0;return o("div",{className:"dk_confirmBackdrop",onMouseDown:l=>l.stopPropagation(),children:[o("div",{className:"dk_confirm","data-busy":a?"1":void 0,children:[e("div",{className:"dk_confirmTitle",children:t.title}),e("div",{className:"dk_confirmText",children:t.text}),o("div",{className:"dk_confirmActions",children:[e("button",{type:"button",className:"dk_btn",disabled:a,onClick:t.onCancel,children:"\u53D6\u6D88"}),e("button",{type:"button",className:"dk_btn dk_btnDanger",disabled:a,"aria-busy":a?"true":void 0,onClick:t.onConfirm,children:a?o("span",{className:"dk_confirmBusy",children:[e("span",{className:"dk_spin"}),"\u6267\u884C\u4E2D\u2026"]}):t.confirmLabel})]})]})]})}function Ja(t){return e("button",{type:"button",className:"dk_btn"+(t.danger===!0?" dk_btnDanger":""),disabled:t.disabled===!0,title:t.title??"",onClick:a=>{a.stopPropagation(),t.onClick()},children:t.children})}let nn=60;function an(t,a,l){let s=t.concat([a]);return s.length>l?s.slice(s.length-l):s}function rn(t){let a=Array.isArray(t.values)?t.values:[],l=a.filter(C=>typeof C=="number"&&Number.isFinite(C)),s=96,m=22,r=Math.max(Number(t.max)||0,...l,1),h=a.length>1?s/(a.length-1):0,v=[];a.forEach((C,E)=>{if(typeof C!="number"||!Number.isFinite(C))return;let P=h===0?s:E*h,I=m-Math.min(1,Math.max(0,C/r))*m;v.push(P.toFixed(1)+","+I.toFixed(1))});let d=l.length===0?null:l[l.length-1],S=t.alertAt!==void 0&&d!==null&&d>=t.alertAt;return e("span",{className:"dk_spark","data-alert":S?"1":void 0,title:t.title??"",children:v.length<2?e("span",{className:"dk_sparkEmpty",children:"\u91C7\u6837\u4E2D\u2026"}):e("svg",{viewBox:"0 0 "+String(s)+" "+String(m),preserveAspectRatio:"none","aria-hidden":"true",children:e("polyline",{points:v.join(" "),fill:"none",stroke:"currentColor","stroke-width":"1.4","stroke-linejoin":"round","stroke-linecap":"round","vector-effect":"non-scaling-stroke"})})})}function qe(t){return o("div",{className:"dk_cardRow",children:[e("span",{className:"dk_cardLabel",children:t.label}),e("span",{className:"dk_cardValue",title:String(t.value),children:t.value})]})}function V(t){let a=t.disabled===!0,l=t.busy===!0;return e("button",{type:"button",className:"dk_iconBtn"+(t.danger===!0?" dk_iconBtnDanger":""),"data-on":t.on===!0?"1":void 0,"data-spin":t.spin===!0?"1":void 0,"data-busy":l?"1":void 0,"aria-busy":l?"true":void 0,disabled:a,title:t.title,"aria-label":t.title,onClick:s=>{s.stopPropagation(),!a&&t.onClick()},children:l?e("span",{className:"dk_spin"}):e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:t.icon}})})}function An(t){let a=t.item,l=t.pickMode===!0,s=t.picked===!0,m=t.allowMutations!==!0,r=a.state==="running"||a.state==="paused"||a.state==="restarting",h=a.createdAt===null?a.runningFor===""?"\u2014":a.runningFor:gt(a.createdAt),v=typeof t.pending=="string"?t.pending:"",d=v!=="",S=E=>d?"\u6B63\u5728\u6267\u884C "+v+"\u2026\u8BF7\u7A0D\u5019":m?"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D":E,C=()=>{if(l){t.onTogglePick(a);return}t.onOpen(a,"overview")};return o("div",{className:"dk_card",role:l?"checkbox":"button","aria-checked":l?s?"true":"false":void 0,tabIndex:0,"data-selected":t.selected===!0?"1":"0","data-pick":l?"1":void 0,"data-picked":s?"1":void 0,"data-pending":d?"1":void 0,onClick:C,onKeyDown:E=>{(E.key==="Enter"||E.key===" ")&&(E.preventDefault(),C())},children:[o("div",{className:"dk_cardHead",children:[l?e("span",{className:"dk_pick","data-on":s?"1":"0","aria-hidden":"true"},"pick"):null,e("span",{className:"dk_cardName",title:a.name,children:a.name}),e(ht,{state:a.state,health:a.health,status:a.status})]},"head"),o("div",{className:"dk_cardRows",children:[e(qe,{label:"\u955C\u50CF",value:a.image},"image"),e(qe,{label:"ID",value:a.shortId},"id"),e(qe,{label:"\u7AEF\u53E3",value:Et(a.ports)},"ports"),e(qe,{label:"\u521B\u5EFA",value:h},"created"),a.composeProject===null?null:e(qe,{label:"compose",value:a.composeProject+(a.composeService===null?"":"/"+a.composeService)},"compose")]},"rows"),l?null:o("div",{className:"dk_actionBar",children:[e(V,{icon:_n,title:"\u5728\u5BB9\u5668\u5185\u6253\u5F00\u4EA4\u4E92\u5F0F\u7EC8\u7AEF\uFF08docker exec -it "+a.name+" sh\uFF09",onClick:()=>t.onExec(a)},"exec"),e(V,{icon:yn,title:"\u67E5\u770B\u65E5\u5FD7",onClick:()=>t.onOpen(a,"logs")},"logs"),e(V,{icon:Aa,title:"\u8D44\u6E90\u5360\u7528",onClick:()=>t.onOpen(a,"stats")},"stats"),e("span",{className:"dk_actionBarSep","aria-hidden":"true"},"sep"),e(V,{icon:r?Ra:Ba,title:S(r?"\u505C\u6B62\u5BB9\u5668":"\u542F\u52A8\u5BB9\u5668"),disabled:m||d,busy:v===(r?"stop":"start"),onClick:()=>t.onAction(r?"stop":"start",a)},"power"),e(V,{icon:Da,title:S("\u91CD\u542F\u5BB9\u5668"),disabled:m||d,busy:v==="restart",onClick:()=>t.onAction("restart",a)},"restart"),e(V,{icon:Mt,danger:!0,title:S("\u5220\u9664\u5BB9\u5668\uFF08\u4E0D\u53EF\u6062\u590D\uFF09"),disabled:m||d,busy:v==="remove",onClick:()=>t.onAction("remove",a)},"remove")]},"actions")]})}let Hn=/^\s*(\[\d{4}-\d{2}-\d{2}[ T][0-9:.,]+\]|\d{2}:\d{2}:\d{2}[,.]\d{3})/,zn=/^\s*(\[(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\]|\|\s*(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL))/,Fn=/(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)/,Xe=2e3,Ve=5e3;function on(t,a,l){let s=[],m=t;for(let r=0;r<2;r+=1){let h=Hn.exec(m);if(h!==null){s.push(e("span",{className:"dk_logTs",children:h[1]},"ts"+String(r))),m=m.slice(h[0].length);continue}let v=zn.exec(m);if(v!==null){let d=Fn.exec(v[1]);s.push(e("span",{className:"dk_logLevel","data-level":d===null?"":d[1],children:v[1].trim()},"lv"+String(r))),m=m.slice(v[0].length);continue}break}return s.push(e("span",{className:"dk_logText",children:jn(m,l,"x"+String(a))},"tx")),s}function Vn(t,a,l){return o("div",{className:"dk_logLine",children:on(t,a,l)},String(a))}function Jn(t,a,l){return o("div",{className:"dk_logLine",children:[e("span",{className:"dk_logSvc",children:"["+t.service+"]"},"svc"),...on(t.text,a,l)]},String(a))}function Gn(t){let a=t.item,l=t.config,[s,m]=k(t.initialTab??"overview"),[r,h]=k(null),[v,d]=k(""),[S,C]=k({tail:l.logTailDefault,timestamps:!1}),[E,P]=k(null),[I,W]=k(""),[U,f]=k(!1),[j,N]=k(""),[R,_]=k(!1),[F,c]=k(3),[u,x]=k(!1),[z,Z]=k([]),[A,T]=k(""),[le,ie]=k(""),[pe,Se]=k(""),[tt,Ge]=k(!1),[ke,Ke]=k(!0),te=G([]),Oe=G(""),Q=G(null),[ne,pt]=k(null),[me,Ce]=k(""),[fe,Pe]=k(!1),[Le,Ue]=k(""),[mt,Me]=k(""),[ge,Te]=k({cpu:[],mem:[]}),Be=G({cpu:[],mem:[]}),[nt,at]=k(""),[ve,Ee]=k(null),[je,ft]=k(""),[rt,de]=k(!1);D(()=>{let b=!0;return h(null),d(""),K.inspect(t.target,a.id).then(L=>{b&&h(L.details?.[0]??null)}).catch(L=>{b&&d(L.message)}),()=>{b=!1}},[t.target,a.id,t.refreshToken]);let X=ue(()=>{f(!0),W(""),K.logs(t.target,a.id,{tail:S.tail,timestamps:S.timestamps}).then(b=>P(b.logs)).catch(b=>W(b.message)).finally(()=>f(!1))},[t.target,a.id,S.tail,S.timestamps]);D(()=>{s==="logs"&&X()},[s,X,t.refreshToken]),D(()=>{if(s!=="logs"||!R||u)return;let b=setInterval(X,Math.max(1,F)*1e3);return()=>clearInterval(b)},[s,R,F,X,u]),D(()=>{if(s!=="logs"||!u)return;if(typeof EventSource!="function"){ie("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u5B9E\u65F6\u8DDF\u968F"),x(!1);return}te.current=[],Oe.current="",Z([]),Ge(!1),ie(""),Se(""),Ke(!0),T("connecting");let b=new URLSearchParams({target:t.target,id:a.id,tail:String(S.tail),...S.timestamps?{timestamps:"1"}:{}}),L=new EventSource(Qt+"/logs/stream?"+b.toString()),y=!1,H=()=>{if(!y){y=!0;try{L.close()}catch{}}},ee=B=>{if(B==="")return;let M=(Oe.current+B).split(`
`);if(Oe.current=M.pop()??"",M.length===0)return;let $=te.current.concat(M),be=$.length>Ve?$.slice($.length-Ve):$;te.current=be,be.length!==$.length&&Ge(!0),Z(be)},we=B=>{let M=null;try{M=JSON.parse(B.data)}catch{return}M===null||typeof M!="object"||(typeof M.d=="string"?ee(M.d):typeof M.e=="string"&&ee(M.e))},se=B=>{let M=null;try{M=JSON.parse(B.data)}catch{}let $=M!==null&&typeof M.reason=="string"?M.reason:"container-exit",be=M!==null&&typeof M.code=="number"?M.code:null;if($==="container-exit"){Se("\u5BB9\u5668\u5DF2\u9000\u51FA"+(be===null?"":"\uFF08\u9000\u51FA\u7801 "+String(be)+"\uFF09")+"\uFF0C\u65E5\u5FD7\u6D41\u7ED3\u675F\uFF0C\u5DF2\u5207\u56DE\u5FEB\u7167"),H(),x(!1),X();return}T("reconnecting"),Se("\u670D\u52A1\u7AEF\u5DF2\u505C\u6B62\u65E5\u5FD7\u6D41\uFF0C\u6B63\u5728\u91CD\u8FDE\u2026")},O=B=>{if(typeof B.data=="string"&&B.data!==""){let M="\u65E5\u5FD7\u6D41\u5F02\u5E38";try{let $=JSON.parse(B.data);$!==null&&typeof $.message=="string"&&(M=$.message)}catch{}ie(M),H(),x(!1),X();return}T(L.readyState===2?"closed":"reconnecting")};return L.addEventListener("line",we),L.addEventListener("end",se),L.addEventListener("error",O),L.onopen=()=>{T("open"),Se("")},H},[s,u,t.target,a.id,S.tail,S.timestamps,X]),D(()=>{if(s!=="logs"||!u||!ke)return;let b=Q.current;b!==null&&(b.scrollTop=b.scrollHeight)},[s,u,ke,z]);let ot=()=>{if(u){x(!1),T(""),X();return}x(!0),_(!1),ie(""),Se("")},vt=()=>{if(fe){Pe(!1),Ue("");return}Pe(!0),Me(""),Ce("")},bt=()=>Le==="open"?"\u5B9E\u65F6\u8DDF\u968F\u4E2D\uFF08docker stats\uFF09":Le==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u7EDF\u8BA1\u6D41\u2026":Le==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":Le==="closed"?"\u7EDF\u8BA1\u6D41\u5DF2\u65AD\u5F00":"\u7EDF\u8BA1\u6D41",lt=()=>{let b=Q.current;b!==null&&(b.scrollTop=b.scrollHeight),Ke(!0)},_t=b=>{if(!u)return;let L=b.currentTarget;Ke(L.scrollHeight-L.scrollTop-L.clientHeight<24)},Ht=()=>A==="open"?"\u5B9E\u65F6\u8DDF\u968F\u4E2D\uFF08docker logs -f\uFF09":A==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u65E5\u5FD7\u6D41\u2026":A==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":A==="closed"?"\u65E5\u5FD7\u6D41\u5DF2\u65AD\u5F00":"\u65E5\u5FD7\u6D41";D(()=>{if(s!=="stats"||fe)return;let b=!0,L=()=>{K.stats(t.target,[a.id]).then(H=>{b&&(pt(H.stats?.[0]??null),Ce(""))}).catch(H=>{b&&Ce(H.message)})};L();let y=setInterval(L,Math.max(2,l.pollIntervalSec)*1e3);return()=>{b=!1,clearInterval(y)}},[s,fe,t.target,a.id,l.pollIntervalSec,t.refreshToken]),D(()=>{if(s!=="stats"||!fe)return;if(typeof EventSource!="function"){Me("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u5B9E\u65F6\u8DDF\u968F"),Pe(!1);return}Be.current={cpu:[],mem:[]},Te({cpu:[],mem:[]}),Ue("connecting"),Me(""),Ce("");let b=new EventSource(Tt("/stats/stream",{target:t.target,ids:a.id})),L=!1,y=()=>{if(!L){L=!0;try{b.close()}catch{}}},H=se=>{let O=null;try{O=JSON.parse(se.data)}catch{return}if(O===null||typeof O!="object")return;let B=typeof O.cpuPercent=="number"?O.cpuPercent:null,M=typeof O.memPercent=="number"?O.memPercent:null;pt(O),Ce("");let $={cpu:B===null?Be.current.cpu:an(Be.current.cpu,B,nn),mem:M===null?Be.current.mem:an(Be.current.mem,M,nn)};Be.current=$,Te($)},ee=se=>{let O=null;try{O=JSON.parse(se.data)}catch{}let B=O!==null&&typeof O.reason=="string"?O.reason:"stats-exit",M=O!==null&&typeof O.code=="number"?O.code:null;Me("\u7EDF\u8BA1\u6D41\u5DF2\u7ED3\u675F"+(B==="stats-exit"?"\uFF08docker stats \u9000\u51FA"+(M===null?"":"\uFF0C\u9000\u51FA\u7801 "+String(M))+"\uFF09":"")+"\uFF0C\u5DF2\u5207\u56DE\u5FEB\u7167\u8F6E\u8BE2"),y(),Pe(!1)},we=se=>{if(typeof se.data=="string"&&se.data!==""){let O="\u7EDF\u8BA1\u6D41\u5F02\u5E38";try{let B=JSON.parse(se.data);B!==null&&typeof B.message=="string"&&(O=B.message)}catch{}Ce(O),y(),Pe(!1);return}Ue(b.readyState===2?"closed":"reconnecting")};return b.addEventListener("stats",H),b.addEventListener("end",ee),b.addEventListener("error",we),b.onopen=()=>{Ue("open"),Me("")},y},[s,fe,t.target,a.id]);let it=()=>{nt.trim()!==""&&(de(!0),ft(""),Ee(null),K.exec(t.target,a.id,nt,l.execTimeoutSec).then(b=>Ee(b.result)).catch(b=>ft(b.message)).finally(()=>de(!1)))},zt=()=>{if(v!=="")return e(J,{title:"\u8BFB\u53D6\u5BB9\u5668\u8BE6\u60C5\u5931\u8D25",hint:v});if(r===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let b=[["\u72B6\u6001",r.state+(r.health===null?"":" / "+r.health)+(r.status===""?"":"\uFF08"+r.status+"\uFF09")],["\u955C\u50CF",r.image],["\u5BB9\u5668 ID",r.shortId],["\u542F\u52A8\u65F6\u95F4",r.startedAt??"\u2014"],["\u7ED3\u675F\u65F6\u95F4",r.finishedAt??"\u2014"],["\u9000\u51FA\u7801",r.exitCode===null?"\u2014":String(r.exitCode)],["\u91CD\u542F\u6B21\u6570",r.restartCount===null?"\u2014":String(r.restartCount)],["\u91CD\u542F\u7B56\u7565",r.restartPolicy??"\u2014"],["PID",r.pid===null?"\u2014":String(r.pid)],["\u7AEF\u53E3",r.ports.length===0?"\u2014":Et(r.ports)],["\u6302\u8F7D",r.mounts.length===0?"\u2014":r.mounts.map(y=>y.source+"\u2192"+y.destination+(y.readWrite?"":"\uFF08\u53EA\u8BFB\uFF09")).join(`
`)],["\u7F51\u7EDC",r.networks.length===0?"\u2014":r.networks.map(y=>y.name+(y.ip===null?"":"\uFF08"+y.ip+"\uFF09")).join(", ")],["\u547D\u4EE4",(r.entrypoint+" "+r.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",r.workingDir===""?"\u2014":r.workingDir],["\u7528\u6237",r.user===""?"\u2014":r.user]],L=o("div",{className:"dk_kv",children:b.flatMap(([y,H],ee)=>[e("div",{className:"dk_kvKey",children:y},"k"+String(ee)),e("div",{className:"dk_kvVal"+(y==="\u5BB9\u5668 ID"||y==="\u547D\u4EE4"||y==="\u955C\u50CF"?" dk_kvValMono":""),children:H},"v"+String(ee))])});return o("div",{children:[r.healthLogTail===null?null:e("div",{className:"dk_hint",style:{marginBottom:8},children:"\u6700\u8FD1\u5065\u5EB7\u68C0\u67E5\u8F93\u51FA\uFF1A"+r.healthLogTail}),L,e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u4E00\u6B21\u6027\u547D\u4EE4\uFF08docker exec\uFF09"}),l.allowExec!==!0?e(J,{kind:"info",title:"exec \u672A\u542F\u7528",hint:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8 exec\u300D\uFF0C\u6216\u76F4\u63A5\u590D\u5236\u5361\u7247\u4E0A\u7684 exec \u547D\u4EE4\u5230\u7EC8\u7AEF\u9762\u677F\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u3002"}):o("div",{children:[o("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u5982 ls -la /app \u6216 cat /etc/nginx/nginx.conf",value:nt,onChange:y=>at(y.target.value),onKeyDown:y=>{y.key==="Enter"&&it()}}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:rt,onClick:it,children:rt?"\u6267\u884C\u4E2D\u2026":"\u6267\u884C"})]}),je===""?null:e(J,{title:"\u6267\u884C\u5931\u8D25",hint:je}),ve===null?null:o("div",{style:{marginTop:8},children:[e("div",{className:"dk_hint",children:"\u9000\u51FA\u7801 "+(ve.code===null?"?":String(ve.code))+" \xB7 \u8017\u65F6 "+String(ve.durationMs)+"ms"+(ve.truncated?" \xB7 \u8F93\u51FA\u5DF2\u622A\u65AD":"")}),e("pre",{className:"dk_logBox",style:{marginTop:6},children:(ve.stdout||"")+(ve.stderr===""?"":`
[stderr]
`+ve.stderr)||"(\u65E0\u8F93\u51FA)"})]})]})]})},We=()=>{let b=u?z.join(`
`):E!==null&&typeof E=="object"&&typeof E.text=="string"?E.text:"",L=j.trim().toLowerCase(),y=b===""?[]:b.split(`
`),H=L===""?y:y.filter(ee=>ee.toLowerCase().includes(L));return{raw:b,needle:L,allLines:y,matchedLines:H}},Ye=(b,L,y,H)=>e("button",{type:"button",className:"dk_pill"+(H?.className??""),"data-on":b?"1":"0",disabled:H?.disabled===!0,title:H?.title??"",onClick:y,children:L}),ae=()=>{let{raw:b}=We(),L=[...new Set([100,200,500,1e3,5e3,Number(l.logTailDefault)||200,Number(S.tail)||200])].filter(y=>Number.isInteger(y)&&y>0).sort((y,H)=>y-H);return o("div",{className:"dk_logTools",children:[e("span",{className:"dk_toolLabel",children:"LINES"}),e("select",{className:"dk_select dk_selectSm",value:String(S.tail),onChange:y=>C({...S,tail:Number(y.target.value)}),children:L.map(y=>e("option",{value:String(y),children:y===5e3?"Last 5000":"Last "+String(y)},String(y)))}),e("span",{className:"dk_toolLabel",children:"TIMESTAMPS"}),Ye(S.timestamps,S.timestamps?"On":"Off",()=>C({...S,timestamps:!S.timestamps})),e("span",{className:"dk_toolLabel",children:"FOLLOW"}),Ye(u,u?"On":"Off",ot,{className:" dk_pillFollow",title:u?"\u5173\u95ED\u5B9E\u65F6\u8DDF\u968F\uFF08\u56DE\u5230\u65E5\u5FD7\u5FEB\u7167\uFF09":"\u5B9E\u65F6\u8DDF\u968F\u5BB9\u5668\u65E5\u5FD7\uFF08docker logs -f\uFF09"}),e("span",{className:"dk_toolLabel",children:"AUTO REFRESH"}),Ye(R,R?"On":"Off",()=>_(y=>!y),{disabled:u,title:u?"FOLLOW \u6253\u5F00\u65F6\u6682\u505C\u8F6E\u8BE2":"\u6309\u4E0B\u65B9\u95F4\u9694\u91CD\u65B0\u62C9\u53D6\u65E5\u5FD7\u5FEB\u7167"}),e("select",{className:"dk_select dk_selectSm",value:String(F),disabled:u,title:"\u81EA\u52A8\u5237\u65B0\u95F4\u9694\uFF08\u5F00\u542F AUTO REFRESH \u540E\u6309\u6B64\u8F6E\u8BE2\uFF09",onChange:y=>c(Number(y.target.value)),children:[2,3,5,10].map(y=>e("option",{value:String(y),children:String(y)+"s"},String(y)))}),e(V,{icon:ze,title:"\u5237\u65B0\u65E5\u5FD7",spin:U,onClick:X},"refresh"),e(V,{icon:Pa,title:"\u4E0B\u8F7D\u65E5\u5FD7",disabled:b==="",onClick:()=>Ia(a.name+".log",b)},"download")]})},xe=()=>{let{needle:b,allLines:L,matchedLines:y}=We();return o("div",{className:"dk_filterBar",children:[o("div",{className:"dk_filterWrap",children:[e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u65E5\u5FD7\u2026",value:j,onChange:H=>N(H.target.value),onKeyDown:H=>{H.key==="Escape"&&j!==""&&(H.stopPropagation(),N(""))}}),j===""?null:e("button",{type:"button",className:"dk_filterClear",title:"\u6E05\u7A7A\u8FC7\u6EE4","aria-label":"\u6E05\u7A7A\u8FC7\u6EE4",onClick:()=>N(""),children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:ye}})},"clear")]}),e("span",{className:"dk_filterCount",children:b===""?String(L.length)+" \u884C":String(y.length)+" / "+String(L.length)+" \u884C\u5339\u914D"})]})},dt=()=>{let{needle:b,matchedLines:L}=We(),y=L.length>Xe?L.slice(-Xe):L;return o("div",{className:"dk_logs",children:[I===""?null:e(J,{title:"\u8BFB\u53D6\u65E5\u5FD7\u5931\u8D25",hint:I+(I.includes("Failed to fetch")?"\uFF08\u7F51\u7EDC\u8BF7\u6C42\u6CA1\u5230\u5BBF\u4E3B\uFF1A\u5BBF\u4E3B\u53EF\u80FD\u521A\u91CD\u542F\u3001\u6216\u8FDE\u63A5\u88AB\u4E2D\u65AD\uFF09":""),action:e("button",{type:"button",className:"dk_btn",disabled:U,onClick:X,children:"\u91CD\u8BD5"})}),le===""?null:e(J,{title:"\u65E5\u5FD7\u6D41\u4E2D\u65AD",hint:le,action:e("button",{type:"button",className:"dk_btn",onClick:ot,children:"\u91CD\u8BD5"})}),pe===""?null:e(J,{kind:"info",title:pe}),tt?e(J,{kind:"warn",title:"\u65E5\u5FD7\u8D85\u8FC7 "+String(Ve)+" \u884C\uFF0C\u5DF2\u4E22\u5F03\u6700\u65E9\u5185\u5BB9",hint:"\u6D41\u5F0F\u65E5\u5FD7\u53EA\u4FDD\u7559\u6700\u8FD1\u7684\u884C\uFF1B\u9700\u8981\u5B8C\u6574\u5386\u53F2\u8BF7\u7528\u5FEB\u7167\u6216\u300C\u4E0B\u8F7D\u65E5\u5FD7\u300D\u3002"}):null,!u&&E!==null&&E.truncated===!0?e(J,{kind:"warn",title:"\u65E5\u5FD7\u8F93\u51FA\u8D85\u8FC7\u4E0A\u9650\uFF0C\u5DF2\u622A\u65AD",hint:"\u8C03\u5C0F\u300CLINES\u300D\u6216\u5230\u8BBE\u7F6E\u5361\u7247\u8C03\u5927\u300C\u5355\u6B21\u547D\u4EE4\u8F93\u51FA\u4E0A\u9650\u300D\u3002"}):null,u?e("div",{className:"dk_followState","data-state":A,children:Ht()}):null,o("div",{className:"dk_logBody",ref:Q,onScroll:_t,children:[L.length>y.length?e("div",{className:"dk_logLine dk_logMore",children:"\uFF08\u53EA\u663E\u793A\u6700\u8FD1 "+String(Xe)+" \u884C\uFF0C\u5171 "+String(L.length)+" \u884C\u5339\u914D\uFF09"},"more"):null,I!==""?null:!u&&E===null?e("div",{className:"dk_logLine",children:"\u8BFB\u53D6\u4E2D\u2026"},"loading"):y.length===0?e("div",{className:"dk_logLine",children:u?"\u7B49\u5F85\u65E5\u5FD7\u2026":b===""?"(\u65E0\u65E5\u5FD7)":"(\u65E0\u5339\u914D\u65E5\u5FD7)"},"empty"):y.map((H,ee)=>Vn(H,ee,b))]}),u&&!ke?e("button",{type:"button",className:"dk_backToBottom",onClick:lt,children:"\u56DE\u5230\u5E95\u90E8"}):null]})},yt=()=>{let b=fe,L=o("div",{className:"dk_statsBar",children:[e("span",{className:"dk_toolLabel",children:"FOLLOW"}),Ye(b,b?"On":"Off",vt,{className:" dk_pillFollow",title:b?"\u5173\u95ED\u5B9E\u65F6\u8DDF\u968F\uFF08\u56DE\u5230 docker stats \u5FEB\u7167\uFF09":"\u5B9E\u65F6\u8DDF\u968F\u8D44\u6E90\u5360\u7528\uFF08docker stats \u6BCF\u79D2\u4E00\u884C\uFF09"}),e("span",{className:"dk_hint",children:b?"60 \u70B9 \u2248 \u6700\u8FD1 1 \u5206\u949F":"\u6253\u5F00 FOLLOW \u770B\u5B9E\u65F6\u8D8B\u52BF"}),e("span",{className:"dk_headerSpacer"}),b?e("span",{className:"dk_followState","data-state":Le,children:bt()}):null]}),y=B=>o("div",{className:"dk_statsView",children:[L,B]});if(mt!=="")return y(o("div",{children:[e(J,{kind:"info",title:mt}),me===""?null:e(J,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:me})]}));if(me!=="")return y(e(J,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:me}));if(ne===null)return y(e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}));let H=ne.cpuPercent??0,ee=ne.memPercent??0,we=B=>o("div",{className:"dk_bar",children:[e("div",{className:"dk_barFill","data-warn":B>=60&&B<85?"1":void 0,"data-danger":B>=85?"1":void 0,style:{width:Math.min(100,Math.max(0,B))+"%"}})]}),se=Math.max(100,...ge.cpu),O=(B,M,$)=>o("tr",{children:[e("td",{children:B}),e("td",{className:"dk_num",children:M}),e("td",{children:$??null})]},B);return y(o("table",{className:"dk_stats",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u6307\u6807"}),e("th",{children:"\u6570\u503C"}),e("th",{children:"\u5360\u7528 / \u8D8B\u52BF"})]})}),e("tbody",{children:[O("CPU",La(ne.cpuPercent),o("div",{className:"dk_trend",children:[we(H),b||ge.cpu.length>0?e(rn,{values:ge.cpu,max:se,alertAt:85,title:"CPU% \u6700\u8FD1 60 \u4E2A\u91C7\u6837"}):null]})),O("\u5185\u5B58",ne.memUsage,o("div",{className:"dk_trend",children:[we(ee),b||ge.mem.length>0?e(rn,{values:ge.mem,max:100,alertAt:85,title:"\u5185\u5B58\u5360\u7528% \u6700\u8FD1 60 \u4E2A\u91C7\u6837"}):null]})),O("\u7F51\u7EDC IO",ne.netIO,null),O("\u78C1\u76D8 IO",ne.blockIO,null),O("PIDs",ne.pids===null?"\u2014":String(ne.pids),null)]})]}))},Ft=[["overview","\u6982\u89C8"],["logs","\u65E5\u5FD7"],["stats","\u7EDF\u8BA1"]],xt=s==="overview"?r===null&&v==="":s==="stats"?ne===null&&me==="":!1;return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e(V,{icon:Fe,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:a.name,children:a.name}),e(ht,{state:a.state,health:a.health,status:a.status}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),s==="logs"?ae():e(V,{icon:ze,title:"\u5237\u65B0",spin:xt,onClick:t.onRefresh},"refresh"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:ye}})},"close")]}),o("div",{className:"dk_tabs",children:[...Ft.map(([b,L])=>e("button",{type:"button",className:"dk_tab","data-on":s===b?"1":"0",onClick:()=>m(b),children:L},b)),s==="logs"?e("span",{className:"dk_headerSpacer"},"spacer"):null,s==="logs"?xe():null]}),e("div",{className:"dk_detailBody",children:s==="overview"?zt():s==="logs"?dt():yt()})]})}function Pt(t){return t.dangling===!0?t.id:t.reference}function Kn(t){let a=t.item,l=Pt(a),[s,m]=k("overview"),[r,h]=k(null),[v,d]=k(""),[S,C]=k(!1),E=ue(()=>{C(!0),d(""),K.imageInspect(t.target,l).then(f=>h(f.image)).catch(f=>d(f.message)).finally(()=>C(!1))},[t.target,l]);D(()=>{E()},[E]);let P=f=>o("div",{className:"dk_kv",children:f.flatMap(([j,N],R)=>[e("div",{className:"dk_kvKey",children:j},"k"+String(R)),e("div",{className:"dk_kvVal"+(["ID","\u5165\u53E3","digest"].indexOf(j)>=0?" dk_kvValMono":""),children:N},"v"+String(R))])}),I=()=>{if(v!=="")return e(J,{title:"\u8BFB\u53D6\u955C\u50CF\u8BE6\u60C5\u5931\u8D25",hint:v,action:e("button",{type:"button",className:"dk_btn",onClick:E,children:"\u91CD\u8BD5"})});if(r===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let f=r.detail,j=[["\u6807\u7B7E",f.repoTags.length===0?"<none>\uFF08dangling\uFF09":f.repoTags.join(`
`)],["ID",f.id],["\u5927\u5C0F",f.size===null?"\u2014":It(f.size)],["\u542B\u7236\u5C42",f.virtualSize===null?"\u2014":It(f.virtualSize)],["\u521B\u5EFA",f.created===""?"\u2014":gt(f.created)],["\u5E73\u53F0",f.os===""&&f.architecture===""?"\u2014":f.os+"/"+f.architecture],["\u5C42\u6570",String(f.layerCount)],["\u5165\u53E3",(f.entrypoint+" "+f.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",f.workingDir===""?"\u2014":f.workingDir],["\u7528\u6237",f.user===""?"\u2014":f.user],["\u66B4\u9732\u7AEF\u53E3",f.exposedPorts.length===0?"\u2014":f.exposedPorts.join(", ")],["digest",f.repoDigests.length===0?"\u2014":f.repoDigests.join(`
`)]],N=Object.entries(f.labels);return o("div",{children:[P(j),e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u5C42\uFF08"+String(f.layerCount)+"\uFF09"}),f.layers.length===0?e("span",{className:"dk_hint",children:"\u8BE5\u955C\u50CF\u6CA1\u6709\u5C42\u4FE1\u606F\uFF08scratch \u6784\u5EFA\u6216\u65E7\u7248 docker\uFF09\u3002"}):e("div",{className:"dk_layerList",children:f.layers.map((R,_)=>o("div",{className:"dk_layerItem",children:[e("span",{className:"dk_layerIndex",children:"#"+String(_)}),e("span",{className:"dk_mono dk_layerId",title:R,children:R.replace(/^sha256:/,"")})]},R+String(_)))}),N.length===0?null:o("div",{children:[e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u6807\u7B7E\uFF08"+String(N.length)+"\uFF09"}),e("div",{className:"dk_labelList",children:N.map(([R,_])=>o("div",{className:"dk_labelItem",children:[e("span",{className:"dk_labelKey",children:R}),e("span",{className:"dk_labelVal",title:_,children:_})]},R))})]})]})},W=()=>v!==""?e(J,{title:"\u8BFB\u53D6\u955C\u50CF\u8BE6\u60C5\u5931\u8D25",hint:v}):r===null?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):r.historyError!==null?e(J,{kind:"warn",title:"\u8BFB\u53D6\u6784\u5EFA\u5386\u53F2\u5931\u8D25",hint:r.historyError}):r.history.length===0?o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u6CA1\u6709\u6784\u5EFA\u5386\u53F2"}),e("div",{className:"dk_emptyHint",children:"\u8BE5 docker \u7248\u672C\u65E2\u6CA1\u6709 history --format\uFF08\u9700\u8981 Docker \u2265 26\uFF09\uFF0C\u7EAF\u6587\u672C\u8868\u683C\u4E5F\u6CA1\u89E3\u6790\u51FA\u5185\u5BB9\u3002"})]}):e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images dk_historyTable",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u5C42 ID"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u6784\u5EFA\u547D\u4EE4"})]})}),e("tbody",{children:r.history.map((f,j)=>o("tr",{children:[e("td",{className:"dk_mono",children:f.shortId}),e("td",{children:f.createdSince===""?f.created===""?"\u2014":gt(f.created):f.createdSince}),e("td",{children:f.sizeText===""?f.size===null?"\u2014":It(f.size):f.sizeText}),e("td",{className:"dk_mono dk_historyCmd",title:f.createdBy,children:f.createdBy===""?"\u2014":f.createdBy})]},String(j)))})]})}),U=[["overview","\u6982\u89C8"],["history","\u6784\u5EFA\u5386\u53F2"]];return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e(V,{icon:Fe,title:"\u8FD4\u56DE\u955C\u50CF\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:l,children:l}),a.dangling===!0?e("span",{className:"dk_badge","data-state":"paused",children:"dangling"}):null,e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e(V,{icon:ze,title:"\u5237\u65B0\u955C\u50CF\u8BE6\u60C5",spin:S,onClick:E},"refresh"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:ye}})},"close")]}),e("div",{className:"dk_tabs",children:U.map(([f,j])=>e("button",{type:"button",className:"dk_tab","data-on":s===f?"1":"0",onClick:()=>m(f),children:j},f))}),e("div",{className:"dk_detailBody",children:s==="overview"?I():W()})]})}function Un(t){let a=t.item,l=a.name,[s,m]=k("overview"),[r,h]=k(null),[v,d]=k(""),[S,C]=k(!1),[E,P]=k(!1),[I,W]=k(!1),[U,f]=k(""),j=ue(()=>{C(!0),d(""),K.networkInspect(t.target,l).then(c=>h(c.network)).catch(c=>d(c.message)).finally(()=>C(!1))},[t.target,l]);D(()=>{j()},[j]);let N=()=>{W(!0),f(""),K.networkRemove(t.target,l).then(c=>t.onRemoved(c.result.message)).catch(c=>{P(!1),f(c.message)}).finally(()=>W(!1))},R=()=>{if(v!=="")return e(J,{title:"\u8BFB\u53D6\u7F51\u7EDC\u8BE6\u60C5\u5931\u8D25",hint:v,action:e("button",{type:"button",className:"dk_btn",onClick:j,children:"\u91CD\u8BD5"})});if(r===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let c=r.detail,u=[["\u540D\u79F0",c.name],["ID",c.id],["\u9A71\u52A8",c.driver===""?"\u2014":c.driver],["\u8303\u56F4",c.scope===""?"\u2014":c.scope],["\u521B\u5EFA",c.created===""?"\u2014":gt(c.created)],["\u5B50\u7F51",c.subnets.length===0?"\u2014":c.subnets.map(x=>x.subnet===""?"\u2014":x.subnet).join(`
`)],["\u7F51\u5173",c.subnets.length===0?"\u2014":c.subnets.map(x=>x.gateway===""?"\u2014":x.gateway).join(`
`)],["\u5C5E\u6027",[c.internal?"internal":"",c.attachable?"attachable":"",c.ingress?"ingress":"",c.enableIpv6?"ipv6":""].filter(x=>x!=="").join(" \xB7 ")||"\u2014"],["\u9009\u9879",Object.keys(c.options).length===0?"\u2014":Object.entries(c.options).map(([x,z])=>x+"="+z).join(`
`)],["\u6807\u7B7E",Object.keys(c.labels).length===0?"\u2014":Object.entries(c.labels).map(([x,z])=>x+"="+z).join(`
`)]];return e(tn,{rows:u,mono:["ID","\u5B50\u7F51","\u7F51\u5173","\u9009\u9879","\u6807\u7B7E"]})},_=()=>{if(v!=="")return e(J,{title:"\u8BFB\u53D6\u7F51\u7EDC\u8BE6\u60C5\u5931\u8D25",hint:v});if(r===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let c=r.detail.containers;return c.length===0?e("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u6CA1\u6709\u5BB9\u5668\u63A5\u5165\u8FD9\u4E2A\u7F51\u7EDC"})]}):e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u5BB9\u5668"}),e("th",{children:"IPv4"}),e("th",{children:"IPv6"}),e("th",{children:"MAC"})]})}),e("tbody",{children:c.map(u=>o("tr",{children:[e("td",{className:"dk_mono",title:u.id,children:u.name===""?u.shortId:u.name}),e("td",{className:"dk_mono",children:u.ipv4===""?"\u2014":u.ipv4}),e("td",{className:"dk_mono",children:u.ipv6===""?"\u2014":u.ipv6}),e("td",{className:"dk_mono",children:u.mac===""?"\u2014":u.mac})]},u.id))})]})})},F=[["overview","\u6982\u89C8"],["containers","\u63A5\u5165\u7684\u5BB9\u5668"+(r===null?"":"\uFF08"+String(r.detail.containers.length)+"\uFF09")]];return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e(V,{icon:Fe,title:"\u8FD4\u56DE\u7F51\u7EDC\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:Fa}}),e("span",{className:"dk_detailTitle",title:l,children:l}),a.internal===!0?e("span",{className:"dk_badge","data-state":"paused",children:"internal"}):null,e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e(V,{icon:ze,title:"\u5237\u65B0\u7F51\u7EDC\u8BE6\u60C5",spin:S,onClick:j},"refresh"),e(V,{icon:Mt,danger:!0,disabled:t.allowMutations!==!0,title:t.allowMutations===!0?"\u5220\u9664\u7F51\u7EDC\uFF08\u4E0D\u53EF\u6062\u590D\uFF09":"\u5220\u9664\u7F51\u7EDC\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>P(!0)},"remove"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:ye}})},"close")]}),e("div",{className:"dk_tabs",children:F.map(([c,u])=>e("button",{type:"button",className:"dk_tab","data-on":s===c?"1":"0",onClick:()=>m(c),children:u},c))}),o("div",{className:"dk_detailBody",children:[U===""?null:e(J,{title:"\u5220\u9664\u7F51\u7EDC\u5931\u8D25",hint:U}),s==="overview"?R():_()]}),E?e($e,{title:"\u5220\u9664\u7F51\u7EDC",text:"\u786E\u5B9A\u5220\u9664\u7F51\u7EDC "+l+"\uFF1F\u8FD8\u6709\u5BB9\u5668\u63A5\u7740\u65F6 docker \u4F1A\u62D2\u7EDD\uFF1B\u5220\u9664\u540E\u4F9D\u8D56\u5B83\u7684\u5BB9\u5668\u4F1A\u5931\u53BB\u7F51\u7EDC\uFF0C\u9700\u8981\u91CD\u65B0\u521B\u5EFA\u6216\u63A5\u5165\u522B\u7684\u7F51\u7EDC\u3002",confirmLabel:"\u5220\u9664",busy:I,onCancel:()=>P(!1),onConfirm:N},"confirm"):null]})}function Wn(t){let l=t.item.name,[s,m]=k(null),[r,h]=k(""),[v,d]=k(!1),[S,C]=k(!1),[E,P]=k(!1),[I,W]=k(""),U=ue(()=>{d(!0),h(""),K.volumeInspect(t.target,l).then(N=>m(N.volume)).catch(N=>h(N.message)).finally(()=>d(!1))},[t.target,l]);D(()=>{U()},[U]);let f=()=>{P(!0),W(""),K.volumeRemove(t.target,l).then(N=>t.onRemoved(N.result.message)).catch(N=>{C(!1),W(N.message)}).finally(()=>P(!1))},j=()=>{if(r!=="")return e(J,{title:"\u8BFB\u53D6\u5377\u8BE6\u60C5\u5931\u8D25",hint:r,action:e("button",{type:"button",className:"dk_btn",onClick:U,children:"\u91CD\u8BD5"})});if(s===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let N=s.detail,R=[["\u540D\u79F0",N.name],["\u9A71\u52A8",N.driver===""?"\u2014":N.driver],["\u8303\u56F4",N.scope===""?"\u2014":N.scope],["\u6302\u8F7D\u70B9",N.mountpoint===""?"\u2014":N.mountpoint],["\u521B\u5EFA",N.created===""?"\u2014":gt(N.created)],["\u9009\u9879",Object.keys(N.options).length===0?"\u2014":Object.entries(N.options).map(([_,F])=>_+"="+F).join(`
`)],["\u6807\u7B7E",Object.keys(N.labels).length===0?"\u2014":Object.entries(N.labels).map(([_,F])=>_+"="+F).join(`
`)]];return e(tn,{rows:R,mono:["\u6302\u8F7D\u70B9","\u9009\u9879","\u6807\u7B7E"]})};return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e(V,{icon:Fe,title:"\u8FD4\u56DE\u5377\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:Va}}),e("span",{className:"dk_detailTitle",title:l,children:l}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e(V,{icon:ze,title:"\u5237\u65B0\u5377\u8BE6\u60C5",spin:v,onClick:U},"refresh"),e(V,{icon:Mt,danger:!0,disabled:t.allowMutations!==!0,title:t.allowMutations===!0?"\u5220\u9664\u5377\uFF08\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u6CA1\uFF0C\u4E0D\u53EF\u6062\u590D\uFF09":"\u5220\u9664\u5377\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>C(!0)},"remove"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:ye}})},"close")]}),o("div",{className:"dk_detailBody",children:[I===""?null:e(J,{title:"\u5220\u9664\u5377\u5931\u8D25",hint:I}),j()]}),S?e($e,{title:"\u5220\u9664\u5377",text:"\u786E\u5B9A\u5220\u9664\u5377 "+l+"\uFF1F\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u5220\u9664\u4E14\u4E0D\u53EF\u6062\u590D\uFF1B\u8FD8\u6709\u5BB9\u5668\u5360\u7528\u65F6 docker \u4F1A\u62D2\u7EDD\u3002",confirmLabel:"\u5220\u9664",busy:E,onCancel:()=>C(!1),onConfirm:f},"confirm"):null]})}let Yn=2e3;function $n(t,a,l){let s=l+a,m=s.split(/\r\n|\r|\n/),r="";/[\r\n]$/.test(s)||(r=m.pop()??"");let h=t.slice();for(let v of m){let d=v.trim();if(d==="")continue;let S=/^([0-9a-f]{6,}|[A-Za-z][A-Za-z0-9 _-]*?):\s/.exec(d),C=S===null?null:S[1];C!==null&&h.length>0&&h[h.length-1].key===C?h[h.length-1]={key:C,text:d}:h.push({key:C,text:d}),h.length>Yn&&h.shift()}return{lines:h,pending:r}}function qn(t){let[a,l]=k(""),[s,m]=k(!1),[r,h]=k([]),[v,d]=k(""),[S,C]=k(""),[E,P]=k(null),I=G(""),W=G([]),U=G(""),f=G(null);D(()=>{if(!s)return;if(typeof EventSource!="function"){C("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u663E\u793A\u62C9\u53D6\u8FDB\u5EA6"),m(!1);return}d("connecting");let _=new EventSource(Tt("/images/pull/stream",{target:t.target,ref:I.current})),F=!1,c=()=>{if(!F){F=!0;try{_.close()}catch{}}},u=Z=>{let A=null;try{A=JSON.parse(Z.data)}catch{return}if(A===null||typeof A!="object")return;let T=typeof A.d=="string"?A.d:typeof A.e=="string"?A.e:"";if(T==="")return;let le=$n(W.current,T,U.current);W.current=le.lines,U.current=le.pending,h(le.lines)},x=Z=>{let A=null;try{A=JSON.parse(Z.data)}catch{}let T=A!==null&&typeof A.code=="number"?A.code:null;P(T),m(!1),d(T===0?"\u62C9\u53D6\u5B8C\u6210":"\u62C9\u53D6\u7ED3\u675F\uFF08\u9000\u51FA\u7801 "+String(T===null?"?":T)+"\uFF09"),T===0&&t.onDone?.()},z=Z=>{if(typeof Z.data=="string"&&Z.data!==""){let A="\u62C9\u53D6\u5931\u8D25";try{let T=JSON.parse(Z.data);T!==null&&typeof T.message=="string"&&(A=T.message)}catch{}C(A),m(!1),d("");return}d(_.readyState===2?"closed":"reconnecting")};return _.addEventListener("line",u),_.addEventListener("end",x),_.addEventListener("error",z),_.onopen=()=>d("open"),()=>{c(),U.current=""}},[s,t.target]),D(()=>{let _=f.current;_!==null&&(_.scrollTop=_.scrollHeight)},[r]);let j=()=>{let _=a.trim();_===""||s||(I.current=_,W.current=[],U.current="",h([]),C(""),P(null),d(""),m(!0))},N=()=>{m(!1),d("\u5DF2\u505C\u6B62")},R=()=>v==="open"?"\u6B63\u5728\u62C9\u53D6\uFF08docker pull\uFF09\u2026":v==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u62C9\u53D6\u6D41\u2026":v==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":v==="closed"?"\u62C9\u53D6\u6D41\u5DF2\u65AD\u5F00":v;return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e(V,{icon:Fe,title:"\u8FD4\u56DE\u955C\u50CF\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",children:"\u62C9\u53D6\u955C\u50CF"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:ye}})},"close")]}),o("div",{className:"dk_detailBody dk_pullBody",children:[t.allowMutations!==!0?e(J,{kind:"info",title:"\u62C9\u53D6\u955C\u50CF\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",hint:"docker pull \u4F1A\u5199\u5165\u76EE\u6807\u673A\u7684\u955C\u50CF\u5B58\u50A8\u5E76\u5360\u7528\u78C1\u76D8\u4E0E\u5E26\u5BBD\u3002\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u540E\u5373\u53EF\u5728\u6B64\u62C9\u53D6\u3002"}):o("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u955C\u50CF\u5F15\u7528\uFF0C\u5982 nginx:1.27 \u6216 ghcr.io/org/app:latest",value:a,disabled:s,onChange:_=>l(_.target.value),onKeyDown:_=>{_.key==="Enter"&&j()}}),s?e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:N,children:"\u505C\u6B62"}):e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:t.allowMutations!==!0,onClick:j,children:"\u62C9\u53D6"})]}),S===""?null:e(J,{title:"\u62C9\u53D6\u5931\u8D25",hint:S}),v===""?null:e("div",{className:"dk_hint",children:R()+(E===null?"":" \xB7 \u9000\u51FA\u7801 "+String(E))}),o("div",{className:"dk_pullBox",ref:f,children:[r.length===0?e("div",{className:"dk_pullLine",children:s?"\u7B49\u5F85 docker pull \u8F93\u51FA\u2026":"\u586B\u5199\u955C\u50CF\u5F15\u7528\u540E\u70B9\u300C\u62C9\u53D6\u300D\uFF0C\u9010\u5C42\u8FDB\u5EA6\u4F1A\u5B9E\u65F6\u51FA\u73B0\u5728\u8FD9\u91CC\u3002"}):r.map((_,F)=>e("div",{className:"dk_pullLine","data-key":_.key??void 0,children:_.text},String(F)))]})]})]})}function jt(t){let a=new Map;for(let l of t){let s=l.composeProject===null?"":l.composeProject,m=a.get(s);m===void 0&&(m={project:s,items:[]},a.set(s,m)),m.items.push(l)}return[...a.values()]}let ln=t=>t==="running"||t==="paused"||t==="restarting";function Xn(t){return e("div",{className:"dk_projects",children:t.groups.map(a=>{let l=a.items.filter(h=>ln(h.state)).length,s=a.items.filter(h=>h.health==="unhealthy").length,m=[...new Set(a.items.map(h=>h.composeService===null?h.name:h.composeService))],r=a.project===""?"\uFF08\u975E compose \u5BB9\u5668\uFF09":a.project;return o("div",{className:"dk_project",role:"button",tabIndex:0,onClick:()=>t.onOpen(a.project),onKeyDown:h=>{(h.key==="Enter"||h.key===" ")&&(h.preventDefault(),t.onOpen(a.project))},children:[o("div",{className:"dk_projectHead",children:[e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:xn}}),e("span",{className:"dk_projectName",title:r,children:r}),e("span",{className:"dk_badge","data-state":l===a.items.length?"running":l===0?"exited":"paused",children:String(l)+" / "+String(a.items.length)+" \u8FD0\u884C\u4E2D"}),s>0?e("span",{className:"dk_badge","data-state":"unhealthy",children:String(s)+" \u4E0D\u5065\u5EB7"}):null,e("span",{className:"dk_headerSpacer"}),e("span",{className:"dk_hint",children:String(m.length)+" \u4E2A\u670D\u52A1"})]}),e("div",{className:"dk_projectRows",children:a.items.map(h=>o("div",{className:"dk_projectRow",children:[e("span",{className:"dk_projectSvc",children:h.composeService===null?"\u2014":h.composeService}),e("span",{className:"dk_projectContainer",title:h.name,children:h.name}),e(ht,{state:h.state,health:h.health,status:h.status}),e("span",{className:"dk_projectImage",title:h.image,children:h.image}),e("span",{className:"dk_projectPorts",children:Et(h.ports)})]},h.id))})]},a.project===""?"__ungrouped":a.project)})})}function Zn(t){let[a,l]=k("services"),s=t.items,m=t.project===""?"\uFF08\u975E compose \u5BB9\u5668\uFF09":t.project,r=s.filter(d=>ln(d.state)).length,h=()=>e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images dk_composeTable",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u670D\u52A1"}),e("th",{children:"\u5BB9\u5668"}),e("th",{children:"\u72B6\u6001"}),e("th",{children:"\u7AEF\u53E3"}),e("th",{children:"\u955C\u50CF"})]})}),e("tbody",{children:s.map(d=>o("tr",{children:[e("td",{children:d.composeService===null?"\u2014":d.composeService}),e("td",{className:"dk_mono",title:d.name,children:d.name}),e("td",{children:e(ht,{state:d.state,health:d.health,status:d.status})}),e("td",{children:Et(d.ports)}),e("td",{className:"dk_mono",title:d.image,children:d.image})]},d.id))})]})}),v=[["services","\u670D\u52A1"],["logs","\u805A\u5408\u65E5\u5FD7"]];return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e(V,{icon:Fe,title:"\u8FD4\u56DE Compose \u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:xn}}),e("span",{className:"dk_detailTitle",title:m,children:m}),e("span",{className:"dk_badge","data-state":r===s.length?"running":r===0?"exited":"paused",children:String(r)+" / "+String(s.length)+" \u8FD0\u884C\u4E2D"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:ye}})},"close")]}),e("div",{className:"dk_tabs",children:v.map(([d,S])=>e("button",{type:"button",className:"dk_tab","data-on":a===d?"1":"0",onClick:()=>l(d),children:S},d))}),e("div",{className:"dk_detailBody",children:a==="services"?h():e(dn,{target:t.target,items:s})})]})}function dn(t){let a=t.items,[l,s]=k([]),[m,r]=k("connecting"),[h,v]=k(""),[d,S]=k(!0),[C,E]=k(!1),P=G([]),I=G(new Map),W=G(null),U=a.map(_=>_.id).join(",");D(()=>{if(a.length===0){r("empty");return}if(typeof EventSource!="function"){r("unsupported");return}r("connecting"),P.current=[],I.current=new Map,s([]),E(!1);let _=0,F=0,c=a.map(u=>{let x=u.composeService===null?u.name:u.composeService,z=new EventSource(Tt("/logs/stream",{target:t.target,id:u.id,tail:100})),Z=A=>{let le=((I.current.get(u.id)??"")+A).split(`
`);if(I.current.set(u.id,le.pop()??""),le.length===0)return;let ie=P.current.concat(le.map(Se=>({service:x,text:Se}))),pe=ie.length>Ve?ie.slice(ie.length-Ve):ie;P.current=pe,pe.length!==ie.length&&E(!0),s(pe)};return z.addEventListener("line",A=>{let T=null;try{T=JSON.parse(A.data)}catch{return}T===null||typeof T!="object"||(typeof T.d=="string"?Z(T.d):typeof T.e=="string"&&Z(T.e))}),z.addEventListener("end",()=>{try{z.close()}catch{}F+=1,F>=a.length&&r("closed")}),z.addEventListener("error",A=>{typeof A.data=="string"&&A.data!==""?r("partial"):r("reconnecting")}),z.onopen=()=>{_+=1,r("open")},()=>{try{z.close()}catch{}}});return()=>{for(let u of c)u()}},[t.target,U]),D(()=>{if(!d)return;let _=W.current;_!==null&&(_.scrollTop=_.scrollHeight)},[d,l]);let f=h.trim().toLowerCase(),j=f===""?l:l.filter(_=>_.text.toLowerCase().indexOf(f)>=0||_.service.toLowerCase().indexOf(f)>=0),N=j.length>Xe?j.slice(-Xe):j,R=()=>m==="open"?"\u5DF2\u8FDE\u63A5 "+String(a.length)+" \u6761\u5BB9\u5668\u65E5\u5FD7\u6D41\uFF08docker logs -f\uFF09":m==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u5BB9\u5668\u65E5\u5FD7\u6D41\u2026":m==="reconnecting"?"\u90E8\u5206\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":m==="partial"?"\u90E8\u5206\u5BB9\u5668\u65E5\u5FD7\u6D41\u51FA\u9519":m==="closed"?"\u5168\u90E8\u5BB9\u5668\u65E5\u5FD7\u6D41\u5DF2\u7ED3\u675F":m==="unsupported"?"\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource":m==="empty"?"\u8BE5\u9879\u76EE\u6CA1\u6709\u53EF\u805A\u5408\u7684\u5BB9\u5668":"\u805A\u5408\u65E5\u5FD7";return o("div",{className:"dk_logs",children:[C?e(J,{kind:"warn",title:"\u805A\u5408\u65E5\u5FD7\u8D85\u8FC7 "+String(Ve)+" \u884C\uFF0C\u5DF2\u4E22\u5F03\u6700\u65E9\u5185\u5BB9"}):null,o("div",{className:"dk_filterBar",children:[o("div",{className:"dk_filterWrap",children:[e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u670D\u52A1\u540D / \u65E5\u5FD7\u5185\u5BB9\u2026",value:h,onChange:_=>v(_.target.value),onKeyDown:_=>{_.key==="Escape"&&h!==""&&(_.stopPropagation(),v(""))}}),h===""?null:e("button",{type:"button",className:"dk_filterClear",title:"\u6E05\u7A7A\u8FC7\u6EE4",onClick:()=>v(""),children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:ye}})},"clear")]}),e("button",{type:"button",className:"dk_pill dk_pillFollow","data-on":d?"1":"0",title:d?"\u6682\u505C\u81EA\u52A8\u6EDA\u52A8\uFF08\u65E5\u5FD7\u7EE7\u7EED\u63A5\u6536\uFF09":"\u6062\u590D\u81EA\u52A8\u6EDA\u52A8",onClick:()=>S(_=>!_),children:d?"\u81EA\u52A8\u6EDA\u52A8":"\u5DF2\u6682\u505C"}),e("span",{className:"dk_filterCount",children:f===""?String(l.length)+" \u884C":String(j.length)+" / "+String(l.length)+" \u884C\u5339\u914D"})]}),e("div",{className:"dk_followState","data-state":m==="open"?"open":m==="closed"?"closed":"connecting",children:R()}),e("div",{className:"dk_logBody",ref:W,children:[N.length===0?e("div",{className:"dk_logLine",children:m==="open"?"\u7B49\u5F85\u65E5\u5FD7\u2026":R()},"empty"):N.map((_,F)=>Jn(_,F,f))]})]})}function Qn(t,a){let l=typeof t.image=="string"?t.image:"",s=typeof t.composeProject=="string"?t.composeProject:"";return o("span",{className:"dk_activityItem","data-action":String(t.action??"").split(":")[0].trim(),title:s===""?l:l+" \xB7 "+s,children:[e("span",{className:"dk_activityTime",children:On(t.time)}),e("span",{className:"dk_activityName",children:t.name}),e("span",{className:"dk_activityAction",children:Mn(t)})]},String(a)+String(t.name)+String(t.time))}function ea(t){let a=t.open===!0,l=Array.isArray(t.events)?t.events:[],s=l.slice(0,Tn);return o("div",{className:"dk_activity","data-open":a?"1":"0",children:[e("button",{type:"button",className:"dk_activityHead","aria-expanded":a,title:"\u5BB9\u5668\u4E8B\u4EF6\u6D3B\u52A8\uFF08docker events\uFF09\uFF1A\u70B9\u51FB\u6298\u53E0 / \u5C55\u5F00",onClick:t.onToggle,children:[e("span",{className:"dk_activityTitle",children:"\u6D3B\u52A8"}),e("span",{className:"dk_activityState","data-state":t.status??"",children:t.statusText??""}),e("span",{className:"dk_headerSpacer"}),e("span",{className:"dk_hint",children:l.length===0?"\u6682\u65E0\u4E8B\u4EF6":"\u6700\u8FD1 "+String(s.length)+" / "+String(l.length)+" \u6761"}),e("span",{className:"dk_activityChevron",dangerouslySetInnerHTML:{__html:Yt}})]}),a===!1?null:s.length===0?e("div",{className:"dk_activityEmpty",children:"\u6682\u65E0\u4E8B\u4EF6\uFF08\u5BB9\u5668\u7684 start / die / health \u7B49\u52A8\u4F5C\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF09"}):e("div",{className:"dk_activityList",children:s.map(Qn)})]})}function ta(t){let a=t.info;return o("div",{className:"dk_pickBar",children:[e("span",{className:"dk_pickCount",children:"\u5DF2\u9009 "+String(t.count)+" \u4E2A\u5BB9\u5668"}),a.hint===""?null:e("span",{className:"dk_hint dk_pickHint",children:a.hint}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:a.canRun!==!0,title:a.hint!==""?a.hint:a.canRun===!0?"\u628A\u6240\u9009\u5BB9\u5668\u7684\u65E5\u5FD7\u805A\u5408\u6210\u4E00\u6761\u6D41":"\u81F3\u5C11\u9009\u62E9 2 \u4E2A\u5BB9\u5668",onClick:t.onRun,children:"\u805A\u5408\u65E5\u5FD7"}),e("button",{type:"button",className:"dk_btn",onClick:t.onCancel,children:"\u53D6\u6D88"})]})}function na(t){return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e(V,{icon:Fe,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868\uFF08\u9000\u51FA\u9009\u62E9\u6001\uFF09",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:yn}}),e("span",{className:"dk_detailTitle",children:"\u805A\u5408\u65E5\u5FD7 \xB7 "+String(t.items.length)+" \u4E2A\u5BB9\u5668"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:ye}})},"close")]}),e("div",{className:"dk_detailBody",children:e(dn,{target:t.target,items:t.items})})]})}function aa(t){let a=t.collapsed===!0;return o("div",{className:"dk_drawer","data-collapsed":a?"1":void 0,style:a||t.height===null?void 0:{height:String(t.height)+"px"},children:[e("div",{className:"dk_drawerResize",title:"\u62D6\u52A8\u8C03\u6574\u7EC8\u7AEF\u9AD8\u5EA6\uFF08\u53CC\u51FB\u6298\u53E0 / \u5C55\u5F00\uFF09",onMouseDown:t.onResizeStart,onDoubleClick:t.onToggleCollapse},"resize"),o("div",{className:"dk_drawerHead",children:[e("span",{className:"dk_drawerIcon",dangerouslySetInnerHTML:{__html:_n}}),e("span",{className:"dk_drawerTitle",title:t.label,children:t.label}),e("span",{className:"dk_drawerHint",children:a?"\u5DF2\u6298\u53E0 \xB7 \u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C":"\u7531\u7EC8\u7AEF\u9762\u677F\u627F\u8F7D \xB7 \u6298\u53E0\u4FDD\u7559\u4F1A\u8BDD"}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_iconBtn dk_drawerFold",title:a?"\u5C55\u5F00\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u672A\u4E2D\u65AD\uFF09":"\u6298\u53E0\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C\uFF09",onClick:t.onToggleCollapse,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Yt}})},"fold"),e("button",{type:"button",className:"dk_iconBtn",title:"\u7ED3\u675F\u7EC8\u7AEF\u4F1A\u8BDD\u5E76\u6536\u8D77\u62BD\u5C49",onClick:t.onClose,children:e("span",{dangerouslySetInnerHTML:{__html:ye}})},"close")]}),e("div",{className:"dk_drawerBody",ref:t.hostRef})]})}function sn(t){let[a,l]=k(null),[s,m]=k([]),[r,h]=k(t.initialTarget??""),v=t.sessionHint!==void 0&&(t.initialTarget??"")==="",[d,S]=k("containers"),[C,E]=k([]),[P,I]=k([]),[W,U]=k([]),[f,j]=k([]),[N,R]=k(null),[_,F]=k(null),[c,u]=k(null),[x,z]=k(null),[Z,A]=k(!1),[T,le]=k(!1),[ie,pe]=k([]),[Se,tt]=k(!1),[Ge,ke]=k(!1),[Ke,te]=k(""),[Oe,Q]=k(""),[ne,pt]=k(!0),[me,Ce]=k(""),[fe,Pe]=k("all"),[Le,Ue]=k(!1),[mt,Me]=k([]),[ge,Te]=k(""),[Be,nt]=k(!0),at=G(null),ve=G(""),[Ee,je]=k(null),[ft,rt]=k(0),[de,X]=k(null),[ot,vt]=k(!1),[bt,lt]=k({}),[_t,Ht]=k(""),[it,zt]=k(""),[We,Ye]=k(""),ae=G(!0),[xe,dt]=k(null),yt=G(null),[Ft,xt]=k(!1),[b,L]=k(null),[y,H]=k(!1),ee=G(null),we=G(!1);D(()=>()=>{ae.current=!1},[]),D(()=>{if(xe===null)return;let n=yt.current;if(n===null)return;let g=null;try{g=Re.mount(n,xe.options)}catch(w){Q("\u7EC8\u7AEF\u542F\u52A8\u5931\u8D25\uFF1A"+(w instanceof Error?w.message:String(w))),dt(null);return}return()=>{try{g?.()}catch{}}},[xe]);let se=n=>{if(n.button!==void 0&&n.button!==0)return;let g=n.currentTarget.parentElement,w=ee.current;if(g===null||w===null)return;n.preventDefault();let ce=n.clientY,Ne=g.getBoundingClientRect().height,re=Math.max(160,Math.round(w.getBoundingClientRect().height*.75)),St=oe=>{let _e=Math.round(Ne+(ce-oe.clientY));L(Math.min(re,Math.max(160,_e)))},Ct=()=>{document.removeEventListener("mousemove",St),document.removeEventListener("mouseup",Ct),document.body.style.userSelect=""};document.body.style.userSelect="none",document.addEventListener("mousemove",St),document.addEventListener("mouseup",Ct)},O=()=>{if(xe===null){t.onClose();return}H(!0)};D(()=>{K.config().then(n=>{let g=n.config;l(g),!v&&Array.isArray(g.targets)&&g.targets.length>0&&h(w=>w===""?g.targets[0].name:w),Wt(g)}).catch(n=>te(n.message)),K.targets().then(n=>{m(n.targets??[]),en=n.targets??[];let g=(n.targets??[])[0];g!==void 0&&!v&&h(w=>w===""?g.name:w)}).catch(()=>{})},[]);let B=ue(()=>r===""?Promise.resolve():(ke(!0),K.containers(r,ne).then(n=>{ae.current&&(E(n.containers??[]),te(""))}).catch(n=>{ae.current&&te(n.message)}).finally(()=>{ae.current&&ke(!1)})),[r,ne]),M=ue(()=>r===""?Promise.resolve():(ke(!0),K.images(r).then(n=>{ae.current&&(I(n.images??[]),te(""))}).catch(n=>{ae.current&&te(n.message)}).finally(()=>{ae.current&&ke(!1)})),[r]),$=ue(()=>r===""?Promise.resolve():(ke(!0),K.networks(r).then(n=>{ae.current&&(U(n.networks??[]),te(""))}).catch(n=>{ae.current&&te(n.message)}).finally(()=>{ae.current&&ke(!1)})),[r]),be=ue(()=>r===""?Promise.resolve():(ke(!0),K.volumes(r).then(n=>{ae.current&&(j(n.volumes??[]),te(""))}).catch(n=>{ae.current&&te(n.message)}).finally(()=>{ae.current&&ke(!1)})),[r]);D(()=>{at.current=B},[B]);let ua=ue(()=>rt(n=>n+1),[]),Ae=ue(()=>{le(!1),pe([]),tt(!1)},[]),ka=()=>{if(T){Ae();return}pe([]),tt(!1),le(!0)},ga=n=>pe(g=>Nn(g,n.id));D(()=>{if(!T)return;let n=g=>{g.key==="Escape"&&Ae()};return document.addEventListener("keydown",n),()=>document.removeEventListener("keydown",n)},[T,Ae]),D(()=>{T&&pe(n=>Sn(n,C))},[C,T]);let st=ue(()=>{d==="images"?M():d==="networks"?$():d==="volumes"?be():B(),rt(n=>n+1)},[d,B,M,$,be]);D(()=>{r!==""&&st()},[r,ne,d]),D(()=>{if(!Le||r===""||d==="images")return;let n=setInterval(st,Math.max(2,a?.pollIntervalSec??5)*1e3);return()=>clearInterval(n)},[Le,st,r,a,d]);let ha=()=>ge==="open"?"\u5B9E\u65F6\u63A5\u6536\u4E2D\uFF08docker events\uFF09":ge==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u4E8B\u4EF6\u6D41\u2026":ge==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":ge==="closed"?"\u4E8B\u4EF6\u6D41\u5DF2\u65AD\u5F00":ge==="unsupported"?"\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource":"\u4E8B\u4EF6\u6D41";D(()=>{if(d!=="containers"||r==="")return;if(typeof EventSource!="function"){Te("unsupported");return}ve.current!==r&&(ve.current=r,Me([])),Te("connecting");let n=Bn(En,()=>{let oe=at.current;oe!==null&&oe()}),g=!1,w=new EventSource(Tt("/events/stream",{target:r})),ce=!1,Ne=()=>{if(!ce){ce=!0;try{w.close()}catch{}}},re=oe=>{let _e=null;try{_e=JSON.parse(oe.data)}catch{return}_e===null||typeof _e!="object"||(Me(Lt=>In(Lt,_e,Ln)),n.schedule())},St=oe=>{let _e=null;try{_e=JSON.parse(oe.data)}catch{}let Lt=_e!==null&&typeof _e.code=="number"?_e.code:null;Te("closed"),Q("\u4E8B\u4EF6\u6D41\u5DF2\u7ED3\u675F"+(Lt===null?"":"\uFF08\u9000\u51FA\u7801 "+String(Lt)+"\uFF09")+"\uFF0C\u5217\u8868\u56DE\u5230 AUTO REFRESH / \u624B\u52A8\u5237\u65B0"),Ne()},Ct=oe=>{if(typeof oe.data=="string"&&oe.data!==""){Te("closed"),Ne();return}Te(w.readyState===2?"closed":"reconnecting")};return w.addEventListener("event",re),w.addEventListener("end",St),w.addEventListener("error",Ct),w.onopen=()=>{if(Te("open"),g){let oe=at.current;oe!==null&&oe()}g=!0},()=>{Ne(),n.cancel()}},[d,r]),D(()=>{if(Oe==="")return;let n=setTimeout(()=>Q(""),4e3);return()=>clearTimeout(n)},[Oe]);let wt=(n,g)=>{let w=vn(n.name);navigator.clipboard.writeText(w).then(()=>{Q("\u5DF2\u590D\u5236\uFF1A"+w+(g===void 0?"":"\uFF08"+g+"\uFF09"))}).catch(()=>Q("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u6267\u884C\uFF1A"+w))},pa=n=>{let g=vn(n.name);if(Re===null){let re=document.querySelector("[data-dsh-tty-entry]")!==null;wt(n,re?"\u7EC8\u7AEF\u9762\u677F\u7248\u672C\u8FC7\u65E7\uFF08\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u9700\u8981 dsh-tty \u2265 0.14.0\uFF09\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C":"\u672A\u5B89\u88C5 dsh-tty \u7EC8\u7AEF\u9762\u677F\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C\uFF08\u88C5 dsh-tty \u540E\u53EF\u76F4\u63A5\u5728\u6B64\u5F00\u7EC8\u7AEF\uFF09");return}let w=(a?.targets??[]).find(re=>re.name===r),ce=n.name+" \xB7 exec",Ne=w===void 0||w.kind==="local"?{command:g,label:ce}:typeof w.book=="string"&&w.book!==""?{book:w.book,command:g,label:ce}:(w.auth??"agent")==="agent"?{spec:{host:w.host,port:w.port,username:w.username,auth:"agent",agentForward:w.agentForward===!0},command:g,label:ce}:null;if(Ne===null){wt(n,"\u5185\u8054\u76EE\u6807\u7528\u4E86 key/password \u8BA4\u8BC1\uFF0C\u6D4F\u89C8\u5668\u7AEF\u62FF\u4E0D\u5230\u51ED\u8BC1");return}if(t.docked===!0){try{Re.open(Ne)}catch(re){wt(n,re instanceof Error?re.message:String(re))}return}if(typeof Re.mount=="function"&&Number(Re.version??0)>=2){dt({label:ce,options:Ne}),xt(!1);return}try{Re.open(Ne),t.onClose()}catch(re){wt(n,re instanceof Error?re.message:String(re))}},kn=n=>lt(g=>{if(g[n]===void 0)return g;let w={...g};return delete w[n],w}),ct=(n,g)=>{vt(!0);let w=()=>{vt(!1),X(null)};Promise.resolve().then(n).then(async()=>{if(w(),g!==void 0)try{await g()}catch(ce){te(ce.message)}},ce=>{w(),te(ce.message)})},ma=(n,g)=>{bt[g.id]===void 0&&X({title:n==="remove"?"\u5220\u9664\u5BB9\u5668":n==="stop"?"\u505C\u6B62\u5BB9\u5668":n==="start"?"\u542F\u52A8\u5BB9\u5668":"\u91CD\u542F\u5BB9\u5668",text:n==="remove"?`\u786E\u5B9A\u5220\u9664\u5BB9\u5668 ${g.name}\uFF1F\u5BB9\u5668\u7684\u53EF\u5199\u5C42\u4E0E\u914D\u7F6E\u4F1A\u88AB\u5220\u9664\uFF08\u547D\u540D\u6570\u636E\u5377\u4FDD\u7559\uFF09\uFF0C\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002`:`\u786E\u5B9A\u5BF9\u5BB9\u5668 ${g.name} \u6267\u884C${n==="stop"?"\u505C\u6B62":n==="start"?"\u542F\u52A8":"\u91CD\u542F"}\u64CD\u4F5C\uFF1F`,confirmLabel:n==="remove"?"\u5220\u9664":"\u786E\u5B9A",run:()=>ct(async()=>{lt(w=>({...w,[g.id]:n}));try{let w=await K.action(r,n,g.id);Q(`${w.result.action} ${g.name}\uFF1A${w.result.message}`)}catch(w){throw kn(g.id),w}},async()=>{try{await B()}finally{kn(g.id)}})})},fa=n=>{let g=Pt(n);X({title:"\u5220\u9664\u955C\u50CF",text:"\u786E\u5B9A\u5220\u9664\u955C\u50CF "+g+"\uFF1F\u955C\u50CF\u88AB\u5BB9\u5668\u6216\u5B50\u955C\u50CF\u5F15\u7528\u65F6\u4F1A\u5931\u8D25\uFF1B\u5220\u9664\u540E\u9700\u8981\u91CD\u65B0\u62C9\u53D6\u6216\u6784\u5EFA\u624D\u80FD\u6062\u590D\uFF0C\u4E14\u4E0D\u53EF\u64A4\u9500\u3002",confirmLabel:"\u5220\u9664",run:()=>ct(async()=>{let w=await K.imageRemove(r,g);Q("\u5DF2\u5220\u9664 "+g+"\uFF1A"+w.result.message),N!==null&&Pt(N)===g&&R(null),await M()})})},va=()=>{X({title:"\u6E05\u7406 dangling \u955C\u50CF",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u65E0\u6807\u7B7E\uFF08<none>:<none>\uFF09\u7684\u955C\u50CF\u5C42\uFF0C\u91CA\u653E\u78C1\u76D8\u7A7A\u95F4\uFF1B\u4E0D\u4F1A\u5220\u9664\u6709 tag \u7684\u955C\u50CF\u3002",confirmLabel:"\u6E05\u7406",run:()=>ct(async()=>{let n=await K.imagePrune(r),g=String(n.result.message).trim().split(`
`).filter(w=>w!=="");Q("\u5DF2\u6E05\u7406 dangling \u955C\u50CF\uFF1A"+(g.length===0?"ok":g[g.length-1])),await M()})})},ba=()=>{X({title:"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u7F51\u7EDC",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u6CA1\u6709\u5BB9\u5668\u63A5\u5165\u7684\u7F51\u7EDC\u3002compose \u521B\u5EFA\u7684\u9879\u76EE\u7F51\u7EDC\u4E5F\u5728\u5176\u4E2D\uFF08\u4E0B\u6B21 up \u4F1A\u91CD\u5EFA\uFF09\uFF0C\u4F46\u6B63\u5728\u8DD1\u7684\u9879\u76EE\u4F1A\u77ED\u6682\u5931\u53BB\u7F51\u7EDC\u3002",confirmLabel:"\u6E05\u7406",run:()=>ct(async()=>{let n=await K.networkPrune(r),g=String(n.result.message).trim().split(`
`).filter(w=>w!=="");Q("\u5DF2\u6E05\u7406\u672A\u4F7F\u7528\u7F51\u7EDC\uFF1A"+(g.length===0?"ok":g[g.length-1])),await $()})})},_a=()=>{X({title:"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u5377",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u6CA1\u6709\u88AB\u5BB9\u5668\u4F7F\u7528\u7684\u5377\u2014\u2014\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u5220\u9664\u4E14\u4E0D\u53EF\u6062\u590D\u3002docker \u2265 23 \u53EA\u5220\u533F\u540D\u5377\uFF08\u4E0D\u5E26 --all\uFF09\uFF0C\u66F4\u8001\u7684\u7248\u672C\u4F1A\u8FDE\u547D\u540D\u5377\u4E00\u8D77\u5220\uFF1B\u6267\u884C\u524D\u8BF7\u786E\u8BA4\u6CA1\u6709\u9700\u8981\u4FDD\u7559\u7684\u6570\u636E\u5377\u3002",confirmLabel:"\u6E05\u7406",run:()=>ct(async()=>{let n=await K.volumePrune(r),g=String(n.result.message).trim().split(`
`).filter(w=>w!=="");Q("\u5DF2\u6E05\u7406\u672A\u4F7F\u7528\u5377\uFF1A"+(g.length===0?"ok":g[g.length-1])),await be()})})},gn=(n,g)=>w=>{n(),Q(w),g()},Nt=Ee===null?null:C.find(n=>n.id===Ee.id)??Ee.item,ut=C.filter(n=>{if(fe==="running"&&!(n.state==="running"||n.state==="paused"||n.state==="restarting")||fe==="stopped"&&n.state==="running"||fe==="unhealthy"&&n.health!=="unhealthy")return!1;let g=me.trim().toLowerCase();return g===""?!0:n.name.toLowerCase().includes(g)||n.image.toLowerCase().includes(g)||n.id.toLowerCase().includes(g)}),Vt=P.filter(n=>{let g=_t.trim().toLowerCase();return g===""||n.reference.toLowerCase().includes(g)||n.id.toLowerCase().includes(g)}),Jt=W.filter(n=>{let g=it.trim().toLowerCase();return g===""||n.name.toLowerCase().includes(g)||n.driver.toLowerCase().includes(g)||n.id.toLowerCase().includes(g)}),Gt=f.filter(n=>{let g=We.trim().toLowerCase();return g===""||n.name.toLowerCase().includes(g)||n.driver.toLowerCase().includes(g)||n.mountpoint.toLowerCase().includes(g)}),Ie=n=>{let g=s.find(w=>w.name===n);return g===void 0||g.label===void 0?n:n+" \xB7 "+g.label},kt=()=>Ge?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):r===""?v?o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u4E0D\u662F Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u6309\u4E0A\u9762\u7684\u63D0\u793A\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761\u76EE\u6807\uFF08\u63A8\u8350\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u3002\u4E3A\u907F\u514D\u5F20\u51A0\u674E\u6234\uFF0C\u9762\u677F\u4E0D\u4F1A\u81EA\u52A8\u5207\u5230\u5176\u4ED6\u76EE\u6807\u3002"})]}):o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD8\u6CA1\u6709\u914D\u7F6E Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u4E2A\u76EE\u6807\uFF1A\u672C\u673A\u76F4\u63A5\u9009\u300C\u672C\u673A\u300D\uFF1B\u8FDC\u7A0B\u4E3B\u673A\u53EF\u4EE5\u5F15\u7528 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\u3002"})]}):o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:d==="images"?"\u6CA1\u6709\u955C\u50CF":d==="compose"?"\u6CA1\u6709 Compose \u9879\u76EE":d==="networks"?"\u6CA1\u6709\u7F51\u7EDC":d==="volumes"?"\u6CA1\u6709\u5377":"\u6CA1\u6709\u5BB9\u5668"}),e("div",{className:"dk_emptyHint",children:me.trim()===""?"\u76EE\u6807\u4E0A\u6CA1\u6709\u5339\u914D\u7684\u6570\u636E\uFF0C\u6216\u7B5B\u9009\u6761\u4EF6\u8FC7\u7A84\u3002":"\u6CA1\u6709\u5339\u914D\u300C"+me.trim()+"\u300D\u7684\u7ED3\u679C\u3002"})]}),ya=()=>{if(d==="images")return o("div",{className:"dk_imagesView",children:[Vt.length===0?kt():e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u955C\u50CF"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"ID"}),e("th",{className:"dk_colActions",children:"\u64CD\u4F5C"})]})}),e("tbody",{children:Vt.map(n=>o("tr",{children:[e("td",{className:"dk_mono",title:n.reference,children:n.dangling?"<none>\uFF08dangling\uFF09":n.reference}),e("td",{children:n.sizeText===""?n.size===null?"\u2014":It(n.size):n.sizeText}),e("td",{children:n.createdSince}),e("td",{className:"dk_mono",children:n.shortId}),e("td",{className:"dk_colActions",children:o("div",{className:"dk_rowActions",children:[e(V,{icon:za,title:"\u67E5\u770B\u955C\u50CF\u8BE6\u60C5\uFF08\u5C42 / \u6784\u5EFA\u5386\u53F2\uFF09",onClick:()=>R(n)},"inspect"),e(V,{icon:Mt,danger:!0,disabled:a?.allowMutations!==!0,title:a?.allowMutations===!0?"\u5220\u9664\u955C\u50CF\uFF08\u4E0D\u53EF\u6062\u590D\uFF09":"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>fa(n)},"remove")]})},"actions")]},n.id+n.reference))})]})})]});if(d==="compose"){let n=jt(ut);return n.length===0?kt():e(Xn,{groups:n,onOpen:g=>z({project:g})})}return d==="networks"?o("div",{className:"dk_imagesView",children:[Jt.length===0?kt():e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u540D\u79F0"}),e("th",{children:"\u9A71\u52A8"}),e("th",{children:"\u8303\u56F4"}),e("th",{children:"\u5C5E\u6027"}),e("th",{children:"ID"})]})}),e("tbody",{children:Jt.map(n=>o("tr",{className:"dk_rowClickable",onClick:()=>F(n),title:"\u67E5\u770B\u7F51\u7EDC\u8BE6\u60C5",children:[e("td",{className:"dk_mono",title:n.name,children:n.name}),e("td",{children:n.driver===""?"\u2014":n.driver}),e("td",{children:n.scope===""?"\u2014":n.scope}),e("td",{children:n.internal?e("span",{className:"dk_badge","data-state":"paused",children:"internal"}):"\u2014"}),e("td",{className:"dk_mono",title:n.id,children:n.shortId})]},n.id+n.name))})]})})]}):d==="volumes"?o("div",{className:"dk_imagesView",children:[Gt.length===0?kt():e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u540D\u79F0"}),e("th",{children:"\u9A71\u52A8"}),e("th",{children:"\u8303\u56F4"}),e("th",{children:"\u6302\u8F7D\u70B9"})]})}),e("tbody",{children:Gt.map(n=>o("tr",{className:"dk_rowClickable",onClick:()=>u(n),title:"\u67E5\u770B\u5377\u8BE6\u60C5",children:[e("td",{className:"dk_mono",title:n.name,children:n.name}),e("td",{children:n.driver===""?"\u2014":n.driver}),e("td",{children:n.scope===""?"\u2014":n.scope}),e("td",{className:"dk_mono dk_pathCell",title:n.mountpoint,children:n.mountpoint===""?"\u2014":n.mountpoint})]},n.name))})]})})]}):ut.length===0?kt():e("div",{className:"dk_grid",children:ut.map(n=>e(An,{item:n,selected:Ee!==null&&n.id===Ee.id,allowMutations:a?.allowMutations===!0,pickMode:T,picked:ie.includes(n.id),pending:bt[n.id],onTogglePick:ga,onOpen:(g,w)=>je({id:g.id,tab:w,item:g}),onExec:pa,onAction:ma,onCopyExec:g=>{navigator.clipboard.writeText("docker exec -it "+g.name+" sh").then(()=>Q("\u5DF2\u590D\u5236\uFF1Adocker exec -it "+g.name+" sh")).catch(()=>Q("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236"))}},n.id))})},he=t.docked===!0,xa=a??{pollIntervalSec:5,logTailDefault:200,allowExec:!1,allowMutations:!1,execTimeoutSec:30},Kt=Cn(C,ie),wa=wn(Kt.length),Na=x===null?[]:jt(C).find(n=>n.project===x.project)?.items??[],hn=Nt!==null?e(Gn,{item:Nt,target:r,targetLabel:Ie(r),config:xa,initialTab:Ee.tab,refreshToken:ft,onBack:()=>je(null),onRefresh:ua,onClose:O,docked:he},"detail"):N!==null?e(Kn,{item:P.find(n=>n.id===N.id)??N,target:r,targetLabel:Ie(r),onBack:()=>R(null),onClose:O,docked:he},"imageDetail"):Z?e(qn,{target:r,targetLabel:Ie(r),allowMutations:a?.allowMutations===!0,onBack:()=>A(!1),onDone:M,onClose:O,docked:he},"pull"):x!==null?e(Zn,{project:x.project,items:Na,target:r,targetLabel:Ie(r),onBack:()=>z(null),onClose:O,docked:he},"composeDetail"):Se?e(na,{items:Kt,target:r,targetLabel:Ie(r),onBack:Ae,onClose:O,docked:he},"aggregate"):_!==null?e(Un,{item:_,target:r,targetLabel:Ie(r),allowMutations:a?.allowMutations===!0,onBack:()=>F(null),onRemoved:gn(()=>F(null),$),onClose:O,docked:he},"networkDetail"):c!==null?e(Wn,{item:c,target:r,targetLabel:Ie(r),allowMutations:a?.allowMutations===!0,onBack:()=>u(null),onRemoved:gn(()=>u(null),be),onClose:O,docked:he},"volumeDetail"):null,Sa=[hn!==null?[hn,de===null?null:e($e,{title:de.title,text:de.text,confirmLabel:de.confirmLabel,busy:ot,onCancel:()=>X(null),onConfirm:de.run},"confirm")]:[he?null:o("div",{className:"dk_header",children:[e("span",{className:"dk_titleIcon",dangerouslySetInnerHTML:{__html:bn}}),e("span",{className:"dk_title",children:"Docker \u5BB9\u5668"}),a?.allowMutations===!0?null:e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"}),e("span",{className:"dk_headerSpacer"}),Nt!==null?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":Ge?"1":void 0,onClick:st,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:ze}})}),e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:O,children:e("span",{dangerouslySetInnerHTML:{__html:ye}})})]}),Nt!==null?null:o("div",{className:"dk_toolbar",children:[e("select",{className:"dk_select",value:r,onChange:n=>{h(n.target.value),je(null),Ae(),lt({}),t.onTargetChange?.(Ie(n.target.value))},children:[...r===""?[e("option",{value:"",children:"\uFF08\u672A\u9009\u62E9\u76EE\u6807\uFF09"},"__none")]:[],...(s.length===0&&r!==""?[{name:r,label:void 0}]:s).map(n=>e("option",{value:n.name,children:Ie(n.name)},n.name))]}),e("div",{className:"dk_seg",children:[["containers","\u5BB9\u5668"],["images","\u955C\u50CF"],["compose","Compose"],["networks","\u7F51\u7EDC"],["volumes","\u5377"]].map(([n,g])=>e("button",{type:"button",className:"dk_segBtn","data-on":d===n?"1":"0",onClick:()=>{S(n),je(null),R(null),z(null),F(null),u(null),A(!1),Ae()},children:g},n))}),d==="containers"?e("button",{type:"button",className:"dk_pill dk_pillPick","data-on":T?"1":"0",title:T?"\u9000\u51FA\u9009\u62E9\u5E76\u6E05\u7A7A\u52FE\u9009\uFF08Esc\uFF09":"\u591A\u9009\u5BB9\u5668\uFF0C\u628A\u5B83\u4EEC\u7684\u65E5\u5FD7\u4E34\u65F6\u805A\u5408\u6210\u4E00\u6761\u6D41",onClick:ka,children:T?"\u9000\u51FA\u9009\u62E9":"\u805A\u5408\u9009\u62E9"}):null,d==="containers"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u540D\u79F0 / \u955C\u50CF / ID",value:me,onChange:n=>Ce(n.target.value)}):null,d==="compose"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u9879\u76EE / \u670D\u52A1 / \u5BB9\u5668",value:me,onChange:n=>Ce(n.target.value)}):null,d==="images"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u955C\u50CF\uFF08\u4ED3\u5E93 / \u6807\u7B7E / ID\uFF09",value:_t,onChange:n=>Ht(n.target.value)}):null,d==="images"?e("span",{className:"dk_hint dk_searchCount",children:String(Vt.length)+" / "+String(P.length)+" \u4E2A\u955C\u50CF"}):null,d==="images"?e(V,{icon:Ha,disabled:a?.allowMutations!==!0,title:a?.allowMutations===!0?"\u62C9\u53D6\u955C\u50CF\uFF08docker pull\uFF0C\u9010\u5C42\u5B9E\u65F6\u8FDB\u5EA6\uFF09":"\u62C9\u53D6\u955C\u50CF\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>A(!0)},"pull"):null,d==="images"?e(V,{icon:$t,danger:!0,disabled:a?.allowMutations!==!0,title:a?.allowMutations===!0?"\u6E05\u7406 dangling\uFF08\u65E0\u6807\u7B7E\uFF09\u955C\u50CF":"\u6E05\u7406 dangling \u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:va},"prune"):null,d==="networks"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u7F51\u7EDC\uFF08\u540D\u79F0 / \u9A71\u52A8 / ID\uFF09",value:it,onChange:n=>zt(n.target.value)}):null,d==="volumes"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u5377\uFF08\u540D\u79F0 / \u9A71\u52A8 / \u6302\u8F7D\u70B9\uFF09",value:We,onChange:n=>Ye(n.target.value)}):null,d==="networks"?e("span",{className:"dk_hint dk_searchCount",children:String(Jt.length)+" / "+String(W.length)+" \u4E2A\u7F51\u7EDC"}):null,d==="volumes"?e("span",{className:"dk_hint dk_searchCount",children:String(Gt.length)+" / "+String(f.length)+" \u4E2A\u5377"}):null,d==="networks"?e(V,{icon:$t,danger:!0,disabled:a?.allowMutations!==!0,title:a?.allowMutations===!0?"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u7F51\u7EDC\uFF08docker network prune\uFF09":"\u6E05\u7406\u7F51\u7EDC\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:ba},"prune"):null,d==="volumes"?e(V,{icon:$t,danger:!0,disabled:a?.allowMutations!==!0,title:a?.allowMutations===!0?"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u5377\uFF08docker volume prune\uFF0C\u4F1A\u5220\u6570\u636E\uFF09":"\u6E05\u7406\u5377\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:_a},"prune"):null,d==="compose"?e("span",{className:"dk_hint dk_searchCount",children:String(jt(ut).length)+" \u4E2A\u9879\u76EE \xB7 "+String(ut.length)+" \u4E2A\u5BB9\u5668"}):null,d==="containers"?e("div",{className:"dk_seg",children:[["all","\u5168\u90E8"],["running","\u8FD0\u884C\u4E2D"],["stopped","\u5DF2\u505C\u6B62"],["unhealthy","\u4E0D\u5065\u5EB7"]].map(([n,g])=>e("button",{type:"button",className:"dk_segBtn","data-on":fe===n?"1":"0",onClick:()=>Pe(n),children:g},n))}):null,d==="containers"||d==="compose"?e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:ne,onChange:n=>pt(n.target.checked)}),"\u542B\u5DF2\u505C\u6B62"]}):null,d==="containers"||d==="compose"?e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:Le,onChange:n=>Ue(n.target.checked)}),"\u81EA\u52A8\u5237\u65B0"]}):null,he?o("div",{className:"dk_toolbarEnd",children:[a?.allowMutations!==!0?e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"},"readonly"):null,e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":Ge?"1":void 0,onClick:st,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:ze}})},"refresh")]}):null]}),d==="containers"&&T?e(ta,{count:Kt.length,info:wa,onRun:()=>tt(!0),onCancel:Ae},"pickBar"):null,o("div",{className:"dk_body",children:[o("div",{className:"dk_main"+(d==="images"||d==="networks"||d==="volumes"?" dk_mainImages":""),children:[Ke===""?null:e(J,{title:"\u64CD\u4F5C\u5931\u8D25",hint:Ke}),Oe===""?null:e(J,{kind:"info",title:Oe}),t.sessionHint===void 0?null:e(J,{kind:"info",title:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u6CA1\u914D\u7F6E\u4E3A Docker \u76EE\u6807",hint:"\u4F1A\u8BDD\u4E3B\u673A\uFF1A"+t.sessionHint.host+(t.sessionHint.port===22?"":":"+String(t.sessionHint.port))+(t.sessionHint.book===""?"":"\uFF08\u8FDE\u63A5\u7C3F\uFF1A"+t.sessionHint.book+"\uFF09")+" \u2014 \u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761 kind=ssh \u76EE\u6807"+(t.sessionHint.book===""?"\uFF08\u586B host/username\uFF0C\u6216\u7528\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09":"\uFF0C\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\u300C"+t.sessionHint.book+"\u300D")+"\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u5373\u53EF\u3002"}),a!==null&&a.allowMutations!==!0?e(J,{kind:"info",title:"\u5F53\u524D\u4E3A\u53EA\u8BFB\u6A21\u5F0F",hint:"\u5BB9\u5668\u7684\u542F\u52A8 / \u505C\u6B62 / \u91CD\u542F / \u5220\u9664\uFF0C\u4EE5\u53CA\u955C\u50CF\u3001\u7F51\u7EDC\u3001\u5377\u7684\u5220\u9664\u4E0E\u6E05\u7406\uFF0C\u90FD\u9700\u8981\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u3002"}):null,d==="containers"?e(ea,{events:mt,status:ge,statusText:ha(),open:Be,onToggle:()=>nt(n=>!n)},"activity"):null,ya()]})]}),de===null?null:e($e,{title:de.title,text:de.text,confirmLabel:de.confirmLabel,busy:ot,onCancel:()=>X(null),onConfirm:de.run})],xe===null?null:e(aa,{label:xe.label,hostRef:yt,collapsed:Ft,height:b,onToggleCollapse:()=>xt(n=>!n),onResizeStart:se,onClose:()=>dt(null)},"execDrawer"),y&&xe!==null?e($e,{title:"\u7ED3\u675F\u5BB9\u5668\u7EC8\u7AEF\u4F1A\u8BDD",text:"\u5173\u95ED\u9762\u677F\u4F1A\u7ED3\u675F\u300C"+xe.label+"\u300D\u7684\u7EC8\u7AEF\u4F1A\u8BDD\uFF08docker exec -it \u2026\uFF09\u3002\u82E5\u53EA\u662F\u60F3\u7ED9\u65E5\u5FD7 / \u5217\u8868\u817E\u5730\u65B9\uFF0C\u5148\u70B9\u62BD\u5C49\u53F3\u4E0A\u89D2\u7684\u6298\u53E0\u6309\u94AE\u5373\u53EF\uFF0C\u4F1A\u8BDD\u4F1A\u4FDD\u6301\u8FD0\u884C\u3002",confirmLabel:"\u7ED3\u675F\u5E76\u5173\u95ED",onCancel:()=>H(!1),onConfirm:()=>{H(!1),t.onClose()}},"closeConfirm"):null],pn=o("div",{className:"dk_panel"+(he?" dk_panelDock":""),"data-dock":he?"1":void 0,ref:ee,onMouseDown:n=>n.stopPropagation(),children:Sa});return he?pn:o("div",{className:"dk_backdrop",onMouseDown:n=>{we.current=n.target===n.currentTarget},onMouseUp:n=>{let g=we.current&&n.target===n.currentTarget;we.current=!1,g&&O()},children:[pn]})}function ra(){let[t,a]=k(!1),[l,s]=k(null),[m,r]=k(!1),[h,v]=k(!1),[d,S]=k({kind:"",text:""}),C=G(0),E=ue(()=>{K.config().then(c=>{s(c.config),Wt(c.config),C.current=Array.isArray(c.config?.targets)?c.config.targets.length:0,r(!0)}).catch(c=>{S({kind:"error",text:"\u8BFB\u53D6\u914D\u7F6E\u5931\u8D25\uFF1A"+c.message}),r(!0)})},[]);D(()=>{t&&!m&&E()},[t,m,E]);let P=c=>s(u=>({...u,...c})),I=(c,u)=>s(x=>{let z=x.targets.slice();return z[c]={...z[c],...u},{...x,targets:z}}),W=()=>s(c=>({...c,targets:[...c.targets,{name:"\u76EE\u6807"+String(c.targets.length+1),kind:"local",book:"",host:"",port:22,username:"",auth:"agent",keyPath:"",agentForward:!1,passwordSet:!1,passphraseSet:!1}]})),U=c=>s(u=>({...u,targets:u.targets.filter((x,z)=>z!==c)})),f=c=>s(u=>({...u,hostKeys:u.hostKeys.filter(x=>!(x.host===c.host&&x.port===c.port))})),j=()=>{v(!0),S({kind:"",text:""});let c={enabled:l.enabled,announceToAgent:l.announceToAgent,dockerBin:l.dockerBin,allowMutations:l.allowMutations,allowExec:l.allowExec,execTimeoutSec:l.execTimeoutSec,pollIntervalSec:l.pollIntervalSec,logTailDefault:l.logTailDefault,maxOutputKb:l.maxOutputKb,targets:l.targets.map(u=>({name:u.name,kind:u.kind,book:u.book??"",host:u.host??"",port:Number(u.port)||22,username:u.username??"",auth:u.auth??"agent",keyPath:u.keyPath??"",...u.password===void 0||u.password===""?{}:{password:u.password},...u.passphrase===void 0||u.passphrase===""?{}:{passphrase:u.passphrase},agentForward:u.agentForward===!0})),hostKeys:l.hostKeys,...l.targets.length===0&&C.current>0?{clearTargets:!0}:{}};K.saveConfig(c).then(u=>{s(u.config),Wt(u.config),C.current=Array.isArray(u.config?.targets)?u.config.targets.length:0,Bt(),S(u.warning===void 0?{kind:"ok",text:"\u5DF2\u4FDD\u5B58\u5E76\u70ED\u751F\u6548"}:{kind:"error",text:u.warning})}).catch(u=>{S({kind:"error",text:"\u4FDD\u5B58\u5931\u8D25\uFF1A"+u.message})}).finally(()=>v(!1))},N=c=>e("div",{className:"dk_cardSection",children:c}),R=(c,u,x,z)=>o("div",{className:"dk_field","data-span":z===void 0?void 0:String(z),children:[e("span",{className:"dk_label",children:c}),u,x===void 0?null:e("span",{className:"dk_hint",children:x})]}),_=(c,u,x,z)=>e("input",{className:"dk_input",type:"number",min:u,max:x,value:l[c],onChange:Z=>P({[c]:Number(Z.target.value)})}),F=c=>o("li",{className:"dk_settingsCard"+(t?" dk_settingsCardOpen":""),children:[o("button",{type:"button",className:"dk_settingsHead","aria-expanded":t,onClick:()=>a(u=>!u),children:[o("span",{className:"dk_settingsHeadText",children:[e("span",{className:"dk_settingsName",children:"Docker \u5BB9\u5668\u9762\u677F"}),e("span",{className:"dk_settingsDesc",children:"\u672C\u673A / SSH \u4E3B\u673A\u4E0A\u7684\u5BB9\u5668\u4E0E\u955C\u50CF\uFF1B\u9ED8\u8BA4\u53EA\u8BFB\uFF0C\u53D8\u66F4\u64CD\u4F5C\u9700\u663E\u5F0F\u5F00\u542F"})]}),e("span",{className:"dshkit_badge",children:"Kit"}),e("span",{className:"dk_settingsChevron",dangerouslySetInnerHTML:{__html:Yt}})]}),t?e("div",{className:"dk_settingsBody",children:c}):null]});return F(t?!m||l===null?o("div",{className:"dk_row",children:[e("span",{className:"dk_spin"}),"\u8BFB\u53D6\u914D\u7F6E\u2026"]}):[N("\u57FA\u672C"),o("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:l.enabled,onChange:c=>P({enabled:c.target.checked})}),"\u542F\u7528\u63D2\u4EF6"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:l.announceToAgent,onChange:c=>P({announceToAgent:c.target.checked})}),"\u5411 agent \u516C\u544A\u80FD\u529B"]})]}),o("div",{className:"dk_fieldGrid",children:[R("docker CLI",e("input",{className:"dk_input",value:l.dockerBin,onChange:c=>P({dockerBin:c.target.value})}),"\u9ED8\u8BA4 docker\uFF1Bpodman \u53EF\u586B podman"),R("\u7EDF\u8BA1\u5237\u65B0\u95F4\u9694\uFF08\u79D2\uFF09",_("pollIntervalSec",1,60)),R("\u65E5\u5FD7\u9ED8\u8BA4\u884C\u6570",_("logTailDefault",1,5e3)),R("\u8F93\u51FA\u4E0A\u9650\uFF08KB\uFF09",_("maxOutputKb",1,8192)),R("exec \u8D85\u65F6\uFF08\u79D2\uFF09",_("execTimeoutSec",1,120))]}),N("\u80FD\u529B\u5F00\u5173\uFF08\u9ED8\u8BA4\u5173\u95ED\uFF09"),o("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:l.allowMutations,onChange:c=>P({allowMutations:c.target.checked})}),"\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\uFF08\u5BB9\u5668\u542F\u505C\u5220\u3001\u955C\u50CF\u62C9\u53D6 / \u5220\u9664 / \u6E05\u7406\uFF09"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:l.allowExec,onChange:c=>P({allowExec:c.target.checked})}),"\u5141\u8BB8 exec\uFF08\u5728\u5BB9\u5668\u5185\u6267\u884C\u547D\u4EE4\uFF09"]})]}),e("span",{className:"dk_hint",children:"docker socket \u7B49\u4EF7\u4E8E\u76EE\u6807\u4E3B\u673A\u7684 root \u6743\u9650\u3002\u5F00\u542F\u540E\uFF0C\u6D4F\u89C8\u5668\u9762\u677F\u4E0E agent \u90FD\u80FD\u6267\u884C\u5BF9\u5E94\u64CD\u4F5C\uFF0C\u8BF7\u53EA\u5728\u53EF\u4FE1\u73AF\u5883\u4E0B\u6253\u5F00\u3002"}),N("\u76EE\u6807"),...l.targets.map((c,u)=>o("div",{className:"dk_targetRow",children:[e("input",{className:"dk_input",value:c.name,placeholder:"\u76EE\u6807\u540D",onChange:x=>I(u,{name:x.target.value})}),e("select",{className:"dk_select",value:c.kind,onChange:x=>I(u,{kind:x.target.value}),children:[e("option",{value:"local",children:"\u672C\u673A"}),e("option",{value:"ssh",children:"SSH \u4E3B\u673A"})]}),c.kind==="local"?e("span",{className:"dk_hint",children:"\u5BBF\u4E3B\u6240\u5728\u673A\u5668\u4E0A\u7684 docker"}):o("div",{className:"dk_row",style:{gridColumn:"span 1"},children:[e("select",{className:"dk_select",value:c.book??"",onChange:x=>I(u,{book:x.target.value}),children:[e("option",{value:"",children:l.ttyBooks.length===0?"\uFF08\u65E0 tty \u8FDE\u63A5\u7C3F\uFF0C\u8BF7\u586B\u5185\u8054\u4FE1\u606F\uFF09":"\uFF08\u4E0D\u7528\u8FDE\u63A5\u7C3F\uFF0C\u624B\u586B\uFF09"}),...l.ttyBooks.map(x=>e("option",{value:x,children:"\u8FDE\u63A5\u7C3F\uFF1A"+x},x))]})]}),e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:()=>U(u),children:"\u5220\u9664"}),c.kind==="ssh"&&(c.book??"")===""?o("div",{className:"dk_targetInline",children:[e("input",{className:"dk_input",placeholder:"host",value:c.host??"",onChange:x=>I(u,{host:x.target.value})}),e("input",{className:"dk_input",placeholder:"22",title:"\u7AEF\u53E3",value:c.port??22,onChange:x=>I(u,{port:Number(x.target.value)||22})}),e("input",{className:"dk_input",placeholder:"username",value:c.username??"",onChange:x=>I(u,{username:x.target.value})}),e("select",{className:"dk_select",value:c.auth??"agent",onChange:x=>I(u,{auth:x.target.value}),children:[e("option",{value:"agent",children:"ssh-agent"}),e("option",{value:"key",children:"\u79C1\u94A5"}),e("option",{value:"password",children:"\u5BC6\u7801"})]}),(c.auth??"agent")==="key"?e("input",{className:"dk_input dk_credential",placeholder:"~/.ssh/id_ed25519",value:c.keyPath??"",onChange:x=>I(u,{keyPath:x.target.value})}):null,(c.auth??"agent")==="password"?e("input",{className:"dk_input dk_credential",type:"password",placeholder:c.passwordSet===!0?"\uFF08\u5DF2\u8BBE\u7F6E\uFF0C\u7559\u7A7A\u4FDD\u6301\u4E0D\u53D8\uFF09":"env:SSH_PASSWORD",value:c.password??"",onChange:x=>I(u,{password:x.target.value})}):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:c.agentForward===!0,onChange:x=>I(u,{agentForward:x.target.checked})}),"agent forwarding"]})]}):null]},String(u)+c.name)),o("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn",onClick:W,children:"\u6DFB\u52A0\u76EE\u6807"}),e("span",{className:"dk_hint",children:"SSH \u76EE\u6807\u63A8\u8350\u76F4\u63A5\u9009 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF08\u51ED\u8BC1\u53EA\u9700\u7EF4\u62A4\u4E00\u5904\uFF09\uFF1B\u624B\u586B\u65F6\u5BC6\u7801 / \u53E3\u4EE4\u5EFA\u8BAE\u5199 env:VAR\u3002"})]}),N("SSH \u4E3B\u673A\u5BC6\u94A5\u8BB0\u5F55\uFF08TOFU\uFF09"),...l.hostKeys.length===0?[e("span",{className:"dk_hint",children:"\u6682\u65E0\u8BB0\u5F55 \u2014 \u9996\u6B21 SSH \u8FDE\u63A5\u6210\u529F\u540E\u81EA\u52A8\u8BB0\u5F55\u4E3B\u673A\u6307\u7EB9\uFF08\u82E5 tty \u5DF2\u8BB0\u5F55\u540C\u4E00\u4E3B\u673A\uFF0C\u4F1A\u76F4\u63A5\u590D\u7528\uFF09\u3002"},"none")]:l.hostKeys.map(c=>o("div",{className:"dk_targetRow",children:[e("span",{children:c.host+":"+String(c.port)}),e("span",{className:"dk_hint",style:{gridColumn:"span 2",wordBreak:"break-all"},children:"sha256:"+c.fingerprint}),e("button",{type:"button",className:"dk_btn",onClick:()=>f(c),children:"\u5220\u9664"})]},c.host+":"+String(c.port))),e("span",{className:"dk_hint",children:"\u6307\u7EB9\u53D8\u66F4\u65F6\u8FDE\u63A5\u4F1A\u88AB\u62D2\u7EDD\uFF08\u9632\u4E2D\u95F4\u4EBA\uFF09\uFF1B\u786E\u8BA4\u5B89\u5168\u540E\u5220\u9664\u5BF9\u5E94\u8BB0\u5F55\u5373\u53EF\u91CD\u8FDE\u3002"}),o("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:h,onClick:j,children:h?"\u4FDD\u5B58\u4E2D\u2026":"\u4FDD\u5B58"}),e("span",{className:"dk_msg","data-kind":d.kind,children:d.text})]})]:null)}let Ze=null,Je=null,At=null;function Qe(){let t=Je,a=Ze,l=At;if(Je=null,Ze=null,At=null,a!==null&&a.remove(),t!==null&&setTimeout(()=>{try{t.unmount()}catch{}},0),l!==null)try{l.dispose()}catch{}}function oa(t){return t!==null&&typeof t=="object"&&typeof t.appendChild=="function"}function la(){return typeof He?.mountPane=="function"&&typeof He.isOpen=="function"&&Number(He.version??0)>=1&&He.isOpen()===!0}function cn(t){Qe(),Ut();let a={onClose:Qe,initialTarget:t?.target??"",sessionHint:t?.sessionHint};if(la()){let l=null;try{l=He.mountPane({title:"Docker \u5BB9\u5668",hint:t?.target===void 0||t.target===""?"":t.target,size:520,min:360,onClose:()=>Qe()})}catch(s){l=null,console.warn("[dsh-docker] \u6302\u8F7D\u5230\u7EC8\u7AEF\u9762\u677F\u5931\u8D25\uFF0C\u56DE\u9000\u5F39\u7A97\uFF1A"+(s instanceof Error?s.message:String(s)))}if(l!==null&&oa(l.element)){At=l,Je=q(l.element),Je.render(e(sn,{...a,docked:!0,onTargetChange:s=>{try{l.setHint(s)}catch{}}}));return}}Ze=document.createElement("div"),document.body.appendChild(Ze),Je=q(Ze),Je.render(e(sn,a))}function ia(){let t=document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');if(t!==null)return t.querySelector('[class*="logoRow"]')?.parentElement??t.firstElementChild}function da(t){let a=t.querySelector('button[class*="newSession"]');if(a!==null)return a;for(let l of t.children)if(l.tagName==="BUTTON")return l}function sa(){let t=document.createElement("div");return t.dataset.dshDockerEntry="",t.className="dk_sidebarEntry",t.setAttribute("role","button"),t.setAttribute("aria-label","\u5BB9\u5668"),t.innerHTML='<span class="dk_entryIcon">'+bn+'</span><span class="dk_entryLabel">\u5BB9\u5668</span>',t.addEventListener("click",a=>{a.preventDefault(),cn()}),t}function un(t,a){let l=da(t);if(l===void 0)return!1;if(a.parentElement!==t){let s=l.closest('[class*="logoRow"]'),m=s!==null&&s.parentElement===t?s:l,r=Array.from(t.children).filter(h=>h instanceof HTMLElement&&h.matches("[data-dsh-global-search-entry], [data-dsh-rss-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-tty-entry], [data-dsh-docker-entry]"));if(r.length>0){let h=r[r.length-1];t.insertBefore(a,h.nextSibling)}else t.insertBefore(a,m.nextElementSibling)}return!0}function ca(){if(Ut(),document.querySelector("[data-dsh-docker-entry]")!==null)return()=>{};let t=sa(),a,l=!1,s=()=>{if(a!==void 0&&!a.isConnected&&(r.disconnect(),a=void 0,l=!1),l){if(document.body.contains(t))return;r.disconnect(),a=void 0,l=!1}a??(a=ia()),a!==void 0&&(l=un(a,t),l&&r.observe(a,{childList:!0,subtree:!0}))},m=new MutationObserver(()=>{s()});m.observe(document.body,{childList:!0,subtree:!0});let r=new MutationObserver(()=>{if(a===void 0||!a.isConnected){l=!1,s();return}a.contains(t)||(l=un(a,t))});return s(),()=>{m.disconnect(),r.disconnect(),t.remove()}}let et={};return et.inject=["slots"],et.__pick={MAX:Zt,SOFT_MAX:Pn,decide:wn,toggle:Nn,reconcile:Sn,items:Cn},et.__events={LIMIT:Ln,RECENT:Tn,DEBOUNCE_MS:En,append:In,actionText:Mn,timeText:On,debounce:Bn},et.apply=t=>{Ut();let a=!1,l=()=>{};Rt={set(r){if(r!==a){if(a=r,r){l=ca();return}l(),l=()=>{},Qe(),typeof Ot?.requestRender=="function"&&Ot.requestRender()}}},Rn(!0);let s=t.slots.inject("settings.plugin.item",()=>t.slots.register({name:"settings.plugin.item",key:"docker",order:102},ra));t.inject(["ttyTerminal"],r=>(Re=r.ttyTerminal??null,()=>{Re=null})),t.inject(["ttyPanel"],r=>(He=r.ttyPanel??null,()=>{He=null}));let m=()=>{};return Bt(),t.inject(["ttyConnbar"],r=>{let h=r.ttyConnbar;h!==void 0&&(Ot=h,m=h.addAction(v=>{if(!Dt)return;let d=v?.spec??{};if(d.t!=="ssh")return;let S=typeof v?.bookName=="string"?v.bookName:"",C=Xt(d,S),E=C!==void 0?`\u6253\u5F00\u8BE5\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F\uFF08\u76EE\u6807\uFF1A${C}\uFF09`:De===null?"\u6253\u5F00\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F":"\u8BE5\u4E3B\u673A\u5C1A\u672A\u914D\u7F6E\u4E3A Docker \u76EE\u6807 \u2014 \u70B9\u51FB\u6253\u5F00\u9762\u677F\u67E5\u770B/\u914D\u7F6E";v.addAction(Ma,"\u5BB9\u5668",E,()=>{(async()=>{let P=await Oa(d,S),I=Number(d.port);cn({target:P??"",sessionHint:P===void 0?{host:typeof d.host=="string"?d.host:"",port:Number.isInteger(I)&&I>0?I:22,book:S}:void 0})})()})}),(async()=>{for(let v=0;v<3;v+=1){if(await Bt()){typeof h.requestRender=="function"&&h.requestRender();return}await new Promise(d=>setTimeout(d,2e3))}})())}),()=>{m(),s(),Rt=null,Dt=!1,Ot=null,l(),Qe()}},et}});})();
