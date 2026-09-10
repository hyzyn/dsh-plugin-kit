"use strict";(()=>{var He=`/* eslint-disable */
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
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  width: 100%;
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

/* ---- \u4EA4\u4E92\u5F0F\u7EC8\u7AEF\u62BD\u5C49\uFF08ttyTerminal.mount \u5C31\u5730\u5D4C\u5165\uFF0C0.15.0\uFF09 ---- */
.dk_drawer {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  height: min(46%, 380px);
  min-height: 180px;
  border-top: 1px solid var(--dk-border-strong);
  background: var(--dk-surface-2);
  animation: dk_drawerIn var(--dk-dur) var(--dk-ease);
}

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
  transition: background var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease);
}

.dk_iconBtn:hover { background: var(--dk-hover); color: var(--dk-label); }
.dk_iconBtn:focus-visible { outline: none; box-shadow: var(--dk-ring); }
.dk_iconBtn:disabled { opacity: .45; cursor: not-allowed; }

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

.dk_input { min-width: 180px; }
.dk_select:focus-visible,
.dk_input:focus-visible {
  outline: none;
  border-color: var(--dk-accent);
  box-shadow: var(--dk-ring);
}

.dk_search { flex: 1 1 200px; min-width: 160px; }

.dk_seg {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-2);
}

.dk_segBtn {
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
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--dk-gap-xs) 0;
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


.dk_filterToggle {
  display: inline-flex;
  align-items: center;
  gap: var(--dk-gap-xs);
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dk-label-2);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.dk_filterToggle:hover { color: var(--dk-label); }
.dk_caret { display: inline-flex; transform: rotate(-90deg); transition: transform var(--dk-dur) var(--dk-ease); }
.dk_filterToggle[data-on="1"] .dk_caret { transform: none; }
.dk_filterInput { flex: 1 1 200px; height: var(--dk-h-md); min-width: 0; }
.dk_filterCount { flex: none; color: var(--dk-label-3); font-size: 11px; font-variant-numeric: tabular-nums; }

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

.dk_cardBody {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-lg);
  padding: var(--dk-gap-lg);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-lg);
  background: var(--dk-surface-solid);
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
}

.dk_label { font-size: 12px; color: var(--dk-label-2); }
.dk_hint { font-size: 11px; color: var(--dk-label-3); line-height: 1.6; }
.dk_row { display: flex; align-items: center; gap: var(--dk-gap-md); flex-wrap: wrap; }

.dk_targetRow {
  display: grid;
  grid-template-columns: 1fr 96px 1fr auto;
  gap: var(--dk-gap-sm);
  align-items: center;
  padding: var(--dk-gap-sm);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-2);
}

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
  .dk_targetRow { grid-template-columns: 1fr 1fr; }
  .dk_cardRow { grid-template-columns: 40px 1fr; }
}
`;var ot="/api/dsh-docker",Pe="dsh-docker-style";function Se(){if(document.getElementById(Pe)!==null)return;let l=document.createElement("style");l.id=Pe,l.textContent=He,document.head.appendChild(l)}async function F(l,m){let e=await fetch(ot+l,{...m,headers:{"content-type":"application/json",...m?.headers??{}}}),d=null;try{d=await e.json()}catch{}if(!e.ok){let O=d!==null&&typeof d.error=="string"?d.error:`HTTP ${String(e.status)}`;throw new Error(O)}if(d!==null&&d.ok===!1)throw new Error(typeof d.error=="string"?d.error:"\u8BF7\u6C42\u5931\u8D25");return d}var R={config:()=>F("/config"),saveConfig:l=>F("/config",{method:"POST",body:JSON.stringify(l)}),targets:()=>F("/targets"),probe:l=>F("/probe",{method:"POST",body:JSON.stringify({target:l})}),containers:(l,m)=>F("/containers",{method:"POST",body:JSON.stringify({target:l,all:m})}),inspect:(l,m)=>F("/inspect",{method:"POST",body:JSON.stringify({target:l,id:m})}),logs:(l,m,e)=>F("/logs",{method:"POST",body:JSON.stringify({target:l,id:m,...e})}),stats:(l,m)=>F("/stats",{method:"POST",body:JSON.stringify({target:l,ids:m})}),images:l=>F("/images",{method:"POST",body:JSON.stringify({target:l})}),action:(l,m,e)=>F("/action",{method:"POST",body:JSON.stringify({target:l,action:m,id:e})}),exec:(l,m,e,d)=>F("/exec",{method:"POST",body:JSON.stringify({target:l,id:m,command:e,timeoutSec:d})})};function lt(l){return l==null||!Number.isFinite(l)?"\u2014":l.toFixed(l>=10?1:2)+"%"}function it(l){return l.hostPort===void 0?String(l.containerPort)+"/"+l.protocol:String(l.hostPort)+"\u2192"+String(l.containerPort)+"/"+l.protocol}function ze(l){if(!Array.isArray(l)||l.length===0)return"\u65E0\u7AEF\u53E3\u6620\u5C04";let m=new Set,e=[];for(let d of l){let O=it(d);m.has(O)||(m.add(O),e.push(O))}return e.join("  ")}function st(l){let m=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(l);return m===null?l:m[1]+" "+m[2]}function ct(l){return{running:"\u8FD0\u884C\u4E2D",exited:"\u5DF2\u505C\u6B62",created:"\u5DF2\u521B\u5EFA",paused:"\u5DF2\u6682\u505C",restarting:"\u91CD\u542F\u4E2D",dead:"dead",removing:"\u5220\u9664\u4E2D",unknown:"\u672A\u77E5"}[l]??l}function kt(l,m){let e=new Blob([m],{type:"text/plain;charset=utf-8"}),d=URL.createObjectURL(e),O=document.createElement("a");O.href=d,O.download=l,O.click(),setTimeout(()=>URL.revokeObjectURL(d),1e3)}function je(l){return"docker exec -it '"+String(l).replaceAll("'","'\\''")+"' sh"}var re=null,ie=null,Ie=[],Ue=0;function Te(l){l!==null&&typeof l=="object"&&(ie=l),Ue=Date.now()}async function ve(){try{let[l,m]=await Promise.all([R.config(),R.targets()]);return ie=l.config,Ie=m.targets??[],Ue=Date.now(),!0}catch(l){return console.warn("[dsh-docker] \u76EE\u6807\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(l instanceof Error?l.message:String(l))),!1}}async function ut(l,m){let e=Oe(l,m);return e!==void 0?e:(await ve(),Oe(l,m))}function Oe(l,m){let e=ie!==null&&Array.isArray(ie.targets)?ie.targets:[];if(typeof m=="string"&&m!==""){let C=e.find(K=>K.kind==="ssh"&&K.book===m);if(C!==void 0)return C.name}let d=typeof l?.host=="string"?l.host:"";if(d==="")return;let O=Number(l?.port),h=Number.isInteger(O)&&O>0?O:22;for(let C of Ie){if(C.kind!=="ssh"||typeof C.label!="string")continue;let K=/^([^@]+)@(.+?)(?::(\d+))?$/.exec(C.label);if(K!==null&&K[2]===d&&Number(K[3]??22)===h)return C.name}}var Fe='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',gt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',Le='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',Be='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7"/><path d="M11.5 4.5l-7 7"/></svg>',ht='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.4l7.4 4.6L5 12.6z"/></svg>',pt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.2"/></svg>',mt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',vt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.6h10"/><path d="M6.2 4.6V3.4a.8.8 0 0 1 .8-.8h2a.8.8 0 0 1 .8.8v1.2"/><path d="M4.6 4.6l.6 8a.9.9 0 0 0 .9.8h3.8a.9.9 0 0 0 .9-.8l.6-8"/></svg>';var ft='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v7.2"/><path d="M5 7.4L8 10.4l3-3"/><path d="M3.4 12.8h9.2"/></svg>',bt='<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6l5.8 10.4H2.2z"/><path d="M8 6.4v3.2"/><path d="M8 11.6h.01"/></svg>',Ke='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l3.5 3L3 11"/><path d="M8.5 11H13"/></svg>',_t='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 4.5h10"/><path d="M3 8h10"/><path d="M3 11.5h6"/></svg>',xt='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3.5 12.5v-4"/><path d="M7 12.5v-8"/><path d="M10.5 12.5v-5"/><path d="M13 12.5v-2"/></svg>',wt='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 8h-9"/><path d="M7 4.5L3.5 8 7 11.5"/></svg>',Ve='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5L8 10.5l4-4"/></svg>';window.__ModuleLoader__.load({id:"@hyzyn/dsh-docker",factory:l=>{let m=l("react"),{jsx:e,jsxs:d}=l("react/jsx-runtime"),{createRoot:O}=l("react-dom/client"),{useState:h,useEffect:C,useRef:K,useCallback:de}=m;function Ge(t,n,i){if(n==="")return t;let k=t.toLowerCase(),_=n.toLowerCase(),r=[],v=0,x=k.indexOf(_),w=0;for(;x>=0&&w<500;)x>v&&r.push(t.slice(v,x)),r.push(e("mark",{children:t.slice(x,x+_.length)},i+"-m"+String(w))),v=x+_.length,w+=1,x=k.indexOf(_,v);return v<t.length&&r.push(t.slice(v)),r}function Ee(t){let n=t.health==="unhealthy"?"unhealthy":t.state,i=t.health==="unhealthy"?"\u4E0D\u5065\u5EB7":ct(t.state);return e("span",{className:"dk_badge","data-state":n,title:t.status??"",children:i})}function V(t){return d("div",{className:"dk_banner","data-kind":t.kind??"error",children:[e("span",{className:"dk_bannerIcon",dangerouslySetInnerHTML:{__html:bt}},"icon"),d("div",{className:"dk_bannerBody",children:[e("div",{children:t.title}),t.hint===void 0?null:e("div",{className:"dk_hint",style:{marginTop:4},children:t.hint})]},"body"),t.action===void 0?null:e("div",{className:"dk_bannerAction",children:t.action},"action")]})}function Me(t){return d("div",{className:"dk_confirmBackdrop",onMouseDown:n=>n.stopPropagation(),children:[d("div",{className:"dk_confirm",children:[e("div",{className:"dk_confirmTitle",children:t.title}),e("div",{className:"dk_confirmText",children:t.text}),d("div",{className:"dk_confirmActions",children:[e("button",{type:"button",className:"dk_btn",onClick:t.onCancel,children:"\u53D6\u6D88"}),e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:t.onConfirm,children:t.confirmLabel})]})]})]})}function yt(t){return e("button",{type:"button",className:"dk_btn"+(t.danger===!0?" dk_btnDanger":""),disabled:t.disabled===!0,title:t.title??"",onClick:n=>{n.stopPropagation(),t.onClick()},children:t.children})}function se(t){return d("div",{className:"dk_cardRow",children:[e("span",{className:"dk_cardLabel",children:t.label}),e("span",{className:"dk_cardValue",title:String(t.value),children:t.value})]})}function U(t){let n=t.disabled===!0;return e("button",{type:"button",className:"dk_iconBtn"+(t.danger===!0?" dk_iconBtnDanger":""),"data-on":t.on===!0?"1":void 0,disabled:n,title:t.title,"aria-label":t.title,onClick:i=>{i.stopPropagation(),!n&&t.onClick()},children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:t.icon}})})}function We(t){let n=t.item,i=t.allowMutations!==!0,k=n.state==="running"||n.state==="paused"||n.state==="restarting",_=n.createdAt===null?n.runningFor===""?"\u2014":n.runningFor:st(n.createdAt);return d("div",{className:"dk_card",role:"button",tabIndex:0,"data-selected":t.selected===!0?"1":"0",onClick:()=>t.onOpen(n,"overview"),onKeyDown:r=>{(r.key==="Enter"||r.key===" ")&&(r.preventDefault(),t.onOpen(n,"overview"))},children:[d("div",{className:"dk_cardHead",children:[e("span",{className:"dk_cardName",title:n.name,children:n.name}),e(Ee,{state:n.state,health:n.health,status:n.status})]},"head"),d("div",{className:"dk_cardRows",children:[e(se,{label:"\u955C\u50CF",value:n.image},"image"),e(se,{label:"ID",value:n.shortId},"id"),e(se,{label:"\u7AEF\u53E3",value:ze(n.ports)},"ports"),e(se,{label:"\u521B\u5EFA",value:_},"created"),n.composeProject===null?null:e(se,{label:"compose",value:n.composeProject+(n.composeService===null?"":"/"+n.composeService)},"compose")]},"rows"),d("div",{className:"dk_actionBar",children:[e(U,{icon:Ke,title:"\u5728\u5BB9\u5668\u5185\u6253\u5F00\u4EA4\u4E92\u5F0F\u7EC8\u7AEF\uFF08docker exec -it "+n.name+" sh\uFF09",onClick:()=>t.onExec(n)},"exec"),e(U,{icon:_t,title:"\u67E5\u770B\u65E5\u5FD7",onClick:()=>t.onOpen(n,"logs")},"logs"),e(U,{icon:xt,title:"\u8D44\u6E90\u5360\u7528",onClick:()=>t.onOpen(n,"stats")},"stats"),e("span",{className:"dk_actionBarSep","aria-hidden":"true"},"sep"),e(U,{icon:k?pt:ht,title:i?"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D":k?"\u505C\u6B62\u5BB9\u5668":"\u542F\u52A8\u5BB9\u5668",disabled:i,onClick:()=>t.onAction(k?"stop":"start",n)},"power"),e(U,{icon:mt,title:i?"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D":"\u91CD\u542F\u5BB9\u5668",disabled:i,onClick:()=>t.onAction("restart",n)},"restart"),e(U,{icon:vt,danger:!0,title:i?"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D":"\u5220\u9664\u5BB9\u5668\uFF08\u4E0D\u53EF\u6062\u590D\uFF09",disabled:i,onClick:()=>t.onAction("remove",n)},"remove")]},"actions")]})}let Je=/^\s*(\[\d{4}-\d{2}-\d{2}[ T][0-9:.,]+\]|\d{2}:\d{2}:\d{2}[,.]\d{3})/,$e=/^\s*(\[(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\]|\|\s*(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL))/,qe=/(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)/,fe=2e3;function Ye(t,n,i){let k=[],_=t;for(let r=0;r<2;r+=1){let v=Je.exec(_);if(v!==null){k.push(e("span",{className:"dk_logTs",children:v[1]},"ts"+String(r))),_=_.slice(v[0].length);continue}let x=$e.exec(_);if(x!==null){let w=qe.exec(x[1]);k.push(e("span",{className:"dk_logLevel","data-level":w===null?"":w[1],children:x[1].trim()},"lv"+String(r))),_=_.slice(x[0].length);continue}break}return k.push(e("span",{className:"dk_logText",children:Ge(_,i,"x"+String(n))},"tx")),d("div",{className:"dk_logLine",children:k},String(n))}function Xe(t){let n=t.item,i=t.config,[k,_]=h(t.initialTab??"overview"),[r,v]=h(null),[x,w]=h(""),[N,A]=h({tail:i.logTailDefault,timestamps:!1}),[E,I]=h(null),[T,Q]=h(""),[$,Z]=h(!1),[H,P]=h(""),[B,z]=h(!0),[G,o]=h(!1),[s,p]=h(3),[S,ee]=h(null),[ge,q]=h(""),[Y,_e]=h(""),[j,M]=h(null),[te,ce]=h(""),[he,W]=h(!1);C(()=>{let g=!0;return v(null),w(""),R.inspect(t.target,n.id).then(b=>{g&&v(b.details?.[0]??null)}).catch(b=>{g&&w(b.message)}),()=>{g=!1}},[t.target,n.id,t.refreshToken]);let D=de(()=>{Z(!0),Q(""),R.logs(t.target,n.id,{tail:N.tail,timestamps:N.timestamps}).then(g=>I(g.logs)).catch(g=>Q(g.message)).finally(()=>Z(!1))},[t.target,n.id,N.tail,N.timestamps]);C(()=>{k==="logs"&&D()},[k,D,t.refreshToken]),C(()=>{if(k!=="logs"||!G)return;let g=setInterval(D,Math.max(1,s)*1e3);return()=>clearInterval(g)},[k,G,s,D]),C(()=>{if(k!=="stats")return;let g=!0,b=()=>{R.stats(t.target,[n.id]).then(y=>{g&&(ee(y.stats?.[0]??null),q(""))}).catch(y=>{g&&q(y.message)})};b();let c=setInterval(b,Math.max(2,i.pollIntervalSec)*1e3);return()=>{g=!1,clearInterval(c)}},[k,t.target,n.id,i.pollIntervalSec,t.refreshToken]);let oe=()=>{Y.trim()!==""&&(W(!0),ce(""),M(null),R.exec(t.target,n.id,Y,i.execTimeoutSec).then(g=>M(g.result)).catch(g=>ce(g.message)).finally(()=>W(!1)))},pe=()=>{if(x!=="")return e(V,{title:"\u8BFB\u53D6\u5BB9\u5668\u8BE6\u60C5\u5931\u8D25",hint:x});if(r===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let g=[["\u72B6\u6001",r.state+(r.health===null?"":" / "+r.health)+(r.status===""?"":"\uFF08"+r.status+"\uFF09")],["\u955C\u50CF",r.image],["\u5BB9\u5668 ID",r.shortId],["\u542F\u52A8\u65F6\u95F4",r.startedAt??"\u2014"],["\u7ED3\u675F\u65F6\u95F4",r.finishedAt??"\u2014"],["\u9000\u51FA\u7801",r.exitCode===null?"\u2014":String(r.exitCode)],["\u91CD\u542F\u6B21\u6570",r.restartCount===null?"\u2014":String(r.restartCount)],["\u91CD\u542F\u7B56\u7565",r.restartPolicy??"\u2014"],["PID",r.pid===null?"\u2014":String(r.pid)],["\u7AEF\u53E3",r.ports.length===0?"\u2014":ze(r.ports)],["\u6302\u8F7D",r.mounts.length===0?"\u2014":r.mounts.map(c=>c.source+"\u2192"+c.destination+(c.readWrite?"":"\uFF08\u53EA\u8BFB\uFF09")).join(`
`)],["\u7F51\u7EDC",r.networks.length===0?"\u2014":r.networks.map(c=>c.name+(c.ip===null?"":"\uFF08"+c.ip+"\uFF09")).join(", ")],["\u547D\u4EE4",(r.entrypoint+" "+r.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",r.workingDir===""?"\u2014":r.workingDir],["\u7528\u6237",r.user===""?"\u2014":r.user]],b=d("div",{className:"dk_kv",children:g.flatMap(([c,y],L)=>[e("div",{className:"dk_kvKey",children:c},"k"+String(L)),e("div",{className:"dk_kvVal"+(c==="\u5BB9\u5668 ID"||c==="\u547D\u4EE4"||c==="\u955C\u50CF"?" dk_kvValMono":""),children:y},"v"+String(L))])});return d("div",{children:[r.healthLogTail===null?null:e("div",{className:"dk_hint",style:{marginBottom:8},children:"\u6700\u8FD1\u5065\u5EB7\u68C0\u67E5\u8F93\u51FA\uFF1A"+r.healthLogTail}),b,e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u4E00\u6B21\u6027\u547D\u4EE4\uFF08docker exec\uFF09"}),i.allowExec!==!0?e(V,{kind:"info",title:"exec \u672A\u542F\u7528",hint:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8 exec\u300D\uFF0C\u6216\u76F4\u63A5\u590D\u5236\u5361\u7247\u4E0A\u7684 exec \u547D\u4EE4\u5230\u7EC8\u7AEF\u9762\u677F\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u3002"}):d("div",{children:[d("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u5982 ls -la /app \u6216 cat /etc/nginx/nginx.conf",value:Y,onChange:c=>_e(c.target.value),onKeyDown:c=>{c.key==="Enter"&&oe()}}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:he,onClick:oe,children:he?"\u6267\u884C\u4E2D\u2026":"\u6267\u884C"})]}),te===""?null:e(V,{title:"\u6267\u884C\u5931\u8D25",hint:te}),j===null?null:d("div",{style:{marginTop:8},children:[e("div",{className:"dk_hint",children:"\u9000\u51FA\u7801 "+(j.code===null?"?":String(j.code))+" \xB7 \u8017\u65F6 "+String(j.durationMs)+"ms"+(j.truncated?" \xB7 \u8F93\u51FA\u5DF2\u622A\u65AD":"")}),e("pre",{className:"dk_logBox",style:{marginTop:6},children:(j.stdout||"")+(j.stderr===""?"":`
[stderr]
`+j.stderr)||"(\u65E0\u8F93\u51FA)"})]})]})]})},le=()=>{let g=E===null?"":E.text,b=H.trim().toLowerCase(),c=g===""?[]:g.split(`
`),y=b===""?c:c.filter(L=>L.toLowerCase().includes(b));return{raw:g,needle:b,allLines:c,matchedLines:y}},ke=(g,b,c)=>e("button",{type:"button",className:"dk_pill","data-on":g?"1":"0",onClick:c,children:b}),xe=()=>{let{raw:g}=le(),b=[...new Set([100,200,500,1e3,5e3,Number(i.logTailDefault)||200,Number(N.tail)||200])].filter(c=>Number.isInteger(c)&&c>0).sort((c,y)=>c-y);return d("div",{className:"dk_logTools",children:[e("span",{className:"dk_toolLabel",children:"LINES"}),e("select",{className:"dk_select dk_selectSm",value:String(N.tail),onChange:c=>A({...N,tail:Number(c.target.value)}),children:b.map(c=>e("option",{value:String(c),children:c===5e3?"Last 5000":"Last "+String(c)},String(c)))}),e("span",{className:"dk_toolLabel",children:"TIMESTAMPS"}),ke(N.timestamps,N.timestamps?"On":"Off",()=>A({...N,timestamps:!N.timestamps})),e("span",{className:"dk_toolLabel",children:"AUTO REFRESH"}),ke(G,G?"On":"Off",()=>o(c=>!c)),e("select",{className:"dk_select dk_selectSm",value:String(s),title:"\u81EA\u52A8\u5237\u65B0\u95F4\u9694\uFF08\u5F00\u542F AUTO REFRESH \u540E\u6309\u6B64\u8F6E\u8BE2\uFF09",onChange:c=>p(Number(c.target.value)),children:[2,3,5,10].map(c=>e("option",{value:String(c),children:String(c)+"s"},String(c)))}),$?e("span",{className:"dk_spin"}):null,e(U,{icon:Le,title:"\u5237\u65B0\u65E5\u5FD7",onClick:D},"refresh"),e(U,{icon:ft,title:"\u4E0B\u8F7D\u65E5\u5FD7",disabled:g==="",onClick:()=>kt(n.name+".log",g)},"download")]})},ae=()=>{let{needle:g,allLines:b,matchedLines:c}=le();return d("div",{className:"dk_filterBar",children:[e("button",{type:"button",className:"dk_filterToggle","data-on":B?"1":"0",onClick:()=>z(y=>!y),children:[e("span",{className:"dk_caret",dangerouslySetInnerHTML:{__html:Ve}},"c"),"\u8FC7\u6EE4\u65E5\u5FD7"]}),B?e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u65E5\u5FD7\u2026",value:H,onChange:y=>P(y.target.value)}):null,e("span",{className:"dk_filterCount",children:g===""?String(b.length)+" \u884C":String(c.length)+" / "+String(b.length)+" \u884C\u5339\u914D"})]})},ue=()=>{let{needle:g,matchedLines:b}=le(),c=b.length>fe?b.slice(-fe):b;return d("div",{className:"dk_logs",children:[T===""?null:e(V,{title:"\u8BFB\u53D6\u65E5\u5FD7\u5931\u8D25",hint:T+(T.includes("Failed to fetch")?"\uFF08\u7F51\u7EDC\u8BF7\u6C42\u6CA1\u5230\u5BBF\u4E3B\uFF1A\u5BBF\u4E3B\u53EF\u80FD\u521A\u91CD\u542F\u3001\u6216\u8FDE\u63A5\u88AB\u4E2D\u65AD\uFF09":""),action:e("button",{type:"button",className:"dk_btn",disabled:$,onClick:D,children:"\u91CD\u8BD5"})}),E!==null&&E.truncated===!0?e(V,{kind:"warn",title:"\u65E5\u5FD7\u8F93\u51FA\u8D85\u8FC7\u4E0A\u9650\uFF0C\u5DF2\u622A\u65AD",hint:"\u8C03\u5C0F\u300CLINES\u300D\u6216\u5230\u8BBE\u7F6E\u5361\u7247\u8C03\u5927\u300C\u5355\u6B21\u547D\u4EE4\u8F93\u51FA\u4E0A\u9650\u300D\u3002"}):null,d("div",{className:"dk_logBody",children:[b.length>c.length?e("div",{className:"dk_logLine dk_logMore",children:"\uFF08\u53EA\u663E\u793A\u6700\u8FD1 "+String(fe)+" \u884C\uFF0C\u5171 "+String(b.length)+" \u884C\u5339\u914D\uFF09"},"more"):null,T!==""?null:E===null?e("div",{className:"dk_logLine",children:"\u8BFB\u53D6\u4E2D\u2026"},"loading"):c.length===0?e("div",{className:"dk_logLine",children:g===""?"(\u65E0\u65E5\u5FD7)":"(\u65E0\u5339\u914D\u65E5\u5FD7)"},"empty"):c.map((y,L)=>Ye(y,L,g))]})]})},we=()=>{if(ge!=="")return e(V,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:ge});if(S===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let g=S.cpuPercent??0,b=S.memPercent??0,c=L=>d("div",{className:"dk_bar",children:[e("div",{className:"dk_barFill","data-warn":L>=60&&L<85?"1":void 0,"data-danger":L>=85?"1":void 0,style:{width:Math.min(100,Math.max(0,L))+"%"}})]}),y=(L,Ne,a)=>d("tr",{children:[e("td",{children:L}),e("td",{className:"dk_num",children:Ne}),e("td",{children:a??null})]},L);return d("table",{className:"dk_stats",children:[e("thead",{children:d("tr",{children:[e("th",{children:"\u6307\u6807"}),e("th",{children:"\u6570\u503C"}),e("th",{children:"\u5360\u7528"})]})}),e("tbody",{children:[y("CPU",lt(S.cpuPercent),c(g)),y("\u5185\u5B58",S.memUsage,c(b)),y("\u7F51\u7EDC IO",S.netIO,null),y("\u78C1\u76D8 IO",S.blockIO,null),y("PIDs",S.pids===null?"\u2014":String(S.pids),null)]})]})},ye=[["overview","\u6982\u89C8"],["logs","\u65E5\u5FD7"],["stats","\u7EDF\u8BA1"]];return d("div",{className:"dk_detail",children:[d("div",{className:"dk_header dk_headerDetail",children:[e(U,{icon:wt,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:n.name,children:n.name}),e(Ee,{state:n.state,health:n.health,status:n.status}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),k==="logs"?xe():e(U,{icon:Le,title:"\u5237\u65B0",onClick:t.onRefresh},"refresh"),e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),d("div",{className:"dk_tabs",children:[...ye.map(([g,b])=>e("button",{type:"button",className:"dk_tab","data-on":k===g?"1":"0",onClick:()=>_(g),children:b},g)),k==="logs"?e("span",{className:"dk_headerSpacer"},"spacer"):null,k==="logs"?ae():null]}),e("div",{className:"dk_detailBody",children:k==="overview"?pe():k==="logs"?ue():we()})]})}function Qe(t){return d("div",{className:"dk_drawer",children:[d("div",{className:"dk_drawerHead",children:[e("span",{className:"dk_drawerIcon",dangerouslySetInnerHTML:{__html:Ke}}),e("span",{className:"dk_drawerTitle",title:t.label,children:t.label}),e("span",{className:"dk_drawerHint",children:"\u7531\u7EC8\u7AEF\u9762\u677F\u627F\u8F7D \xB7 \u6536\u8D77\u62BD\u5C49\u7ED3\u675F\u4F1A\u8BDD"}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u7EC8\u7AEF",onClick:t.onClose,children:e("span",{dangerouslySetInnerHTML:{__html:Be}})})]}),e("div",{className:"dk_drawerBody",ref:t.hostRef})]})}function Ze(t){let[n,i]=h(null),[k,_]=h([]),[r,v]=h(t.initialTarget??""),x=t.sessionHint!==void 0&&(t.initialTarget??"")==="",[w,N]=h("containers"),[A,E]=h([]),[I,T]=h([]),[Q,$]=h(!1),[Z,H]=h(""),[P,B]=h(""),[z,G]=h(!0),[o,s]=h(""),[p,S]=h("all"),[ee,ge]=h(!1),[q,Y]=h(null),[_e,j]=h(0),[M,te]=h(null),[ce,he]=h(""),W=K(!0),[D,oe]=h(null),pe=K(null);C(()=>()=>{W.current=!1},[]),C(()=>{if(D===null)return;let a=pe.current;if(a===null)return;let u=null;try{u=re.mount(a,D.options)}catch(f){B("\u7EC8\u7AEF\u542F\u52A8\u5931\u8D25\uFF1A"+(f instanceof Error?f.message:String(f))),oe(null);return}return()=>{try{u?.()}catch{}}},[D]),C(()=>{R.config().then(a=>{let u=a.config;i(u),!x&&Array.isArray(u.targets)&&u.targets.length>0&&v(f=>f===""?u.targets[0].name:f),Te(u)}).catch(a=>H(a.message)),R.targets().then(a=>{_(a.targets??[]),Ie=a.targets??[];let u=(a.targets??[])[0];u!==void 0&&!x&&v(f=>f===""?u.name:f)}).catch(()=>{})},[]);let le=de(()=>{r!==""&&($(!0),R.containers(r,z).then(a=>{W.current&&(E(a.containers??[]),H(""))}).catch(a=>{W.current&&H(a.message)}).finally(()=>{W.current&&$(!1)}))},[r,z]),ke=de(()=>{r!==""&&($(!0),R.images(r).then(a=>{W.current&&(T(a.images??[]),H(""))}).catch(a=>{W.current&&H(a.message)}).finally(()=>{W.current&&$(!1)}))},[r]),xe=de(()=>j(a=>a+1),[]),ae=de(()=>{w==="images"?ke():le(),j(a=>a+1)},[w,le,ke]);C(()=>{r!==""&&ae()},[r,z,w]),C(()=>{if(!ee||r==="")return;let a=setInterval(ae,Math.max(2,n?.pollIntervalSec??5)*1e3);return()=>clearInterval(a)},[ee,ae,r,n]),C(()=>{if(P==="")return;let a=setTimeout(()=>B(""),4e3);return()=>clearTimeout(a)},[P]);let ue=(a,u)=>{let f=je(a.name);navigator.clipboard.writeText(f).then(()=>{B("\u5DF2\u590D\u5236\uFF1A"+f+(u===void 0?"":"\uFF08"+u+"\uFF09"))}).catch(()=>B("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u6267\u884C\uFF1A"+f))},we=a=>{let u=je(a.name);if(re===null){let ne=document.querySelector("[data-dsh-tty-entry]")!==null;ue(a,ne?"\u7EC8\u7AEF\u9762\u677F\u7248\u672C\u8FC7\u65E7\uFF08\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u9700\u8981 dsh-tty \u2265 0.14.0\uFF09\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C":"\u672A\u5B89\u88C5 dsh-tty \u7EC8\u7AEF\u9762\u677F\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C\uFF08\u88C5 dsh-tty \u540E\u53EF\u76F4\u63A5\u5728\u6B64\u5F00\u7EC8\u7AEF\uFF09");return}let f=(n?.targets??[]).find(ne=>ne.name===r),me=a.name+" \xB7 exec",Ce=f===void 0||f.kind==="local"?{command:u,label:me}:typeof f.book=="string"&&f.book!==""?{book:f.book,command:u,label:me}:(f.auth??"agent")==="agent"?{spec:{host:f.host,port:f.port,username:f.username,auth:"agent",agentForward:f.agentForward===!0},command:u,label:me}:null;if(Ce===null){ue(a,"\u5185\u8054\u76EE\u6807\u7528\u4E86 key/password \u8BA4\u8BC1\uFF0C\u6D4F\u89C8\u5668\u7AEF\u62FF\u4E0D\u5230\u51ED\u8BC1");return}if(typeof re.mount=="function"&&Number(re.version??0)>=2){oe({label:me,options:Ce});return}try{re.open(Ce),t.onClose()}catch(ne){ue(a,ne instanceof Error?ne.message:String(ne))}},ye=(a,u)=>{te({title:a==="remove"?"\u5220\u9664\u5BB9\u5668":a==="stop"?"\u505C\u6B62\u5BB9\u5668":a==="start"?"\u542F\u52A8\u5BB9\u5668":"\u91CD\u542F\u5BB9\u5668",text:a==="remove"?`\u786E\u5B9A\u5220\u9664\u5BB9\u5668 ${u.name}\uFF1F\u5BB9\u5668\u7684\u53EF\u5199\u5C42\u4E0E\u914D\u7F6E\u4F1A\u88AB\u5220\u9664\uFF08\u547D\u540D\u6570\u636E\u5377\u4FDD\u7559\uFF09\uFF0C\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002`:`\u786E\u5B9A\u5BF9\u5BB9\u5668 ${u.name} \u6267\u884C${a==="stop"?"\u505C\u6B62":a==="start"?"\u542F\u52A8":"\u91CD\u542F"}\u64CD\u4F5C\uFF1F`,confirmLabel:a==="remove"?"\u5220\u9664":"\u786E\u5B9A",run:()=>{te(null),R.action(r,a,u.id).then(f=>{B(`${f.result.action} ${u.name}\uFF1A${f.result.message}`),ae()}).catch(f=>H(f.message))}})},g=q===null?null:A.find(a=>a.id===q.id)??q.item,b=A.filter(a=>{if(p==="running"&&!(a.state==="running"||a.state==="paused"||a.state==="restarting")||p==="stopped"&&a.state==="running"||p==="unhealthy"&&a.health!=="unhealthy")return!1;let u=o.trim().toLowerCase();return u===""?!0:a.name.toLowerCase().includes(u)||a.image.toLowerCase().includes(u)||a.id.toLowerCase().includes(u)}),c=I.filter(a=>{let u=ce.trim().toLowerCase();return u===""||a.reference.toLowerCase().includes(u)||a.id.toLowerCase().includes(u)}),y=a=>{let u=k.find(f=>f.name===a);return u===void 0||u.label===void 0?a:a+" \xB7 "+u.label},L=()=>Q?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):r===""?x?d("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u4E0D\u662F Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u6309\u4E0A\u9762\u7684\u63D0\u793A\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761\u76EE\u6807\uFF08\u63A8\u8350\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u3002\u4E3A\u907F\u514D\u5F20\u51A0\u674E\u6234\uFF0C\u9762\u677F\u4E0D\u4F1A\u81EA\u52A8\u5207\u5230\u5176\u4ED6\u76EE\u6807\u3002"})]}):d("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD8\u6CA1\u6709\u914D\u7F6E Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u4E2A\u76EE\u6807\uFF1A\u672C\u673A\u76F4\u63A5\u9009\u300C\u672C\u673A\u300D\uFF1B\u8FDC\u7A0B\u4E3B\u673A\u53EF\u4EE5\u5F15\u7528 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\u3002"})]}):d("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:w==="images"?"\u6CA1\u6709\u955C\u50CF":"\u6CA1\u6709\u5BB9\u5668"}),e("div",{className:"dk_emptyHint",children:o.trim()===""?"\u76EE\u6807\u4E0A\u6CA1\u6709\u5339\u914D\u7684\u6570\u636E\uFF0C\u6216\u7B5B\u9009\u6761\u4EF6\u8FC7\u7A84\u3002":"\u6CA1\u6709\u5339\u914D\u300C"+o.trim()+"\u300D\u7684\u7ED3\u679C\u3002"})]}),Ne=()=>w==="images"?d("div",{children:[e("div",{className:"dk_logBar",children:[e("input",{className:"dk_input",style:{flex:"1 1 200px"},placeholder:"\u641C\u7D22\u955C\u50CF\uFF08\u4ED3\u5E93 / \u6807\u7B7E / ID\uFF09",value:ce,onChange:a=>he(a.target.value)}),e("span",{className:"dk_hint",children:String(c.length)+" / "+String(I.length)+" \u4E2A\u955C\u50CF"})]}),c.length===0?L():e("div",{className:"dk_tableWrap",children:d("table",{className:"dk_images",children:[e("thead",{children:d("tr",{children:[e("th",{children:"\u955C\u50CF"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"ID"})]})}),e("tbody",{children:c.map(a=>d("tr",{children:[e("td",{className:"dk_mono",children:a.reference}),e("td",{children:a.sizeText}),e("td",{children:a.createdSince}),e("td",{className:"dk_mono",children:a.shortId})]},a.id+a.reference))})]})})]}):b.length===0?L():e("div",{className:"dk_grid",children:b.map(a=>e(We,{item:a,selected:q!==null&&a.id===q.id,allowMutations:n?.allowMutations===!0,onOpen:(u,f)=>Y({id:u.id,tab:f,item:u}),onExec:we,onAction:ye,onCopyExec:u=>{navigator.clipboard.writeText("docker exec -it "+u.name+" sh").then(()=>B("\u5DF2\u590D\u5236\uFF1Adocker exec -it "+u.name+" sh")).catch(()=>B("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236"))}},a.id))});return d("div",{className:"dk_backdrop",onMouseDown:()=>t.onClose(),children:[d("div",{className:"dk_panel",onMouseDown:a=>a.stopPropagation(),children:[g!==null?[e(Xe,{item:g,target:r,targetLabel:y(r),config:n??{pollIntervalSec:5,logTailDefault:200,allowExec:!1,execTimeoutSec:30},initialTab:q.tab,refreshToken:_e,onBack:()=>Y(null),onRefresh:xe,onClose:t.onClose},"detail"),M===null?null:e(Me,{title:M.title,text:M.text,confirmLabel:M.confirmLabel,onCancel:()=>te(null),onConfirm:M.run},"confirm")]:[d("div",{className:"dk_header",children:[e("span",{className:"dk_titleIcon",dangerouslySetInnerHTML:{__html:Fe}}),e("span",{className:"dk_title",children:"Docker \u5BB9\u5668"}),n?.allowMutations===!0?null:e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"}),e("span",{className:"dk_headerSpacer"}),Q?e("span",{className:"dk_spin"}):null,g!==null?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868",onClick:ae,children:e("span",{dangerouslySetInnerHTML:{__html:Le}})}),e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{dangerouslySetInnerHTML:{__html:Be}})})]}),g!==null?null:d("div",{className:"dk_toolbar",children:[e("select",{className:"dk_select",value:r,onChange:a=>{v(a.target.value),Y(null)},children:[...r===""?[e("option",{value:"",children:"\uFF08\u672A\u9009\u62E9\u76EE\u6807\uFF09"},"__none")]:[],...(k.length===0&&r!==""?[{name:r,label:void 0}]:k).map(a=>e("option",{value:a.name,children:y(a.name)},a.name))]}),e("div",{className:"dk_seg",children:[["containers","\u5BB9\u5668"],["images","\u955C\u50CF"]].map(([a,u])=>e("button",{type:"button",className:"dk_segBtn","data-on":w===a?"1":"0",onClick:()=>{N(a),Y(null)},children:u},a))}),w==="containers"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u540D\u79F0 / \u955C\u50CF / ID",value:o,onChange:a=>s(a.target.value)}):null,w==="containers"?e("div",{className:"dk_seg",children:[["all","\u5168\u90E8"],["running","\u8FD0\u884C\u4E2D"],["stopped","\u5DF2\u505C\u6B62"],["unhealthy","\u4E0D\u5065\u5EB7"]].map(([a,u])=>e("button",{type:"button",className:"dk_segBtn","data-on":p===a?"1":"0",onClick:()=>S(a),children:u},a))}):null,w==="containers"?e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:z,onChange:a=>G(a.target.checked)}),"\u542B\u5DF2\u505C\u6B62"]}):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:ee,onChange:a=>ge(a.target.checked)}),"\u81EA\u52A8\u5237\u65B0"]})]}),d("div",{className:"dk_body",children:[d("div",{className:"dk_main",children:[Z===""?null:e(V,{title:"\u64CD\u4F5C\u5931\u8D25",hint:Z}),P===""?null:e(V,{kind:"info",title:P}),t.sessionHint===void 0?null:e(V,{kind:"info",title:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u6CA1\u914D\u7F6E\u4E3A Docker \u76EE\u6807",hint:"\u4F1A\u8BDD\u4E3B\u673A\uFF1A"+t.sessionHint.host+(t.sessionHint.port===22?"":":"+String(t.sessionHint.port))+(t.sessionHint.book===""?"":"\uFF08\u8FDE\u63A5\u7C3F\uFF1A"+t.sessionHint.book+"\uFF09")+" \u2014 \u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761 kind=ssh \u76EE\u6807"+(t.sessionHint.book===""?"\uFF08\u586B host/username\uFF0C\u6216\u7528\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09":"\uFF0C\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\u300C"+t.sessionHint.book+"\u300D")+"\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u5373\u53EF\u3002"}),n!==null&&n.allowMutations!==!0?e(V,{kind:"info",title:"\u5F53\u524D\u4E3A\u53EA\u8BFB\u6A21\u5F0F",hint:"\u542F\u52A8 / \u505C\u6B62 / \u91CD\u542F / \u5220\u9664\u9700\u8981\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u3002"}):null,Ne()]})]}),M===null?null:e(Me,{title:M.title,text:M.text,confirmLabel:M.confirmLabel,onCancel:()=>te(null),onConfirm:M.run})],D===null?null:e(Qe,{label:D.label,hostRef:pe,onClose:()=>oe(null)},"execDrawer")]})]})}function et(){let[t,n]=h(!1),[i,k]=h(null),[_,r]=h(!1),[v,x]=h(!1),[w,N]=h({kind:"",text:""}),A=K(0),E=de(()=>{R.config().then(o=>{k(o.config),Te(o.config),A.current=Array.isArray(o.config?.targets)?o.config.targets.length:0,r(!0)}).catch(o=>{N({kind:"error",text:"\u8BFB\u53D6\u914D\u7F6E\u5931\u8D25\uFF1A"+o.message}),r(!0)})},[]);C(()=>{t&&!_&&E()},[t,_,E]);let I=o=>k(s=>({...s,...o})),T=(o,s)=>k(p=>{let S=p.targets.slice();return S[o]={...S[o],...s},{...p,targets:S}}),Q=()=>k(o=>({...o,targets:[...o.targets,{name:"\u76EE\u6807"+String(o.targets.length+1),kind:"local",book:"",host:"",port:22,username:"",auth:"agent",keyPath:"",agentForward:!1,passwordSet:!1,passphraseSet:!1}]})),$=o=>k(s=>({...s,targets:s.targets.filter((p,S)=>S!==o)})),Z=o=>k(s=>({...s,hostKeys:s.hostKeys.filter(p=>!(p.host===o.host&&p.port===o.port))})),H=()=>{x(!0),N({kind:"",text:""});let o={enabled:i.enabled,announceToAgent:i.announceToAgent,dockerBin:i.dockerBin,allowMutations:i.allowMutations,allowExec:i.allowExec,execTimeoutSec:i.execTimeoutSec,pollIntervalSec:i.pollIntervalSec,logTailDefault:i.logTailDefault,maxOutputKb:i.maxOutputKb,targets:i.targets.map(s=>({name:s.name,kind:s.kind,book:s.book??"",host:s.host??"",port:Number(s.port)||22,username:s.username??"",auth:s.auth??"agent",keyPath:s.keyPath??"",...s.password===void 0||s.password===""?{}:{password:s.password},...s.passphrase===void 0||s.passphrase===""?{}:{passphrase:s.passphrase},agentForward:s.agentForward===!0})),hostKeys:i.hostKeys,...i.targets.length===0&&A.current>0?{clearTargets:!0}:{}};R.saveConfig(o).then(s=>{k(s.config),Te(s.config),A.current=Array.isArray(s.config?.targets)?s.config.targets.length:0,ve(),N(s.warning===void 0?{kind:"ok",text:"\u5DF2\u4FDD\u5B58\u5E76\u70ED\u751F\u6548"}:{kind:"error",text:s.warning})}).catch(s=>{N({kind:"error",text:"\u4FDD\u5B58\u5931\u8D25\uFF1A"+s.message})}).finally(()=>x(!1))},P=o=>e("div",{className:"dk_cardSection",children:o}),B=(o,s,p)=>d("div",{className:"dk_field",children:[e("span",{className:"dk_label",children:o}),s,p===void 0?null:e("span",{className:"dk_hint",children:p})]}),z=(o,s,p,S)=>e("input",{className:"dk_input",type:"number",min:s,max:p,value:i[o],onChange:ee=>I({[o]:Number(ee.target.value)})}),G=d("div",{className:"dk_targetHead",role:"button",tabIndex:0,style:{cursor:"pointer",padding:"10px 12px",border:"1px solid var(--dk-border)",borderRadius:"var(--dk-r-lg)",background:"var(--dk-surface-solid)"},onClick:()=>n(o=>!o),onKeyDown:o=>{o.key==="Enter"&&n(s=>!s)},children:[d("div",{children:[e("div",{style:{fontWeight:600,fontSize:13},children:"Docker \u5BB9\u5668\u9762\u677F"}),e("div",{className:"dk_hint",children:"\u672C\u673A / SSH \u4E3B\u673A\u4E0A\u7684\u5BB9\u5668\u4E0E\u955C\u50CF\uFF1B\u9ED8\u8BA4\u53EA\u8BFB\uFF0C\u53D8\u66F4\u64CD\u4F5C\u9700\u663E\u5F0F\u5F00\u542F"})]}),e("span",{style:{transform:t?"rotate(180deg)":"none",transition:"transform var(--dk-dur) var(--dk-ease)"},dangerouslySetInnerHTML:{__html:Ve}})]});return t?!_||i===null?d("div",{children:[G,e("div",{className:"dk_cardBody",children:d("div",{className:"dk_row",children:[e("span",{className:"dk_spin"}),"\u8BFB\u53D6\u914D\u7F6E\u2026"]})})]}):d("div",{children:[G,e("div",{className:"dk_cardBody",children:[P("\u57FA\u672C"),d("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:i.enabled,onChange:o=>I({enabled:o.target.checked})}),"\u542F\u7528\u63D2\u4EF6"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:i.announceToAgent,onChange:o=>I({announceToAgent:o.target.checked})}),"\u5411 agent \u516C\u544A\u80FD\u529B"]})]}),d("div",{className:"dk_row",children:[B("docker CLI",e("input",{className:"dk_input",value:i.dockerBin,onChange:o=>I({dockerBin:o.target.value})}),"\u9ED8\u8BA4 docker\uFF1Bpodman \u53EF\u586B podman"),B("\u7EDF\u8BA1\u5237\u65B0\u95F4\u9694\uFF08\u79D2\uFF09",z("pollIntervalSec",1,60)),B("\u65E5\u5FD7\u9ED8\u8BA4\u884C\u6570",z("logTailDefault",1,5e3)),B("\u8F93\u51FA\u4E0A\u9650\uFF08KB\uFF09",z("maxOutputKb",1,8192)),B("exec \u8D85\u65F6\uFF08\u79D2\uFF09",z("execTimeoutSec",1,120))]}),P("\u80FD\u529B\u5F00\u5173\uFF08\u9ED8\u8BA4\u5173\u95ED\uFF09"),d("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:i.allowMutations,onChange:o=>I({allowMutations:o.target.checked})}),"\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\uFF08\u542F\u52A8 / \u505C\u6B62 / \u91CD\u542F / \u5220\u9664\uFF09"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:i.allowExec,onChange:o=>I({allowExec:o.target.checked})}),"\u5141\u8BB8 exec\uFF08\u5728\u5BB9\u5668\u5185\u6267\u884C\u547D\u4EE4\uFF09"]})]}),e("span",{className:"dk_hint",children:"docker socket \u7B49\u4EF7\u4E8E\u76EE\u6807\u4E3B\u673A\u7684 root \u6743\u9650\u3002\u5F00\u542F\u540E\uFF0C\u6D4F\u89C8\u5668\u9762\u677F\u4E0E agent \u90FD\u80FD\u6267\u884C\u5BF9\u5E94\u64CD\u4F5C\uFF0C\u8BF7\u53EA\u5728\u53EF\u4FE1\u73AF\u5883\u4E0B\u6253\u5F00\u3002"}),P("\u76EE\u6807"),...i.targets.map((o,s)=>d("div",{className:"dk_targetRow",children:[e("input",{className:"dk_input",value:o.name,placeholder:"\u76EE\u6807\u540D",onChange:p=>T(s,{name:p.target.value})}),e("select",{className:"dk_select",value:o.kind,onChange:p=>T(s,{kind:p.target.value}),children:[e("option",{value:"local",children:"\u672C\u673A"}),e("option",{value:"ssh",children:"SSH \u4E3B\u673A"})]}),o.kind==="local"?e("span",{className:"dk_hint",children:"\u5BBF\u4E3B\u6240\u5728\u673A\u5668\u4E0A\u7684 docker"}):d("div",{className:"dk_row",style:{gridColumn:"span 1"},children:[e("select",{className:"dk_select",value:o.book??"",onChange:p=>T(s,{book:p.target.value}),children:[e("option",{value:"",children:i.ttyBooks.length===0?"\uFF08\u65E0 tty \u8FDE\u63A5\u7C3F\uFF0C\u8BF7\u586B\u5185\u8054\u4FE1\u606F\uFF09":"\uFF08\u4E0D\u7528\u8FDE\u63A5\u7C3F\uFF0C\u624B\u586B\uFF09"}),...i.ttyBooks.map(p=>e("option",{value:p,children:"\u8FDE\u63A5\u7C3F\uFF1A"+p},p))]})]}),e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:()=>$(s),children:"\u5220\u9664"}),o.kind==="ssh"&&(o.book??"")===""?d("div",{className:"dk_row",style:{gridColumn:"1 / -1"},children:[e("input",{className:"dk_input",placeholder:"host",value:o.host??"",onChange:p=>T(s,{host:p.target.value})}),e("input",{className:"dk_input",style:{width:90},placeholder:"port",value:o.port??22,onChange:p=>T(s,{port:Number(p.target.value)||22})}),e("input",{className:"dk_input",placeholder:"username",value:o.username??"",onChange:p=>T(s,{username:p.target.value})}),e("select",{className:"dk_select",value:o.auth??"agent",onChange:p=>T(s,{auth:p.target.value}),children:[e("option",{value:"agent",children:"ssh-agent"}),e("option",{value:"key",children:"\u79C1\u94A5"}),e("option",{value:"password",children:"\u5BC6\u7801"})]}),(o.auth??"agent")==="key"?e("input",{className:"dk_input",placeholder:"~/.ssh/id_ed25519",value:o.keyPath??"",onChange:p=>T(s,{keyPath:p.target.value})}):null,(o.auth??"agent")==="password"?e("input",{className:"dk_input",type:"password",placeholder:o.passwordSet===!0?"\uFF08\u5DF2\u8BBE\u7F6E\uFF0C\u7559\u7A7A\u4FDD\u6301\u4E0D\u53D8\uFF09":"env:SSH_PASSWORD",value:o.password??"",onChange:p=>T(s,{password:p.target.value})}):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:o.agentForward===!0,onChange:p=>T(s,{agentForward:p.target.checked})}),"agent forwarding"]})]}):null]},String(s)+o.name)),d("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn",onClick:Q,children:"\u6DFB\u52A0\u76EE\u6807"}),e("span",{className:"dk_hint",children:"SSH \u76EE\u6807\u63A8\u8350\u76F4\u63A5\u9009 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF08\u51ED\u8BC1\u53EA\u9700\u7EF4\u62A4\u4E00\u5904\uFF09\uFF1B\u624B\u586B\u65F6\u5BC6\u7801 / \u53E3\u4EE4\u5EFA\u8BAE\u5199 env:VAR\u3002"})]}),P("SSH \u4E3B\u673A\u5BC6\u94A5\u8BB0\u5F55\uFF08TOFU\uFF09"),...i.hostKeys.length===0?[e("span",{className:"dk_hint",children:"\u6682\u65E0\u8BB0\u5F55 \u2014 \u9996\u6B21 SSH \u8FDE\u63A5\u6210\u529F\u540E\u81EA\u52A8\u8BB0\u5F55\u4E3B\u673A\u6307\u7EB9\uFF08\u82E5 tty \u5DF2\u8BB0\u5F55\u540C\u4E00\u4E3B\u673A\uFF0C\u4F1A\u76F4\u63A5\u590D\u7528\uFF09\u3002"},"none")]:i.hostKeys.map(o=>d("div",{className:"dk_targetRow",children:[e("span",{children:o.host+":"+String(o.port)}),e("span",{className:"dk_hint",style:{gridColumn:"span 2",wordBreak:"break-all"},children:"sha256:"+o.fingerprint}),e("button",{type:"button",className:"dk_btn",onClick:()=>Z(o),children:"\u5220\u9664"})]},o.host+":"+String(o.port))),e("span",{className:"dk_hint",children:"\u6307\u7EB9\u53D8\u66F4\u65F6\u8FDE\u63A5\u4F1A\u88AB\u62D2\u7EDD\uFF08\u9632\u4E2D\u95F4\u4EBA\uFF09\uFF1B\u786E\u8BA4\u5B89\u5168\u540E\u5220\u9664\u5BF9\u5E94\u8BB0\u5F55\u5373\u53EF\u91CD\u8FDE\u3002"}),d("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:v,onClick:H,children:v?"\u4FDD\u5B58\u4E2D\u2026":"\u4FDD\u5B58"}),e("span",{className:"dk_msg","data-kind":w.kind,children:w.text})]})]})]}):G}let J=null,X=null;function Re(){if(X!==null){let t=X;X=null,setTimeout(()=>t.unmount(),0)}if(J!==null){let t=J;J=null,setTimeout(()=>t.remove(),0)}}function De(t){if(J!==null){let n=J,i=X;J=null,X=null;try{i?.unmount()}catch{}n.remove()}Se(),J=document.createElement("div"),document.body.appendChild(J),X=O(J),X.render(e(Ze,{onClose:Re,initialTarget:t?.target??"",sessionHint:t?.sessionHint}))}function tt(){let t=document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');if(t!==null)return t.querySelector('[class*="logoRow"]')?.parentElement??t.firstElementChild}function at(t){let n=t.querySelector('button[class*="newSession"]');if(n!==null)return n;for(let i of t.children)if(i.tagName==="BUTTON")return i}function nt(){let t=document.createElement("div");return t.dataset.dshDockerEntry="",t.className="dk_sidebarEntry",t.setAttribute("role","button"),t.setAttribute("aria-label","\u5BB9\u5668"),t.innerHTML='<span class="dk_entryIcon">'+Fe+'</span><span class="dk_entryLabel">\u5BB9\u5668</span>',t.addEventListener("click",n=>{n.preventDefault(),De()}),t}function Ae(t,n){let i=at(t);if(i===void 0)return!1;if(n.parentElement!==t){let k=i.closest('[class*="logoRow"]'),_=k!==null&&k.parentElement===t?k:i,r=Array.from(t.children).filter(v=>v instanceof HTMLElement&&v.matches("[data-dsh-global-search-entry], [data-dsh-rss-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-tty-entry], [data-dsh-docker-entry]"));if(r.length>0){let v=r[r.length-1];t.insertBefore(n,v.nextSibling)}else t.insertBefore(n,_.nextElementSibling)}return!0}function rt(){if(Se(),document.querySelector("[data-dsh-docker-entry]")!==null)return()=>{};let t=nt(),n,i=!1,k=()=>{if(n!==void 0&&!n.isConnected&&(r.disconnect(),n=void 0,i=!1),i){if(document.body.contains(t))return;r.disconnect(),n=void 0,i=!1}n??(n=tt()),n!==void 0&&(i=Ae(n,t),i&&r.observe(n,{childList:!0,subtree:!0}))},_=new MutationObserver(()=>{k()});_.observe(document.body,{childList:!0,subtree:!0});let r=new MutationObserver(()=>{if(n===void 0||!n.isConnected){i=!1,k();return}n.contains(t)||(i=Ae(n,t))});return k(),()=>{_.disconnect(),r.disconnect(),t.remove()}}let be={};return be.inject=["slots"],be.apply=t=>{Se();let n=rt(),i=t.slots.inject("settings.plugin.item",()=>t.slots.register({name:"settings.plugin.item",key:"docker",order:112},et));t.inject(["ttyTerminal"],_=>(re=_.ttyTerminal??null,()=>{re=null}));let k=()=>{};return ve(),t.inject(["ttyConnbar"],_=>{let r=_.ttyConnbar;r!==void 0&&(k=r.addAction(v=>{let x=v?.spec??{};if(x.t!=="ssh")return;let w=typeof v?.bookName=="string"?v.bookName:"",N=Oe(x,w),A=N!==void 0?`\u6253\u5F00\u8BE5\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F\uFF08\u76EE\u6807\uFF1A${N}\uFF09`:ie===null?"\u6253\u5F00\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F":"\u8BE5\u4E3B\u673A\u5C1A\u672A\u914D\u7F6E\u4E3A Docker \u76EE\u6807 \u2014 \u70B9\u51FB\u6253\u5F00\u9762\u677F\u67E5\u770B/\u914D\u7F6E";v.addAction(gt,"\u5BB9\u5668",A,()=>{(async()=>{let E=await ut(x,w),I=Number(x.port);De({target:E??"",sessionHint:E===void 0?{host:typeof x.host=="string"?x.host:"",port:Number.isInteger(I)&&I>0?I:22,book:w}:void 0})})()})}),(async()=>{for(let v=0;v<3;v+=1){if(await ve()){typeof r.requestRender=="function"&&r.requestRender();return}await new Promise(x=>setTimeout(x,2e3))}})())}),()=>{k(),i(),n(),Re()}},be}});})();
