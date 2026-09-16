"use strict";(()=>{var Pr=`/* eslint-disable */
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
 * \u5D4C\u5165\u5F0F\u627F\u8F7D\uFF1A\u9762\u677F\u957F\u5728\u522B\u4EBA\u7684\u680F\u91CC\uFF0C\u6491\u6EE1\u5BBF\u4E3B\u5373\u53EF\u2014\u2014\u5916\u6846 / \u5706\u89D2 / \u9634\u5F71 / \u6700\u5C0F\u9AD8\u5EA6\u90FD\u662F
 * \u300C\u72EC\u7ACB\u5F39\u7A97\u300D\u7684\u88C5\u9970\uFF0C\u6302\u5728\u522B\u4EBA\u680F\u91CC\u8981\u5168\u53BB\u6389\u3002
 *   .dk_panelDock \u2014\u2014 tty \u9762\u677F\u7684\u53F3\u4FA7\u6302\u8F7D\u4F4D\uFF080.3.0\uFF09
 *   .dk_panelTab  \u2014\u2014 \u4F1A\u8BDD\u53F3\u4FA7\u680F\u7684\u6807\u7B7E\uFF08S1\uFF09
 */
.dk_panelDock,
.dk_panelTab {
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

/*
 * \u641C\u7D22\u6846\u662F\u5DE5\u5177\u6761\u91CC\u552F\u4E00\u53EF\u4F38\u7F29\u7684\u9879\uFF0C\u5B83\u7684 min-width \u51B3\u5B9A\u4E86\u300C\u653E\u4E0D\u4E0B\u65F6\u5148\u6324\u8C01\u300D\uFF1A\u7ED9\u5230 160px \u65F6
 * \u7A7A\u9699\u4E0D\u591F\uFF0C\u6D4F\u89C8\u5668\u5B81\u53EF\u628A\u672B\u5C3E\u90A3\u4E2A\u5F00\u5173\u5355\u72EC\u6362\u884C\uFF0C\u4E5F\u4E0D\u80AF\u628A\u641C\u7D22\u6846\u538B\u7A84\u4E00\u70B9\u2014\u2014\u5BBD\u9762\u677F\u91CC\u56E0\u6B64\u591A\u51FA
 * \u4E00\u884C\u53EA\u6709\u4E00\u4E2A\u590D\u9009\u6846\u3002120px \u8BA9\u5B83\u5148\u7626\u4E0B\u6765\u515C\u4F4F\u8FD9\u70B9\u5DEE\u8DDD\uFF08flex-grow \u4ECD\u662F 1\uFF1A\u7A7A\u95F4\u5BCC\u4F59\u65F6\u5B83\u7167\u65E7
 * \u586B\u6EE1\u6574\u884C\uFF0C\u89C6\u89C9\u5BBD\u5EA6\u4E0D\u53D8\uFF09\u3002
 */
.dk_search { flex: 1 1 120px; min-width: 120px; }

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

/*
 * \u5DE5\u5177\u6761\u672B\u5C3E\u7684\u4E24\u4E2A\u5F00\u5173\uFF08\u542B\u5DF2\u505C\u6B62 / \u81EA\u52A8\u5237\u65B0\uFF09\u6210\u7EC4\uFF1A\u5B83\u4EEC\u662F\u4E00\u4E2A\u300C\u5F00\u5173\u7C07\u300D\uFF0C\u5DE5\u5177\u6761\u5728\u5BBD\u9762\u677F\u91CC
 * \u6070\u597D\u5361\u5728\u653E\u5F97\u4E0B\u4E0E\u653E\u4E0D\u4E0B\u7684\u8FB9\u754C\u4E0A\u2014\u2014\u5206\u5F00\u6392\u65F6\u6700\u540E\u4E00\u4E2A\u4F1A\u88AB\u5355\u72EC\u6324\u5230\u7B2C\u4E8C\u884C\uFF08\u4E00\u884C\u53EA\u6709\u4E00\u4E2A\u590D\u9009
 * \u6846\uFF09\u3002\u6210\u7EC4\u540E\u6362\u884C\u4EE5\u7EC4\u4E3A\u5355\u4F4D\uFF0C\u6700\u574F\u60C5\u51B5\u4E5F\u662F\u4E00\u6574\u7EC4\u4E00\u8D77\u4E0B\u53BB\u3002
 */
.dk_toolbarToggles {
  display: inline-flex;
  align-items: center;
  gap: var(--dk-gap-md);
}

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
  /* \u8FC7\u6E21\u6D6E\u5C42\u4E0E\u9876\u90E8\u8FDB\u5EA6\u6761\u7684\u5B9A\u4F4D\u57FA\u51C6 */
  position: relative;
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
  /* \u5207\u76EE\u6807\u65F6\u6570\u636E\u6574\u6279\u6362\u6389\uFF1A\u6DE1\u5165 + \u8F7B\u5FAE\u4E0A\u79FB\uFF0C\u8BA9\u300C\u6362\u4E86\u4E00\u6279\u5185\u5BB9\u300D\u770B\u5F97\u89C1 */
  animation: dk_dataIn .2s var(--dk-ease) both;
}

/*
 * \u300C\u6B63\u5728\u5207\u76EE\u6807\u300D\uFF1A\u6B63\u6587\u538B\u6697 + \u9501\u4F4F\u6307\u9488\uFF08pointer-events: none \u53EA\u6321\u5185\u5BB9\uFF0C\u5916\u5C42 .dk_main
 * \u4ECD\u53EF\u6EDA\u52A8\uFF09\u3002\u4FDD\u7559\u53EF\u8BFB\u662F\u523B\u610F\u7684\u2014\u2014\u6BD4\u8D77\u767D\u5C4F\uFF0C\u7528\u6237\u66F4\u5E0C\u671B\u8FD8\u80FD\u770B\u7740\u521A\u624D\u90A3\u6279\u5361\u7247\uFF0C
 * \u53EA\u662F\u77E5\u9053\u300C\u8FD9\u4E0D\u662F\u65B0\u76EE\u6807\u7684\u300D\u3001\u6B64\u65F6\u70B9\u4E0D\u52A8\u3002
 */
/*
 * \u300C\u6B63\u5728\u5207\u76EE\u6807\u300D\u7684\u65E7\u6570\u636E\uFF1A82% + \u8F7B\u5EA6\u53BB\u8272\uFF0C\u800C\u4E0D\u662F 42% \u7EAF\u538B\u6697\u3002
 * \u8BED\u4E49\u5DEE\u522B\u2014\u201442% \u8BFB\u4F5C\u300C\u574F\u4E86 / \u88AB\u7981\u7528\u300D\uFF0C82% + \u53BB\u8272\u8BFB\u4F5C\u300C\u8FD9\u662F\u53E6\u4E00\u6279\u5185\u5BB9\u300D\uFF0C
 * \u4E0E\u300C\u6B63\u5728\u6362\u4E00\u6279\u6570\u636E\u300D\u662F\u4E00\u56DE\u4E8B\uFF1B\u53EF\u8BFB\u6027\u4E5F\u4FDD\u4F4F\uFF08\u8FD8\u8981\u80FD\u770B\u6E05\u5BB9\u5668\u540D\uFF09\u3002
 * pointer-events: none \u662F\u5B89\u5168\u5E95\u7EBF\uFF1A\u4E0D\u52A0\u9501\u65F6\u70B9\u300C\u505C\u6B62\u300D\u4F1A\u62FF\u65B0\u76EE\u6807\u5F53\u76EE\u6807\u3001
 * \u7528\u65E7\u5217\u8868\u7684\u5BB9\u5668 ID \u53D1\u547D\u4EE4\u3002
 */
.dk_body[data-stale="1"] .dk_main {
  opacity: .82;
  filter: saturate(.55);
  pointer-events: none;
  user-select: none;
}

.dk_body .dk_main {
  transition: opacity var(--dk-dur) var(--dk-ease), filter var(--dk-dur) var(--dk-ease);
}

/*
 * \u6B63\u6587\u9876\u90E8\u7684\u8FC7\u6E21\u5C42\uFF1A\u4E00\u6761 2px \u6D41\u5149\u8FDB\u5EA6\u6761\uFF08::before\uFF09+ \u4E00\u679A\u5C45\u4E2D\u7684\u84DD\u8272\u72B6\u6001\u80F6\u56CA\u3002
 * \u7EDD\u5BF9\u5B9A\u4F4D \u2192 \u4E0D\u5360\u6587\u6863\u6D41\uFF0C\u5207\u6362\u65F6\u9996\u5361\u4F4D\u7F6E\u4E0E\u6EDA\u52A8\u9AD8\u5EA6\u90FD\u4E0D\u53D8\uFF1B\u81EA\u8EAB\u4E0D\u5403\u6307\u9488\u4E8B\u4EF6\uFF08\u4E0D\u6321\u6EDA\u52A8\uFF09\u3002
 */
.dk_switchOverlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 4;
  display: flex;
  justify-content: center;
  padding-top: var(--dk-gap-sm);
  pointer-events: none;
}

/* \u9876\u90E8 2px \u4E0D\u5B9A\u957F\u8FDB\u5EA6\u6761\uFF1A\u9762\u677F\u7EA7\u300C\u6B63\u5728\u53D6\u6570\u300D\u4FE1\u53F7 */
.dk_switchOverlay::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background-image: linear-gradient(90deg, transparent, var(--dk-accent), transparent);
  background-size: 35% 100%;
  background-repeat: no-repeat;
  animation: dk_indeterminate 1.15s linear infinite;
}

/* \u72B6\u6001\u80F6\u56CA\uFF1A\u84DD\u8272\uFF08\u5F3A\u8C03\u8272\uFF09\u8868\u8FBE\u300C\u8FDB\u884C\u4E2D\u300D\uFF0C\u5E95\u8272\u662F\u5F3A\u8C03\u8272\u63BA\u5165\u5F53\u524D\u8868\u9762 */
.dk_switchPill {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  flex: none;
  min-width: 0;
  max-width: min(400px, 38vw);
  padding: 4px var(--dk-gap-lg);
  border: 1px solid color-mix(in srgb, var(--dk-accent) 42%, transparent);
  border-radius: var(--dk-r-pill);
  background: color-mix(in srgb, var(--dk-accent) 12%, var(--dk-surface-solid));
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 10px rgba(0, 0, 0, .10);
  font-size: 12px;
  color: var(--dk-accent);
}

.dk_switchText {
  display: flex;
  align-items: baseline;
  gap: var(--dk-gap-sm);
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dk_switchText strong { color: var(--dk-accent); font-weight: 600; }
/* \u300C\xB7\u300D\u4E0E\u300C\u5F53\u524D\u663E\u793A\uFF1A\u300D\u7A0D\u5FAE\u538B\u6DE1\u4E00\u70B9\uFF0C\u4E0E\u4E24\u4E2A\u76EE\u6807\u540D\u533A\u5206\u5C42\u6B21\uFF08\u4ECD\u5728\u84DD\u8272\u7CFB\u5185\uFF09 */
.dk_switchDot,
.dk_switchSub { color: color-mix(in srgb, var(--dk-accent) 72%, var(--dk-label-2)); }
.dk_switchName { color: var(--dk-accent); }
.dk_spinSm { width: 10px; height: 10px; color: var(--dk-accent); }

/* \u8FDB\u5165\uFF1A8px \u4E0A\u6ED1 + \u6DE1\u5165\uFF0C\u8BA9\u300C\u6362\u4E86\u4E00\u6279\u5185\u5BB9\u300D\u6709\u65B9\u5411\u611F\uFF08\u4E0D\u662F\u95EA\u4E00\u4E0B\uFF09 */
@keyframes dk_dataIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

@keyframes dk_indeterminate {
  from { background-position: -40% 0; }
  to { background-position: 140% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .dk_grid { animation: none; }
  .dk_switchOverlay::before { animation: none; background-position: 50% 0; }
  .dk_body .dk_main { transition: none; }
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

/* \u9700\u5173\u6CE8\u539F\u56E0\u5FBD\u6807\uFF08\u603B\u89C8\u5F02\u5E38\u8868\uFF09 */
.dk_reasons { display: inline-flex; flex-wrap: wrap; gap: 4px; }

.dk_reason {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: var(--dk-r-xs);
  background: var(--dk-surface-3);
  color: var(--dk-label-2);
  font-size: 11px;
  white-space: nowrap;
}

.dk_reason[data-reason="oom"] { background: color-mix(in srgb, var(--dk-danger) 18%, transparent); color: var(--dk-danger); }
.dk_reason[data-reason="dead"] { background: color-mix(in srgb, var(--dk-danger) 14%, transparent); color: var(--dk-danger); }
.dk_reason[data-reason="unhealthy"] { background: color-mix(in srgb, var(--dk-danger) 12%, transparent); color: var(--dk-danger); }
.dk_reason[data-reason="restarting"] { background: color-mix(in srgb, var(--dk-warn) 16%, transparent); color: var(--dk-warn); }
.dk_reason[data-reason="exit-nonzero"] { background: color-mix(in srgb, var(--dk-warn) 12%, transparent); color: var(--dk-warn); }

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

/**
 * \u540C\u4E00\u6761\u8FC7\u6EE4\u884C\u6302\u5728\u4E24\u5904\uFF0C\u4F38\u7F29\u8F74\u4E0D\u540C\uFF0C\u5FC5\u987B\u5206\u5F00\u5BF9\u5F85\uFF1A
 *   - \u5355\u5BB9\u5668\u65E5\u5FD7\uFF1A\u5B83\u5728 \`.dk_tabs\`\uFF08\u6A2A\u5411\u884C\uFF09\u91CC\uFF0C\`flex: 1 1 auto\` \u662F\u300C\u6A2A\u5411\u5360\u6EE1\u5269\u4F59\u5BBD\u5EA6\u300D\uFF0C\u6B63\u786E\uFF1B
 *   - \u805A\u5408\u65E5\u5FD7\uFF08ComposeLogs\uFF09\uFF1A\u5B83\u662F \`.dk_logs\`\uFF08\u7EB5\u5411 flex\uFF09\u7684\u76F4\u63A5\u5B50\u9879\uFF0C\u6B64\u65F6 \`flex: 1 1 auto\`
 *     \u4F1A\u53D8\u6210**\u7EB5\u5411\u6491\u9AD8**\u2014\u2014\u8FC7\u6EE4\u5230\u5C11\u91CF\u884C\u65F6\u65E5\u5FD7\u4F53\u57FA\u51C6\u9AD8\u5EA6\u53D8\u5C0F\u3001\u5269\u4F59\u7A7A\u95F4\u51FA\u73B0\uFF0C\u5DE5\u5177\u6761\u4E0E
 *     \`.dk_logBody\` \u5404\u5206\u4E00\u534A\uFF0C\u6574\u6761\u5DE5\u5177\u6761\u957F\u6210\u4E24\u767E\u591A\u50CF\u7D20\u7684\u6A2A\u6761\uFF08\u8F93\u5165\u6846\u5782\u76F4\u5C45\u4E2D\u3001\u72B6\u6001\u884C\u88AB
 *     \u9876\u5230\u4E0B\u9762\uFF09\uFF0C\u4E5F\u5C31\u662F\u300C\u8F93\u5165\u6587\u5B57\u540E\u754C\u9762\u53D8\u5F62\u300D\u3002\u5DE5\u5177\u6761\u662F\u56FA\u5B9A\u9AD8\u5EA6\u7684\u4E00\u884C\uFF0C\u4E0D\u8BE5\u53C2\u4E0E\u7EB5\u5411\u4F38\u7F29\u3002
 */
.dk_logs > .dk_filterBar { flex: 0 0 auto; }

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

/* ------------------------------------------------------------------ *
 * \u65E5\u5FD7 \u2192 \u4F1A\u8BDD\u6865\uFF1A\u53F3\u952E\u83DC\u5355 / \u9884\u89C8\u5361\u7247 / \u5931\u8D25\u63D0\u793A
 *
 * \u4E09\u8005\u90FD\u6302\u5728 document.body \u4E0A\uFF0C\u800C\u4E0D\u662F\u9762\u677F\u7684 React \u6811\u91CC\uFF1A\`.dk_logBody\` \u662F
 * overflow:auto\uFF0C\u5185\u8054\u6E32\u67D3\u4F1A\u8DDF\u7740\u65E5\u5FD7\u4E00\u8D77\u6EDA\u8D70\uFF1B\u800C\u5BBF\u4E3B\u53EA\u5411\u6D4F\u89C8\u5668\u534A\u4F53\u6CE8\u5165
 * react / react/jsx-runtime / react-dom/client\uFF0C\u6CA1\u6709 react-dom\uFF0C\u4E5F\u5C31\u62FF\u4E0D\u5230
 * createPortal\u3002\u597D\u5728 \`--dk-*\` \u4EE4\u724C\u58F0\u660E\u5728 \`:where(html, body)\` \u4E0A\uFF0Cbody \u4E0B\u7684
 * \u6D6E\u5C42\u81EA\u52A8\u7EE7\u627F\uFF0C\u4E0D\u5FC5\u642C\u4EE4\u724C\u3002
 *
 * z-index \u5FC5\u987B\u9AD8\u4E8E \`.dk_backdrop\` \u7684 2140\uFF1A\u6A21\u6001\u5F62\u6001\u4E0B\u9762\u677F\u6574\u4E2A\u5728 backdrop \u91CC\uFF0C
 * \u83DC\u5355\u6302\u5230 body \u540E\u82E5\u4F4E\u4E8E\u5B83\u5C31\u4F1A\u88AB\u76D6\u4F4F\u3001\u70B9\u4E0D\u51FA\u6765\u3002
 * ------------------------------------------------------------------ */

.dk_menu {
  position: fixed;
  z-index: 2160;
  min-width: 220px;
  max-width: 320px;
  padding: var(--dk-gap-xs);
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-solid);
  box-shadow: var(--dk-shadow);
  color: var(--dk-label);
  font-size: 12px;
}

.dk_menuHead { padding: 6px 8px 2px; font-weight: 600; }
.dk_menuSub {
  padding: 0 8px 6px;
  color: var(--dk-label-3);
  font-size: 11px;
  line-height: 1.5;
  word-break: break-all;
}

.dk_menuItem {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: var(--dk-r-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.dk_menuItem:hover:not(:disabled) { background: var(--dk-hover); }
.dk_menuItem:focus-visible { outline: none; box-shadow: var(--dk-ring); }
.dk_menuItem:disabled { cursor: not-allowed; }
.dk_menuItem:disabled .dk_menuItemLabel { color: var(--dk-label-3); }
.dk_menuItemHint { color: var(--dk-label-3); font-size: 11px; }

.dk_menuNote {
  margin-top: var(--dk-gap-xs);
  padding: 6px 8px 2px;
  border-top: 1px solid var(--dk-border);
  color: var(--dk-label-3);
  font-size: 11px;
  line-height: 1.5;
}

.dk_askCard {
  position: fixed;
  z-index: 2170;
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-sm);
  width: min(680px, calc(100vw - 32px));
  padding: var(--dk-gap-lg);
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-lg);
  background: var(--dk-surface-solid);
  box-shadow: var(--dk-shadow-lg);
  color: var(--dk-label);
}

.dk_askCardHead { font-size: 13px; font-weight: 600; }

.dk_askCardText {
  width: 100%;
  height: min(42vh, 340px);
  padding: var(--dk-gap-md);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-sm);
  background: var(--dk-log-bg);
  color: var(--dk-log-fg);
  font-family: var(--dk-mono);
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
}

.dk_askCardText:focus-visible { outline: none; box-shadow: var(--dk-ring); }

.dk_askCardStatus { min-height: 16px; color: var(--dk-label-3); font-size: 11px; }
.dk_askCardStatus[data-kind="error"] { color: var(--dk-danger); }
.dk_askCardStatus[data-kind="ok"] { color: var(--dk-accent); }

.dk_askCardFoot { display: flex; align-items: center; gap: var(--dk-gap-md); }
/* \u53D6\u6D88\u63A8\u5230\u6700\u53F3\uFF1A\u4E0E .dk_confirmActions \u7684\u300C\u52A8\u4F5C\u5728\u53F3\u300D\u4E00\u81F4\uFF0C\u907F\u514D\u8BEF\u70B9\u4E3B\u6309\u94AE */
.dk_askCardFoot .dk_btn:last-child { margin-left: auto; }

.dk_askCardHint { color: var(--dk-label-3); font-size: 11px; line-height: 1.5; }

.dk_askToast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2180;
  max-width: 420px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--dk-danger) 40%, transparent);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-solid);
  box-shadow: var(--dk-shadow);
  color: var(--dk-danger);
  font-size: 12px;
  line-height: 1.6;
}

/* \u6210\u529F\u56DE\u6267\uFF1A\u540C\u4E00\u679A toast \u6362\u914D\u8272\uFF08\u9ED8\u8BA4\u90A3\u5957\u662F\u300C\u5931\u8D25\u300D\u7684\u7EA2\uFF09 */
.dk_askToast[data-kind="ok"] {
  border-color: color-mix(in srgb, var(--dk-success) 42%, transparent);
  color: var(--dk-success);
}

/* \u3010SPIKE \xB7 \u9A8C\u5B8C\u5220\u9664\u3011\u63A2\u9488\u7684\u6392\u7248\uFF1A\u628A\u8BFB\u6570\u644A\u6210\u4E24\u5217 */
.dk_spike {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-sm);
  padding: var(--dk-gap-lg);
  color: var(--dk-label);
  font-size: 12px;
}

.dk_spikeTitle { font-size: 13px; font-weight: 600; }
.dk_spikeHint { color: var(--dk-label-3); line-height: 1.6; }

.dk_spikeRow {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: var(--dk-gap-md);
  align-items: baseline;
}

.dk_spikeKey { color: var(--dk-label-3); }
.dk_spikeVal { word-break: break-all; }

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
/* \u9009\u62E9\u6001\u64CD\u4F5C\u6761\uFF1A\u7B2C\u4E00\u884C\u662F\u8BA1\u6570 + \u52A8\u4F5C\uFF0C\u7B2C\u4E8C\u884C\u662F\u300C\u6309\u6761\u4EF6\u9009\u4E2D\u300Dchips */
.dk_pickBar {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-sm);
  flex: 0 0 auto;
  padding: var(--dk-gap-sm) var(--dk-gap-lg);
  border-bottom: 1px solid var(--dk-border);
  background: var(--dk-surface-2);
}

.dk_pickRow {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  flex-wrap: wrap;
}

.dk_pickPresets {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  flex-wrap: wrap;
}

.dk_pickPresetsLabel {
  font-size: 11px;
  color: var(--dk-label-3);
}

/* \u6761\u4EF6 chip\uFF1A\u4E0E pill \u540C\u65CF\u7684\u8F7B\u91CF\u6309\u94AE\uFF08\u4E00\u884C\u653E\u5F97\u4E0B 5~6 \u4E2A\uFF09 */
.dk_chip {
  height: var(--dk-h-sm);
  padding: 0 var(--dk-gap-md);
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-pill);
  background: var(--dk-surface-solid);
  color: var(--dk-label-2);
  font-size: 11px;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease), border-color var(--dk-dur) var(--dk-ease);
}

.dk_chip:hover { background: var(--dk-hover); color: var(--dk-label); border-color: var(--dk-accent); }
.dk_chip:focus-visible { outline: none; box-shadow: var(--dk-ring); }
.dk_chipQuiet { border-color: var(--dk-border); color: var(--dk-label-3); }
.dk_pickNotice { margin-left: auto; }

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

/* ====================== \u591A\u76EE\u6807\u603B\u89C8\uFF08\u53EA\u8BFB\uFF09 ========================= */

/*
 * \u4E00\u5C4F\u770B\u5168\u90E8\u76EE\u6807\uFF1A\u4E0A\u9762\u4E00\u884C\u8BA1\u6570\u5361\uFF0C\u4E0B\u9762\u5F02\u5E38\u8868\u3002\u5361\u7247\u884C\u4E0D\u6EDA\uFF08\u76EE\u6807\u6570\u662F\u914D\u7F6E\u51FA\u6765\u7684\uFF0C
 * \u901A\u5E38\u4E2A\u4F4D\u6570\uFF09\uFF0C\u5F02\u5E38\u8868\u81EA\u5DF1\u6EDA\u3001\u8868\u5934\u5438\u9876\u2014\u2014\u4E0E\u955C\u50CF / \u7F51\u7EDC / \u5377\u9875\u540C\u6B3E\uFF0C\u9760 .dk_mainImages
 * \u91CC\u90A3\u6761 \`.dk_tableWrap { flex: 1 }\` \u751F\u6548\uFF0C\u6240\u4EE5\u6B63\u6587\u5916\u5C42\u5FC5\u987B\u662F flex \u5217\u7684 .dk_imagesView\u3002
 */
.dk_ovCards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--dk-gap-md);
  margin-bottom: var(--dk-gap-lg);
}

.dk_ovCard {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-sm);
  padding: var(--dk-gap-md) var(--dk-gap-lg);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-solid);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--dk-dur) var(--dk-ease), box-shadow var(--dk-dur) var(--dk-ease);
}

.dk_ovCard:hover { border-color: var(--dk-border-strong); box-shadow: var(--dk-shadow); }
.dk_ovCard:focus-visible { outline: none; box-shadow: var(--dk-ring); }

/* \u4E0D\u53EF\u8FBE\u7684\u5361\u8981\u5728\u4E00\u5C4F\u91CC\u7B2C\u4E00\u773C\u88AB\u6311\u51FA\u6765\uFF1A\u5371\u9669\u8272\u63CF\u8FB9 + \u6DE1\u5E95\uFF0C\u548C\u300C\u6570\u5B57\u90FD\u6B63\u5E38\u300D\u7684\u5361\u62C9\u5F00 */
.dk_ovCard[data-state="error"] {
  border-color: color-mix(in srgb, var(--dk-danger) 40%, transparent);
  background: color-mix(in srgb, var(--dk-danger) 8%, transparent);
}

.dk_ovCardHead {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  min-width: 0;
}

.dk_ovCardName {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * \u8BA1\u6570\u533A\uFF1A**\u4E24\u5217\u7F51\u683C + \u56FA\u5B9A\u5BBD\u5EA6\u7684\u6570\u5B57\u69FD**\u3002
 * \u539F\u6765\u662F flex-wrap\uFF1A\u56DB\u9879\u6362\u884C\u540E\u6BCF\u9879\u5BBD\u5EA6\u968F\u5185\u5BB9\u53D8\uFF08\u300C21 \u8FD0\u884C\u4E2D\u300D\u6BD4\u300C0 \u4E0D\u5065\u5EB7\u300D\u5BBD\uFF09\uFF0C
 * \u7B2C\u4E8C\u5217\u5C31\u8DDF\u7740\u5185\u5BB9\u5DE6\u53F3\u9519\u5F00\uFF0C\u770B\u8D77\u6765\u300C\u6587\u5B57\u6CA1\u5BF9\u9F50\u300D\u3002
 *   - \u7F51\u683C\u4FDD\u8BC1\u540C\u4E00\u5217\u7684\u8D77\u70B9\u4E00\u81F4\uFF08\u4E24\u884C\u4E24\u5217\u5BF9\u9F50\uFF09\uFF1B
 *   - \u6570\u5B57\u69FD\u56FA\u5B9A\u5BBD + \u53F3\u5BF9\u9F50 + tabular-nums\uFF0C\u4FDD\u8BC1\u300C21\u300D\u4E0E\u300C0\u300D\u4E4B\u540E\u7684\u6807\u7B7E\u4E5F\u5728\u540C\u4E00 x
 *     \uFF0812px \u5BB9\u5668\u5B57\u53F7\u4E0B 2.8ch \u2248 34px\uFF0C\u591F\u653E\u4E09\u4F4D\u6570\uFF1B\u771F\u8D85\u8FC7\u65F6\u6807\u7B7E\u53F3\u79FB\u4E00\u4F4D\uFF0C\u53EF\u63A5\u53D7\uFF09\u3002
 */
.dk_ovCardCounts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--dk-gap-sm) var(--dk-gap-lg);
}

.dk_ovCount {
  display: grid;
  grid-template-columns: 2.8ch auto;
  align-items: baseline;
  gap: var(--dk-gap-xs);
  min-width: 0;
  font-size: 12px;
  color: var(--dk-label-3);
}

.dk_ovCountLabel { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.dk_ovCountValue {
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--dk-label);
}

.dk_ovCount[data-state="running"] .dk_ovCountValue { color: var(--dk-success); }
.dk_ovCount[data-state="unhealthy"] .dk_ovCountValue { color: var(--dk-danger); }
/*
 * \u8FD8\u6CA1\u7B54\u5B8C\u7684\u5361\uFF1A\u53EA\u7ED9\u8BFB\u53D6\u6001\uFF0C\u4E0D\u51FA 0/0/0\uFF08\u90A3\u4F1A\u88AB\u8BFB\u6210\u300C\u8FD9\u53F0\u673A\u5668\u6CA1\u6709\u5BB9\u5668\u300D\uFF0C\u800C\u5B83\u53EA\u662F\u8FD8\u6CA1
 * \u56DE\u7B54\u2014\u2014SSH \u76EE\u6807\u4E0D\u53EF\u8FBE\u65F6\u8981\u7B49 readyTimeout 20s\uFF09\u3002\u6574\u5361\u538B\u6697\u4E00\u70B9\uFF0C\u4E0E\u5DF2\u6709\u7ED3\u679C\u533A\u5206\u5F00\u3002
 */
.dk_ovCard[data-state="loading"] { opacity: .7; }

.dk_ovCardLoading {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  font-size: 12px;
  color: var(--dk-label-3);
}

/* \u4E0D\u5065\u5EB7\u4E3A 0 \u65F6\u6570\u5B57\u5373\u7ED3\u8BBA\uFF0C\u4E0D\u8BE5\u7EE7\u7EED\u7528\u5371\u9669\u8272\u558A\u4EBA */
.dk_ovCount[data-state="unhealthy"][data-zero="1"] .dk_ovCountValue { color: var(--dk-label-3); }

.dk_ovCardError {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  min-width: 0;
  font-size: 12px;
}

/* SSH \u62A5\u9519\u662F\u4E00\u957F\u4E32\uFF1A\u5361\u7247\u91CC\u53EA\u7559\u4E00\u884C\uFF0C\u5168\u91CF\u5728 title \u91CC */
.dk_ovCardErrorText {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--dk-label-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dk_ovSection {
  margin: 0 0 var(--dk-gap-sm);
  font-size: 12px;
  font-weight: 600;
  color: var(--dk-label-2);
}

/* \u300C\u4E00\u5207\u6B63\u5E38\u300D/\u300C\u8BFB\u53D6\u4E2D\u300D\u8D34\u5728\u5361\u7247\u884C\u4E0B\u9762\uFF0C\u4E0D\u9700\u8981\u6EE1\u5C4F 48px \u7684\u7559\u767D */
.dk_ovEmpty { padding: 24px var(--dk-gap-lg); }

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
`;var Wn="/api/dsh-docker",Ar="dsh-docker-style",Dr="@hyzyn/dsh-docker",Rn="docker",it=null;function Mn(){if(document.getElementById(Ar)!==null)return;let l=document.createElement("style");l.id=Ar,l.textContent=Pr,document.head.appendChild(l)}async function le(l,g){let e=await fetch(Wn+l,{...g,headers:{"content-type":"application/json",...g?.headers??{}}}),o=null;try{o=await e.json()}catch{}if(!e.ok){let I=o!==null&&typeof o.error=="string"?o.error:`HTTP ${String(e.status)}`;throw new Error(I)}if(o!==null&&o.ok===!1)throw new Error(typeof o.error=="string"?o.error:"\u8BF7\u6C42\u5931\u8D25");return o}var Q={config:()=>le("/config"),saveConfig:l=>le("/config",{method:"POST",body:JSON.stringify(l)}),targets:()=>le("/targets"),probe:l=>le("/probe",{method:"POST",body:JSON.stringify({target:l})}),containers:(l,g)=>le("/containers",{method:"POST",body:JSON.stringify({target:l,all:g})}),attention:l=>le("/attention",{method:"POST",body:JSON.stringify({target:l})}),inspect:(l,g)=>le("/inspect",{method:"POST",body:JSON.stringify({target:l,id:g})}),logs:(l,g,e)=>le("/logs",{method:"POST",body:JSON.stringify({target:l,id:g,...e})}),stats:(l,g)=>le("/stats",{method:"POST",body:JSON.stringify({target:l,ids:g})}),images:l=>le("/images",{method:"POST",body:JSON.stringify({target:l})}),imageInspect:(l,g)=>le("/images/inspect",{method:"POST",body:JSON.stringify({target:l,ref:g})}),imageRemove:(l,g)=>le("/images/remove",{method:"POST",body:JSON.stringify({target:l,ref:g})}),imagePrune:l=>le("/images/prune",{method:"POST",body:JSON.stringify({target:l})}),networks:l=>le("/networks",{method:"POST",body:JSON.stringify({target:l})}),networkInspect:(l,g)=>le("/networks/inspect",{method:"POST",body:JSON.stringify({target:l,name:g})}),networkRemove:(l,g)=>le("/networks/remove",{method:"POST",body:JSON.stringify({target:l,name:g})}),networkPrune:l=>le("/networks/prune",{method:"POST",body:JSON.stringify({target:l})}),volumes:l=>le("/volumes",{method:"POST",body:JSON.stringify({target:l})}),volumeInspect:(l,g)=>le("/volumes/inspect",{method:"POST",body:JSON.stringify({target:l,name:g})}),volumeRemove:(l,g)=>le("/volumes/remove",{method:"POST",body:JSON.stringify({target:l,name:g})}),volumePrune:l=>le("/volumes/prune",{method:"POST",body:JSON.stringify({target:l})}),action:(l,g,e)=>le("/action",{method:"POST",body:JSON.stringify({target:l,action:g,id:e})}),exec:(l,g,e,o)=>le("/exec",{method:"POST",body:JSON.stringify({target:l,id:g,command:e,timeoutSec:o})})};function rn(l,g){return Wn+l+"?"+new URLSearchParams(g).toString()}function Eo(l){return l==null||!Number.isFinite(l)?"\u2014":l.toFixed(l>=10?1:2)+"%"}function Io(l){return l.hostPort===void 0?String(l.containerPort)+"/"+l.protocol:String(l.hostPort)+"\u2192"+String(l.containerPort)+"/"+l.protocol}function an(l){if(!Array.isArray(l)||l.length===0)return"\u65E0\u7AEF\u53E3\u6620\u5C04";let g=new Set,e=[];for(let o of l){let I=Io(o);g.has(I)||(g.add(I),e.push(I))}return e.join("  ")}function Nt(l){let g=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(l);return g===null?l:g[1]+" "+g[2]}function on(l){if(l==null||!Number.isFinite(l)||l<0)return"\u2014";let g=["B","kB","MB","GB","TB"],e=l,o=0;for(;e>=1e3&&o<g.length-1;)e/=1e3,o+=1;return(o===0?String(Math.round(e)):e.toFixed(e>=100?0:1))+" "+g[o]}function Oo(l){return{running:"\u8FD0\u884C\u4E2D",exited:"\u5DF2\u505C\u6B62",created:"\u5DF2\u521B\u5EFA",paused:"\u5DF2\u6682\u505C",restarting:"\u91CD\u542F\u4E2D",dead:"dead",removing:"\u5220\u9664\u4E2D",unknown:"\u672A\u77E5"}[l]??l}function jr(l,g){let e=new Blob([g],{type:"text/plain;charset=utf-8"}),o=URL.createObjectURL(e),I=document.createElement("a");I.href=o,I.download=l,I.click(),setTimeout(()=>URL.revokeObjectURL(o),1e3)}var la="docker exec -it '";function Bn(l){let g=String(l).replaceAll("'","'\\''");return la+g+"' sh"}function Hr(l){return typeof l=="string"&&l.startsWith(la)}var Gn="dsh-docker:last-target";function zr(){try{let l=window.localStorage.getItem(Gn);return typeof l=="string"?l:""}catch{return""}}function Fr(l){try{window.localStorage.setItem(Gn,l)}catch{}}function Pn(l,g,e,o){if(g!=="")return g;if(o)return"";let I=l.map(p=>p.name);return e!==""&&I.includes(e)?e:I.length>0?I[0]:""}var Xe=null,Qe=null,ln=null,Ae=null,Jn=[],Hn=0,un=null,kn=!1;function da(l){kn=l,un!==null&&un.set(l)}function sa(l){da(!(l!==null&&typeof l=="object"&&l.enabled===!1))}function An(l){l!==null&&typeof l=="object"&&(Ae=l),Hn=Date.now(),sa(Ae)}async function sn(){let l=!0;try{Ae=(await Q.config()).config,Hn=Date.now(),sa(Ae)}catch(g){l=!1,console.warn("[dsh-docker] \u914D\u7F6E\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(g instanceof Error?g.message:String(g)))}try{Jn=(await Q.targets()).targets??[],Hn=Date.now()}catch(g){kn&&(l=!1,console.warn("[dsh-docker] \u76EE\u6807\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(g instanceof Error?g.message:String(g))))}return l}async function Ro(l,g){let e=zn(l,g);return e!==void 0?e:(await sn(),zn(l,g))}function zn(l,g){let e=Ae!==null&&Array.isArray(Ae.targets)?Ae.targets:[];if(typeof g=="string"&&g!==""){let E=e.find(P=>P.kind==="ssh"&&P.book===g);if(E!==void 0)return E.name}let o=typeof l?.host=="string"?l.host:"";if(o==="")return;let I=Number(l?.port),p=Number.isInteger(I)&&I>0?I:22;for(let E of Jn){if(E.kind!=="ssh"||typeof E.label!="string")continue;let P=/^([^@]+)@(.+?)(?::(\d+))?$/.exec(E.label);if(P!==null&&P[2]===o&&Number(P[3]??22)===p)return E.name}}var Vr='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',Mo='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',et='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',Pe='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7"/><path d="M11.5 4.5l-7 7"/></svg>',Bo='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.4l7.4 4.6L5 12.6z"/></svg>',Po='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.2"/></svg>',Ao='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',dn='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.6h10"/><path d="M6.2 4.6V3.4a.8.8 0 0 1 .8-.8h2a.8.8 0 0 1 .8.8v1.2"/><path d="M4.6 4.6l.6 8a.9.9 0 0 0 .9.8h3.8a.9.9 0 0 0 .9-.8l.6-8"/></svg>';var Do='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v7.2"/><path d="M5 7.4L8 10.4l3-3"/><path d="M3.4 12.8h9.2"/></svg>',jo='<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6l5.8 10.4H2.2z"/><path d="M8 6.4v3.2"/><path d="M8 11.6h.01"/></svg>',Kr='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l3.5 3L3 11"/><path d="M8.5 11H13"/></svg>',Wr='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 4.5h10"/><path d="M3 8h10"/><path d="M3 11.5h6"/></svg>',Ho='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3.5 12.5v-4"/><path d="M7 12.5v-8"/><path d="M10.5 12.5v-5"/><path d="M13 12.5v-2"/></svg>',tt='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 8h-9"/><path d="M7 4.5L3.5 8 7 11.5"/></svg>',Dn='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5L8 10.5l4-4"/></svg>',zo='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6v6.4"/><path d="M5.3 6.5L8 9.2l2.7-2.7"/><path d="M3 11.4v1.2a.8.8 0 0 0 .8.8h8.4a.8.8 0 0 0 .8-.8v-1.2"/></svg>',Fo='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="9" rx="1.2"/><path d="M2.5 10.2L5.6 7.6l2.4 2 2.1-1.7 3.4 2.9"/><path d="M6 6.2h.01"/></svg>',jn='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.4 12.6h9.2"/><path d="M5.2 9.6l3.1-3.1"/><path d="M8.4 3.6l2.4 2.4"/><path d="M10.6 6.2l1.8 1.8-3.2 1.2-1.2 3.2-1.8-1.8z"/></svg>',Gr='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.4 5.9L8 2.8l5.6 3.1L8 9z"/><path d="M2.4 8.4L8 11.5l5.6-3.1"/><path d="M2.4 10.9L8 14l5.6-3.1"/></svg>';var Vo='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="3.2" r="1.7"/><circle cx="3.4" cy="12.2" r="1.7"/><circle cx="12.6" cy="12.2" r="1.7"/><path d="M6.7 4.6L4.5 10.6"/><path d="M9.3 4.6l2.2 6"/><path d="M5.1 12.2h5.8"/></svg>',Ko='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="8" cy="4.2" rx="4.6" ry="1.9"/><path d="M3.4 4.2v7.6c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9V4.2"/><path d="M3.4 8c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9"/></svg>',ca=6,cn=8,Fn=6;function Wo(l){return(Ae!==null&&Array.isArray(Ae.targets)?Ae.targets:[]).some(e=>e.name===l&&e.kind==="ssh")}function Jr(l,g=!1){let e=g===!0?Fn:cn;return l>e?{canRun:!1,hint:"\u6700\u591A "+String(e)+" \u4E2A\u5BB9\u5668"+(g===!0?"\uFF08SSH \u76EE\u6807\u4E0A\u4E00\u6761\u8FDE\u63A5\u8981\u540C\u65F6\u88C5\u5B9E\u65F6\u6D41\u4E0E\u5237\u65B0\u7B49\u77ED\u547D\u4EE4\uFF09":"\uFF0C\u6D4F\u89C8\u5668\u5E76\u53D1\u957F\u8FDE\u63A5\u6709\u9650\u5236")}:l>ca?{canRun:!0,hint:"\u8FDE\u63A5\u6570\u8F83\u591A\uFF0C\u6D4F\u89C8\u5668\u5E76\u53D1\u957F\u8FDE\u63A5\u6709\u9650\u5236"}:l<2?{canRun:!1,hint:l===0?"":"\u81F3\u5C11\u9009\u62E9 2 \u4E2A\u5BB9\u5668"}:{canRun:!0,hint:""}}function Ur(l,g){return l.includes(g)?l.filter(e=>e!==g):[...l,g]}function qr(l,g){let e=new Set(g.map(I=>I.id)),o=l.filter(I=>e.has(I));return o.length===l.length?l:o}var ua=[{key:"all",label:"\u5168\u90E8\u53EF\u89C1",needsBase:!1},{key:"unhealthy",label:"\u4E0D\u5065\u5EB7",needsBase:!1},{key:"abnormal",label:"\u9700\u5173\u6CE8",needsBase:!1},{key:"stopped",label:"\u5DF2\u505C\u6B62",needsBase:!1},{key:"sameImage",label:"\u540C\u955C\u50CF",needsBase:!0},{key:"sameProject",label:"\u540C\u9879\u76EE",needsBase:!0}],Go=l=>l==="running"||l==="paused"||l==="restarting";function ka(l,g){switch(l){case"all":return()=>!0;case"unhealthy":return e=>e.health==="unhealthy";case"abnormal":return e=>Un(e).length>0;case"stopped":return e=>!Go(e.state);case"sameImage":return e=>g!==null&&e.image===g.image;case"sameProject":return e=>g!==null&&g.composeProject!==null&&e.composeProject===g.composeProject;default:return()=>!1}}function Xr(l,g,e,o,I){let p=ka(e,o),E=Math.max(I-g.length,0),P=l.filter(nt=>!g.includes(nt.id)&&p(nt)),de=P.slice(0,E);return{ids:g.concat(de.map(nt=>nt.id)),added:de.length,skipped:P.length-de.length}}function Yr(l,g,e,o){let I=Math.max(o-g.length,0);return ua.filter(p=>!p.needsBase||e!==null).map(p=>{let E=ka(p.key,e),P=l.filter(de=>!g.includes(de.id)&&E(de)).length;return{key:p.key,label:p.label,count:Math.min(P,I),over:Math.max(P-I,0)}})}function $r(l,g){let e=new Map(l.map(o=>[o.id,o]));return g.map(o=>e.get(o)).filter(o=>o!==void 0)}function Zr(){let l=0;return{next(){return l+=1,l},isCurrent(g){return g===l}}}var Vn=120,ga=[["oom","\u88AB OOM \u6740",0],["dead","\u50F5\u6B7B",1],["unhealthy","\u4E0D\u5065\u5EB7",2],["restarting","\u53CD\u590D\u91CD\u542F",3],["exit-nonzero","\u975E\u96F6\u9000\u51FA",4]],Jo=l=>{let g=ga.find(([e])=>e===l);return g===void 0?l:g[1]},Uo=l=>{let g=ga.find(([e])=>e===l);return g===void 0?9:g[2]};function Un(l){let g=[];return l.health==="unhealthy"&&g.push("unhealthy"),l.state==="restarting"&&g.push("restarting"),l.state==="dead"&&g.push("dead"),l.state==="exited"&&typeof l.exitCode=="number"&&l.exitCode!==0&&g.push("exit-nonzero"),g}function qo(l){let g=p=>{if(typeof p!="string"||p==="")return"";let E=Date.parse(p);return Number.isFinite(E)?new Date(E).toLocaleString():""},e=["\u6253\u5F00\u5BB9\u5668\u8BE6\u60C5"],o=g(l.finishedAt),I=g(l.startedAt);return o!==""?e.push("\u7ED3\u675F\u4E8E "+o):I!==""&&e.push("\u542F\u52A8\u4E8E "+I),typeof l.restartCount=="number"&&e.push("\u91CD\u542F\u6B21\u6570 "+String(l.restartCount)),typeof l.exitCode=="number"&&e.push("\u9000\u51FA\u7801 "+String(l.exitCode)),e.join(" \xB7 ")}function Kn(l){return l.filter(g=>Un(g).length>0)}function ha(l){let g=0,e=0,o=0;for(let I of l)I.state==="running"||I.state==="paused"||I.state==="restarting"?g+=1:e+=1,I.health==="unhealthy"&&(o+=1);return{running:g,stopped:e,unhealthy:o}}function pa(l){let g=e=>{let o=Array.isArray(e.reasons)?e.reasons:[];return o.length===0?e.item.health==="unhealthy"?2:3:Math.min(...o.map(Uo))};return l.slice().sort((e,o)=>{let I=g(e)-g(o);return I!==0?I:e.targetIndex!==o.targetIndex?e.targetIndex-o.targetIndex:e.item.name===o.item.name?0:e.item.name<o.item.name?-1:1})}function ma(l){let g=String(l??"").split(`
`)[0].trim();return g===""?"\u672A\u77E5\u9519\u8BEF":g.length>Vn?g.slice(0,Vn)+"\u2026":g}function St(l,g,e){let o=!1,I=l.map(p=>p.name!==g?p:(o=!0,{...p,...e}));return o?I:l}function Qr(l){let g=l.map(o=>{let I=ha(o.containers),p=Kn(o.containers),E=Array.isArray(o.attention)?o.attention.length:null;return{name:o.name,kind:o.kind==="ssh"?"ssh":"local",label:typeof o.label=="string"?o.label:"",error:o.error===""?"":ma(o.error),loaded:o.loaded===!0,running:I.running,stopped:I.stopped,unhealthy:I.unhealthy,attention:E===null?p.length:E,attentionApprox:E===null}}),e=[];return l.forEach((o,I)=>{if(Array.isArray(o.attention)){for(let p of o.attention)e.push({target:o.name,targetIndex:I,item:p,reasons:Array.isArray(p.reasons)?p.reasons:[]});return}for(let p of Kn(o.containers))e.push({target:o.name,targetIndex:I,item:p,reasons:Un(p)})}),{cards:g,rows:pa(e),unreachable:g.filter(o=>o.error!==""),loading:l.some(o=>o.loaded!==!0)}}var ea=50,ta=8,na=500;function ra(l,g,e){let o=[g,...l];return o.length>e?o.slice(0,e):o}function aa(l){if(typeof l!="number"||!Number.isFinite(l))return"--:--:--";let g=new Date(l*1e3);if(Number.isNaN(g.getTime()))return"--:--:--";let e=o=>String(o).padStart(2,"0");return e(g.getHours())+":"+e(g.getMinutes())+":"+e(g.getSeconds())}function oa(l){let g=typeof l.action=="string"?l.action:"";return g===""?"?":g.indexOf("die")!==0||l.exitCode===null||l.exitCode===void 0?g:g+"("+String(l.exitCode)+")"}function ia(l,g){let e=null;return{schedule(){e!==null&&clearTimeout(e),e=setTimeout(()=>{e=null,g()},l)},cancel(){e!==null&&(clearTimeout(e),e=null)}}}window.__ModuleLoader__.load({id:"@hyzyn/dsh-docker",factory:l=>{let g=l("react"),{jsx:e,jsxs:o}=l("react/jsx-runtime"),{createRoot:I}=l("react-dom/client"),{useState:p,useEffect:E,useRef:P,useCallback:de}=g;function nt(t,n,a){if(n==="")return t;let r=t.toLowerCase(),u=n.toLowerCase(),d=[],s=0,c=r.indexOf(u),k=0;for(;c>=0&&k<500;)c>s&&d.push(t.slice(s,c)),d.push(e("mark",{children:t.slice(c,c+u.length)},a+"-m"+String(k))),s=c+u.length,k+=1,c=r.indexOf(u,s);return s<t.length&&d.push(t.slice(s)),d}function qn(t){let n=Array.isArray(t.rows)?t.rows:[],a=Array.isArray(t.mono)?t.mono:[];return o("div",{className:"dk_kv",children:n.flatMap(([r,u],d)=>[e("div",{className:"dk_kvKey",children:r},"k"+String(d)),e("div",{className:"dk_kvVal"+(a.indexOf(r)>=0?" dk_kvValMono":""),children:u},"v"+String(d))])})}function lt(t){let n=t.health==="unhealthy"?"unhealthy":t.state,a=t.health==="unhealthy"?"\u4E0D\u5065\u5EB7":Oo(t.state);return e("span",{className:"dk_badge","data-state":n,title:t.status??"",children:a})}function Y(t){return o("div",{className:"dk_banner","data-kind":t.kind??"error",children:[e("span",{className:"dk_bannerIcon",dangerouslySetInnerHTML:{__html:jo}},"icon"),o("div",{className:"dk_bannerBody",children:[e("div",{children:t.title}),t.hint===void 0?null:e("div",{className:"dk_hint",style:{marginTop:4},children:t.hint})]},"body"),t.action===void 0?null:e("div",{className:"dk_bannerAction",children:t.action},"action")]})}function Ct(t,n,a){return o("span",{className:"dk_ovCount","data-state":t,"data-zero":a===0?"1":void 0,children:[e("span",{className:"dk_ovCountValue",children:String(a)}),e("span",{className:"dk_ovCountLabel",children:n})]},t)}function Xn(t,n){if(t.cards.length===0)return o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD8\u6CA1\u6709\u914D\u7F6E Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u76EE\u6807\u540E\uFF0C\u603B\u89C8\u4F1A\u5728\u8FD9\u91CC\u4E00\u5C4F\u6C47\u603B\u5168\u90E8\u4E3B\u673A\u3002"})]});let a=t.rows.length===0?t.loading?o("div",{className:"dk_empty dk_ovEmpty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]},"loading"):o("div",{className:"dk_empty dk_ovEmpty",children:[e("div",{className:"dk_emptyTitle",children:"\u4E00\u5207\u6B63\u5E38"}),e("div",{className:"dk_emptyHint",children:"\u6240\u6709\u76EE\u6807\u4E0A\u90FD\u6CA1\u6709\u9700\u8981\u5173\u6CE8\u7684\u5BB9\u5668\uFF08\u4E0D\u5065\u5EB7 / \u53CD\u590D\u91CD\u542F / \u88AB OOM \u6740 / \u975E\u96F6\u9000\u51FA / \u50F5\u6B7B\uFF09\u3002"})]},"empty"):e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images dk_ovTable",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u5BB9\u5668\u540D"}),e("th",{children:"\u76EE\u6807"}),e("th",{children:"\u72B6\u6001"}),e("th",{children:"\u539F\u56E0"}),e("th",{children:"\u955C\u50CF"})]})}),e("tbody",{children:t.rows.map(r=>o("tr",{className:"dk_rowClickable",title:qo(r.item),onClick:()=>n.onOpenContainer(r.target,r.item),children:[e("td",{className:"dk_mono",title:r.item.name,children:r.item.name}),e("td",{children:r.target}),e("td",{children:e(lt,{state:r.item.state,health:r.item.health,status:r.item.status})}),e("td",{children:e("span",{className:"dk_reasons",children:(r.reasons??[]).map(u=>e("span",{className:"dk_reason","data-reason":u,children:Jo(u)},u))})}),e("td",{className:"dk_mono dk_pathCell",title:r.item.image,children:r.item.image})]},r.target+"\0"+r.item.id))})]})},0);return o("div",{className:"dk_imagesView dk_ovView",children:[t.unreachable.length===0?null:e(Y,{title:String(t.unreachable.length)+" \u4E2A\u76EE\u6807\u4E0D\u53EF\u8FBE",hint:t.unreachable.map(r=>r.name+"\uFF1A"+r.error).join("\uFF1B")+"\uFF08\u5176\u4F59\u76EE\u6807\u7684\u6B63\u5E38\u7ED3\u679C\u4E0D\u53D7\u5F71\u54CD\uFF09"},"unreachable"),e("div",{className:"dk_ovCards",children:t.cards.map(r=>o("button",{type:"button",className:"dk_ovCard","data-state":r.error!==""?"error":r.loaded===!0?"ok":"loading",title:r.error===""?"\u5207\u5230\u8BE5\u76EE\u6807\u7684\u5BB9\u5668\u5217\u8868":r.error,onClick:()=>n.onOpenTarget(r.name),children:[o("div",{className:"dk_ovCardHead",children:[e("span",{className:"dk_ovCardName",title:r.label===""?r.name:r.label,children:r.name}),e("span",{className:"dk_badge","data-state":"paused",children:r.kind==="local"?"\u672C\u673A":"SSH"})]},"head"),r.error===""?r.loaded===!0?o("div",{className:"dk_ovCardCounts",children:[Ct("running","\u8FD0\u884C\u4E2D",r.running),Ct("stopped","\u5DF2\u505C\u6B62",r.stopped),Ct("unhealthy","\u4E0D\u5065\u5EB7",r.unhealthy),Ct("attention",r.attentionApprox?"\u9700\u5173\u6CE8\uFF08\u7C97\u5224\uFF09":"\u9700\u5173\u6CE8",r.attention)]},"counts"):o("div",{className:"dk_ovCardLoading",children:[e("span",{className:"dk_spin"}),e("span",{children:"\u8BFB\u53D6\u4E2D\u2026"})]},"loading"):o("div",{className:"dk_ovCardError",children:[e("span",{className:"dk_badge","data-state":"dead",children:"\u4E0D\u53EF\u8FBE"}),e("span",{className:"dk_ovCardErrorText",title:r.error,children:r.error})]},"error")]},r.name))},1),e("div",{className:"dk_ovSection",children:t.rows.length===0?"\u9700\u5173\u6CE8\u5BB9\u5668":"\u9700\u5173\u6CE8\u5BB9\u5668\uFF08"+String(t.rows.length)+"\uFF09"},2),a]})}function dt(t){let n=t.busy===!0;return o("div",{className:"dk_confirmBackdrop",onMouseDown:a=>a.stopPropagation(),children:[o("div",{className:"dk_confirm","data-busy":n?"1":void 0,children:[e("div",{className:"dk_confirmTitle",children:t.title}),e("div",{className:"dk_confirmText",children:t.text}),o("div",{className:"dk_confirmActions",children:[e("button",{type:"button",className:"dk_btn",disabled:n,onClick:t.onCancel,children:"\u53D6\u6D88"}),e("button",{type:"button",className:"dk_btn dk_btnDanger",disabled:n,"aria-busy":n?"true":void 0,onClick:t.onConfirm,children:n?o("span",{className:"dk_confirmBusy",children:[e("span",{className:"dk_spin"}),"\u6267\u884C\u4E2D\u2026"]}):t.confirmLabel})]})]})]})}function Xo(t){return e("button",{type:"button",className:"dk_btn"+(t.danger===!0?" dk_btnDanger":""),disabled:t.disabled===!0,title:t.title??"",onClick:n=>{n.stopPropagation(),t.onClick()},children:t.children})}let Yn=60;function $n(t,n,a){let r=t.concat([n]);return r.length>a?r.slice(r.length-a):r}function Zn(t){let n=Array.isArray(t.values)?t.values:[],a=n.filter(h=>typeof h=="number"&&Number.isFinite(h)),r=96,u=22,d=Math.max(Number(t.max)||0,...a,1),s=n.length>1?r/(n.length-1):0,c=[];n.forEach((h,v)=>{if(typeof h!="number"||!Number.isFinite(h))return;let T=s===0?r:v*s,O=u-Math.min(1,Math.max(0,h/d))*u;c.push(T.toFixed(1)+","+O.toFixed(1))});let k=a.length===0?null:a[a.length-1],y=t.alertAt!==void 0&&k!==null&&k>=t.alertAt;return e("span",{className:"dk_spark","data-alert":y?"1":void 0,title:t.title??"",children:c.length<2?e("span",{className:"dk_sparkEmpty",children:"\u91C7\u6837\u4E2D\u2026"}):e("svg",{viewBox:"0 0 "+String(r)+" "+String(u),preserveAspectRatio:"none","aria-hidden":"true",children:e("polyline",{points:c.join(" "),fill:"none",stroke:"currentColor","stroke-width":"1.4","stroke-linejoin":"round","stroke-linecap":"round","vector-effect":"non-scaling-stroke"})})})}function st(t){return o("div",{className:"dk_cardRow",children:[e("span",{className:"dk_cardLabel",children:t.label}),e("span",{className:"dk_cardValue",title:String(t.value),children:t.value})]})}function $(t){let n=t.disabled===!0,a=t.busy===!0;return e("button",{type:"button",className:"dk_iconBtn"+(t.danger===!0?" dk_iconBtnDanger":""),"data-on":t.on===!0?"1":void 0,"data-spin":t.spin===!0?"1":void 0,"data-busy":a?"1":void 0,"aria-busy":a?"true":void 0,disabled:n,title:t.title,"aria-label":t.title,onClick:r=>{r.stopPropagation(),!n&&t.onClick()},children:a?e("span",{className:"dk_spin"}):e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:t.icon}})})}function fa(t){let n=t.item,a=t.pickMode===!0,r=t.picked===!0,u=t.allowMutations!==!0,d=n.state==="running"||n.state==="paused"||n.state==="restarting",s=n.createdAt===null?n.runningFor===""?"\u2014":n.runningFor:Nt(n.createdAt),c=typeof t.pending=="string"?t.pending:"",k=c!=="",y=v=>k?"\u6B63\u5728\u6267\u884C "+c+"\u2026\u8BF7\u7A0D\u5019":u?"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D":v,h=()=>{if(a){t.onTogglePick(n);return}t.onOpen(n,"overview")};return o("div",{className:"dk_card",role:a?"checkbox":"button","aria-checked":a?r?"true":"false":void 0,tabIndex:0,"data-selected":t.selected===!0?"1":"0","data-pick":a?"1":void 0,"data-picked":r?"1":void 0,"data-pending":k?"1":void 0,onClick:h,onKeyDown:v=>{(v.key==="Enter"||v.key===" ")&&(v.preventDefault(),h())},children:[o("div",{className:"dk_cardHead",children:[a?e("span",{className:"dk_pick","data-on":r?"1":"0","aria-hidden":"true"},"pick"):null,e("span",{className:"dk_cardName",title:n.name,children:n.name}),e(lt,{state:n.state,health:n.health,status:n.status})]},"head"),o("div",{className:"dk_cardRows",children:[e(st,{label:"\u955C\u50CF",value:n.image},"image"),e(st,{label:"ID",value:n.shortId},"id"),e(st,{label:"\u7AEF\u53E3",value:an(n.ports)},"ports"),e(st,{label:"\u521B\u5EFA",value:s},"created"),n.composeProject===null?null:e(st,{label:"compose",value:n.composeProject+(n.composeService===null?"":"/"+n.composeService)},"compose")]},"rows"),a?null:o("div",{className:"dk_actionBar",children:[e($,{icon:Kr,title:"\u5728\u5BB9\u5668\u5185\u6253\u5F00\u4EA4\u4E92\u5F0F\u7EC8\u7AEF\uFF08docker exec -it "+n.name+" sh\uFF09",onClick:()=>t.onExec(n)},"exec"),e($,{icon:Wr,title:"\u67E5\u770B\u65E5\u5FD7",onClick:()=>t.onOpen(n,"logs")},"logs"),e($,{icon:Ho,title:"\u8D44\u6E90\u5360\u7528",onClick:()=>t.onOpen(n,"stats")},"stats"),e("span",{className:"dk_actionBarSep","aria-hidden":"true"},"sep"),e($,{icon:d?Po:Bo,title:y(d?"\u505C\u6B62\u5BB9\u5668":"\u542F\u52A8\u5BB9\u5668"),disabled:u||k,busy:c===(d?"stop":"start"),onClick:()=>t.onAction(d?"stop":"start",n)},"power"),e($,{icon:Ao,title:y("\u91CD\u542F\u5BB9\u5668"),disabled:u||k,busy:c==="restart",onClick:()=>t.onAction("restart",n)},"restart"),e($,{icon:dn,danger:!0,title:y("\u5220\u9664\u5BB9\u5668\uFF08\u4E0D\u53EF\u6062\u590D\uFF09"),disabled:u||k,busy:c==="remove",onClick:()=>t.onAction("remove",n)},"remove")]},"actions")]})}let va=/^\s*(\[\d{4}-\d{2}-\d{2}[ T][0-9:.,]+\]|\d{2}:\d{2}:\d{2}[,.]\d{3})/,Qn=/^\s*(\[(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\]|\|\s*(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL))/,er=/(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)/,ct=2e3,Ie=5e3;function tr(t,n,a){let r=[],u=t;for(let d=0;d<2;d+=1){let s=va.exec(u);if(s!==null){r.push(e("span",{className:"dk_logTs",children:s[1]},"ts"+String(d))),u=u.slice(s[0].length);continue}let c=Qn.exec(u);if(c!==null){let k=er.exec(c[1]);r.push(e("span",{className:"dk_logLevel","data-level":k===null?"":k[1],children:c[1].trim()},"lv"+String(d))),u=u.slice(c[0].length);continue}break}return r.push(e("span",{className:"dk_logText",children:nt(u,a,"x"+String(n))},"tx")),r}function ba(t,n,a){return o("div",{className:"dk_logLine",children:tr(t,n,a)},String(n))}function _a(t,n,a,r){let u=r===!0&&typeof t.ts=="number"&&Number.isFinite(t.ts)?e("span",{className:"dk_logTs",children:new Date(t.ts).toLocaleTimeString()},"ts"):null;return o("div",{className:"dk_logLine","data-log-ts":typeof t.ts=="number"&&Number.isFinite(t.ts)?String(t.ts):void 0,children:[e("span",{className:"dk_logSvc",children:"["+t.service+"]"},"svc"),u,...tr(t.text,n,a)]},String(n))}let Ce=null,gn=20,nr=400;function rr(){if(Ce===null)return{ok:!1,reason:"\u5BBF\u4E3B\u672A\u63D0\u4F9B sessions \u670D\u52A1"};let t;try{t=Ce.list?.getSnapshot?.()?.current}catch(n){return{ok:!1,reason:n instanceof Error?n.message:String(n)}}if(typeof t!="string"||t==="")return{ok:!1,reason:"\u5F53\u524D\u6CA1\u6709\u6253\u5F00\u7684\u4F1A\u8BDD"};try{let n=Ce.scope(t);if(n===void 0)return{ok:!1,reason:"\u4F1A\u8BDD\u5C1A\u672A\u5C31\u7EEA\uFF08\u4F5C\u7528\u57DF\u672A\u6302\u8F7D\uFF09"};let a=n.get?.("conversation")??n.conversation??null;return a===null?{ok:!1,reason:"\u5BBF\u4E3B\u7F3A\u5C11 conversation \u670D\u52A1"}:{ok:!0,id:t,actx:n,conversation:a}}catch(n){return{ok:!1,reason:n instanceof Error?n.message:String(n)}}}function Tt(t){let n=t.querySelector(".dk_logSvc"),a=t.querySelector(".dk_logLevel"),r=t.querySelector(".dk_logText"),u=r===null?t.textContent??"":r.textContent??"",d=Number(t.dataset.logTs);if((!Number.isFinite(d)||d<=0)&&(d=null),d===null){let s=dr.exec(u);if(s!==null){let c=Date.parse(s[1]);Number.isFinite(c)&&(d=c,u=u.slice(s[0].length))}}return{svc:n===null?"":n.textContent.replace(/^\[|\]$/g,""),lv:a===null?"":a.textContent.trim(),ts:d,text:u}}function ya(t){let n=[];return t.svc!==""&&n.push("["+t.svc+"]"),t.ts!==null&&n.push(new Date(t.ts).toISOString()),t.lv!==""&&n.push(t.lv),n.length===0?t.text:n.join(" ")+" "+t.text}function xa(t){return Array.from(t.querySelectorAll(".dk_logLine")).filter(n=>n.querySelector(".dk_logText")!==null)}function Lt(t){let n=t==null?null:t.nodeType===Node.ELEMENT_NODE?t:t.parentElement;return n===null?null:n.closest(".dk_logLine")}function wa(t,n){let a=xa(t);if(a.length===0)return null;let r=null,u=null;try{let c=window.getSelection();if(c!==null&&c.isCollapsed===!1&&c.rangeCount>0){let k=c.getRangeAt(0);t.contains(k.commonAncestorContainer)&&(r=Lt(k.startContainer),u=Lt(k.endContainer))}}catch{}(r===null||u===null)&&(r=Lt(n.target),u=r);let d=a.indexOf(r),s=a.indexOf(u);if((d<0||s<0)&&(r=Lt(n.target),d=a.indexOf(r),s=d),d<0)return null;if(d>s){let c=d;d=s,s=c}return{rows:a,from:d,to:s}}function Na(t,n){let a=String(n.to-n.from+1);if(t.containers.length===1)return a+" \u884C \xB7 "+t.containers[0].name;let r=new Set;for(let u=n.from;u<=n.to;u+=1){let d=Tt(n.rows[u]).svc;d!==""&&r.add(d)}return r.size===0?a+" \u884C":a+" \u884C \xB7 "+[...r].slice(0,3).join("/")}function Sa(t,n){let a=n.rows,r=[];for(let v=n.from;v<=n.to&&r.length<nr;v+=1)r.push(Tt(a[v]));let u=a.slice(Math.max(0,n.from-gn),n.from).map(Tt),d=a.slice(n.to+1,Math.min(a.length,n.to+1+gn)).map(Tt),s=r.concat(u,d).map(v=>v.ts).filter(v=>v!==null),c=[...new Set(r.map(v=>v.svc).filter(v=>v!==""))],k=r.length<n.to-n.from+1,y=[];y.push("[dsh-docker] \u5BB9\u5668\u65E5\u5FD7\u7247\u6BB5"),y.push(""),y.push("- \u76EE\u6807\uFF1A"+(t.targetLabel!==""?t.targetLabel:t.target!==""?t.target:"\u672A\u77E5"));for(let v of t.containers.slice(0,3))y.push("- \u5BB9\u5668\uFF1A"+v.name+"\uFF08"+String(v.id)+(v.image===void 0||v.image===""?"":"\uFF0C\u955C\u50CF "+String(v.image))+"\uFF09");t.containers.length>3&&y.push("- \u5BB9\u5668\uFF1A\u53E6\u6709 "+String(t.containers.length-3)+" \u4E2A\uFF0C\u89C1\u5404\u884C\u7684 [service] \u524D\u7F00"),c.length>0&&y.push("- \u6D89\u53CA\u670D\u52A1\uFF1A"+c.join("\u3001")),y.push("- \u65F6\u95F4\u7A97\uFF1A"+(s.length===0?"\u672A\u542F\u7528\u65F6\u95F4\u6233\uFF0C\u65E0\u65F6\u95F4\u7A97":new Date(Math.min(...s)).toISOString()+" \u2192 "+new Date(Math.max(...s)).toISOString())),y.push("- \u9009\u4E2D\uFF1A"+String(r.length)+" \u884C"+(k?"\uFF08\u5DF2\u622A\u65AD\uFF0C\u4E0A\u9650 "+String(nr)+" \u884C\uFF09":"")+"\uFF0C\u53E6\u9644\u524D\u540E\u5404 "+String(gn)+" \u884C\u4E0A\u4E0B\u6587"+(t.filtered===!0?"\uFF08\u4E0A\u4E0B\u6587\u53D6\u81EA\u5F53\u524D\u8FC7\u6EE4\u540E\u7684\u89C6\u56FE\uFF09":""));let h=(v,T)=>{if(T.length!==0){y.push(""),y.push("--- "+v+" ---");for(let O of T)y.push(ya(O))}};return h("\u4E0A\u4E0B\u6587\uFF08\u524D "+String(u.length)+" \u884C\uFF09",u),h("\u9009\u4E2D\uFF08"+String(r.length)+" \u884C\uFF09",r),h("\u4E0A\u4E0B\u6587\uFF08\u540E "+String(d.length)+" \u884C\uFF09",d),y.push(""),y.push("\u9700\u8981\u66F4\u591A\u4E0A\u4E0B\u6587\u8BF7\u81EA\u884C\u62C9\u53D6\uFF0C\u4E0D\u8981\u81C6\u6D4B\u672A\u7ED9\u51FA\u7684\u5185\u5BB9\uFF1A`docker_logs` / `docker_inspect`\uFF0Ctarget="+JSON.stringify(t.target)+(t.containers.length===1?"\uFF0Cid="+JSON.stringify(t.containers[0].name):"")+"\u3002"),y.join(`
`)}let Et=null,It=null,Ot=null,Rt=null;function ut(){It!==null&&(It(),It=null),Et!==null&&(Et.remove(),Et=null)}function Mt(){Rt!==null&&(Rt(),Rt=null),Ot!==null&&(Ot.remove(),Ot=null)}function Ca(t,n,a){let u=t.getBoundingClientRect(),d=n,s=a;d+u.width>window.innerWidth-8&&(d=Math.max(8,n-u.width)),s+u.height>window.innerHeight-8&&(s=Math.max(8,a-u.height)),t.style.left=String(Math.round(d))+"px",t.style.top=String(Math.round(s))+"px"}function Bt(t,n="error"){let a=document.createElement("div");a.className="dk_askToast",a.dataset.kind=n,a.textContent=t,document.body.appendChild(a),setTimeout(()=>a.remove(),5e3)}let Pt="";function ar(t){t.ok!==!0&&Bt("\u672A\u80FD\u4EA4\u7ED9\u4F1A\u8BDD\uFF1A"+t.message)}function Ta(t){ut();let n=document.createElement("div");n.className="dk_menu",n.setAttribute("role","menu");let a=document.createElement("div");a.className="dk_menuHead",a.textContent=t.head,n.appendChild(a);let r=document.createElement("div");r.className="dk_menuSub",r.textContent=t.sub,n.appendChild(r);for(let k of t.items){let y=document.createElement("button");y.type="button",y.className="dk_menuItem",y.setAttribute("role","menuitem"),y.disabled=k.disabled===!0,k.disabled===!0&&(y.title=k.reason);let h=document.createElement("span");h.className="dk_menuItemLabel",h.textContent=k.label,y.appendChild(h);let v=document.createElement("span");v.className="dk_menuItemHint",v.textContent=k.disabled===!0?k.reason:k.hint??"",y.appendChild(v),k.disabled!==!0&&y.addEventListener("click",()=>{ut(),k.onPick()}),n.appendChild(y)}let u=document.createElement("div");u.className="dk_menuNote",u.textContent=t.note,n.appendChild(u),document.body.appendChild(n),Ca(n,t.x,t.y),Et=n;let d=k=>{k.key==="Escape"&&ut()},s=k=>{n.contains(k.target)||ut()},c=()=>ut();document.addEventListener("keydown",d,!0),document.addEventListener("mousedown",s,!0),document.addEventListener("wheel",c,{capture:!0,passive:!0}),document.addEventListener("touchmove",c,{capture:!0,passive:!0}),window.addEventListener("resize",c),It=()=>{document.removeEventListener("keydown",d,!0),document.removeEventListener("mousedown",s,!0),document.removeEventListener("wheel",c,!0),document.removeEventListener("touchmove",c,!0),window.removeEventListener("resize",c)}}function La(t){return navigator.clipboard!==void 0&&navigator.clipboard!==null?navigator.clipboard.writeText(t):new Promise((n,a)=>{let r=document.createElement("textarea");r.value=t,r.style.position="fixed",r.style.opacity="0",document.body.appendChild(r),r.select();let u=!1;try{u=document.execCommand("copy")}catch{u=!1}r.remove(),u?n():a(new Error("\u6D4F\u89C8\u5668\u62D2\u7EDD\u4E86\u590D\u5236"))})}function or(t,n){try{let a=typeof t.conversation.input?.for=="function"?t.conversation.input.for(t.actx):null;a!==null&&typeof a.notify=="function"&&a.notify("info",n)}catch{}}async function At(t,n){let a=rr();if(a.ok!==!0)return{ok:!1,message:a.reason};try{if(n==="draft"){let r=typeof a.conversation.input?.for=="function"?a.conversation.input.for(a.actx):null;return r===null||typeof r.setDraft!="function"?{ok:!1,message:"\u5BBF\u4E3B\u672A\u63D0\u4F9B\u4F1A\u8BDD\u8F93\u5165\u95E8\u9762\uFF0C\u65E0\u6CD5\u53EA\u586B\u8349\u7A3F"}:(r.setDraft(t),or(a,"\u65E5\u5FD7\u7247\u6BB5\u5DF2\u586B\u5165\u8F93\u5165\u6846\uFF0C\u786E\u8BA4\u540E\u518D\u53D1\u9001"),Bt("\u5DF2\u586B\u5165\u5F53\u524D\u4F1A\u8BDD\u7684\u8F93\u5165\u6846"+Pt,"ok"),{ok:!0,message:"\u5DF2\u586B\u5165\u8F93\u5165\u6846"})}return await a.conversation.send(t),or(a,"\u65E5\u5FD7\u7247\u6BB5\u5DF2\u53D1\u9001\u5230\u4F1A\u8BDD"),Bt("\u5DF2\u53D1\u9001\u65E5\u5FD7\u7247\u6BB5\u5230\u5F53\u524D\u4F1A\u8BDD"+Pt,"ok"),{ok:!0,message:"\u5DF2\u53D1\u9001"}}catch(r){return{ok:!1,message:r instanceof Error?r.message:String(r)}}}function Ea(t){Mt();let n=document.createElement("div");n.className="dk_askCard",n.setAttribute("role","dialog");let a=document.createElement("div");a.className="dk_askCardHead",a.textContent=t.head,n.appendChild(a);let r=document.createElement("textarea");r.className="dk_askCardText",r.spellcheck=!1,r.value=t.prompt,n.appendChild(r);let u=document.createElement("div");u.className="dk_askCardStatus",n.appendChild(u);let d=document.createElement("div");d.className="dk_askCardFoot";let s=(L,H,_)=>{let A=document.createElement("button");return A.type="button",A.className="dk_btn"+(H===void 0?"":" "+H),A.textContent=L,A.addEventListener("click",_),d.appendChild(A),A},c=s("\u53D1\u9001","dk_btnPrimary",()=>{v("send",c)}),k=s("\u53EA\u586B\u8F93\u5165\u6846",void 0,()=>{v("draft",k)});s("\u590D\u5236",void 0,()=>{La(r.value).then(()=>{u.textContent="\u5DF2\u590D\u5236\u8BCA\u65AD\u5305",u.dataset.kind="ok"},L=>{u.textContent="\u590D\u5236\u5931\u8D25\uFF1A"+(L instanceof Error?L.message:String(L)),u.dataset.kind="error"})});let y=s("\u53D6\u6D88",void 0,()=>Mt());n.appendChild(d);let h=document.createElement("div");h.className="dk_askCardHint",h.textContent="\u5185\u5BB9\u4F1A\u8FDB\u5165\u6A21\u578B\u4E0A\u4E0B\u6587\uFF0C\u8BF7\u7559\u610F\u5176\u4E2D\u7684\u51ED\u8BC1\u4E0E\u7528\u6237\u6570\u636E\u3002",n.appendChild(h);let v=async(L,H)=>{c.disabled=!0,k.disabled=!0,y.disabled=!0,H.textContent=L==="send"?"\u53D1\u9001\u4E2D\u2026":"\u5199\u5165\u4E2D\u2026";let _=await At(r.value,L);if(_.ok===!0){Mt();return}u.textContent=_.message,u.dataset.kind="error",c.disabled=!1,k.disabled=!1,y.disabled=!1,H.textContent=L==="send"?"\u53D1\u9001":"\u53EA\u586B\u8F93\u5165\u6846"};document.body.appendChild(n);let T=n.getBoundingClientRect();n.style.left=String(Math.round(Math.max(8,(window.innerWidth-T.width)/2)))+"px",n.style.top=String(Math.round(Math.max(8,(window.innerHeight-T.height)/2)))+"px",r.focus(),Ot=n;let O=L=>{L.key==="Escape"&&Mt()};document.addEventListener("keydown",O,!0),Rt=()=>document.removeEventListener("keydown",O,!0)}function ir(t,n,a){let r=wa(n,t);if(r===null)return;t.preventDefault();let u=rr(),d=()=>Sa(a,r),s=u.ok!==!0,c=s?u.reason:"";Ta({x:t.clientX,y:t.clientY,head:"\u95EE Agent",sub:Na(a,r)+(s?" \xB7 "+c:" \xB7 \u5F53\u524D\u4F1A\u8BDD"),items:[{label:"\u9884\u89C8\u540E\u53D1\u9001\u2026",hint:"\u53EF\u6539\u5B8C\u518D\u53D1",disabled:s,reason:c,onPick:()=>Ea({head:"\u53D1\u9001\u65E5\u5FD7\u7247\u6BB5\u5230\u5F53\u524D\u4F1A\u8BDD",prompt:d()})},{label:"\u76F4\u63A5\u53D1\u9001\u5230\u5F53\u524D\u4F1A\u8BDD",hint:"\u7ACB\u5373\u5F00\u59CB\u5206\u6790",disabled:s,reason:c,onPick:()=>{At(d(),"send").then(ar)}},{label:"\u53EA\u586B\u5165\u8F93\u5165\u6846",hint:"\u4E0D\u53D1\u9001",disabled:s,reason:c,onPick:()=>{At(d(),"draft").then(ar)}},{label:"\u4F1A\u8BDD\u8BA2\u9605\u63A2\u9488\uFF08spike\uFF09",hint:"\u65B9\u6848 B \u8BFB\u6570",disabled:jt===null,reason:"\u5BBF\u4E3B\u672A\u63D0\u4F9B\u53F3\u4FA7\u680F\u670D\u52A1\uFF08sidebarRight\uFF09",onPick:()=>{try{jt?.openTab?.(fr)}catch(k){Bt("\u6253\u5F00\u63A2\u9488\u5931\u8D25\uFF1A"+(k instanceof Error?k.message:String(k)))}}}],note:"\u65E5\u5FD7\u5185\u5BB9\u4F1A\u8FDB\u5165\u6A21\u578B\u4E0A\u4E0B\u6587\uFF0C\u8BF7\u7559\u610F\u5176\u4E2D\u7684\u51ED\u8BC1\u3002"})}function Ia(t){let n=t.item,a=t.config,[r,u]=p(t.initialTab??"overview"),d=_n(),[s,c]=p(null),[k,y]=p(""),[h,v]=p({tail:a.logTailDefault,timestamps:!1}),[T,O]=p(null),[L,H]=p(""),[_,A]=p(!1),[R,j]=p(""),[C,ne]=p(!1),[f,b]=p(3),[x,z]=p(!1),[U,q]=p([]),[ae,ke]=p(""),[Ye,me]=p(""),[De,be]=p(""),[ze,Ge]=p(!1),[ge,Fe]=p(!0),B=P([]),oe=P(""),ee=P(null),[X,ot]=p(null),[fe,we]=p(""),[ce,Te]=p(!1),[D,Z]=p(""),[re,Ne]=p(""),[_e,ve]=p({cpu:[],mem:[]}),Ve=P({cpu:[],mem:[]}),[Je,wn]=p(""),[Le,zt]=p(null),[Ft,pt]=p(""),[mt,Ke]=p(!1);E(()=>{let w=!0;return c(null),y(""),Q.inspect(t.target,n.id).then(M=>{w&&c(M.details?.[0]??null)}).catch(M=>{w&&y(M.message)}),()=>{w=!1}},[t.target,n.id,t.refreshToken]);let he=de(()=>{A(!0),H(""),Q.logs(t.target,n.id,{tail:h.tail,timestamps:h.timestamps}).then(w=>O(w.logs)).catch(w=>H(w.message)).finally(()=>A(!1))},[t.target,n.id,h.tail,h.timestamps]);E(()=>{r==="logs"&&he()},[r,he,t.refreshToken]),E(()=>{if(r!=="logs"||!C||x)return;let w=setInterval(he,Math.max(1,f)*1e3);return()=>clearInterval(w)},[r,C,f,he,x]),E(()=>{if(!d||r!=="logs"||!x)return;if(typeof EventSource!="function"){me("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u5B9E\u65F6\u8DDF\u968F"),z(!1);return}B.current=[],oe.current="",q([]),Ge(!1),me(""),be(""),Fe(!0),ke("connecting");let w=new URLSearchParams({target:t.target,id:n.id,tail:String(h.tail),...h.timestamps?{timestamps:"1"}:{}}),M=new EventSource(Wn+"/logs/stream?"+w.toString()),N=!1,F=()=>{if(!N){N=!0;try{M.close()}catch{}}},V=K=>{if(K==="")return;let W=(oe.current+K).split(`
`);if(oe.current=W.pop()??"",W.length===0)return;let ue=B.current.concat(W),qe=ue.length>Ie?ue.slice(ue.length-Ie):ue;B.current=qe,qe.length!==ue.length&&Ge(!0),q(qe)},G=K=>{let W=null;try{W=JSON.parse(K.data)}catch{return}W===null||typeof W!="object"||(typeof W.d=="string"?V(W.d):typeof W.e=="string"&&V(W.e))},se=K=>{let W=null;try{W=JSON.parse(K.data)}catch{}let ue=W!==null&&typeof W.reason=="string"?W.reason:"container-exit",qe=W!==null&&typeof W.code=="number"?W.code:null;if(ue==="container-exit"){be("\u5BB9\u5668\u5DF2\u9000\u51FA"+(qe===null?"":"\uFF08\u9000\u51FA\u7801 "+String(qe)+"\uFF09")+"\uFF0C\u65E5\u5FD7\u6D41\u7ED3\u675F\uFF0C\u5DF2\u5207\u56DE\u5FEB\u7167"),F(),z(!1),he();return}ke("reconnecting"),be("\u670D\u52A1\u7AEF\u5DF2\u505C\u6B62\u65E5\u5FD7\u6D41\uFF0C\u6B63\u5728\u91CD\u8FDE\u2026")},J=K=>{if(typeof K.data=="string"&&K.data!==""){let W="\u65E5\u5FD7\u6D41\u5F02\u5E38";try{let ue=JSON.parse(K.data);ue!==null&&typeof ue.message=="string"&&(W=ue.message)}catch{}me(W),F(),z(!1),he();return}ke(M.readyState===2?"closed":"reconnecting")};return M.addEventListener("line",G),M.addEventListener("end",se),M.addEventListener("error",J),M.onopen=()=>{ke("open"),be("")},F},[r,x,t.target,n.id,h.tail,h.timestamps,he]),E(()=>{if(r!=="logs"||!x||!ge)return;let w=ee.current;w!==null&&(w.scrollTop=w.scrollHeight)},[d,r,x,ge,U]);let Vt=()=>{if(x){z(!1),ke(""),he();return}z(!0),ne(!1),me(""),be("")},Nn=()=>{if(ce){Te(!1),Z("");return}Te(!0),Ne(""),we("")},ft=()=>D==="open"?"\u5B9E\u65F6\u8DDF\u968F\u4E2D\uFF08docker stats\uFF09":D==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u7EDF\u8BA1\u6D41\u2026":D==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":D==="closed"?"\u7EDF\u8BA1\u6D41\u5DF2\u65AD\u5F00":"\u7EDF\u8BA1\u6D41",Kt=()=>{let w=ee.current;w!==null&&(w.scrollTop=w.scrollHeight),Fe(!0)},Ue=w=>{if(!x)return;let M=w.currentTarget;Fe(M.scrollHeight-M.scrollTop-M.clientHeight<24)},je=()=>ae==="open"?"\u5B9E\u65F6\u8DDF\u968F\u4E2D\uFF08docker logs -f\uFF09":ae==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u65E5\u5FD7\u6D41\u2026":ae==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":ae==="closed"?"\u65E5\u5FD7\u6D41\u5DF2\u65AD\u5F00":"\u65E5\u5FD7\u6D41";E(()=>{if(r!=="stats"||ce)return;let w=!0,M=()=>{Q.stats(t.target,[n.id]).then(F=>{w&&(ot(F.stats?.[0]??null),we(""))}).catch(F=>{w&&we(F.message)})};M();let N=setInterval(M,Math.max(2,a.pollIntervalSec)*1e3);return()=>{w=!1,clearInterval(N)}},[r,ce,t.target,n.id,a.pollIntervalSec,t.refreshToken]),E(()=>{if(!d||r!=="stats"||!ce)return;if(typeof EventSource!="function"){Ne("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u5B9E\u65F6\u8DDF\u968F"),Te(!1);return}Ve.current={cpu:[],mem:[]},ve({cpu:[],mem:[]}),Z("connecting"),Ne(""),we("");let w=new EventSource(rn("/stats/stream",{target:t.target,ids:n.id})),M=!1,N=()=>{if(!M){M=!0;try{w.close()}catch{}}},F=se=>{let J=null;try{J=JSON.parse(se.data)}catch{return}if(J===null||typeof J!="object")return;let K=typeof J.cpuPercent=="number"?J.cpuPercent:null,W=typeof J.memPercent=="number"?J.memPercent:null;ot(J),we("");let ue={cpu:K===null?Ve.current.cpu:$n(Ve.current.cpu,K,Yn),mem:W===null?Ve.current.mem:$n(Ve.current.mem,W,Yn)};Ve.current=ue,ve(ue)},V=se=>{let J=null;try{J=JSON.parse(se.data)}catch{}let K=J!==null&&typeof J.reason=="string"?J.reason:"stats-exit",W=J!==null&&typeof J.code=="number"?J.code:null;Ne("\u7EDF\u8BA1\u6D41\u5DF2\u7ED3\u675F"+(K==="stats-exit"?"\uFF08docker stats \u9000\u51FA"+(W===null?"":"\uFF0C\u9000\u51FA\u7801 "+String(W))+"\uFF09":"")+"\uFF0C\u5DF2\u5207\u56DE\u5FEB\u7167\u8F6E\u8BE2"),N(),Te(!1)},G=se=>{if(typeof se.data=="string"&&se.data!==""){let J="\u7EDF\u8BA1\u6D41\u5F02\u5E38";try{let K=JSON.parse(se.data);K!==null&&typeof K.message=="string"&&(J=K.message)}catch{}we(J),N(),Te(!1);return}Z(w.readyState===2?"closed":"reconnecting")};return w.addEventListener("stats",F),w.addEventListener("end",V),w.addEventListener("error",G),w.onopen=()=>{Z("open"),Ne("")},N},[d,r,ce,t.target,n.id]);let Wt=()=>{Je.trim()!==""&&(Ke(!0),pt(""),zt(null),Q.exec(t.target,n.id,Je,a.execTimeoutSec).then(w=>zt(w.result)).catch(w=>pt(w.message)).finally(()=>Ke(!1)))},Gt=()=>{if(k!=="")return e(Y,{title:"\u8BFB\u53D6\u5BB9\u5668\u8BE6\u60C5\u5931\u8D25",hint:k});if(s===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let w=[["\u72B6\u6001",s.state+(s.health===null?"":" / "+s.health)+(s.status===""?"":"\uFF08"+s.status+"\uFF09")],["\u955C\u50CF",s.image],["\u5BB9\u5668 ID",s.shortId],["\u542F\u52A8\u65F6\u95F4",s.startedAt??"\u2014"],["\u7ED3\u675F\u65F6\u95F4",s.finishedAt??"\u2014"],["\u9000\u51FA\u7801",s.exitCode===null?"\u2014":String(s.exitCode)],["\u91CD\u542F\u6B21\u6570",s.restartCount===null?"\u2014":String(s.restartCount)],["\u91CD\u542F\u7B56\u7565",s.restartPolicy??"\u2014"],["PID",s.pid===null?"\u2014":String(s.pid)],["\u7AEF\u53E3",s.ports.length===0?"\u2014":an(s.ports)],["\u6302\u8F7D",s.mounts.length===0?"\u2014":s.mounts.map(N=>N.source+"\u2192"+N.destination+(N.readWrite?"":"\uFF08\u53EA\u8BFB\uFF09")).join(`
`)],["\u7F51\u7EDC",s.networks.length===0?"\u2014":s.networks.map(N=>N.name+(N.ip===null?"":"\uFF08"+N.ip+"\uFF09")).join(", ")],["\u547D\u4EE4",(s.entrypoint+" "+s.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",s.workingDir===""?"\u2014":s.workingDir],["\u7528\u6237",s.user===""?"\u2014":s.user]],M=o("div",{className:"dk_kv",children:w.flatMap(([N,F],V)=>[e("div",{className:"dk_kvKey",children:N},"k"+String(V)),e("div",{className:"dk_kvVal"+(N==="\u5BB9\u5668 ID"||N==="\u547D\u4EE4"||N==="\u955C\u50CF"?" dk_kvValMono":""),children:F},"v"+String(V))])});return o("div",{children:[s.healthLogTail===null?null:e("div",{className:"dk_hint",style:{marginBottom:8},children:"\u6700\u8FD1\u5065\u5EB7\u68C0\u67E5\u8F93\u51FA\uFF1A"+s.healthLogTail}),M,e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u4E00\u6B21\u6027\u547D\u4EE4\uFF08docker exec\uFF09"}),a.allowExec!==!0?e(Y,{kind:"info",title:"exec \u672A\u542F\u7528",hint:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8 exec\u300D\uFF0C\u6216\u76F4\u63A5\u590D\u5236\u5361\u7247\u4E0A\u7684 exec \u547D\u4EE4\u5230\u7EC8\u7AEF\u9762\u677F\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u3002"}):o("div",{children:[o("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u5982 ls -la /app \u6216 cat /etc/nginx/nginx.conf",value:Je,onChange:N=>wn(N.target.value),onKeyDown:N=>{N.key==="Enter"&&Wt()}}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:mt,onClick:Wt,children:mt?"\u6267\u884C\u4E2D\u2026":"\u6267\u884C"})]}),Ft===""?null:e(Y,{title:"\u6267\u884C\u5931\u8D25",hint:Ft}),Le===null?null:o("div",{style:{marginTop:8},children:[e("div",{className:"dk_hint",children:"\u9000\u51FA\u7801 "+(Le.code===null?"?":String(Le.code))+" \xB7 \u8017\u65F6 "+String(Le.durationMs)+"ms"+(Le.truncated?" \xB7 \u8F93\u51FA\u5DF2\u622A\u65AD":"")}),e("pre",{className:"dk_logBox",style:{marginTop:6},children:(Le.stdout||"")+(Le.stderr===""?"":`
[stderr]
`+Le.stderr)||"(\u65E0\u8F93\u51FA)"})]})]})]})},ye=()=>{let w=x?U.join(`
`):T!==null&&typeof T=="object"&&typeof T.text=="string"?T.text:"",M=R.trim().toLowerCase(),N=w===""?[]:w.split(`
`),F=M===""?N:N.filter(V=>V.toLowerCase().includes(M));return{raw:w,needle:M,allLines:N,matchedLines:F}},Se=(w,M,N,F)=>e("button",{type:"button",className:"dk_pill"+(F?.className??""),"data-on":w?"1":"0",disabled:F?.disabled===!0,title:F?.title??"",onClick:N,children:M}),Jt=()=>{let{raw:w}=ye(),M=[...new Set([100,200,500,1e3,5e3,Number(a.logTailDefault)||200,Number(h.tail)||200])].filter(N=>Number.isInteger(N)&&N>0).sort((N,F)=>N-F);return o("div",{className:"dk_logTools",children:[e("span",{className:"dk_toolLabel",children:"LINES"}),e("select",{className:"dk_select dk_selectSm",value:String(h.tail),onChange:N=>v({...h,tail:Number(N.target.value)}),children:M.map(N=>e("option",{value:String(N),children:N===5e3?"Last 5000":"Last "+String(N)},String(N)))}),e("span",{className:"dk_toolLabel",children:"TIMESTAMPS"}),Se(h.timestamps,h.timestamps?"On":"Off",()=>v({...h,timestamps:!h.timestamps})),e("span",{className:"dk_toolLabel",children:"FOLLOW"}),Se(x,x?"On":"Off",Vt,{className:" dk_pillFollow",title:x?"\u5173\u95ED\u5B9E\u65F6\u8DDF\u968F\uFF08\u56DE\u5230\u65E5\u5FD7\u5FEB\u7167\uFF09":"\u5B9E\u65F6\u8DDF\u968F\u5BB9\u5668\u65E5\u5FD7\uFF08docker logs -f\uFF09"}),e("span",{className:"dk_toolLabel",children:"AUTO REFRESH"}),Se(C,C?"On":"Off",()=>ne(N=>!N),{disabled:x,title:x?"FOLLOW \u6253\u5F00\u65F6\u6682\u505C\u8F6E\u8BE2":"\u6309\u4E0B\u65B9\u95F4\u9694\u91CD\u65B0\u62C9\u53D6\u65E5\u5FD7\u5FEB\u7167"}),e("select",{className:"dk_select dk_selectSm",value:String(f),disabled:x,title:"\u81EA\u52A8\u5237\u65B0\u95F4\u9694\uFF08\u5F00\u542F AUTO REFRESH \u540E\u6309\u6B64\u8F6E\u8BE2\uFF09",onChange:N=>b(Number(N.target.value)),children:[2,3,5,10].map(N=>e("option",{value:String(N),children:String(N)+"s"},String(N)))}),e($,{icon:et,title:"\u5237\u65B0\u65E5\u5FD7",spin:_,onClick:he},"refresh"),e($,{icon:Do,title:"\u4E0B\u8F7D\u65E5\u5FD7",disabled:w==="",onClick:()=>jr(n.name+".log",w)},"download")]})},Ut=()=>{let{needle:w,allLines:M,matchedLines:N}=ye();return o("div",{className:"dk_filterBar",children:[o("div",{className:"dk_filterWrap",children:[e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u65E5\u5FD7\u2026",value:R,onChange:F=>j(F.target.value),onKeyDown:F=>{F.key==="Escape"&&R!==""&&(F.stopPropagation(),j(""))}}),R===""?null:e("button",{type:"button",className:"dk_filterClear",title:"\u6E05\u7A7A\u8FC7\u6EE4","aria-label":"\u6E05\u7A7A\u8FC7\u6EE4",onClick:()=>j(""),children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"clear")]}),e("span",{className:"dk_filterCount",children:w===""?String(M.length)+" \u884C":String(N.length)+" / "+String(M.length)+" \u884C\u5339\u914D"})]})},qt=()=>{let{needle:w,matchedLines:M}=ye(),N=M.length>ct?M.slice(-ct):M;return o("div",{className:"dk_logs",children:[L===""?null:e(Y,{title:"\u8BFB\u53D6\u65E5\u5FD7\u5931\u8D25",hint:L+(L.includes("Failed to fetch")?"\uFF08\u7F51\u7EDC\u8BF7\u6C42\u6CA1\u5230\u5BBF\u4E3B\uFF1A\u5BBF\u4E3B\u53EF\u80FD\u521A\u91CD\u542F\u3001\u6216\u8FDE\u63A5\u88AB\u4E2D\u65AD\uFF09":""),action:e("button",{type:"button",className:"dk_btn",disabled:_,onClick:he,children:"\u91CD\u8BD5"})}),Ye===""?null:e(Y,{title:"\u65E5\u5FD7\u6D41\u4E2D\u65AD",hint:Ye,action:e("button",{type:"button",className:"dk_btn",onClick:Vt,children:"\u91CD\u8BD5"})}),De===""?null:e(Y,{kind:"info",title:De}),ze?e(Y,{kind:"warn",title:"\u65E5\u5FD7\u8D85\u8FC7 "+String(Ie)+" \u884C\uFF0C\u5DF2\u4E22\u5F03\u6700\u65E9\u5185\u5BB9",hint:"\u6D41\u5F0F\u65E5\u5FD7\u53EA\u4FDD\u7559\u6700\u8FD1\u7684\u884C\uFF1B\u9700\u8981\u5B8C\u6574\u5386\u53F2\u8BF7\u7528\u5FEB\u7167\u6216\u300C\u4E0B\u8F7D\u65E5\u5FD7\u300D\u3002"}):null,!x&&T!==null&&T.truncated===!0?e(Y,{kind:"warn",title:"\u65E5\u5FD7\u8F93\u51FA\u8D85\u8FC7\u4E0A\u9650\uFF0C\u5DF2\u622A\u65AD",hint:"\u8C03\u5C0F\u300CLINES\u300D\u6216\u5230\u8BBE\u7F6E\u5361\u7247\u8C03\u5927\u300C\u5355\u6B21\u547D\u4EE4\u8F93\u51FA\u4E0A\u9650\u300D\u3002"}):null,x?e("div",{className:"dk_followState","data-state":ae,children:je()}):null,o("div",{className:"dk_logBody",ref:ee,onScroll:Ue,onContextMenu:F=>ir(F,ee.current,{target:t.target,targetLabel:t.targetLabel??"",containers:[n],filtered:w!==""}),children:[M.length>N.length?e("div",{className:"dk_logLine dk_logMore",children:"\uFF08\u53EA\u663E\u793A\u6700\u8FD1 "+String(ct)+" \u884C\uFF0C\u5171 "+String(M.length)+" \u884C\u5339\u914D\uFF09"},"more"):null,L!==""?null:!x&&T===null?e("div",{className:"dk_logLine",children:"\u8BFB\u53D6\u4E2D\u2026"},"loading"):N.length===0?e("div",{className:"dk_logLine",children:x?"\u7B49\u5F85\u65E5\u5FD7\u2026":w===""?"(\u65E0\u65E5\u5FD7)":"(\u65E0\u5339\u914D\u65E5\u5FD7)"},"empty"):N.map((F,V)=>ba(F,V,w))]}),x&&!ge?e("button",{type:"button",className:"dk_backToBottom",onClick:Kt,children:"\u56DE\u5230\u5E95\u90E8"}):null]})},$e=()=>{let w=ce,M=o("div",{className:"dk_statsBar",children:[e("span",{className:"dk_toolLabel",children:"FOLLOW"}),Se(w,w?"On":"Off",Nn,{className:" dk_pillFollow",title:w?"\u5173\u95ED\u5B9E\u65F6\u8DDF\u968F\uFF08\u56DE\u5230 docker stats \u5FEB\u7167\uFF09":"\u5B9E\u65F6\u8DDF\u968F\u8D44\u6E90\u5360\u7528\uFF08docker stats \u6BCF\u79D2\u4E00\u884C\uFF09"}),e("span",{className:"dk_hint",children:w?"60 \u70B9 \u2248 \u6700\u8FD1 1 \u5206\u949F":"\u6253\u5F00 FOLLOW \u770B\u5B9E\u65F6\u8D8B\u52BF"}),e("span",{className:"dk_headerSpacer"}),w?e("span",{className:"dk_followState","data-state":D,children:ft()}):null]}),N=K=>o("div",{className:"dk_statsView",children:[M,K]});if(re!=="")return N(o("div",{children:[e(Y,{kind:"info",title:re}),fe===""?null:e(Y,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:fe})]}));if(fe!=="")return N(e(Y,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:fe}));if(X===null)return N(e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}));let F=X.cpuPercent??0,V=X.memPercent??0,G=K=>o("div",{className:"dk_bar",children:[e("div",{className:"dk_barFill","data-warn":K>=60&&K<85?"1":void 0,"data-danger":K>=85?"1":void 0,style:{width:Math.min(100,Math.max(0,K))+"%"}})]}),se=Math.max(100,..._e.cpu),J=(K,W,ue)=>o("tr",{children:[e("td",{children:K}),e("td",{className:"dk_num",children:W}),e("td",{children:ue??null})]},K);return N(o("table",{className:"dk_stats",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u6307\u6807"}),e("th",{children:"\u6570\u503C"}),e("th",{children:"\u5360\u7528 / \u8D8B\u52BF"})]})}),e("tbody",{children:[J("CPU",Eo(X.cpuPercent),o("div",{className:"dk_trend",children:[G(F),w||_e.cpu.length>0?e(Zn,{values:_e.cpu,max:se,alertAt:85,title:"CPU% \u6700\u8FD1 60 \u4E2A\u91C7\u6837"}):null]})),J("\u5185\u5B58",X.memUsage,o("div",{className:"dk_trend",children:[G(V),w||_e.mem.length>0?e(Zn,{values:_e.mem,max:100,alertAt:85,title:"\u5185\u5B58\u5360\u7528% \u6700\u8FD1 60 \u4E2A\u91C7\u6837"}):null]})),J("\u7F51\u7EDC IO",X.netIO,null),J("\u78C1\u76D8 IO",X.blockIO,null),J("PIDs",X.pids===null?"\u2014":String(X.pids),null)]})]}))},Xt=[["overview","\u6982\u89C8"],["logs","\u65E5\u5FD7"],["stats","\u7EDF\u8BA1"]],Sn=r==="overview"?s===null&&k==="":r==="stats"?X===null&&fe==="":!1;return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:tt,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:n.name,children:n.name}),e(lt,{state:n.state,health:n.health,status:n.status}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),r==="logs"?Jt():e($,{icon:et,title:"\u5237\u65B0",spin:Sn,onClick:t.onRefresh},"refresh"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"close")]}),o("div",{className:"dk_tabs",children:[...Xt.map(([w,M])=>e("button",{type:"button",className:"dk_tab","data-on":r===w?"1":"0",onClick:()=>u(w),children:M},w)),r==="logs"?e("span",{className:"dk_headerSpacer"},"spacer"):null,r==="logs"?Ut():null]}),e("div",{className:"dk_detailBody",children:r==="overview"?Gt():r==="logs"?qt():$e()})]})}function hn(t){return t.dangling===!0?t.id:t.reference}function Oa(t){let n=t.item,a=hn(n),[r,u]=p("overview"),[d,s]=p(null),[c,k]=p(""),[y,h]=p(!1),v=de(()=>{h(!0),k(""),Q.imageInspect(t.target,a).then(_=>s(_.image)).catch(_=>k(_.message)).finally(()=>h(!1))},[t.target,a]);E(()=>{v()},[v]);let T=_=>o("div",{className:"dk_kv",children:_.flatMap(([A,R],j)=>[e("div",{className:"dk_kvKey",children:A},"k"+String(j)),e("div",{className:"dk_kvVal"+(["ID","\u5165\u53E3","digest"].indexOf(A)>=0?" dk_kvValMono":""),children:R},"v"+String(j))])}),O=()=>{if(c!=="")return e(Y,{title:"\u8BFB\u53D6\u955C\u50CF\u8BE6\u60C5\u5931\u8D25",hint:c,action:e("button",{type:"button",className:"dk_btn",onClick:v,children:"\u91CD\u8BD5"})});if(d===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let _=d.detail,A=[["\u6807\u7B7E",_.repoTags.length===0?"<none>\uFF08dangling\uFF09":_.repoTags.join(`
`)],["ID",_.id],["\u5927\u5C0F",_.size===null?"\u2014":on(_.size)],["\u542B\u7236\u5C42",_.virtualSize===null?"\u2014":on(_.virtualSize)],["\u521B\u5EFA",_.created===""?"\u2014":Nt(_.created)],["\u5E73\u53F0",_.os===""&&_.architecture===""?"\u2014":_.os+"/"+_.architecture],["\u5C42\u6570",String(_.layerCount)],["\u5165\u53E3",(_.entrypoint+" "+_.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",_.workingDir===""?"\u2014":_.workingDir],["\u7528\u6237",_.user===""?"\u2014":_.user],["\u66B4\u9732\u7AEF\u53E3",_.exposedPorts.length===0?"\u2014":_.exposedPorts.join(", ")],["digest",_.repoDigests.length===0?"\u2014":_.repoDigests.join(`
`)]],R=Object.entries(_.labels);return o("div",{children:[T(A),e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u5C42\uFF08"+String(_.layerCount)+"\uFF09"}),_.layers.length===0?e("span",{className:"dk_hint",children:"\u8BE5\u955C\u50CF\u6CA1\u6709\u5C42\u4FE1\u606F\uFF08scratch \u6784\u5EFA\u6216\u65E7\u7248 docker\uFF09\u3002"}):e("div",{className:"dk_layerList",children:_.layers.map((j,C)=>o("div",{className:"dk_layerItem",children:[e("span",{className:"dk_layerIndex",children:"#"+String(C)}),e("span",{className:"dk_mono dk_layerId",title:j,children:j.replace(/^sha256:/,"")})]},j+String(C)))}),R.length===0?null:o("div",{children:[e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u6807\u7B7E\uFF08"+String(R.length)+"\uFF09"}),e("div",{className:"dk_labelList",children:R.map(([j,C])=>o("div",{className:"dk_labelItem",children:[e("span",{className:"dk_labelKey",children:j}),e("span",{className:"dk_labelVal",title:C,children:C})]},j))})]})]})},L=()=>c!==""?e(Y,{title:"\u8BFB\u53D6\u955C\u50CF\u8BE6\u60C5\u5931\u8D25",hint:c}):d===null?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):d.historyError!==null?e(Y,{kind:"warn",title:"\u8BFB\u53D6\u6784\u5EFA\u5386\u53F2\u5931\u8D25",hint:d.historyError}):d.history.length===0?o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u6CA1\u6709\u6784\u5EFA\u5386\u53F2"}),e("div",{className:"dk_emptyHint",children:"\u8BE5 docker \u7248\u672C\u65E2\u6CA1\u6709 history --format\uFF08\u9700\u8981 Docker \u2265 26\uFF09\uFF0C\u7EAF\u6587\u672C\u8868\u683C\u4E5F\u6CA1\u89E3\u6790\u51FA\u5185\u5BB9\u3002"})]}):e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images dk_historyTable",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u5C42 ID"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u6784\u5EFA\u547D\u4EE4"})]})}),e("tbody",{children:d.history.map((_,A)=>o("tr",{children:[e("td",{className:"dk_mono",children:_.shortId}),e("td",{children:_.createdSince===""?_.created===""?"\u2014":Nt(_.created):_.createdSince}),e("td",{children:_.sizeText===""?_.size===null?"\u2014":on(_.size):_.sizeText}),e("td",{className:"dk_mono dk_historyCmd",title:_.createdBy,children:_.createdBy===""?"\u2014":_.createdBy})]},String(A)))})]})}),H=[["overview","\u6982\u89C8"],["history","\u6784\u5EFA\u5386\u53F2"]];return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:tt,title:"\u8FD4\u56DE\u955C\u50CF\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:a,children:a}),n.dangling===!0?e("span",{className:"dk_badge","data-state":"paused",children:"dangling"}):null,e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e($,{icon:et,title:"\u5237\u65B0\u955C\u50CF\u8BE6\u60C5",spin:y,onClick:v},"refresh"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"close")]}),e("div",{className:"dk_tabs",children:H.map(([_,A])=>e("button",{type:"button",className:"dk_tab","data-on":r===_?"1":"0",onClick:()=>u(_),children:A},_))}),e("div",{className:"dk_detailBody",children:r==="overview"?O():L()})]})}function Ra(t){let n=t.item,a=n.name,[r,u]=p("overview"),[d,s]=p(null),[c,k]=p(""),[y,h]=p(!1),[v,T]=p(!1),[O,L]=p(!1),[H,_]=p(""),A=de(()=>{h(!0),k(""),Q.networkInspect(t.target,a).then(f=>s(f.network)).catch(f=>k(f.message)).finally(()=>h(!1))},[t.target,a]);E(()=>{A()},[A]);let R=()=>{L(!0),_(""),Q.networkRemove(t.target,a).then(f=>t.onRemoved(f.result.message)).catch(f=>{T(!1),_(f.message)}).finally(()=>L(!1))},j=()=>{if(c!=="")return e(Y,{title:"\u8BFB\u53D6\u7F51\u7EDC\u8BE6\u60C5\u5931\u8D25",hint:c,action:e("button",{type:"button",className:"dk_btn",onClick:A,children:"\u91CD\u8BD5"})});if(d===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let f=d.detail,b=[["\u540D\u79F0",f.name],["ID",f.id],["\u9A71\u52A8",f.driver===""?"\u2014":f.driver],["\u8303\u56F4",f.scope===""?"\u2014":f.scope],["\u521B\u5EFA",f.created===""?"\u2014":Nt(f.created)],["\u5B50\u7F51",f.subnets.length===0?"\u2014":f.subnets.map(x=>x.subnet===""?"\u2014":x.subnet).join(`
`)],["\u7F51\u5173",f.subnets.length===0?"\u2014":f.subnets.map(x=>x.gateway===""?"\u2014":x.gateway).join(`
`)],["\u5C5E\u6027",[f.internal?"internal":"",f.attachable?"attachable":"",f.ingress?"ingress":"",f.enableIpv6?"ipv6":""].filter(x=>x!=="").join(" \xB7 ")||"\u2014"],["\u9009\u9879",Object.keys(f.options).length===0?"\u2014":Object.entries(f.options).map(([x,z])=>x+"="+z).join(`
`)],["\u6807\u7B7E",Object.keys(f.labels).length===0?"\u2014":Object.entries(f.labels).map(([x,z])=>x+"="+z).join(`
`)]];return e(qn,{rows:b,mono:["ID","\u5B50\u7F51","\u7F51\u5173","\u9009\u9879","\u6807\u7B7E"]})},C=()=>{if(c!=="")return e(Y,{title:"\u8BFB\u53D6\u7F51\u7EDC\u8BE6\u60C5\u5931\u8D25",hint:c});if(d===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let f=d.detail.containers;return f.length===0?e("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u6CA1\u6709\u5BB9\u5668\u63A5\u5165\u8FD9\u4E2A\u7F51\u7EDC"})]}):e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u5BB9\u5668"}),e("th",{children:"IPv4"}),e("th",{children:"IPv6"}),e("th",{children:"MAC"})]})}),e("tbody",{children:f.map(b=>o("tr",{children:[e("td",{className:"dk_mono",title:b.id,children:b.name===""?b.shortId:b.name}),e("td",{className:"dk_mono",children:b.ipv4===""?"\u2014":b.ipv4}),e("td",{className:"dk_mono",children:b.ipv6===""?"\u2014":b.ipv6}),e("td",{className:"dk_mono",children:b.mac===""?"\u2014":b.mac})]},b.id))})]})})},ne=[["overview","\u6982\u89C8"],["containers","\u63A5\u5165\u7684\u5BB9\u5668"+(d===null?"":"\uFF08"+String(d.detail.containers.length)+"\uFF09")]];return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:tt,title:"\u8FD4\u56DE\u7F51\u7EDC\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:Vo}}),e("span",{className:"dk_detailTitle",title:a,children:a}),n.internal===!0?e("span",{className:"dk_badge","data-state":"paused",children:"internal"}):null,e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e($,{icon:et,title:"\u5237\u65B0\u7F51\u7EDC\u8BE6\u60C5",spin:y,onClick:A},"refresh"),e($,{icon:dn,danger:!0,disabled:t.allowMutations!==!0,title:t.allowMutations===!0?"\u5220\u9664\u7F51\u7EDC\uFF08\u4E0D\u53EF\u6062\u590D\uFF09":"\u5220\u9664\u7F51\u7EDC\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>T(!0)},"remove"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"close")]}),e("div",{className:"dk_tabs",children:ne.map(([f,b])=>e("button",{type:"button",className:"dk_tab","data-on":r===f?"1":"0",onClick:()=>u(f),children:b},f))}),o("div",{className:"dk_detailBody",children:[H===""?null:e(Y,{title:"\u5220\u9664\u7F51\u7EDC\u5931\u8D25",hint:H}),r==="overview"?j():C()]}),v?e(dt,{title:"\u5220\u9664\u7F51\u7EDC",text:"\u786E\u5B9A\u5220\u9664\u7F51\u7EDC "+a+"\uFF1F\u8FD8\u6709\u5BB9\u5668\u63A5\u7740\u65F6 docker \u4F1A\u62D2\u7EDD\uFF1B\u5220\u9664\u540E\u4F9D\u8D56\u5B83\u7684\u5BB9\u5668\u4F1A\u5931\u53BB\u7F51\u7EDC\uFF0C\u9700\u8981\u91CD\u65B0\u521B\u5EFA\u6216\u63A5\u5165\u522B\u7684\u7F51\u7EDC\u3002",confirmLabel:"\u5220\u9664",busy:O,onCancel:()=>T(!1),onConfirm:R},"confirm"):null]})}function Ma(t){let a=t.item.name,[r,u]=p(null),[d,s]=p(""),[c,k]=p(!1),[y,h]=p(!1),[v,T]=p(!1),[O,L]=p(""),H=de(()=>{k(!0),s(""),Q.volumeInspect(t.target,a).then(R=>u(R.volume)).catch(R=>s(R.message)).finally(()=>k(!1))},[t.target,a]);E(()=>{H()},[H]);let _=()=>{T(!0),L(""),Q.volumeRemove(t.target,a).then(R=>t.onRemoved(R.result.message)).catch(R=>{h(!1),L(R.message)}).finally(()=>T(!1))},A=()=>{if(d!=="")return e(Y,{title:"\u8BFB\u53D6\u5377\u8BE6\u60C5\u5931\u8D25",hint:d,action:e("button",{type:"button",className:"dk_btn",onClick:H,children:"\u91CD\u8BD5"})});if(r===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let R=r.detail,j=[["\u540D\u79F0",R.name],["\u9A71\u52A8",R.driver===""?"\u2014":R.driver],["\u8303\u56F4",R.scope===""?"\u2014":R.scope],["\u6302\u8F7D\u70B9",R.mountpoint===""?"\u2014":R.mountpoint],["\u521B\u5EFA",R.created===""?"\u2014":Nt(R.created)],["\u9009\u9879",Object.keys(R.options).length===0?"\u2014":Object.entries(R.options).map(([C,ne])=>C+"="+ne).join(`
`)],["\u6807\u7B7E",Object.keys(R.labels).length===0?"\u2014":Object.entries(R.labels).map(([C,ne])=>C+"="+ne).join(`
`)]];return e(qn,{rows:j,mono:["\u6302\u8F7D\u70B9","\u9009\u9879","\u6807\u7B7E"]})};return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:tt,title:"\u8FD4\u56DE\u5377\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:Ko}}),e("span",{className:"dk_detailTitle",title:a,children:a}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e($,{icon:et,title:"\u5237\u65B0\u5377\u8BE6\u60C5",spin:c,onClick:H},"refresh"),e($,{icon:dn,danger:!0,disabled:t.allowMutations!==!0,title:t.allowMutations===!0?"\u5220\u9664\u5377\uFF08\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u6CA1\uFF0C\u4E0D\u53EF\u6062\u590D\uFF09":"\u5220\u9664\u5377\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>h(!0)},"remove"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"close")]}),o("div",{className:"dk_detailBody",children:[O===""?null:e(Y,{title:"\u5220\u9664\u5377\u5931\u8D25",hint:O}),A()]}),y?e(dt,{title:"\u5220\u9664\u5377",text:"\u786E\u5B9A\u5220\u9664\u5377 "+a+"\uFF1F\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u5220\u9664\u4E14\u4E0D\u53EF\u6062\u590D\uFF1B\u8FD8\u6709\u5BB9\u5668\u5360\u7528\u65F6 docker \u4F1A\u62D2\u7EDD\u3002",confirmLabel:"\u5220\u9664",busy:v,onCancel:()=>h(!1),onConfirm:_},"confirm"):null]})}let Ba=2e3;function Pa(t,n,a){let r=a+n,u=r.split(/\r\n|\r|\n/),d="";/[\r\n]$/.test(r)||(d=u.pop()??"");let s=t.slice();for(let c of u){let k=c.trim();if(k==="")continue;let y=/^([0-9a-f]{6,}|[A-Za-z][A-Za-z0-9 _-]*?):\s/.exec(k),h=y===null?null:y[1];h!==null&&s.length>0&&s[s.length-1].key===h?s[s.length-1]={key:h,text:k}:s.push({key:h,text:k}),s.length>Ba&&s.shift()}return{lines:s,pending:d}}function Aa(t){let[n,a]=p(""),[r,u]=p(!1),[d,s]=p([]),[c,k]=p(""),[y,h]=p(""),[v,T]=p(null),O=P(""),L=P([]),H=P(""),_=P(null);E(()=>{if(!r)return;if(typeof EventSource!="function"){h("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u663E\u793A\u62C9\u53D6\u8FDB\u5EA6"),u(!1);return}k("connecting");let C=new EventSource(rn("/images/pull/stream",{target:t.target,ref:O.current})),ne=!1,f=()=>{if(!ne){ne=!0;try{C.close()}catch{}}},b=U=>{let q=null;try{q=JSON.parse(U.data)}catch{return}if(q===null||typeof q!="object")return;let ae=typeof q.d=="string"?q.d:typeof q.e=="string"?q.e:"";if(ae==="")return;let ke=Pa(L.current,ae,H.current);L.current=ke.lines,H.current=ke.pending,s(ke.lines)},x=U=>{let q=null;try{q=JSON.parse(U.data)}catch{}let ae=q!==null&&typeof q.code=="number"?q.code:null;T(ae),u(!1),k(ae===0?"\u62C9\u53D6\u5B8C\u6210":"\u62C9\u53D6\u7ED3\u675F\uFF08\u9000\u51FA\u7801 "+String(ae===null?"?":ae)+"\uFF09"),ae===0&&t.onDone?.()},z=U=>{if(typeof U.data=="string"&&U.data!==""){let q="\u62C9\u53D6\u5931\u8D25";try{let ae=JSON.parse(U.data);ae!==null&&typeof ae.message=="string"&&(q=ae.message)}catch{}h(q),u(!1),k("");return}k(C.readyState===2?"closed":"reconnecting")};return C.addEventListener("line",b),C.addEventListener("end",x),C.addEventListener("error",z),C.onopen=()=>k("open"),()=>{f(),H.current=""}},[r,t.target]),E(()=>{let C=_.current;C!==null&&(C.scrollTop=C.scrollHeight)},[d]);let A=()=>{let C=n.trim();C===""||r||(O.current=C,L.current=[],H.current="",s([]),h(""),T(null),k(""),u(!0))},R=()=>{u(!1),k("\u5DF2\u505C\u6B62")},j=()=>c==="open"?"\u6B63\u5728\u62C9\u53D6\uFF08docker pull\uFF09\u2026":c==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u62C9\u53D6\u6D41\u2026":c==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":c==="closed"?"\u62C9\u53D6\u6D41\u5DF2\u65AD\u5F00":c;return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:tt,title:"\u8FD4\u56DE\u955C\u50CF\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",children:"\u62C9\u53D6\u955C\u50CF"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"close")]}),o("div",{className:"dk_detailBody dk_pullBody",children:[t.allowMutations!==!0?e(Y,{kind:"info",title:"\u62C9\u53D6\u955C\u50CF\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",hint:"docker pull \u4F1A\u5199\u5165\u76EE\u6807\u673A\u7684\u955C\u50CF\u5B58\u50A8\u5E76\u5360\u7528\u78C1\u76D8\u4E0E\u5E26\u5BBD\u3002\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u540E\u5373\u53EF\u5728\u6B64\u62C9\u53D6\u3002"}):o("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u955C\u50CF\u5F15\u7528\uFF0C\u5982 nginx:1.27 \u6216 ghcr.io/org/app:latest",value:n,disabled:r,onChange:C=>a(C.target.value),onKeyDown:C=>{C.key==="Enter"&&A()}}),r?e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:R,children:"\u505C\u6B62"}):e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:t.allowMutations!==!0,onClick:A,children:"\u62C9\u53D6"})]}),y===""?null:e(Y,{title:"\u62C9\u53D6\u5931\u8D25",hint:y}),c===""?null:e("div",{className:"dk_hint",children:j()+(v===null?"":" \xB7 \u9000\u51FA\u7801 "+String(v))}),o("div",{className:"dk_pullBox",ref:_,children:[d.length===0?e("div",{className:"dk_pullLine",children:r?"\u7B49\u5F85 docker pull \u8F93\u51FA\u2026":"\u586B\u5199\u955C\u50CF\u5F15\u7528\u540E\u70B9\u300C\u62C9\u53D6\u300D\uFF0C\u9010\u5C42\u8FDB\u5EA6\u4F1A\u5B9E\u65F6\u51FA\u73B0\u5728\u8FD9\u91CC\u3002"}):d.map((C,ne)=>e("div",{className:"dk_pullLine","data-key":C.key??void 0,children:C.text},String(ne)))]})]})]})}function pn(t){let n=new Map;for(let a of t){let r=a.composeProject===null?"":a.composeProject,u=n.get(r);u===void 0&&(u={project:r,items:[]},n.set(r,u)),u.items.push(a)}return[...n.values()]}let lr=t=>t==="running"||t==="paused"||t==="restarting";function Da(t){return e("div",{className:"dk_projects",children:t.groups.map(n=>{let a=n.items.filter(s=>lr(s.state)).length,r=n.items.filter(s=>s.health==="unhealthy").length,u=[...new Set(n.items.map(s=>s.composeService===null?s.name:s.composeService))],d=n.project===""?"\uFF08\u975E compose \u5BB9\u5668\uFF09":n.project;return o("div",{className:"dk_project",role:"button",tabIndex:0,onClick:()=>t.onOpen(n.project),onKeyDown:s=>{(s.key==="Enter"||s.key===" ")&&(s.preventDefault(),t.onOpen(n.project))},children:[o("div",{className:"dk_projectHead",children:[e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:Gr}}),e("span",{className:"dk_projectName",title:d,children:d}),e("span",{className:"dk_badge","data-state":a===n.items.length?"running":a===0?"exited":"paused",children:String(a)+" / "+String(n.items.length)+" \u8FD0\u884C\u4E2D"}),r>0?e("span",{className:"dk_badge","data-state":"unhealthy",children:String(r)+" \u4E0D\u5065\u5EB7"}):null,e("span",{className:"dk_headerSpacer"}),e("span",{className:"dk_hint",children:String(u.length)+" \u4E2A\u670D\u52A1"})]}),e("div",{className:"dk_projectRows",children:n.items.map(s=>o("div",{className:"dk_projectRow",children:[e("span",{className:"dk_projectSvc",children:s.composeService===null?"\u2014":s.composeService}),e("span",{className:"dk_projectContainer",title:s.name,children:s.name}),e(lt,{state:s.state,health:s.health,status:s.status}),e("span",{className:"dk_projectImage",title:s.image,children:s.image}),e("span",{className:"dk_projectPorts",children:an(s.ports)})]},s.id))})]},n.project===""?"__ungrouped":n.project)})})}function ja(t){let[n,a]=p("services"),r=t.items,u=t.project===""?"\uFF08\u975E compose \u5BB9\u5668\uFF09":t.project,d=r.filter(k=>lr(k.state)).length,s=()=>e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images dk_composeTable",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u670D\u52A1"}),e("th",{children:"\u5BB9\u5668"}),e("th",{children:"\u72B6\u6001"}),e("th",{children:"\u7AEF\u53E3"}),e("th",{children:"\u955C\u50CF"})]})}),e("tbody",{children:r.map(k=>o("tr",{children:[e("td",{children:k.composeService===null?"\u2014":k.composeService}),e("td",{className:"dk_mono",title:k.name,children:k.name}),e("td",{children:e(lt,{state:k.state,health:k.health,status:k.status})}),e("td",{children:an(k.ports)}),e("td",{className:"dk_mono",title:k.image,children:k.image})]},k.id))})]})}),c=[["services","\u670D\u52A1"],["logs","\u805A\u5408\u65E5\u5FD7"]];return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:tt,title:"\u8FD4\u56DE Compose \u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:Gr}}),e("span",{className:"dk_detailTitle",title:u,children:u}),e("span",{className:"dk_badge","data-state":d===r.length?"running":d===0?"exited":"paused",children:String(d)+" / "+String(r.length)+" \u8FD0\u884C\u4E2D"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"close")]}),e("div",{className:"dk_tabs",children:c.map(([k,y])=>e("button",{type:"button",className:"dk_tab","data-on":n===k?"1":"0",onClick:()=>a(k),children:y},k))}),e("div",{className:"dk_detailBody",children:n==="services"?s():e(hr,{target:t.target,targetLabel:t.targetLabel,items:r})})]})}let mn=350,dr=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s/;function sr(t){let n=dr.exec(t);if(n===null)return{ts:null,text:t};let a=Date.parse(n[1]);return{ts:Number.isFinite(a)?a:null,text:t.slice(n[0].length)}}let Ha={TRACE:0,DEBUG:1,INFO:2,WARN:3,ERROR:4,FATAL:5},za=/^\s*(\[\d{4}-\d{2}-\d{2}[ T][0-9:.,]+\]|\d{2}:\d{2}:\d{2}[,.]\d{3})\s*/;function cr(t){let n=Qn.exec(t.replace(za,""));if(n===null)return null;let a=er.exec(n[1]);return a===null?null:a[1]}function fn(t){let n=0;return t.map((a,r)=>(typeof a.ts=="number"&&Number.isFinite(a.ts)&&(n=a.ts),{row:a,index:r,key:n})).sort((a,r)=>a.key-r.key||a.index-r.index).map(a=>a.row)}let vn=400;function Dt(t,n,a){if(n.length===0)return t;let r=Math.max(a,0),u=Math.max(t.length-r,0),d=t.slice(u).concat(n);return t.slice(0,u).concat(fn(d))}function ur(t,n){if(typeof n!="number"||n<=0)return t;let a=null,r=[];for(let u of t){let d=cr(u.text);d!==null&&(a=d);let s=a===null?null:Ha[a]??0;(s===null||s>=n)&&r.push(u)}return r}function Fa(t){let n=typeof t.ts=="number"&&Number.isFinite(t.ts)?new Date(t.ts).toISOString()+" ":"";return"["+t.service+"] "+n+t.text}function kr(t,n){let a=t.map(Fa).join(`
`);if(n?.format!=="md")return a;let r=Array.isArray(n.items)?n.items:[];return["# \u805A\u5408\u65E5\u5FD7","","- \u6765\u6E90\uFF1A"+(typeof n.targetLabel=="string"&&n.targetLabel!==""?n.targetLabel+" \xB7 ":"")+(n.target??""),"- \u5BB9\u5668\uFF08"+String(r.length)+"\uFF09\uFF1A"+r.map(d=>d.name).join("\u3001"),"- \u884C\u6570\uFF1A"+String(t.length),"- \u5BFC\u51FA\u65F6\u95F4\uFF1A"+new Date().toLocaleString(),"","```text",a,"```",""].join(`
`)}function gr(t,n,a){if(n.length===0)return t;let r=t.concat(n);return r.length>a?r.slice(r.length-a):r}function hr(t){let n=t.items,[a,r]=p([]),[u,d]=p("connecting"),[s,c]=p(""),[k,y]=p(!1),[h,v]=p(0),[T,O]=p(!1),[L,H]=p(!1),[_,A]=p("arrival"),[R,j]=p(0),C=P([]),ne=P(new Map),f=P(!1),b=P([]),x=P("arrival"),z=P([]),U=P(null),q=P(null),ae=n.map(B=>B.id).join(","),ke=_n();E(()=>{if(!ke)return;if(n.length===0){d("empty");return}if(typeof EventSource!="function"){d("unsupported");return}d("connecting"),C.current=[],ne.current=new Map,b.current=[],r([]),v(0),O(!1),z.current=[],U.current!==null&&(clearTimeout(U.current),U.current=null);let B=0,oe=0,ee=n.map(X=>{let ot=X.composeService===null?X.name:X.composeService,fe=new EventSource(rn("/logs/stream",{target:t.target,id:X.id,tail:100,timestamps:1})),we=D=>{if(D.length===0)return;let Z=x.current==="time"?Dt(C.current,D,vn):C.current.concat(D),re=Z.length>Ie?Z.slice(Z.length-Ie):Z;C.current=re,re.length!==Z.length&&O(!0),r(re)},ce=D=>{if(x.current!=="time"){we(D);return}z.current=z.current.concat(D),U.current===null&&(U.current=setTimeout(()=>{U.current=null;let Z=z.current;z.current=[],we(fn(Z))},mn))},Te=D=>{let re=((ne.current.get(X.id)??"")+D).split(`
`);if(ne.current.set(X.id,re.pop()??""),re.length===0)return;let Ne=re.map(_e=>{let ve=sr(_e);return{service:ot,text:ve.text,ts:ve.ts}});if(f.current){let _e=b.current.concat(Ne);b.current=_e.length>Ie?_e.slice(_e.length-Ie):_e,v(ve=>b.current.length-ve>=5||ve===0?b.current.length:ve);return}ce(Ne)};return fe.addEventListener("line",D=>{let Z=null;try{Z=JSON.parse(D.data)}catch{return}Z===null||typeof Z!="object"||(typeof Z.d=="string"?Te(Z.d):typeof Z.e=="string"&&Te(Z.e))}),fe.addEventListener("end",()=>{try{fe.close()}catch{}oe+=1,oe>=n.length&&d("closed")}),fe.addEventListener("error",D=>{typeof D.data=="string"&&D.data!==""?d("partial"):d("reconnecting")}),fe.onopen=()=>{B+=1,d("open")},()=>{try{fe.close()}catch{}}});return()=>{for(let X of ee)X()}},[ke,t.target,ae]),E(()=>{if(k)return;let B=q.current;B!==null&&(B.scrollTop=B.scrollHeight)},[k,a]);let Ye=()=>{let B=!f.current;if(f.current=B,y(B),B)return;let oe=b.current;if(b.current=[],v(0),oe.length>0){let ee=gr(C.current,oe,Ie);C.current=ee,r(ee)}requestAnimationFrame(()=>{let ee=q.current;ee!==null&&(ee.scrollTop=ee.scrollHeight)})},me=s.trim().toLowerCase(),De=ur(a,R),be=me===""?De:De.filter(B=>B.text.toLowerCase().indexOf(me)>=0||B.service.toLowerCase().indexOf(me)>=0),ze=be.length>ct?be.slice(-ct):be,Ge=()=>{let B=_==="time"?"arrival":"time";x.current=B,A(B),U.current!==null&&(clearTimeout(U.current),U.current=null);let oe=z.current;if(z.current=[],oe.length>0){let ee=Dt(C.current,oe,vn),X=ee.length>Ie?ee.slice(ee.length-Ie):ee;C.current=X,r(X)}if(B==="time"){let ee=Dt([],C.current,C.current.length);C.current=ee,r(ee)}},ge=B=>{let oe=kr(ze,{format:B,target:t.target,targetLabel:t.targetLabel,items:n}),ee=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);jr("docker-logs-"+ee+(B==="md"?".md":".log"),oe)},Fe=()=>u==="open"?"\u5DF2\u8FDE\u63A5 "+String(n.length)+" \u6761\u5BB9\u5668\u65E5\u5FD7\u6D41\uFF08docker logs -f\uFF09":u==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u5BB9\u5668\u65E5\u5FD7\u6D41\u2026":u==="reconnecting"?"\u90E8\u5206\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":u==="partial"?"\u90E8\u5206\u5BB9\u5668\u65E5\u5FD7\u6D41\u51FA\u9519":u==="closed"?"\u5168\u90E8\u5BB9\u5668\u65E5\u5FD7\u6D41\u5DF2\u7ED3\u675F":u==="unsupported"?"\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource":u==="empty"?"\u8BE5\u9879\u76EE\u6CA1\u6709\u53EF\u805A\u5408\u7684\u5BB9\u5668":"\u805A\u5408\u65E5\u5FD7";return o("div",{className:"dk_logs",children:[T?e(Y,{kind:"warn",title:"\u805A\u5408\u65E5\u5FD7\u8D85\u8FC7 "+String(Ie)+" \u884C\uFF0C\u5DF2\u4E22\u5F03\u6700\u65E9\u5185\u5BB9"}):null,o("div",{className:"dk_filterBar",children:[o("div",{className:"dk_filterWrap",children:[e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u670D\u52A1\u540D / \u65E5\u5FD7\u5185\u5BB9\u2026",value:s,onChange:B=>c(B.target.value),onKeyDown:B=>{B.key==="Escape"&&s!==""&&(B.stopPropagation(),c(""))}}),s===""?null:e("button",{type:"button",className:"dk_filterClear",title:"\u6E05\u7A7A\u8FC7\u6EE4",onClick:()=>c(""),children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"clear")]}),e("button",{type:"button",className:"dk_pill dk_pillFollow","data-on":k?"0":"1","data-paused":k?"1":void 0,title:k?"\u6062\u590D\u5B9E\u65F6\uFF08\u4F1A\u4E00\u6B21\u6027\u663E\u793A\u6682\u505C\u671F\u95F4\u6512\u4E0B\u7684 "+String(h)+" \u884C\u5E76\u56DE\u5230\u5E95\u90E8\uFF09":"\u6682\u505C\uFF08\u51BB\u7ED3\u5F53\u524D\u753B\u9762\uFF1A\u65B0\u65E5\u5FD7\u7EE7\u7EED\u63A5\u6536\u4F46\u4E0D\u8FFD\u52A0\uFF0C\u907F\u514D\u8BFB\u5C4F\u88AB\u9876\u8D70\uFF09",onClick:Ye,children:k?h>0?"\u5DF2\u6682\u505C +"+String(h):"\u5DF2\u6682\u505C":"\u5B9E\u65F6"}),e("button",{type:"button",className:"dk_pill","data-on":L?"1":"0",title:L?"\u9690\u85CF\u6BCF\u884C\u65F6\u95F4\u6233":"\u663E\u793A\u6BCF\u884C\u65F6\u95F4\u6233\uFF08\u65F6\u95F4\u6233\u59CB\u7EC8\u968F\u6D41\u63A5\u6536\uFF0C\u53EA\u5F71\u54CD\u663E\u793A\uFF09",onClick:()=>H(B=>!B),children:"\u65F6\u95F4\u6233"}),e("button",{type:"button",className:"dk_pill","data-on":_==="time"?"1":"0",title:_==="time"?"\u6309\u5230\u8FBE\u987A\u5E8F\u663E\u793A\uFF08\u5B9E\u65F6\u8DDF\u968F\u96F6\u5EF6\u8FDF\uFF09":"\u6309\u5BB9\u5668\u65F6\u95F4\u6233\u5408\u5E76\uFF08\u8DE8\u5BB9\u5668\u6210\u4E00\u6761\u771F\u65F6\u95F4\u7EBF\uFF0C\u4EE3\u4EF7\u7EA6 "+String(mn)+"ms \u5EF6\u8FDF\uFF09",onClick:()=>Ge(),children:_==="time"?"\u6309\u65F6\u95F4":"\u6309\u5230\u8FBE"}),e("select",{className:"dk_select dk_selectSm",value:String(R),title:"\u6309\u65E5\u5FD7\u7EA7\u522B\u8FC7\u6EE4\uFF08\u65E0\u7EA7\u522B\u524D\u7F00\u7684\u884C\u59CB\u7EC8\u4FDD\u7559\uFF09",onChange:B=>j(Number(B.target.value)),children:[e("option",{value:"0",children:"\u5168\u90E8\u7EA7\u522B"},"all"),e("option",{value:"3",children:"WARN+"},"warn"),e("option",{value:"4",children:"ERROR+"},"error")]}),e("button",{type:"button",className:"dk_chip",disabled:ze.length===0,title:"\u5BFC\u51FA\u5F53\u524D\u663E\u793A\u5185\u5BB9\u4E3A .log\uFF08\u7EAF\u6587\u672C\uFF09",onClick:()=>ge("log"),children:"\u2B07 .log"}),e("button",{type:"button",className:"dk_chip",disabled:ze.length===0,title:"\u5BFC\u51FA\u5F53\u524D\u663E\u793A\u5185\u5BB9\u4E3A .md\uFF08\u5E26\u6765\u6E90\u4E0E\u884C\u6570\u8868\u5934\uFF0C\u9002\u5408\u5F53\u5DE5\u5355\u9644\u4EF6\uFF09",onClick:()=>ge("md"),children:"\u2B07 .md"}),e("span",{className:"dk_filterCount",children:me===""&&R===0?String(a.length)+" \u884C":String(be.length)+" / "+String(a.length)+" \u884C"})]}),e("div",{className:"dk_followState","data-state":u==="open"?"open":u==="closed"?"closed":"connecting",children:Fe()}),e("div",{className:"dk_logBody",ref:q,onContextMenu:B=>ir(B,q.current,{target:t.target,targetLabel:t.targetLabel??"",containers:n,filtered:me!==""}),children:[ze.length===0?e("div",{className:"dk_logLine",children:u==="open"?"\u7B49\u5F85\u65E5\u5FD7\u2026":Fe()},"empty"):ze.map((B,oe)=>_a(B,oe,me,L))]})]})}function Va(t,n){let a=typeof t.image=="string"?t.image:"",r=typeof t.composeProject=="string"?t.composeProject:"";return o("span",{className:"dk_activityItem","data-action":String(t.action??"").split(":")[0].trim(),title:r===""?a:a+" \xB7 "+r,children:[e("span",{className:"dk_activityTime",children:aa(t.time)}),e("span",{className:"dk_activityName",children:t.name}),e("span",{className:"dk_activityAction",children:oa(t)})]},String(n)+String(t.name)+String(t.time))}function Ka(t){let n=t.open===!0,a=Array.isArray(t.events)?t.events:[],r=a.slice(0,ta);return o("div",{className:"dk_activity","data-open":n?"1":"0",children:[e("button",{type:"button",className:"dk_activityHead","aria-expanded":n,title:"\u5BB9\u5668\u4E8B\u4EF6\u6D3B\u52A8\uFF08docker events\uFF09\uFF1A\u70B9\u51FB\u6298\u53E0 / \u5C55\u5F00",onClick:t.onToggle,children:[e("span",{className:"dk_activityTitle",children:"\u6D3B\u52A8"}),e("span",{className:"dk_activityState","data-state":t.status??"",children:t.statusText??""}),e("span",{className:"dk_headerSpacer"}),e("span",{className:"dk_hint",children:a.length===0?"\u6682\u65E0\u4E8B\u4EF6":"\u6700\u8FD1 "+String(r.length)+" / "+String(a.length)+" \u6761"}),e("span",{className:"dk_activityChevron",dangerouslySetInnerHTML:{__html:Dn}})]}),n===!1?null:r.length===0?e("div",{className:"dk_activityEmpty",children:"\u6682\u65E0\u4E8B\u4EF6\uFF08\u5BB9\u5668\u7684 start / die / health \u7B49\u52A8\u4F5C\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF09"}):e("div",{className:"dk_activityList",children:r.map(Va)})]})}function Wa(t){let n=t.info,a=Array.isArray(t.presets)?t.presets:[],r=a.some(u=>u.count>0)||t.count>0;return o("div",{className:"dk_pickBar",children:[o("div",{className:"dk_pickRow",children:[e("span",{className:"dk_pickCount",children:"\u5DF2\u9009 "+String(t.count)+" \u4E2A\u5BB9\u5668"}),n.hint===""?null:e("span",{className:"dk_hint dk_pickHint",children:n.hint}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:n.canRun!==!0,title:n.hint!==""?n.hint:n.canRun===!0?"\u628A\u6240\u9009\u5BB9\u5668\u7684\u65E5\u5FD7\u805A\u5408\u6210\u4E00\u6761\u6D41":"\u81F3\u5C11\u9009\u62E9 2 \u4E2A\u5BB9\u5668",onClick:t.onRun,children:"\u805A\u5408\u65E5\u5FD7"}),e("button",{type:"button",className:"dk_btn",onClick:t.onCancel,children:"\u53D6\u6D88"})]}),r?o("div",{className:"dk_pickPresets",children:[e("span",{className:"dk_pickPresetsLabel",children:"\u6309\u6761\u4EF6\u9009\u4E2D"}),...a.filter(u=>u.count>0).map(u=>e("button",{type:"button",className:"dk_chip",title:"\u5728\u5F53\u524D\u7B5B\u9009\u7ED3\u679C\u91CC\u52FE\u9009\u300C"+u.label+"\u300D\u7684\u5BB9\u5668\uFF08\u6700\u591A "+String(t.max??cn)+" \u4E2A\u6D41\uFF09"+(u.over>0?"\uFF1B\u53E6\u6709 "+String(u.over)+" \u4E2A\u8D85\u51FA\u4E0A\u9650\u4E0D\u4F1A\u9009\u4E2D":""),onClick:()=>t.onPreset(u.key),children:u.label+" "+String(u.count)},u.key)),t.count>0?e("button",{type:"button",className:"dk_chip dk_chipQuiet",title:"\u6E05\u7A7A\u52FE\u9009",onClick:t.onClear,children:"\u6E05\u7A7A"},"clear"):null,t.notice===""?null:e("span",{className:"dk_hint dk_pickNotice",children:t.notice})]}):null]})}function Ga(t){return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:tt,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868\uFF08\u9000\u51FA\u9009\u62E9\u6001\uFF09",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:Wr}}),e("span",{className:"dk_detailTitle",children:"\u805A\u5408\u65E5\u5FD7 \xB7 "+String(t.items.length)+" \u4E2A\u5BB9\u5668"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"close")]}),e("div",{className:"dk_detailBody",children:e(hr,{target:t.target,targetLabel:t.targetLabel,items:t.items})})]})}function Ja(t){let n=t.collapsed===!0;return o("div",{className:"dk_drawer","data-collapsed":n?"1":void 0,style:n||t.height===null?void 0:{height:String(t.height)+"px"},children:[e("div",{className:"dk_drawerResize",title:"\u62D6\u52A8\u8C03\u6574\u7EC8\u7AEF\u9AD8\u5EA6\uFF08\u53CC\u51FB\u6298\u53E0 / \u5C55\u5F00\uFF09",onMouseDown:t.onResizeStart,onDoubleClick:t.onToggleCollapse},"resize"),o("div",{className:"dk_drawerHead",children:[e("span",{className:"dk_drawerIcon",dangerouslySetInnerHTML:{__html:Kr}}),e("span",{className:"dk_drawerTitle",title:t.label,children:t.label}),e("span",{className:"dk_drawerHint",children:n?"\u5DF2\u6298\u53E0 \xB7 \u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C":"\u7531\u7EC8\u7AEF\u9762\u677F\u627F\u8F7D \xB7 \u6298\u53E0\u4FDD\u7559\u4F1A\u8BDD"}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_iconBtn dk_drawerFold",title:n?"\u5C55\u5F00\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u672A\u4E2D\u65AD\uFF09":"\u6298\u53E0\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C\uFF09",onClick:t.onToggleCollapse,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Dn}})},"fold"),e("button",{type:"button",className:"dk_iconBtn",title:"\u7ED3\u675F\u7EC8\u7AEF\u4F1A\u8BDD\u5E76\u6536\u8D77\u62BD\u5C49",onClick:t.onClose,children:e("span",{dangerouslySetInnerHTML:{__html:Pe}})},"close")]}),e("div",{className:"dk_drawerBody",ref:t.hostRef})]})}let bn={view:"containers",search:"",stateFilter:"all",all:!0,detail:null,activityOpen:!0};function rt(t,n){let[a,r]=p(()=>t in bn?bn[t]:n);return E(()=>{bn[t]=a},[t,a]),[a,r]}let pr=g.createContext(!0);function _n(){return g.useContext(pr)}let mr="@hyzyn/dsh-docker#session-probe",fr="session-probe",jt=null;function Ua(t){if(t==null)return String(t);if(Array.isArray(t))return"\u6570\u7EC4\uFF08\u957F\u5EA6 "+String(t.length)+"\uFF09";let n=typeof t;if(n!=="object")return n+" "+String(t).slice(0,40);let a=Object.keys(t);return a.length===0?"\u5BF9\u8C61\uFF08\u65E0\u952E\uFF09":"\u5BF9\u8C61\uFF0C\u952E\uFF1A"+a.slice(0,8).join(", ")+(a.length>8?" \u2026 \u5171 "+String(a.length):"")}function yn(t){try{let n=JSON.stringify(t);return n===void 0?"\uFF08\u65E0\u6CD5\u5E8F\u5217\u5316\uFF09":n.length>220?n.slice(0,220)+"\u2026":n}catch{return"\uFF08\u5E8F\u5217\u5316\u5931\u8D25\uFF1A\u53EF\u80FD\u6709\u5FAA\u73AF\u5F15\u7528\uFF09"}}function qa(t){let[,n]=p(0);return E(()=>{let a=setInterval(()=>n(r=>r+1),1e3);return()=>clearInterval(a)},[]),t.at===0?"\uFF08\u8FD8\u6CA1\u6536\u5230\u8FC7\uFF09":String(Math.round((Date.now()-t.at)/1e3))+" \u79D2\u524D"}function vr(t){let n=P(0);n.current+=1;let a=null;try{a=t.useTabInfo()}catch{}let r=typeof t.sessionId=="string"?t.sessionId:"",u=k=>{if(k==null)return{text:"\u5FEB\u7167\u662F "+String(k),count:null,last:""};if(Array.isArray(k))return{text:"\u6570\u7EC4\uFF0C\u957F\u5EA6 "+String(k.length),count:k.length,last:k.length===0?"":yn(k[k.length-1])};if(typeof k!="object")return{text:typeof k+" "+String(k).slice(0,60),count:null,last:""};let y=Object.keys(k);for(let h of["events","entries","items","rows"]){let v=k[h];if(Array.isArray(v))return{text:"\u5FEB\u7167\u952E\uFF1A"+y.join(", ")+" \uFF5C "+h+".length="+String(v.length),count:v.length,last:v.length===0?"":yn(v[v.length-1])}}return{text:"\u5FEB\u7167\u952E\uFF1A"+y.join(", ")+"\uFF08\u6CA1\u627E\u5230\u4E8B\u4EF6\u6570\u7EC4\uFF09",count:null,last:""}},[d,s]=p({mode:"\u672A\u8BA2\u9605",calls:0,at:0,window:null,session:null,error:""});E(()=>{if(r==="")return;let k=null,y=!1,h=()=>{let v=Ce?.binding?.(r)?.eventSource;if(v==null)return{window:null,session:null};let T=null;try{T=typeof v.getSnapshot=="function"?v.getSnapshot():null}catch{T=null}let O=null;try{let L=Ce.binding(r)?.session;L!=null&&typeof L.getSnapshot=="function"&&(O=L.getSnapshot())}catch{O=null}return{window:u(T),session:O===null?null:{text:Ua(O),last:yn(O)}}};try{let v=Ce?.binding?.(r)?.eventSource;if(v==null||typeof v.subscribe!="function"){s(L=>({...L,mode:"\uFF08\u62FF\u4E0D\u5230 source.subscribe\uFF09"}));return}let T=h();s({mode:"subscribe(cb)",calls:0,at:0,window:T.window,session:T.session,error:""});let O=v.subscribe(()=>{if(y)return;let L=h();s(H=>({mode:H.mode,calls:H.calls+1,at:Date.now(),window:L.window,session:L.session,error:""}))});k=typeof O=="function"?O:null}catch(v){s({mode:"\u8BA2\u9605\u629B\u9519",calls:0,at:0,window:null,session:null,error:v instanceof Error?v.message:String(v)})}return()=>{if(y=!0,typeof k=="function")try{k()}catch{}}},[r]);let c=[["sessionId",r===""?"\uFF08\u7A7A\uFF09":r],["tab.visible",a===null?"\u2014":String(a.tab?.visible)],["\u672C\u7EC4\u4EF6\u5DF2\u6E32\u67D3",String(n.current)+" \u6B21\uFF08\u4E0D\u542B\u5B9A\u65F6\u5668\uFF09"],["\u2014\u2014\u2014\u2014 \u4E8B\u4EF6\u7A97\u53E3\u5FEB\u7167\uFF08\u8BA2\u9605\u90A3\u4E00\u523B\u8BFB\u5230\u7684\uFF09 \u2014\u2014\u2014\u2014",""],["eventSource.getSnapshot()",d.window===null?"\uFF08\u672A\u8BFB\u5230\uFF09":d.window.text],["\u7A97\u53E3\u91CC\u7684\u4E8B\u4EF6\u6761\u6570",d.window===null||d.window.count===null?"\u2014":String(d.window.count)],["\u6700\u540E\u4E00\u6761\u4E8B\u4EF6",d.window===null||d.window.last===""?"\u2014":d.window.last],["\u2014\u2014\u2014\u2014 \u8BA2\u9605\u56DE\u8C03\uFF08\u5B83\u53D8\u8FC7\u5417\uFF09 \u2014\u2014\u2014\u2014",""],["\u8BA2\u9605\u65B9\u5F0F / \u56DE\u8C03\u6B21\u6570",d.mode+" \uFF5C \u56DE\u8C03 "+String(d.calls)+" \u6B21"+(d.error===""?"":"\uFF08"+d.error+"\uFF09")],["\u56DE\u8C03\u540E\u7684\u4E8B\u4EF6\u6761\u6570",d.window===null||d.window.count===null?"\u2014":String(d.window.count)],["\u56DE\u8C03\u540E\u7684\u6700\u540E\u4E00\u6761",d.window===null||d.window.last===""?"\u2014":d.window.last],["\u2014\u2014\u2014\u2014 binding.session \u7684\u5FEB\u7167\uFF08\u82E5\u6709\uFF09 \u2014\u2014\u2014\u2014",""],["session.getSnapshot()",d.session===null?"\uFF08\u6CA1\u6709\u8FD9\u4E2A\u65B9\u6CD5\uFF09":d.session.text],["session \u5FEB\u7167\u5185\u5BB9",d.session===null?"\u2014":d.session.last],["\u2014\u2014\u2014\u2014 \u4F1A\u8BDD\u4F5C\u7528\u57DF\u94A9\u5B50\u7684\u5F62\u53C2\u4E2A\u6570\uFF08\u5DE5\u5382\uFF0C\u4E0D\u662F\u666E\u901A hook\uFF09 \u2014\u2014\u2014\u2014",""],["useChat / useConversation",String(t.useChat?.length??"\u2014")+" / "+String(t.useConversation?.length??"\u2014")],["useTrajectory / useProjection",String(t.useTrajectory?.length??"\u2014")+" / "+String(t.useProjection?.length??"\u2014")]];return o("div",{className:"dk_spike",children:[e("div",{className:"dk_spikeTitle",children:"\u4F1A\u8BDD\u4E8B\u4EF6\u7A97\u53E3\u63A2\u9488 v3\uFF08spike \xB7 \u65B9\u6848 B\uFF09"}),e("div",{className:"dk_spikeHint",children:"\u5173\u952E\u662F\u300C\u56DE\u8C03\u6B21\u6570\u300D\u4E0E\u300C\u56DE\u8C03\u540E\u7684\u6761\u6570\u300D\uFF1A\u7528\u65E5\u5FD7\u53F3\u952E\u300C\u76F4\u63A5\u53D1\u9001\u5230\u5F53\u524D\u4F1A\u8BDD\u300D\u8BA9 Agent \u8DD1\u8D77\u6765\uFF0C\u5B83\u4EEC\u5E94\u5F53\u53D8\u5316\u3002"}),...c.map(([k,y])=>o("div",{className:"dk_spikeRow",children:[e("span",{className:"dk_spikeKey",children:k}),e("span",{className:"dk_spikeVal",children:y===""?"\u2014":String(y)})]},k)),o("div",{className:"dk_spikeRow",children:[e("span",{className:"dk_spikeKey",children:"\u6700\u8FD1\u4E00\u6B21\u56DE\u8C03\u8DDD\u4ECA"}),e("span",{className:"dk_spikeVal",children:e(qa,{at:d.at})})]},"age")]})}function Ht(t){let[n,a]=p(null),[r,u]=p([]),d=typeof t.initialTarget=="string"?t.initialTarget.trim():"",s=P(d!==""?d:zr()),[c,k]=p(s.current),y=t.sessionHint!==void 0&&(t.initialTarget??"")==="",[h,v]=rt("view","containers"),[T,O]=p([]),[L,H]=p(""),_=P(""),A=de(i=>{_.current=i,H(i)},[]),[R,j]=p([]),[C,ne]=p([]),[f,b]=p([]),[x,z]=p([]),[U,q]=p(null),[ae,ke]=p(null),[Ye,me]=p(null),[De,be]=p(null),[ze,Ge]=p(!1),[ge,Fe]=p(!1),[B,oe]=p([]),[ee,X]=p(""),[ot,fe]=p(!1),[we,ce]=p(!1),[Te,D]=p(""),[Z,re]=p(""),[Ne,_e]=rt("all",!0),[ve,Ve]=rt("search",""),[Je,wn]=rt("stateFilter","all"),[Le,zt]=p(!1),[Ft,pt]=p([]),mt=_n(),[Ke,he]=p(""),[Vt,Nn]=rt("activityOpen",!0),ft=P(null),Kt=P(""),[Ue,je]=rt("detail",null),[Wt,Gt]=p(0),[ye,Se]=p(null),[Jt,Ut]=p(!1),[qt,$e]=p({}),[Xt,Sn]=p(""),[w,M]=p(""),[N,F]=p(""),V=P(!0),G=P(null);G.current===null&&(G.current=Zr());let[se,J]=p(null),K=P(null),[W,ue]=p(!1),[qe,ro]=p(null),[ao,Cn]=p(!1),Sr=P(null),Tn=P(!1);E(()=>()=>{V.current=!1},[]),E(()=>{if(se===null)return;let i=K.current;if(i===null)return;let m=null;try{m=Xe.mount(i,se.options)}catch(S){re("\u7EC8\u7AEF\u542F\u52A8\u5931\u8D25\uFF1A"+(S instanceof Error?S.message:String(S))),J(null);return}return()=>{try{m?.()}catch{}}},[se]);let oo=i=>{if(i.button!==void 0&&i.button!==0)return;let m=i.currentTarget.parentElement,S=Sr.current;if(m===null||S===null)return;i.preventDefault();let pe=i.clientY,ie=m.getBoundingClientRect().height,te=Math.max(160,Math.round(S.getBoundingClientRect().height*.75)),He=xe=>{let Be=Math.round(ie+(pe-xe.clientY));ro(Math.min(te,Math.max(160,Be)))},tn=()=>{document.removeEventListener("mousemove",He),document.removeEventListener("mouseup",tn),document.body.style.userSelect=""};document.body.style.userSelect="none",document.addEventListener("mousemove",He),document.addEventListener("mouseup",tn)},We=()=>{if(se===null){t.onClose();return}Cn(!0)};E(()=>{Q.config().then(i=>{let m=i.config;a(m),Array.isArray(m.targets)&&m.targets.length>0&&k(S=>Pn(m.targets,S,s.current,y)),An(m)}).catch(i=>D(i.message)),Q.targets().then(i=>{u(i.targets??[]),Jn=i.targets??[],k(m=>Pn(i.targets??[],m,s.current,y)),s.current=""}).catch(()=>{})},[]),E(()=>{c!==""&&Fr(c)},[c]);let vt=de(()=>{if(c==="")return Promise.resolve();let i=G.current.next();return ce(!0),Q.containers(c,Ne).then(m=>{!V.current||!G.current.isCurrent(i)||(O(m.containers??[]),A(c),D(""))}).catch(m=>{!V.current||!G.current.isCurrent(i)||(_.current!==c&&O([]),A(c),D(m.message))}).finally(()=>{V.current&&G.current.isCurrent(i)&&ce(!1)})},[c,Ne]),bt=de(()=>{if(c==="")return Promise.resolve();let i=G.current.next();return ce(!0),Q.images(c).then(m=>{!V.current||!G.current.isCurrent(i)||(ne(m.images??[]),A(c),D(""))}).catch(m=>{!V.current||!G.current.isCurrent(i)||(_.current!==c&&ne([]),A(c),D(m.message))}).finally(()=>{V.current&&G.current.isCurrent(i)&&ce(!1)})},[c]),Yt=de(()=>{if(c==="")return Promise.resolve();let i=G.current.next();return ce(!0),Q.networks(c).then(m=>{!V.current||!G.current.isCurrent(i)||(b(m.networks??[]),A(c),D(""))}).catch(m=>{!V.current||!G.current.isCurrent(i)||(_.current!==c&&b([]),A(c),D(m.message))}).finally(()=>{V.current&&G.current.isCurrent(i)&&ce(!1)})},[c]),$t=de(()=>{if(c==="")return Promise.resolve();let i=G.current.next();return ce(!0),Q.volumes(c).then(m=>{!V.current||!G.current.isCurrent(i)||(z(m.volumes??[]),A(c),D(""))}).catch(m=>{!V.current||!G.current.isCurrent(i)||(_.current!==c&&z([]),A(c),D(m.message))}).finally(()=>{V.current&&G.current.isCurrent(i)&&ce(!1)})},[c]),Ln=de(()=>{if(r.length===0)return j([]),Promise.resolve();let i=G.current.next();ce(!0),j(r.map(ie=>({name:ie.name,kind:ie.kind,label:ie.label,containers:[],attention:null,error:"",loaded:!1})));let m=r.length,S=()=>{m-=1,m===0&&V.current&&G.current.isCurrent(i)&&ce(!1)},pe=ie=>Q.attention(ie).then(te=>{!V.current||!G.current.isCurrent(i)||j(He=>St(He,ie,{attention:te.items??[]}))}).catch(()=>{!V.current||!G.current.isCurrent(i)||j(te=>St(te,ie,{attention:null}))});return Promise.all(r.map(ie=>(pe(ie.name),Q.containers(ie.name,!0).then(te=>{!V.current||!G.current.isCurrent(i)||j(He=>St(He,ie.name,{containers:te.containers??[],error:"",loaded:!0}))}).catch(te=>{!V.current||!G.current.isCurrent(i)||j(He=>St(He,ie.name,{error:te instanceof Error?te.message:String(te),loaded:!0}))}).finally(S))))},[r]);E(()=>{ft.current=vt},[vt]);let io=de(()=>Gt(i=>i+1),[]),Re=de(()=>{Fe(!1),oe([]),X(""),fe(!1)},[]),lo=()=>{if(ge){Re();return}oe([]),fe(!1),Fe(!0)},so=i=>oe(m=>Ur(m,i.id));E(()=>{if(!ge)return;let i=m=>{m.key==="Escape"&&Re()};return document.addEventListener("keydown",i),()=>document.removeEventListener("keydown",i)},[ge,Re]),E(()=>{ge&&oe(i=>qr(i,T))},[T,ge]);let co=i=>{k(i),D(""),v("containers"),je(null),Re(),$e({}),t.onTargetChange?.(Me(i))},uo=(i,m)=>{k(i),D(""),v("containers"),Re(),$e({}),je({id:m.id,tab:"overview",item:m}),t.onTargetChange?.(Me(i))},_t=de(()=>{h==="overview"?Ln():h==="images"?bt():h==="networks"?Yt():h==="volumes"?$t():vt(),Gt(i=>i+1)},[h,Ln,vt,bt,Yt,$t]);E(()=>{h!=="overview"&&c!==""&&_t()},[c,Ne,h]);let ko=r.map(i=>i.name).join("\0");E(()=>{h==="overview"&&Ln()},[h,ko]),E(()=>{if(!Le||h!=="overview"&&(c===""||h==="images"))return;let i=setInterval(_t,Math.max(2,n?.pollIntervalSec??5)*1e3);return()=>clearInterval(i)},[Le,_t,c,n,h]);let go=()=>Ke==="open"?"\u5B9E\u65F6\u63A5\u6536\u4E2D\uFF08docker events\uFF09":Ke==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u4E8B\u4EF6\u6D41\u2026":Ke==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":Ke==="closed"?"\u4E8B\u4EF6\u6D41\u5DF2\u65AD\u5F00":Ke==="unsupported"?"\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource":"\u4E8B\u4EF6\u6D41";E(()=>{if(!mt||h!=="containers"||c==="")return;if(typeof EventSource!="function"){he("unsupported");return}Kt.current!==c&&(Kt.current=c,pt([])),he("connecting");let i=ia(na,()=>{let xe=ft.current;xe!==null&&xe()}),m=!1,S=new EventSource(rn("/events/stream",{target:c})),pe=!1,ie=()=>{if(!pe){pe=!0;try{S.close()}catch{}}},te=xe=>{let Be=null;try{Be=JSON.parse(xe.data)}catch{return}Be===null||typeof Be!="object"||(pt(nn=>ra(nn,Be,ea)),i.schedule())},He=xe=>{let Be=null;try{Be=JSON.parse(xe.data)}catch{}let nn=Be!==null&&typeof Be.code=="number"?Be.code:null;he("closed"),re("\u4E8B\u4EF6\u6D41\u5DF2\u7ED3\u675F"+(nn===null?"":"\uFF08\u9000\u51FA\u7801 "+String(nn)+"\uFF09")+"\uFF0C\u5217\u8868\u56DE\u5230 AUTO REFRESH / \u624B\u52A8\u5237\u65B0"),ie()},tn=xe=>{if(typeof xe.data=="string"&&xe.data!==""){he("closed"),ie();return}he(S.readyState===2?"closed":"reconnecting")};return S.addEventListener("event",te),S.addEventListener("end",He),S.addEventListener("error",tn),S.onopen=()=>{if(he("open"),m){let xe=ft.current;xe!==null&&xe()}m=!0},()=>{ie(),i.cancel()}},[mt,h,c]),E(()=>{if(Z==="")return;let i=setTimeout(()=>re(""),4e3);return()=>clearTimeout(i)},[Z]),E(()=>(Pt=t.carrier==="tab"?"":" \xB7 \u4F1A\u8BDD\u5728\u9762\u677F\u540E\u9762\uFF1A\u5173\u6389\u6216\u6700\u5C0F\u5316\u9762\u677F/\u7EC8\u7AEF\u5373\u53EF\u770B\u5230",()=>{Pt=""}),[t.carrier]);let Zt=(i,m)=>{let S=Bn(i.name);navigator.clipboard.writeText(S).then(()=>{re("\u5DF2\u590D\u5236\uFF1A"+S+(m===void 0?"":"\uFF08"+m+"\uFF09"))}).catch(()=>re("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u6267\u884C\uFF1A"+S))},ho=i=>{let m=Bn(i.name);if(Xe===null){let te=document.querySelector("[data-dsh-tty-entry]")!==null;Zt(i,te?"\u7EC8\u7AEF\u9762\u677F\u7248\u672C\u8FC7\u65E7\uFF08\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u9700\u8981 dsh-tty \u2265 0.14.0\uFF09\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C":"\u672A\u5B89\u88C5 dsh-tty \u7EC8\u7AEF\u9762\u677F\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C\uFF08\u88C5 dsh-tty \u540E\u53EF\u76F4\u63A5\u5728\u6B64\u5F00\u7EC8\u7AEF\uFF09");return}let S=(n?.targets??[]).find(te=>te.name===c),pe=i.name+" \xB7 exec",ie=S===void 0||S.kind==="local"?{command:m,label:pe}:typeof S.book=="string"&&S.book!==""?{book:S.book,command:m,label:pe}:(S.auth??"agent")==="agent"?{spec:{host:S.host,port:S.port,username:S.username,auth:"agent",agentForward:S.agentForward===!0},command:m,label:pe}:null;if(ie===null){Zt(i,"\u5185\u8054\u76EE\u6807\u7528\u4E86 key/password \u8BA4\u8BC1\uFF0C\u6D4F\u89C8\u5668\u7AEF\u62FF\u4E0D\u5230\u51ED\u8BC1");return}if(t.docked===!0||t.carrier==="tab"&&t.tabFullscreen!==!0){try{Xe.open(ie)}catch(te){Zt(i,te instanceof Error?te.message:String(te))}return}if(typeof Xe.mount=="function"&&Number(Xe.version??0)>=2){J({label:pe,options:ie}),ue(!1);return}try{Xe.open(ie),t.onClose()}catch(te){Zt(i,te instanceof Error?te.message:String(te))}},Cr=i=>$e(m=>{if(m[i]===void 0)return m;let S={...m};return delete S[i],S}),yt=(i,m)=>{Ut(!0);let S=()=>{Ut(!1),Se(null)};Promise.resolve().then(i).then(async()=>{if(S(),m!==void 0)try{await m()}catch(pe){D(pe.message)}},pe=>{S(),D(pe.message)})},po=(i,m)=>{qt[m.id]===void 0&&Se({title:i==="remove"?"\u5220\u9664\u5BB9\u5668":i==="stop"?"\u505C\u6B62\u5BB9\u5668":i==="start"?"\u542F\u52A8\u5BB9\u5668":"\u91CD\u542F\u5BB9\u5668",text:i==="remove"?`\u786E\u5B9A\u5220\u9664\u5BB9\u5668 ${m.name}\uFF1F\u5BB9\u5668\u7684\u53EF\u5199\u5C42\u4E0E\u914D\u7F6E\u4F1A\u88AB\u5220\u9664\uFF08\u547D\u540D\u6570\u636E\u5377\u4FDD\u7559\uFF09\uFF0C\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002`:`\u786E\u5B9A\u5BF9\u5BB9\u5668 ${m.name} \u6267\u884C${i==="stop"?"\u505C\u6B62":i==="start"?"\u542F\u52A8":"\u91CD\u542F"}\u64CD\u4F5C\uFF1F`,confirmLabel:i==="remove"?"\u5220\u9664":"\u786E\u5B9A",run:()=>yt(async()=>{$e(S=>({...S,[m.id]:i}));try{let S=await Q.action(c,i,m.id);re(`${S.result.action} ${m.name}\uFF1A${S.result.message}`)}catch(S){throw Cr(m.id),S}},async()=>{try{await vt()}finally{Cr(m.id)}})})},mo=i=>{let m=hn(i);Se({title:"\u5220\u9664\u955C\u50CF",text:"\u786E\u5B9A\u5220\u9664\u955C\u50CF "+m+"\uFF1F\u955C\u50CF\u88AB\u5BB9\u5668\u6216\u5B50\u955C\u50CF\u5F15\u7528\u65F6\u4F1A\u5931\u8D25\uFF1B\u5220\u9664\u540E\u9700\u8981\u91CD\u65B0\u62C9\u53D6\u6216\u6784\u5EFA\u624D\u80FD\u6062\u590D\uFF0C\u4E14\u4E0D\u53EF\u64A4\u9500\u3002",confirmLabel:"\u5220\u9664",run:()=>yt(async()=>{let S=await Q.imageRemove(c,m);re("\u5DF2\u5220\u9664 "+m+"\uFF1A"+S.result.message),U!==null&&hn(U)===m&&q(null),await bt()})})},fo=()=>{Se({title:"\u6E05\u7406 dangling \u955C\u50CF",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u65E0\u6807\u7B7E\uFF08<none>:<none>\uFF09\u7684\u955C\u50CF\u5C42\uFF0C\u91CA\u653E\u78C1\u76D8\u7A7A\u95F4\uFF1B\u4E0D\u4F1A\u5220\u9664\u6709 tag \u7684\u955C\u50CF\u3002",confirmLabel:"\u6E05\u7406",run:()=>yt(async()=>{let i=await Q.imagePrune(c),m=String(i.result.message).trim().split(`
`).filter(S=>S!=="");re("\u5DF2\u6E05\u7406 dangling \u955C\u50CF\uFF1A"+(m.length===0?"ok":m[m.length-1])),await bt()})})},vo=()=>{Se({title:"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u7F51\u7EDC",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u6CA1\u6709\u5BB9\u5668\u63A5\u5165\u7684\u7F51\u7EDC\u3002compose \u521B\u5EFA\u7684\u9879\u76EE\u7F51\u7EDC\u4E5F\u5728\u5176\u4E2D\uFF08\u4E0B\u6B21 up \u4F1A\u91CD\u5EFA\uFF09\uFF0C\u4F46\u6B63\u5728\u8DD1\u7684\u9879\u76EE\u4F1A\u77ED\u6682\u5931\u53BB\u7F51\u7EDC\u3002",confirmLabel:"\u6E05\u7406",run:()=>yt(async()=>{let i=await Q.networkPrune(c),m=String(i.result.message).trim().split(`
`).filter(S=>S!=="");re("\u5DF2\u6E05\u7406\u672A\u4F7F\u7528\u7F51\u7EDC\uFF1A"+(m.length===0?"ok":m[m.length-1])),await Yt()})})},bo=()=>{Se({title:"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u5377",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u6CA1\u6709\u88AB\u5BB9\u5668\u4F7F\u7528\u7684\u5377\u2014\u2014\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u5220\u9664\u4E14\u4E0D\u53EF\u6062\u590D\u3002docker \u2265 23 \u53EA\u5220\u533F\u540D\u5377\uFF08\u4E0D\u5E26 --all\uFF09\uFF0C\u66F4\u8001\u7684\u7248\u672C\u4F1A\u8FDE\u547D\u540D\u5377\u4E00\u8D77\u5220\uFF1B\u6267\u884C\u524D\u8BF7\u786E\u8BA4\u6CA1\u6709\u9700\u8981\u4FDD\u7559\u7684\u6570\u636E\u5377\u3002",confirmLabel:"\u6E05\u7406",run:()=>yt(async()=>{let i=await Q.volumePrune(c),m=String(i.result.message).trim().split(`
`).filter(S=>S!=="");re("\u5DF2\u6E05\u7406\u672A\u4F7F\u7528\u5377\uFF1A"+(m.length===0?"ok":m[m.length-1])),await $t()})})},Tr=(i,m)=>S=>{i(),re(S),m()},Qt=Ue===null?null:T.find(i=>i.id===Ue.id)??Ue.item,Ze=T.filter(i=>{if(Je==="running"&&!(i.state==="running"||i.state==="paused"||i.state==="restarting")||Je==="stopped"&&i.state==="running"||Je==="unhealthy"&&i.health!=="unhealthy")return!1;let m=ve.trim().toLowerCase();return m===""?!0:i.name.toLowerCase().includes(m)||i.image.toLowerCase().includes(m)||i.id.toLowerCase().includes(m)}),En=C.filter(i=>{let m=Xt.trim().toLowerCase();return m===""||i.reference.toLowerCase().includes(m)||i.id.toLowerCase().includes(m)}),In=f.filter(i=>{let m=w.trim().toLowerCase();return m===""||i.name.toLowerCase().includes(m)||i.driver.toLowerCase().includes(m)||i.id.toLowerCase().includes(m)}),On=x.filter(i=>{let m=N.trim().toLowerCase();return m===""||i.name.toLowerCase().includes(m)||i.driver.toLowerCase().includes(m)||i.mountpoint.toLowerCase().includes(m)}),_o=()=>o("div",{className:"dk_switchPill",title:"\u6B63\u5728\u5207\u6362\u5230 "+c+Lr(c)+"\u3002\u4E0B\u9762\u4ECD\u662F "+L+Lr(L)+"\u7684\u6570\u636E\uFF0C\u5207\u6362\u5B8C\u6210\u524D\u4E0D\u53EF\u64CD\u4F5C\u3002",children:[e("span",{className:"dk_spin dk_spinSm"}),o("span",{className:"dk_switchText",children:[e("span",{children:"\u6B63\u5728\u5207\u6362\u5230"}),e("strong",{children:c}),e("span",{className:"dk_switchDot",children:"\xB7"}),o("span",{className:"dk_switchSub",children:[e("span",{children:"\u5F53\u524D\u663E\u793A\uFF1A"}),e("span",{className:"dk_switchName",children:L})]})]})]},"switchPill"),Lr=i=>{let m=r.find(pe=>pe.name===i),S=m===void 0||typeof m.label!="string"?"":m.label;return S===""||S===i?"":"\uFF08"+S+"\uFF09"},Er=L!==""&&L!==c&&!y,Me=i=>{let m=r.find(S=>S.name===i);return m===void 0||m.label===void 0?i:i+" \xB7 "+m.label},xt=()=>we?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):c===""?y?o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u4E0D\u662F Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u6309\u4E0A\u9762\u7684\u63D0\u793A\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761\u76EE\u6807\uFF08\u63A8\u8350\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u3002\u4E3A\u907F\u514D\u5F20\u51A0\u674E\u6234\uFF0C\u9762\u677F\u4E0D\u4F1A\u81EA\u52A8\u5207\u5230\u5176\u4ED6\u76EE\u6807\u3002"})]}):o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD8\u6CA1\u6709\u914D\u7F6E Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u4E2A\u76EE\u6807\uFF1A\u672C\u673A\u76F4\u63A5\u9009\u300C\u672C\u673A\u300D\uFF1B\u8FDC\u7A0B\u4E3B\u673A\u53EF\u4EE5\u5F15\u7528 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\u3002"})]}):Te!==""&&T.length===0?o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD9\u4E2A\u76EE\u6807\u7684\u6570\u636E\u6CA1\u8BFB\u5230"}),e("div",{className:"dk_emptyHint",children:"\u4E0A\u9762\u7684\u9519\u8BEF\u6761\u91CC\u6709\u539F\u56E0\uFF08\u76EE\u6807\u4E0D\u53EF\u8FBE / docker \u672A\u8FD0\u884C / \u6743\u9650\u4E0D\u8DB3\uFF09\u3002\u4FEE\u597D\u540E\u70B9\u53F3\u4E0A\u89D2\u5237\u65B0\u5373\u53EF\u3002"})]}):o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:h==="images"?"\u6CA1\u6709\u955C\u50CF":h==="compose"?"\u6CA1\u6709 Compose \u9879\u76EE":h==="networks"?"\u6CA1\u6709\u7F51\u7EDC":h==="volumes"?"\u6CA1\u6709\u5377":"\u6CA1\u6709\u5BB9\u5668"}),e("div",{className:"dk_emptyHint",children:ve.trim()===""?"\u76EE\u6807\u4E0A\u6CA1\u6709\u5339\u914D\u7684\u6570\u636E\uFF0C\u6216\u7B5B\u9009\u6761\u4EF6\u8FC7\u7A84\u3002":"\u6CA1\u6709\u5339\u914D\u300C"+ve.trim()+"\u300D\u7684\u7ED3\u679C\u3002"})]}),yo=()=>{if(h==="overview")return Xn(Qr(R),{onOpenTarget:co,onOpenContainer:uo});if(h==="images")return o("div",{className:"dk_imagesView",children:[En.length===0?xt():e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u955C\u50CF"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"ID"}),e("th",{className:"dk_colActions",children:"\u64CD\u4F5C"})]})}),e("tbody",{children:En.map(i=>o("tr",{children:[e("td",{className:"dk_mono",title:i.reference,children:i.dangling?"<none>\uFF08dangling\uFF09":i.reference}),e("td",{children:i.sizeText===""?i.size===null?"\u2014":on(i.size):i.sizeText}),e("td",{children:i.createdSince}),e("td",{className:"dk_mono",children:i.shortId}),e("td",{className:"dk_colActions",children:o("div",{className:"dk_rowActions",children:[e($,{icon:Fo,title:"\u67E5\u770B\u955C\u50CF\u8BE6\u60C5\uFF08\u5C42 / \u6784\u5EFA\u5386\u53F2\uFF09",onClick:()=>q(i)},"inspect"),e($,{icon:dn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u5220\u9664\u955C\u50CF\uFF08\u4E0D\u53EF\u6062\u590D\uFF09":"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>mo(i)},"remove")]})},"actions")]},i.id+i.reference))})]})})]});if(h==="compose"){let i=pn(Ze);return i.length===0?xt():e(Da,{groups:i,onOpen:m=>be({project:m})})}return h==="networks"?o("div",{className:"dk_imagesView",children:[In.length===0?xt():e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u540D\u79F0"}),e("th",{children:"\u9A71\u52A8"}),e("th",{children:"\u8303\u56F4"}),e("th",{children:"\u5C5E\u6027"}),e("th",{children:"ID"})]})}),e("tbody",{children:In.map(i=>o("tr",{className:"dk_rowClickable",onClick:()=>ke(i),title:"\u67E5\u770B\u7F51\u7EDC\u8BE6\u60C5",children:[e("td",{className:"dk_mono",title:i.name,children:i.name}),e("td",{children:i.driver===""?"\u2014":i.driver}),e("td",{children:i.scope===""?"\u2014":i.scope}),e("td",{children:i.internal?e("span",{className:"dk_badge","data-state":"paused",children:"internal"}):"\u2014"}),e("td",{className:"dk_mono",title:i.id,children:i.shortId})]},i.id+i.name))})]})})]}):h==="volumes"?o("div",{className:"dk_imagesView",children:[On.length===0?xt():e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u540D\u79F0"}),e("th",{children:"\u9A71\u52A8"}),e("th",{children:"\u8303\u56F4"}),e("th",{children:"\u6302\u8F7D\u70B9"})]})}),e("tbody",{children:On.map(i=>o("tr",{className:"dk_rowClickable",onClick:()=>me(i),title:"\u67E5\u770B\u5377\u8BE6\u60C5",children:[e("td",{className:"dk_mono",title:i.name,children:i.name}),e("td",{children:i.driver===""?"\u2014":i.driver}),e("td",{children:i.scope===""?"\u2014":i.scope}),e("td",{className:"dk_mono dk_pathCell",title:i.mountpoint,children:i.mountpoint===""?"\u2014":i.mountpoint})]},i.name))})]})})]}):Ze.length===0?xt():e("div",{className:"dk_grid",key:L===""?"first":L,children:Ze.map(i=>e(fa,{item:i,selected:Ue!==null&&i.id===Ue.id,allowMutations:n?.allowMutations===!0,pickMode:ge,picked:B.includes(i.id),pending:qt[i.id],onTogglePick:so,onOpen:(m,S)=>je({id:m.id,tab:S,item:m}),onExec:ho,onAction:po,onCopyExec:m=>{navigator.clipboard.writeText("docker exec -it "+m.name+" sh").then(()=>re("\u5DF2\u590D\u5236\uFF1Adocker exec -it "+m.name+" sh")).catch(()=>re("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236"))}},i.id))})},Ee=t.docked===!0,Ir=t.carrier==="tab",xo=n??{pollIntervalSec:5,logTailDefault:200,allowExec:!1,allowMutations:!1,execTimeoutSec:30},wt=$r(T,B),Or=Wo(c),en=Or?Fn:cn,wo=Jr(wt.length,Or),Rr=wt.length>0?wt[0]:null,No=Yr(Ze,B,Rr,en),So=i=>{let m=Xr(Ze,B,i,Rr,en);oe(m.ids),m.skipped>0?X("\u5DF2\u65B0\u589E "+String(m.added)+" \u4E2A\uFF0C\u53E6\u6709 "+String(m.skipped)+" \u4E2A\u8D85\u51FA\u4E0A\u9650\uFF08\u6700\u591A "+String(en)+" \u4E2A\u6D41\uFF09\u672A\u9009"):m.added===0?X("\u6CA1\u6709\u53EF\u65B0\u589E\u7684\u5BB9\u5668\uFF08\u5DF2\u88AB\u52FE\u9009\u6216\u4E0D\u5728\u5F53\u524D\u7B5B\u9009\u7ED3\u679C\u91CC\uFF09"):X("\u5DF2\u65B0\u589E "+String(m.added)+" \u4E2A")},Co=De===null?[]:pn(T).find(i=>i.project===De.project)?.items??[],Mr=Qt!==null?e(Ia,{item:Qt,target:c,targetLabel:Me(c),config:xo,initialTab:Ue.tab,refreshToken:Wt,onBack:()=>je(null),onRefresh:io,onClose:We,docked:Ee},"detail"):U!==null?e(Oa,{item:C.find(i=>i.id===U.id)??U,target:c,targetLabel:Me(c),onBack:()=>q(null),onClose:We,docked:Ee},"imageDetail"):ze?e(Aa,{target:c,targetLabel:Me(c),allowMutations:n?.allowMutations===!0,onBack:()=>Ge(!1),onDone:bt,onClose:We,docked:Ee},"pull"):De!==null?e(ja,{project:De.project,items:Co,target:c,targetLabel:Me(c),onBack:()=>be(null),onClose:We,docked:Ee},"composeDetail"):ot?e(Ga,{items:wt,target:c,targetLabel:Me(c),onBack:Re,onClose:We,docked:Ee},"aggregate"):ae!==null?e(Ra,{item:ae,target:c,targetLabel:Me(c),allowMutations:n?.allowMutations===!0,onBack:()=>ke(null),onRemoved:Tr(()=>ke(null),Yt),onClose:We,docked:Ee},"networkDetail"):Ye!==null?e(Ma,{item:Ye,target:c,targetLabel:Me(c),allowMutations:n?.allowMutations===!0,onBack:()=>me(null),onRemoved:Tr(()=>me(null),$t),onClose:We,docked:Ee},"volumeDetail"):null,To=[Mr!==null?[Mr,ye===null?null:e(dt,{title:ye.title,text:ye.text,confirmLabel:ye.confirmLabel,busy:Jt,onCancel:()=>Se(null),onConfirm:ye.run},"confirm")]:[Ee?null:o("div",{className:"dk_header",children:[e("span",{className:"dk_titleIcon",dangerouslySetInnerHTML:{__html:Vr}}),e("span",{className:"dk_title",children:"Docker \u5BB9\u5668"}),n?.allowMutations===!0?null:e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"}),e("span",{className:"dk_headerSpacer"}),Qt!==null?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":we?"1":void 0,onClick:_t,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:et}})}),e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:We,children:e("span",{dangerouslySetInnerHTML:{__html:Pe}})})]}),Qt!==null?null:o("div",{className:"dk_toolbar",children:[e("select",{className:"dk_select",value:h==="overview"?"":c,onChange:i=>{k(i.target.value),D(""),v("containers"),je(null),Re(),$e({}),t.onTargetChange?.(Me(i.target.value))},children:[...h==="overview"?[e("option",{value:"",children:"\uFF08\u603B\u89C8 \xB7 \u5168\u90E8\u76EE\u6807\uFF09"},"__overview")]:c===""?[e("option",{value:"",children:"\uFF08\u672A\u9009\u62E9\u76EE\u6807\uFF09"},"__none")]:[],...(r.length===0&&c!==""?[{name:c,label:void 0}]:r).map(i=>e("option",{value:i.name,children:Me(i.name)},i.name))]}),r.length<2?null:e("button",{type:"button",className:"dk_pill dk_pillOverview","data-on":h==="overview"?"1":"0",title:h==="overview"?"\u9000\u51FA\u603B\u89C8\uFF0C\u56DE\u5230\u5F53\u524D\u76EE\u6807\u7684\u5BB9\u5668\u5217\u8868":"\u4E0D\u9009\u76EE\u6807\uFF0C\u4E00\u5C4F\u770B\u5168\u90E8\u76EE\u6807\u7684\u5BB9\u5668\u6982\u51B5\uFF08\u53EA\u8BFB\uFF09",onClick:()=>{if(h!=="overview"){v("overview"),D(""),je(null),Re();return}v("containers"),je(null),Re()},children:"\u603B\u89C8"}),e("div",{className:"dk_seg",children:[["containers","\u5BB9\u5668"],["images","\u955C\u50CF"],["compose","Compose"],["networks","\u7F51\u7EDC"],["volumes","\u5377"]].map(([i,m])=>e("button",{type:"button",className:"dk_segBtn","data-on":h===i?"1":"0",onClick:()=>{v(i),je(null),q(null),be(null),ke(null),me(null),Ge(!1),Re()},children:m},i))}),h==="containers"?e("button",{type:"button",className:"dk_pill dk_pillPick","data-on":ge?"1":"0",title:ge?"\u9000\u51FA\u9009\u62E9\u5E76\u6E05\u7A7A\u52FE\u9009\uFF08Esc\uFF09":"\u591A\u9009\u5BB9\u5668\uFF0C\u628A\u5B83\u4EEC\u7684\u65E5\u5FD7\u4E34\u65F6\u805A\u5408\u6210\u4E00\u6761\u6D41",onClick:lo,children:ge?"\u9000\u51FA\u9009\u62E9":"\u805A\u5408\u9009\u62E9"}):null,h==="containers"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u540D\u79F0 / \u955C\u50CF / ID",value:ve,onChange:i=>Ve(i.target.value)}):null,h==="compose"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u9879\u76EE / \u670D\u52A1 / \u5BB9\u5668",value:ve,onChange:i=>Ve(i.target.value)}):null,h==="images"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u955C\u50CF\uFF08\u4ED3\u5E93 / \u6807\u7B7E / ID\uFF09",value:Xt,onChange:i=>Sn(i.target.value)}):null,h==="images"?e("span",{className:"dk_hint dk_searchCount",children:String(En.length)+" / "+String(C.length)+" \u4E2A\u955C\u50CF"}):null,h==="images"?e($,{icon:zo,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u62C9\u53D6\u955C\u50CF\uFF08docker pull\uFF0C\u9010\u5C42\u5B9E\u65F6\u8FDB\u5EA6\uFF09":"\u62C9\u53D6\u955C\u50CF\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>Ge(!0)},"pull"):null,h==="images"?e($,{icon:jn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u6E05\u7406 dangling\uFF08\u65E0\u6807\u7B7E\uFF09\u955C\u50CF":"\u6E05\u7406 dangling \u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:fo},"prune"):null,h==="networks"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u7F51\u7EDC\uFF08\u540D\u79F0 / \u9A71\u52A8 / ID\uFF09",value:w,onChange:i=>M(i.target.value)}):null,h==="volumes"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u5377\uFF08\u540D\u79F0 / \u9A71\u52A8 / \u6302\u8F7D\u70B9\uFF09",value:N,onChange:i=>F(i.target.value)}):null,h==="networks"?e("span",{className:"dk_hint dk_searchCount",children:String(In.length)+" / "+String(f.length)+" \u4E2A\u7F51\u7EDC"}):null,h==="volumes"?e("span",{className:"dk_hint dk_searchCount",children:String(On.length)+" / "+String(x.length)+" \u4E2A\u5377"}):null,h==="networks"?e($,{icon:jn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u7F51\u7EDC\uFF08docker network prune\uFF09":"\u6E05\u7406\u7F51\u7EDC\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:vo},"prune"):null,h==="volumes"?e($,{icon:jn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u5377\uFF08docker volume prune\uFF0C\u4F1A\u5220\u6570\u636E\uFF09":"\u6E05\u7406\u5377\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:bo},"prune"):null,h==="compose"?e("span",{className:"dk_hint dk_searchCount",children:String(pn(Ze).length)+" \u4E2A\u9879\u76EE \xB7 "+String(Ze.length)+" \u4E2A\u5BB9\u5668"}):null,h==="containers"?e("div",{className:"dk_seg",children:[["all","\u5168\u90E8"],["running","\u8FD0\u884C\u4E2D"],["stopped","\u5DF2\u505C\u6B62"],["unhealthy","\u4E0D\u5065\u5EB7"]].map(([i,m])=>e("button",{type:"button",className:"dk_segBtn","data-on":Je===i?"1":"0",onClick:()=>wn(i),children:m},i))}):null,h==="containers"||h==="compose"||h==="overview"?o("div",{className:"dk_toolbarToggles",children:[h==="containers"||h==="compose"?e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:Ne,onChange:i=>_e(i.target.checked)}),"\u542B\u5DF2\u505C\u6B62"]},"all"):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:Le,onChange:i=>zt(i.target.checked)}),"\u81EA\u52A8\u5237\u65B0"]},"auto")]}):null,Ee?o("div",{className:"dk_toolbarEnd",children:[n?.allowMutations!==!0?e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"},"readonly"):null,e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":we?"1":void 0,onClick:_t,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:et}})},"refresh")]}):null]}),h==="containers"&&ge?e(Wa,{count:wt.length,info:wo,presets:No,max:en,notice:ee,onPreset:So,onClear:()=>{oe([]),X("")},onRun:()=>fe(!0),onCancel:Re},"pickBar"):null,o("div",{className:"dk_body","data-stale":Er?"1":void 0,children:[Er?e("div",{className:"dk_switchOverlay",children:_o()},"stale"):null,o("div",{className:"dk_main"+(h==="images"||h==="networks"||h==="volumes"||h==="overview"?" dk_mainImages":""),children:[Te===""||h==="overview"?null:e(Y,{title:"\u64CD\u4F5C\u5931\u8D25",hint:Te}),Z===""?null:e(Y,{kind:"info",title:Z}),t.sessionHint===void 0?null:e(Y,{kind:"info",title:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u6CA1\u914D\u7F6E\u4E3A Docker \u76EE\u6807",hint:"\u4F1A\u8BDD\u4E3B\u673A\uFF1A"+t.sessionHint.host+(t.sessionHint.port===22?"":":"+String(t.sessionHint.port))+(t.sessionHint.book===""?"":"\uFF08\u8FDE\u63A5\u7C3F\uFF1A"+t.sessionHint.book+"\uFF09")+" \u2014 \u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761 kind=ssh \u76EE\u6807"+(t.sessionHint.book===""?"\uFF08\u586B host/username\uFF0C\u6216\u7528\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09":"\uFF0C\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\u300C"+t.sessionHint.book+"\u300D")+"\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u5373\u53EF\u3002"}),n!==null&&n.allowMutations!==!0?e(Y,{kind:"info",title:"\u5F53\u524D\u4E3A\u53EA\u8BFB\u6A21\u5F0F",hint:"\u5BB9\u5668\u7684\u542F\u52A8 / \u505C\u6B62 / \u91CD\u542F / \u5220\u9664\uFF0C\u4EE5\u53CA\u955C\u50CF\u3001\u7F51\u7EDC\u3001\u5377\u7684\u5220\u9664\u4E0E\u6E05\u7406\uFF0C\u90FD\u9700\u8981\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u3002"}):null,h==="containers"?e(Ka,{events:Ft,status:Ke,statusText:go(),open:Vt,onToggle:()=>Nn(i=>!i)},"activity"):null,yo()]})]}),ye===null?null:e(dt,{title:ye.title,text:ye.text,confirmLabel:ye.confirmLabel,busy:Jt,onCancel:()=>Se(null),onConfirm:ye.run})],se===null?null:e(Ja,{label:se.label,hostRef:K,collapsed:W,height:qe,onToggleCollapse:()=>ue(i=>!i),onResizeStart:oo,onClose:()=>J(null)},"execDrawer"),ao&&se!==null?e(dt,{title:"\u7ED3\u675F\u5BB9\u5668\u7EC8\u7AEF\u4F1A\u8BDD",text:"\u5173\u95ED\u9762\u677F\u4F1A\u7ED3\u675F\u300C"+se.label+"\u300D\u7684\u7EC8\u7AEF\u4F1A\u8BDD\uFF08docker exec -it \u2026\uFF09\u3002\u82E5\u53EA\u662F\u60F3\u7ED9\u65E5\u5FD7 / \u5217\u8868\u817E\u5730\u65B9\uFF0C\u5148\u70B9\u62BD\u5C49\u53F3\u4E0A\u89D2\u7684\u6298\u53E0\u6309\u94AE\u5373\u53EF\uFF0C\u4F1A\u8BDD\u4F1A\u4FDD\u6301\u8FD0\u884C\u3002",confirmLabel:"\u7ED3\u675F\u5E76\u5173\u95ED",onCancel:()=>Cn(!1),onConfirm:()=>{Cn(!1),t.onClose()}},"closeConfirm"):null],Br=o("div",{className:"dk_panel"+(Ee?" dk_panelDock":Ir?" dk_panelTab":""),"data-dock":Ee?"1":void 0,ref:Sr,onMouseDown:i=>i.stopPropagation(),children:To});return Ee||Ir?Br:o("div",{className:"dk_backdrop",onMouseDown:i=>{Tn.current=i.target===i.currentTarget},onMouseUp:i=>{let m=Tn.current&&i.target===i.currentTarget;Tn.current=!1,m&&We()},children:[Br]})}function br(t){let n=null;try{n=t.useTabInfo()}catch{}let a=()=>{ht=!1;try{n?.tab?.actions?.close?.()}catch{}};E(()=>{ht=!0},[]);let r=n?.tab?.navigation?.params,u=typeof r?.target=="string"?r.target:"",d=P("");u!==""&&(d.current=u);let s=d.current,c=n?.tab?.visible!==!1,k=n?.sidebar?.fullscreen===!0;return e(pr.Provider,{value:c,children:e(Ht,{key:s===""?"docker-tab":s,carrier:"tab",tabFullscreen:k,onClose:a,initialTarget:s===""?void 0:s,sessionHint:r?.sessionHint})})}function Xa(){let[t,n]=p(!1),[a,r]=p(null),[u,d]=p(!1),[s,c]=p(!1),[k,y]=p({kind:"",text:""}),h=P(0),v=de(()=>{Q.config().then(f=>{r(f.config),An(f.config),h.current=Array.isArray(f.config?.targets)?f.config.targets.length:0,d(!0)}).catch(f=>{y({kind:"error",text:"\u8BFB\u53D6\u914D\u7F6E\u5931\u8D25\uFF1A"+f.message}),d(!0)})},[]);E(()=>{t&&!u&&v()},[t,u,v]);let T=f=>r(b=>({...b,...f})),O=(f,b)=>r(x=>{let z=x.targets.slice();return z[f]={...z[f],...b},{...x,targets:z}}),L=()=>r(f=>({...f,targets:[...f.targets,{name:"\u76EE\u6807"+String(f.targets.length+1),kind:"local",book:"",host:"",port:22,username:"",auth:"agent",keyPath:"",agentForward:!1,passwordSet:!1,passphraseSet:!1}]})),H=f=>r(b=>({...b,targets:b.targets.filter((x,z)=>z!==f)})),_=f=>r(b=>({...b,hostKeys:b.hostKeys.filter(x=>!(x.host===f.host&&x.port===f.port))})),A=()=>{c(!0),y({kind:"",text:""});let f={enabled:a.enabled,announceToAgent:a.announceToAgent,dockerBin:a.dockerBin,allowMutations:a.allowMutations,allowExec:a.allowExec,execTimeoutSec:a.execTimeoutSec,pollIntervalSec:a.pollIntervalSec,logTailDefault:a.logTailDefault,maxOutputKb:a.maxOutputKb,targets:a.targets.map(b=>({name:b.name,kind:b.kind,book:b.book??"",host:b.host??"",port:Number(b.port)||22,username:b.username??"",auth:b.auth??"agent",keyPath:b.keyPath??"",...b.password===void 0||b.password===""?{}:{password:b.password},...b.passphrase===void 0||b.passphrase===""?{}:{passphrase:b.passphrase},agentForward:b.agentForward===!0})),hostKeys:a.hostKeys,...a.targets.length===0&&h.current>0?{clearTargets:!0}:{}};Q.saveConfig(f).then(b=>{r(b.config),An(b.config),h.current=Array.isArray(b.config?.targets)?b.config.targets.length:0,sn(),y(b.warning===void 0?{kind:"ok",text:"\u5DF2\u4FDD\u5B58\u5E76\u70ED\u751F\u6548"}:{kind:"error",text:b.warning})}).catch(b=>{y({kind:"error",text:"\u4FDD\u5B58\u5931\u8D25\uFF1A"+b.message})}).finally(()=>c(!1))},R=f=>e("div",{className:"dk_cardSection",children:f}),j=(f,b,x,z)=>o("div",{className:"dk_field","data-span":z===void 0?void 0:String(z),children:[e("span",{className:"dk_label",children:f}),b,x===void 0?null:e("span",{className:"dk_hint",children:x})]}),C=(f,b,x,z)=>e("input",{className:"dk_input",type:"number",min:b,max:x,value:a[f],onChange:U=>T({[f]:Number(U.target.value)})}),ne=f=>o("li",{className:"dk_settingsCard"+(t?" dk_settingsCardOpen":""),children:[o("button",{type:"button",className:"dk_settingsHead","aria-expanded":t,onClick:()=>n(b=>!b),children:[o("span",{className:"dk_settingsHeadText",children:[e("span",{className:"dk_settingsName",children:"Docker \u5BB9\u5668\u9762\u677F"}),e("span",{className:"dk_settingsDesc",children:"\u672C\u673A / SSH \u4E3B\u673A\u4E0A\u7684\u5BB9\u5668\u4E0E\u955C\u50CF\uFF1B\u9ED8\u8BA4\u53EA\u8BFB\uFF0C\u53D8\u66F4\u64CD\u4F5C\u9700\u663E\u5F0F\u5F00\u542F"})]}),e("span",{className:"dshkit_badge",children:"Kit"}),e("span",{className:"dk_settingsChevron",dangerouslySetInnerHTML:{__html:Dn}})]}),t?e("div",{className:"dk_settingsBody",children:f}):null]});return ne(t?!u||a===null?o("div",{className:"dk_row",children:[e("span",{className:"dk_spin"}),"\u8BFB\u53D6\u914D\u7F6E\u2026"]}):[R("\u57FA\u672C"),o("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:a.enabled,onChange:f=>T({enabled:f.target.checked})}),"\u542F\u7528\u63D2\u4EF6"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:a.announceToAgent,onChange:f=>T({announceToAgent:f.target.checked})}),"\u5411 agent \u516C\u544A\u80FD\u529B"]})]}),o("div",{className:"dk_fieldGrid",children:[j("docker CLI",e("input",{className:"dk_input",value:a.dockerBin,onChange:f=>T({dockerBin:f.target.value})}),"\u9ED8\u8BA4 docker\uFF1Bpodman \u53EF\u586B podman"),j("\u7EDF\u8BA1\u5237\u65B0\u95F4\u9694\uFF08\u79D2\uFF09",C("pollIntervalSec",1,60)),j("\u65E5\u5FD7\u9ED8\u8BA4\u884C\u6570",C("logTailDefault",1,5e3)),j("\u8F93\u51FA\u4E0A\u9650\uFF08KB\uFF09",C("maxOutputKb",1,8192)),j("exec \u8D85\u65F6\uFF08\u79D2\uFF09",C("execTimeoutSec",1,120))]}),R("\u80FD\u529B\u5F00\u5173\uFF08\u9ED8\u8BA4\u5173\u95ED\uFF09"),o("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:a.allowMutations,onChange:f=>T({allowMutations:f.target.checked})}),"\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\uFF08\u5BB9\u5668\u542F\u505C\u5220\u3001\u955C\u50CF\u62C9\u53D6 / \u5220\u9664 / \u6E05\u7406\uFF09"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:a.allowExec,onChange:f=>T({allowExec:f.target.checked})}),"\u5141\u8BB8 exec\uFF08\u5728\u5BB9\u5668\u5185\u6267\u884C\u547D\u4EE4\uFF09"]})]}),e("span",{className:"dk_hint",children:"docker socket \u7B49\u4EF7\u4E8E\u76EE\u6807\u4E3B\u673A\u7684 root \u6743\u9650\u3002\u5F00\u542F\u540E\uFF0C\u6D4F\u89C8\u5668\u9762\u677F\u4E0E agent \u90FD\u80FD\u6267\u884C\u5BF9\u5E94\u64CD\u4F5C\uFF0C\u8BF7\u53EA\u5728\u53EF\u4FE1\u73AF\u5883\u4E0B\u6253\u5F00\u3002"}),R("\u76EE\u6807"),...a.targets.map((f,b)=>o("div",{className:"dk_targetRow",children:[e("input",{className:"dk_input",value:f.name,placeholder:"\u76EE\u6807\u540D",onChange:x=>O(b,{name:x.target.value})}),e("select",{className:"dk_select",value:f.kind,onChange:x=>O(b,{kind:x.target.value}),children:[e("option",{value:"local",children:"\u672C\u673A"}),e("option",{value:"ssh",children:"SSH \u4E3B\u673A"})]}),f.kind==="local"?e("span",{className:"dk_hint",children:"\u5BBF\u4E3B\u6240\u5728\u673A\u5668\u4E0A\u7684 docker"}):o("div",{className:"dk_row",style:{gridColumn:"span 1"},children:[e("select",{className:"dk_select",value:f.book??"",onChange:x=>O(b,{book:x.target.value}),children:[e("option",{value:"",children:a.ttyBooks.length===0?"\uFF08\u65E0 tty \u8FDE\u63A5\u7C3F\uFF0C\u8BF7\u586B\u5185\u8054\u4FE1\u606F\uFF09":"\uFF08\u4E0D\u7528\u8FDE\u63A5\u7C3F\uFF0C\u624B\u586B\uFF09"}),...a.ttyBooks.map(x=>e("option",{value:x,children:"\u8FDE\u63A5\u7C3F\uFF1A"+x},x))]})]}),e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:()=>H(b),children:"\u5220\u9664"}),f.kind==="ssh"&&(f.book??"")===""?o("div",{className:"dk_targetInline",children:[e("input",{className:"dk_input",placeholder:"host",value:f.host??"",onChange:x=>O(b,{host:x.target.value})}),e("input",{className:"dk_input",placeholder:"22",title:"\u7AEF\u53E3",value:f.port??22,onChange:x=>O(b,{port:Number(x.target.value)||22})}),e("input",{className:"dk_input",placeholder:"username",value:f.username??"",onChange:x=>O(b,{username:x.target.value})}),e("select",{className:"dk_select",value:f.auth??"agent",onChange:x=>O(b,{auth:x.target.value}),children:[e("option",{value:"agent",children:"ssh-agent"}),e("option",{value:"key",children:"\u79C1\u94A5"}),e("option",{value:"password",children:"\u5BC6\u7801"})]}),(f.auth??"agent")==="key"?e("input",{className:"dk_input dk_credential",placeholder:"~/.ssh/id_ed25519",value:f.keyPath??"",onChange:x=>O(b,{keyPath:x.target.value})}):null,(f.auth??"agent")==="password"?e("input",{className:"dk_input dk_credential",type:"password",placeholder:f.passwordSet===!0?"\uFF08\u5DF2\u8BBE\u7F6E\uFF0C\u7559\u7A7A\u4FDD\u6301\u4E0D\u53D8\uFF09":"env:SSH_PASSWORD",value:f.password??"",onChange:x=>O(b,{password:x.target.value})}):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:f.agentForward===!0,onChange:x=>O(b,{agentForward:x.target.checked})}),"agent forwarding"]})]}):null]},String(b)+f.name)),o("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn",onClick:L,children:"\u6DFB\u52A0\u76EE\u6807"}),e("span",{className:"dk_hint",children:"SSH \u76EE\u6807\u63A8\u8350\u76F4\u63A5\u9009 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF08\u51ED\u8BC1\u53EA\u9700\u7EF4\u62A4\u4E00\u5904\uFF09\uFF1B\u624B\u586B\u65F6\u5BC6\u7801 / \u53E3\u4EE4\u5EFA\u8BAE\u5199 env:VAR\u3002"})]}),R("SSH \u4E3B\u673A\u5BC6\u94A5\u8BB0\u5F55\uFF08TOFU\uFF09"),...a.hostKeys.length===0?[e("span",{className:"dk_hint",children:"\u6682\u65E0\u8BB0\u5F55 \u2014 \u9996\u6B21 SSH \u8FDE\u63A5\u6210\u529F\u540E\u81EA\u52A8\u8BB0\u5F55\u4E3B\u673A\u6307\u7EB9\uFF08\u82E5 tty \u5DF2\u8BB0\u5F55\u540C\u4E00\u4E3B\u673A\uFF0C\u4F1A\u76F4\u63A5\u590D\u7528\uFF09\u3002"},"none")]:a.hostKeys.map(f=>o("div",{className:"dk_targetRow",children:[e("span",{children:f.host+":"+String(f.port)}),e("span",{className:"dk_hint",style:{gridColumn:"span 2",wordBreak:"break-all"},children:"sha256:"+f.fingerprint}),e("button",{type:"button",className:"dk_btn",onClick:()=>_(f),children:"\u5220\u9664"})]},f.host+":"+String(f.port))),e("span",{className:"dk_hint",children:"\u6307\u7EB9\u53D8\u66F4\u65F6\u8FDE\u63A5\u4F1A\u88AB\u62D2\u7EDD\uFF08\u9632\u4E2D\u95F4\u4EBA\uFF09\uFF1B\u786E\u8BA4\u5B89\u5168\u540E\u5220\u9664\u5BF9\u5E94\u8BB0\u5F55\u5373\u53EF\u91CD\u8FDE\u3002"}),o("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:s,onClick:A,children:s?"\u4FDD\u5B58\u4E2D\u2026":"\u4FDD\u5B58"}),e("span",{className:"dk_msg","data-kind":k.kind,children:k.text})]})]:null)}let kt=null,at=null,xn=null;function gt(){let t=at,n=kt,a=xn;if(at=null,kt=null,xn=null,n!==null&&n.remove(),t!==null&&setTimeout(()=>{try{t.unmount()}catch{}},0),a!==null)try{a.dispose()}catch{}}function Ya(t){return t!==null&&typeof t=="object"&&typeof t.appendChild=="function"}function $a(){return typeof Qe?.mountPane=="function"&&typeof Qe.isOpen=="function"&&Number(Qe.version??0)>=1&&Qe.isOpen()===!0}let Za="dsh-docker:carrier";function _r(){try{return window.localStorage.getItem(Za)==="modal"?"modal":"tab"}catch{return"tab"}}let ht=!1;function yr(t,n,a,r){return t!==!0||r!==!0||typeof a!="string"||a===""?!1:a!==n}function xr(t){if(_r()==="tab"&&it!==null)try{let n={};typeof t?.target=="string"&&t.target!==""&&(n.target=t.target),t?.sessionHint!==void 0&&(n.sessionHint=t.sessionHint),ht=!0,it.openTab(Rn,{params:n});return}catch(n){console.warn("[dsh-docker] \u6253\u5F00\u53F3\u4FA7\u680F\u6807\u7B7E\u5931\u8D25\uFF0C\u56DE\u9000\u6A21\u6001\uFF1A"+(n instanceof Error?n.message:String(n)))}wr(t)}function wr(t){gt(),Mn();let n={onClose:gt,initialTarget:t?.target??"",sessionHint:t?.sessionHint};if($a()){let a=null;try{a=Qe.mountPane({title:"Docker \u5BB9\u5668",hint:t?.target===void 0||t.target===""?"":t.target,size:520,min:360,onClose:()=>gt()})}catch(r){a=null,console.warn("[dsh-docker] \u6302\u8F7D\u5230\u7EC8\u7AEF\u9762\u677F\u5931\u8D25\uFF0C\u56DE\u9000\u5F39\u7A97\uFF1A"+(r instanceof Error?r.message:String(r)))}if(a!==null&&Ya(a.element)){xn=a,at=I(a.element),at.render(e(Ht,{...n,docked:!0,onTargetChange:r=>{try{a.setHint(r)}catch{}}}));return}}kt=document.createElement("div"),document.body.appendChild(kt),at=I(kt),at.render(e(Ht,n))}function Qa(){let t=document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');if(t!==null)return t.querySelector('[class*="logoRow"]')?.parentElement??t.firstElementChild}function eo(t){let n=t.querySelector('button[class*="newSession"]');if(n!==null)return n;for(let a of t.children)if(a.tagName==="BUTTON")return a}function to(){let t=document.createElement("div");return t.dataset.dshDockerEntry="",t.className="dk_sidebarEntry",t.setAttribute("role","button"),t.setAttribute("aria-label","\u5BB9\u5668"),t.innerHTML='<span class="dk_entryIcon">'+Vr+'</span><span class="dk_entryLabel">\u5BB9\u5668</span>',t.addEventListener("click",n=>{n.preventDefault(),xr()}),t}function Nr(t,n){let a=eo(t);if(a===void 0)return!1;if(n.parentElement!==t){let r=a.closest('[class*="logoRow"]'),u=r!==null&&r.parentElement===t?r:a,d=Array.from(t.children).filter(s=>s instanceof HTMLElement&&s.matches("[data-dsh-global-search-entry], [data-dsh-rss-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-tty-entry], [data-dsh-docker-entry]"));if(d.length>0){let s=d[d.length-1];t.insertBefore(n,s.nextSibling)}else t.insertBefore(n,u.nextElementSibling)}return!0}function no(){if(Mn(),document.querySelector("[data-dsh-docker-entry]")!==null)return()=>{};let t=to(),n,a=!1,r=()=>{if(n!==void 0&&!n.isConnected&&(d.disconnect(),n=void 0,a=!1),a){if(document.body.contains(t))return;d.disconnect(),n=void 0,a=!1}n??(n=Qa()),n!==void 0&&(a=Nr(n,t),a&&d.observe(n,{childList:!0,subtree:!0}))},u=new MutationObserver(()=>{r()});u.observe(document.body,{childList:!0,subtree:!0});let d=new MutationObserver(()=>{if(n===void 0||!n.isConnected){a=!1,r();return}n.contains(t)||(a=Nr(n,t))});return r(),()=>{u.disconnect(),d.disconnect(),t.remove()}}let Oe={};return Oe.inject=["slots"],Oe.__carrier={open:xr,preference:_r,isOwnExec:Hr,buildExec:Bn,shouldReopen:yr,deliver:At},Oe.__render={ContainerPanel:Ht,DockerTabBody:br,SessionProbeBody:vr},Oe.__pick={MAX:cn,SSH_MAX:Fn,PRESETS:ua,presetCounts:Yr,apply:Xr,SOFT_MAX:ca,decide:Jr,toggle:Ur,reconcile:qr,items:$r},Oe.__events={LIMIT:ea,RECENT:ta,DEBOUNCE_MS:na,append:ra,actionText:oa,timeText:aa,debounce:ia},Oe.__overview={ERROR_MAX:Vn,counts:ha,abnormal:Kn,sortRows:pa,patch:St,errorText:ma,data:Qr,body:Xn},Oe.__listSeq={make:Zr},Oe.__panel={chooseInitialTarget:Pn,readLastTarget:zr,writeLastTarget:Fr,LAST_TARGET_KEY:Gn},Oe.__aggLogs={mergeBuffered:gr,WINDOW_MS:mn,splitTs:sr,levelName:cr,orderByTs:fn,REORDER_TAIL:vn,reorderTail:Dt,filterByLevel:ur,exportText:kr},Oe.apply=t=>{Mn();let n=!1,a=()=>{};un={set(d){if(d!==n){if(n=d,d){a=no();return}a(),a=()=>{},gt(),typeof ln?.requestRender=="function"&&ln.requestRender()}}},da(!0);let r=t.slots.inject("settings.plugin.item",()=>t.slots.register({name:"settings.plugin.item",key:"docker",order:102},Xa));t.inject(["ttyTerminal"],d=>(Xe=d.ttyTerminal??null,()=>{Xe=null})),t.inject(["ttyPanel"],d=>(Qe=d.ttyPanel??null,()=>{Qe=null})),t.inject(["sessions"],d=>{Ce=d.sessions??null;let s=null;try{s=Ce?.list?.getSnapshot?.()?.current??null}catch{}let c=typeof Ce?.list?.subscribe=="function"?Ce.list.subscribe(()=>{let k=null;try{k=Ce.list.getSnapshot()?.current??null}catch{}if(yr(ht,s,k,it!==null))try{it.openTab(Rn,{})}catch{}typeof k=="string"&&k!==""&&(s=k)}):null;return()=>{if(c!==null)try{c()}catch{}Ce=null,ht=!1}}),t.inject(["sidebarRightTabs","sidebarRight"],d=>{let s=d.sidebarRightTabs.register({id:Dr,kind:Rn,priority:"extension",title:()=>"Docker \u5BB9\u5668",guide:[{order:90,title:()=>"Docker \u5BB9\u5668",description:()=>"\u672C\u673A\u4E0E SSH \u4E3B\u673A\u7684\u5BB9\u5668\u3001\u955C\u50CF\u3001Compose\u3001\u7F51\u7EDC\u4E0E\u5377"}]}),c=d.slots.inject("sidebar.right.pane.tab",()=>d.slots.register({name:"sidebar.right.pane.tab",key:Dr},br));it=d.sidebarRight??null;let k=()=>{},y=()=>{};try{k=d.sidebarRightTabs.register({id:mr,kind:fr,priority:"extension",title:()=>"\u4F1A\u8BDD\u63A2\u9488",guide:[{order:95,title:()=>"\u4F1A\u8BDD\u63A2\u9488\uFF08spike\uFF09",description:()=>"\u9A8C\u8BC1\u4F1A\u8BDD\u6D41\u5F0F\u8BA2\u9605\uFF1AuseChat / useConversation / projections"}]}),y=d.slots.inject("sidebar.right.pane.tab",()=>d.slots.register({name:"sidebar.right.pane.tab",key:mr},vr)),jt=d.sidebarRight??null}catch(h){console.warn("[dsh-docker][spike] \u4F1A\u8BDD\u63A2\u9488\u6CE8\u518C\u5931\u8D25\uFF1A"+(h instanceof Error?h.message:String(h)))}return()=>{it=null,jt=null;try{y()}catch{}try{k()}catch{}try{c()}catch{}try{s()}catch{}}});let u=()=>{};return sn(),t.inject(["ttyConnbar"],d=>{let s=d.ttyConnbar;s!==void 0&&(ln=s,u=s.addAction(c=>{if(!kn)return;let k=c?.spec??{};if(k.t!=="ssh"||Hr(k.command))return;let y=typeof c?.bookName=="string"?c.bookName:"",h=zn(k,y),v=h!==void 0?`\u6253\u5F00\u8BE5\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F\uFF08\u76EE\u6807\uFF1A${h}\uFF09`:Ae===null?"\u6253\u5F00\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F":"\u8BE5\u4E3B\u673A\u5C1A\u672A\u914D\u7F6E\u4E3A Docker \u76EE\u6807 \u2014 \u70B9\u51FB\u6253\u5F00\u9762\u677F\u67E5\u770B/\u914D\u7F6E";c.addAction(Mo,"\u5BB9\u5668",v,()=>{(async()=>{let T=await Ro(k,y),O=Number(k.port);wr({target:T??"",sessionHint:T===void 0?{host:typeof k.host=="string"?k.host:"",port:Number.isInteger(O)&&O>0?O:22,book:y}:void 0})})()})}),(async()=>{for(let c=0;c<3;c+=1){if(await sn()){typeof s.requestRender=="function"&&s.requestRender();return}await new Promise(k=>setTimeout(k,2e3))}})())}),()=>{u(),r(),un=null,kn=!1,ln=null,a(),gt()}},Oe}});})();
