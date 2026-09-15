"use strict";(()=>{var ka=`/* eslint-disable */
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
`;var On="/api/dsh-docker",ga="dsh-docker-style",ha="@hyzyn/dsh-docker",ao="docker";function yn(){if(document.getElementById(ga)!==null)return;let l=document.createElement("style");l.id=ga,l.textContent=ka,document.head.appendChild(l)}async function oe(l,u){let e=await fetch(On+l,{...u,headers:{"content-type":"application/json",...u?.headers??{}}}),i=null;try{i=await e.json()}catch{}if(!e.ok){let T=i!==null&&typeof i.error=="string"?i.error:`HTTP ${String(e.status)}`;throw new Error(T)}if(i!==null&&i.ok===!1)throw new Error(typeof i.error=="string"?i.error:"\u8BF7\u6C42\u5931\u8D25");return i}var Z={config:()=>oe("/config"),saveConfig:l=>oe("/config",{method:"POST",body:JSON.stringify(l)}),targets:()=>oe("/targets"),probe:l=>oe("/probe",{method:"POST",body:JSON.stringify({target:l})}),containers:(l,u)=>oe("/containers",{method:"POST",body:JSON.stringify({target:l,all:u})}),attention:l=>oe("/attention",{method:"POST",body:JSON.stringify({target:l})}),inspect:(l,u)=>oe("/inspect",{method:"POST",body:JSON.stringify({target:l,id:u})}),logs:(l,u,e)=>oe("/logs",{method:"POST",body:JSON.stringify({target:l,id:u,...e})}),stats:(l,u)=>oe("/stats",{method:"POST",body:JSON.stringify({target:l,ids:u})}),images:l=>oe("/images",{method:"POST",body:JSON.stringify({target:l})}),imageInspect:(l,u)=>oe("/images/inspect",{method:"POST",body:JSON.stringify({target:l,ref:u})}),imageRemove:(l,u)=>oe("/images/remove",{method:"POST",body:JSON.stringify({target:l,ref:u})}),imagePrune:l=>oe("/images/prune",{method:"POST",body:JSON.stringify({target:l})}),networks:l=>oe("/networks",{method:"POST",body:JSON.stringify({target:l})}),networkInspect:(l,u)=>oe("/networks/inspect",{method:"POST",body:JSON.stringify({target:l,name:u})}),networkRemove:(l,u)=>oe("/networks/remove",{method:"POST",body:JSON.stringify({target:l,name:u})}),networkPrune:l=>oe("/networks/prune",{method:"POST",body:JSON.stringify({target:l})}),volumes:l=>oe("/volumes",{method:"POST",body:JSON.stringify({target:l})}),volumeInspect:(l,u)=>oe("/volumes/inspect",{method:"POST",body:JSON.stringify({target:l,name:u})}),volumeRemove:(l,u)=>oe("/volumes/remove",{method:"POST",body:JSON.stringify({target:l,name:u})}),volumePrune:l=>oe("/volumes/prune",{method:"POST",body:JSON.stringify({target:l})}),action:(l,u,e)=>oe("/action",{method:"POST",body:JSON.stringify({target:l,action:u,id:e})}),exec:(l,u,e,i)=>oe("/exec",{method:"POST",body:JSON.stringify({target:l,id:u,command:e,timeoutSec:i})})};function Yt(l,u){return On+l+"?"+new URLSearchParams(u).toString()}function ro(l){return l==null||!Number.isFinite(l)?"\u2014":l.toFixed(l>=10?1:2)+"%"}function oo(l){return l.hostPort===void 0?String(l.containerPort)+"/"+l.protocol:String(l.hostPort)+"\u2192"+String(l.containerPort)+"/"+l.protocol}function Xt(l){if(!Array.isArray(l)||l.length===0)return"\u65E0\u7AEF\u53E3\u6620\u5C04";let u=new Set,e=[];for(let i of l){let T=oo(i);u.has(T)||(u.add(T),e.push(T))}return e.join("  ")}function xt(l){let u=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(l);return u===null?l:u[1]+" "+u[2]}function $t(l){if(l==null||!Number.isFinite(l)||l<0)return"\u2014";let u=["B","kB","MB","GB","TB"],e=l,i=0;for(;e>=1e3&&i<u.length-1;)e/=1e3,i+=1;return(i===0?String(Math.round(e)):e.toFixed(e>=100?0:1))+" "+u[i]}function io(l){return{running:"\u8FD0\u884C\u4E2D",exited:"\u5DF2\u505C\u6B62",created:"\u5DF2\u521B\u5EFA",paused:"\u5DF2\u6682\u505C",restarting:"\u91CD\u542F\u4E2D",dead:"dead",removing:"\u5220\u9664\u4E2D",unknown:"\u672A\u77E5"}[l]??l}function pa(l,u){let e=new Blob([u],{type:"text/plain;charset=utf-8"}),i=URL.createObjectURL(e),T=document.createElement("a");T.href=i,T.download=l,T.click(),setTimeout(()=>URL.revokeObjectURL(i),1e3)}function ma(l){return"docker exec -it '"+String(l).replaceAll("'","'\\''")+"' sh"}var In="dsh-docker:last-target";function fa(){try{let l=window.localStorage.getItem(In);return typeof l=="string"?l:""}catch{return""}}function va(l){try{window.localStorage.setItem(In,l)}catch{}}function xn(l,u,e,i){if(u!=="")return u;if(i)return"";let T=l.map(k=>k.name);return e!==""&&T.includes(e)?e:T.length>0?T[0]:""}var Je=null,Xe=null,Zt=null,Ue=null,Mn=[],Cn=0,tn=null,nn=!1;function ja(l){nn=l,tn!==null&&tn.set(l)}function za(l){ja(!(l!==null&&typeof l=="object"&&l.enabled===!1))}function wn(l){l!==null&&typeof l=="object"&&(Ue=l),Cn=Date.now(),za(Ue)}async function en(){let l=!0;try{Ue=(await Z.config()).config,Cn=Date.now(),za(Ue)}catch(u){l=!1,console.warn("[dsh-docker] \u914D\u7F6E\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(u instanceof Error?u.message:String(u)))}try{Mn=(await Z.targets()).targets??[],Cn=Date.now()}catch(u){nn&&(l=!1,console.warn("[dsh-docker] \u76EE\u6807\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(u instanceof Error?u.message:String(u))))}return l}async function lo(l,u){let e=Tn(l,u);return e!==void 0?e:(await en(),Tn(l,u))}function Tn(l,u){let e=Ue!==null&&Array.isArray(Ue.targets)?Ue.targets:[];if(typeof u=="string"&&u!==""){let L=e.find(P=>P.kind==="ssh"&&P.book===u);if(L!==void 0)return L.name}let i=typeof l?.host=="string"?l.host:"";if(i==="")return;let T=Number(l?.port),k=Number.isInteger(T)&&T>0?T:22;for(let L of Mn){if(L.kind!=="ssh"||typeof L.label!="string")continue;let P=/^([^@]+)@(.+?)(?::(\d+))?$/.exec(L.label);if(P!==null&&P[2]===i&&Number(P[3]??22)===k)return L.name}}var ba='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',so='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',$e='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',Be='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7"/><path d="M11.5 4.5l-7 7"/></svg>',co='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.4l7.4 4.6L5 12.6z"/></svg>',uo='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.2"/></svg>',ko='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',Qt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.6h10"/><path d="M6.2 4.6V3.4a.8.8 0 0 1 .8-.8h2a.8.8 0 0 1 .8.8v1.2"/><path d="M4.6 4.6l.6 8a.9.9 0 0 0 .9.8h3.8a.9.9 0 0 0 .9-.8l.6-8"/></svg>';var go='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v7.2"/><path d="M5 7.4L8 10.4l3-3"/><path d="M3.4 12.8h9.2"/></svg>',ho='<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6l5.8 10.4H2.2z"/><path d="M8 6.4v3.2"/><path d="M8 11.6h.01"/></svg>',_a='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l3.5 3L3 11"/><path d="M8.5 11H13"/></svg>',ya='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 4.5h10"/><path d="M3 8h10"/><path d="M3 11.5h6"/></svg>',po='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3.5 12.5v-4"/><path d="M7 12.5v-8"/><path d="M10.5 12.5v-5"/><path d="M13 12.5v-2"/></svg>',Ze='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 8h-9"/><path d="M7 4.5L3.5 8 7 11.5"/></svg>',Nn='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5L8 10.5l4-4"/></svg>',mo='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6v6.4"/><path d="M5.3 6.5L8 9.2l2.7-2.7"/><path d="M3 11.4v1.2a.8.8 0 0 0 .8.8h8.4a.8.8 0 0 0 .8-.8v-1.2"/></svg>',fo='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="9" rx="1.2"/><path d="M2.5 10.2L5.6 7.6l2.4 2 2.1-1.7 3.4 2.9"/><path d="M6 6.2h.01"/></svg>',Sn='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.4 12.6h9.2"/><path d="M5.2 9.6l3.1-3.1"/><path d="M8.4 3.6l2.4 2.4"/><path d="M10.6 6.2l1.8 1.8-3.2 1.2-1.2 3.2-1.8-1.8z"/></svg>',xa='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.4 5.9L8 2.8l5.6 3.1L8 9z"/><path d="M2.4 8.4L8 11.5l5.6-3.1"/><path d="M2.4 10.9L8 14l5.6-3.1"/></svg>';var vo='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="3.2" r="1.7"/><circle cx="3.4" cy="12.2" r="1.7"/><circle cx="12.6" cy="12.2" r="1.7"/><path d="M6.7 4.6L4.5 10.6"/><path d="M9.3 4.6l2.2 6"/><path d="M5.1 12.2h5.8"/></svg>',bo='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="8" cy="4.2" rx="4.6" ry="1.9"/><path d="M3.4 4.2v7.6c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9V4.2"/><path d="M3.4 8c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9"/></svg>',Ha=6,Qe=8;function wa(l){return l>Qe?{canRun:!1,hint:"\u6700\u591A "+String(Qe)+" \u4E2A\u5BB9\u5668\uFF0C\u6D4F\u89C8\u5668\u5E76\u53D1\u957F\u8FDE\u63A5\u6709\u9650\u5236"}:l>Ha?{canRun:!0,hint:"\u8FDE\u63A5\u6570\u8F83\u591A\uFF0C\u6D4F\u89C8\u5668\u5E76\u53D1\u957F\u8FDE\u63A5\u6709\u9650\u5236"}:l<2?{canRun:!1,hint:l===0?"":"\u81F3\u5C11\u9009\u62E9 2 \u4E2A\u5BB9\u5668"}:{canRun:!0,hint:""}}function Na(l,u){return l.includes(u)?l.filter(e=>e!==u):[...l,u]}function Sa(l,u){let e=new Set(u.map(T=>T.id)),i=l.filter(T=>e.has(T));return i.length===l.length?l:i}var Fa=[{key:"all",label:"\u5168\u90E8\u53EF\u89C1",needsBase:!1},{key:"unhealthy",label:"\u4E0D\u5065\u5EB7",needsBase:!1},{key:"abnormal",label:"\u9700\u5173\u6CE8",needsBase:!1},{key:"stopped",label:"\u5DF2\u505C\u6B62",needsBase:!1},{key:"sameImage",label:"\u540C\u955C\u50CF",needsBase:!0},{key:"sameProject",label:"\u540C\u9879\u76EE",needsBase:!0}],_o=l=>l==="running"||l==="paused"||l==="restarting";function Va(l,u){switch(l){case"all":return()=>!0;case"unhealthy":return e=>e.health==="unhealthy";case"abnormal":return e=>Rn(e).length>0;case"stopped":return e=>!_o(e.state);case"sameImage":return e=>u!==null&&e.image===u.image;case"sameProject":return e=>u!==null&&u.composeProject!==null&&e.composeProject===u.composeProject;default:return()=>!1}}function Ca(l,u,e,i,T){let k=Va(e,i),L=Math.max(T-u.length,0),P=l.filter(et=>!u.includes(et.id)&&k(et)),le=P.slice(0,L);return{ids:u.concat(le.map(et=>et.id)),added:le.length,skipped:P.length-le.length}}function Ta(l,u,e,i){let T=Math.max(i-u.length,0);return Fa.filter(k=>!k.needsBase||e!==null).map(k=>{let L=Va(k.key,e),P=l.filter(le=>!u.includes(le.id)&&L(le)).length;return{key:k.key,label:k.label,count:Math.min(P,T),over:Math.max(P-T,0)}})}function La(l,u){let e=new Map(l.map(i=>[i.id,i]));return u.map(i=>e.get(i)).filter(i=>i!==void 0)}function Ea(){let l=0;return{next(){return l+=1,l},isCurrent(u){return u===l}}}var Ln=120,Ga=[["oom","\u88AB OOM \u6740",0],["dead","\u50F5\u6B7B",1],["unhealthy","\u4E0D\u5065\u5EB7",2],["restarting","\u53CD\u590D\u91CD\u542F",3],["exit-nonzero","\u975E\u96F6\u9000\u51FA",4]],yo=l=>{let u=Ga.find(([e])=>e===l);return u===void 0?l:u[1]},xo=l=>{let u=Ga.find(([e])=>e===l);return u===void 0?9:u[2]};function Rn(l){let u=[];return l.health==="unhealthy"&&u.push("unhealthy"),l.state==="restarting"&&u.push("restarting"),l.state==="dead"&&u.push("dead"),l.state==="exited"&&typeof l.exitCode=="number"&&l.exitCode!==0&&u.push("exit-nonzero"),u}function wo(l){let u=k=>{if(typeof k!="string"||k==="")return"";let L=Date.parse(k);return Number.isFinite(L)?new Date(L).toLocaleString():""},e=["\u6253\u5F00\u5BB9\u5668\u8BE6\u60C5"],i=u(l.finishedAt),T=u(l.startedAt);return i!==""?e.push("\u7ED3\u675F\u4E8E "+i):T!==""&&e.push("\u542F\u52A8\u4E8E "+T),typeof l.restartCount=="number"&&e.push("\u91CD\u542F\u6B21\u6570 "+String(l.restartCount)),typeof l.exitCode=="number"&&e.push("\u9000\u51FA\u7801 "+String(l.exitCode)),e.join(" \xB7 ")}function En(l){return l.filter(u=>Rn(u).length>0)}function Ka(l){let u=0,e=0,i=0;for(let T of l)T.state==="running"||T.state==="paused"||T.state==="restarting"?u+=1:e+=1,T.health==="unhealthy"&&(i+=1);return{running:u,stopped:e,unhealthy:i}}function Wa(l){let u=e=>{let i=Array.isArray(e.reasons)?e.reasons:[];return i.length===0?e.item.health==="unhealthy"?2:3:Math.min(...i.map(xo))};return l.slice().sort((e,i)=>{let T=u(e)-u(i);return T!==0?T:e.targetIndex!==i.targetIndex?e.targetIndex-i.targetIndex:e.item.name===i.item.name?0:e.item.name<i.item.name?-1:1})}function Ja(l){let u=String(l??"").split(`
`)[0].trim();return u===""?"\u672A\u77E5\u9519\u8BEF":u.length>Ln?u.slice(0,Ln)+"\u2026":u}function wt(l,u,e){let i=!1,T=l.map(k=>k.name!==u?k:(i=!0,{...k,...e}));return i?T:l}function Oa(l){let u=l.map(i=>{let T=Ka(i.containers),k=En(i.containers),L=Array.isArray(i.attention)?i.attention.length:null;return{name:i.name,kind:i.kind==="ssh"?"ssh":"local",label:typeof i.label=="string"?i.label:"",error:i.error===""?"":Ja(i.error),loaded:i.loaded===!0,running:T.running,stopped:T.stopped,unhealthy:T.unhealthy,attention:L===null?k.length:L,attentionApprox:L===null}}),e=[];return l.forEach((i,T)=>{if(Array.isArray(i.attention)){for(let k of i.attention)e.push({target:i.name,targetIndex:T,item:k,reasons:Array.isArray(k.reasons)?k.reasons:[]});return}for(let k of En(i.containers))e.push({target:i.name,targetIndex:T,item:k,reasons:Rn(k)})}),{cards:u,rows:Wa(e),unreachable:u.filter(i=>i.error!==""),loading:l.some(i=>i.loaded!==!0)}}var Ia=50,Ma=8,Ra=500;function Ba(l,u,e){let i=[u,...l];return i.length>e?i.slice(0,e):i}function Da(l){if(typeof l!="number"||!Number.isFinite(l))return"--:--:--";let u=new Date(l*1e3);if(Number.isNaN(u.getTime()))return"--:--:--";let e=i=>String(i).padStart(2,"0");return e(u.getHours())+":"+e(u.getMinutes())+":"+e(u.getSeconds())}function Pa(l){let u=typeof l.action=="string"?l.action:"";return u===""?"?":u.indexOf("die")!==0||l.exitCode===null||l.exitCode===void 0?u:u+"("+String(l.exitCode)+")"}function Aa(l,u){let e=null;return{schedule(){e!==null&&clearTimeout(e),e=setTimeout(()=>{e=null,u()},l)},cancel(){e!==null&&(clearTimeout(e),e=null)}}}window.__ModuleLoader__.load({id:"@hyzyn/dsh-docker",factory:l=>{let u=l("react"),{jsx:e,jsxs:i}=l("react/jsx-runtime"),{createRoot:T}=l("react-dom/client"),{useState:k,useEffect:L,useRef:P,useCallback:le}=u;function et(t,n,r){if(n==="")return t;let a=t.toLowerCase(),c=n.toLowerCase(),d=[],h=0,s=a.indexOf(c),f=0;for(;s>=0&&f<500;)s>h&&d.push(t.slice(h,s)),d.push(e("mark",{children:t.slice(s,s+c.length)},r+"-m"+String(f))),h=s+c.length,f+=1,s=a.indexOf(c,h);return h<t.length&&d.push(t.slice(h)),d}function Bn(t){let n=Array.isArray(t.rows)?t.rows:[],r=Array.isArray(t.mono)?t.mono:[];return i("div",{className:"dk_kv",children:n.flatMap(([a,c],d)=>[e("div",{className:"dk_kvKey",children:a},"k"+String(d)),e("div",{className:"dk_kvVal"+(r.indexOf(a)>=0?" dk_kvValMono":""),children:c},"v"+String(d))])})}function it(t){let n=t.health==="unhealthy"?"unhealthy":t.state,r=t.health==="unhealthy"?"\u4E0D\u5065\u5EB7":io(t.state);return e("span",{className:"dk_badge","data-state":n,title:t.status??"",children:r})}function X(t){return i("div",{className:"dk_banner","data-kind":t.kind??"error",children:[e("span",{className:"dk_bannerIcon",dangerouslySetInnerHTML:{__html:ho}},"icon"),i("div",{className:"dk_bannerBody",children:[e("div",{children:t.title}),t.hint===void 0?null:e("div",{className:"dk_hint",style:{marginTop:4},children:t.hint})]},"body"),t.action===void 0?null:e("div",{className:"dk_bannerAction",children:t.action},"action")]})}function Nt(t,n,r){return i("span",{className:"dk_ovCount","data-state":t,"data-zero":r===0?"1":void 0,children:[e("span",{className:"dk_ovCountValue",children:String(r)}),e("span",{className:"dk_ovCountLabel",children:n})]},t)}function Dn(t,n){if(t.cards.length===0)return i("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD8\u6CA1\u6709\u914D\u7F6E Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u76EE\u6807\u540E\uFF0C\u603B\u89C8\u4F1A\u5728\u8FD9\u91CC\u4E00\u5C4F\u6C47\u603B\u5168\u90E8\u4E3B\u673A\u3002"})]});let r=t.rows.length===0?t.loading?i("div",{className:"dk_empty dk_ovEmpty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]},"loading"):i("div",{className:"dk_empty dk_ovEmpty",children:[e("div",{className:"dk_emptyTitle",children:"\u4E00\u5207\u6B63\u5E38"}),e("div",{className:"dk_emptyHint",children:"\u6240\u6709\u76EE\u6807\u4E0A\u90FD\u6CA1\u6709\u9700\u8981\u5173\u6CE8\u7684\u5BB9\u5668\uFF08\u4E0D\u5065\u5EB7 / \u53CD\u590D\u91CD\u542F / \u88AB OOM \u6740 / \u975E\u96F6\u9000\u51FA / \u50F5\u6B7B\uFF09\u3002"})]},"empty"):e("div",{className:"dk_tableWrap",children:i("table",{className:"dk_images dk_ovTable",children:[e("thead",{children:i("tr",{children:[e("th",{children:"\u5BB9\u5668\u540D"}),e("th",{children:"\u76EE\u6807"}),e("th",{children:"\u72B6\u6001"}),e("th",{children:"\u539F\u56E0"}),e("th",{children:"\u955C\u50CF"})]})}),e("tbody",{children:t.rows.map(a=>i("tr",{className:"dk_rowClickable",title:wo(a.item),onClick:()=>n.onOpenContainer(a.target,a.item),children:[e("td",{className:"dk_mono",title:a.item.name,children:a.item.name}),e("td",{children:a.target}),e("td",{children:e(it,{state:a.item.state,health:a.item.health,status:a.item.status})}),e("td",{children:e("span",{className:"dk_reasons",children:(a.reasons??[]).map(c=>e("span",{className:"dk_reason","data-reason":c,children:yo(c)},c))})}),e("td",{className:"dk_mono dk_pathCell",title:a.item.image,children:a.item.image})]},a.target+"\0"+a.item.id))})]})},0);return i("div",{className:"dk_imagesView dk_ovView",children:[t.unreachable.length===0?null:e(X,{title:String(t.unreachable.length)+" \u4E2A\u76EE\u6807\u4E0D\u53EF\u8FBE",hint:t.unreachable.map(a=>a.name+"\uFF1A"+a.error).join("\uFF1B")+"\uFF08\u5176\u4F59\u76EE\u6807\u7684\u6B63\u5E38\u7ED3\u679C\u4E0D\u53D7\u5F71\u54CD\uFF09"},"unreachable"),e("div",{className:"dk_ovCards",children:t.cards.map(a=>i("button",{type:"button",className:"dk_ovCard","data-state":a.error!==""?"error":a.loaded===!0?"ok":"loading",title:a.error===""?"\u5207\u5230\u8BE5\u76EE\u6807\u7684\u5BB9\u5668\u5217\u8868":a.error,onClick:()=>n.onOpenTarget(a.name),children:[i("div",{className:"dk_ovCardHead",children:[e("span",{className:"dk_ovCardName",title:a.label===""?a.name:a.label,children:a.name}),e("span",{className:"dk_badge","data-state":"paused",children:a.kind==="local"?"\u672C\u673A":"SSH"})]},"head"),a.error===""?a.loaded===!0?i("div",{className:"dk_ovCardCounts",children:[Nt("running","\u8FD0\u884C\u4E2D",a.running),Nt("stopped","\u5DF2\u505C\u6B62",a.stopped),Nt("unhealthy","\u4E0D\u5065\u5EB7",a.unhealthy),Nt("attention",a.attentionApprox?"\u9700\u5173\u6CE8\uFF08\u7C97\u5224\uFF09":"\u9700\u5173\u6CE8",a.attention)]},"counts"):i("div",{className:"dk_ovCardLoading",children:[e("span",{className:"dk_spin"}),e("span",{children:"\u8BFB\u53D6\u4E2D\u2026"})]},"loading"):i("div",{className:"dk_ovCardError",children:[e("span",{className:"dk_badge","data-state":"dead",children:"\u4E0D\u53EF\u8FBE"}),e("span",{className:"dk_ovCardErrorText",title:a.error,children:a.error})]},"error")]},a.name))},1),e("div",{className:"dk_ovSection",children:t.rows.length===0?"\u9700\u5173\u6CE8\u5BB9\u5668":"\u9700\u5173\u6CE8\u5BB9\u5668\uFF08"+String(t.rows.length)+"\uFF09"},2),r]})}function lt(t){let n=t.busy===!0;return i("div",{className:"dk_confirmBackdrop",onMouseDown:r=>r.stopPropagation(),children:[i("div",{className:"dk_confirm","data-busy":n?"1":void 0,children:[e("div",{className:"dk_confirmTitle",children:t.title}),e("div",{className:"dk_confirmText",children:t.text}),i("div",{className:"dk_confirmActions",children:[e("button",{type:"button",className:"dk_btn",disabled:n,onClick:t.onCancel,children:"\u53D6\u6D88"}),e("button",{type:"button",className:"dk_btn dk_btnDanger",disabled:n,"aria-busy":n?"true":void 0,onClick:t.onConfirm,children:n?i("span",{className:"dk_confirmBusy",children:[e("span",{className:"dk_spin"}),"\u6267\u884C\u4E2D\u2026"]}):t.confirmLabel})]})]})]})}function No(t){return e("button",{type:"button",className:"dk_btn"+(t.danger===!0?" dk_btnDanger":""),disabled:t.disabled===!0,title:t.title??"",onClick:n=>{n.stopPropagation(),t.onClick()},children:t.children})}let Pn=60;function An(t,n,r){let a=t.concat([n]);return a.length>r?a.slice(a.length-r):a}function jn(t){let n=Array.isArray(t.values)?t.values:[],r=n.filter(m=>typeof m=="number"&&Number.isFinite(m)),a=96,c=22,d=Math.max(Number(t.max)||0,...r,1),h=n.length>1?a/(n.length-1):0,s=[];n.forEach((m,y)=>{if(typeof m!="number"||!Number.isFinite(m))return;let B=h===0?a:y*h,M=c-Math.min(1,Math.max(0,m/d))*c;s.push(B.toFixed(1)+","+M.toFixed(1))});let f=r.length===0?null:r[r.length-1],_=t.alertAt!==void 0&&f!==null&&f>=t.alertAt;return e("span",{className:"dk_spark","data-alert":_?"1":void 0,title:t.title??"",children:s.length<2?e("span",{className:"dk_sparkEmpty",children:"\u91C7\u6837\u4E2D\u2026"}):e("svg",{viewBox:"0 0 "+String(a)+" "+String(c),preserveAspectRatio:"none","aria-hidden":"true",children:e("polyline",{points:s.join(" "),fill:"none",stroke:"currentColor","stroke-width":"1.4","stroke-linejoin":"round","stroke-linecap":"round","vector-effect":"non-scaling-stroke"})})})}function dt(t){return i("div",{className:"dk_cardRow",children:[e("span",{className:"dk_cardLabel",children:t.label}),e("span",{className:"dk_cardValue",title:String(t.value),children:t.value})]})}function $(t){let n=t.disabled===!0,r=t.busy===!0;return e("button",{type:"button",className:"dk_iconBtn"+(t.danger===!0?" dk_iconBtnDanger":""),"data-on":t.on===!0?"1":void 0,"data-spin":t.spin===!0?"1":void 0,"data-busy":r?"1":void 0,"aria-busy":r?"true":void 0,disabled:n,title:t.title,"aria-label":t.title,onClick:a=>{a.stopPropagation(),!n&&t.onClick()},children:r?e("span",{className:"dk_spin"}):e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:t.icon}})})}function Ua(t){let n=t.item,r=t.pickMode===!0,a=t.picked===!0,c=t.allowMutations!==!0,d=n.state==="running"||n.state==="paused"||n.state==="restarting",h=n.createdAt===null?n.runningFor===""?"\u2014":n.runningFor:xt(n.createdAt),s=typeof t.pending=="string"?t.pending:"",f=s!=="",_=y=>f?"\u6B63\u5728\u6267\u884C "+s+"\u2026\u8BF7\u7A0D\u5019":c?"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D":y,m=()=>{if(r){t.onTogglePick(n);return}t.onOpen(n,"overview")};return i("div",{className:"dk_card",role:r?"checkbox":"button","aria-checked":r?a?"true":"false":void 0,tabIndex:0,"data-selected":t.selected===!0?"1":"0","data-pick":r?"1":void 0,"data-picked":a?"1":void 0,"data-pending":f?"1":void 0,onClick:m,onKeyDown:y=>{(y.key==="Enter"||y.key===" ")&&(y.preventDefault(),m())},children:[i("div",{className:"dk_cardHead",children:[r?e("span",{className:"dk_pick","data-on":a?"1":"0","aria-hidden":"true"},"pick"):null,e("span",{className:"dk_cardName",title:n.name,children:n.name}),e(it,{state:n.state,health:n.health,status:n.status})]},"head"),i("div",{className:"dk_cardRows",children:[e(dt,{label:"\u955C\u50CF",value:n.image},"image"),e(dt,{label:"ID",value:n.shortId},"id"),e(dt,{label:"\u7AEF\u53E3",value:Xt(n.ports)},"ports"),e(dt,{label:"\u521B\u5EFA",value:h},"created"),n.composeProject===null?null:e(dt,{label:"compose",value:n.composeProject+(n.composeService===null?"":"/"+n.composeService)},"compose")]},"rows"),r?null:i("div",{className:"dk_actionBar",children:[e($,{icon:_a,title:"\u5728\u5BB9\u5668\u5185\u6253\u5F00\u4EA4\u4E92\u5F0F\u7EC8\u7AEF\uFF08docker exec -it "+n.name+" sh\uFF09",onClick:()=>t.onExec(n)},"exec"),e($,{icon:ya,title:"\u67E5\u770B\u65E5\u5FD7",onClick:()=>t.onOpen(n,"logs")},"logs"),e($,{icon:po,title:"\u8D44\u6E90\u5360\u7528",onClick:()=>t.onOpen(n,"stats")},"stats"),e("span",{className:"dk_actionBarSep","aria-hidden":"true"},"sep"),e($,{icon:d?uo:co,title:_(d?"\u505C\u6B62\u5BB9\u5668":"\u542F\u52A8\u5BB9\u5668"),disabled:c||f,busy:s===(d?"stop":"start"),onClick:()=>t.onAction(d?"stop":"start",n)},"power"),e($,{icon:ko,title:_("\u91CD\u542F\u5BB9\u5668"),disabled:c||f,busy:s==="restart",onClick:()=>t.onAction("restart",n)},"restart"),e($,{icon:Qt,danger:!0,title:_("\u5220\u9664\u5BB9\u5668\uFF08\u4E0D\u53EF\u6062\u590D\uFF09"),disabled:c||f,busy:s==="remove",onClick:()=>t.onAction("remove",n)},"remove")]},"actions")]})}let qa=/^\s*(\[\d{4}-\d{2}-\d{2}[ T][0-9:.,]+\]|\d{2}:\d{2}:\d{2}[,.]\d{3})/,zn=/^\s*(\[(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\]|\|\s*(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL))/,Hn=/(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)/,st=2e3,Le=5e3;function Fn(t,n,r){let a=[],c=t;for(let d=0;d<2;d+=1){let h=qa.exec(c);if(h!==null){a.push(e("span",{className:"dk_logTs",children:h[1]},"ts"+String(d))),c=c.slice(h[0].length);continue}let s=zn.exec(c);if(s!==null){let f=Hn.exec(s[1]);a.push(e("span",{className:"dk_logLevel","data-level":f===null?"":f[1],children:s[1].trim()},"lv"+String(d))),c=c.slice(s[0].length);continue}break}return a.push(e("span",{className:"dk_logText",children:et(c,r,"x"+String(n))},"tx")),a}function Ya(t,n,r){return i("div",{className:"dk_logLine",children:Fn(t,n,r)},String(n))}function Xa(t,n,r,a){let c=a===!0&&typeof t.ts=="number"&&Number.isFinite(t.ts)?e("span",{className:"dk_logTs",children:new Date(t.ts).toLocaleTimeString()},"ts"):null;return i("div",{className:"dk_logLine","data-log-ts":typeof t.ts=="number"&&Number.isFinite(t.ts)?String(t.ts):void 0,children:[e("span",{className:"dk_logSvc",children:"["+t.service+"]"},"svc"),c,...Fn(t.text,n,r)]},String(n))}let ct=null,an=20,Vn=400;function Gn(){if(ct===null)return{ok:!1,reason:"\u5BBF\u4E3B\u672A\u63D0\u4F9B sessions \u670D\u52A1"};let t;try{t=ct.list?.getSnapshot?.()?.current}catch(n){return{ok:!1,reason:n instanceof Error?n.message:String(n)}}if(typeof t!="string"||t==="")return{ok:!1,reason:"\u5F53\u524D\u6CA1\u6709\u6253\u5F00\u7684\u4F1A\u8BDD"};try{let n=ct.scope(t);if(n===void 0)return{ok:!1,reason:"\u4F1A\u8BDD\u5C1A\u672A\u5C31\u7EEA\uFF08\u4F5C\u7528\u57DF\u672A\u6302\u8F7D\uFF09"};let r=n.get?.("conversation")??n.conversation??null;return r===null?{ok:!1,reason:"\u5BBF\u4E3B\u7F3A\u5C11 conversation \u670D\u52A1"}:{ok:!0,id:t,actx:n,conversation:r}}catch(n){return{ok:!1,reason:n instanceof Error?n.message:String(n)}}}function St(t){let n=t.querySelector(".dk_logSvc"),r=t.querySelector(".dk_logLevel"),a=t.querySelector(".dk_logText"),c=a===null?t.textContent??"":a.textContent??"",d=Number(t.dataset.logTs);if((!Number.isFinite(d)||d<=0)&&(d=null),d===null){let h=qn.exec(c);if(h!==null){let s=Date.parse(h[1]);Number.isFinite(s)&&(d=s,c=c.slice(h[0].length))}}return{svc:n===null?"":n.textContent.replace(/^\[|\]$/g,""),lv:r===null?"":r.textContent.trim(),ts:d,text:c}}function $a(t){let n=[];return t.svc!==""&&n.push("["+t.svc+"]"),t.ts!==null&&n.push(new Date(t.ts).toISOString()),t.lv!==""&&n.push(t.lv),n.length===0?t.text:n.join(" ")+" "+t.text}function Za(t){return Array.from(t.querySelectorAll(".dk_logLine")).filter(n=>n.querySelector(".dk_logText")!==null)}function Ct(t){let n=t==null?null:t.nodeType===Node.ELEMENT_NODE?t:t.parentElement;return n===null?null:n.closest(".dk_logLine")}function Qa(t,n){let r=Za(t);if(r.length===0)return null;let a=null,c=null;try{let s=window.getSelection();if(s!==null&&s.isCollapsed===!1&&s.rangeCount>0){let f=s.getRangeAt(0);t.contains(f.commonAncestorContainer)&&(a=Ct(f.startContainer),c=Ct(f.endContainer))}}catch{}(a===null||c===null)&&(a=Ct(n.target),c=a);let d=r.indexOf(a),h=r.indexOf(c);if((d<0||h<0)&&(a=Ct(n.target),d=r.indexOf(a),h=d),d<0)return null;if(d>h){let s=d;d=h,h=s}return{rows:r,from:d,to:h}}function er(t,n){let r=String(n.to-n.from+1);if(t.containers.length===1)return r+" \u884C \xB7 "+t.containers[0].name;let a=new Set;for(let c=n.from;c<=n.to;c+=1){let d=St(n.rows[c]).svc;d!==""&&a.add(d)}return a.size===0?r+" \u884C":r+" \u884C \xB7 "+[...a].slice(0,3).join("/")}function tr(t,n){let r=n.rows,a=[];for(let y=n.from;y<=n.to&&a.length<Vn;y+=1)a.push(St(r[y]));let c=r.slice(Math.max(0,n.from-an),n.from).map(St),d=r.slice(n.to+1,Math.min(r.length,n.to+1+an)).map(St),h=a.concat(c,d).map(y=>y.ts).filter(y=>y!==null),s=[...new Set(a.map(y=>y.svc).filter(y=>y!==""))],f=a.length<n.to-n.from+1,_=[];_.push("[dsh-docker] \u5BB9\u5668\u65E5\u5FD7\u7247\u6BB5"),_.push(""),_.push("- \u76EE\u6807\uFF1A"+(t.targetLabel!==""?t.targetLabel:t.target!==""?t.target:"\u672A\u77E5"));for(let y of t.containers.slice(0,3))_.push("- \u5BB9\u5668\uFF1A"+y.name+"\uFF08"+String(y.id)+(y.image===void 0||y.image===""?"":"\uFF0C\u955C\u50CF "+String(y.image))+"\uFF09");t.containers.length>3&&_.push("- \u5BB9\u5668\uFF1A\u53E6\u6709 "+String(t.containers.length-3)+" \u4E2A\uFF0C\u89C1\u5404\u884C\u7684 [service] \u524D\u7F00"),s.length>0&&_.push("- \u6D89\u53CA\u670D\u52A1\uFF1A"+s.join("\u3001")),_.push("- \u65F6\u95F4\u7A97\uFF1A"+(h.length===0?"\u672A\u542F\u7528\u65F6\u95F4\u6233\uFF0C\u65E0\u65F6\u95F4\u7A97":new Date(Math.min(...h)).toISOString()+" \u2192 "+new Date(Math.max(...h)).toISOString())),_.push("- \u9009\u4E2D\uFF1A"+String(a.length)+" \u884C"+(f?"\uFF08\u5DF2\u622A\u65AD\uFF0C\u4E0A\u9650 "+String(Vn)+" \u884C\uFF09":"")+"\uFF0C\u53E6\u9644\u524D\u540E\u5404 "+String(an)+" \u884C\u4E0A\u4E0B\u6587"+(t.filtered===!0?"\uFF08\u4E0A\u4E0B\u6587\u53D6\u81EA\u5F53\u524D\u8FC7\u6EE4\u540E\u7684\u89C6\u56FE\uFF09":""));let m=(y,B)=>{if(B.length!==0){_.push(""),_.push("--- "+y+" ---");for(let M of B)_.push($a(M))}};return m("\u4E0A\u4E0B\u6587\uFF08\u524D "+String(c.length)+" \u884C\uFF09",c),m("\u9009\u4E2D\uFF08"+String(a.length)+" \u884C\uFF09",a),m("\u4E0A\u4E0B\u6587\uFF08\u540E "+String(d.length)+" \u884C\uFF09",d),_.push(""),_.push("\u9700\u8981\u66F4\u591A\u4E0A\u4E0B\u6587\u8BF7\u81EA\u884C\u62C9\u53D6\uFF0C\u4E0D\u8981\u81C6\u6D4B\u672A\u7ED9\u51FA\u7684\u5185\u5BB9\uFF1A`docker_logs` / `docker_inspect`\uFF0Ctarget="+JSON.stringify(t.target)+(t.containers.length===1?"\uFF0Cid="+JSON.stringify(t.containers[0].name):"")+"\u3002"),_.join(`
`)}let Tt=null,Lt=null,Et=null,Ot=null;function ut(){Lt!==null&&(Lt(),Lt=null),Tt!==null&&(Tt.remove(),Tt=null)}function It(){Ot!==null&&(Ot(),Ot=null),Et!==null&&(Et.remove(),Et=null)}function nr(t,n,r){let c=t.getBoundingClientRect(),d=n,h=r;d+c.width>window.innerWidth-8&&(d=Math.max(8,n-c.width)),h+c.height>window.innerHeight-8&&(h=Math.max(8,r-c.height)),t.style.left=String(Math.round(d))+"px",t.style.top=String(Math.round(h))+"px"}function ar(t){let n=document.createElement("div");n.className="dk_askToast",n.textContent=t,document.body.appendChild(n),setTimeout(()=>n.remove(),5e3)}function Kn(t){t.ok!==!0&&ar("\u672A\u80FD\u4EA4\u7ED9\u4F1A\u8BDD\uFF1A"+t.message)}function rr(t){ut();let n=document.createElement("div");n.className="dk_menu",n.setAttribute("role","menu");let r=document.createElement("div");r.className="dk_menuHead",r.textContent=t.head,n.appendChild(r);let a=document.createElement("div");a.className="dk_menuSub",a.textContent=t.sub,n.appendChild(a);for(let f of t.items){let _=document.createElement("button");_.type="button",_.className="dk_menuItem",_.setAttribute("role","menuitem"),_.disabled=f.disabled===!0,f.disabled===!0&&(_.title=f.reason);let m=document.createElement("span");m.className="dk_menuItemLabel",m.textContent=f.label,_.appendChild(m);let y=document.createElement("span");y.className="dk_menuItemHint",y.textContent=f.disabled===!0?f.reason:f.hint??"",_.appendChild(y),f.disabled!==!0&&_.addEventListener("click",()=>{ut(),f.onPick()}),n.appendChild(_)}let c=document.createElement("div");c.className="dk_menuNote",c.textContent=t.note,n.appendChild(c),document.body.appendChild(n),nr(n,t.x,t.y),Tt=n;let d=f=>{f.key==="Escape"&&ut()},h=f=>{n.contains(f.target)||ut()},s=()=>ut();document.addEventListener("keydown",d,!0),document.addEventListener("mousedown",h,!0),document.addEventListener("wheel",s,{capture:!0,passive:!0}),document.addEventListener("touchmove",s,{capture:!0,passive:!0}),window.addEventListener("resize",s),Lt=()=>{document.removeEventListener("keydown",d,!0),document.removeEventListener("mousedown",h,!0),document.removeEventListener("wheel",s,!0),document.removeEventListener("touchmove",s,!0),window.removeEventListener("resize",s)}}function or(t){return navigator.clipboard!==void 0&&navigator.clipboard!==null?navigator.clipboard.writeText(t):new Promise((n,r)=>{let a=document.createElement("textarea");a.value=t,a.style.position="fixed",a.style.opacity="0",document.body.appendChild(a),a.select();let c=!1;try{c=document.execCommand("copy")}catch{c=!1}a.remove(),c?n():r(new Error("\u6D4F\u89C8\u5668\u62D2\u7EDD\u4E86\u590D\u5236"))})}function Wn(t,n){try{let r=typeof t.conversation.input?.for=="function"?t.conversation.input.for(t.actx):null;r!==null&&typeof r.notify=="function"&&r.notify("info",n)}catch{}}async function rn(t,n){let r=Gn();if(r.ok!==!0)return{ok:!1,message:r.reason};try{if(n==="draft"){let a=typeof r.conversation.input?.for=="function"?r.conversation.input.for(r.actx):null;return a===null||typeof a.setDraft!="function"?{ok:!1,message:"\u5BBF\u4E3B\u672A\u63D0\u4F9B\u4F1A\u8BDD\u8F93\u5165\u95E8\u9762\uFF0C\u65E0\u6CD5\u53EA\u586B\u8349\u7A3F"}:(a.setDraft(t),Wn(r,"\u65E5\u5FD7\u7247\u6BB5\u5DF2\u586B\u5165\u8F93\u5165\u6846\uFF0C\u786E\u8BA4\u540E\u518D\u53D1\u9001"),{ok:!0,message:"\u5DF2\u586B\u5165\u8F93\u5165\u6846"})}return await r.conversation.send(t),Wn(r,"\u65E5\u5FD7\u7247\u6BB5\u5DF2\u53D1\u9001\u5230\u4F1A\u8BDD"),{ok:!0,message:"\u5DF2\u53D1\u9001"}}catch(a){return{ok:!1,message:a instanceof Error?a.message:String(a)}}}function ir(t){It();let n=document.createElement("div");n.className="dk_askCard",n.setAttribute("role","dialog");let r=document.createElement("div");r.className="dk_askCardHead",r.textContent=t.head,n.appendChild(r);let a=document.createElement("textarea");a.className="dk_askCardText",a.spellcheck=!1,a.value=t.prompt,n.appendChild(a);let c=document.createElement("div");c.className="dk_askCardStatus",n.appendChild(c);let d=document.createElement("div");d.className="dk_askCardFoot";let h=(D,U,b)=>{let I=document.createElement("button");return I.type="button",I.className="dk_btn"+(U===void 0?"":" "+U),I.textContent=D,I.addEventListener("click",b),d.appendChild(I),I},s=h("\u53D1\u9001","dk_btnPrimary",()=>{y("send",s)}),f=h("\u53EA\u586B\u8F93\u5165\u6846",void 0,()=>{y("draft",f)});h("\u590D\u5236",void 0,()=>{or(a.value).then(()=>{c.textContent="\u5DF2\u590D\u5236\u8BCA\u65AD\u5305",c.dataset.kind="ok"},D=>{c.textContent="\u590D\u5236\u5931\u8D25\uFF1A"+(D instanceof Error?D.message:String(D)),c.dataset.kind="error"})});let _=h("\u53D6\u6D88",void 0,()=>It());n.appendChild(d);let m=document.createElement("div");m.className="dk_askCardHint",m.textContent="\u5185\u5BB9\u4F1A\u8FDB\u5165\u6A21\u578B\u4E0A\u4E0B\u6587\uFF0C\u8BF7\u7559\u610F\u5176\u4E2D\u7684\u51ED\u8BC1\u4E0E\u7528\u6237\u6570\u636E\u3002",n.appendChild(m);let y=async(D,U)=>{s.disabled=!0,f.disabled=!0,_.disabled=!0,U.textContent=D==="send"?"\u53D1\u9001\u4E2D\u2026":"\u5199\u5165\u4E2D\u2026";let b=await rn(a.value,D);if(b.ok===!0){It();return}c.textContent=b.message,c.dataset.kind="error",s.disabled=!1,f.disabled=!1,_.disabled=!1,U.textContent=D==="send"?"\u53D1\u9001":"\u53EA\u586B\u8F93\u5165\u6846"};document.body.appendChild(n);let B=n.getBoundingClientRect();n.style.left=String(Math.round(Math.max(8,(window.innerWidth-B.width)/2)))+"px",n.style.top=String(Math.round(Math.max(8,(window.innerHeight-B.height)/2)))+"px",a.focus(),Et=n;let M=D=>{D.key==="Escape"&&It()};document.addEventListener("keydown",M,!0),Ot=()=>document.removeEventListener("keydown",M,!0)}function Jn(t,n,r){let a=Qa(n,t);if(a===null)return;t.preventDefault();let c=Gn(),d=()=>tr(r,a),h=c.ok!==!0,s=h?c.reason:"";rr({x:t.clientX,y:t.clientY,head:"\u95EE Agent",sub:er(r,a)+(h?" \xB7 "+s:" \xB7 \u5F53\u524D\u4F1A\u8BDD"),items:[{label:"\u9884\u89C8\u540E\u53D1\u9001\u2026",hint:"\u53EF\u6539\u5B8C\u518D\u53D1",disabled:h,reason:s,onPick:()=>ir({head:"\u53D1\u9001\u65E5\u5FD7\u7247\u6BB5\u5230\u5F53\u524D\u4F1A\u8BDD",prompt:d()})},{label:"\u76F4\u63A5\u53D1\u9001\u5230\u5F53\u524D\u4F1A\u8BDD",hint:"\u7ACB\u5373\u5F00\u59CB\u5206\u6790",disabled:h,reason:s,onPick:()=>{rn(d(),"send").then(Kn)}},{label:"\u53EA\u586B\u5165\u8F93\u5165\u6846",hint:"\u4E0D\u53D1\u9001",disabled:h,reason:s,onPick:()=>{rn(d(),"draft").then(Kn)}}],note:"\u65E5\u5FD7\u5185\u5BB9\u4F1A\u8FDB\u5165\u6A21\u578B\u4E0A\u4E0B\u6587\uFF0C\u8BF7\u7559\u610F\u5176\u4E2D\u7684\u51ED\u8BC1\u3002"})}function lr(t){let n=t.item,r=t.config,[a,c]=k(t.initialTab??"overview"),[d,h]=k(null),[s,f]=k(""),[_,m]=k({tail:r.logTailDefault,timestamps:!1}),[y,B]=k(null),[M,D]=k(""),[U,b]=k(!1),[I,E]=k(""),[j,C]=k(!1),[Q,p]=k(3),[v,S]=k(!1),[q,Y]=k([]),[G,ne]=k(""),[xe,ve]=k(""),[De,me]=k(""),[Ee,nt]=k(!1),[Pe,ke]=k(!0),R=P([]),de=P(""),J=P(null),[te,Ae]=k(null),[be,we]=k(""),[Se,ce]=k(!1),[ae,A]=k(""),[fe,ie]=k(""),[ge,Oe]=k({cpu:[],mem:[]}),Ce=P({cpu:[],mem:[]}),[at,rt]=k(""),[je,ot]=k(null),[Rt,Bt]=k(""),[ht,Ve]=k(!1);L(()=>{let x=!0;return h(null),f(""),Z.inspect(t.target,n.id).then(O=>{x&&h(O.details?.[0]??null)}).catch(O=>{x&&f(O.message)}),()=>{x=!1}},[t.target,n.id,t.refreshToken]);let he=le(()=>{b(!0),D(""),Z.logs(t.target,n.id,{tail:_.tail,timestamps:_.timestamps}).then(x=>B(x.logs)).catch(x=>D(x.message)).finally(()=>b(!1))},[t.target,n.id,_.tail,_.timestamps]);L(()=>{a==="logs"&&he()},[a,he,t.refreshToken]),L(()=>{if(a!=="logs"||!j||v)return;let x=setInterval(he,Math.max(1,Q)*1e3);return()=>clearInterval(x)},[a,j,Q,he,v]),L(()=>{if(a!=="logs"||!v)return;if(typeof EventSource!="function"){ve("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u5B9E\u65F6\u8DDF\u968F"),S(!1);return}R.current=[],de.current="",Y([]),nt(!1),ve(""),me(""),ke(!0),ne("connecting");let x=new URLSearchParams({target:t.target,id:n.id,tail:String(_.tail),..._.timestamps?{timestamps:"1"}:{}}),O=new EventSource(On+"/logs/stream?"+x.toString()),w=!1,z=()=>{if(!w){w=!0;try{O.close()}catch{}}},H=F=>{if(F==="")return;let V=(de.current+F).split(`
`);if(de.current=V.pop()??"",V.length===0)return;let ue=R.current.concat(V),We=ue.length>Le?ue.slice(ue.length-Le):ue;R.current=We,We.length!==ue.length&&nt(!0),Y(We)},K=F=>{let V=null;try{V=JSON.parse(F.data)}catch{return}V===null||typeof V!="object"||(typeof V.d=="string"?H(V.d):typeof V.e=="string"&&H(V.e))},se=F=>{let V=null;try{V=JSON.parse(F.data)}catch{}let ue=V!==null&&typeof V.reason=="string"?V.reason:"container-exit",We=V!==null&&typeof V.code=="number"?V.code:null;if(ue==="container-exit"){me("\u5BB9\u5668\u5DF2\u9000\u51FA"+(We===null?"":"\uFF08\u9000\u51FA\u7801 "+String(We)+"\uFF09")+"\uFF0C\u65E5\u5FD7\u6D41\u7ED3\u675F\uFF0C\u5DF2\u5207\u56DE\u5FEB\u7167"),z(),S(!1),he();return}ne("reconnecting"),me("\u670D\u52A1\u7AEF\u5DF2\u505C\u6B62\u65E5\u5FD7\u6D41\uFF0C\u6B63\u5728\u91CD\u8FDE\u2026")},W=F=>{if(typeof F.data=="string"&&F.data!==""){let V="\u65E5\u5FD7\u6D41\u5F02\u5E38";try{let ue=JSON.parse(F.data);ue!==null&&typeof ue.message=="string"&&(V=ue.message)}catch{}ve(V),z(),S(!1),he();return}ne(O.readyState===2?"closed":"reconnecting")};return O.addEventListener("line",K),O.addEventListener("end",se),O.addEventListener("error",W),O.onopen=()=>{ne("open"),me("")},z},[a,v,t.target,n.id,_.tail,_.timestamps,he]),L(()=>{if(a!=="logs"||!v||!Pe)return;let x=J.current;x!==null&&(x.scrollTop=x.scrollHeight)},[a,v,Pe,q]);let Dt=()=>{if(v){S(!1),ne(""),he();return}S(!0),C(!1),ve(""),me("")},gn=()=>{if(Se){ce(!1),A("");return}ce(!0),ie(""),we("")},pt=()=>ae==="open"?"\u5B9E\u65F6\u8DDF\u968F\u4E2D\uFF08docker stats\uFF09":ae==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u7EDF\u8BA1\u6D41\u2026":ae==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":ae==="closed"?"\u7EDF\u8BA1\u6D41\u5DF2\u65AD\u5F00":"\u7EDF\u8BA1\u6D41",Pt=()=>{let x=J.current;x!==null&&(x.scrollTop=x.scrollHeight),ke(!0)},Ke=x=>{if(!v)return;let O=x.currentTarget;ke(O.scrollHeight-O.scrollTop-O.clientHeight<24)},ze=()=>G==="open"?"\u5B9E\u65F6\u8DDF\u968F\u4E2D\uFF08docker logs -f\uFF09":G==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u65E5\u5FD7\u6D41\u2026":G==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":G==="closed"?"\u65E5\u5FD7\u6D41\u5DF2\u65AD\u5F00":"\u65E5\u5FD7\u6D41";L(()=>{if(a!=="stats"||Se)return;let x=!0,O=()=>{Z.stats(t.target,[n.id]).then(z=>{x&&(Ae(z.stats?.[0]??null),we(""))}).catch(z=>{x&&we(z.message)})};O();let w=setInterval(O,Math.max(2,r.pollIntervalSec)*1e3);return()=>{x=!1,clearInterval(w)}},[a,Se,t.target,n.id,r.pollIntervalSec,t.refreshToken]),L(()=>{if(a!=="stats"||!Se)return;if(typeof EventSource!="function"){ie("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u5B9E\u65F6\u8DDF\u968F"),ce(!1);return}Ce.current={cpu:[],mem:[]},Oe({cpu:[],mem:[]}),A("connecting"),ie(""),we("");let x=new EventSource(Yt("/stats/stream",{target:t.target,ids:n.id})),O=!1,w=()=>{if(!O){O=!0;try{x.close()}catch{}}},z=se=>{let W=null;try{W=JSON.parse(se.data)}catch{return}if(W===null||typeof W!="object")return;let F=typeof W.cpuPercent=="number"?W.cpuPercent:null,V=typeof W.memPercent=="number"?W.memPercent:null;Ae(W),we("");let ue={cpu:F===null?Ce.current.cpu:An(Ce.current.cpu,F,Pn),mem:V===null?Ce.current.mem:An(Ce.current.mem,V,Pn)};Ce.current=ue,Oe(ue)},H=se=>{let W=null;try{W=JSON.parse(se.data)}catch{}let F=W!==null&&typeof W.reason=="string"?W.reason:"stats-exit",V=W!==null&&typeof W.code=="number"?W.code:null;ie("\u7EDF\u8BA1\u6D41\u5DF2\u7ED3\u675F"+(F==="stats-exit"?"\uFF08docker stats \u9000\u51FA"+(V===null?"":"\uFF0C\u9000\u51FA\u7801 "+String(V))+"\uFF09":"")+"\uFF0C\u5DF2\u5207\u56DE\u5FEB\u7167\u8F6E\u8BE2"),w(),ce(!1)},K=se=>{if(typeof se.data=="string"&&se.data!==""){let W="\u7EDF\u8BA1\u6D41\u5F02\u5E38";try{let F=JSON.parse(se.data);F!==null&&typeof F.message=="string"&&(W=F.message)}catch{}we(W),w(),ce(!1);return}A(x.readyState===2?"closed":"reconnecting")};return x.addEventListener("stats",z),x.addEventListener("end",H),x.addEventListener("error",K),x.onopen=()=>{A("open"),ie("")},w},[a,Se,t.target,n.id]);let At=()=>{at.trim()!==""&&(Ve(!0),Bt(""),ot(null),Z.exec(t.target,n.id,at,r.execTimeoutSec).then(x=>ot(x.result)).catch(x=>Bt(x.message)).finally(()=>Ve(!1)))},jt=()=>{if(s!=="")return e(X,{title:"\u8BFB\u53D6\u5BB9\u5668\u8BE6\u60C5\u5931\u8D25",hint:s});if(d===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let x=[["\u72B6\u6001",d.state+(d.health===null?"":" / "+d.health)+(d.status===""?"":"\uFF08"+d.status+"\uFF09")],["\u955C\u50CF",d.image],["\u5BB9\u5668 ID",d.shortId],["\u542F\u52A8\u65F6\u95F4",d.startedAt??"\u2014"],["\u7ED3\u675F\u65F6\u95F4",d.finishedAt??"\u2014"],["\u9000\u51FA\u7801",d.exitCode===null?"\u2014":String(d.exitCode)],["\u91CD\u542F\u6B21\u6570",d.restartCount===null?"\u2014":String(d.restartCount)],["\u91CD\u542F\u7B56\u7565",d.restartPolicy??"\u2014"],["PID",d.pid===null?"\u2014":String(d.pid)],["\u7AEF\u53E3",d.ports.length===0?"\u2014":Xt(d.ports)],["\u6302\u8F7D",d.mounts.length===0?"\u2014":d.mounts.map(w=>w.source+"\u2192"+w.destination+(w.readWrite?"":"\uFF08\u53EA\u8BFB\uFF09")).join(`
`)],["\u7F51\u7EDC",d.networks.length===0?"\u2014":d.networks.map(w=>w.name+(w.ip===null?"":"\uFF08"+w.ip+"\uFF09")).join(", ")],["\u547D\u4EE4",(d.entrypoint+" "+d.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",d.workingDir===""?"\u2014":d.workingDir],["\u7528\u6237",d.user===""?"\u2014":d.user]],O=i("div",{className:"dk_kv",children:x.flatMap(([w,z],H)=>[e("div",{className:"dk_kvKey",children:w},"k"+String(H)),e("div",{className:"dk_kvVal"+(w==="\u5BB9\u5668 ID"||w==="\u547D\u4EE4"||w==="\u955C\u50CF"?" dk_kvValMono":""),children:z},"v"+String(H))])});return i("div",{children:[d.healthLogTail===null?null:e("div",{className:"dk_hint",style:{marginBottom:8},children:"\u6700\u8FD1\u5065\u5EB7\u68C0\u67E5\u8F93\u51FA\uFF1A"+d.healthLogTail}),O,e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u4E00\u6B21\u6027\u547D\u4EE4\uFF08docker exec\uFF09"}),r.allowExec!==!0?e(X,{kind:"info",title:"exec \u672A\u542F\u7528",hint:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8 exec\u300D\uFF0C\u6216\u76F4\u63A5\u590D\u5236\u5361\u7247\u4E0A\u7684 exec \u547D\u4EE4\u5230\u7EC8\u7AEF\u9762\u677F\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u3002"}):i("div",{children:[i("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u5982 ls -la /app \u6216 cat /etc/nginx/nginx.conf",value:at,onChange:w=>rt(w.target.value),onKeyDown:w=>{w.key==="Enter"&&At()}}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:ht,onClick:At,children:ht?"\u6267\u884C\u4E2D\u2026":"\u6267\u884C"})]}),Rt===""?null:e(X,{title:"\u6267\u884C\u5931\u8D25",hint:Rt}),je===null?null:i("div",{style:{marginTop:8},children:[e("div",{className:"dk_hint",children:"\u9000\u51FA\u7801 "+(je.code===null?"?":String(je.code))+" \xB7 \u8017\u65F6 "+String(je.durationMs)+"ms"+(je.truncated?" \xB7 \u8F93\u51FA\u5DF2\u622A\u65AD":"")}),e("pre",{className:"dk_logBox",style:{marginTop:6},children:(je.stdout||"")+(je.stderr===""?"":`
[stderr]
`+je.stderr)||"(\u65E0\u8F93\u51FA)"})]})]})]})},_e=()=>{let x=v?q.join(`
`):y!==null&&typeof y=="object"&&typeof y.text=="string"?y.text:"",O=I.trim().toLowerCase(),w=x===""?[]:x.split(`
`),z=O===""?w:w.filter(H=>H.toLowerCase().includes(O));return{raw:x,needle:O,allLines:w,matchedLines:z}},Ne=(x,O,w,z)=>e("button",{type:"button",className:"dk_pill"+(z?.className??""),"data-on":x?"1":"0",disabled:z?.disabled===!0,title:z?.title??"",onClick:w,children:O}),zt=()=>{let{raw:x}=_e(),O=[...new Set([100,200,500,1e3,5e3,Number(r.logTailDefault)||200,Number(_.tail)||200])].filter(w=>Number.isInteger(w)&&w>0).sort((w,z)=>w-z);return i("div",{className:"dk_logTools",children:[e("span",{className:"dk_toolLabel",children:"LINES"}),e("select",{className:"dk_select dk_selectSm",value:String(_.tail),onChange:w=>m({..._,tail:Number(w.target.value)}),children:O.map(w=>e("option",{value:String(w),children:w===5e3?"Last 5000":"Last "+String(w)},String(w)))}),e("span",{className:"dk_toolLabel",children:"TIMESTAMPS"}),Ne(_.timestamps,_.timestamps?"On":"Off",()=>m({..._,timestamps:!_.timestamps})),e("span",{className:"dk_toolLabel",children:"FOLLOW"}),Ne(v,v?"On":"Off",Dt,{className:" dk_pillFollow",title:v?"\u5173\u95ED\u5B9E\u65F6\u8DDF\u968F\uFF08\u56DE\u5230\u65E5\u5FD7\u5FEB\u7167\uFF09":"\u5B9E\u65F6\u8DDF\u968F\u5BB9\u5668\u65E5\u5FD7\uFF08docker logs -f\uFF09"}),e("span",{className:"dk_toolLabel",children:"AUTO REFRESH"}),Ne(j,j?"On":"Off",()=>C(w=>!w),{disabled:v,title:v?"FOLLOW \u6253\u5F00\u65F6\u6682\u505C\u8F6E\u8BE2":"\u6309\u4E0B\u65B9\u95F4\u9694\u91CD\u65B0\u62C9\u53D6\u65E5\u5FD7\u5FEB\u7167"}),e("select",{className:"dk_select dk_selectSm",value:String(Q),disabled:v,title:"\u81EA\u52A8\u5237\u65B0\u95F4\u9694\uFF08\u5F00\u542F AUTO REFRESH \u540E\u6309\u6B64\u8F6E\u8BE2\uFF09",onChange:w=>p(Number(w.target.value)),children:[2,3,5,10].map(w=>e("option",{value:String(w),children:String(w)+"s"},String(w)))}),e($,{icon:$e,title:"\u5237\u65B0\u65E5\u5FD7",spin:U,onClick:he},"refresh"),e($,{icon:go,title:"\u4E0B\u8F7D\u65E5\u5FD7",disabled:x==="",onClick:()=>pa(n.name+".log",x)},"download")]})},Ht=()=>{let{needle:x,allLines:O,matchedLines:w}=_e();return i("div",{className:"dk_filterBar",children:[i("div",{className:"dk_filterWrap",children:[e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u65E5\u5FD7\u2026",value:I,onChange:z=>E(z.target.value),onKeyDown:z=>{z.key==="Escape"&&I!==""&&(z.stopPropagation(),E(""))}}),I===""?null:e("button",{type:"button",className:"dk_filterClear",title:"\u6E05\u7A7A\u8FC7\u6EE4","aria-label":"\u6E05\u7A7A\u8FC7\u6EE4",onClick:()=>E(""),children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"clear")]}),e("span",{className:"dk_filterCount",children:x===""?String(O.length)+" \u884C":String(w.length)+" / "+String(O.length)+" \u884C\u5339\u914D"})]})},Ft=()=>{let{needle:x,matchedLines:O}=_e(),w=O.length>st?O.slice(-st):O;return i("div",{className:"dk_logs",children:[M===""?null:e(X,{title:"\u8BFB\u53D6\u65E5\u5FD7\u5931\u8D25",hint:M+(M.includes("Failed to fetch")?"\uFF08\u7F51\u7EDC\u8BF7\u6C42\u6CA1\u5230\u5BBF\u4E3B\uFF1A\u5BBF\u4E3B\u53EF\u80FD\u521A\u91CD\u542F\u3001\u6216\u8FDE\u63A5\u88AB\u4E2D\u65AD\uFF09":""),action:e("button",{type:"button",className:"dk_btn",disabled:U,onClick:he,children:"\u91CD\u8BD5"})}),xe===""?null:e(X,{title:"\u65E5\u5FD7\u6D41\u4E2D\u65AD",hint:xe,action:e("button",{type:"button",className:"dk_btn",onClick:Dt,children:"\u91CD\u8BD5"})}),De===""?null:e(X,{kind:"info",title:De}),Ee?e(X,{kind:"warn",title:"\u65E5\u5FD7\u8D85\u8FC7 "+String(Le)+" \u884C\uFF0C\u5DF2\u4E22\u5F03\u6700\u65E9\u5185\u5BB9",hint:"\u6D41\u5F0F\u65E5\u5FD7\u53EA\u4FDD\u7559\u6700\u8FD1\u7684\u884C\uFF1B\u9700\u8981\u5B8C\u6574\u5386\u53F2\u8BF7\u7528\u5FEB\u7167\u6216\u300C\u4E0B\u8F7D\u65E5\u5FD7\u300D\u3002"}):null,!v&&y!==null&&y.truncated===!0?e(X,{kind:"warn",title:"\u65E5\u5FD7\u8F93\u51FA\u8D85\u8FC7\u4E0A\u9650\uFF0C\u5DF2\u622A\u65AD",hint:"\u8C03\u5C0F\u300CLINES\u300D\u6216\u5230\u8BBE\u7F6E\u5361\u7247\u8C03\u5927\u300C\u5355\u6B21\u547D\u4EE4\u8F93\u51FA\u4E0A\u9650\u300D\u3002"}):null,v?e("div",{className:"dk_followState","data-state":G,children:ze()}):null,i("div",{className:"dk_logBody",ref:J,onScroll:Ke,onContextMenu:z=>Jn(z,J.current,{target:t.target,targetLabel:t.targetLabel??"",containers:[n],filtered:x!==""}),children:[O.length>w.length?e("div",{className:"dk_logLine dk_logMore",children:"\uFF08\u53EA\u663E\u793A\u6700\u8FD1 "+String(st)+" \u884C\uFF0C\u5171 "+String(O.length)+" \u884C\u5339\u914D\uFF09"},"more"):null,M!==""?null:!v&&y===null?e("div",{className:"dk_logLine",children:"\u8BFB\u53D6\u4E2D\u2026"},"loading"):w.length===0?e("div",{className:"dk_logLine",children:v?"\u7B49\u5F85\u65E5\u5FD7\u2026":x===""?"(\u65E0\u65E5\u5FD7)":"(\u65E0\u5339\u914D\u65E5\u5FD7)"},"empty"):w.map((z,H)=>Ya(z,H,x))]}),v&&!Pe?e("button",{type:"button",className:"dk_backToBottom",onClick:Pt,children:"\u56DE\u5230\u5E95\u90E8"}):null]})},qe=()=>{let x=Se,O=i("div",{className:"dk_statsBar",children:[e("span",{className:"dk_toolLabel",children:"FOLLOW"}),Ne(x,x?"On":"Off",gn,{className:" dk_pillFollow",title:x?"\u5173\u95ED\u5B9E\u65F6\u8DDF\u968F\uFF08\u56DE\u5230 docker stats \u5FEB\u7167\uFF09":"\u5B9E\u65F6\u8DDF\u968F\u8D44\u6E90\u5360\u7528\uFF08docker stats \u6BCF\u79D2\u4E00\u884C\uFF09"}),e("span",{className:"dk_hint",children:x?"60 \u70B9 \u2248 \u6700\u8FD1 1 \u5206\u949F":"\u6253\u5F00 FOLLOW \u770B\u5B9E\u65F6\u8D8B\u52BF"}),e("span",{className:"dk_headerSpacer"}),x?e("span",{className:"dk_followState","data-state":ae,children:pt()}):null]}),w=F=>i("div",{className:"dk_statsView",children:[O,F]});if(fe!=="")return w(i("div",{children:[e(X,{kind:"info",title:fe}),be===""?null:e(X,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:be})]}));if(be!=="")return w(e(X,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:be}));if(te===null)return w(e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}));let z=te.cpuPercent??0,H=te.memPercent??0,K=F=>i("div",{className:"dk_bar",children:[e("div",{className:"dk_barFill","data-warn":F>=60&&F<85?"1":void 0,"data-danger":F>=85?"1":void 0,style:{width:Math.min(100,Math.max(0,F))+"%"}})]}),se=Math.max(100,...ge.cpu),W=(F,V,ue)=>i("tr",{children:[e("td",{children:F}),e("td",{className:"dk_num",children:V}),e("td",{children:ue??null})]},F);return w(i("table",{className:"dk_stats",children:[e("thead",{children:i("tr",{children:[e("th",{children:"\u6307\u6807"}),e("th",{children:"\u6570\u503C"}),e("th",{children:"\u5360\u7528 / \u8D8B\u52BF"})]})}),e("tbody",{children:[W("CPU",ro(te.cpuPercent),i("div",{className:"dk_trend",children:[K(z),x||ge.cpu.length>0?e(jn,{values:ge.cpu,max:se,alertAt:85,title:"CPU% \u6700\u8FD1 60 \u4E2A\u91C7\u6837"}):null]})),W("\u5185\u5B58",te.memUsage,i("div",{className:"dk_trend",children:[K(H),x||ge.mem.length>0?e(jn,{values:ge.mem,max:100,alertAt:85,title:"\u5185\u5B58\u5360\u7528% \u6700\u8FD1 60 \u4E2A\u91C7\u6837"}):null]})),W("\u7F51\u7EDC IO",te.netIO,null),W("\u78C1\u76D8 IO",te.blockIO,null),W("PIDs",te.pids===null?"\u2014":String(te.pids),null)]})]}))},Vt=[["overview","\u6982\u89C8"],["logs","\u65E5\u5FD7"],["stats","\u7EDF\u8BA1"]],hn=a==="overview"?d===null&&s==="":a==="stats"?te===null&&be==="":!1;return i("div",{className:"dk_detail",children:[i("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:Ze,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:n.name,children:n.name}),e(it,{state:n.state,health:n.health,status:n.status}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),a==="logs"?zt():e($,{icon:$e,title:"\u5237\u65B0",spin:hn,onClick:t.onRefresh},"refresh"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),i("div",{className:"dk_tabs",children:[...Vt.map(([x,O])=>e("button",{type:"button",className:"dk_tab","data-on":a===x?"1":"0",onClick:()=>c(x),children:O},x)),a==="logs"?e("span",{className:"dk_headerSpacer"},"spacer"):null,a==="logs"?Ht():null]}),e("div",{className:"dk_detailBody",children:a==="overview"?jt():a==="logs"?Ft():qe()})]})}function on(t){return t.dangling===!0?t.id:t.reference}function dr(t){let n=t.item,r=on(n),[a,c]=k("overview"),[d,h]=k(null),[s,f]=k(""),[_,m]=k(!1),y=le(()=>{m(!0),f(""),Z.imageInspect(t.target,r).then(b=>h(b.image)).catch(b=>f(b.message)).finally(()=>m(!1))},[t.target,r]);L(()=>{y()},[y]);let B=b=>i("div",{className:"dk_kv",children:b.flatMap(([I,E],j)=>[e("div",{className:"dk_kvKey",children:I},"k"+String(j)),e("div",{className:"dk_kvVal"+(["ID","\u5165\u53E3","digest"].indexOf(I)>=0?" dk_kvValMono":""),children:E},"v"+String(j))])}),M=()=>{if(s!=="")return e(X,{title:"\u8BFB\u53D6\u955C\u50CF\u8BE6\u60C5\u5931\u8D25",hint:s,action:e("button",{type:"button",className:"dk_btn",onClick:y,children:"\u91CD\u8BD5"})});if(d===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let b=d.detail,I=[["\u6807\u7B7E",b.repoTags.length===0?"<none>\uFF08dangling\uFF09":b.repoTags.join(`
`)],["ID",b.id],["\u5927\u5C0F",b.size===null?"\u2014":$t(b.size)],["\u542B\u7236\u5C42",b.virtualSize===null?"\u2014":$t(b.virtualSize)],["\u521B\u5EFA",b.created===""?"\u2014":xt(b.created)],["\u5E73\u53F0",b.os===""&&b.architecture===""?"\u2014":b.os+"/"+b.architecture],["\u5C42\u6570",String(b.layerCount)],["\u5165\u53E3",(b.entrypoint+" "+b.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",b.workingDir===""?"\u2014":b.workingDir],["\u7528\u6237",b.user===""?"\u2014":b.user],["\u66B4\u9732\u7AEF\u53E3",b.exposedPorts.length===0?"\u2014":b.exposedPorts.join(", ")],["digest",b.repoDigests.length===0?"\u2014":b.repoDigests.join(`
`)]],E=Object.entries(b.labels);return i("div",{children:[B(I),e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u5C42\uFF08"+String(b.layerCount)+"\uFF09"}),b.layers.length===0?e("span",{className:"dk_hint",children:"\u8BE5\u955C\u50CF\u6CA1\u6709\u5C42\u4FE1\u606F\uFF08scratch \u6784\u5EFA\u6216\u65E7\u7248 docker\uFF09\u3002"}):e("div",{className:"dk_layerList",children:b.layers.map((j,C)=>i("div",{className:"dk_layerItem",children:[e("span",{className:"dk_layerIndex",children:"#"+String(C)}),e("span",{className:"dk_mono dk_layerId",title:j,children:j.replace(/^sha256:/,"")})]},j+String(C)))}),E.length===0?null:i("div",{children:[e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u6807\u7B7E\uFF08"+String(E.length)+"\uFF09"}),e("div",{className:"dk_labelList",children:E.map(([j,C])=>i("div",{className:"dk_labelItem",children:[e("span",{className:"dk_labelKey",children:j}),e("span",{className:"dk_labelVal",title:C,children:C})]},j))})]})]})},D=()=>s!==""?e(X,{title:"\u8BFB\u53D6\u955C\u50CF\u8BE6\u60C5\u5931\u8D25",hint:s}):d===null?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):d.historyError!==null?e(X,{kind:"warn",title:"\u8BFB\u53D6\u6784\u5EFA\u5386\u53F2\u5931\u8D25",hint:d.historyError}):d.history.length===0?i("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u6CA1\u6709\u6784\u5EFA\u5386\u53F2"}),e("div",{className:"dk_emptyHint",children:"\u8BE5 docker \u7248\u672C\u65E2\u6CA1\u6709 history --format\uFF08\u9700\u8981 Docker \u2265 26\uFF09\uFF0C\u7EAF\u6587\u672C\u8868\u683C\u4E5F\u6CA1\u89E3\u6790\u51FA\u5185\u5BB9\u3002"})]}):e("div",{className:"dk_tableWrap",children:i("table",{className:"dk_images dk_historyTable",children:[e("thead",{children:i("tr",{children:[e("th",{children:"\u5C42 ID"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u6784\u5EFA\u547D\u4EE4"})]})}),e("tbody",{children:d.history.map((b,I)=>i("tr",{children:[e("td",{className:"dk_mono",children:b.shortId}),e("td",{children:b.createdSince===""?b.created===""?"\u2014":xt(b.created):b.createdSince}),e("td",{children:b.sizeText===""?b.size===null?"\u2014":$t(b.size):b.sizeText}),e("td",{className:"dk_mono dk_historyCmd",title:b.createdBy,children:b.createdBy===""?"\u2014":b.createdBy})]},String(I)))})]})}),U=[["overview","\u6982\u89C8"],["history","\u6784\u5EFA\u5386\u53F2"]];return i("div",{className:"dk_detail",children:[i("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:Ze,title:"\u8FD4\u56DE\u955C\u50CF\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:r,children:r}),n.dangling===!0?e("span",{className:"dk_badge","data-state":"paused",children:"dangling"}):null,e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e($,{icon:$e,title:"\u5237\u65B0\u955C\u50CF\u8BE6\u60C5",spin:_,onClick:y},"refresh"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),e("div",{className:"dk_tabs",children:U.map(([b,I])=>e("button",{type:"button",className:"dk_tab","data-on":a===b?"1":"0",onClick:()=>c(b),children:I},b))}),e("div",{className:"dk_detailBody",children:a==="overview"?M():D()})]})}function sr(t){let n=t.item,r=n.name,[a,c]=k("overview"),[d,h]=k(null),[s,f]=k(""),[_,m]=k(!1),[y,B]=k(!1),[M,D]=k(!1),[U,b]=k(""),I=le(()=>{m(!0),f(""),Z.networkInspect(t.target,r).then(p=>h(p.network)).catch(p=>f(p.message)).finally(()=>m(!1))},[t.target,r]);L(()=>{I()},[I]);let E=()=>{D(!0),b(""),Z.networkRemove(t.target,r).then(p=>t.onRemoved(p.result.message)).catch(p=>{B(!1),b(p.message)}).finally(()=>D(!1))},j=()=>{if(s!=="")return e(X,{title:"\u8BFB\u53D6\u7F51\u7EDC\u8BE6\u60C5\u5931\u8D25",hint:s,action:e("button",{type:"button",className:"dk_btn",onClick:I,children:"\u91CD\u8BD5"})});if(d===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let p=d.detail,v=[["\u540D\u79F0",p.name],["ID",p.id],["\u9A71\u52A8",p.driver===""?"\u2014":p.driver],["\u8303\u56F4",p.scope===""?"\u2014":p.scope],["\u521B\u5EFA",p.created===""?"\u2014":xt(p.created)],["\u5B50\u7F51",p.subnets.length===0?"\u2014":p.subnets.map(S=>S.subnet===""?"\u2014":S.subnet).join(`
`)],["\u7F51\u5173",p.subnets.length===0?"\u2014":p.subnets.map(S=>S.gateway===""?"\u2014":S.gateway).join(`
`)],["\u5C5E\u6027",[p.internal?"internal":"",p.attachable?"attachable":"",p.ingress?"ingress":"",p.enableIpv6?"ipv6":""].filter(S=>S!=="").join(" \xB7 ")||"\u2014"],["\u9009\u9879",Object.keys(p.options).length===0?"\u2014":Object.entries(p.options).map(([S,q])=>S+"="+q).join(`
`)],["\u6807\u7B7E",Object.keys(p.labels).length===0?"\u2014":Object.entries(p.labels).map(([S,q])=>S+"="+q).join(`
`)]];return e(Bn,{rows:v,mono:["ID","\u5B50\u7F51","\u7F51\u5173","\u9009\u9879","\u6807\u7B7E"]})},C=()=>{if(s!=="")return e(X,{title:"\u8BFB\u53D6\u7F51\u7EDC\u8BE6\u60C5\u5931\u8D25",hint:s});if(d===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let p=d.detail.containers;return p.length===0?e("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u6CA1\u6709\u5BB9\u5668\u63A5\u5165\u8FD9\u4E2A\u7F51\u7EDC"})]}):e("div",{className:"dk_tableWrap",children:i("table",{className:"dk_images",children:[e("thead",{children:i("tr",{children:[e("th",{children:"\u5BB9\u5668"}),e("th",{children:"IPv4"}),e("th",{children:"IPv6"}),e("th",{children:"MAC"})]})}),e("tbody",{children:p.map(v=>i("tr",{children:[e("td",{className:"dk_mono",title:v.id,children:v.name===""?v.shortId:v.name}),e("td",{className:"dk_mono",children:v.ipv4===""?"\u2014":v.ipv4}),e("td",{className:"dk_mono",children:v.ipv6===""?"\u2014":v.ipv6}),e("td",{className:"dk_mono",children:v.mac===""?"\u2014":v.mac})]},v.id))})]})})},Q=[["overview","\u6982\u89C8"],["containers","\u63A5\u5165\u7684\u5BB9\u5668"+(d===null?"":"\uFF08"+String(d.detail.containers.length)+"\uFF09")]];return i("div",{className:"dk_detail",children:[i("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:Ze,title:"\u8FD4\u56DE\u7F51\u7EDC\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:vo}}),e("span",{className:"dk_detailTitle",title:r,children:r}),n.internal===!0?e("span",{className:"dk_badge","data-state":"paused",children:"internal"}):null,e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e($,{icon:$e,title:"\u5237\u65B0\u7F51\u7EDC\u8BE6\u60C5",spin:_,onClick:I},"refresh"),e($,{icon:Qt,danger:!0,disabled:t.allowMutations!==!0,title:t.allowMutations===!0?"\u5220\u9664\u7F51\u7EDC\uFF08\u4E0D\u53EF\u6062\u590D\uFF09":"\u5220\u9664\u7F51\u7EDC\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>B(!0)},"remove"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),e("div",{className:"dk_tabs",children:Q.map(([p,v])=>e("button",{type:"button",className:"dk_tab","data-on":a===p?"1":"0",onClick:()=>c(p),children:v},p))}),i("div",{className:"dk_detailBody",children:[U===""?null:e(X,{title:"\u5220\u9664\u7F51\u7EDC\u5931\u8D25",hint:U}),a==="overview"?j():C()]}),y?e(lt,{title:"\u5220\u9664\u7F51\u7EDC",text:"\u786E\u5B9A\u5220\u9664\u7F51\u7EDC "+r+"\uFF1F\u8FD8\u6709\u5BB9\u5668\u63A5\u7740\u65F6 docker \u4F1A\u62D2\u7EDD\uFF1B\u5220\u9664\u540E\u4F9D\u8D56\u5B83\u7684\u5BB9\u5668\u4F1A\u5931\u53BB\u7F51\u7EDC\uFF0C\u9700\u8981\u91CD\u65B0\u521B\u5EFA\u6216\u63A5\u5165\u522B\u7684\u7F51\u7EDC\u3002",confirmLabel:"\u5220\u9664",busy:M,onCancel:()=>B(!1),onConfirm:E},"confirm"):null]})}function cr(t){let r=t.item.name,[a,c]=k(null),[d,h]=k(""),[s,f]=k(!1),[_,m]=k(!1),[y,B]=k(!1),[M,D]=k(""),U=le(()=>{f(!0),h(""),Z.volumeInspect(t.target,r).then(E=>c(E.volume)).catch(E=>h(E.message)).finally(()=>f(!1))},[t.target,r]);L(()=>{U()},[U]);let b=()=>{B(!0),D(""),Z.volumeRemove(t.target,r).then(E=>t.onRemoved(E.result.message)).catch(E=>{m(!1),D(E.message)}).finally(()=>B(!1))},I=()=>{if(d!=="")return e(X,{title:"\u8BFB\u53D6\u5377\u8BE6\u60C5\u5931\u8D25",hint:d,action:e("button",{type:"button",className:"dk_btn",onClick:U,children:"\u91CD\u8BD5"})});if(a===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let E=a.detail,j=[["\u540D\u79F0",E.name],["\u9A71\u52A8",E.driver===""?"\u2014":E.driver],["\u8303\u56F4",E.scope===""?"\u2014":E.scope],["\u6302\u8F7D\u70B9",E.mountpoint===""?"\u2014":E.mountpoint],["\u521B\u5EFA",E.created===""?"\u2014":xt(E.created)],["\u9009\u9879",Object.keys(E.options).length===0?"\u2014":Object.entries(E.options).map(([C,Q])=>C+"="+Q).join(`
`)],["\u6807\u7B7E",Object.keys(E.labels).length===0?"\u2014":Object.entries(E.labels).map(([C,Q])=>C+"="+Q).join(`
`)]];return e(Bn,{rows:j,mono:["\u6302\u8F7D\u70B9","\u9009\u9879","\u6807\u7B7E"]})};return i("div",{className:"dk_detail",children:[i("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:Ze,title:"\u8FD4\u56DE\u5377\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:bo}}),e("span",{className:"dk_detailTitle",title:r,children:r}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e($,{icon:$e,title:"\u5237\u65B0\u5377\u8BE6\u60C5",spin:s,onClick:U},"refresh"),e($,{icon:Qt,danger:!0,disabled:t.allowMutations!==!0,title:t.allowMutations===!0?"\u5220\u9664\u5377\uFF08\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u6CA1\uFF0C\u4E0D\u53EF\u6062\u590D\uFF09":"\u5220\u9664\u5377\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>m(!0)},"remove"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),i("div",{className:"dk_detailBody",children:[M===""?null:e(X,{title:"\u5220\u9664\u5377\u5931\u8D25",hint:M}),I()]}),_?e(lt,{title:"\u5220\u9664\u5377",text:"\u786E\u5B9A\u5220\u9664\u5377 "+r+"\uFF1F\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u5220\u9664\u4E14\u4E0D\u53EF\u6062\u590D\uFF1B\u8FD8\u6709\u5BB9\u5668\u5360\u7528\u65F6 docker \u4F1A\u62D2\u7EDD\u3002",confirmLabel:"\u5220\u9664",busy:y,onCancel:()=>m(!1),onConfirm:b},"confirm"):null]})}let ur=2e3;function kr(t,n,r){let a=r+n,c=a.split(/\r\n|\r|\n/),d="";/[\r\n]$/.test(a)||(d=c.pop()??"");let h=t.slice();for(let s of c){let f=s.trim();if(f==="")continue;let _=/^([0-9a-f]{6,}|[A-Za-z][A-Za-z0-9 _-]*?):\s/.exec(f),m=_===null?null:_[1];m!==null&&h.length>0&&h[h.length-1].key===m?h[h.length-1]={key:m,text:f}:h.push({key:m,text:f}),h.length>ur&&h.shift()}return{lines:h,pending:d}}function gr(t){let[n,r]=k(""),[a,c]=k(!1),[d,h]=k([]),[s,f]=k(""),[_,m]=k(""),[y,B]=k(null),M=P(""),D=P([]),U=P(""),b=P(null);L(()=>{if(!a)return;if(typeof EventSource!="function"){m("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u663E\u793A\u62C9\u53D6\u8FDB\u5EA6"),c(!1);return}f("connecting");let C=new EventSource(Yt("/images/pull/stream",{target:t.target,ref:M.current})),Q=!1,p=()=>{if(!Q){Q=!0;try{C.close()}catch{}}},v=Y=>{let G=null;try{G=JSON.parse(Y.data)}catch{return}if(G===null||typeof G!="object")return;let ne=typeof G.d=="string"?G.d:typeof G.e=="string"?G.e:"";if(ne==="")return;let xe=kr(D.current,ne,U.current);D.current=xe.lines,U.current=xe.pending,h(xe.lines)},S=Y=>{let G=null;try{G=JSON.parse(Y.data)}catch{}let ne=G!==null&&typeof G.code=="number"?G.code:null;B(ne),c(!1),f(ne===0?"\u62C9\u53D6\u5B8C\u6210":"\u62C9\u53D6\u7ED3\u675F\uFF08\u9000\u51FA\u7801 "+String(ne===null?"?":ne)+"\uFF09"),ne===0&&t.onDone?.()},q=Y=>{if(typeof Y.data=="string"&&Y.data!==""){let G="\u62C9\u53D6\u5931\u8D25";try{let ne=JSON.parse(Y.data);ne!==null&&typeof ne.message=="string"&&(G=ne.message)}catch{}m(G),c(!1),f("");return}f(C.readyState===2?"closed":"reconnecting")};return C.addEventListener("line",v),C.addEventListener("end",S),C.addEventListener("error",q),C.onopen=()=>f("open"),()=>{p(),U.current=""}},[a,t.target]),L(()=>{let C=b.current;C!==null&&(C.scrollTop=C.scrollHeight)},[d]);let I=()=>{let C=n.trim();C===""||a||(M.current=C,D.current=[],U.current="",h([]),m(""),B(null),f(""),c(!0))},E=()=>{c(!1),f("\u5DF2\u505C\u6B62")},j=()=>s==="open"?"\u6B63\u5728\u62C9\u53D6\uFF08docker pull\uFF09\u2026":s==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u62C9\u53D6\u6D41\u2026":s==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":s==="closed"?"\u62C9\u53D6\u6D41\u5DF2\u65AD\u5F00":s;return i("div",{className:"dk_detail",children:[i("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:Ze,title:"\u8FD4\u56DE\u955C\u50CF\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",children:"\u62C9\u53D6\u955C\u50CF"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),i("div",{className:"dk_detailBody dk_pullBody",children:[t.allowMutations!==!0?e(X,{kind:"info",title:"\u62C9\u53D6\u955C\u50CF\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",hint:"docker pull \u4F1A\u5199\u5165\u76EE\u6807\u673A\u7684\u955C\u50CF\u5B58\u50A8\u5E76\u5360\u7528\u78C1\u76D8\u4E0E\u5E26\u5BBD\u3002\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u540E\u5373\u53EF\u5728\u6B64\u62C9\u53D6\u3002"}):i("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u955C\u50CF\u5F15\u7528\uFF0C\u5982 nginx:1.27 \u6216 ghcr.io/org/app:latest",value:n,disabled:a,onChange:C=>r(C.target.value),onKeyDown:C=>{C.key==="Enter"&&I()}}),a?e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:E,children:"\u505C\u6B62"}):e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:t.allowMutations!==!0,onClick:I,children:"\u62C9\u53D6"})]}),_===""?null:e(X,{title:"\u62C9\u53D6\u5931\u8D25",hint:_}),s===""?null:e("div",{className:"dk_hint",children:j()+(y===null?"":" \xB7 \u9000\u51FA\u7801 "+String(y))}),i("div",{className:"dk_pullBox",ref:b,children:[d.length===0?e("div",{className:"dk_pullLine",children:a?"\u7B49\u5F85 docker pull \u8F93\u51FA\u2026":"\u586B\u5199\u955C\u50CF\u5F15\u7528\u540E\u70B9\u300C\u62C9\u53D6\u300D\uFF0C\u9010\u5C42\u8FDB\u5EA6\u4F1A\u5B9E\u65F6\u51FA\u73B0\u5728\u8FD9\u91CC\u3002"}):d.map((C,Q)=>e("div",{className:"dk_pullLine","data-key":C.key??void 0,children:C.text},String(Q)))]})]})]})}function ln(t){let n=new Map;for(let r of t){let a=r.composeProject===null?"":r.composeProject,c=n.get(a);c===void 0&&(c={project:a,items:[]},n.set(a,c)),c.items.push(r)}return[...n.values()]}let Un=t=>t==="running"||t==="paused"||t==="restarting";function hr(t){return e("div",{className:"dk_projects",children:t.groups.map(n=>{let r=n.items.filter(h=>Un(h.state)).length,a=n.items.filter(h=>h.health==="unhealthy").length,c=[...new Set(n.items.map(h=>h.composeService===null?h.name:h.composeService))],d=n.project===""?"\uFF08\u975E compose \u5BB9\u5668\uFF09":n.project;return i("div",{className:"dk_project",role:"button",tabIndex:0,onClick:()=>t.onOpen(n.project),onKeyDown:h=>{(h.key==="Enter"||h.key===" ")&&(h.preventDefault(),t.onOpen(n.project))},children:[i("div",{className:"dk_projectHead",children:[e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:xa}}),e("span",{className:"dk_projectName",title:d,children:d}),e("span",{className:"dk_badge","data-state":r===n.items.length?"running":r===0?"exited":"paused",children:String(r)+" / "+String(n.items.length)+" \u8FD0\u884C\u4E2D"}),a>0?e("span",{className:"dk_badge","data-state":"unhealthy",children:String(a)+" \u4E0D\u5065\u5EB7"}):null,e("span",{className:"dk_headerSpacer"}),e("span",{className:"dk_hint",children:String(c.length)+" \u4E2A\u670D\u52A1"})]}),e("div",{className:"dk_projectRows",children:n.items.map(h=>i("div",{className:"dk_projectRow",children:[e("span",{className:"dk_projectSvc",children:h.composeService===null?"\u2014":h.composeService}),e("span",{className:"dk_projectContainer",title:h.name,children:h.name}),e(it,{state:h.state,health:h.health,status:h.status}),e("span",{className:"dk_projectImage",title:h.image,children:h.image}),e("span",{className:"dk_projectPorts",children:Xt(h.ports)})]},h.id))})]},n.project===""?"__ungrouped":n.project)})})}function pr(t){let[n,r]=k("services"),a=t.items,c=t.project===""?"\uFF08\u975E compose \u5BB9\u5668\uFF09":t.project,d=a.filter(f=>Un(f.state)).length,h=()=>e("div",{className:"dk_tableWrap",children:i("table",{className:"dk_images dk_composeTable",children:[e("thead",{children:i("tr",{children:[e("th",{children:"\u670D\u52A1"}),e("th",{children:"\u5BB9\u5668"}),e("th",{children:"\u72B6\u6001"}),e("th",{children:"\u7AEF\u53E3"}),e("th",{children:"\u955C\u50CF"})]})}),e("tbody",{children:a.map(f=>i("tr",{children:[e("td",{children:f.composeService===null?"\u2014":f.composeService}),e("td",{className:"dk_mono",title:f.name,children:f.name}),e("td",{children:e(it,{state:f.state,health:f.health,status:f.status})}),e("td",{children:Xt(f.ports)}),e("td",{className:"dk_mono",title:f.image,children:f.image})]},f.id))})]})}),s=[["services","\u670D\u52A1"],["logs","\u805A\u5408\u65E5\u5FD7"]];return i("div",{className:"dk_detail",children:[i("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:Ze,title:"\u8FD4\u56DE Compose \u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:xa}}),e("span",{className:"dk_detailTitle",title:c,children:c}),e("span",{className:"dk_badge","data-state":d===a.length?"running":d===0?"exited":"paused",children:String(d)+" / "+String(a.length)+" \u8FD0\u884C\u4E2D"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),e("div",{className:"dk_tabs",children:s.map(([f,_])=>e("button",{type:"button",className:"dk_tab","data-on":n===f?"1":"0",onClick:()=>r(f),children:_},f))}),e("div",{className:"dk_detailBody",children:n==="services"?h():e(ea,{target:t.target,targetLabel:t.targetLabel,items:a})})]})}let dn=350,qn=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s/;function Yn(t){let n=qn.exec(t);if(n===null)return{ts:null,text:t};let r=Date.parse(n[1]);return{ts:Number.isFinite(r)?r:null,text:t.slice(n[0].length)}}let mr={TRACE:0,DEBUG:1,INFO:2,WARN:3,ERROR:4,FATAL:5},fr=/^\s*(\[\d{4}-\d{2}-\d{2}[ T][0-9:.,]+\]|\d{2}:\d{2}:\d{2}[,.]\d{3})\s*/;function Xn(t){let n=zn.exec(t.replace(fr,""));if(n===null)return null;let r=Hn.exec(n[1]);return r===null?null:r[1]}function sn(t){let n=0;return t.map((r,a)=>(typeof r.ts=="number"&&Number.isFinite(r.ts)&&(n=r.ts),{row:r,index:a,key:n})).sort((r,a)=>r.key-a.key||r.index-a.index).map(r=>r.row)}let cn=400;function Mt(t,n,r){if(n.length===0)return t;let a=Math.max(r,0),c=Math.max(t.length-a,0),d=t.slice(c).concat(n);return t.slice(0,c).concat(sn(d))}function $n(t,n){if(typeof n!="number"||n<=0)return t;let r=null,a=[];for(let c of t){let d=Xn(c.text);d!==null&&(r=d);let h=r===null?null:mr[r]??0;(h===null||h>=n)&&a.push(c)}return a}function vr(t){let n=typeof t.ts=="number"&&Number.isFinite(t.ts)?new Date(t.ts).toISOString()+" ":"";return"["+t.service+"] "+n+t.text}function Zn(t,n){let r=t.map(vr).join(`
`);if(n?.format!=="md")return r;let a=Array.isArray(n.items)?n.items:[];return["# \u805A\u5408\u65E5\u5FD7","","- \u6765\u6E90\uFF1A"+(typeof n.targetLabel=="string"&&n.targetLabel!==""?n.targetLabel+" \xB7 ":"")+(n.target??""),"- \u5BB9\u5668\uFF08"+String(a.length)+"\uFF09\uFF1A"+a.map(d=>d.name).join("\u3001"),"- \u884C\u6570\uFF1A"+String(t.length),"- \u5BFC\u51FA\u65F6\u95F4\uFF1A"+new Date().toLocaleString(),"","```text",r,"```",""].join(`
`)}function Qn(t,n,r){if(n.length===0)return t;let a=t.concat(n);return a.length>r?a.slice(a.length-r):a}function ea(t){let n=t.items,[r,a]=k([]),[c,d]=k("connecting"),[h,s]=k(""),[f,_]=k(!1),[m,y]=k(0),[B,M]=k(!1),[D,U]=k(!1),[b,I]=k("arrival"),[E,j]=k(0),C=P([]),Q=P(new Map),p=P(!1),v=P([]),S=P("arrival"),q=P([]),Y=P(null),G=P(null),ne=n.map(R=>R.id).join(",");L(()=>{if(n.length===0){d("empty");return}if(typeof EventSource!="function"){d("unsupported");return}d("connecting"),C.current=[],Q.current=new Map,v.current=[],a([]),y(0),M(!1),q.current=[],Y.current!==null&&(clearTimeout(Y.current),Y.current=null);let R=0,de=0,J=n.map(te=>{let Ae=te.composeService===null?te.name:te.composeService,be=new EventSource(Yt("/logs/stream",{target:t.target,id:te.id,tail:100,timestamps:1})),we=ae=>{if(ae.length===0)return;let A=S.current==="time"?Mt(C.current,ae,cn):C.current.concat(ae),fe=A.length>Le?A.slice(A.length-Le):A;C.current=fe,fe.length!==A.length&&M(!0),a(fe)},Se=ae=>{if(S.current!=="time"){we(ae);return}q.current=q.current.concat(ae),Y.current===null&&(Y.current=setTimeout(()=>{Y.current=null;let A=q.current;q.current=[],we(sn(A))},dn))},ce=ae=>{let fe=((Q.current.get(te.id)??"")+ae).split(`
`);if(Q.current.set(te.id,fe.pop()??""),fe.length===0)return;let ie=fe.map(ge=>{let Oe=Yn(ge);return{service:Ae,text:Oe.text,ts:Oe.ts}});if(p.current){let ge=v.current.concat(ie);v.current=ge.length>Le?ge.slice(ge.length-Le):ge,y(Oe=>v.current.length-Oe>=5||Oe===0?v.current.length:Oe);return}Se(ie)};return be.addEventListener("line",ae=>{let A=null;try{A=JSON.parse(ae.data)}catch{return}A===null||typeof A!="object"||(typeof A.d=="string"?ce(A.d):typeof A.e=="string"&&ce(A.e))}),be.addEventListener("end",()=>{try{be.close()}catch{}de+=1,de>=n.length&&d("closed")}),be.addEventListener("error",ae=>{typeof ae.data=="string"&&ae.data!==""?d("partial"):d("reconnecting")}),be.onopen=()=>{R+=1,d("open")},()=>{try{be.close()}catch{}}});return()=>{for(let te of J)te()}},[t.target,ne]),L(()=>{if(f)return;let R=G.current;R!==null&&(R.scrollTop=R.scrollHeight)},[f,r]);let xe=()=>{let R=!p.current;if(p.current=R,_(R),R)return;let de=v.current;if(v.current=[],y(0),de.length>0){let J=Qn(C.current,de,Le);C.current=J,a(J)}requestAnimationFrame(()=>{let J=G.current;J!==null&&(J.scrollTop=J.scrollHeight)})},ve=h.trim().toLowerCase(),De=$n(r,E),me=ve===""?De:De.filter(R=>R.text.toLowerCase().indexOf(ve)>=0||R.service.toLowerCase().indexOf(ve)>=0),Ee=me.length>st?me.slice(-st):me,nt=()=>{let R=b==="time"?"arrival":"time";S.current=R,I(R),Y.current!==null&&(clearTimeout(Y.current),Y.current=null);let de=q.current;if(q.current=[],de.length>0){let J=Mt(C.current,de,cn),te=J.length>Le?J.slice(J.length-Le):J;C.current=te,a(te)}if(R==="time"){let J=Mt([],C.current,C.current.length);C.current=J,a(J)}},Pe=R=>{let de=Zn(Ee,{format:R,target:t.target,targetLabel:t.targetLabel,items:n}),J=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);pa("docker-logs-"+J+(R==="md"?".md":".log"),de)},ke=()=>c==="open"?"\u5DF2\u8FDE\u63A5 "+String(n.length)+" \u6761\u5BB9\u5668\u65E5\u5FD7\u6D41\uFF08docker logs -f\uFF09":c==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u5BB9\u5668\u65E5\u5FD7\u6D41\u2026":c==="reconnecting"?"\u90E8\u5206\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":c==="partial"?"\u90E8\u5206\u5BB9\u5668\u65E5\u5FD7\u6D41\u51FA\u9519":c==="closed"?"\u5168\u90E8\u5BB9\u5668\u65E5\u5FD7\u6D41\u5DF2\u7ED3\u675F":c==="unsupported"?"\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource":c==="empty"?"\u8BE5\u9879\u76EE\u6CA1\u6709\u53EF\u805A\u5408\u7684\u5BB9\u5668":"\u805A\u5408\u65E5\u5FD7";return i("div",{className:"dk_logs",children:[B?e(X,{kind:"warn",title:"\u805A\u5408\u65E5\u5FD7\u8D85\u8FC7 "+String(Le)+" \u884C\uFF0C\u5DF2\u4E22\u5F03\u6700\u65E9\u5185\u5BB9"}):null,i("div",{className:"dk_filterBar",children:[i("div",{className:"dk_filterWrap",children:[e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u670D\u52A1\u540D / \u65E5\u5FD7\u5185\u5BB9\u2026",value:h,onChange:R=>s(R.target.value),onKeyDown:R=>{R.key==="Escape"&&h!==""&&(R.stopPropagation(),s(""))}}),h===""?null:e("button",{type:"button",className:"dk_filterClear",title:"\u6E05\u7A7A\u8FC7\u6EE4",onClick:()=>s(""),children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"clear")]}),e("button",{type:"button",className:"dk_pill dk_pillFollow","data-on":f?"0":"1","data-paused":f?"1":void 0,title:f?"\u6062\u590D\u5B9E\u65F6\uFF08\u4F1A\u4E00\u6B21\u6027\u663E\u793A\u6682\u505C\u671F\u95F4\u6512\u4E0B\u7684 "+String(m)+" \u884C\u5E76\u56DE\u5230\u5E95\u90E8\uFF09":"\u6682\u505C\uFF08\u51BB\u7ED3\u5F53\u524D\u753B\u9762\uFF1A\u65B0\u65E5\u5FD7\u7EE7\u7EED\u63A5\u6536\u4F46\u4E0D\u8FFD\u52A0\uFF0C\u907F\u514D\u8BFB\u5C4F\u88AB\u9876\u8D70\uFF09",onClick:xe,children:f?m>0?"\u5DF2\u6682\u505C +"+String(m):"\u5DF2\u6682\u505C":"\u5B9E\u65F6"}),e("button",{type:"button",className:"dk_pill","data-on":D?"1":"0",title:D?"\u9690\u85CF\u6BCF\u884C\u65F6\u95F4\u6233":"\u663E\u793A\u6BCF\u884C\u65F6\u95F4\u6233\uFF08\u65F6\u95F4\u6233\u59CB\u7EC8\u968F\u6D41\u63A5\u6536\uFF0C\u53EA\u5F71\u54CD\u663E\u793A\uFF09",onClick:()=>U(R=>!R),children:"\u65F6\u95F4\u6233"}),e("button",{type:"button",className:"dk_pill","data-on":b==="time"?"1":"0",title:b==="time"?"\u6309\u5230\u8FBE\u987A\u5E8F\u663E\u793A\uFF08\u5B9E\u65F6\u8DDF\u968F\u96F6\u5EF6\u8FDF\uFF09":"\u6309\u5BB9\u5668\u65F6\u95F4\u6233\u5408\u5E76\uFF08\u8DE8\u5BB9\u5668\u6210\u4E00\u6761\u771F\u65F6\u95F4\u7EBF\uFF0C\u4EE3\u4EF7\u7EA6 "+String(dn)+"ms \u5EF6\u8FDF\uFF09",onClick:()=>nt(),children:b==="time"?"\u6309\u65F6\u95F4":"\u6309\u5230\u8FBE"}),e("select",{className:"dk_select dk_selectSm",value:String(E),title:"\u6309\u65E5\u5FD7\u7EA7\u522B\u8FC7\u6EE4\uFF08\u65E0\u7EA7\u522B\u524D\u7F00\u7684\u884C\u59CB\u7EC8\u4FDD\u7559\uFF09",onChange:R=>j(Number(R.target.value)),children:[e("option",{value:"0",children:"\u5168\u90E8\u7EA7\u522B"},"all"),e("option",{value:"3",children:"WARN+"},"warn"),e("option",{value:"4",children:"ERROR+"},"error")]}),e("button",{type:"button",className:"dk_chip",disabled:Ee.length===0,title:"\u5BFC\u51FA\u5F53\u524D\u663E\u793A\u5185\u5BB9\u4E3A .log\uFF08\u7EAF\u6587\u672C\uFF09",onClick:()=>Pe("log"),children:"\u2B07 .log"}),e("button",{type:"button",className:"dk_chip",disabled:Ee.length===0,title:"\u5BFC\u51FA\u5F53\u524D\u663E\u793A\u5185\u5BB9\u4E3A .md\uFF08\u5E26\u6765\u6E90\u4E0E\u884C\u6570\u8868\u5934\uFF0C\u9002\u5408\u5F53\u5DE5\u5355\u9644\u4EF6\uFF09",onClick:()=>Pe("md"),children:"\u2B07 .md"}),e("span",{className:"dk_filterCount",children:ve===""&&E===0?String(r.length)+" \u884C":String(me.length)+" / "+String(r.length)+" \u884C"})]}),e("div",{className:"dk_followState","data-state":c==="open"?"open":c==="closed"?"closed":"connecting",children:ke()}),e("div",{className:"dk_logBody",ref:G,onContextMenu:R=>Jn(R,G.current,{target:t.target,targetLabel:t.targetLabel??"",containers:n,filtered:ve!==""}),children:[Ee.length===0?e("div",{className:"dk_logLine",children:c==="open"?"\u7B49\u5F85\u65E5\u5FD7\u2026":ke()},"empty"):Ee.map((R,de)=>Xa(R,de,ve,D))]})]})}function br(t,n){let r=typeof t.image=="string"?t.image:"",a=typeof t.composeProject=="string"?t.composeProject:"";return i("span",{className:"dk_activityItem","data-action":String(t.action??"").split(":")[0].trim(),title:a===""?r:r+" \xB7 "+a,children:[e("span",{className:"dk_activityTime",children:Da(t.time)}),e("span",{className:"dk_activityName",children:t.name}),e("span",{className:"dk_activityAction",children:Pa(t)})]},String(n)+String(t.name)+String(t.time))}function _r(t){let n=t.open===!0,r=Array.isArray(t.events)?t.events:[],a=r.slice(0,Ma);return i("div",{className:"dk_activity","data-open":n?"1":"0",children:[e("button",{type:"button",className:"dk_activityHead","aria-expanded":n,title:"\u5BB9\u5668\u4E8B\u4EF6\u6D3B\u52A8\uFF08docker events\uFF09\uFF1A\u70B9\u51FB\u6298\u53E0 / \u5C55\u5F00",onClick:t.onToggle,children:[e("span",{className:"dk_activityTitle",children:"\u6D3B\u52A8"}),e("span",{className:"dk_activityState","data-state":t.status??"",children:t.statusText??""}),e("span",{className:"dk_headerSpacer"}),e("span",{className:"dk_hint",children:r.length===0?"\u6682\u65E0\u4E8B\u4EF6":"\u6700\u8FD1 "+String(a.length)+" / "+String(r.length)+" \u6761"}),e("span",{className:"dk_activityChevron",dangerouslySetInnerHTML:{__html:Nn}})]}),n===!1?null:a.length===0?e("div",{className:"dk_activityEmpty",children:"\u6682\u65E0\u4E8B\u4EF6\uFF08\u5BB9\u5668\u7684 start / die / health \u7B49\u52A8\u4F5C\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF09"}):e("div",{className:"dk_activityList",children:a.map(br)})]})}function yr(t){let n=t.info,r=Array.isArray(t.presets)?t.presets:[],a=r.some(c=>c.count>0)||t.count>0;return i("div",{className:"dk_pickBar",children:[i("div",{className:"dk_pickRow",children:[e("span",{className:"dk_pickCount",children:"\u5DF2\u9009 "+String(t.count)+" \u4E2A\u5BB9\u5668"}),n.hint===""?null:e("span",{className:"dk_hint dk_pickHint",children:n.hint}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:n.canRun!==!0,title:n.hint!==""?n.hint:n.canRun===!0?"\u628A\u6240\u9009\u5BB9\u5668\u7684\u65E5\u5FD7\u805A\u5408\u6210\u4E00\u6761\u6D41":"\u81F3\u5C11\u9009\u62E9 2 \u4E2A\u5BB9\u5668",onClick:t.onRun,children:"\u805A\u5408\u65E5\u5FD7"}),e("button",{type:"button",className:"dk_btn",onClick:t.onCancel,children:"\u53D6\u6D88"})]}),a?i("div",{className:"dk_pickPresets",children:[e("span",{className:"dk_pickPresetsLabel",children:"\u6309\u6761\u4EF6\u9009\u4E2D"}),...r.filter(c=>c.count>0).map(c=>e("button",{type:"button",className:"dk_chip",title:"\u5728\u5F53\u524D\u7B5B\u9009\u7ED3\u679C\u91CC\u52FE\u9009\u300C"+c.label+"\u300D\u7684\u5BB9\u5668\uFF08\u6700\u591A "+String(Qe)+" \u4E2A\u6D41\uFF09"+(c.over>0?"\uFF1B\u53E6\u6709 "+String(c.over)+" \u4E2A\u8D85\u51FA\u4E0A\u9650\u4E0D\u4F1A\u9009\u4E2D":""),onClick:()=>t.onPreset(c.key),children:c.label+" "+String(c.count)},c.key)),t.count>0?e("button",{type:"button",className:"dk_chip dk_chipQuiet",title:"\u6E05\u7A7A\u52FE\u9009",onClick:t.onClear,children:"\u6E05\u7A7A"},"clear"):null,t.notice===""?null:e("span",{className:"dk_hint dk_pickNotice",children:t.notice})]}):null]})}function xr(t){return i("div",{className:"dk_detail",children:[i("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:Ze,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868\uFF08\u9000\u51FA\u9009\u62E9\u6001\uFF09",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:ya}}),e("span",{className:"dk_detailTitle",children:"\u805A\u5408\u65E5\u5FD7 \xB7 "+String(t.items.length)+" \u4E2A\u5BB9\u5668"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),e("div",{className:"dk_detailBody",children:e(ea,{target:t.target,targetLabel:t.targetLabel,items:t.items})})]})}function wr(t){let n=t.collapsed===!0;return i("div",{className:"dk_drawer","data-collapsed":n?"1":void 0,style:n||t.height===null?void 0:{height:String(t.height)+"px"},children:[e("div",{className:"dk_drawerResize",title:"\u62D6\u52A8\u8C03\u6574\u7EC8\u7AEF\u9AD8\u5EA6\uFF08\u53CC\u51FB\u6298\u53E0 / \u5C55\u5F00\uFF09",onMouseDown:t.onResizeStart,onDoubleClick:t.onToggleCollapse},"resize"),i("div",{className:"dk_drawerHead",children:[e("span",{className:"dk_drawerIcon",dangerouslySetInnerHTML:{__html:_a}}),e("span",{className:"dk_drawerTitle",title:t.label,children:t.label}),e("span",{className:"dk_drawerHint",children:n?"\u5DF2\u6298\u53E0 \xB7 \u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C":"\u7531\u7EC8\u7AEF\u9762\u677F\u627F\u8F7D \xB7 \u6298\u53E0\u4FDD\u7559\u4F1A\u8BDD"}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_iconBtn dk_drawerFold",title:n?"\u5C55\u5F00\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u672A\u4E2D\u65AD\uFF09":"\u6298\u53E0\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C\uFF09",onClick:t.onToggleCollapse,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Nn}})},"fold"),e("button",{type:"button",className:"dk_iconBtn",title:"\u7ED3\u675F\u7EC8\u7AEF\u4F1A\u8BDD\u5E76\u6536\u8D77\u62BD\u5C49",onClick:t.onClose,children:e("span",{dangerouslySetInnerHTML:{__html:Be}})},"close")]}),e("div",{className:"dk_drawerBody",ref:t.hostRef})]})}function un(t){let[n,r]=k(null),[a,c]=k([]),d=typeof t.initialTarget=="string"?t.initialTarget.trim():"",h=P(d!==""?d:fa()),[s,f]=k(h.current),_=t.sessionHint!==void 0&&(t.initialTarget??"")==="",[m,y]=k("containers"),[B,M]=k([]),[D,U]=k(""),b=P(""),I=le(o=>{b.current=o,U(o)},[]),[E,j]=k([]),[C,Q]=k([]),[p,v]=k([]),[S,q]=k([]),[Y,G]=k(null),[ne,xe]=k(null),[ve,De]=k(null),[me,Ee]=k(null),[nt,Pe]=k(!1),[ke,R]=k(!1),[de,J]=k([]),[te,Ae]=k(""),[be,we]=k(!1),[Se,ce]=k(!1),[ae,A]=k(""),[fe,ie]=k(""),[ge,Oe]=k(!0),[Ce,at]=k(""),[rt,je]=k("all"),[ot,Rt]=k(!1),[Bt,ht]=k([]),[Ve,he]=k(""),[Dt,gn]=k(!0),pt=P(null),Pt=P(""),[Ke,ze]=k(null),[At,jt]=k(0),[_e,Ne]=k(null),[zt,Ht]=k(!1),[Ft,qe]=k({}),[Vt,hn]=k(""),[x,O]=k(""),[w,z]=k(""),H=P(!0),K=P(null);K.current===null&&(K.current=Ea());let[se,W]=k(null),F=P(null),[V,ue]=k(!1),[We,Mr]=k(null),[Rr,pn]=k(!1),aa=P(null),mn=P(!1);L(()=>()=>{H.current=!1},[]),L(()=>{if(se===null)return;let o=F.current;if(o===null)return;let g=null;try{g=Je.mount(o,se.options)}catch(N){ie("\u7EC8\u7AEF\u542F\u52A8\u5931\u8D25\uFF1A"+(N instanceof Error?N.message:String(N))),W(null);return}return()=>{try{g?.()}catch{}}},[se]);let Br=o=>{if(o.button!==void 0&&o.button!==0)return;let g=o.currentTarget.parentElement,N=aa.current;if(g===null||N===null)return;o.preventDefault();let pe=o.clientY,re=g.getBoundingClientRect().height,ee=Math.max(160,Math.round(N.getBoundingClientRect().height*.75)),He=ye=>{let Re=Math.round(re+(pe-ye.clientY));Mr(Math.min(ee,Math.max(160,Re)))},Ut=()=>{document.removeEventListener("mousemove",He),document.removeEventListener("mouseup",Ut),document.body.style.userSelect=""};document.body.style.userSelect="none",document.addEventListener("mousemove",He),document.addEventListener("mouseup",Ut)},Ge=()=>{if(se===null){t.onClose();return}pn(!0)};L(()=>{Z.config().then(o=>{let g=o.config;r(g),Array.isArray(g.targets)&&g.targets.length>0&&f(N=>xn(g.targets,N,h.current,_)),wn(g)}).catch(o=>A(o.message)),Z.targets().then(o=>{c(o.targets??[]),Mn=o.targets??[],f(g=>xn(o.targets??[],g,h.current,_)),h.current=""}).catch(()=>{})},[]),L(()=>{s!==""&&va(s)},[s]);let mt=le(()=>{if(s==="")return Promise.resolve();let o=K.current.next();return ce(!0),Z.containers(s,ge).then(g=>{!H.current||!K.current.isCurrent(o)||(M(g.containers??[]),I(s),A(""))}).catch(g=>{!H.current||!K.current.isCurrent(o)||(b.current!==s&&M([]),I(s),A(g.message))}).finally(()=>{H.current&&K.current.isCurrent(o)&&ce(!1)})},[s,ge]),ft=le(()=>{if(s==="")return Promise.resolve();let o=K.current.next();return ce(!0),Z.images(s).then(g=>{!H.current||!K.current.isCurrent(o)||(Q(g.images??[]),I(s),A(""))}).catch(g=>{!H.current||!K.current.isCurrent(o)||(b.current!==s&&Q([]),I(s),A(g.message))}).finally(()=>{H.current&&K.current.isCurrent(o)&&ce(!1)})},[s]),Gt=le(()=>{if(s==="")return Promise.resolve();let o=K.current.next();return ce(!0),Z.networks(s).then(g=>{!H.current||!K.current.isCurrent(o)||(v(g.networks??[]),I(s),A(""))}).catch(g=>{!H.current||!K.current.isCurrent(o)||(b.current!==s&&v([]),I(s),A(g.message))}).finally(()=>{H.current&&K.current.isCurrent(o)&&ce(!1)})},[s]),Kt=le(()=>{if(s==="")return Promise.resolve();let o=K.current.next();return ce(!0),Z.volumes(s).then(g=>{!H.current||!K.current.isCurrent(o)||(q(g.volumes??[]),I(s),A(""))}).catch(g=>{!H.current||!K.current.isCurrent(o)||(b.current!==s&&q([]),I(s),A(g.message))}).finally(()=>{H.current&&K.current.isCurrent(o)&&ce(!1)})},[s]),fn=le(()=>{if(a.length===0)return j([]),Promise.resolve();let o=K.current.next();ce(!0),j(a.map(re=>({name:re.name,kind:re.kind,label:re.label,containers:[],attention:null,error:"",loaded:!1})));let g=a.length,N=()=>{g-=1,g===0&&H.current&&K.current.isCurrent(o)&&ce(!1)},pe=re=>Z.attention(re).then(ee=>{!H.current||!K.current.isCurrent(o)||j(He=>wt(He,re,{attention:ee.items??[]}))}).catch(()=>{!H.current||!K.current.isCurrent(o)||j(ee=>wt(ee,re,{attention:null}))});return Promise.all(a.map(re=>(pe(re.name),Z.containers(re.name,!0).then(ee=>{!H.current||!K.current.isCurrent(o)||j(He=>wt(He,re.name,{containers:ee.containers??[],error:"",loaded:!0}))}).catch(ee=>{!H.current||!K.current.isCurrent(o)||j(He=>wt(He,re.name,{error:ee instanceof Error?ee.message:String(ee),loaded:!0}))}).finally(N))))},[a]);L(()=>{pt.current=mt},[mt]);let Dr=le(()=>jt(o=>o+1),[]),Ie=le(()=>{R(!1),J([]),Ae(""),we(!1)},[]),Pr=()=>{if(ke){Ie();return}J([]),we(!1),R(!0)},Ar=o=>J(g=>Na(g,o.id));L(()=>{if(!ke)return;let o=g=>{g.key==="Escape"&&Ie()};return document.addEventListener("keydown",o),()=>document.removeEventListener("keydown",o)},[ke,Ie]),L(()=>{ke&&J(o=>Sa(o,B))},[B,ke]);let jr=o=>{f(o),A(""),y("containers"),ze(null),Ie(),qe({}),t.onTargetChange?.(Me(o))},zr=(o,g)=>{f(o),A(""),y("containers"),Ie(),qe({}),ze({id:g.id,tab:"overview",item:g}),t.onTargetChange?.(Me(o))},vt=le(()=>{m==="overview"?fn():m==="images"?ft():m==="networks"?Gt():m==="volumes"?Kt():mt(),jt(o=>o+1)},[m,fn,mt,ft,Gt,Kt]);L(()=>{m!=="overview"&&s!==""&&vt()},[s,ge,m]);let Hr=a.map(o=>o.name).join("\0");L(()=>{m==="overview"&&fn()},[m,Hr]),L(()=>{if(!ot||m!=="overview"&&(s===""||m==="images"))return;let o=setInterval(vt,Math.max(2,n?.pollIntervalSec??5)*1e3);return()=>clearInterval(o)},[ot,vt,s,n,m]);let Fr=()=>Ve==="open"?"\u5B9E\u65F6\u63A5\u6536\u4E2D\uFF08docker events\uFF09":Ve==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u4E8B\u4EF6\u6D41\u2026":Ve==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":Ve==="closed"?"\u4E8B\u4EF6\u6D41\u5DF2\u65AD\u5F00":Ve==="unsupported"?"\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource":"\u4E8B\u4EF6\u6D41";L(()=>{if(m!=="containers"||s==="")return;if(typeof EventSource!="function"){he("unsupported");return}Pt.current!==s&&(Pt.current=s,ht([])),he("connecting");let o=Aa(Ra,()=>{let ye=pt.current;ye!==null&&ye()}),g=!1,N=new EventSource(Yt("/events/stream",{target:s})),pe=!1,re=()=>{if(!pe){pe=!0;try{N.close()}catch{}}},ee=ye=>{let Re=null;try{Re=JSON.parse(ye.data)}catch{return}Re===null||typeof Re!="object"||(ht(qt=>Ba(qt,Re,Ia)),o.schedule())},He=ye=>{let Re=null;try{Re=JSON.parse(ye.data)}catch{}let qt=Re!==null&&typeof Re.code=="number"?Re.code:null;he("closed"),ie("\u4E8B\u4EF6\u6D41\u5DF2\u7ED3\u675F"+(qt===null?"":"\uFF08\u9000\u51FA\u7801 "+String(qt)+"\uFF09")+"\uFF0C\u5217\u8868\u56DE\u5230 AUTO REFRESH / \u624B\u52A8\u5237\u65B0"),re()},Ut=ye=>{if(typeof ye.data=="string"&&ye.data!==""){he("closed"),re();return}he(N.readyState===2?"closed":"reconnecting")};return N.addEventListener("event",ee),N.addEventListener("end",He),N.addEventListener("error",Ut),N.onopen=()=>{if(he("open"),g){let ye=pt.current;ye!==null&&ye()}g=!0},()=>{re(),o.cancel()}},[m,s]),L(()=>{if(fe==="")return;let o=setTimeout(()=>ie(""),4e3);return()=>clearTimeout(o)},[fe]);let Wt=(o,g)=>{let N=ma(o.name);navigator.clipboard.writeText(N).then(()=>{ie("\u5DF2\u590D\u5236\uFF1A"+N+(g===void 0?"":"\uFF08"+g+"\uFF09"))}).catch(()=>ie("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u6267\u884C\uFF1A"+N))},Vr=o=>{let g=ma(o.name);if(Je===null){let ee=document.querySelector("[data-dsh-tty-entry]")!==null;Wt(o,ee?"\u7EC8\u7AEF\u9762\u677F\u7248\u672C\u8FC7\u65E7\uFF08\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u9700\u8981 dsh-tty \u2265 0.14.0\uFF09\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C":"\u672A\u5B89\u88C5 dsh-tty \u7EC8\u7AEF\u9762\u677F\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C\uFF08\u88C5 dsh-tty \u540E\u53EF\u76F4\u63A5\u5728\u6B64\u5F00\u7EC8\u7AEF\uFF09");return}let N=(n?.targets??[]).find(ee=>ee.name===s),pe=o.name+" \xB7 exec",re=N===void 0||N.kind==="local"?{command:g,label:pe}:typeof N.book=="string"&&N.book!==""?{book:N.book,command:g,label:pe}:(N.auth??"agent")==="agent"?{spec:{host:N.host,port:N.port,username:N.username,auth:"agent",agentForward:N.agentForward===!0},command:g,label:pe}:null;if(re===null){Wt(o,"\u5185\u8054\u76EE\u6807\u7528\u4E86 key/password \u8BA4\u8BC1\uFF0C\u6D4F\u89C8\u5668\u7AEF\u62FF\u4E0D\u5230\u51ED\u8BC1");return}if(t.docked===!0){try{Je.open(re)}catch(ee){Wt(o,ee instanceof Error?ee.message:String(ee))}return}if(typeof Je.mount=="function"&&Number(Je.version??0)>=2){W({label:pe,options:re}),ue(!1);return}try{Je.open(re),t.onClose()}catch(ee){Wt(o,ee instanceof Error?ee.message:String(ee))}},ra=o=>qe(g=>{if(g[o]===void 0)return g;let N={...g};return delete N[o],N}),bt=(o,g)=>{Ht(!0);let N=()=>{Ht(!1),Ne(null)};Promise.resolve().then(o).then(async()=>{if(N(),g!==void 0)try{await g()}catch(pe){A(pe.message)}},pe=>{N(),A(pe.message)})},Gr=(o,g)=>{Ft[g.id]===void 0&&Ne({title:o==="remove"?"\u5220\u9664\u5BB9\u5668":o==="stop"?"\u505C\u6B62\u5BB9\u5668":o==="start"?"\u542F\u52A8\u5BB9\u5668":"\u91CD\u542F\u5BB9\u5668",text:o==="remove"?`\u786E\u5B9A\u5220\u9664\u5BB9\u5668 ${g.name}\uFF1F\u5BB9\u5668\u7684\u53EF\u5199\u5C42\u4E0E\u914D\u7F6E\u4F1A\u88AB\u5220\u9664\uFF08\u547D\u540D\u6570\u636E\u5377\u4FDD\u7559\uFF09\uFF0C\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002`:`\u786E\u5B9A\u5BF9\u5BB9\u5668 ${g.name} \u6267\u884C${o==="stop"?"\u505C\u6B62":o==="start"?"\u542F\u52A8":"\u91CD\u542F"}\u64CD\u4F5C\uFF1F`,confirmLabel:o==="remove"?"\u5220\u9664":"\u786E\u5B9A",run:()=>bt(async()=>{qe(N=>({...N,[g.id]:o}));try{let N=await Z.action(s,o,g.id);ie(`${N.result.action} ${g.name}\uFF1A${N.result.message}`)}catch(N){throw ra(g.id),N}},async()=>{try{await mt()}finally{ra(g.id)}})})},Kr=o=>{let g=on(o);Ne({title:"\u5220\u9664\u955C\u50CF",text:"\u786E\u5B9A\u5220\u9664\u955C\u50CF "+g+"\uFF1F\u955C\u50CF\u88AB\u5BB9\u5668\u6216\u5B50\u955C\u50CF\u5F15\u7528\u65F6\u4F1A\u5931\u8D25\uFF1B\u5220\u9664\u540E\u9700\u8981\u91CD\u65B0\u62C9\u53D6\u6216\u6784\u5EFA\u624D\u80FD\u6062\u590D\uFF0C\u4E14\u4E0D\u53EF\u64A4\u9500\u3002",confirmLabel:"\u5220\u9664",run:()=>bt(async()=>{let N=await Z.imageRemove(s,g);ie("\u5DF2\u5220\u9664 "+g+"\uFF1A"+N.result.message),Y!==null&&on(Y)===g&&G(null),await ft()})})},Wr=()=>{Ne({title:"\u6E05\u7406 dangling \u955C\u50CF",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u65E0\u6807\u7B7E\uFF08<none>:<none>\uFF09\u7684\u955C\u50CF\u5C42\uFF0C\u91CA\u653E\u78C1\u76D8\u7A7A\u95F4\uFF1B\u4E0D\u4F1A\u5220\u9664\u6709 tag \u7684\u955C\u50CF\u3002",confirmLabel:"\u6E05\u7406",run:()=>bt(async()=>{let o=await Z.imagePrune(s),g=String(o.result.message).trim().split(`
`).filter(N=>N!=="");ie("\u5DF2\u6E05\u7406 dangling \u955C\u50CF\uFF1A"+(g.length===0?"ok":g[g.length-1])),await ft()})})},Jr=()=>{Ne({title:"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u7F51\u7EDC",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u6CA1\u6709\u5BB9\u5668\u63A5\u5165\u7684\u7F51\u7EDC\u3002compose \u521B\u5EFA\u7684\u9879\u76EE\u7F51\u7EDC\u4E5F\u5728\u5176\u4E2D\uFF08\u4E0B\u6B21 up \u4F1A\u91CD\u5EFA\uFF09\uFF0C\u4F46\u6B63\u5728\u8DD1\u7684\u9879\u76EE\u4F1A\u77ED\u6682\u5931\u53BB\u7F51\u7EDC\u3002",confirmLabel:"\u6E05\u7406",run:()=>bt(async()=>{let o=await Z.networkPrune(s),g=String(o.result.message).trim().split(`
`).filter(N=>N!=="");ie("\u5DF2\u6E05\u7406\u672A\u4F7F\u7528\u7F51\u7EDC\uFF1A"+(g.length===0?"ok":g[g.length-1])),await Gt()})})},Ur=()=>{Ne({title:"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u5377",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u6CA1\u6709\u88AB\u5BB9\u5668\u4F7F\u7528\u7684\u5377\u2014\u2014\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u5220\u9664\u4E14\u4E0D\u53EF\u6062\u590D\u3002docker \u2265 23 \u53EA\u5220\u533F\u540D\u5377\uFF08\u4E0D\u5E26 --all\uFF09\uFF0C\u66F4\u8001\u7684\u7248\u672C\u4F1A\u8FDE\u547D\u540D\u5377\u4E00\u8D77\u5220\uFF1B\u6267\u884C\u524D\u8BF7\u786E\u8BA4\u6CA1\u6709\u9700\u8981\u4FDD\u7559\u7684\u6570\u636E\u5377\u3002",confirmLabel:"\u6E05\u7406",run:()=>bt(async()=>{let o=await Z.volumePrune(s),g=String(o.result.message).trim().split(`
`).filter(N=>N!=="");ie("\u5DF2\u6E05\u7406\u672A\u4F7F\u7528\u5377\uFF1A"+(g.length===0?"ok":g[g.length-1])),await Kt()})})},oa=(o,g)=>N=>{o(),ie(N),g()},Jt=Ke===null?null:B.find(o=>o.id===Ke.id)??Ke.item,Ye=B.filter(o=>{if(rt==="running"&&!(o.state==="running"||o.state==="paused"||o.state==="restarting")||rt==="stopped"&&o.state==="running"||rt==="unhealthy"&&o.health!=="unhealthy")return!1;let g=Ce.trim().toLowerCase();return g===""?!0:o.name.toLowerCase().includes(g)||o.image.toLowerCase().includes(g)||o.id.toLowerCase().includes(g)}),vn=C.filter(o=>{let g=Vt.trim().toLowerCase();return g===""||o.reference.toLowerCase().includes(g)||o.id.toLowerCase().includes(g)}),bn=p.filter(o=>{let g=x.trim().toLowerCase();return g===""||o.name.toLowerCase().includes(g)||o.driver.toLowerCase().includes(g)||o.id.toLowerCase().includes(g)}),_n=S.filter(o=>{let g=w.trim().toLowerCase();return g===""||o.name.toLowerCase().includes(g)||o.driver.toLowerCase().includes(g)||o.mountpoint.toLowerCase().includes(g)}),qr=()=>i("div",{className:"dk_switchPill",title:"\u6B63\u5728\u5207\u6362\u5230 "+s+ia(s)+"\u3002\u4E0B\u9762\u4ECD\u662F "+D+ia(D)+"\u7684\u6570\u636E\uFF0C\u5207\u6362\u5B8C\u6210\u524D\u4E0D\u53EF\u64CD\u4F5C\u3002",children:[e("span",{className:"dk_spin dk_spinSm"}),i("span",{className:"dk_switchText",children:[e("span",{children:"\u6B63\u5728\u5207\u6362\u5230"}),e("strong",{children:s}),e("span",{className:"dk_switchDot",children:"\xB7"}),i("span",{className:"dk_switchSub",children:[e("span",{children:"\u5F53\u524D\u663E\u793A\uFF1A"}),e("span",{className:"dk_switchName",children:D})]})]})]},"switchPill"),ia=o=>{let g=a.find(pe=>pe.name===o),N=g===void 0||typeof g.label!="string"?"":g.label;return N===""||N===o?"":"\uFF08"+N+"\uFF09"},la=D!==""&&D!==s&&!_,Me=o=>{let g=a.find(N=>N.name===o);return g===void 0||g.label===void 0?o:o+" \xB7 "+g.label},_t=()=>Se?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):s===""?_?i("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u4E0D\u662F Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u6309\u4E0A\u9762\u7684\u63D0\u793A\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761\u76EE\u6807\uFF08\u63A8\u8350\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u3002\u4E3A\u907F\u514D\u5F20\u51A0\u674E\u6234\uFF0C\u9762\u677F\u4E0D\u4F1A\u81EA\u52A8\u5207\u5230\u5176\u4ED6\u76EE\u6807\u3002"})]}):i("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD8\u6CA1\u6709\u914D\u7F6E Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u4E2A\u76EE\u6807\uFF1A\u672C\u673A\u76F4\u63A5\u9009\u300C\u672C\u673A\u300D\uFF1B\u8FDC\u7A0B\u4E3B\u673A\u53EF\u4EE5\u5F15\u7528 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\u3002"})]}):ae!==""&&B.length===0?i("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD9\u4E2A\u76EE\u6807\u7684\u6570\u636E\u6CA1\u8BFB\u5230"}),e("div",{className:"dk_emptyHint",children:"\u4E0A\u9762\u7684\u9519\u8BEF\u6761\u91CC\u6709\u539F\u56E0\uFF08\u76EE\u6807\u4E0D\u53EF\u8FBE / docker \u672A\u8FD0\u884C / \u6743\u9650\u4E0D\u8DB3\uFF09\u3002\u4FEE\u597D\u540E\u70B9\u53F3\u4E0A\u89D2\u5237\u65B0\u5373\u53EF\u3002"})]}):i("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:m==="images"?"\u6CA1\u6709\u955C\u50CF":m==="compose"?"\u6CA1\u6709 Compose \u9879\u76EE":m==="networks"?"\u6CA1\u6709\u7F51\u7EDC":m==="volumes"?"\u6CA1\u6709\u5377":"\u6CA1\u6709\u5BB9\u5668"}),e("div",{className:"dk_emptyHint",children:Ce.trim()===""?"\u76EE\u6807\u4E0A\u6CA1\u6709\u5339\u914D\u7684\u6570\u636E\uFF0C\u6216\u7B5B\u9009\u6761\u4EF6\u8FC7\u7A84\u3002":"\u6CA1\u6709\u5339\u914D\u300C"+Ce.trim()+"\u300D\u7684\u7ED3\u679C\u3002"})]}),Yr=()=>{if(m==="overview")return Dn(Oa(E),{onOpenTarget:jr,onOpenContainer:zr});if(m==="images")return i("div",{className:"dk_imagesView",children:[vn.length===0?_t():e("div",{className:"dk_tableWrap",children:i("table",{className:"dk_images",children:[e("thead",{children:i("tr",{children:[e("th",{children:"\u955C\u50CF"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"ID"}),e("th",{className:"dk_colActions",children:"\u64CD\u4F5C"})]})}),e("tbody",{children:vn.map(o=>i("tr",{children:[e("td",{className:"dk_mono",title:o.reference,children:o.dangling?"<none>\uFF08dangling\uFF09":o.reference}),e("td",{children:o.sizeText===""?o.size===null?"\u2014":$t(o.size):o.sizeText}),e("td",{children:o.createdSince}),e("td",{className:"dk_mono",children:o.shortId}),e("td",{className:"dk_colActions",children:i("div",{className:"dk_rowActions",children:[e($,{icon:fo,title:"\u67E5\u770B\u955C\u50CF\u8BE6\u60C5\uFF08\u5C42 / \u6784\u5EFA\u5386\u53F2\uFF09",onClick:()=>G(o)},"inspect"),e($,{icon:Qt,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u5220\u9664\u955C\u50CF\uFF08\u4E0D\u53EF\u6062\u590D\uFF09":"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>Kr(o)},"remove")]})},"actions")]},o.id+o.reference))})]})})]});if(m==="compose"){let o=ln(Ye);return o.length===0?_t():e(hr,{groups:o,onOpen:g=>Ee({project:g})})}return m==="networks"?i("div",{className:"dk_imagesView",children:[bn.length===0?_t():e("div",{className:"dk_tableWrap",children:i("table",{className:"dk_images",children:[e("thead",{children:i("tr",{children:[e("th",{children:"\u540D\u79F0"}),e("th",{children:"\u9A71\u52A8"}),e("th",{children:"\u8303\u56F4"}),e("th",{children:"\u5C5E\u6027"}),e("th",{children:"ID"})]})}),e("tbody",{children:bn.map(o=>i("tr",{className:"dk_rowClickable",onClick:()=>xe(o),title:"\u67E5\u770B\u7F51\u7EDC\u8BE6\u60C5",children:[e("td",{className:"dk_mono",title:o.name,children:o.name}),e("td",{children:o.driver===""?"\u2014":o.driver}),e("td",{children:o.scope===""?"\u2014":o.scope}),e("td",{children:o.internal?e("span",{className:"dk_badge","data-state":"paused",children:"internal"}):"\u2014"}),e("td",{className:"dk_mono",title:o.id,children:o.shortId})]},o.id+o.name))})]})})]}):m==="volumes"?i("div",{className:"dk_imagesView",children:[_n.length===0?_t():e("div",{className:"dk_tableWrap",children:i("table",{className:"dk_images",children:[e("thead",{children:i("tr",{children:[e("th",{children:"\u540D\u79F0"}),e("th",{children:"\u9A71\u52A8"}),e("th",{children:"\u8303\u56F4"}),e("th",{children:"\u6302\u8F7D\u70B9"})]})}),e("tbody",{children:_n.map(o=>i("tr",{className:"dk_rowClickable",onClick:()=>De(o),title:"\u67E5\u770B\u5377\u8BE6\u60C5",children:[e("td",{className:"dk_mono",title:o.name,children:o.name}),e("td",{children:o.driver===""?"\u2014":o.driver}),e("td",{children:o.scope===""?"\u2014":o.scope}),e("td",{className:"dk_mono dk_pathCell",title:o.mountpoint,children:o.mountpoint===""?"\u2014":o.mountpoint})]},o.name))})]})})]}):Ye.length===0?_t():e("div",{className:"dk_grid",key:D===""?"first":D,children:Ye.map(o=>e(Ua,{item:o,selected:Ke!==null&&o.id===Ke.id,allowMutations:n?.allowMutations===!0,pickMode:ke,picked:de.includes(o.id),pending:Ft[o.id],onTogglePick:Ar,onOpen:(g,N)=>ze({id:g.id,tab:N,item:g}),onExec:Vr,onAction:Gr,onCopyExec:g=>{navigator.clipboard.writeText("docker exec -it "+g.name+" sh").then(()=>ie("\u5DF2\u590D\u5236\uFF1Adocker exec -it "+g.name+" sh")).catch(()=>ie("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236"))}},o.id))})},Te=t.docked===!0,da=t.carrier==="tab",Xr=n??{pollIntervalSec:5,logTailDefault:200,allowExec:!1,allowMutations:!1,execTimeoutSec:30},yt=La(B,de),$r=wa(yt.length),sa=yt.length>0?yt[0]:null,Zr=Ta(Ye,de,sa,Qe),Qr=o=>{let g=Ca(Ye,de,o,sa,Qe);J(g.ids),g.skipped>0?Ae("\u5DF2\u65B0\u589E "+String(g.added)+" \u4E2A\uFF0C\u53E6\u6709 "+String(g.skipped)+" \u4E2A\u8D85\u51FA\u4E0A\u9650\uFF08\u6700\u591A "+String(Qe)+" \u4E2A\u6D41\uFF09\u672A\u9009"):g.added===0?Ae("\u6CA1\u6709\u53EF\u65B0\u589E\u7684\u5BB9\u5668\uFF08\u5DF2\u88AB\u52FE\u9009\u6216\u4E0D\u5728\u5F53\u524D\u7B5B\u9009\u7ED3\u679C\u91CC\uFF09"):Ae("\u5DF2\u65B0\u589E "+String(g.added)+" \u4E2A")},eo=me===null?[]:ln(B).find(o=>o.project===me.project)?.items??[],ca=Jt!==null?e(lr,{item:Jt,target:s,targetLabel:Me(s),config:Xr,initialTab:Ke.tab,refreshToken:At,onBack:()=>ze(null),onRefresh:Dr,onClose:Ge,docked:Te},"detail"):Y!==null?e(dr,{item:C.find(o=>o.id===Y.id)??Y,target:s,targetLabel:Me(s),onBack:()=>G(null),onClose:Ge,docked:Te},"imageDetail"):nt?e(gr,{target:s,targetLabel:Me(s),allowMutations:n?.allowMutations===!0,onBack:()=>Pe(!1),onDone:ft,onClose:Ge,docked:Te},"pull"):me!==null?e(pr,{project:me.project,items:eo,target:s,targetLabel:Me(s),onBack:()=>Ee(null),onClose:Ge,docked:Te},"composeDetail"):be?e(xr,{items:yt,target:s,targetLabel:Me(s),onBack:Ie,onClose:Ge,docked:Te},"aggregate"):ne!==null?e(sr,{item:ne,target:s,targetLabel:Me(s),allowMutations:n?.allowMutations===!0,onBack:()=>xe(null),onRemoved:oa(()=>xe(null),Gt),onClose:Ge,docked:Te},"networkDetail"):ve!==null?e(cr,{item:ve,target:s,targetLabel:Me(s),allowMutations:n?.allowMutations===!0,onBack:()=>De(null),onRemoved:oa(()=>De(null),Kt),onClose:Ge,docked:Te},"volumeDetail"):null,to=[ca!==null?[ca,_e===null?null:e(lt,{title:_e.title,text:_e.text,confirmLabel:_e.confirmLabel,busy:zt,onCancel:()=>Ne(null),onConfirm:_e.run},"confirm")]:[Te?null:i("div",{className:"dk_header",children:[e("span",{className:"dk_titleIcon",dangerouslySetInnerHTML:{__html:ba}}),e("span",{className:"dk_title",children:"Docker \u5BB9\u5668"}),n?.allowMutations===!0?null:e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"}),e("span",{className:"dk_headerSpacer"}),Jt!==null?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":Se?"1":void 0,onClick:vt,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:$e}})}),e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:Ge,children:e("span",{dangerouslySetInnerHTML:{__html:Be}})})]}),Jt!==null?null:i("div",{className:"dk_toolbar",children:[e("select",{className:"dk_select",value:m==="overview"?"":s,onChange:o=>{f(o.target.value),A(""),y("containers"),ze(null),Ie(),qe({}),t.onTargetChange?.(Me(o.target.value))},children:[...m==="overview"?[e("option",{value:"",children:"\uFF08\u603B\u89C8 \xB7 \u5168\u90E8\u76EE\u6807\uFF09"},"__overview")]:s===""?[e("option",{value:"",children:"\uFF08\u672A\u9009\u62E9\u76EE\u6807\uFF09"},"__none")]:[],...(a.length===0&&s!==""?[{name:s,label:void 0}]:a).map(o=>e("option",{value:o.name,children:Me(o.name)},o.name))]}),a.length<2?null:e("button",{type:"button",className:"dk_pill dk_pillOverview","data-on":m==="overview"?"1":"0",title:m==="overview"?"\u9000\u51FA\u603B\u89C8\uFF0C\u56DE\u5230\u5F53\u524D\u76EE\u6807\u7684\u5BB9\u5668\u5217\u8868":"\u4E0D\u9009\u76EE\u6807\uFF0C\u4E00\u5C4F\u770B\u5168\u90E8\u76EE\u6807\u7684\u5BB9\u5668\u6982\u51B5\uFF08\u53EA\u8BFB\uFF09",onClick:()=>{if(m!=="overview"){y("overview"),A(""),ze(null),Ie();return}y("containers"),ze(null),Ie()},children:"\u603B\u89C8"}),e("div",{className:"dk_seg",children:[["containers","\u5BB9\u5668"],["images","\u955C\u50CF"],["compose","Compose"],["networks","\u7F51\u7EDC"],["volumes","\u5377"]].map(([o,g])=>e("button",{type:"button",className:"dk_segBtn","data-on":m===o?"1":"0",onClick:()=>{y(o),ze(null),G(null),Ee(null),xe(null),De(null),Pe(!1),Ie()},children:g},o))}),m==="containers"?e("button",{type:"button",className:"dk_pill dk_pillPick","data-on":ke?"1":"0",title:ke?"\u9000\u51FA\u9009\u62E9\u5E76\u6E05\u7A7A\u52FE\u9009\uFF08Esc\uFF09":"\u591A\u9009\u5BB9\u5668\uFF0C\u628A\u5B83\u4EEC\u7684\u65E5\u5FD7\u4E34\u65F6\u805A\u5408\u6210\u4E00\u6761\u6D41",onClick:Pr,children:ke?"\u9000\u51FA\u9009\u62E9":"\u805A\u5408\u9009\u62E9"}):null,m==="containers"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u540D\u79F0 / \u955C\u50CF / ID",value:Ce,onChange:o=>at(o.target.value)}):null,m==="compose"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u9879\u76EE / \u670D\u52A1 / \u5BB9\u5668",value:Ce,onChange:o=>at(o.target.value)}):null,m==="images"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u955C\u50CF\uFF08\u4ED3\u5E93 / \u6807\u7B7E / ID\uFF09",value:Vt,onChange:o=>hn(o.target.value)}):null,m==="images"?e("span",{className:"dk_hint dk_searchCount",children:String(vn.length)+" / "+String(C.length)+" \u4E2A\u955C\u50CF"}):null,m==="images"?e($,{icon:mo,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u62C9\u53D6\u955C\u50CF\uFF08docker pull\uFF0C\u9010\u5C42\u5B9E\u65F6\u8FDB\u5EA6\uFF09":"\u62C9\u53D6\u955C\u50CF\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>Pe(!0)},"pull"):null,m==="images"?e($,{icon:Sn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u6E05\u7406 dangling\uFF08\u65E0\u6807\u7B7E\uFF09\u955C\u50CF":"\u6E05\u7406 dangling \u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:Wr},"prune"):null,m==="networks"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u7F51\u7EDC\uFF08\u540D\u79F0 / \u9A71\u52A8 / ID\uFF09",value:x,onChange:o=>O(o.target.value)}):null,m==="volumes"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u5377\uFF08\u540D\u79F0 / \u9A71\u52A8 / \u6302\u8F7D\u70B9\uFF09",value:w,onChange:o=>z(o.target.value)}):null,m==="networks"?e("span",{className:"dk_hint dk_searchCount",children:String(bn.length)+" / "+String(p.length)+" \u4E2A\u7F51\u7EDC"}):null,m==="volumes"?e("span",{className:"dk_hint dk_searchCount",children:String(_n.length)+" / "+String(S.length)+" \u4E2A\u5377"}):null,m==="networks"?e($,{icon:Sn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u7F51\u7EDC\uFF08docker network prune\uFF09":"\u6E05\u7406\u7F51\u7EDC\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:Jr},"prune"):null,m==="volumes"?e($,{icon:Sn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u5377\uFF08docker volume prune\uFF0C\u4F1A\u5220\u6570\u636E\uFF09":"\u6E05\u7406\u5377\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:Ur},"prune"):null,m==="compose"?e("span",{className:"dk_hint dk_searchCount",children:String(ln(Ye).length)+" \u4E2A\u9879\u76EE \xB7 "+String(Ye.length)+" \u4E2A\u5BB9\u5668"}):null,m==="containers"?e("div",{className:"dk_seg",children:[["all","\u5168\u90E8"],["running","\u8FD0\u884C\u4E2D"],["stopped","\u5DF2\u505C\u6B62"],["unhealthy","\u4E0D\u5065\u5EB7"]].map(([o,g])=>e("button",{type:"button",className:"dk_segBtn","data-on":rt===o?"1":"0",onClick:()=>je(o),children:g},o))}):null,m==="containers"||m==="compose"||m==="overview"?i("div",{className:"dk_toolbarToggles",children:[m==="containers"||m==="compose"?e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:ge,onChange:o=>Oe(o.target.checked)}),"\u542B\u5DF2\u505C\u6B62"]},"all"):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:ot,onChange:o=>Rt(o.target.checked)}),"\u81EA\u52A8\u5237\u65B0"]},"auto")]}):null,Te?i("div",{className:"dk_toolbarEnd",children:[n?.allowMutations!==!0?e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"},"readonly"):null,e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":Se?"1":void 0,onClick:vt,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:$e}})},"refresh")]}):null]}),m==="containers"&&ke?e(yr,{count:yt.length,info:$r,presets:Zr,notice:te,onPreset:Qr,onClear:()=>{J([]),Ae("")},onRun:()=>we(!0),onCancel:Ie},"pickBar"):null,i("div",{className:"dk_body","data-stale":la?"1":void 0,children:[la?e("div",{className:"dk_switchOverlay",children:qr()},"stale"):null,i("div",{className:"dk_main"+(m==="images"||m==="networks"||m==="volumes"||m==="overview"?" dk_mainImages":""),children:[ae===""||m==="overview"?null:e(X,{title:"\u64CD\u4F5C\u5931\u8D25",hint:ae}),fe===""?null:e(X,{kind:"info",title:fe}),t.sessionHint===void 0?null:e(X,{kind:"info",title:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u6CA1\u914D\u7F6E\u4E3A Docker \u76EE\u6807",hint:"\u4F1A\u8BDD\u4E3B\u673A\uFF1A"+t.sessionHint.host+(t.sessionHint.port===22?"":":"+String(t.sessionHint.port))+(t.sessionHint.book===""?"":"\uFF08\u8FDE\u63A5\u7C3F\uFF1A"+t.sessionHint.book+"\uFF09")+" \u2014 \u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761 kind=ssh \u76EE\u6807"+(t.sessionHint.book===""?"\uFF08\u586B host/username\uFF0C\u6216\u7528\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09":"\uFF0C\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\u300C"+t.sessionHint.book+"\u300D")+"\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u5373\u53EF\u3002"}),n!==null&&n.allowMutations!==!0?e(X,{kind:"info",title:"\u5F53\u524D\u4E3A\u53EA\u8BFB\u6A21\u5F0F",hint:"\u5BB9\u5668\u7684\u542F\u52A8 / \u505C\u6B62 / \u91CD\u542F / \u5220\u9664\uFF0C\u4EE5\u53CA\u955C\u50CF\u3001\u7F51\u7EDC\u3001\u5377\u7684\u5220\u9664\u4E0E\u6E05\u7406\uFF0C\u90FD\u9700\u8981\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u3002"}):null,m==="containers"?e(_r,{events:Bt,status:Ve,statusText:Fr(),open:Dt,onToggle:()=>gn(o=>!o)},"activity"):null,Yr()]})]}),_e===null?null:e(lt,{title:_e.title,text:_e.text,confirmLabel:_e.confirmLabel,busy:zt,onCancel:()=>Ne(null),onConfirm:_e.run})],se===null?null:e(wr,{label:se.label,hostRef:F,collapsed:V,height:We,onToggleCollapse:()=>ue(o=>!o),onResizeStart:Br,onClose:()=>W(null)},"execDrawer"),Rr&&se!==null?e(lt,{title:"\u7ED3\u675F\u5BB9\u5668\u7EC8\u7AEF\u4F1A\u8BDD",text:"\u5173\u95ED\u9762\u677F\u4F1A\u7ED3\u675F\u300C"+se.label+"\u300D\u7684\u7EC8\u7AEF\u4F1A\u8BDD\uFF08docker exec -it \u2026\uFF09\u3002\u82E5\u53EA\u662F\u60F3\u7ED9\u65E5\u5FD7 / \u5217\u8868\u817E\u5730\u65B9\uFF0C\u5148\u70B9\u62BD\u5C49\u53F3\u4E0A\u89D2\u7684\u6298\u53E0\u6309\u94AE\u5373\u53EF\uFF0C\u4F1A\u8BDD\u4F1A\u4FDD\u6301\u8FD0\u884C\u3002",confirmLabel:"\u7ED3\u675F\u5E76\u5173\u95ED",onCancel:()=>pn(!1),onConfirm:()=>{pn(!1),t.onClose()}},"closeConfirm"):null],ua=i("div",{className:"dk_panel"+(Te?" dk_panelDock":da?" dk_panelTab":""),"data-dock":Te?"1":void 0,ref:aa,onMouseDown:o=>o.stopPropagation(),children:to});return Te||da?ua:i("div",{className:"dk_backdrop",onMouseDown:o=>{mn.current=o.target===o.currentTarget},onMouseUp:o=>{let g=mn.current&&o.target===o.currentTarget;mn.current=!1,g&&Ge()},children:[ua]})}function Nr(t){let n=null;try{n=t.useTabInfo()}catch{}return e(un,{carrier:"tab",onClose:()=>{try{n?.tab?.actions?.close?.()}catch{}}})}function Sr(){let[t,n]=k(!1),[r,a]=k(null),[c,d]=k(!1),[h,s]=k(!1),[f,_]=k({kind:"",text:""}),m=P(0),y=le(()=>{Z.config().then(p=>{a(p.config),wn(p.config),m.current=Array.isArray(p.config?.targets)?p.config.targets.length:0,d(!0)}).catch(p=>{_({kind:"error",text:"\u8BFB\u53D6\u914D\u7F6E\u5931\u8D25\uFF1A"+p.message}),d(!0)})},[]);L(()=>{t&&!c&&y()},[t,c,y]);let B=p=>a(v=>({...v,...p})),M=(p,v)=>a(S=>{let q=S.targets.slice();return q[p]={...q[p],...v},{...S,targets:q}}),D=()=>a(p=>({...p,targets:[...p.targets,{name:"\u76EE\u6807"+String(p.targets.length+1),kind:"local",book:"",host:"",port:22,username:"",auth:"agent",keyPath:"",agentForward:!1,passwordSet:!1,passphraseSet:!1}]})),U=p=>a(v=>({...v,targets:v.targets.filter((S,q)=>q!==p)})),b=p=>a(v=>({...v,hostKeys:v.hostKeys.filter(S=>!(S.host===p.host&&S.port===p.port))})),I=()=>{s(!0),_({kind:"",text:""});let p={enabled:r.enabled,announceToAgent:r.announceToAgent,dockerBin:r.dockerBin,allowMutations:r.allowMutations,allowExec:r.allowExec,execTimeoutSec:r.execTimeoutSec,pollIntervalSec:r.pollIntervalSec,logTailDefault:r.logTailDefault,maxOutputKb:r.maxOutputKb,targets:r.targets.map(v=>({name:v.name,kind:v.kind,book:v.book??"",host:v.host??"",port:Number(v.port)||22,username:v.username??"",auth:v.auth??"agent",keyPath:v.keyPath??"",...v.password===void 0||v.password===""?{}:{password:v.password},...v.passphrase===void 0||v.passphrase===""?{}:{passphrase:v.passphrase},agentForward:v.agentForward===!0})),hostKeys:r.hostKeys,...r.targets.length===0&&m.current>0?{clearTargets:!0}:{}};Z.saveConfig(p).then(v=>{a(v.config),wn(v.config),m.current=Array.isArray(v.config?.targets)?v.config.targets.length:0,en(),_(v.warning===void 0?{kind:"ok",text:"\u5DF2\u4FDD\u5B58\u5E76\u70ED\u751F\u6548"}:{kind:"error",text:v.warning})}).catch(v=>{_({kind:"error",text:"\u4FDD\u5B58\u5931\u8D25\uFF1A"+v.message})}).finally(()=>s(!1))},E=p=>e("div",{className:"dk_cardSection",children:p}),j=(p,v,S,q)=>i("div",{className:"dk_field","data-span":q===void 0?void 0:String(q),children:[e("span",{className:"dk_label",children:p}),v,S===void 0?null:e("span",{className:"dk_hint",children:S})]}),C=(p,v,S,q)=>e("input",{className:"dk_input",type:"number",min:v,max:S,value:r[p],onChange:Y=>B({[p]:Number(Y.target.value)})}),Q=p=>i("li",{className:"dk_settingsCard"+(t?" dk_settingsCardOpen":""),children:[i("button",{type:"button",className:"dk_settingsHead","aria-expanded":t,onClick:()=>n(v=>!v),children:[i("span",{className:"dk_settingsHeadText",children:[e("span",{className:"dk_settingsName",children:"Docker \u5BB9\u5668\u9762\u677F"}),e("span",{className:"dk_settingsDesc",children:"\u672C\u673A / SSH \u4E3B\u673A\u4E0A\u7684\u5BB9\u5668\u4E0E\u955C\u50CF\uFF1B\u9ED8\u8BA4\u53EA\u8BFB\uFF0C\u53D8\u66F4\u64CD\u4F5C\u9700\u663E\u5F0F\u5F00\u542F"})]}),e("span",{className:"dshkit_badge",children:"Kit"}),e("span",{className:"dk_settingsChevron",dangerouslySetInnerHTML:{__html:Nn}})]}),t?e("div",{className:"dk_settingsBody",children:p}):null]});return Q(t?!c||r===null?i("div",{className:"dk_row",children:[e("span",{className:"dk_spin"}),"\u8BFB\u53D6\u914D\u7F6E\u2026"]}):[E("\u57FA\u672C"),i("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:r.enabled,onChange:p=>B({enabled:p.target.checked})}),"\u542F\u7528\u63D2\u4EF6"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:r.announceToAgent,onChange:p=>B({announceToAgent:p.target.checked})}),"\u5411 agent \u516C\u544A\u80FD\u529B"]})]}),i("div",{className:"dk_fieldGrid",children:[j("docker CLI",e("input",{className:"dk_input",value:r.dockerBin,onChange:p=>B({dockerBin:p.target.value})}),"\u9ED8\u8BA4 docker\uFF1Bpodman \u53EF\u586B podman"),j("\u7EDF\u8BA1\u5237\u65B0\u95F4\u9694\uFF08\u79D2\uFF09",C("pollIntervalSec",1,60)),j("\u65E5\u5FD7\u9ED8\u8BA4\u884C\u6570",C("logTailDefault",1,5e3)),j("\u8F93\u51FA\u4E0A\u9650\uFF08KB\uFF09",C("maxOutputKb",1,8192)),j("exec \u8D85\u65F6\uFF08\u79D2\uFF09",C("execTimeoutSec",1,120))]}),E("\u80FD\u529B\u5F00\u5173\uFF08\u9ED8\u8BA4\u5173\u95ED\uFF09"),i("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:r.allowMutations,onChange:p=>B({allowMutations:p.target.checked})}),"\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\uFF08\u5BB9\u5668\u542F\u505C\u5220\u3001\u955C\u50CF\u62C9\u53D6 / \u5220\u9664 / \u6E05\u7406\uFF09"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:r.allowExec,onChange:p=>B({allowExec:p.target.checked})}),"\u5141\u8BB8 exec\uFF08\u5728\u5BB9\u5668\u5185\u6267\u884C\u547D\u4EE4\uFF09"]})]}),e("span",{className:"dk_hint",children:"docker socket \u7B49\u4EF7\u4E8E\u76EE\u6807\u4E3B\u673A\u7684 root \u6743\u9650\u3002\u5F00\u542F\u540E\uFF0C\u6D4F\u89C8\u5668\u9762\u677F\u4E0E agent \u90FD\u80FD\u6267\u884C\u5BF9\u5E94\u64CD\u4F5C\uFF0C\u8BF7\u53EA\u5728\u53EF\u4FE1\u73AF\u5883\u4E0B\u6253\u5F00\u3002"}),E("\u76EE\u6807"),...r.targets.map((p,v)=>i("div",{className:"dk_targetRow",children:[e("input",{className:"dk_input",value:p.name,placeholder:"\u76EE\u6807\u540D",onChange:S=>M(v,{name:S.target.value})}),e("select",{className:"dk_select",value:p.kind,onChange:S=>M(v,{kind:S.target.value}),children:[e("option",{value:"local",children:"\u672C\u673A"}),e("option",{value:"ssh",children:"SSH \u4E3B\u673A"})]}),p.kind==="local"?e("span",{className:"dk_hint",children:"\u5BBF\u4E3B\u6240\u5728\u673A\u5668\u4E0A\u7684 docker"}):i("div",{className:"dk_row",style:{gridColumn:"span 1"},children:[e("select",{className:"dk_select",value:p.book??"",onChange:S=>M(v,{book:S.target.value}),children:[e("option",{value:"",children:r.ttyBooks.length===0?"\uFF08\u65E0 tty \u8FDE\u63A5\u7C3F\uFF0C\u8BF7\u586B\u5185\u8054\u4FE1\u606F\uFF09":"\uFF08\u4E0D\u7528\u8FDE\u63A5\u7C3F\uFF0C\u624B\u586B\uFF09"}),...r.ttyBooks.map(S=>e("option",{value:S,children:"\u8FDE\u63A5\u7C3F\uFF1A"+S},S))]})]}),e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:()=>U(v),children:"\u5220\u9664"}),p.kind==="ssh"&&(p.book??"")===""?i("div",{className:"dk_targetInline",children:[e("input",{className:"dk_input",placeholder:"host",value:p.host??"",onChange:S=>M(v,{host:S.target.value})}),e("input",{className:"dk_input",placeholder:"22",title:"\u7AEF\u53E3",value:p.port??22,onChange:S=>M(v,{port:Number(S.target.value)||22})}),e("input",{className:"dk_input",placeholder:"username",value:p.username??"",onChange:S=>M(v,{username:S.target.value})}),e("select",{className:"dk_select",value:p.auth??"agent",onChange:S=>M(v,{auth:S.target.value}),children:[e("option",{value:"agent",children:"ssh-agent"}),e("option",{value:"key",children:"\u79C1\u94A5"}),e("option",{value:"password",children:"\u5BC6\u7801"})]}),(p.auth??"agent")==="key"?e("input",{className:"dk_input dk_credential",placeholder:"~/.ssh/id_ed25519",value:p.keyPath??"",onChange:S=>M(v,{keyPath:S.target.value})}):null,(p.auth??"agent")==="password"?e("input",{className:"dk_input dk_credential",type:"password",placeholder:p.passwordSet===!0?"\uFF08\u5DF2\u8BBE\u7F6E\uFF0C\u7559\u7A7A\u4FDD\u6301\u4E0D\u53D8\uFF09":"env:SSH_PASSWORD",value:p.password??"",onChange:S=>M(v,{password:S.target.value})}):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:p.agentForward===!0,onChange:S=>M(v,{agentForward:S.target.checked})}),"agent forwarding"]})]}):null]},String(v)+p.name)),i("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn",onClick:D,children:"\u6DFB\u52A0\u76EE\u6807"}),e("span",{className:"dk_hint",children:"SSH \u76EE\u6807\u63A8\u8350\u76F4\u63A5\u9009 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF08\u51ED\u8BC1\u53EA\u9700\u7EF4\u62A4\u4E00\u5904\uFF09\uFF1B\u624B\u586B\u65F6\u5BC6\u7801 / \u53E3\u4EE4\u5EFA\u8BAE\u5199 env:VAR\u3002"})]}),E("SSH \u4E3B\u673A\u5BC6\u94A5\u8BB0\u5F55\uFF08TOFU\uFF09"),...r.hostKeys.length===0?[e("span",{className:"dk_hint",children:"\u6682\u65E0\u8BB0\u5F55 \u2014 \u9996\u6B21 SSH \u8FDE\u63A5\u6210\u529F\u540E\u81EA\u52A8\u8BB0\u5F55\u4E3B\u673A\u6307\u7EB9\uFF08\u82E5 tty \u5DF2\u8BB0\u5F55\u540C\u4E00\u4E3B\u673A\uFF0C\u4F1A\u76F4\u63A5\u590D\u7528\uFF09\u3002"},"none")]:r.hostKeys.map(p=>i("div",{className:"dk_targetRow",children:[e("span",{children:p.host+":"+String(p.port)}),e("span",{className:"dk_hint",style:{gridColumn:"span 2",wordBreak:"break-all"},children:"sha256:"+p.fingerprint}),e("button",{type:"button",className:"dk_btn",onClick:()=>b(p),children:"\u5220\u9664"})]},p.host+":"+String(p.port))),e("span",{className:"dk_hint",children:"\u6307\u7EB9\u53D8\u66F4\u65F6\u8FDE\u63A5\u4F1A\u88AB\u62D2\u7EDD\uFF08\u9632\u4E2D\u95F4\u4EBA\uFF09\uFF1B\u786E\u8BA4\u5B89\u5168\u540E\u5220\u9664\u5BF9\u5E94\u8BB0\u5F55\u5373\u53EF\u91CD\u8FDE\u3002"}),i("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:h,onClick:I,children:h?"\u4FDD\u5B58\u4E2D\u2026":"\u4FDD\u5B58"}),e("span",{className:"dk_msg","data-kind":f.kind,children:f.text})]})]:null)}let kt=null,tt=null,kn=null;function gt(){let t=tt,n=kt,r=kn;if(tt=null,kt=null,kn=null,n!==null&&n.remove(),t!==null&&setTimeout(()=>{try{t.unmount()}catch{}},0),r!==null)try{r.dispose()}catch{}}function Cr(t){return t!==null&&typeof t=="object"&&typeof t.appendChild=="function"}function Tr(){return typeof Xe?.mountPane=="function"&&typeof Xe.isOpen=="function"&&Number(Xe.version??0)>=1&&Xe.isOpen()===!0}function ta(t){gt(),yn();let n={onClose:gt,initialTarget:t?.target??"",sessionHint:t?.sessionHint};if(Tr()){let r=null;try{r=Xe.mountPane({title:"Docker \u5BB9\u5668",hint:t?.target===void 0||t.target===""?"":t.target,size:520,min:360,onClose:()=>gt()})}catch(a){r=null,console.warn("[dsh-docker] \u6302\u8F7D\u5230\u7EC8\u7AEF\u9762\u677F\u5931\u8D25\uFF0C\u56DE\u9000\u5F39\u7A97\uFF1A"+(a instanceof Error?a.message:String(a)))}if(r!==null&&Cr(r.element)){kn=r,tt=T(r.element),tt.render(e(un,{...n,docked:!0,onTargetChange:a=>{try{r.setHint(a)}catch{}}}));return}}kt=document.createElement("div"),document.body.appendChild(kt),tt=T(kt),tt.render(e(un,n))}function Lr(){let t=document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');if(t!==null)return t.querySelector('[class*="logoRow"]')?.parentElement??t.firstElementChild}function Er(t){let n=t.querySelector('button[class*="newSession"]');if(n!==null)return n;for(let r of t.children)if(r.tagName==="BUTTON")return r}function Or(){let t=document.createElement("div");return t.dataset.dshDockerEntry="",t.className="dk_sidebarEntry",t.setAttribute("role","button"),t.setAttribute("aria-label","\u5BB9\u5668"),t.innerHTML='<span class="dk_entryIcon">'+ba+'</span><span class="dk_entryLabel">\u5BB9\u5668</span>',t.addEventListener("click",n=>{n.preventDefault(),ta()}),t}function na(t,n){let r=Er(t);if(r===void 0)return!1;if(n.parentElement!==t){let a=r.closest('[class*="logoRow"]'),c=a!==null&&a.parentElement===t?a:r,d=Array.from(t.children).filter(h=>h instanceof HTMLElement&&h.matches("[data-dsh-global-search-entry], [data-dsh-rss-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-tty-entry], [data-dsh-docker-entry]"));if(d.length>0){let h=d[d.length-1];t.insertBefore(n,h.nextSibling)}else t.insertBefore(n,c.nextElementSibling)}return!0}function Ir(){if(yn(),document.querySelector("[data-dsh-docker-entry]")!==null)return()=>{};let t=Or(),n,r=!1,a=()=>{if(n!==void 0&&!n.isConnected&&(d.disconnect(),n=void 0,r=!1),r){if(document.body.contains(t))return;d.disconnect(),n=void 0,r=!1}n??(n=Lr()),n!==void 0&&(r=na(n,t),r&&d.observe(n,{childList:!0,subtree:!0}))},c=new MutationObserver(()=>{a()});c.observe(document.body,{childList:!0,subtree:!0});let d=new MutationObserver(()=>{if(n===void 0||!n.isConnected){r=!1,a();return}n.contains(t)||(r=na(n,t))});return a(),()=>{c.disconnect(),d.disconnect(),t.remove()}}let Fe={};return Fe.inject=["slots"],Fe.__pick={MAX:Qe,PRESETS:Fa,presetCounts:Ta,apply:Ca,SOFT_MAX:Ha,decide:wa,toggle:Na,reconcile:Sa,items:La},Fe.__events={LIMIT:Ia,RECENT:Ma,DEBOUNCE_MS:Ra,append:Ba,actionText:Pa,timeText:Da,debounce:Aa},Fe.__overview={ERROR_MAX:Ln,counts:Ka,abnormal:En,sortRows:Wa,patch:wt,errorText:Ja,data:Oa,body:Dn},Fe.__listSeq={make:Ea},Fe.__panel={chooseInitialTarget:xn,readLastTarget:fa,writeLastTarget:va,LAST_TARGET_KEY:In},Fe.__aggLogs={mergeBuffered:Qn,WINDOW_MS:dn,splitTs:Yn,levelName:Xn,orderByTs:sn,REORDER_TAIL:cn,reorderTail:Mt,filterByLevel:$n,exportText:Zn},Fe.apply=t=>{yn();let n=!1,r=()=>{};tn={set(d){if(d!==n){if(n=d,d){r=Ir();return}r(),r=()=>{},gt(),typeof Zt?.requestRender=="function"&&Zt.requestRender()}}},ja(!0);let a=t.slots.inject("settings.plugin.item",()=>t.slots.register({name:"settings.plugin.item",key:"docker",order:102},Sr));t.inject(["ttyTerminal"],d=>(Je=d.ttyTerminal??null,()=>{Je=null})),t.inject(["ttyPanel"],d=>(Xe=d.ttyPanel??null,()=>{Xe=null})),t.inject(["sessions"],d=>(ct=d.sessions??null,()=>{ct=null})),t.inject(["sidebarRightTabs","sidebarRight"],d=>{let h=d.sidebarRightTabs.register({id:ha,kind:ao,priority:"extension",title:()=>"Docker \u5BB9\u5668",guide:[{order:90,title:()=>"Docker \u5BB9\u5668",description:()=>"\u672C\u673A\u4E0E SSH \u4E3B\u673A\u7684\u5BB9\u5668\u3001\u955C\u50CF\u3001Compose\u3001\u7F51\u7EDC\u4E0E\u5377"}]}),s=d.slots.inject("sidebar.right.pane.tab",()=>d.slots.register({name:"sidebar.right.pane.tab",key:ha},Nr));return()=>{try{s()}catch{}try{h()}catch{}}});let c=()=>{};return en(),t.inject(["ttyConnbar"],d=>{let h=d.ttyConnbar;h!==void 0&&(Zt=h,c=h.addAction(s=>{if(!nn)return;let f=s?.spec??{};if(f.t!=="ssh")return;let _=typeof s?.bookName=="string"?s.bookName:"",m=Tn(f,_),y=m!==void 0?`\u6253\u5F00\u8BE5\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F\uFF08\u76EE\u6807\uFF1A${m}\uFF09`:Ue===null?"\u6253\u5F00\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F":"\u8BE5\u4E3B\u673A\u5C1A\u672A\u914D\u7F6E\u4E3A Docker \u76EE\u6807 \u2014 \u70B9\u51FB\u6253\u5F00\u9762\u677F\u67E5\u770B/\u914D\u7F6E";s.addAction(so,"\u5BB9\u5668",y,()=>{(async()=>{let B=await lo(f,_),M=Number(f.port);ta({target:B??"",sessionHint:B===void 0?{host:typeof f.host=="string"?f.host:"",port:Number.isInteger(M)&&M>0?M:22,book:_}:void 0})})()})}),(async()=>{for(let s=0;s<3;s+=1){if(await en()){typeof h.requestRender=="function"&&h.requestRender();return}await new Promise(f=>setTimeout(f,2e3))}})())}),()=>{c(),a(),tn=null,nn=!1,Zt=null,r(),gt()}},Fe}});})();
