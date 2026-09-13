"use strict";(()=>{var Nn=`/* eslint-disable */
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

.dk_ovCardCounts { display: flex; flex-wrap: wrap; gap: var(--dk-gap-lg); }

.dk_ovCount {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 12px;
  color: var(--dk-label-3);
}

.dk_ovCountValue {
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
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
`;var ln="/api/dsh-docker",Sn="dsh-docker-style";function Xt(){if(document.getElementById(Sn)!==null)return;let i=document.createElement("style");i.id=Sn,i.textContent=Nn,document.head.appendChild(i)}async function X(i,h){let e=await fetch(ln+i,{...h,headers:{"content-type":"application/json",...h?.headers??{}}}),a=null;try{a=await e.json()}catch{}if(!e.ok){let I=a!==null&&typeof a.error=="string"?a.error:`HTTP ${String(e.status)}`;throw new Error(I)}if(a!==null&&a.ok===!1)throw new Error(typeof a.error=="string"?a.error:"\u8BF7\u6C42\u5931\u8D25");return a}var U={config:()=>X("/config"),saveConfig:i=>X("/config",{method:"POST",body:JSON.stringify(i)}),targets:()=>X("/targets"),probe:i=>X("/probe",{method:"POST",body:JSON.stringify({target:i})}),containers:(i,h)=>X("/containers",{method:"POST",body:JSON.stringify({target:i,all:h})}),inspect:(i,h)=>X("/inspect",{method:"POST",body:JSON.stringify({target:i,id:h})}),logs:(i,h,e)=>X("/logs",{method:"POST",body:JSON.stringify({target:i,id:h,...e})}),stats:(i,h)=>X("/stats",{method:"POST",body:JSON.stringify({target:i,ids:h})}),images:i=>X("/images",{method:"POST",body:JSON.stringify({target:i})}),imageInspect:(i,h)=>X("/images/inspect",{method:"POST",body:JSON.stringify({target:i,ref:h})}),imageRemove:(i,h)=>X("/images/remove",{method:"POST",body:JSON.stringify({target:i,ref:h})}),imagePrune:i=>X("/images/prune",{method:"POST",body:JSON.stringify({target:i})}),networks:i=>X("/networks",{method:"POST",body:JSON.stringify({target:i})}),networkInspect:(i,h)=>X("/networks/inspect",{method:"POST",body:JSON.stringify({target:i,name:h})}),networkRemove:(i,h)=>X("/networks/remove",{method:"POST",body:JSON.stringify({target:i,name:h})}),networkPrune:i=>X("/networks/prune",{method:"POST",body:JSON.stringify({target:i})}),volumes:i=>X("/volumes",{method:"POST",body:JSON.stringify({target:i})}),volumeInspect:(i,h)=>X("/volumes/inspect",{method:"POST",body:JSON.stringify({target:i,name:h})}),volumeRemove:(i,h)=>X("/volumes/remove",{method:"POST",body:JSON.stringify({target:i,name:h})}),volumePrune:i=>X("/volumes/prune",{method:"POST",body:JSON.stringify({target:i})}),action:(i,h,e)=>X("/action",{method:"POST",body:JSON.stringify({target:i,action:h,id:e})}),exec:(i,h,e,a)=>X("/exec",{method:"POST",body:JSON.stringify({target:i,id:h,command:e,timeoutSec:a})})};function Ot(i,h){return ln+i+"?"+new URLSearchParams(h).toString()}function Ja(i){return i==null||!Number.isFinite(i)?"\u2014":i.toFixed(i>=10?1:2)+"%"}function Ka(i){return i.hostPort===void 0?String(i.containerPort)+"/"+i.protocol:String(i.hostPort)+"\u2192"+String(i.containerPort)+"/"+i.protocol}function Mt(i){if(!Array.isArray(i)||i.length===0)return"\u65E0\u7AEF\u53E3\u6620\u5C04";let h=new Set,e=[];for(let a of i){let I=Ka(a);h.has(I)||(h.add(I),e.push(I))}return e.join("  ")}function ft(i){let h=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(i);return h===null?i:h[1]+" "+h[2]}function Bt(i){if(i==null||!Number.isFinite(i)||i<0)return"\u2014";let h=["B","kB","MB","GB","TB"],e=i,a=0;for(;e>=1e3&&a<h.length-1;)e/=1e3,a+=1;return(a===0?String(Math.round(e)):e.toFixed(e>=100?0:1))+" "+h[a]}function Wa(i){return{running:"\u8FD0\u884C\u4E2D",exited:"\u5DF2\u505C\u6B62",created:"\u5DF2\u521B\u5EFA",paused:"\u5DF2\u6682\u505C",restarting:"\u91CD\u542F\u4E2D",dead:"dead",removing:"\u5220\u9664\u4E2D",unknown:"\u672A\u77E5"}[i]??i}function Ua(i,h){let e=new Blob([h],{type:"text/plain;charset=utf-8"}),a=URL.createObjectURL(e),I=document.createElement("a");I.href=a,I.download=i,I.click(),setTimeout(()=>URL.revokeObjectURL(a),1e3)}function Cn(i){return"docker exec -it '"+String(i).replaceAll("'","'\\''")+"' sh"}var Pe=null,Je=null,Rt=null,je=null,dn=[],nn=0,jt=null,At=!1;function Jn(i){At=i,jt!==null&&jt.set(i)}function Kn(i){Jn(!(i!==null&&typeof i=="object"&&i.enabled===!1))}function Zt(i){i!==null&&typeof i=="object"&&(je=i),nn=Date.now(),Kn(je)}async function Pt(){let i=!0;try{je=(await U.config()).config,nn=Date.now(),Kn(je)}catch(h){i=!1,console.warn("[dsh-docker] \u914D\u7F6E\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(h instanceof Error?h.message:String(h)))}try{dn=(await U.targets()).targets??[],nn=Date.now()}catch(h){At&&(i=!1,console.warn("[dsh-docker] \u76EE\u6807\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(h instanceof Error?h.message:String(h))))}return i}async function qa(i,h){let e=an(i,h);return e!==void 0?e:(await Pt(),an(i,h))}function an(i,h){let e=je!==null&&Array.isArray(je.targets)?je.targets:[];if(typeof h=="string"&&h!==""){let O=e.find(K=>K.kind==="ssh"&&K.book===h);if(O!==void 0)return O.name}let a=typeof i?.host=="string"?i.host:"";if(a==="")return;let I=Number(i?.port),k=Number.isInteger(I)&&I>0?I:22;for(let O of dn){if(O.kind!=="ssh"||typeof O.label!="string")continue;let K=/^([^@]+)@(.+?)(?::(\d+))?$/.exec(O.label);if(K!==null&&K[2]===a&&Number(K[3]??22)===k)return O.name}}var Ln='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',Ya='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',Ke='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',we='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7"/><path d="M11.5 4.5l-7 7"/></svg>',$a='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.4l7.4 4.6L5 12.6z"/></svg>',Xa='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.2"/></svg>',Za='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',Dt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.6h10"/><path d="M6.2 4.6V3.4a.8.8 0 0 1 .8-.8h2a.8.8 0 0 1 .8.8v1.2"/><path d="M4.6 4.6l.6 8a.9.9 0 0 0 .9.8h3.8a.9.9 0 0 0 .9-.8l.6-8"/></svg>';var Qa='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v7.2"/><path d="M5 7.4L8 10.4l3-3"/><path d="M3.4 12.8h9.2"/></svg>',er='<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6l5.8 10.4H2.2z"/><path d="M8 6.4v3.2"/><path d="M8 11.6h.01"/></svg>',Tn='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l3.5 3L3 11"/><path d="M8.5 11H13"/></svg>',En='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 4.5h10"/><path d="M3 8h10"/><path d="M3 11.5h6"/></svg>',tr='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3.5 12.5v-4"/><path d="M7 12.5v-8"/><path d="M10.5 12.5v-5"/><path d="M13 12.5v-2"/></svg>',We='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 8h-9"/><path d="M7 4.5L3.5 8 7 11.5"/></svg>',Qt='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5L8 10.5l4-4"/></svg>',nr='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6v6.4"/><path d="M5.3 6.5L8 9.2l2.7-2.7"/><path d="M3 11.4v1.2a.8.8 0 0 0 .8.8h8.4a.8.8 0 0 0 .8-.8v-1.2"/></svg>',ar='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="9" rx="1.2"/><path d="M2.5 10.2L5.6 7.6l2.4 2 2.1-1.7 3.4 2.9"/><path d="M6 6.2h.01"/></svg>',en='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.4 12.6h9.2"/><path d="M5.2 9.6l3.1-3.1"/><path d="M8.4 3.6l2.4 2.4"/><path d="M10.6 6.2l1.8 1.8-3.2 1.2-1.2 3.2-1.8-1.8z"/></svg>',In='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.4 5.9L8 2.8l5.6 3.1L8 9z"/><path d="M2.4 8.4L8 11.5l5.6-3.1"/><path d="M2.4 10.9L8 14l5.6-3.1"/></svg>';var rr='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="3.2" r="1.7"/><circle cx="3.4" cy="12.2" r="1.7"/><circle cx="12.6" cy="12.2" r="1.7"/><path d="M6.7 4.6L4.5 10.6"/><path d="M9.3 4.6l2.2 6"/><path d="M5.1 12.2h5.8"/></svg>',or='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="8" cy="4.2" rx="4.6" ry="1.9"/><path d="M3.4 4.2v7.6c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9V4.2"/><path d="M3.4 8c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9"/></svg>',Wn=6,rn=8;function On(i){return i>rn?{canRun:!1,hint:"\u6700\u591A "+String(rn)+" \u4E2A\u5BB9\u5668\uFF0C\u6D4F\u89C8\u5668\u5E76\u53D1\u957F\u8FDE\u63A5\u6709\u9650\u5236"}:i>Wn?{canRun:!0,hint:"\u8FDE\u63A5\u6570\u8F83\u591A\uFF0C\u6D4F\u89C8\u5668\u5E76\u53D1\u957F\u8FDE\u63A5\u6709\u9650\u5236"}:i<2?{canRun:!1,hint:i===0?"":"\u81F3\u5C11\u9009\u62E9 2 \u4E2A\u5BB9\u5668"}:{canRun:!0,hint:""}}function Mn(i,h){return i.includes(h)?i.filter(e=>e!==h):[...i,h]}function Bn(i,h){let e=new Set(h.map(I=>I.id)),a=i.filter(I=>e.has(I));return a.length===i.length?i:a}function Rn(i,h){let e=new Map(i.map(a=>[a.id,a]));return h.map(a=>e.get(a)).filter(a=>a!==void 0)}function Dn(){let i=0;return{next(){return i+=1,i},isCurrent(h){return h===i}}}var on=120;function Un(i){return i.filter(h=>h.health==="unhealthy"||h.state==="restarting")}function qn(i){let h=0,e=0,a=0;for(let I of i)I.state==="running"||I.state==="paused"||I.state==="restarting"?h+=1:e+=1,I.health==="unhealthy"&&(a+=1);return{running:h,stopped:e,unhealthy:a}}function Yn(i){let h=e=>e.item.health==="unhealthy"?0:1;return i.slice().sort((e,a)=>{let I=h(e)-h(a);return I!==0?I:e.targetIndex!==a.targetIndex?e.targetIndex-a.targetIndex:e.item.name===a.item.name?0:e.item.name<a.item.name?-1:1})}function $n(i){let h=String(i??"").split(`
`)[0].trim();return h===""?"\u672A\u77E5\u9519\u8BEF":h.length>on?h.slice(0,on)+"\u2026":h}function tn(i,h,e){let a=!1,I=i.map(k=>k.name!==h?k:(a=!0,{...k,...e}));return a?I:i}function Pn(i){let h=i.map(a=>{let I=qn(a.containers);return{name:a.name,kind:a.kind==="ssh"?"ssh":"local",label:typeof a.label=="string"?a.label:"",error:a.error===""?"":$n(a.error),loaded:a.loaded===!0,running:I.running,stopped:I.stopped,unhealthy:I.unhealthy}}),e=[];return i.forEach((a,I)=>{for(let k of Un(a.containers))e.push({target:a.name,targetIndex:I,item:k})}),{cards:h,rows:Yn(e),unreachable:h.filter(a=>a.error!==""),loading:i.some(a=>a.loaded!==!0)}}var jn=50,An=8,Hn=500;function zn(i,h,e){let a=[h,...i];return a.length>e?a.slice(0,e):a}function Fn(i){if(typeof i!="number"||!Number.isFinite(i))return"--:--:--";let h=new Date(i*1e3);if(Number.isNaN(h.getTime()))return"--:--:--";let e=a=>String(a).padStart(2,"0");return e(h.getHours())+":"+e(h.getMinutes())+":"+e(h.getSeconds())}function Vn(i){let h=typeof i.action=="string"?i.action:"";return h===""?"?":h.indexOf("die")!==0||i.exitCode===null||i.exitCode===void 0?h:h+"("+String(i.exitCode)+")"}function Gn(i,h){let e=null;return{schedule(){e!==null&&clearTimeout(e),e=setTimeout(()=>{e=null,h()},i)},cancel(){e!==null&&(clearTimeout(e),e=null)}}}window.__ModuleLoader__.load({id:"@hyzyn/dsh-docker",factory:i=>{let h=i("react"),{jsx:e,jsxs:a}=i("react/jsx-runtime"),{createRoot:I}=i("react-dom/client"),{useState:k,useEffect:O,useRef:K,useCallback:ke}=h;function Xn(t,r,d){if(r==="")return t;let l=t.toLowerCase(),m=r.toLowerCase(),o=[],p=0,v=l.indexOf(m),s=0;for(;v>=0&&s<500;)v>p&&o.push(t.slice(p,v)),o.push(e("mark",{children:t.slice(v,v+m.length)},d+"-m"+String(s))),p=v+m.length,s+=1,v=l.indexOf(m,p);return p<t.length&&o.push(t.slice(p)),o}function sn(t){let r=Array.isArray(t.rows)?t.rows:[],d=Array.isArray(t.mono)?t.mono:[];return a("div",{className:"dk_kv",children:r.flatMap(([l,m],o)=>[e("div",{className:"dk_kvKey",children:l},"k"+String(o)),e("div",{className:"dk_kvVal"+(d.indexOf(l)>=0?" dk_kvValMono":""),children:m},"v"+String(o))])})}function nt(t){let r=t.health==="unhealthy"?"unhealthy":t.state,d=t.health==="unhealthy"?"\u4E0D\u5065\u5EB7":Wa(t.state);return e("span",{className:"dk_badge","data-state":r,title:t.status??"",children:d})}function G(t){return a("div",{className:"dk_banner","data-kind":t.kind??"error",children:[e("span",{className:"dk_bannerIcon",dangerouslySetInnerHTML:{__html:er}},"icon"),a("div",{className:"dk_bannerBody",children:[e("div",{children:t.title}),t.hint===void 0?null:e("div",{className:"dk_hint",style:{marginTop:4},children:t.hint})]},"body"),t.action===void 0?null:e("div",{className:"dk_bannerAction",children:t.action},"action")]})}function Ht(t,r,d){return a("span",{className:"dk_ovCount","data-state":t,"data-zero":d===0?"1":void 0,children:[e("span",{className:"dk_ovCountValue",children:String(d)}),e("span",{className:"dk_ovCountLabel",children:r})]},t)}function cn(t,r){if(t.cards.length===0)return a("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD8\u6CA1\u6709\u914D\u7F6E Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u76EE\u6807\u540E\uFF0C\u603B\u89C8\u4F1A\u5728\u8FD9\u91CC\u4E00\u5C4F\u6C47\u603B\u5168\u90E8\u4E3B\u673A\u3002"})]});let d=t.rows.length===0?t.loading?a("div",{className:"dk_empty dk_ovEmpty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]},"loading"):a("div",{className:"dk_empty dk_ovEmpty",children:[e("div",{className:"dk_emptyTitle",children:"\u4E00\u5207\u6B63\u5E38"}),e("div",{className:"dk_emptyHint",children:"\u6240\u6709\u76EE\u6807\u4E0A\u90FD\u6CA1\u6709\u4E0D\u5065\u5EB7\u6216\u91CD\u542F\u4E2D\u7684\u5BB9\u5668\u3002"})]},"empty"):e("div",{className:"dk_tableWrap",children:a("table",{className:"dk_images dk_ovTable",children:[e("thead",{children:a("tr",{children:[e("th",{children:"\u5BB9\u5668\u540D"}),e("th",{children:"\u76EE\u6807"}),e("th",{children:"\u72B6\u6001"}),e("th",{children:"\u955C\u50CF"})]})}),e("tbody",{children:t.rows.map(l=>a("tr",{className:"dk_rowClickable",title:"\u6253\u5F00\u5BB9\u5668\u8BE6\u60C5",onClick:()=>r.onOpenContainer(l.target,l.item),children:[e("td",{className:"dk_mono",title:l.item.name,children:l.item.name}),e("td",{children:l.target}),e("td",{children:e(nt,{state:l.item.state,health:l.item.health,status:l.item.status})}),e("td",{className:"dk_mono dk_pathCell",title:l.item.image,children:l.item.image})]},l.target+"\0"+l.item.id))})]})},0);return a("div",{className:"dk_imagesView dk_ovView",children:[t.unreachable.length===0?null:e(G,{title:String(t.unreachable.length)+" \u4E2A\u76EE\u6807\u4E0D\u53EF\u8FBE",hint:t.unreachable.map(l=>l.name+"\uFF1A"+l.error).join("\uFF1B")+"\uFF08\u5176\u4F59\u76EE\u6807\u7684\u6B63\u5E38\u7ED3\u679C\u4E0D\u53D7\u5F71\u54CD\uFF09"},"unreachable"),e("div",{className:"dk_ovCards",children:t.cards.map(l=>a("button",{type:"button",className:"dk_ovCard","data-state":l.error!==""?"error":l.loaded===!0?"ok":"loading",title:l.error===""?"\u5207\u5230\u8BE5\u76EE\u6807\u7684\u5BB9\u5668\u5217\u8868":l.error,onClick:()=>r.onOpenTarget(l.name),children:[a("div",{className:"dk_ovCardHead",children:[e("span",{className:"dk_ovCardName",title:l.label===""?l.name:l.label,children:l.name}),e("span",{className:"dk_badge","data-state":"paused",children:l.kind==="local"?"\u672C\u673A":"SSH"})]},"head"),l.error===""?l.loaded===!0?a("div",{className:"dk_ovCardCounts",children:[Ht("running","\u8FD0\u884C\u4E2D",l.running),Ht("stopped","\u5DF2\u505C\u6B62",l.stopped),Ht("unhealthy","\u4E0D\u5065\u5EB7",l.unhealthy)]},"counts"):a("div",{className:"dk_ovCardLoading",children:[e("span",{className:"dk_spin"}),e("span",{children:"\u8BFB\u53D6\u4E2D\u2026"})]},"loading"):a("div",{className:"dk_ovCardError",children:[e("span",{className:"dk_badge","data-state":"dead",children:"\u4E0D\u53EF\u8FBE"}),e("span",{className:"dk_ovCardErrorText",title:l.error,children:l.error})]},"error")]},l.name))},1),e("div",{className:"dk_ovSection",children:t.rows.length===0?"\u5F02\u5E38\u5BB9\u5668":"\u5F02\u5E38\u5BB9\u5668\uFF08"+String(t.rows.length)+"\uFF09"},2),d]})}function at(t){let r=t.busy===!0;return a("div",{className:"dk_confirmBackdrop",onMouseDown:d=>d.stopPropagation(),children:[a("div",{className:"dk_confirm","data-busy":r?"1":void 0,children:[e("div",{className:"dk_confirmTitle",children:t.title}),e("div",{className:"dk_confirmText",children:t.text}),a("div",{className:"dk_confirmActions",children:[e("button",{type:"button",className:"dk_btn",disabled:r,onClick:t.onCancel,children:"\u53D6\u6D88"}),e("button",{type:"button",className:"dk_btn dk_btnDanger",disabled:r,"aria-busy":r?"true":void 0,onClick:t.onConfirm,children:r?a("span",{className:"dk_confirmBusy",children:[e("span",{className:"dk_spin"}),"\u6267\u884C\u4E2D\u2026"]}):t.confirmLabel})]})]})]})}function lr(t){return e("button",{type:"button",className:"dk_btn"+(t.danger===!0?" dk_btnDanger":""),disabled:t.disabled===!0,title:t.title??"",onClick:r=>{r.stopPropagation(),t.onClick()},children:t.children})}let un=60;function kn(t,r,d){let l=t.concat([r]);return l.length>d?l.slice(l.length-d):l}function gn(t){let r=Array.isArray(t.values)?t.values:[],d=r.filter(S=>typeof S=="number"&&Number.isFinite(S)),l=96,m=22,o=Math.max(Number(t.max)||0,...d,1),p=r.length>1?l/(r.length-1):0,v=[];r.forEach((S,E)=>{if(typeof S!="number"||!Number.isFinite(S))return;let P=p===0?l:E*p,T=m-Math.min(1,Math.max(0,S/o))*m;v.push(P.toFixed(1)+","+T.toFixed(1))});let s=d.length===0?null:d[d.length-1],N=t.alertAt!==void 0&&s!==null&&s>=t.alertAt;return e("span",{className:"dk_spark","data-alert":N?"1":void 0,title:t.title??"",children:v.length<2?e("span",{className:"dk_sparkEmpty",children:"\u91C7\u6837\u4E2D\u2026"}):e("svg",{viewBox:"0 0 "+String(l)+" "+String(m),preserveAspectRatio:"none","aria-hidden":"true",children:e("polyline",{points:v.join(" "),fill:"none",stroke:"currentColor","stroke-width":"1.4","stroke-linejoin":"round","stroke-linecap":"round","vector-effect":"non-scaling-stroke"})})})}function rt(t){return a("div",{className:"dk_cardRow",children:[e("span",{className:"dk_cardLabel",children:t.label}),e("span",{className:"dk_cardValue",title:String(t.value),children:t.value})]})}function J(t){let r=t.disabled===!0,d=t.busy===!0;return e("button",{type:"button",className:"dk_iconBtn"+(t.danger===!0?" dk_iconBtnDanger":""),"data-on":t.on===!0?"1":void 0,"data-spin":t.spin===!0?"1":void 0,"data-busy":d?"1":void 0,"aria-busy":d?"true":void 0,disabled:r,title:t.title,"aria-label":t.title,onClick:l=>{l.stopPropagation(),!r&&t.onClick()},children:d?e("span",{className:"dk_spin"}):e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:t.icon}})})}function Zn(t){let r=t.item,d=t.pickMode===!0,l=t.picked===!0,m=t.allowMutations!==!0,o=r.state==="running"||r.state==="paused"||r.state==="restarting",p=r.createdAt===null?r.runningFor===""?"\u2014":r.runningFor:ft(r.createdAt),v=typeof t.pending=="string"?t.pending:"",s=v!=="",N=E=>s?"\u6B63\u5728\u6267\u884C "+v+"\u2026\u8BF7\u7A0D\u5019":m?"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D":E,S=()=>{if(d){t.onTogglePick(r);return}t.onOpen(r,"overview")};return a("div",{className:"dk_card",role:d?"checkbox":"button","aria-checked":d?l?"true":"false":void 0,tabIndex:0,"data-selected":t.selected===!0?"1":"0","data-pick":d?"1":void 0,"data-picked":l?"1":void 0,"data-pending":s?"1":void 0,onClick:S,onKeyDown:E=>{(E.key==="Enter"||E.key===" ")&&(E.preventDefault(),S())},children:[a("div",{className:"dk_cardHead",children:[d?e("span",{className:"dk_pick","data-on":l?"1":"0","aria-hidden":"true"},"pick"):null,e("span",{className:"dk_cardName",title:r.name,children:r.name}),e(nt,{state:r.state,health:r.health,status:r.status})]},"head"),a("div",{className:"dk_cardRows",children:[e(rt,{label:"\u955C\u50CF",value:r.image},"image"),e(rt,{label:"ID",value:r.shortId},"id"),e(rt,{label:"\u7AEF\u53E3",value:Mt(r.ports)},"ports"),e(rt,{label:"\u521B\u5EFA",value:p},"created"),r.composeProject===null?null:e(rt,{label:"compose",value:r.composeProject+(r.composeService===null?"":"/"+r.composeService)},"compose")]},"rows"),d?null:a("div",{className:"dk_actionBar",children:[e(J,{icon:Tn,title:"\u5728\u5BB9\u5668\u5185\u6253\u5F00\u4EA4\u4E92\u5F0F\u7EC8\u7AEF\uFF08docker exec -it "+r.name+" sh\uFF09",onClick:()=>t.onExec(r)},"exec"),e(J,{icon:En,title:"\u67E5\u770B\u65E5\u5FD7",onClick:()=>t.onOpen(r,"logs")},"logs"),e(J,{icon:tr,title:"\u8D44\u6E90\u5360\u7528",onClick:()=>t.onOpen(r,"stats")},"stats"),e("span",{className:"dk_actionBarSep","aria-hidden":"true"},"sep"),e(J,{icon:o?Xa:$a,title:N(o?"\u505C\u6B62\u5BB9\u5668":"\u542F\u52A8\u5BB9\u5668"),disabled:m||s,busy:v===(o?"stop":"start"),onClick:()=>t.onAction(o?"stop":"start",r)},"power"),e(J,{icon:Za,title:N("\u91CD\u542F\u5BB9\u5668"),disabled:m||s,busy:v==="restart",onClick:()=>t.onAction("restart",r)},"restart"),e(J,{icon:Dt,danger:!0,title:N("\u5220\u9664\u5BB9\u5668\uFF08\u4E0D\u53EF\u6062\u590D\uFF09"),disabled:m||s,busy:v==="remove",onClick:()=>t.onAction("remove",r)},"remove")]},"actions")]})}let Qn=/^\s*(\[\d{4}-\d{2}-\d{2}[ T][0-9:.,]+\]|\d{2}:\d{2}:\d{2}[,.]\d{3})/,ea=/^\s*(\[(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\]|\|\s*(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL))/,ta=/(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)/,ot=2e3,Ue=5e3;function hn(t,r,d){let l=[],m=t;for(let o=0;o<2;o+=1){let p=Qn.exec(m);if(p!==null){l.push(e("span",{className:"dk_logTs",children:p[1]},"ts"+String(o))),m=m.slice(p[0].length);continue}let v=ea.exec(m);if(v!==null){let s=ta.exec(v[1]);l.push(e("span",{className:"dk_logLevel","data-level":s===null?"":s[1],children:v[1].trim()},"lv"+String(o))),m=m.slice(v[0].length);continue}break}return l.push(e("span",{className:"dk_logText",children:Xn(m,d,"x"+String(r))},"tx")),l}function na(t,r,d){return a("div",{className:"dk_logLine",children:hn(t,r,d)},String(r))}function aa(t,r,d){return a("div",{className:"dk_logLine",children:[e("span",{className:"dk_logSvc",children:"["+t.service+"]"},"svc"),...hn(t.text,r,d)]},String(r))}function ra(t){let r=t.item,d=t.config,[l,m]=k(t.initialTab??"overview"),[o,p]=k(null),[v,s]=k(""),[N,S]=k({tail:d.logTailDefault,timestamps:!1}),[E,P]=k(null),[T,Y]=k(""),[$,f]=k(!1),[B,C]=k(""),[j,b]=k(!1),[V,u]=k(3),[g,w]=k(!1),[A,ee]=k([]),[R,F]=k(""),[se,Z]=k(""),[Oe,Ne]=k(""),[Ye,vt]=k(!1),[He,ze]=k(!0),ce=K([]),$e=K(""),te=K(null),[le,re]=k(null),[Se,Be]=k(""),[me,Re]=k(!1),[Ce,Xe]=k(""),[Ze,Fe]=k(""),[Ve,dt]=k({cpu:[],mem:[]}),ge=K({cpu:[],mem:[]}),[Le,Gt]=k(""),[Te,Qe]=k(null),[st,Me]=k(""),[be,bt]=k(!1);O(()=>{let _=!0;return p(null),s(""),U.inspect(t.target,r.id).then(L=>{_&&p(L.details?.[0]??null)}).catch(L=>{_&&s(L.message)}),()=>{_=!1}},[t.target,r.id,t.refreshToken]);let he=ke(()=>{f(!0),Y(""),U.logs(t.target,r.id,{tail:N.tail,timestamps:N.timestamps}).then(_=>P(_.logs)).catch(_=>Y(_.message)).finally(()=>f(!1))},[t.target,r.id,N.tail,N.timestamps]);O(()=>{l==="logs"&&he()},[l,he,t.refreshToken]),O(()=>{if(l!=="logs"||!j||g)return;let _=setInterval(he,Math.max(1,V)*1e3);return()=>clearInterval(_)},[l,j,V,he,g]),O(()=>{if(l!=="logs"||!g)return;if(typeof EventSource!="function"){Z("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u5B9E\u65F6\u8DDF\u968F"),w(!1);return}ce.current=[],$e.current="",ee([]),vt(!1),Z(""),Ne(""),ze(!0),F("connecting");let _=new URLSearchParams({target:t.target,id:r.id,tail:String(N.tail),...N.timestamps?{timestamps:"1"}:{}}),L=new EventSource(ln+"/logs/stream?"+_.toString()),y=!1,H=()=>{if(!y){y=!0;try{L.close()}catch{}}},ie=M=>{if(M==="")return;let D=($e.current+M).split(`
`);if($e.current=D.pop()??"",D.length===0)return;let W=ce.current.concat(D),fe=W.length>Ue?W.slice(W.length-Ue):W;ce.current=fe,fe.length!==W.length&&vt(!0),ee(fe)},De=M=>{let D=null;try{D=JSON.parse(M.data)}catch{return}D===null||typeof D!="object"||(typeof D.d=="string"?ie(D.d):typeof D.e=="string"&&ie(D.e))},de=M=>{let D=null;try{D=JSON.parse(M.data)}catch{}let W=D!==null&&typeof D.reason=="string"?D.reason:"container-exit",fe=D!==null&&typeof D.code=="number"?D.code:null;if(W==="container-exit"){Ne("\u5BB9\u5668\u5DF2\u9000\u51FA"+(fe===null?"":"\uFF08\u9000\u51FA\u7801 "+String(fe)+"\uFF09")+"\uFF0C\u65E5\u5FD7\u6D41\u7ED3\u675F\uFF0C\u5DF2\u5207\u56DE\u5FEB\u7167"),H(),w(!1),he();return}F("reconnecting"),Ne("\u670D\u52A1\u7AEF\u5DF2\u505C\u6B62\u65E5\u5FD7\u6D41\uFF0C\u6B63\u5728\u91CD\u8FDE\u2026")},z=M=>{if(typeof M.data=="string"&&M.data!==""){let D="\u65E5\u5FD7\u6D41\u5F02\u5E38";try{let W=JSON.parse(M.data);W!==null&&typeof W.message=="string"&&(D=W.message)}catch{}Z(D),H(),w(!1),he();return}F(L.readyState===2?"closed":"reconnecting")};return L.addEventListener("line",De),L.addEventListener("end",de),L.addEventListener("error",z),L.onopen=()=>{F("open"),Ne("")},H},[l,g,t.target,r.id,N.tail,N.timestamps,he]),O(()=>{if(l!=="logs"||!g||!He)return;let _=te.current;_!==null&&(_.scrollTop=_.scrollHeight)},[l,g,He,A]);let pe=()=>{if(g){w(!1),F(""),he();return}w(!0),b(!1),Z(""),Ne("")},Ee=()=>{if(me){Re(!1),Xe("");return}Re(!0),Fe(""),Be("")},_t=()=>Ce==="open"?"\u5B9E\u65F6\u8DDF\u968F\u4E2D\uFF08docker stats\uFF09":Ce==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u7EDF\u8BA1\u6D41\u2026":Ce==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":Ce==="closed"?"\u7EDF\u8BA1\u6D41\u5DF2\u65AD\u5F00":"\u7EDF\u8BA1\u6D41",yt=()=>{let _=te.current;_!==null&&(_.scrollTop=_.scrollHeight),ze(!0)},xt=_=>{if(!g)return;let L=_.currentTarget;ze(L.scrollHeight-L.scrollTop-L.clientHeight<24)},Ge=()=>R==="open"?"\u5B9E\u65F6\u8DDF\u968F\u4E2D\uFF08docker logs -f\uFF09":R==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u65E5\u5FD7\u6D41\u2026":R==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":R==="closed"?"\u65E5\u5FD7\u6D41\u5DF2\u65AD\u5F00":"\u65E5\u5FD7\u6D41";O(()=>{if(l!=="stats"||me)return;let _=!0,L=()=>{U.stats(t.target,[r.id]).then(H=>{_&&(re(H.stats?.[0]??null),Be(""))}).catch(H=>{_&&Be(H.message)})};L();let y=setInterval(L,Math.max(2,d.pollIntervalSec)*1e3);return()=>{_=!1,clearInterval(y)}},[l,me,t.target,r.id,d.pollIntervalSec,t.refreshToken]),O(()=>{if(l!=="stats"||!me)return;if(typeof EventSource!="function"){Fe("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u5B9E\u65F6\u8DDF\u968F"),Re(!1);return}ge.current={cpu:[],mem:[]},dt({cpu:[],mem:[]}),Xe("connecting"),Fe(""),Be("");let _=new EventSource(Ot("/stats/stream",{target:t.target,ids:r.id})),L=!1,y=()=>{if(!L){L=!0;try{_.close()}catch{}}},H=de=>{let z=null;try{z=JSON.parse(de.data)}catch{return}if(z===null||typeof z!="object")return;let M=typeof z.cpuPercent=="number"?z.cpuPercent:null,D=typeof z.memPercent=="number"?z.memPercent:null;re(z),Be("");let W={cpu:M===null?ge.current.cpu:kn(ge.current.cpu,M,un),mem:D===null?ge.current.mem:kn(ge.current.mem,D,un)};ge.current=W,dt(W)},ie=de=>{let z=null;try{z=JSON.parse(de.data)}catch{}let M=z!==null&&typeof z.reason=="string"?z.reason:"stats-exit",D=z!==null&&typeof z.code=="number"?z.code:null;Fe("\u7EDF\u8BA1\u6D41\u5DF2\u7ED3\u675F"+(M==="stats-exit"?"\uFF08docker stats \u9000\u51FA"+(D===null?"":"\uFF0C\u9000\u51FA\u7801 "+String(D))+"\uFF09":"")+"\uFF0C\u5DF2\u5207\u56DE\u5FEB\u7167\u8F6E\u8BE2"),y(),Re(!1)},De=de=>{if(typeof de.data=="string"&&de.data!==""){let z="\u7EDF\u8BA1\u6D41\u5F02\u5E38";try{let M=JSON.parse(de.data);M!==null&&typeof M.message=="string"&&(z=M.message)}catch{}Be(z),y(),Re(!1);return}Xe(_.readyState===2?"closed":"reconnecting")};return _.addEventListener("stats",H),_.addEventListener("end",ie),_.addEventListener("error",De),_.onopen=()=>{Xe("open"),Fe("")},y},[l,me,t.target,r.id]);let ct=()=>{Le.trim()!==""&&(bt(!0),Me(""),Qe(null),U.exec(t.target,r.id,Le,d.execTimeoutSec).then(_=>Qe(_.result)).catch(_=>Me(_.message)).finally(()=>bt(!1)))},Jt=()=>{if(v!=="")return e(G,{title:"\u8BFB\u53D6\u5BB9\u5668\u8BE6\u60C5\u5931\u8D25",hint:v});if(o===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let _=[["\u72B6\u6001",o.state+(o.health===null?"":" / "+o.health)+(o.status===""?"":"\uFF08"+o.status+"\uFF09")],["\u955C\u50CF",o.image],["\u5BB9\u5668 ID",o.shortId],["\u542F\u52A8\u65F6\u95F4",o.startedAt??"\u2014"],["\u7ED3\u675F\u65F6\u95F4",o.finishedAt??"\u2014"],["\u9000\u51FA\u7801",o.exitCode===null?"\u2014":String(o.exitCode)],["\u91CD\u542F\u6B21\u6570",o.restartCount===null?"\u2014":String(o.restartCount)],["\u91CD\u542F\u7B56\u7565",o.restartPolicy??"\u2014"],["PID",o.pid===null?"\u2014":String(o.pid)],["\u7AEF\u53E3",o.ports.length===0?"\u2014":Mt(o.ports)],["\u6302\u8F7D",o.mounts.length===0?"\u2014":o.mounts.map(y=>y.source+"\u2192"+y.destination+(y.readWrite?"":"\uFF08\u53EA\u8BFB\uFF09")).join(`
`)],["\u7F51\u7EDC",o.networks.length===0?"\u2014":o.networks.map(y=>y.name+(y.ip===null?"":"\uFF08"+y.ip+"\uFF09")).join(", ")],["\u547D\u4EE4",(o.entrypoint+" "+o.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",o.workingDir===""?"\u2014":o.workingDir],["\u7528\u6237",o.user===""?"\u2014":o.user]],L=a("div",{className:"dk_kv",children:_.flatMap(([y,H],ie)=>[e("div",{className:"dk_kvKey",children:y},"k"+String(ie)),e("div",{className:"dk_kvVal"+(y==="\u5BB9\u5668 ID"||y==="\u547D\u4EE4"||y==="\u955C\u50CF"?" dk_kvValMono":""),children:H},"v"+String(ie))])});return a("div",{children:[o.healthLogTail===null?null:e("div",{className:"dk_hint",style:{marginBottom:8},children:"\u6700\u8FD1\u5065\u5EB7\u68C0\u67E5\u8F93\u51FA\uFF1A"+o.healthLogTail}),L,e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u4E00\u6B21\u6027\u547D\u4EE4\uFF08docker exec\uFF09"}),d.allowExec!==!0?e(G,{kind:"info",title:"exec \u672A\u542F\u7528",hint:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8 exec\u300D\uFF0C\u6216\u76F4\u63A5\u590D\u5236\u5361\u7247\u4E0A\u7684 exec \u547D\u4EE4\u5230\u7EC8\u7AEF\u9762\u677F\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u3002"}):a("div",{children:[a("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u5982 ls -la /app \u6216 cat /etc/nginx/nginx.conf",value:Le,onChange:y=>Gt(y.target.value),onKeyDown:y=>{y.key==="Enter"&&ct()}}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:be,onClick:ct,children:be?"\u6267\u884C\u4E2D\u2026":"\u6267\u884C"})]}),st===""?null:e(G,{title:"\u6267\u884C\u5931\u8D25",hint:st}),Te===null?null:a("div",{style:{marginTop:8},children:[e("div",{className:"dk_hint",children:"\u9000\u51FA\u7801 "+(Te.code===null?"?":String(Te.code))+" \xB7 \u8017\u65F6 "+String(Te.durationMs)+"ms"+(Te.truncated?" \xB7 \u8F93\u51FA\u5DF2\u622A\u65AD":"")}),e("pre",{className:"dk_logBox",style:{marginTop:6},children:(Te.stdout||"")+(Te.stderr===""?"":`
[stderr]
`+Te.stderr)||"(\u65E0\u8F93\u51FA)"})]})]})]})},et=()=>{let _=g?A.join(`
`):E!==null&&typeof E=="object"&&typeof E.text=="string"?E.text:"",L=B.trim().toLowerCase(),y=_===""?[]:_.split(`
`),H=L===""?y:y.filter(ie=>ie.toLowerCase().includes(L));return{raw:_,needle:L,allLines:y,matchedLines:H}},tt=(_,L,y,H)=>e("button",{type:"button",className:"dk_pill"+(H?.className??""),"data-on":_?"1":"0",disabled:H?.disabled===!0,title:H?.title??"",onClick:y,children:L}),wt=()=>{let{raw:_}=et(),L=[...new Set([100,200,500,1e3,5e3,Number(d.logTailDefault)||200,Number(N.tail)||200])].filter(y=>Number.isInteger(y)&&y>0).sort((y,H)=>y-H);return a("div",{className:"dk_logTools",children:[e("span",{className:"dk_toolLabel",children:"LINES"}),e("select",{className:"dk_select dk_selectSm",value:String(N.tail),onChange:y=>S({...N,tail:Number(y.target.value)}),children:L.map(y=>e("option",{value:String(y),children:y===5e3?"Last 5000":"Last "+String(y)},String(y)))}),e("span",{className:"dk_toolLabel",children:"TIMESTAMPS"}),tt(N.timestamps,N.timestamps?"On":"Off",()=>S({...N,timestamps:!N.timestamps})),e("span",{className:"dk_toolLabel",children:"FOLLOW"}),tt(g,g?"On":"Off",pe,{className:" dk_pillFollow",title:g?"\u5173\u95ED\u5B9E\u65F6\u8DDF\u968F\uFF08\u56DE\u5230\u65E5\u5FD7\u5FEB\u7167\uFF09":"\u5B9E\u65F6\u8DDF\u968F\u5BB9\u5668\u65E5\u5FD7\uFF08docker logs -f\uFF09"}),e("span",{className:"dk_toolLabel",children:"AUTO REFRESH"}),tt(j,j?"On":"Off",()=>b(y=>!y),{disabled:g,title:g?"FOLLOW \u6253\u5F00\u65F6\u6682\u505C\u8F6E\u8BE2":"\u6309\u4E0B\u65B9\u95F4\u9694\u91CD\u65B0\u62C9\u53D6\u65E5\u5FD7\u5FEB\u7167"}),e("select",{className:"dk_select dk_selectSm",value:String(V),disabled:g,title:"\u81EA\u52A8\u5237\u65B0\u95F4\u9694\uFF08\u5F00\u542F AUTO REFRESH \u540E\u6309\u6B64\u8F6E\u8BE2\uFF09",onChange:y=>u(Number(y.target.value)),children:[2,3,5,10].map(y=>e("option",{value:String(y),children:String(y)+"s"},String(y)))}),e(J,{icon:Ke,title:"\u5237\u65B0\u65E5\u5FD7",spin:$,onClick:he},"refresh"),e(J,{icon:Qa,title:"\u4E0B\u8F7D\u65E5\u5FD7",disabled:_==="",onClick:()=>Ua(r.name+".log",_)},"download")]})},Kt=()=>{let{needle:_,allLines:L,matchedLines:y}=et();return a("div",{className:"dk_filterBar",children:[a("div",{className:"dk_filterWrap",children:[e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u65E5\u5FD7\u2026",value:B,onChange:H=>C(H.target.value),onKeyDown:H=>{H.key==="Escape"&&B!==""&&(H.stopPropagation(),C(""))}}),B===""?null:e("button",{type:"button",className:"dk_filterClear",title:"\u6E05\u7A7A\u8FC7\u6EE4","aria-label":"\u6E05\u7A7A\u8FC7\u6EE4",onClick:()=>C(""),children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:we}})},"clear")]}),e("span",{className:"dk_filterCount",children:_===""?String(L.length)+" \u884C":String(y.length)+" / "+String(L.length)+" \u884C\u5339\u914D"})]})},ae=()=>{let{needle:_,matchedLines:L}=et(),y=L.length>ot?L.slice(-ot):L;return a("div",{className:"dk_logs",children:[T===""?null:e(G,{title:"\u8BFB\u53D6\u65E5\u5FD7\u5931\u8D25",hint:T+(T.includes("Failed to fetch")?"\uFF08\u7F51\u7EDC\u8BF7\u6C42\u6CA1\u5230\u5BBF\u4E3B\uFF1A\u5BBF\u4E3B\u53EF\u80FD\u521A\u91CD\u542F\u3001\u6216\u8FDE\u63A5\u88AB\u4E2D\u65AD\uFF09":""),action:e("button",{type:"button",className:"dk_btn",disabled:$,onClick:he,children:"\u91CD\u8BD5"})}),se===""?null:e(G,{title:"\u65E5\u5FD7\u6D41\u4E2D\u65AD",hint:se,action:e("button",{type:"button",className:"dk_btn",onClick:pe,children:"\u91CD\u8BD5"})}),Oe===""?null:e(G,{kind:"info",title:Oe}),Ye?e(G,{kind:"warn",title:"\u65E5\u5FD7\u8D85\u8FC7 "+String(Ue)+" \u884C\uFF0C\u5DF2\u4E22\u5F03\u6700\u65E9\u5185\u5BB9",hint:"\u6D41\u5F0F\u65E5\u5FD7\u53EA\u4FDD\u7559\u6700\u8FD1\u7684\u884C\uFF1B\u9700\u8981\u5B8C\u6574\u5386\u53F2\u8BF7\u7528\u5FEB\u7167\u6216\u300C\u4E0B\u8F7D\u65E5\u5FD7\u300D\u3002"}):null,!g&&E!==null&&E.truncated===!0?e(G,{kind:"warn",title:"\u65E5\u5FD7\u8F93\u51FA\u8D85\u8FC7\u4E0A\u9650\uFF0C\u5DF2\u622A\u65AD",hint:"\u8C03\u5C0F\u300CLINES\u300D\u6216\u5230\u8BBE\u7F6E\u5361\u7247\u8C03\u5927\u300C\u5355\u6B21\u547D\u4EE4\u8F93\u51FA\u4E0A\u9650\u300D\u3002"}):null,g?e("div",{className:"dk_followState","data-state":R,children:Ge()}):null,a("div",{className:"dk_logBody",ref:te,onScroll:xt,children:[L.length>y.length?e("div",{className:"dk_logLine dk_logMore",children:"\uFF08\u53EA\u663E\u793A\u6700\u8FD1 "+String(ot)+" \u884C\uFF0C\u5171 "+String(L.length)+" \u884C\u5339\u914D\uFF09"},"more"):null,T!==""?null:!g&&E===null?e("div",{className:"dk_logLine",children:"\u8BFB\u53D6\u4E2D\u2026"},"loading"):y.length===0?e("div",{className:"dk_logLine",children:g?"\u7B49\u5F85\u65E5\u5FD7\u2026":_===""?"(\u65E0\u65E5\u5FD7)":"(\u65E0\u5339\u914D\u65E5\u5FD7)"},"empty"):y.map((H,ie)=>na(H,ie,_))]}),g&&!He?e("button",{type:"button",className:"dk_backToBottom",onClick:yt,children:"\u56DE\u5230\u5E95\u90E8"}):null]})},q=()=>{let _=me,L=a("div",{className:"dk_statsBar",children:[e("span",{className:"dk_toolLabel",children:"FOLLOW"}),tt(_,_?"On":"Off",Ee,{className:" dk_pillFollow",title:_?"\u5173\u95ED\u5B9E\u65F6\u8DDF\u968F\uFF08\u56DE\u5230 docker stats \u5FEB\u7167\uFF09":"\u5B9E\u65F6\u8DDF\u968F\u8D44\u6E90\u5360\u7528\uFF08docker stats \u6BCF\u79D2\u4E00\u884C\uFF09"}),e("span",{className:"dk_hint",children:_?"60 \u70B9 \u2248 \u6700\u8FD1 1 \u5206\u949F":"\u6253\u5F00 FOLLOW \u770B\u5B9E\u65F6\u8D8B\u52BF"}),e("span",{className:"dk_headerSpacer"}),_?e("span",{className:"dk_followState","data-state":Ce,children:_t()}):null]}),y=M=>a("div",{className:"dk_statsView",children:[L,M]});if(Ze!=="")return y(a("div",{children:[e(G,{kind:"info",title:Ze}),Se===""?null:e(G,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:Se})]}));if(Se!=="")return y(e(G,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:Se}));if(le===null)return y(e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}));let H=le.cpuPercent??0,ie=le.memPercent??0,De=M=>a("div",{className:"dk_bar",children:[e("div",{className:"dk_barFill","data-warn":M>=60&&M<85?"1":void 0,"data-danger":M>=85?"1":void 0,style:{width:Math.min(100,Math.max(0,M))+"%"}})]}),de=Math.max(100,...Ve.cpu),z=(M,D,W)=>a("tr",{children:[e("td",{children:M}),e("td",{className:"dk_num",children:D}),e("td",{children:W??null})]},M);return y(a("table",{className:"dk_stats",children:[e("thead",{children:a("tr",{children:[e("th",{children:"\u6307\u6807"}),e("th",{children:"\u6570\u503C"}),e("th",{children:"\u5360\u7528 / \u8D8B\u52BF"})]})}),e("tbody",{children:[z("CPU",Ja(le.cpuPercent),a("div",{className:"dk_trend",children:[De(H),_||Ve.cpu.length>0?e(gn,{values:Ve.cpu,max:de,alertAt:85,title:"CPU% \u6700\u8FD1 60 \u4E2A\u91C7\u6837"}):null]})),z("\u5185\u5B58",le.memUsage,a("div",{className:"dk_trend",children:[De(ie),_||Ve.mem.length>0?e(gn,{values:Ve.mem,max:100,alertAt:85,title:"\u5185\u5B58\u5360\u7528% \u6700\u8FD1 60 \u4E2A\u91C7\u6837"}):null]})),z("\u7F51\u7EDC IO",le.netIO,null),z("\u78C1\u76D8 IO",le.blockIO,null),z("PIDs",le.pids===null?"\u2014":String(le.pids),null)]})]}))},Ie=[["overview","\u6982\u89C8"],["logs","\u65E5\u5FD7"],["stats","\u7EDF\u8BA1"]],ut=l==="overview"?o===null&&v==="":l==="stats"?le===null&&Se==="":!1;return a("div",{className:"dk_detail",children:[a("div",{className:"dk_header dk_headerDetail",children:[e(J,{icon:We,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:r.name,children:r.name}),e(nt,{state:r.state,health:r.health,status:r.status}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),l==="logs"?wt():e(J,{icon:Ke,title:"\u5237\u65B0",spin:ut,onClick:t.onRefresh},"refresh"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:we}})},"close")]}),a("div",{className:"dk_tabs",children:[...Ie.map(([_,L])=>e("button",{type:"button",className:"dk_tab","data-on":l===_?"1":"0",onClick:()=>m(_),children:L},_)),l==="logs"?e("span",{className:"dk_headerSpacer"},"spacer"):null,l==="logs"?Kt():null]}),e("div",{className:"dk_detailBody",children:l==="overview"?Jt():l==="logs"?ae():q()})]})}function zt(t){return t.dangling===!0?t.id:t.reference}function oa(t){let r=t.item,d=zt(r),[l,m]=k("overview"),[o,p]=k(null),[v,s]=k(""),[N,S]=k(!1),E=ke(()=>{S(!0),s(""),U.imageInspect(t.target,d).then(f=>p(f.image)).catch(f=>s(f.message)).finally(()=>S(!1))},[t.target,d]);O(()=>{E()},[E]);let P=f=>a("div",{className:"dk_kv",children:f.flatMap(([B,C],j)=>[e("div",{className:"dk_kvKey",children:B},"k"+String(j)),e("div",{className:"dk_kvVal"+(["ID","\u5165\u53E3","digest"].indexOf(B)>=0?" dk_kvValMono":""),children:C},"v"+String(j))])}),T=()=>{if(v!=="")return e(G,{title:"\u8BFB\u53D6\u955C\u50CF\u8BE6\u60C5\u5931\u8D25",hint:v,action:e("button",{type:"button",className:"dk_btn",onClick:E,children:"\u91CD\u8BD5"})});if(o===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let f=o.detail,B=[["\u6807\u7B7E",f.repoTags.length===0?"<none>\uFF08dangling\uFF09":f.repoTags.join(`
`)],["ID",f.id],["\u5927\u5C0F",f.size===null?"\u2014":Bt(f.size)],["\u542B\u7236\u5C42",f.virtualSize===null?"\u2014":Bt(f.virtualSize)],["\u521B\u5EFA",f.created===""?"\u2014":ft(f.created)],["\u5E73\u53F0",f.os===""&&f.architecture===""?"\u2014":f.os+"/"+f.architecture],["\u5C42\u6570",String(f.layerCount)],["\u5165\u53E3",(f.entrypoint+" "+f.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",f.workingDir===""?"\u2014":f.workingDir],["\u7528\u6237",f.user===""?"\u2014":f.user],["\u66B4\u9732\u7AEF\u53E3",f.exposedPorts.length===0?"\u2014":f.exposedPorts.join(", ")],["digest",f.repoDigests.length===0?"\u2014":f.repoDigests.join(`
`)]],C=Object.entries(f.labels);return a("div",{children:[P(B),e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u5C42\uFF08"+String(f.layerCount)+"\uFF09"}),f.layers.length===0?e("span",{className:"dk_hint",children:"\u8BE5\u955C\u50CF\u6CA1\u6709\u5C42\u4FE1\u606F\uFF08scratch \u6784\u5EFA\u6216\u65E7\u7248 docker\uFF09\u3002"}):e("div",{className:"dk_layerList",children:f.layers.map((j,b)=>a("div",{className:"dk_layerItem",children:[e("span",{className:"dk_layerIndex",children:"#"+String(b)}),e("span",{className:"dk_mono dk_layerId",title:j,children:j.replace(/^sha256:/,"")})]},j+String(b)))}),C.length===0?null:a("div",{children:[e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u6807\u7B7E\uFF08"+String(C.length)+"\uFF09"}),e("div",{className:"dk_labelList",children:C.map(([j,b])=>a("div",{className:"dk_labelItem",children:[e("span",{className:"dk_labelKey",children:j}),e("span",{className:"dk_labelVal",title:b,children:b})]},j))})]})]})},Y=()=>v!==""?e(G,{title:"\u8BFB\u53D6\u955C\u50CF\u8BE6\u60C5\u5931\u8D25",hint:v}):o===null?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):o.historyError!==null?e(G,{kind:"warn",title:"\u8BFB\u53D6\u6784\u5EFA\u5386\u53F2\u5931\u8D25",hint:o.historyError}):o.history.length===0?a("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u6CA1\u6709\u6784\u5EFA\u5386\u53F2"}),e("div",{className:"dk_emptyHint",children:"\u8BE5 docker \u7248\u672C\u65E2\u6CA1\u6709 history --format\uFF08\u9700\u8981 Docker \u2265 26\uFF09\uFF0C\u7EAF\u6587\u672C\u8868\u683C\u4E5F\u6CA1\u89E3\u6790\u51FA\u5185\u5BB9\u3002"})]}):e("div",{className:"dk_tableWrap",children:a("table",{className:"dk_images dk_historyTable",children:[e("thead",{children:a("tr",{children:[e("th",{children:"\u5C42 ID"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u6784\u5EFA\u547D\u4EE4"})]})}),e("tbody",{children:o.history.map((f,B)=>a("tr",{children:[e("td",{className:"dk_mono",children:f.shortId}),e("td",{children:f.createdSince===""?f.created===""?"\u2014":ft(f.created):f.createdSince}),e("td",{children:f.sizeText===""?f.size===null?"\u2014":Bt(f.size):f.sizeText}),e("td",{className:"dk_mono dk_historyCmd",title:f.createdBy,children:f.createdBy===""?"\u2014":f.createdBy})]},String(B)))})]})}),$=[["overview","\u6982\u89C8"],["history","\u6784\u5EFA\u5386\u53F2"]];return a("div",{className:"dk_detail",children:[a("div",{className:"dk_header dk_headerDetail",children:[e(J,{icon:We,title:"\u8FD4\u56DE\u955C\u50CF\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:d,children:d}),r.dangling===!0?e("span",{className:"dk_badge","data-state":"paused",children:"dangling"}):null,e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e(J,{icon:Ke,title:"\u5237\u65B0\u955C\u50CF\u8BE6\u60C5",spin:N,onClick:E},"refresh"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:we}})},"close")]}),e("div",{className:"dk_tabs",children:$.map(([f,B])=>e("button",{type:"button",className:"dk_tab","data-on":l===f?"1":"0",onClick:()=>m(f),children:B},f))}),e("div",{className:"dk_detailBody",children:l==="overview"?T():Y()})]})}function la(t){let r=t.item,d=r.name,[l,m]=k("overview"),[o,p]=k(null),[v,s]=k(""),[N,S]=k(!1),[E,P]=k(!1),[T,Y]=k(!1),[$,f]=k(""),B=ke(()=>{S(!0),s(""),U.networkInspect(t.target,d).then(u=>p(u.network)).catch(u=>s(u.message)).finally(()=>S(!1))},[t.target,d]);O(()=>{B()},[B]);let C=()=>{Y(!0),f(""),U.networkRemove(t.target,d).then(u=>t.onRemoved(u.result.message)).catch(u=>{P(!1),f(u.message)}).finally(()=>Y(!1))},j=()=>{if(v!=="")return e(G,{title:"\u8BFB\u53D6\u7F51\u7EDC\u8BE6\u60C5\u5931\u8D25",hint:v,action:e("button",{type:"button",className:"dk_btn",onClick:B,children:"\u91CD\u8BD5"})});if(o===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let u=o.detail,g=[["\u540D\u79F0",u.name],["ID",u.id],["\u9A71\u52A8",u.driver===""?"\u2014":u.driver],["\u8303\u56F4",u.scope===""?"\u2014":u.scope],["\u521B\u5EFA",u.created===""?"\u2014":ft(u.created)],["\u5B50\u7F51",u.subnets.length===0?"\u2014":u.subnets.map(w=>w.subnet===""?"\u2014":w.subnet).join(`
`)],["\u7F51\u5173",u.subnets.length===0?"\u2014":u.subnets.map(w=>w.gateway===""?"\u2014":w.gateway).join(`
`)],["\u5C5E\u6027",[u.internal?"internal":"",u.attachable?"attachable":"",u.ingress?"ingress":"",u.enableIpv6?"ipv6":""].filter(w=>w!=="").join(" \xB7 ")||"\u2014"],["\u9009\u9879",Object.keys(u.options).length===0?"\u2014":Object.entries(u.options).map(([w,A])=>w+"="+A).join(`
`)],["\u6807\u7B7E",Object.keys(u.labels).length===0?"\u2014":Object.entries(u.labels).map(([w,A])=>w+"="+A).join(`
`)]];return e(sn,{rows:g,mono:["ID","\u5B50\u7F51","\u7F51\u5173","\u9009\u9879","\u6807\u7B7E"]})},b=()=>{if(v!=="")return e(G,{title:"\u8BFB\u53D6\u7F51\u7EDC\u8BE6\u60C5\u5931\u8D25",hint:v});if(o===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let u=o.detail.containers;return u.length===0?e("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u6CA1\u6709\u5BB9\u5668\u63A5\u5165\u8FD9\u4E2A\u7F51\u7EDC"})]}):e("div",{className:"dk_tableWrap",children:a("table",{className:"dk_images",children:[e("thead",{children:a("tr",{children:[e("th",{children:"\u5BB9\u5668"}),e("th",{children:"IPv4"}),e("th",{children:"IPv6"}),e("th",{children:"MAC"})]})}),e("tbody",{children:u.map(g=>a("tr",{children:[e("td",{className:"dk_mono",title:g.id,children:g.name===""?g.shortId:g.name}),e("td",{className:"dk_mono",children:g.ipv4===""?"\u2014":g.ipv4}),e("td",{className:"dk_mono",children:g.ipv6===""?"\u2014":g.ipv6}),e("td",{className:"dk_mono",children:g.mac===""?"\u2014":g.mac})]},g.id))})]})})},V=[["overview","\u6982\u89C8"],["containers","\u63A5\u5165\u7684\u5BB9\u5668"+(o===null?"":"\uFF08"+String(o.detail.containers.length)+"\uFF09")]];return a("div",{className:"dk_detail",children:[a("div",{className:"dk_header dk_headerDetail",children:[e(J,{icon:We,title:"\u8FD4\u56DE\u7F51\u7EDC\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:rr}}),e("span",{className:"dk_detailTitle",title:d,children:d}),r.internal===!0?e("span",{className:"dk_badge","data-state":"paused",children:"internal"}):null,e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e(J,{icon:Ke,title:"\u5237\u65B0\u7F51\u7EDC\u8BE6\u60C5",spin:N,onClick:B},"refresh"),e(J,{icon:Dt,danger:!0,disabled:t.allowMutations!==!0,title:t.allowMutations===!0?"\u5220\u9664\u7F51\u7EDC\uFF08\u4E0D\u53EF\u6062\u590D\uFF09":"\u5220\u9664\u7F51\u7EDC\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>P(!0)},"remove"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:we}})},"close")]}),e("div",{className:"dk_tabs",children:V.map(([u,g])=>e("button",{type:"button",className:"dk_tab","data-on":l===u?"1":"0",onClick:()=>m(u),children:g},u))}),a("div",{className:"dk_detailBody",children:[$===""?null:e(G,{title:"\u5220\u9664\u7F51\u7EDC\u5931\u8D25",hint:$}),l==="overview"?j():b()]}),E?e(at,{title:"\u5220\u9664\u7F51\u7EDC",text:"\u786E\u5B9A\u5220\u9664\u7F51\u7EDC "+d+"\uFF1F\u8FD8\u6709\u5BB9\u5668\u63A5\u7740\u65F6 docker \u4F1A\u62D2\u7EDD\uFF1B\u5220\u9664\u540E\u4F9D\u8D56\u5B83\u7684\u5BB9\u5668\u4F1A\u5931\u53BB\u7F51\u7EDC\uFF0C\u9700\u8981\u91CD\u65B0\u521B\u5EFA\u6216\u63A5\u5165\u522B\u7684\u7F51\u7EDC\u3002",confirmLabel:"\u5220\u9664",busy:T,onCancel:()=>P(!1),onConfirm:C},"confirm"):null]})}function ia(t){let d=t.item.name,[l,m]=k(null),[o,p]=k(""),[v,s]=k(!1),[N,S]=k(!1),[E,P]=k(!1),[T,Y]=k(""),$=ke(()=>{s(!0),p(""),U.volumeInspect(t.target,d).then(C=>m(C.volume)).catch(C=>p(C.message)).finally(()=>s(!1))},[t.target,d]);O(()=>{$()},[$]);let f=()=>{P(!0),Y(""),U.volumeRemove(t.target,d).then(C=>t.onRemoved(C.result.message)).catch(C=>{S(!1),Y(C.message)}).finally(()=>P(!1))},B=()=>{if(o!=="")return e(G,{title:"\u8BFB\u53D6\u5377\u8BE6\u60C5\u5931\u8D25",hint:o,action:e("button",{type:"button",className:"dk_btn",onClick:$,children:"\u91CD\u8BD5"})});if(l===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let C=l.detail,j=[["\u540D\u79F0",C.name],["\u9A71\u52A8",C.driver===""?"\u2014":C.driver],["\u8303\u56F4",C.scope===""?"\u2014":C.scope],["\u6302\u8F7D\u70B9",C.mountpoint===""?"\u2014":C.mountpoint],["\u521B\u5EFA",C.created===""?"\u2014":ft(C.created)],["\u9009\u9879",Object.keys(C.options).length===0?"\u2014":Object.entries(C.options).map(([b,V])=>b+"="+V).join(`
`)],["\u6807\u7B7E",Object.keys(C.labels).length===0?"\u2014":Object.entries(C.labels).map(([b,V])=>b+"="+V).join(`
`)]];return e(sn,{rows:j,mono:["\u6302\u8F7D\u70B9","\u9009\u9879","\u6807\u7B7E"]})};return a("div",{className:"dk_detail",children:[a("div",{className:"dk_header dk_headerDetail",children:[e(J,{icon:We,title:"\u8FD4\u56DE\u5377\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:or}}),e("span",{className:"dk_detailTitle",title:d,children:d}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e(J,{icon:Ke,title:"\u5237\u65B0\u5377\u8BE6\u60C5",spin:v,onClick:$},"refresh"),e(J,{icon:Dt,danger:!0,disabled:t.allowMutations!==!0,title:t.allowMutations===!0?"\u5220\u9664\u5377\uFF08\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u6CA1\uFF0C\u4E0D\u53EF\u6062\u590D\uFF09":"\u5220\u9664\u5377\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>S(!0)},"remove"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:we}})},"close")]}),a("div",{className:"dk_detailBody",children:[T===""?null:e(G,{title:"\u5220\u9664\u5377\u5931\u8D25",hint:T}),B()]}),N?e(at,{title:"\u5220\u9664\u5377",text:"\u786E\u5B9A\u5220\u9664\u5377 "+d+"\uFF1F\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u5220\u9664\u4E14\u4E0D\u53EF\u6062\u590D\uFF1B\u8FD8\u6709\u5BB9\u5668\u5360\u7528\u65F6 docker \u4F1A\u62D2\u7EDD\u3002",confirmLabel:"\u5220\u9664",busy:E,onCancel:()=>S(!1),onConfirm:f},"confirm"):null]})}let da=2e3;function sa(t,r,d){let l=d+r,m=l.split(/\r\n|\r|\n/),o="";/[\r\n]$/.test(l)||(o=m.pop()??"");let p=t.slice();for(let v of m){let s=v.trim();if(s==="")continue;let N=/^([0-9a-f]{6,}|[A-Za-z][A-Za-z0-9 _-]*?):\s/.exec(s),S=N===null?null:N[1];S!==null&&p.length>0&&p[p.length-1].key===S?p[p.length-1]={key:S,text:s}:p.push({key:S,text:s}),p.length>da&&p.shift()}return{lines:p,pending:o}}function ca(t){let[r,d]=k(""),[l,m]=k(!1),[o,p]=k([]),[v,s]=k(""),[N,S]=k(""),[E,P]=k(null),T=K(""),Y=K([]),$=K(""),f=K(null);O(()=>{if(!l)return;if(typeof EventSource!="function"){S("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u663E\u793A\u62C9\u53D6\u8FDB\u5EA6"),m(!1);return}s("connecting");let b=new EventSource(Ot("/images/pull/stream",{target:t.target,ref:T.current})),V=!1,u=()=>{if(!V){V=!0;try{b.close()}catch{}}},g=ee=>{let R=null;try{R=JSON.parse(ee.data)}catch{return}if(R===null||typeof R!="object")return;let F=typeof R.d=="string"?R.d:typeof R.e=="string"?R.e:"";if(F==="")return;let se=sa(Y.current,F,$.current);Y.current=se.lines,$.current=se.pending,p(se.lines)},w=ee=>{let R=null;try{R=JSON.parse(ee.data)}catch{}let F=R!==null&&typeof R.code=="number"?R.code:null;P(F),m(!1),s(F===0?"\u62C9\u53D6\u5B8C\u6210":"\u62C9\u53D6\u7ED3\u675F\uFF08\u9000\u51FA\u7801 "+String(F===null?"?":F)+"\uFF09"),F===0&&t.onDone?.()},A=ee=>{if(typeof ee.data=="string"&&ee.data!==""){let R="\u62C9\u53D6\u5931\u8D25";try{let F=JSON.parse(ee.data);F!==null&&typeof F.message=="string"&&(R=F.message)}catch{}S(R),m(!1),s("");return}s(b.readyState===2?"closed":"reconnecting")};return b.addEventListener("line",g),b.addEventListener("end",w),b.addEventListener("error",A),b.onopen=()=>s("open"),()=>{u(),$.current=""}},[l,t.target]),O(()=>{let b=f.current;b!==null&&(b.scrollTop=b.scrollHeight)},[o]);let B=()=>{let b=r.trim();b===""||l||(T.current=b,Y.current=[],$.current="",p([]),S(""),P(null),s(""),m(!0))},C=()=>{m(!1),s("\u5DF2\u505C\u6B62")},j=()=>v==="open"?"\u6B63\u5728\u62C9\u53D6\uFF08docker pull\uFF09\u2026":v==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u62C9\u53D6\u6D41\u2026":v==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":v==="closed"?"\u62C9\u53D6\u6D41\u5DF2\u65AD\u5F00":v;return a("div",{className:"dk_detail",children:[a("div",{className:"dk_header dk_headerDetail",children:[e(J,{icon:We,title:"\u8FD4\u56DE\u955C\u50CF\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",children:"\u62C9\u53D6\u955C\u50CF"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:we}})},"close")]}),a("div",{className:"dk_detailBody dk_pullBody",children:[t.allowMutations!==!0?e(G,{kind:"info",title:"\u62C9\u53D6\u955C\u50CF\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",hint:"docker pull \u4F1A\u5199\u5165\u76EE\u6807\u673A\u7684\u955C\u50CF\u5B58\u50A8\u5E76\u5360\u7528\u78C1\u76D8\u4E0E\u5E26\u5BBD\u3002\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u540E\u5373\u53EF\u5728\u6B64\u62C9\u53D6\u3002"}):a("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u955C\u50CF\u5F15\u7528\uFF0C\u5982 nginx:1.27 \u6216 ghcr.io/org/app:latest",value:r,disabled:l,onChange:b=>d(b.target.value),onKeyDown:b=>{b.key==="Enter"&&B()}}),l?e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:C,children:"\u505C\u6B62"}):e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:t.allowMutations!==!0,onClick:B,children:"\u62C9\u53D6"})]}),N===""?null:e(G,{title:"\u62C9\u53D6\u5931\u8D25",hint:N}),v===""?null:e("div",{className:"dk_hint",children:j()+(E===null?"":" \xB7 \u9000\u51FA\u7801 "+String(E))}),a("div",{className:"dk_pullBox",ref:f,children:[o.length===0?e("div",{className:"dk_pullLine",children:l?"\u7B49\u5F85 docker pull \u8F93\u51FA\u2026":"\u586B\u5199\u955C\u50CF\u5F15\u7528\u540E\u70B9\u300C\u62C9\u53D6\u300D\uFF0C\u9010\u5C42\u8FDB\u5EA6\u4F1A\u5B9E\u65F6\u51FA\u73B0\u5728\u8FD9\u91CC\u3002"}):o.map((b,V)=>e("div",{className:"dk_pullLine","data-key":b.key??void 0,children:b.text},String(V)))]})]})]})}function Ft(t){let r=new Map;for(let d of t){let l=d.composeProject===null?"":d.composeProject,m=r.get(l);m===void 0&&(m={project:l,items:[]},r.set(l,m)),m.items.push(d)}return[...r.values()]}let pn=t=>t==="running"||t==="paused"||t==="restarting";function ua(t){return e("div",{className:"dk_projects",children:t.groups.map(r=>{let d=r.items.filter(p=>pn(p.state)).length,l=r.items.filter(p=>p.health==="unhealthy").length,m=[...new Set(r.items.map(p=>p.composeService===null?p.name:p.composeService))],o=r.project===""?"\uFF08\u975E compose \u5BB9\u5668\uFF09":r.project;return a("div",{className:"dk_project",role:"button",tabIndex:0,onClick:()=>t.onOpen(r.project),onKeyDown:p=>{(p.key==="Enter"||p.key===" ")&&(p.preventDefault(),t.onOpen(r.project))},children:[a("div",{className:"dk_projectHead",children:[e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:In}}),e("span",{className:"dk_projectName",title:o,children:o}),e("span",{className:"dk_badge","data-state":d===r.items.length?"running":d===0?"exited":"paused",children:String(d)+" / "+String(r.items.length)+" \u8FD0\u884C\u4E2D"}),l>0?e("span",{className:"dk_badge","data-state":"unhealthy",children:String(l)+" \u4E0D\u5065\u5EB7"}):null,e("span",{className:"dk_headerSpacer"}),e("span",{className:"dk_hint",children:String(m.length)+" \u4E2A\u670D\u52A1"})]}),e("div",{className:"dk_projectRows",children:r.items.map(p=>a("div",{className:"dk_projectRow",children:[e("span",{className:"dk_projectSvc",children:p.composeService===null?"\u2014":p.composeService}),e("span",{className:"dk_projectContainer",title:p.name,children:p.name}),e(nt,{state:p.state,health:p.health,status:p.status}),e("span",{className:"dk_projectImage",title:p.image,children:p.image}),e("span",{className:"dk_projectPorts",children:Mt(p.ports)})]},p.id))})]},r.project===""?"__ungrouped":r.project)})})}function ka(t){let[r,d]=k("services"),l=t.items,m=t.project===""?"\uFF08\u975E compose \u5BB9\u5668\uFF09":t.project,o=l.filter(s=>pn(s.state)).length,p=()=>e("div",{className:"dk_tableWrap",children:a("table",{className:"dk_images dk_composeTable",children:[e("thead",{children:a("tr",{children:[e("th",{children:"\u670D\u52A1"}),e("th",{children:"\u5BB9\u5668"}),e("th",{children:"\u72B6\u6001"}),e("th",{children:"\u7AEF\u53E3"}),e("th",{children:"\u955C\u50CF"})]})}),e("tbody",{children:l.map(s=>a("tr",{children:[e("td",{children:s.composeService===null?"\u2014":s.composeService}),e("td",{className:"dk_mono",title:s.name,children:s.name}),e("td",{children:e(nt,{state:s.state,health:s.health,status:s.status})}),e("td",{children:Mt(s.ports)}),e("td",{className:"dk_mono",title:s.image,children:s.image})]},s.id))})]})}),v=[["services","\u670D\u52A1"],["logs","\u805A\u5408\u65E5\u5FD7"]];return a("div",{className:"dk_detail",children:[a("div",{className:"dk_header dk_headerDetail",children:[e(J,{icon:We,title:"\u8FD4\u56DE Compose \u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:In}}),e("span",{className:"dk_detailTitle",title:m,children:m}),e("span",{className:"dk_badge","data-state":o===l.length?"running":o===0?"exited":"paused",children:String(o)+" / "+String(l.length)+" \u8FD0\u884C\u4E2D"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:we}})},"close")]}),e("div",{className:"dk_tabs",children:v.map(([s,N])=>e("button",{type:"button",className:"dk_tab","data-on":r===s?"1":"0",onClick:()=>d(s),children:N},s))}),e("div",{className:"dk_detailBody",children:r==="services"?p():e(mn,{target:t.target,items:l})})]})}function mn(t){let r=t.items,[d,l]=k([]),[m,o]=k("connecting"),[p,v]=k(""),[s,N]=k(!0),[S,E]=k(!1),P=K([]),T=K(new Map),Y=K(null),$=r.map(b=>b.id).join(",");O(()=>{if(r.length===0){o("empty");return}if(typeof EventSource!="function"){o("unsupported");return}o("connecting"),P.current=[],T.current=new Map,l([]),E(!1);let b=0,V=0,u=r.map(g=>{let w=g.composeService===null?g.name:g.composeService,A=new EventSource(Ot("/logs/stream",{target:t.target,id:g.id,tail:100})),ee=R=>{let se=((T.current.get(g.id)??"")+R).split(`
`);if(T.current.set(g.id,se.pop()??""),se.length===0)return;let Z=P.current.concat(se.map(Ne=>({service:w,text:Ne}))),Oe=Z.length>Ue?Z.slice(Z.length-Ue):Z;P.current=Oe,Oe.length!==Z.length&&E(!0),l(Oe)};return A.addEventListener("line",R=>{let F=null;try{F=JSON.parse(R.data)}catch{return}F===null||typeof F!="object"||(typeof F.d=="string"?ee(F.d):typeof F.e=="string"&&ee(F.e))}),A.addEventListener("end",()=>{try{A.close()}catch{}V+=1,V>=r.length&&o("closed")}),A.addEventListener("error",R=>{typeof R.data=="string"&&R.data!==""?o("partial"):o("reconnecting")}),A.onopen=()=>{b+=1,o("open")},()=>{try{A.close()}catch{}}});return()=>{for(let g of u)g()}},[t.target,$]),O(()=>{if(!s)return;let b=Y.current;b!==null&&(b.scrollTop=b.scrollHeight)},[s,d]);let f=p.trim().toLowerCase(),B=f===""?d:d.filter(b=>b.text.toLowerCase().indexOf(f)>=0||b.service.toLowerCase().indexOf(f)>=0),C=B.length>ot?B.slice(-ot):B,j=()=>m==="open"?"\u5DF2\u8FDE\u63A5 "+String(r.length)+" \u6761\u5BB9\u5668\u65E5\u5FD7\u6D41\uFF08docker logs -f\uFF09":m==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u5BB9\u5668\u65E5\u5FD7\u6D41\u2026":m==="reconnecting"?"\u90E8\u5206\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":m==="partial"?"\u90E8\u5206\u5BB9\u5668\u65E5\u5FD7\u6D41\u51FA\u9519":m==="closed"?"\u5168\u90E8\u5BB9\u5668\u65E5\u5FD7\u6D41\u5DF2\u7ED3\u675F":m==="unsupported"?"\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource":m==="empty"?"\u8BE5\u9879\u76EE\u6CA1\u6709\u53EF\u805A\u5408\u7684\u5BB9\u5668":"\u805A\u5408\u65E5\u5FD7";return a("div",{className:"dk_logs",children:[S?e(G,{kind:"warn",title:"\u805A\u5408\u65E5\u5FD7\u8D85\u8FC7 "+String(Ue)+" \u884C\uFF0C\u5DF2\u4E22\u5F03\u6700\u65E9\u5185\u5BB9"}):null,a("div",{className:"dk_filterBar",children:[a("div",{className:"dk_filterWrap",children:[e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u670D\u52A1\u540D / \u65E5\u5FD7\u5185\u5BB9\u2026",value:p,onChange:b=>v(b.target.value),onKeyDown:b=>{b.key==="Escape"&&p!==""&&(b.stopPropagation(),v(""))}}),p===""?null:e("button",{type:"button",className:"dk_filterClear",title:"\u6E05\u7A7A\u8FC7\u6EE4",onClick:()=>v(""),children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:we}})},"clear")]}),e("button",{type:"button",className:"dk_pill dk_pillFollow","data-on":s?"1":"0",title:s?"\u6682\u505C\u81EA\u52A8\u6EDA\u52A8\uFF08\u65E5\u5FD7\u7EE7\u7EED\u63A5\u6536\uFF09":"\u6062\u590D\u81EA\u52A8\u6EDA\u52A8",onClick:()=>N(b=>!b),children:s?"\u81EA\u52A8\u6EDA\u52A8":"\u5DF2\u6682\u505C"}),e("span",{className:"dk_filterCount",children:f===""?String(d.length)+" \u884C":String(B.length)+" / "+String(d.length)+" \u884C\u5339\u914D"})]}),e("div",{className:"dk_followState","data-state":m==="open"?"open":m==="closed"?"closed":"connecting",children:j()}),e("div",{className:"dk_logBody",ref:Y,children:[C.length===0?e("div",{className:"dk_logLine",children:m==="open"?"\u7B49\u5F85\u65E5\u5FD7\u2026":j()},"empty"):C.map((b,V)=>aa(b,V,f))]})]})}function ga(t,r){let d=typeof t.image=="string"?t.image:"",l=typeof t.composeProject=="string"?t.composeProject:"";return a("span",{className:"dk_activityItem","data-action":String(t.action??"").split(":")[0].trim(),title:l===""?d:d+" \xB7 "+l,children:[e("span",{className:"dk_activityTime",children:Fn(t.time)}),e("span",{className:"dk_activityName",children:t.name}),e("span",{className:"dk_activityAction",children:Vn(t)})]},String(r)+String(t.name)+String(t.time))}function ha(t){let r=t.open===!0,d=Array.isArray(t.events)?t.events:[],l=d.slice(0,An);return a("div",{className:"dk_activity","data-open":r?"1":"0",children:[e("button",{type:"button",className:"dk_activityHead","aria-expanded":r,title:"\u5BB9\u5668\u4E8B\u4EF6\u6D3B\u52A8\uFF08docker events\uFF09\uFF1A\u70B9\u51FB\u6298\u53E0 / \u5C55\u5F00",onClick:t.onToggle,children:[e("span",{className:"dk_activityTitle",children:"\u6D3B\u52A8"}),e("span",{className:"dk_activityState","data-state":t.status??"",children:t.statusText??""}),e("span",{className:"dk_headerSpacer"}),e("span",{className:"dk_hint",children:d.length===0?"\u6682\u65E0\u4E8B\u4EF6":"\u6700\u8FD1 "+String(l.length)+" / "+String(d.length)+" \u6761"}),e("span",{className:"dk_activityChevron",dangerouslySetInnerHTML:{__html:Qt}})]}),r===!1?null:l.length===0?e("div",{className:"dk_activityEmpty",children:"\u6682\u65E0\u4E8B\u4EF6\uFF08\u5BB9\u5668\u7684 start / die / health \u7B49\u52A8\u4F5C\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF09"}):e("div",{className:"dk_activityList",children:l.map(ga)})]})}function pa(t){let r=t.info;return a("div",{className:"dk_pickBar",children:[e("span",{className:"dk_pickCount",children:"\u5DF2\u9009 "+String(t.count)+" \u4E2A\u5BB9\u5668"}),r.hint===""?null:e("span",{className:"dk_hint dk_pickHint",children:r.hint}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:r.canRun!==!0,title:r.hint!==""?r.hint:r.canRun===!0?"\u628A\u6240\u9009\u5BB9\u5668\u7684\u65E5\u5FD7\u805A\u5408\u6210\u4E00\u6761\u6D41":"\u81F3\u5C11\u9009\u62E9 2 \u4E2A\u5BB9\u5668",onClick:t.onRun,children:"\u805A\u5408\u65E5\u5FD7"}),e("button",{type:"button",className:"dk_btn",onClick:t.onCancel,children:"\u53D6\u6D88"})]})}function ma(t){return a("div",{className:"dk_detail",children:[a("div",{className:"dk_header dk_headerDetail",children:[e(J,{icon:We,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868\uFF08\u9000\u51FA\u9009\u62E9\u6001\uFF09",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:En}}),e("span",{className:"dk_detailTitle",children:"\u805A\u5408\u65E5\u5FD7 \xB7 "+String(t.items.length)+" \u4E2A\u5BB9\u5668"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:we}})},"close")]}),e("div",{className:"dk_detailBody",children:e(mn,{target:t.target,items:t.items})})]})}function fa(t){let r=t.collapsed===!0;return a("div",{className:"dk_drawer","data-collapsed":r?"1":void 0,style:r||t.height===null?void 0:{height:String(t.height)+"px"},children:[e("div",{className:"dk_drawerResize",title:"\u62D6\u52A8\u8C03\u6574\u7EC8\u7AEF\u9AD8\u5EA6\uFF08\u53CC\u51FB\u6298\u53E0 / \u5C55\u5F00\uFF09",onMouseDown:t.onResizeStart,onDoubleClick:t.onToggleCollapse},"resize"),a("div",{className:"dk_drawerHead",children:[e("span",{className:"dk_drawerIcon",dangerouslySetInnerHTML:{__html:Tn}}),e("span",{className:"dk_drawerTitle",title:t.label,children:t.label}),e("span",{className:"dk_drawerHint",children:r?"\u5DF2\u6298\u53E0 \xB7 \u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C":"\u7531\u7EC8\u7AEF\u9762\u677F\u627F\u8F7D \xB7 \u6298\u53E0\u4FDD\u7559\u4F1A\u8BDD"}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_iconBtn dk_drawerFold",title:r?"\u5C55\u5F00\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u672A\u4E2D\u65AD\uFF09":"\u6298\u53E0\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C\uFF09",onClick:t.onToggleCollapse,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Qt}})},"fold"),e("button",{type:"button",className:"dk_iconBtn",title:"\u7ED3\u675F\u7EC8\u7AEF\u4F1A\u8BDD\u5E76\u6536\u8D77\u62BD\u5C49",onClick:t.onClose,children:e("span",{dangerouslySetInnerHTML:{__html:we}})},"close")]}),e("div",{className:"dk_drawerBody",ref:t.hostRef})]})}function fn(t){let[r,d]=k(null),[l,m]=k([]),[o,p]=k(t.initialTarget??""),v=t.sessionHint!==void 0&&(t.initialTarget??"")==="",[s,N]=k("containers"),[S,E]=k([]),[P,T]=k([]),[Y,$]=k([]),[f,B]=k([]),[C,j]=k([]),[b,V]=k(null),[u,g]=k(null),[w,A]=k(null),[ee,R]=k(null),[F,se]=k(!1),[Z,Oe]=k(!1),[Ne,Ye]=k([]),[vt,He]=k(!1),[ze,ce]=k(!1),[$e,te]=k(""),[le,re]=k(""),[Se,Be]=k(!0),[me,Re]=k(""),[Ce,Xe]=k("all"),[Ze,Fe]=k(!1),[Ve,dt]=k([]),[ge,Le]=k(""),[Gt,Te]=k(!0),Qe=K(null),st=K(""),[Me,be]=k(null),[bt,he]=k(0),[pe,Ee]=k(null),[_t,yt]=k(!1),[xt,Ge]=k({}),[ct,Jt]=k(""),[et,tt]=k(""),[wt,Kt]=k(""),ae=K(!0),q=K(null);q.current===null&&(q.current=Dn());let[Ie,ut]=k(null),_=K(null),[L,y]=k(!1),[H,ie]=k(null),[De,de]=k(!1),z=K(null),M=K(!1);O(()=>()=>{ae.current=!1},[]),O(()=>{if(Ie===null)return;let n=_.current;if(n===null)return;let c=null;try{c=Pe.mount(n,Ie.options)}catch(x){re("\u7EC8\u7AEF\u542F\u52A8\u5931\u8D25\uFF1A"+(x instanceof Error?x.message:String(x))),ut(null);return}return()=>{try{c?.()}catch{}}},[Ie]);let D=n=>{if(n.button!==void 0&&n.button!==0)return;let c=n.currentTarget.parentElement,x=z.current;if(c===null||x===null)return;n.preventDefault();let Q=n.clientY,oe=c.getBoundingClientRect().height,ne=Math.max(160,Math.round(x.getBoundingClientRect().height*.75)),Tt=ue=>{let xe=Math.round(oe+(Q-ue.clientY));ie(Math.min(ne,Math.max(160,xe)))},Et=()=>{document.removeEventListener("mousemove",Tt),document.removeEventListener("mouseup",Et),document.body.style.userSelect=""};document.body.style.userSelect="none",document.addEventListener("mousemove",Tt),document.addEventListener("mouseup",Et)},W=()=>{if(Ie===null){t.onClose();return}de(!0)};O(()=>{U.config().then(n=>{let c=n.config;d(c),!v&&Array.isArray(c.targets)&&c.targets.length>0&&p(x=>x===""?c.targets[0].name:x),Zt(c)}).catch(n=>te(n.message)),U.targets().then(n=>{m(n.targets??[]),dn=n.targets??[];let c=(n.targets??[])[0];c!==void 0&&!v&&p(x=>x===""?c.name:x)}).catch(()=>{})},[]);let fe=ke(()=>{if(o==="")return Promise.resolve();let n=q.current.next();return ce(!0),U.containers(o,Se).then(c=>{!ae.current||!q.current.isCurrent(n)||(E(c.containers??[]),te(""))}).catch(c=>{ae.current&&q.current.isCurrent(n)&&te(c.message)}).finally(()=>{ae.current&&q.current.isCurrent(n)&&ce(!1)})},[o,Se]),kt=ke(()=>{if(o==="")return Promise.resolve();let n=q.current.next();return ce(!0),U.images(o).then(c=>{!ae.current||!q.current.isCurrent(n)||($(c.images??[]),te(""))}).catch(c=>{ae.current&&q.current.isCurrent(n)&&te(c.message)}).finally(()=>{ae.current&&q.current.isCurrent(n)&&ce(!1)})},[o]),Nt=ke(()=>{if(o==="")return Promise.resolve();let n=q.current.next();return ce(!0),U.networks(o).then(c=>{!ae.current||!q.current.isCurrent(n)||(B(c.networks??[]),te(""))}).catch(c=>{ae.current&&q.current.isCurrent(n)&&te(c.message)}).finally(()=>{ae.current&&q.current.isCurrent(n)&&ce(!1)})},[o]),St=ke(()=>{if(o==="")return Promise.resolve();let n=q.current.next();return ce(!0),U.volumes(o).then(c=>{!ae.current||!q.current.isCurrent(n)||(j(c.volumes??[]),te(""))}).catch(c=>{ae.current&&q.current.isCurrent(n)&&te(c.message)}).finally(()=>{ae.current&&q.current.isCurrent(n)&&ce(!1)})},[o]),Wt=ke(()=>{if(l.length===0)return T([]),Promise.resolve();let n=q.current.next();ce(!0),T(l.map(Q=>({name:Q.name,kind:Q.kind,label:Q.label,containers:[],error:"",loaded:!1})));let c=l.length,x=()=>{c-=1,c===0&&ae.current&&q.current.isCurrent(n)&&ce(!1)};return Promise.all(l.map(Q=>U.containers(Q.name,!0).then(oe=>{!ae.current||!q.current.isCurrent(n)||T(ne=>tn(ne,Q.name,{containers:oe.containers??[],error:"",loaded:!0}))}).catch(oe=>{!ae.current||!q.current.isCurrent(n)||T(ne=>tn(ne,Q.name,{error:oe instanceof Error?oe.message:String(oe),loaded:!0}))}).finally(x)))},[l]);O(()=>{Qe.current=fe},[fe]);let Sa=ke(()=>he(n=>n+1),[]),_e=ke(()=>{Oe(!1),Ye([]),He(!1)},[]),Ca=()=>{if(Z){_e();return}Ye([]),He(!1),Oe(!0)},La=n=>Ye(c=>Mn(c,n.id));O(()=>{if(!Z)return;let n=c=>{c.key==="Escape"&&_e()};return document.addEventListener("keydown",n),()=>document.removeEventListener("keydown",n)},[Z,_e]),O(()=>{Z&&Ye(n=>Bn(n,S))},[S,Z]);let Ta=n=>{p(n),te(""),N("containers"),be(null),_e(),Ge({}),t.onTargetChange?.(ye(n))},Ea=(n,c)=>{p(n),te(""),N("containers"),_e(),Ge({}),be({id:c.id,tab:"overview",item:c}),t.onTargetChange?.(ye(n))},gt=ke(()=>{s==="overview"?Wt():s==="images"?kt():s==="networks"?Nt():s==="volumes"?St():fe(),he(n=>n+1)},[s,Wt,fe,kt,Nt,St]);O(()=>{s!=="overview"&&o!==""&&gt()},[o,Se,s]);let Ia=l.map(n=>n.name).join("\0");O(()=>{s==="overview"&&Wt()},[s,Ia]),O(()=>{if(!Ze||s!=="overview"&&(o===""||s==="images"))return;let n=setInterval(gt,Math.max(2,r?.pollIntervalSec??5)*1e3);return()=>clearInterval(n)},[Ze,gt,o,r,s]);let Oa=()=>ge==="open"?"\u5B9E\u65F6\u63A5\u6536\u4E2D\uFF08docker events\uFF09":ge==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u4E8B\u4EF6\u6D41\u2026":ge==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":ge==="closed"?"\u4E8B\u4EF6\u6D41\u5DF2\u65AD\u5F00":ge==="unsupported"?"\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource":"\u4E8B\u4EF6\u6D41";O(()=>{if(s!=="containers"||o==="")return;if(typeof EventSource!="function"){Le("unsupported");return}st.current!==o&&(st.current=o,dt([])),Le("connecting");let n=Gn(Hn,()=>{let ue=Qe.current;ue!==null&&ue()}),c=!1,x=new EventSource(Ot("/events/stream",{target:o})),Q=!1,oe=()=>{if(!Q){Q=!0;try{x.close()}catch{}}},ne=ue=>{let xe=null;try{xe=JSON.parse(ue.data)}catch{return}xe===null||typeof xe!="object"||(dt(It=>zn(It,xe,jn)),n.schedule())},Tt=ue=>{let xe=null;try{xe=JSON.parse(ue.data)}catch{}let It=xe!==null&&typeof xe.code=="number"?xe.code:null;Le("closed"),re("\u4E8B\u4EF6\u6D41\u5DF2\u7ED3\u675F"+(It===null?"":"\uFF08\u9000\u51FA\u7801 "+String(It)+"\uFF09")+"\uFF0C\u5217\u8868\u56DE\u5230 AUTO REFRESH / \u624B\u52A8\u5237\u65B0"),oe()},Et=ue=>{if(typeof ue.data=="string"&&ue.data!==""){Le("closed"),oe();return}Le(x.readyState===2?"closed":"reconnecting")};return x.addEventListener("event",ne),x.addEventListener("end",Tt),x.addEventListener("error",Et),x.onopen=()=>{if(Le("open"),c){let ue=Qe.current;ue!==null&&ue()}c=!0},()=>{oe(),n.cancel()}},[s,o]),O(()=>{if(le==="")return;let n=setTimeout(()=>re(""),4e3);return()=>clearTimeout(n)},[le]);let Ct=(n,c)=>{let x=Cn(n.name);navigator.clipboard.writeText(x).then(()=>{re("\u5DF2\u590D\u5236\uFF1A"+x+(c===void 0?"":"\uFF08"+c+"\uFF09"))}).catch(()=>re("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u6267\u884C\uFF1A"+x))},Ma=n=>{let c=Cn(n.name);if(Pe===null){let ne=document.querySelector("[data-dsh-tty-entry]")!==null;Ct(n,ne?"\u7EC8\u7AEF\u9762\u677F\u7248\u672C\u8FC7\u65E7\uFF08\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u9700\u8981 dsh-tty \u2265 0.14.0\uFF09\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C":"\u672A\u5B89\u88C5 dsh-tty \u7EC8\u7AEF\u9762\u677F\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C\uFF08\u88C5 dsh-tty \u540E\u53EF\u76F4\u63A5\u5728\u6B64\u5F00\u7EC8\u7AEF\uFF09");return}let x=(r?.targets??[]).find(ne=>ne.name===o),Q=n.name+" \xB7 exec",oe=x===void 0||x.kind==="local"?{command:c,label:Q}:typeof x.book=="string"&&x.book!==""?{book:x.book,command:c,label:Q}:(x.auth??"agent")==="agent"?{spec:{host:x.host,port:x.port,username:x.username,auth:"agent",agentForward:x.agentForward===!0},command:c,label:Q}:null;if(oe===null){Ct(n,"\u5185\u8054\u76EE\u6807\u7528\u4E86 key/password \u8BA4\u8BC1\uFF0C\u6D4F\u89C8\u5668\u7AEF\u62FF\u4E0D\u5230\u51ED\u8BC1");return}if(t.docked===!0){try{Pe.open(oe)}catch(ne){Ct(n,ne instanceof Error?ne.message:String(ne))}return}if(typeof Pe.mount=="function"&&Number(Pe.version??0)>=2){ut({label:Q,options:oe}),y(!1);return}try{Pe.open(oe),t.onClose()}catch(ne){Ct(n,ne instanceof Error?ne.message:String(ne))}},_n=n=>Ge(c=>{if(c[n]===void 0)return c;let x={...c};return delete x[n],x}),ht=(n,c)=>{yt(!0);let x=()=>{yt(!1),Ee(null)};Promise.resolve().then(n).then(async()=>{if(x(),c!==void 0)try{await c()}catch(Q){te(Q.message)}},Q=>{x(),te(Q.message)})},Ba=(n,c)=>{xt[c.id]===void 0&&Ee({title:n==="remove"?"\u5220\u9664\u5BB9\u5668":n==="stop"?"\u505C\u6B62\u5BB9\u5668":n==="start"?"\u542F\u52A8\u5BB9\u5668":"\u91CD\u542F\u5BB9\u5668",text:n==="remove"?`\u786E\u5B9A\u5220\u9664\u5BB9\u5668 ${c.name}\uFF1F\u5BB9\u5668\u7684\u53EF\u5199\u5C42\u4E0E\u914D\u7F6E\u4F1A\u88AB\u5220\u9664\uFF08\u547D\u540D\u6570\u636E\u5377\u4FDD\u7559\uFF09\uFF0C\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002`:`\u786E\u5B9A\u5BF9\u5BB9\u5668 ${c.name} \u6267\u884C${n==="stop"?"\u505C\u6B62":n==="start"?"\u542F\u52A8":"\u91CD\u542F"}\u64CD\u4F5C\uFF1F`,confirmLabel:n==="remove"?"\u5220\u9664":"\u786E\u5B9A",run:()=>ht(async()=>{Ge(x=>({...x,[c.id]:n}));try{let x=await U.action(o,n,c.id);re(`${x.result.action} ${c.name}\uFF1A${x.result.message}`)}catch(x){throw _n(c.id),x}},async()=>{try{await fe()}finally{_n(c.id)}})})},Ra=n=>{let c=zt(n);Ee({title:"\u5220\u9664\u955C\u50CF",text:"\u786E\u5B9A\u5220\u9664\u955C\u50CF "+c+"\uFF1F\u955C\u50CF\u88AB\u5BB9\u5668\u6216\u5B50\u955C\u50CF\u5F15\u7528\u65F6\u4F1A\u5931\u8D25\uFF1B\u5220\u9664\u540E\u9700\u8981\u91CD\u65B0\u62C9\u53D6\u6216\u6784\u5EFA\u624D\u80FD\u6062\u590D\uFF0C\u4E14\u4E0D\u53EF\u64A4\u9500\u3002",confirmLabel:"\u5220\u9664",run:()=>ht(async()=>{let x=await U.imageRemove(o,c);re("\u5DF2\u5220\u9664 "+c+"\uFF1A"+x.result.message),b!==null&&zt(b)===c&&V(null),await kt()})})},Da=()=>{Ee({title:"\u6E05\u7406 dangling \u955C\u50CF",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u65E0\u6807\u7B7E\uFF08<none>:<none>\uFF09\u7684\u955C\u50CF\u5C42\uFF0C\u91CA\u653E\u78C1\u76D8\u7A7A\u95F4\uFF1B\u4E0D\u4F1A\u5220\u9664\u6709 tag \u7684\u955C\u50CF\u3002",confirmLabel:"\u6E05\u7406",run:()=>ht(async()=>{let n=await U.imagePrune(o),c=String(n.result.message).trim().split(`
`).filter(x=>x!=="");re("\u5DF2\u6E05\u7406 dangling \u955C\u50CF\uFF1A"+(c.length===0?"ok":c[c.length-1])),await kt()})})},Pa=()=>{Ee({title:"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u7F51\u7EDC",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u6CA1\u6709\u5BB9\u5668\u63A5\u5165\u7684\u7F51\u7EDC\u3002compose \u521B\u5EFA\u7684\u9879\u76EE\u7F51\u7EDC\u4E5F\u5728\u5176\u4E2D\uFF08\u4E0B\u6B21 up \u4F1A\u91CD\u5EFA\uFF09\uFF0C\u4F46\u6B63\u5728\u8DD1\u7684\u9879\u76EE\u4F1A\u77ED\u6682\u5931\u53BB\u7F51\u7EDC\u3002",confirmLabel:"\u6E05\u7406",run:()=>ht(async()=>{let n=await U.networkPrune(o),c=String(n.result.message).trim().split(`
`).filter(x=>x!=="");re("\u5DF2\u6E05\u7406\u672A\u4F7F\u7528\u7F51\u7EDC\uFF1A"+(c.length===0?"ok":c[c.length-1])),await Nt()})})},ja=()=>{Ee({title:"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u5377",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u6CA1\u6709\u88AB\u5BB9\u5668\u4F7F\u7528\u7684\u5377\u2014\u2014\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u5220\u9664\u4E14\u4E0D\u53EF\u6062\u590D\u3002docker \u2265 23 \u53EA\u5220\u533F\u540D\u5377\uFF08\u4E0D\u5E26 --all\uFF09\uFF0C\u66F4\u8001\u7684\u7248\u672C\u4F1A\u8FDE\u547D\u540D\u5377\u4E00\u8D77\u5220\uFF1B\u6267\u884C\u524D\u8BF7\u786E\u8BA4\u6CA1\u6709\u9700\u8981\u4FDD\u7559\u7684\u6570\u636E\u5377\u3002",confirmLabel:"\u6E05\u7406",run:()=>ht(async()=>{let n=await U.volumePrune(o),c=String(n.result.message).trim().split(`
`).filter(x=>x!=="");re("\u5DF2\u6E05\u7406\u672A\u4F7F\u7528\u5377\uFF1A"+(c.length===0?"ok":c[c.length-1])),await St()})})},yn=(n,c)=>x=>{n(),re(x),c()},Lt=Me===null?null:S.find(n=>n.id===Me.id)??Me.item,pt=S.filter(n=>{if(Ce==="running"&&!(n.state==="running"||n.state==="paused"||n.state==="restarting")||Ce==="stopped"&&n.state==="running"||Ce==="unhealthy"&&n.health!=="unhealthy")return!1;let c=me.trim().toLowerCase();return c===""?!0:n.name.toLowerCase().includes(c)||n.image.toLowerCase().includes(c)||n.id.toLowerCase().includes(c)}),Ut=Y.filter(n=>{let c=ct.trim().toLowerCase();return c===""||n.reference.toLowerCase().includes(c)||n.id.toLowerCase().includes(c)}),qt=f.filter(n=>{let c=et.trim().toLowerCase();return c===""||n.name.toLowerCase().includes(c)||n.driver.toLowerCase().includes(c)||n.id.toLowerCase().includes(c)}),Yt=C.filter(n=>{let c=wt.trim().toLowerCase();return c===""||n.name.toLowerCase().includes(c)||n.driver.toLowerCase().includes(c)||n.mountpoint.toLowerCase().includes(c)}),ye=n=>{let c=l.find(x=>x.name===n);return c===void 0||c.label===void 0?n:n+" \xB7 "+c.label},mt=()=>ze?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):o===""?v?a("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u4E0D\u662F Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u6309\u4E0A\u9762\u7684\u63D0\u793A\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761\u76EE\u6807\uFF08\u63A8\u8350\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u3002\u4E3A\u907F\u514D\u5F20\u51A0\u674E\u6234\uFF0C\u9762\u677F\u4E0D\u4F1A\u81EA\u52A8\u5207\u5230\u5176\u4ED6\u76EE\u6807\u3002"})]}):a("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD8\u6CA1\u6709\u914D\u7F6E Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u4E2A\u76EE\u6807\uFF1A\u672C\u673A\u76F4\u63A5\u9009\u300C\u672C\u673A\u300D\uFF1B\u8FDC\u7A0B\u4E3B\u673A\u53EF\u4EE5\u5F15\u7528 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\u3002"})]}):a("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:s==="images"?"\u6CA1\u6709\u955C\u50CF":s==="compose"?"\u6CA1\u6709 Compose \u9879\u76EE":s==="networks"?"\u6CA1\u6709\u7F51\u7EDC":s==="volumes"?"\u6CA1\u6709\u5377":"\u6CA1\u6709\u5BB9\u5668"}),e("div",{className:"dk_emptyHint",children:me.trim()===""?"\u76EE\u6807\u4E0A\u6CA1\u6709\u5339\u914D\u7684\u6570\u636E\uFF0C\u6216\u7B5B\u9009\u6761\u4EF6\u8FC7\u7A84\u3002":"\u6CA1\u6709\u5339\u914D\u300C"+me.trim()+"\u300D\u7684\u7ED3\u679C\u3002"})]}),Aa=()=>{if(s==="overview")return cn(Pn(P),{onOpenTarget:Ta,onOpenContainer:Ea});if(s==="images")return a("div",{className:"dk_imagesView",children:[Ut.length===0?mt():e("div",{className:"dk_tableWrap",children:a("table",{className:"dk_images",children:[e("thead",{children:a("tr",{children:[e("th",{children:"\u955C\u50CF"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"ID"}),e("th",{className:"dk_colActions",children:"\u64CD\u4F5C"})]})}),e("tbody",{children:Ut.map(n=>a("tr",{children:[e("td",{className:"dk_mono",title:n.reference,children:n.dangling?"<none>\uFF08dangling\uFF09":n.reference}),e("td",{children:n.sizeText===""?n.size===null?"\u2014":Bt(n.size):n.sizeText}),e("td",{children:n.createdSince}),e("td",{className:"dk_mono",children:n.shortId}),e("td",{className:"dk_colActions",children:a("div",{className:"dk_rowActions",children:[e(J,{icon:ar,title:"\u67E5\u770B\u955C\u50CF\u8BE6\u60C5\uFF08\u5C42 / \u6784\u5EFA\u5386\u53F2\uFF09",onClick:()=>V(n)},"inspect"),e(J,{icon:Dt,danger:!0,disabled:r?.allowMutations!==!0,title:r?.allowMutations===!0?"\u5220\u9664\u955C\u50CF\uFF08\u4E0D\u53EF\u6062\u590D\uFF09":"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>Ra(n)},"remove")]})},"actions")]},n.id+n.reference))})]})})]});if(s==="compose"){let n=Ft(pt);return n.length===0?mt():e(ua,{groups:n,onOpen:c=>R({project:c})})}return s==="networks"?a("div",{className:"dk_imagesView",children:[qt.length===0?mt():e("div",{className:"dk_tableWrap",children:a("table",{className:"dk_images",children:[e("thead",{children:a("tr",{children:[e("th",{children:"\u540D\u79F0"}),e("th",{children:"\u9A71\u52A8"}),e("th",{children:"\u8303\u56F4"}),e("th",{children:"\u5C5E\u6027"}),e("th",{children:"ID"})]})}),e("tbody",{children:qt.map(n=>a("tr",{className:"dk_rowClickable",onClick:()=>g(n),title:"\u67E5\u770B\u7F51\u7EDC\u8BE6\u60C5",children:[e("td",{className:"dk_mono",title:n.name,children:n.name}),e("td",{children:n.driver===""?"\u2014":n.driver}),e("td",{children:n.scope===""?"\u2014":n.scope}),e("td",{children:n.internal?e("span",{className:"dk_badge","data-state":"paused",children:"internal"}):"\u2014"}),e("td",{className:"dk_mono",title:n.id,children:n.shortId})]},n.id+n.name))})]})})]}):s==="volumes"?a("div",{className:"dk_imagesView",children:[Yt.length===0?mt():e("div",{className:"dk_tableWrap",children:a("table",{className:"dk_images",children:[e("thead",{children:a("tr",{children:[e("th",{children:"\u540D\u79F0"}),e("th",{children:"\u9A71\u52A8"}),e("th",{children:"\u8303\u56F4"}),e("th",{children:"\u6302\u8F7D\u70B9"})]})}),e("tbody",{children:Yt.map(n=>a("tr",{className:"dk_rowClickable",onClick:()=>A(n),title:"\u67E5\u770B\u5377\u8BE6\u60C5",children:[e("td",{className:"dk_mono",title:n.name,children:n.name}),e("td",{children:n.driver===""?"\u2014":n.driver}),e("td",{children:n.scope===""?"\u2014":n.scope}),e("td",{className:"dk_mono dk_pathCell",title:n.mountpoint,children:n.mountpoint===""?"\u2014":n.mountpoint})]},n.name))})]})})]}):pt.length===0?mt():e("div",{className:"dk_grid",children:pt.map(n=>e(Zn,{item:n,selected:Me!==null&&n.id===Me.id,allowMutations:r?.allowMutations===!0,pickMode:Z,picked:Ne.includes(n.id),pending:xt[n.id],onTogglePick:La,onOpen:(c,x)=>be({id:c.id,tab:x,item:c}),onExec:Ma,onAction:Ba,onCopyExec:c=>{navigator.clipboard.writeText("docker exec -it "+c.name+" sh").then(()=>re("\u5DF2\u590D\u5236\uFF1Adocker exec -it "+c.name+" sh")).catch(()=>re("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236"))}},n.id))})},ve=t.docked===!0,Ha=r??{pollIntervalSec:5,logTailDefault:200,allowExec:!1,allowMutations:!1,execTimeoutSec:30},$t=Rn(S,Ne),za=On($t.length),Fa=ee===null?[]:Ft(S).find(n=>n.project===ee.project)?.items??[],xn=Lt!==null?e(ra,{item:Lt,target:o,targetLabel:ye(o),config:Ha,initialTab:Me.tab,refreshToken:bt,onBack:()=>be(null),onRefresh:Sa,onClose:W,docked:ve},"detail"):b!==null?e(oa,{item:Y.find(n=>n.id===b.id)??b,target:o,targetLabel:ye(o),onBack:()=>V(null),onClose:W,docked:ve},"imageDetail"):F?e(ca,{target:o,targetLabel:ye(o),allowMutations:r?.allowMutations===!0,onBack:()=>se(!1),onDone:kt,onClose:W,docked:ve},"pull"):ee!==null?e(ka,{project:ee.project,items:Fa,target:o,targetLabel:ye(o),onBack:()=>R(null),onClose:W,docked:ve},"composeDetail"):vt?e(ma,{items:$t,target:o,targetLabel:ye(o),onBack:_e,onClose:W,docked:ve},"aggregate"):u!==null?e(la,{item:u,target:o,targetLabel:ye(o),allowMutations:r?.allowMutations===!0,onBack:()=>g(null),onRemoved:yn(()=>g(null),Nt),onClose:W,docked:ve},"networkDetail"):w!==null?e(ia,{item:w,target:o,targetLabel:ye(o),allowMutations:r?.allowMutations===!0,onBack:()=>A(null),onRemoved:yn(()=>A(null),St),onClose:W,docked:ve},"volumeDetail"):null,Va=[xn!==null?[xn,pe===null?null:e(at,{title:pe.title,text:pe.text,confirmLabel:pe.confirmLabel,busy:_t,onCancel:()=>Ee(null),onConfirm:pe.run},"confirm")]:[ve?null:a("div",{className:"dk_header",children:[e("span",{className:"dk_titleIcon",dangerouslySetInnerHTML:{__html:Ln}}),e("span",{className:"dk_title",children:"Docker \u5BB9\u5668"}),r?.allowMutations===!0?null:e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"}),e("span",{className:"dk_headerSpacer"}),Lt!==null?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":ze?"1":void 0,onClick:gt,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Ke}})}),e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:W,children:e("span",{dangerouslySetInnerHTML:{__html:we}})})]}),Lt!==null?null:a("div",{className:"dk_toolbar",children:[e("select",{className:"dk_select",value:s==="overview"?"":o,onChange:n=>{p(n.target.value),te(""),N("containers"),be(null),_e(),Ge({}),t.onTargetChange?.(ye(n.target.value))},children:[...s==="overview"?[e("option",{value:"",children:"\uFF08\u603B\u89C8 \xB7 \u5168\u90E8\u76EE\u6807\uFF09"},"__overview")]:o===""?[e("option",{value:"",children:"\uFF08\u672A\u9009\u62E9\u76EE\u6807\uFF09"},"__none")]:[],...(l.length===0&&o!==""?[{name:o,label:void 0}]:l).map(n=>e("option",{value:n.name,children:ye(n.name)},n.name))]}),l.length<2?null:e("button",{type:"button",className:"dk_pill dk_pillOverview","data-on":s==="overview"?"1":"0",title:s==="overview"?"\u9000\u51FA\u603B\u89C8\uFF0C\u56DE\u5230\u5F53\u524D\u76EE\u6807\u7684\u5BB9\u5668\u5217\u8868":"\u4E0D\u9009\u76EE\u6807\uFF0C\u4E00\u5C4F\u770B\u5168\u90E8\u76EE\u6807\u7684\u5BB9\u5668\u6982\u51B5\uFF08\u53EA\u8BFB\uFF09",onClick:()=>{if(s!=="overview"){N("overview"),te(""),be(null),_e();return}N("containers"),be(null),_e()},children:"\u603B\u89C8"}),e("div",{className:"dk_seg",children:[["containers","\u5BB9\u5668"],["images","\u955C\u50CF"],["compose","Compose"],["networks","\u7F51\u7EDC"],["volumes","\u5377"]].map(([n,c])=>e("button",{type:"button",className:"dk_segBtn","data-on":s===n?"1":"0",onClick:()=>{N(n),be(null),V(null),R(null),g(null),A(null),se(!1),_e()},children:c},n))}),s==="containers"?e("button",{type:"button",className:"dk_pill dk_pillPick","data-on":Z?"1":"0",title:Z?"\u9000\u51FA\u9009\u62E9\u5E76\u6E05\u7A7A\u52FE\u9009\uFF08Esc\uFF09":"\u591A\u9009\u5BB9\u5668\uFF0C\u628A\u5B83\u4EEC\u7684\u65E5\u5FD7\u4E34\u65F6\u805A\u5408\u6210\u4E00\u6761\u6D41",onClick:Ca,children:Z?"\u9000\u51FA\u9009\u62E9":"\u805A\u5408\u9009\u62E9"}):null,s==="containers"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u540D\u79F0 / \u955C\u50CF / ID",value:me,onChange:n=>Re(n.target.value)}):null,s==="compose"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u9879\u76EE / \u670D\u52A1 / \u5BB9\u5668",value:me,onChange:n=>Re(n.target.value)}):null,s==="images"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u955C\u50CF\uFF08\u4ED3\u5E93 / \u6807\u7B7E / ID\uFF09",value:ct,onChange:n=>Jt(n.target.value)}):null,s==="images"?e("span",{className:"dk_hint dk_searchCount",children:String(Ut.length)+" / "+String(Y.length)+" \u4E2A\u955C\u50CF"}):null,s==="images"?e(J,{icon:nr,disabled:r?.allowMutations!==!0,title:r?.allowMutations===!0?"\u62C9\u53D6\u955C\u50CF\uFF08docker pull\uFF0C\u9010\u5C42\u5B9E\u65F6\u8FDB\u5EA6\uFF09":"\u62C9\u53D6\u955C\u50CF\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>se(!0)},"pull"):null,s==="images"?e(J,{icon:en,danger:!0,disabled:r?.allowMutations!==!0,title:r?.allowMutations===!0?"\u6E05\u7406 dangling\uFF08\u65E0\u6807\u7B7E\uFF09\u955C\u50CF":"\u6E05\u7406 dangling \u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:Da},"prune"):null,s==="networks"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u7F51\u7EDC\uFF08\u540D\u79F0 / \u9A71\u52A8 / ID\uFF09",value:et,onChange:n=>tt(n.target.value)}):null,s==="volumes"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u5377\uFF08\u540D\u79F0 / \u9A71\u52A8 / \u6302\u8F7D\u70B9\uFF09",value:wt,onChange:n=>Kt(n.target.value)}):null,s==="networks"?e("span",{className:"dk_hint dk_searchCount",children:String(qt.length)+" / "+String(f.length)+" \u4E2A\u7F51\u7EDC"}):null,s==="volumes"?e("span",{className:"dk_hint dk_searchCount",children:String(Yt.length)+" / "+String(C.length)+" \u4E2A\u5377"}):null,s==="networks"?e(J,{icon:en,danger:!0,disabled:r?.allowMutations!==!0,title:r?.allowMutations===!0?"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u7F51\u7EDC\uFF08docker network prune\uFF09":"\u6E05\u7406\u7F51\u7EDC\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:Pa},"prune"):null,s==="volumes"?e(J,{icon:en,danger:!0,disabled:r?.allowMutations!==!0,title:r?.allowMutations===!0?"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u5377\uFF08docker volume prune\uFF0C\u4F1A\u5220\u6570\u636E\uFF09":"\u6E05\u7406\u5377\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:ja},"prune"):null,s==="compose"?e("span",{className:"dk_hint dk_searchCount",children:String(Ft(pt).length)+" \u4E2A\u9879\u76EE \xB7 "+String(pt.length)+" \u4E2A\u5BB9\u5668"}):null,s==="containers"?e("div",{className:"dk_seg",children:[["all","\u5168\u90E8"],["running","\u8FD0\u884C\u4E2D"],["stopped","\u5DF2\u505C\u6B62"],["unhealthy","\u4E0D\u5065\u5EB7"]].map(([n,c])=>e("button",{type:"button",className:"dk_segBtn","data-on":Ce===n?"1":"0",onClick:()=>Xe(n),children:c},n))}):null,s==="containers"||s==="compose"||s==="overview"?a("div",{className:"dk_toolbarToggles",children:[s==="containers"||s==="compose"?e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:Se,onChange:n=>Be(n.target.checked)}),"\u542B\u5DF2\u505C\u6B62"]},"all"):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:Ze,onChange:n=>Fe(n.target.checked)}),"\u81EA\u52A8\u5237\u65B0"]},"auto")]}):null,ve?a("div",{className:"dk_toolbarEnd",children:[r?.allowMutations!==!0?e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"},"readonly"):null,e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":ze?"1":void 0,onClick:gt,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Ke}})},"refresh")]}):null]}),s==="containers"&&Z?e(pa,{count:$t.length,info:za,onRun:()=>He(!0),onCancel:_e},"pickBar"):null,a("div",{className:"dk_body",children:[a("div",{className:"dk_main"+(s==="images"||s==="networks"||s==="volumes"||s==="overview"?" dk_mainImages":""),children:[$e===""||s==="overview"?null:e(G,{title:"\u64CD\u4F5C\u5931\u8D25",hint:$e}),le===""?null:e(G,{kind:"info",title:le}),t.sessionHint===void 0?null:e(G,{kind:"info",title:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u6CA1\u914D\u7F6E\u4E3A Docker \u76EE\u6807",hint:"\u4F1A\u8BDD\u4E3B\u673A\uFF1A"+t.sessionHint.host+(t.sessionHint.port===22?"":":"+String(t.sessionHint.port))+(t.sessionHint.book===""?"":"\uFF08\u8FDE\u63A5\u7C3F\uFF1A"+t.sessionHint.book+"\uFF09")+" \u2014 \u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761 kind=ssh \u76EE\u6807"+(t.sessionHint.book===""?"\uFF08\u586B host/username\uFF0C\u6216\u7528\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09":"\uFF0C\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\u300C"+t.sessionHint.book+"\u300D")+"\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u5373\u53EF\u3002"}),r!==null&&r.allowMutations!==!0?e(G,{kind:"info",title:"\u5F53\u524D\u4E3A\u53EA\u8BFB\u6A21\u5F0F",hint:"\u5BB9\u5668\u7684\u542F\u52A8 / \u505C\u6B62 / \u91CD\u542F / \u5220\u9664\uFF0C\u4EE5\u53CA\u955C\u50CF\u3001\u7F51\u7EDC\u3001\u5377\u7684\u5220\u9664\u4E0E\u6E05\u7406\uFF0C\u90FD\u9700\u8981\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u3002"}):null,s==="containers"?e(ha,{events:Ve,status:ge,statusText:Oa(),open:Gt,onToggle:()=>Te(n=>!n)},"activity"):null,Aa()]})]}),pe===null?null:e(at,{title:pe.title,text:pe.text,confirmLabel:pe.confirmLabel,busy:_t,onCancel:()=>Ee(null),onConfirm:pe.run})],Ie===null?null:e(fa,{label:Ie.label,hostRef:_,collapsed:L,height:H,onToggleCollapse:()=>y(n=>!n),onResizeStart:D,onClose:()=>ut(null)},"execDrawer"),De&&Ie!==null?e(at,{title:"\u7ED3\u675F\u5BB9\u5668\u7EC8\u7AEF\u4F1A\u8BDD",text:"\u5173\u95ED\u9762\u677F\u4F1A\u7ED3\u675F\u300C"+Ie.label+"\u300D\u7684\u7EC8\u7AEF\u4F1A\u8BDD\uFF08docker exec -it \u2026\uFF09\u3002\u82E5\u53EA\u662F\u60F3\u7ED9\u65E5\u5FD7 / \u5217\u8868\u817E\u5730\u65B9\uFF0C\u5148\u70B9\u62BD\u5C49\u53F3\u4E0A\u89D2\u7684\u6298\u53E0\u6309\u94AE\u5373\u53EF\uFF0C\u4F1A\u8BDD\u4F1A\u4FDD\u6301\u8FD0\u884C\u3002",confirmLabel:"\u7ED3\u675F\u5E76\u5173\u95ED",onCancel:()=>de(!1),onConfirm:()=>{de(!1),t.onClose()}},"closeConfirm"):null],wn=a("div",{className:"dk_panel"+(ve?" dk_panelDock":""),"data-dock":ve?"1":void 0,ref:z,onMouseDown:n=>n.stopPropagation(),children:Va});return ve?wn:a("div",{className:"dk_backdrop",onMouseDown:n=>{M.current=n.target===n.currentTarget},onMouseUp:n=>{let c=M.current&&n.target===n.currentTarget;M.current=!1,c&&W()},children:[wn]})}function va(){let[t,r]=k(!1),[d,l]=k(null),[m,o]=k(!1),[p,v]=k(!1),[s,N]=k({kind:"",text:""}),S=K(0),E=ke(()=>{U.config().then(u=>{l(u.config),Zt(u.config),S.current=Array.isArray(u.config?.targets)?u.config.targets.length:0,o(!0)}).catch(u=>{N({kind:"error",text:"\u8BFB\u53D6\u914D\u7F6E\u5931\u8D25\uFF1A"+u.message}),o(!0)})},[]);O(()=>{t&&!m&&E()},[t,m,E]);let P=u=>l(g=>({...g,...u})),T=(u,g)=>l(w=>{let A=w.targets.slice();return A[u]={...A[u],...g},{...w,targets:A}}),Y=()=>l(u=>({...u,targets:[...u.targets,{name:"\u76EE\u6807"+String(u.targets.length+1),kind:"local",book:"",host:"",port:22,username:"",auth:"agent",keyPath:"",agentForward:!1,passwordSet:!1,passphraseSet:!1}]})),$=u=>l(g=>({...g,targets:g.targets.filter((w,A)=>A!==u)})),f=u=>l(g=>({...g,hostKeys:g.hostKeys.filter(w=>!(w.host===u.host&&w.port===u.port))})),B=()=>{v(!0),N({kind:"",text:""});let u={enabled:d.enabled,announceToAgent:d.announceToAgent,dockerBin:d.dockerBin,allowMutations:d.allowMutations,allowExec:d.allowExec,execTimeoutSec:d.execTimeoutSec,pollIntervalSec:d.pollIntervalSec,logTailDefault:d.logTailDefault,maxOutputKb:d.maxOutputKb,targets:d.targets.map(g=>({name:g.name,kind:g.kind,book:g.book??"",host:g.host??"",port:Number(g.port)||22,username:g.username??"",auth:g.auth??"agent",keyPath:g.keyPath??"",...g.password===void 0||g.password===""?{}:{password:g.password},...g.passphrase===void 0||g.passphrase===""?{}:{passphrase:g.passphrase},agentForward:g.agentForward===!0})),hostKeys:d.hostKeys,...d.targets.length===0&&S.current>0?{clearTargets:!0}:{}};U.saveConfig(u).then(g=>{l(g.config),Zt(g.config),S.current=Array.isArray(g.config?.targets)?g.config.targets.length:0,Pt(),N(g.warning===void 0?{kind:"ok",text:"\u5DF2\u4FDD\u5B58\u5E76\u70ED\u751F\u6548"}:{kind:"error",text:g.warning})}).catch(g=>{N({kind:"error",text:"\u4FDD\u5B58\u5931\u8D25\uFF1A"+g.message})}).finally(()=>v(!1))},C=u=>e("div",{className:"dk_cardSection",children:u}),j=(u,g,w,A)=>a("div",{className:"dk_field","data-span":A===void 0?void 0:String(A),children:[e("span",{className:"dk_label",children:u}),g,w===void 0?null:e("span",{className:"dk_hint",children:w})]}),b=(u,g,w,A)=>e("input",{className:"dk_input",type:"number",min:g,max:w,value:d[u],onChange:ee=>P({[u]:Number(ee.target.value)})}),V=u=>a("li",{className:"dk_settingsCard"+(t?" dk_settingsCardOpen":""),children:[a("button",{type:"button",className:"dk_settingsHead","aria-expanded":t,onClick:()=>r(g=>!g),children:[a("span",{className:"dk_settingsHeadText",children:[e("span",{className:"dk_settingsName",children:"Docker \u5BB9\u5668\u9762\u677F"}),e("span",{className:"dk_settingsDesc",children:"\u672C\u673A / SSH \u4E3B\u673A\u4E0A\u7684\u5BB9\u5668\u4E0E\u955C\u50CF\uFF1B\u9ED8\u8BA4\u53EA\u8BFB\uFF0C\u53D8\u66F4\u64CD\u4F5C\u9700\u663E\u5F0F\u5F00\u542F"})]}),e("span",{className:"dshkit_badge",children:"Kit"}),e("span",{className:"dk_settingsChevron",dangerouslySetInnerHTML:{__html:Qt}})]}),t?e("div",{className:"dk_settingsBody",children:u}):null]});return V(t?!m||d===null?a("div",{className:"dk_row",children:[e("span",{className:"dk_spin"}),"\u8BFB\u53D6\u914D\u7F6E\u2026"]}):[C("\u57FA\u672C"),a("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:d.enabled,onChange:u=>P({enabled:u.target.checked})}),"\u542F\u7528\u63D2\u4EF6"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:d.announceToAgent,onChange:u=>P({announceToAgent:u.target.checked})}),"\u5411 agent \u516C\u544A\u80FD\u529B"]})]}),a("div",{className:"dk_fieldGrid",children:[j("docker CLI",e("input",{className:"dk_input",value:d.dockerBin,onChange:u=>P({dockerBin:u.target.value})}),"\u9ED8\u8BA4 docker\uFF1Bpodman \u53EF\u586B podman"),j("\u7EDF\u8BA1\u5237\u65B0\u95F4\u9694\uFF08\u79D2\uFF09",b("pollIntervalSec",1,60)),j("\u65E5\u5FD7\u9ED8\u8BA4\u884C\u6570",b("logTailDefault",1,5e3)),j("\u8F93\u51FA\u4E0A\u9650\uFF08KB\uFF09",b("maxOutputKb",1,8192)),j("exec \u8D85\u65F6\uFF08\u79D2\uFF09",b("execTimeoutSec",1,120))]}),C("\u80FD\u529B\u5F00\u5173\uFF08\u9ED8\u8BA4\u5173\u95ED\uFF09"),a("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:d.allowMutations,onChange:u=>P({allowMutations:u.target.checked})}),"\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\uFF08\u5BB9\u5668\u542F\u505C\u5220\u3001\u955C\u50CF\u62C9\u53D6 / \u5220\u9664 / \u6E05\u7406\uFF09"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:d.allowExec,onChange:u=>P({allowExec:u.target.checked})}),"\u5141\u8BB8 exec\uFF08\u5728\u5BB9\u5668\u5185\u6267\u884C\u547D\u4EE4\uFF09"]})]}),e("span",{className:"dk_hint",children:"docker socket \u7B49\u4EF7\u4E8E\u76EE\u6807\u4E3B\u673A\u7684 root \u6743\u9650\u3002\u5F00\u542F\u540E\uFF0C\u6D4F\u89C8\u5668\u9762\u677F\u4E0E agent \u90FD\u80FD\u6267\u884C\u5BF9\u5E94\u64CD\u4F5C\uFF0C\u8BF7\u53EA\u5728\u53EF\u4FE1\u73AF\u5883\u4E0B\u6253\u5F00\u3002"}),C("\u76EE\u6807"),...d.targets.map((u,g)=>a("div",{className:"dk_targetRow",children:[e("input",{className:"dk_input",value:u.name,placeholder:"\u76EE\u6807\u540D",onChange:w=>T(g,{name:w.target.value})}),e("select",{className:"dk_select",value:u.kind,onChange:w=>T(g,{kind:w.target.value}),children:[e("option",{value:"local",children:"\u672C\u673A"}),e("option",{value:"ssh",children:"SSH \u4E3B\u673A"})]}),u.kind==="local"?e("span",{className:"dk_hint",children:"\u5BBF\u4E3B\u6240\u5728\u673A\u5668\u4E0A\u7684 docker"}):a("div",{className:"dk_row",style:{gridColumn:"span 1"},children:[e("select",{className:"dk_select",value:u.book??"",onChange:w=>T(g,{book:w.target.value}),children:[e("option",{value:"",children:d.ttyBooks.length===0?"\uFF08\u65E0 tty \u8FDE\u63A5\u7C3F\uFF0C\u8BF7\u586B\u5185\u8054\u4FE1\u606F\uFF09":"\uFF08\u4E0D\u7528\u8FDE\u63A5\u7C3F\uFF0C\u624B\u586B\uFF09"}),...d.ttyBooks.map(w=>e("option",{value:w,children:"\u8FDE\u63A5\u7C3F\uFF1A"+w},w))]})]}),e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:()=>$(g),children:"\u5220\u9664"}),u.kind==="ssh"&&(u.book??"")===""?a("div",{className:"dk_targetInline",children:[e("input",{className:"dk_input",placeholder:"host",value:u.host??"",onChange:w=>T(g,{host:w.target.value})}),e("input",{className:"dk_input",placeholder:"22",title:"\u7AEF\u53E3",value:u.port??22,onChange:w=>T(g,{port:Number(w.target.value)||22})}),e("input",{className:"dk_input",placeholder:"username",value:u.username??"",onChange:w=>T(g,{username:w.target.value})}),e("select",{className:"dk_select",value:u.auth??"agent",onChange:w=>T(g,{auth:w.target.value}),children:[e("option",{value:"agent",children:"ssh-agent"}),e("option",{value:"key",children:"\u79C1\u94A5"}),e("option",{value:"password",children:"\u5BC6\u7801"})]}),(u.auth??"agent")==="key"?e("input",{className:"dk_input dk_credential",placeholder:"~/.ssh/id_ed25519",value:u.keyPath??"",onChange:w=>T(g,{keyPath:w.target.value})}):null,(u.auth??"agent")==="password"?e("input",{className:"dk_input dk_credential",type:"password",placeholder:u.passwordSet===!0?"\uFF08\u5DF2\u8BBE\u7F6E\uFF0C\u7559\u7A7A\u4FDD\u6301\u4E0D\u53D8\uFF09":"env:SSH_PASSWORD",value:u.password??"",onChange:w=>T(g,{password:w.target.value})}):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:u.agentForward===!0,onChange:w=>T(g,{agentForward:w.target.checked})}),"agent forwarding"]})]}):null]},String(g)+u.name)),a("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn",onClick:Y,children:"\u6DFB\u52A0\u76EE\u6807"}),e("span",{className:"dk_hint",children:"SSH \u76EE\u6807\u63A8\u8350\u76F4\u63A5\u9009 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF08\u51ED\u8BC1\u53EA\u9700\u7EF4\u62A4\u4E00\u5904\uFF09\uFF1B\u624B\u586B\u65F6\u5BC6\u7801 / \u53E3\u4EE4\u5EFA\u8BAE\u5199 env:VAR\u3002"})]}),C("SSH \u4E3B\u673A\u5BC6\u94A5\u8BB0\u5F55\uFF08TOFU\uFF09"),...d.hostKeys.length===0?[e("span",{className:"dk_hint",children:"\u6682\u65E0\u8BB0\u5F55 \u2014 \u9996\u6B21 SSH \u8FDE\u63A5\u6210\u529F\u540E\u81EA\u52A8\u8BB0\u5F55\u4E3B\u673A\u6307\u7EB9\uFF08\u82E5 tty \u5DF2\u8BB0\u5F55\u540C\u4E00\u4E3B\u673A\uFF0C\u4F1A\u76F4\u63A5\u590D\u7528\uFF09\u3002"},"none")]:d.hostKeys.map(u=>a("div",{className:"dk_targetRow",children:[e("span",{children:u.host+":"+String(u.port)}),e("span",{className:"dk_hint",style:{gridColumn:"span 2",wordBreak:"break-all"},children:"sha256:"+u.fingerprint}),e("button",{type:"button",className:"dk_btn",onClick:()=>f(u),children:"\u5220\u9664"})]},u.host+":"+String(u.port))),e("span",{className:"dk_hint",children:"\u6307\u7EB9\u53D8\u66F4\u65F6\u8FDE\u63A5\u4F1A\u88AB\u62D2\u7EDD\uFF08\u9632\u4E2D\u95F4\u4EBA\uFF09\uFF1B\u786E\u8BA4\u5B89\u5168\u540E\u5220\u9664\u5BF9\u5E94\u8BB0\u5F55\u5373\u53EF\u91CD\u8FDE\u3002"}),a("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:p,onClick:B,children:p?"\u4FDD\u5B58\u4E2D\u2026":"\u4FDD\u5B58"}),e("span",{className:"dk_msg","data-kind":s.kind,children:s.text})]})]:null)}let lt=null,qe=null,Vt=null;function it(){let t=qe,r=lt,d=Vt;if(qe=null,lt=null,Vt=null,r!==null&&r.remove(),t!==null&&setTimeout(()=>{try{t.unmount()}catch{}},0),d!==null)try{d.dispose()}catch{}}function ba(t){return t!==null&&typeof t=="object"&&typeof t.appendChild=="function"}function _a(){return typeof Je?.mountPane=="function"&&typeof Je.isOpen=="function"&&Number(Je.version??0)>=1&&Je.isOpen()===!0}function vn(t){it(),Xt();let r={onClose:it,initialTarget:t?.target??"",sessionHint:t?.sessionHint};if(_a()){let d=null;try{d=Je.mountPane({title:"Docker \u5BB9\u5668",hint:t?.target===void 0||t.target===""?"":t.target,size:520,min:360,onClose:()=>it()})}catch(l){d=null,console.warn("[dsh-docker] \u6302\u8F7D\u5230\u7EC8\u7AEF\u9762\u677F\u5931\u8D25\uFF0C\u56DE\u9000\u5F39\u7A97\uFF1A"+(l instanceof Error?l.message:String(l)))}if(d!==null&&ba(d.element)){Vt=d,qe=I(d.element),qe.render(e(fn,{...r,docked:!0,onTargetChange:l=>{try{d.setHint(l)}catch{}}}));return}}lt=document.createElement("div"),document.body.appendChild(lt),qe=I(lt),qe.render(e(fn,r))}function ya(){let t=document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');if(t!==null)return t.querySelector('[class*="logoRow"]')?.parentElement??t.firstElementChild}function xa(t){let r=t.querySelector('button[class*="newSession"]');if(r!==null)return r;for(let d of t.children)if(d.tagName==="BUTTON")return d}function wa(){let t=document.createElement("div");return t.dataset.dshDockerEntry="",t.className="dk_sidebarEntry",t.setAttribute("role","button"),t.setAttribute("aria-label","\u5BB9\u5668"),t.innerHTML='<span class="dk_entryIcon">'+Ln+'</span><span class="dk_entryLabel">\u5BB9\u5668</span>',t.addEventListener("click",r=>{r.preventDefault(),vn()}),t}function bn(t,r){let d=xa(t);if(d===void 0)return!1;if(r.parentElement!==t){let l=d.closest('[class*="logoRow"]'),m=l!==null&&l.parentElement===t?l:d,o=Array.from(t.children).filter(p=>p instanceof HTMLElement&&p.matches("[data-dsh-global-search-entry], [data-dsh-rss-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-tty-entry], [data-dsh-docker-entry]"));if(o.length>0){let p=o[o.length-1];t.insertBefore(r,p.nextSibling)}else t.insertBefore(r,m.nextElementSibling)}return!0}function Na(){if(Xt(),document.querySelector("[data-dsh-docker-entry]")!==null)return()=>{};let t=wa(),r,d=!1,l=()=>{if(r!==void 0&&!r.isConnected&&(o.disconnect(),r=void 0,d=!1),d){if(document.body.contains(t))return;o.disconnect(),r=void 0,d=!1}r??(r=ya()),r!==void 0&&(d=bn(r,t),d&&o.observe(r,{childList:!0,subtree:!0}))},m=new MutationObserver(()=>{l()});m.observe(document.body,{childList:!0,subtree:!0});let o=new MutationObserver(()=>{if(r===void 0||!r.isConnected){d=!1,l();return}r.contains(t)||(d=bn(r,t))});return l(),()=>{m.disconnect(),o.disconnect(),t.remove()}}let Ae={};return Ae.inject=["slots"],Ae.__pick={MAX:rn,SOFT_MAX:Wn,decide:On,toggle:Mn,reconcile:Bn,items:Rn},Ae.__events={LIMIT:jn,RECENT:An,DEBOUNCE_MS:Hn,append:zn,actionText:Vn,timeText:Fn,debounce:Gn},Ae.__overview={ERROR_MAX:on,counts:qn,abnormal:Un,sortRows:Yn,patch:tn,errorText:$n,data:Pn,body:cn},Ae.__listSeq={make:Dn},Ae.apply=t=>{Xt();let r=!1,d=()=>{};jt={set(o){if(o!==r){if(r=o,o){d=Na();return}d(),d=()=>{},it(),typeof Rt?.requestRender=="function"&&Rt.requestRender()}}},Jn(!0);let l=t.slots.inject("settings.plugin.item",()=>t.slots.register({name:"settings.plugin.item",key:"docker",order:102},va));t.inject(["ttyTerminal"],o=>(Pe=o.ttyTerminal??null,()=>{Pe=null})),t.inject(["ttyPanel"],o=>(Je=o.ttyPanel??null,()=>{Je=null}));let m=()=>{};return Pt(),t.inject(["ttyConnbar"],o=>{let p=o.ttyConnbar;p!==void 0&&(Rt=p,m=p.addAction(v=>{if(!At)return;let s=v?.spec??{};if(s.t!=="ssh")return;let N=typeof v?.bookName=="string"?v.bookName:"",S=an(s,N),E=S!==void 0?`\u6253\u5F00\u8BE5\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F\uFF08\u76EE\u6807\uFF1A${S}\uFF09`:je===null?"\u6253\u5F00\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F":"\u8BE5\u4E3B\u673A\u5C1A\u672A\u914D\u7F6E\u4E3A Docker \u76EE\u6807 \u2014 \u70B9\u51FB\u6253\u5F00\u9762\u677F\u67E5\u770B/\u914D\u7F6E";v.addAction(Ya,"\u5BB9\u5668",E,()=>{(async()=>{let P=await qa(s,N),T=Number(s.port);vn({target:P??"",sessionHint:P===void 0?{host:typeof s.host=="string"?s.host:"",port:Number.isInteger(T)&&T>0?T:22,book:N}:void 0})})()})}),(async()=>{for(let v=0;v<3;v+=1){if(await Pt()){typeof p.requestRender=="function"&&p.requestRender();return}await new Promise(s=>setTimeout(s,2e3))}})())}),()=>{m(),l(),jt=null,At=!1,Rt=null,d(),it()}},Ae}});})();
