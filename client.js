/**
 * codex-reasoning-bar — the composer's model seat, rebuilt around a draggable
 * reasoning bar ("CodeX 一样的推理等级调整条").
 *
 * The shipped model seat is a trigger plus a two-level menu, and its reasoning
 * effort lives one drill-down away behind a list of rows. This plugin shadows
 * that seat (`conversation.input.model`, a single slot the catalog marks
 * `shadows-shipped-ui`) and renders one panel instead: a Model row that drills
 * into the provider-grouped catalog, then the reasoning bar itself — a wide
 * track with one detent per advertised level, a thumb that follows the pointer
 * one-to-one while dragging, a spring snap onto the nearest detent, and motes
 * of energy drifting through the bar. Nothing is on screen while the panel is
 * closed.
 *
 * The level is carried by the pace and brightness of the motes: the runway they
 * travel is the full track and never changes width, so their spacing (density)
 * stays identical at every level and during a drag, while a window clipped to
 * the thumb keeps them off the unlit rail and makes the knob the end of the
 * stream.
 *
 * It owns no state: the per-session `ModelDirectory` (the `modelDirectories`
 * Client service) behind the seat stays the single source of truth for the
 * current selection and every commit, so the `/model` popup shows the same
 * values and a selection made here is what it shows next.
 */
window.__ModuleLoader__.load({
	id: "dsh-codex-reasoning-bar",
	factory: (require) => {
		const React = require("react");
		const ReactDOM = require("react-dom");
		const h = React.createElement;
		const { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } = React;

		/** Locale namespace for this plugin's dictionaries. */
		const NS = "dsh-reasoning-dial";

		/** Geometry shared by the stylesheet and the inline detent positions. */
		const THUMB = 26;
		const THUMB_INSET = 3;
		/** How many motes speckle the lit fill at once. */
		const PARTICLES = 16;
		/**
		 * Placement sequences: consecutive multiples of an irrational, taken
		 * modulo one, spread over the whole range without the clumps and bare
		 * stretches a plain random draw leaves behind. Two independent irrationals
		 * keep the along-bar phase and the lane from lining up into a diagonal.
		 */
		const PHASE_STEP = 0.6180339887;
		const LANE_STEP = 0.4142135624;
		/** Panel width; wide enough for the bar to read as a power control. */
		const PANEL = 280;
		/** Above this many models the catalog pane grows a search field. */
		const SEARCH_THRESHOLD = 4;

		const CSS = `
.mm_root{position:relative;min-width:0;display:inline-flex}
.mm_trigger{display:flex;align-items:center;gap:4px;height:28px;max-width:min(360px,45cqw);min-width:0;padding:0 4px 0 8px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;font-weight:400;line-height:20px;cursor:pointer;outline:none}
.mm_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.mm_trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary,#4d6bfe))}
.mm_trigger:disabled{color:var(--dsw-alias-label-dimmed,var(--dsw-alias-label-secondary));cursor:default}
.mm_triggerLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:var(--dsh-composer-model-text-display,block)}
.mm_triggerEffort{flex-shrink:1000;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));display:var(--dsh-composer-model-text-display,block)}
.mm_triggerIcon{display:var(--dsh-composer-model-icon-display,none);flex:none}
.mm_chevron{flex:none;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));transition:transform .12s ease}
.mm_chevron[data-open='true']{transform:rotate(180deg)}
.mm_spin{flex:none;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));animation:mm_spin 900ms linear infinite}
@keyframes mm_spin{to{transform:rotate(360deg)}}
.mm_panel{position:fixed;z-index:1100;box-sizing:border-box;display:flex;flex-direction:column;padding:6px;border:0;border-radius:var(--dsw-radius-lg,12px);--dsrd-glass:var(--dsw-specific-menu,var(--dsw-menu-surface-fill,rgba(67,69,74,.45)));background:var(--dsrd-glass);background:color-mix(in srgb,var(--dsrd-glass) 65%,transparent);-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%));backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%));--dsw-elevation-stroke-color:var(--dsw-alias-border-l1,rgba(128,128,128,.24));box-shadow:var(--dsw-elevation-prominent,0 8px 28px rgba(0,0,0,.32));color:var(--dsw-alias-label-primary)}
.mm_row{display:flex;align-items:center;gap:8px;width:100%;height:36px;padding:0 8px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:inherit;font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer;outline:none}
.mm_row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.mm_row:focus-visible{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary,#4d6bfe))}
.mm_rowLabel{flex:none;color:var(--dsw-alias-label-secondary)}
.mm_rowValue{flex:1 1 auto;min-width:0;overflow:hidden;text-align:right;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.mm_rowIcon{flex:none;display:flex;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary))}
.mm_sep{height:1px;margin:4px 8px;background:var(--dsw-alias-border-l1,rgba(128,128,128,.24))}
.mm_field{display:flex;flex-direction:column;gap:6px;padding:4px 8px 6px}
.mm_fieldHead{display:flex;align-items:center;gap:8px}
.mm_fieldValue{flex:1 1 auto;min-width:0;overflow:hidden;text-align:right;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:18px;color:var(--dsw-alias-label-primary)}
.mm_search{box-sizing:border-box;width:100%;height:28px;margin:2px 0 4px;padding:0 8px;border:0;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;outline:none}
.mm_search::placeholder{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary))}
.mm_search:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary,#4d6bfe))}
.mm_list{display:flex;flex-direction:column;max-height:min(320px,50vh);overflow-y:auto;overscroll-behavior:contain}
.mm_group{padding:6px 8px 2px;font-size:11px;line-height:16px;letter-spacing:.02em;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary))}
.mm_option{display:flex;align-items:center;gap:8px;width:100%;height:30px;padding:0 8px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer;outline:none}
.mm_option:hover,.mm_option[data-active='true']{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.mm_optionLabel{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mm_optionMark{flex:none;display:flex;color:var(--dsw-alias-brand-primary,#4d6bfe)}
.mm_note{padding:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.mm_error{margin-top:4px;padding:6px 8px;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-interactive-bg-hover-danger,rgba(220,80,80,.16));color:var(--dsw-alias-state-error-primary,#e5484d);font-size:12px;line-height:18px}
.mm_retry{margin-left:6px;border:0;background:none;color:inherit;font:inherit;font-size:12px;text-decoration:underline;cursor:pointer;padding:0}
.dsrd_track{position:relative;box-sizing:border-box;width:100%;height:30px;padding:0;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;cursor:grab;touch-action:none;outline:none;transition:background-color 140ms ease}
.dsrd_track:hover,.dsrd_track[data-dsrd-active='true']{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.dsrd_track:active{cursor:grabbing}
.dsrd_track:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary,#4d6bfe));outline-offset:2px}
.dsrd_rail{position:absolute;left:${THUMB_INSET}px;right:${THUMB_INSET}px;top:50%;height:24px;margin-top:-12px;border-radius:12px;corner-shape:round;background:var(--dsw-alias-border-l1,rgba(128,128,128,.28));overflow:hidden}
.dsrd_fill{position:absolute;left:0;top:0;height:100%;width:calc(var(--dsrd-ratio,0) * 100%);border-radius:12px;corner-shape:round;background:linear-gradient(90deg,#2f7cf6 0%,#5b6cf0 52%,#8e5fe0 100%);transition:width 260ms cubic-bezier(.34,1.32,.64,1)}
.dsrd_dot{position:absolute;top:50%;width:2px;height:8px;margin:-4px 0 0 -1px;border-radius:1px;background:rgba(255,255,255,.32);transition:transform 180ms ease,background-color 180ms ease}
.dsrd_dot[data-dsrd-state='passed']{background:rgba(255,255,255,.55)}
.dsrd_dot[data-dsrd-state='preview']{background:#fff;transform:scaleY(1.4)}
.dsrd_particles{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;clip-path:inset(0 calc((1 - var(--dsrd-ratio,0)) * 100%) 0 0)}
.dsrd_particle{position:absolute;left:0;border-radius:999px;corner-shape:round;background:currentColor;color:#fff;box-shadow:0 0 4px currentColor;opacity:0;transform:translate(-50%,-50%);animation-name:dsrd_flow;animation-timing-function:linear;animation-iteration-count:infinite}
/* Every mote keeps its own lane and runs straight to the right; only speed,
 * lane, size and phase differ, so the bar is speckled rather than lined. */
@keyframes dsrd_flow{
0%{left:0;opacity:0}
12%{opacity:var(--dsrd-alpha,.8)}
88%{opacity:var(--dsrd-alpha,.8)}
100%{left:100%;opacity:0}
}
.dsrd_thumb{position:absolute;top:50%;left:calc(var(--dsrd-ratio,0) * (100% - ${THUMB}px));width:${THUMB}px;height:${THUMB}px;margin-top:-${THUMB / 2}px;border-radius:999px;corner-shape:round;background:#fff;box-shadow:var(--dsw-elevation-soft,0 1px 3px rgba(0,0,0,.22));transition:left 260ms cubic-bezier(.34,1.32,.64,1),transform 140ms ease,box-shadow 140ms ease}
.dsrd_track[data-dsrd-dragging='true'] .dsrd_thumb{transform:scale(1.08);box-shadow:var(--dsw-elevation-prominent,0 2px 8px rgba(0,0,0,.28))}
.dsrd_track[data-dsrd-dragging='true'] .dsrd_fill,.dsrd_track[data-dsrd-dragging='true'] .dsrd_thumb{transition:none}
.dsrd_track[data-dsrd-pending='true'] .dsrd_thumb{animation:dsrd_pulse 1.1s ease-in-out infinite}
@keyframes dsrd_pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}
@media (prefers-reduced-motion:reduce){.mm_spin{animation:none}.dsrd_track,.dsrd_fill,.dsrd_dot,.dsrd_thumb{transition:none}.dsrd_particle{display:none}.dsrd_track[data-dsrd-pending='true'] .dsrd_thumb{animation:none}}
`;

		const zh = {
			"menu.model": "模型",
			"menu.effort": "推理强度",
			"menu.aria": "模型与推理强度",
			"trigger.select": "选择模型",
			"trigger.aria": "选择模型，当前 {model}",
			"trigger.ariaEffort": "选择模型，当前 {model}，推理强度 {effort}",
			"trigger.loading": "正在应用选择",
			"dial.aria": "推理强度",
			"dial.hint": "拖动调整推理强度",
			"effort.default": "默认",
			"effort.none": "该模型未提供推理强度",
			"search.placeholder": "搜索模型",
			"search.empty": "没有匹配的模型",
			"empty.models": "没有可用的模型。",
			"action.retry": "重试",
			"error.sessionInUse": "该会话正被其他写入方占用，请退出其他正在运行的 DSH 后重试。",
		};
		const en = {
			"menu.model": "Model",
			"menu.effort": "Reasoning effort",
			"menu.aria": "Model and reasoning effort",
			"trigger.select": "Select model",
			"trigger.aria": "Select model, current {model}",
			"trigger.ariaEffort": "Select model, current {model}, reasoning effort {effort}",
			"trigger.loading": "Applying selection",
			"dial.aria": "Reasoning effort",
			"dial.hint": "Drag to set reasoning effort",
			"effort.default": "Default",
			"effort.none": "This model provides no reasoning effort levels",
			"search.placeholder": "Search models",
			"search.empty": "No matching model",
			"empty.models": "No models available.",
			"action.retry": "Retry",
			"error.sessionInUse": "Another writer holds this session — quit other running DSH instances and retry.",
		};

		/** Snapshot stand-in so hooks run before the real directory resolves. */
		const EMPTY_STATE = {
			current: null,
			retainedEffort: void 0,
			routable: null,
			groups: [],
			failures: [],
			status: "idle",
			pending: null,
			error: null,
		};
		const EMPTY_STORE = {
			subscribe: () => () => {},
			getSnapshot: () => EMPTY_STATE,
		};

		/**
		 * Find one model in the directory's provider groups.
		 * @param groups - provider-grouped catalog.
		 * @param provider - provider id owning the model.
		 * @param model - provider-owned model id.
		 * @returns the model entry, or absence.
		 */
		function findModel(groups, provider, model) {
			const group = groups.find((entry) => entry.id === provider);
			return group === void 0 ? void 0 : group.models.find((entry) => entry.id === model);
		}

		/**
		 * Build the ordered levels the bar offers for one model.
		 * @param reasoning - the model's advertised reasoning metadata.
		 * @param effective - the effort currently in force.
		 * @param retained - the last level name the directory kept for display.
		 * @param t - namespace-bound translate.
		 * @returns level entries, lowest to highest.
		 */
		function levelsOf(reasoning, effective, retained, t) {
			if (reasoning === void 0) return [];
			const levels = [
				...(reasoning.defaultEffort === void 0
					? [{ key: "dsrd:default", effort: void 0, label: t("effort.default"), hint: void 0 }]
					: []),
				...(reasoning.efforts ?? []).map((effort) => ({
					key: `dsrd:${effort.id}`,
					effort: effort.id,
					label: effort.name,
					hint: effort.description,
				})),
			];
			// A saved effort the adapter no longer advertises still needs a detent,
			// otherwise the bar would silently claim a different level.
			if (effective !== void 0 && !levels.some((level) => level.effort === effective)) {
				levels.push({
					key: `dsrd:retained:${String(effective)}`,
					effort: effective,
					label: retained ?? String(effective),
					hint: void 0,
				});
			}
			return levels;
		}

		/**
		 * Filter and rank models inside one provider group by an ordered
		 * case-insensitive subsequence, prefix matches first.
		 * @param models - the group's models in catalog order.
		 * @param query - raw search text.
		 * @returns matching models in display order.
		 */
		function rankModels(models, query) {
			const needle = query.trim().toLowerCase();
			if (needle === "") return models;
			const scored = [];
			for (const model of models) {
				const name = String(model.name ?? model.id).toLowerCase();
				const id = String(model.id).toLowerCase();
				let score = -1;
				for (const haystack of [name, id]) {
					let at = 0;
					let gaps = 0;
					let first = -1;
					for (const char of needle) {
						const found = haystack.indexOf(char, at);
						if (found < 0) { at = -1; break; }
						if (first < 0) first = found;
						gaps += found - at;
						at = found + 1;
					}
					if (at >= 0) {
						const value = gaps + (first > 0 ? 1 : 0);
						score = score < 0 ? value : Math.min(score, value);
					}
				}
				if (score >= 0) scored.push({ model, score });
			}
			scored.sort((a, b) => a.score - b.score);
			return scored.map((entry) => entry.model);
		}

		/** Chevron pointing down (the closed/open trigger affordance). */
		function ChevronDown() {
			return h(
				"svg",
				{ viewBox: "0 0 16 16", width: 12, height: 12, fill: "none", "aria-hidden": true },
				h("path", {
					d: "M4 6.5 8 10.5 12 6.5",
					stroke: "currentColor",
					strokeWidth: 1.5,
					strokeLinecap: "round",
					strokeLinejoin: "round",
				}),
			);
		}

		/** Chevron pointing right (a row that drills into another pane). */
		function ChevronRight() {
			return h(
				"svg",
				{ viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", "aria-hidden": true },
				h("path", {
					d: "M6.5 4 10.5 8 6.5 12",
					stroke: "currentColor",
					strokeWidth: 1.5,
					strokeLinecap: "round",
					strokeLinejoin: "round",
				}),
			);
		}

		/** Check mark for the model in force. */
		function CheckMark() {
			return h(
				"svg",
				{ viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", "aria-hidden": true },
				h("path", {
					d: "M3.5 8.5 6.5 11.5 12.5 4.5",
					stroke: "currentColor",
					strokeWidth: 1.6,
					strokeLinecap: "round",
					strokeLinejoin: "round",
				}),
			);
		}

		/** Indeterminate ring shown while a selection is in flight. */
		function Spinner() {
			return h(
				"svg",
				{ viewBox: "0 0 16 16", width: 12, height: 12, className: "mm_spin", "aria-hidden": true },
				h("circle", {
					cx: 8,
					cy: 8,
					r: 6,
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.8,
					strokeLinecap: "round",
					strokeDasharray: "10 28",
				}),
			);
		}

		/** Compact model glyph used when the toolbar cannot fit the text. */
		function ModelGlyph() {
			return h(
				"svg",
				{ viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", "aria-hidden": true },
				h("path", {
					d: "M8 2 14 5.2v5.6L8 14 2 10.8V5.2z",
					stroke: "currentColor",
					strokeWidth: 1.2,
					strokeLinejoin: "round",
				}),
				h("path", {
					d: "M2 5.2 8 8.4l6-3.2M8 8.4V14",
					stroke: "currentColor",
					strokeWidth: 1.2,
					strokeLinejoin: "round",
				}),
			);
		}

		/**
		 * The draggable reasoning bar.
		 * @param props - levels, the effort in force, a commit verb and i18n.
		 * @returns the track with its lit fill, detents, motes and thumb.
		 */
		function ReasoningDial(props) {
			const { levels, effective, pending, onSelect, t } = props;
			const count = levels.length;
			const last = Math.max(1, count - 1);
			const committed = levels.findIndex((level) => level.effort === effective);

			const [pointer, setPointer] = useState(null);
			const railRef = useRef(null);

			const displayIndex = pointer === null ? committed : pointer.target;
			const ratio = pointer !== null ? pointer.ratio : committed < 0 ? 0 : committed / last;
			const dragging = pointer !== null && pointer.active;

			// Settle the optimistic position once the directory reports the value
			// back; a failure clears it so the thumb returns to the real level.
			useEffect(() => {
				if (pointer === null || pointer.active) return;
				if (pointer.target === committed) setPointer(null);
			}, [pointer, committed]);

			useEffect(() => {
				if (pointer === null || pointer.active) return;
				const timer = setTimeout(() => setPointer(null), 5000);
				return () => clearTimeout(timer);
			}, [pointer]);

			// Energy speckling the bar. Every mote holds its own lane and runs straight
			// to the right along the WHOLE track, and a window clipped to the thumb's
			// live position keeps the stream off the unlit rail — the thumb is the
			// endpoint. The two jobs are deliberately separate:
			//
			//   runway  = the full track, always. Fixed width means fixed spacing, so
			//             the speckle keeps the same density at every level and while a
			//             drag restates the lit width every frame. Tying the runway to
			//             the lit width instead would pack the same population into a
			//             narrower strip at lower levels, and the stream would get
			//             denser as the level went down.
			//   window  = the thumb, so motes never cross into the grey.
			//
			// The level is carried by pace and brightness only, which is what the drag
			// must leave alone: this is keyed to the level actually in force, never to
			// the preview under the pointer, and the draw is memoized because
			// re-rendering must not redraw a mote — restating an animation's duration
			// mid-flight stalls the stream.
			const heat = last === 0 || committed < 0 ? 0 : committed / last;
			const motes = useMemo(() => {
				const flow = 4.2 * Math.pow(0.72, committed < 0 ? 0 : committed);
				const alpha = (0.6 + 0.4 * heat).toFixed(3);
				return Array.from({ length: PARTICLES }, (_, index) => {
					// 0.85x to 1.15x the level's pace: neighbouring motes drift apart and
					// close up again without ever collecting into one knot.
					const duration = flow * (0.85 + Math.random() * 0.3);
					// Lanes stay clear of the pill's edges, so a mote is never half
					// clipped by the rounded cap it happens to travel under.
					const lane = 16 + ((index * LANE_STEP) % 1) * 68;
					const phase = (index * PHASE_STEP) % 1;
					return h("span", {
						key: index,
						className: "dsrd_particle",
						style: {
							top: `${lane.toFixed(1)}%`,
							width: `${(2.4 + Math.random() * 2.6).toFixed(2)}px`,
							height: `${(2.4 + Math.random() * 2.6).toFixed(2)}px`,
							animationDuration: `${duration.toFixed(3)}s`,
							animationDelay: `${(-phase * duration).toFixed(3)}s`,
							"--dsrd-alpha": alpha,
						},
					});
				});
			}, [committed, last, heat]);

			/**
			 * Commit one level through the owning directory.
			 * @param index - index into the offered levels.
			 */
			const commit = (index) => {
				const level = levels[index];
				if (level === void 0) return;
				if (level.effort === effective) {
					setPointer(null);
					return;
				}
				const result = onSelect(level.effort);
				// A rejected selection must drop the optimistic position at once, so
				// the thumb falls back to the level actually in force.
				if (result !== void 0 && typeof result.then === "function") result.catch(() => setPointer(null));
			};

			/**
			 * Read the pointer's position as a 0..1 ratio along the rail.
			 * @param event - the pointer event.
			 * @returns the clamped ratio.
			 */
			const ratioOf = (event) => {
				const rail = railRef.current;
				if (rail === null) return 0;
				const rect = rail.getBoundingClientRect();
				if (rect.width <= 0) return 0;
				return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
			};

			if (count < 2 || committed < 0) return null;

			const label = levels[displayIndex]?.label ?? "";
			const hint = levels[displayIndex]?.hint;
			const place = (index) => `calc(${(index / last).toFixed(6)} * 100%)`;

			const onPointerDown = (event) => {
				if (event.pointerType === "mouse" && event.button !== 0) return;
				const next = ratioOf(event);
				event.currentTarget.setPointerCapture?.(event.pointerId);
				// preventDefault would otherwise suppress the click's native focus,
				// which is what keeps arrow keys working straight after a drag.
				event.currentTarget.focus?.({ preventScroll: true });
				setPointer({ ratio: next, active: true, target: Math.round(next * last) });
				event.preventDefault();
			};

			const onPointerMove = (event) => {
				if (pointer === null || !pointer.active) return;
				const next = ratioOf(event);
				setPointer({ ratio: next, active: true, target: Math.round(next * last) });
				event.preventDefault();
			};

			const onPointerUp = (event) => {
				if (pointer === null || !pointer.active) return;
				const target = Math.round(ratioOf(event) * last);
				setPointer({ ratio: target / last, active: false, target });
				commit(target);
				event.preventDefault();
			};

			const onPointerCancel = () => {
				if (pointer !== null && pointer.active) setPointer(null);
			};

			const onKeyDown = (event) => {
				let next = null;
				switch (event.key) {
					case "ArrowLeft":
					case "ArrowDown":
						next = displayIndex - 1;
						break;
					case "ArrowRight":
					case "ArrowUp":
						next = displayIndex + 1;
						break;
					case "Home":
					case "PageDown":
						next = 0;
						break;
					case "End":
					case "PageUp":
						next = last;
						break;
					default:
						return;
				}
				event.preventDefault();
				event.stopPropagation();
				next = Math.min(last, Math.max(0, next));
				if (next === displayIndex) return;
				setPointer({ ratio: next / last, active: false, target: next });
				commit(next);
			};

			return h(
				"div",
				{
					className: "dsrd_track",
					role: "slider",
					tabIndex: 0,
					"data-dsrd-dragging": dragging ? "true" : void 0,
					"data-dsrd-active": dragging ? "true" : void 0,
					"data-dsrd-pending": pending ? "true" : void 0,
					"aria-label": t("dial.aria"),
					"aria-orientation": "horizontal",
					"aria-valuemin": 0,
					"aria-valuemax": last,
					"aria-valuenow": displayIndex,
					"aria-valuetext": label,
					title: `${t("dial.aria")} · ${label} — ${hint || t("dial.hint")}`,
					style: { "--dsrd-ratio": String(ratio) },
					onPointerDown,
					onPointerMove,
					onPointerUp,
					onPointerCancel,
					onKeyDown,
				},
				h(
					"div",
					{ className: "dsrd_rail", ref: railRef },
					h("div", { className: "dsrd_fill" }),
					levels.map((level, index) =>
						h("span", {
							key: level.key,
							className: "dsrd_dot",
							style: { left: place(index) },
							"data-dsrd-state":
								index === displayIndex && dragging
									? "preview"
									: index <= displayIndex
										? "passed"
										: "idle",
						}),
					),
					h(
						"div",
						{ className: "dsrd_particles", key: `motes-${committed}`, "aria-hidden": true },
						motes,
					),
					h("div", { className: "dsrd_thumb" }),
				),
			);
		}

		/**
		 * The composer's model seat: a trigger plus one panel holding the model
		 * row and the reasoning bar.
		 * @param props - injected face (available + shared directory store and
		 * commit verb), the owner's `locked` share and the locale seat.
		 * @returns the trigger and, while open, the panel.
		 */
		function ModelReasoningSeat(props) {
			const { locked, available, directory, load, select, t } = props;
			const store = directory === void 0 || directory === null ? EMPTY_STORE : directory;
			const state = useSyncExternalStore(
				useCallback((notify) => store.subscribe(notify), [store]),
				useCallback(() => store.getSnapshot(), [store]),
			);

			const [open, setOpen] = useState(false);
			const [pane, setPane] = useState("root");
			const [query, setQuery] = useState("");
			const [highlight, setHighlight] = useState(0);
			const [placement, setPlacement] = useState(null);
			const triggerRef = useRef(null);
			const panelRef = useRef(null);
			const searchRef = useRef(null);
			const loadRef = useRef(load);

			useEffect(() => {
				loadRef.current = load;
			}, [load]);

			useEffect(() => {
				if (typeof loadRef.current === "function") loadRef.current();
			}, [store]);

			const current = state.current ?? null;
			const groups = Array.isArray(state.groups) ? state.groups : [];
			const model = current === null ? void 0 : findModel(groups, current.provider, current.model);
			const reasoning = model === void 0 ? void 0 : model.reasoning;
			const levels = useMemo(
				() => levelsOf(reasoning, current === null ? void 0 : current.reasoningEffort ?? reasoning?.defaultEffort, state.retainedEffort, t),
				[reasoning, current, state.retainedEffort, t],
			);
			const effective = current === null ? void 0 : current.reasoningEffort ?? reasoning?.defaultEffort;
			const pending = state.pending !== null && state.pending !== void 0;
			const modelLabel = model === void 0 ? (current === null ? null : `${current.provider}/${current.model}`) : model.name ?? model.id;
			const effortLabel =
				reasoning === void 0
					? state.retainedEffort
					: effective === void 0
						? t("effort.default")
						: levels.find((level) => level.effort === effective)?.label ?? String(effective);

			const filtered = useMemo(
				() =>
					groups
						.map((group) => ({ id: group.id, name: group.name ?? group.id, models: rankModels(group.models, query) }))
						.filter((group) => group.models.length > 0),
				[groups, query],
			);
			const flat = useMemo(() => filtered.flatMap((group) => group.models.map((entry) => ({ group: group.id, model: entry }))), [filtered]);
			const showSearch = groups.reduce((total, group) => total + group.models.length, 0) > SEARCH_THRESHOLD;

			// Anchor above the trigger, keeping the panel inside the viewport. This
			// runs before paint so the panel never flashes at the wrong origin.
			useLayoutEffect(() => {
				if (!open) return;
				const trigger = triggerRef.current;
				if (trigger === null) return;
				const rect = trigger.getBoundingClientRect();
				const width = Math.min(PANEL, window.innerWidth - 16);
				const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
				setPlacement({ left, bottom: Math.max(8, window.innerHeight - rect.top + 8), width });
			}, [open]);

			// Close on an outside press or Escape.
			useEffect(() => {
				if (!open) return;
				const onPress = (event) => {
					if (panelRef.current?.contains(event.target) === true) return;
					if (triggerRef.current?.contains(event.target) === true) return;
					setOpen(false);
				};
				const onKey = (event) => {
					if (event.key !== "Escape") return;
					event.stopPropagation();
					if (pane !== "root") setPane("root");
					else setOpen(false);
				};
				document.addEventListener("pointerdown", onPress, true);
				document.addEventListener("keydown", onKey, true);
				return () => {
					document.removeEventListener("pointerdown", onPress, true);
					document.removeEventListener("keydown", onKey, true);
				};
			}, [open, pane]);

			useEffect(() => {
				if (!open) {
					setPane("root");
					setQuery("");
					return;
				}
				if (pane === "models") searchRef.current?.focus();
				else panelRef.current?.focus?.({ preventScroll: true });
			}, [open, pane]);

			useEffect(() => {
				setHighlight(0);
			}, [query]);

			/**
			 * Commit one complete selection through the shared directory.
			 * @param selection - provider, model and optional effort.
			 * @returns the directory's selection outcome.
			 */
			const commitSelection = async (selection) => {
				const result = await select(selection);
				if (result !== void 0 && result !== null && result.ok === false) {
					const code = result.error?.code;
					throw new Error(code === "session/writer-held" ? t("error.sessionInUse") : result.error?.message ?? code);
				}
				return result;
			};

			/**
			 * Apply one reasoning level to the model already in force.
			 * @param effort - adapter-owned effort id, or undefined for the default.
			 * @returns the selection outcome.
			 */
			const applyEffort = (effort) =>
				current === null
					? Promise.resolve(void 0)
					: commitSelection({
							provider: current.provider,
							model: current.model,
							...(effort === void 0 ? {} : { reasoningEffort: effort }),
						});

			/**
			 * Apply one catalog model together with its own default effort.
			 * @param provider - provider id owning the model.
			 * @param entry - the chosen catalog model.
			 */
			const applyModel = (provider, entry) => {
				commitSelection({
					provider,
					model: entry.id,
					...(entry.reasoning?.defaultEffort === void 0 ? {} : { reasoningEffort: entry.reasoning.defaultEffort }),
				})
					.then(() => setOpen(false))
					.catch(() => {});
			};

			const onListKeyDown = (event) => {
				if (pane !== "models") return;
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					const step = event.key === "ArrowDown" ? 1 : -1;
					setHighlight((index) => Math.min(flat.length - 1, Math.max(0, index + step)));
					return;
				}
				if (event.key === "Enter") {
					event.preventDefault();
					const entry = flat[highlight];
					if (entry !== void 0) applyModel(entry.group, entry.model);
				}
			};

			if (!available) return null;

			const triggerLabel = modelLabel ?? t("trigger.select");
			const triggerAria = pending
				? t("trigger.loading")
				: current === null
					? t("trigger.aria", { model: triggerLabel })
					: t("trigger.ariaEffort", { model: triggerLabel, effort: effortLabel ?? "" });

			return h(
				"div",
				{ className: "mm_root" },
				h("style", { key: "mm-style", dangerouslySetInnerHTML: { __html: CSS } }),
				h(
					"button",
					{
						type: "button",
						ref: triggerRef,
						className: "mm_trigger",
						disabled: locked === true,
						"aria-haspopup": "menu",
						"aria-expanded": open,
						"aria-label": triggerAria,
						title: triggerAria,
						onClick: () => setOpen((value) => !value),
					},
					h("span", { className: "mm_triggerIcon" }, h(ModelGlyph)),
					h("span", { className: "mm_triggerLabel" }, triggerLabel),
					effortLabel === void 0 ? null : h("span", { className: "mm_triggerEffort" }, effortLabel),
					pending ? h(Spinner) : h("span", { className: "mm_chevron", "data-open": open ? "true" : void 0 }, h(ChevronDown)),
				),
				open && placement !== null
					? ReactDOM.createPortal(
							h(
								"div",
								{
									ref: panelRef,
									className: "mm_panel",
									role: "menu",
									"aria-label": t("menu.aria"),
									tabIndex: -1,
									onKeyDown: onListKeyDown,
									style: { left: placement.left, bottom: placement.bottom, width: placement.width },
								},
								pane === "root"
									? h(
											React.Fragment,
											null,
											h(
												"button",
												{
													type: "button",
													className: "mm_row",
													role: "menuitem",
													onClick: () => setPane("models"),
												},
												h("span", { className: "mm_rowLabel" }, t("menu.model")),
												h("span", { className: "mm_rowValue" }, modelLabel ?? t("trigger.select")),
												h("span", { className: "mm_rowIcon" }, h(ChevronRight)),
											),
											h("div", { className: "mm_sep" }),
											h(
												"div",
												{ className: "mm_field" },
												h(
													"div",
													{ className: "mm_fieldHead" },
													h("span", { className: "mm_rowLabel" }, t("menu.effort")),
													h("span", { className: "mm_fieldValue" }, effortLabel ?? t("effort.none")),
												),
												reasoning === void 0
													? h("div", { className: "mm_note" }, t("effort.none"))
													: h(ReasoningDial, {
															levels,
															effective,
															pending,
															onSelect: applyEffort,
															t,
														}),
											),
											state.error === null || state.error === void 0
												? null
												: h(
														"div",
														{ className: "mm_error" },
														String(state.error),
														h(
															"button",
															{
																type: "button",
																className: "mm_retry",
																onClick: () => {
																	if (typeof loadRef.current === "function") loadRef.current();
																},
															},
															t("action.retry"),
														),
													),
										)
									: h(
											React.Fragment,
											null,
											showSearch
												? h("input", {
														ref: searchRef,
														className: "mm_search",
														type: "text",
														value: query,
														placeholder: t("search.placeholder"),
														onChange: (event) => setQuery(event.target.value),
														onKeyDown: onListKeyDown,
													})
												: null,
											h(
												"div",
												{ className: "mm_list", role: "listbox" },
												flat.length === 0
													? h("div", { className: "mm_note" }, groups.length === 0 ? t("empty.models") : t("search.empty"))
													: filtered.map((group) =>
															h(
																React.Fragment,
																{ key: group.id },
																h("div", { className: "mm_group" }, group.name),
																group.models.map((entry) => {
																	const index = flat.findIndex((item) => item.group === group.id && item.model.id === entry.id);
																	const selected = current !== null && current.provider === group.id && current.model === entry.id;
																	return h(
																		"button",
																		{
																			key: `${group.id}/${entry.id}`,
																			type: "button",
																			role: "option",
																			className: "mm_option",
																			"aria-selected": selected,
																			"data-active": index === highlight ? "true" : void 0,
																			onMouseEnter: () => setHighlight(index),
																			onClick: () => applyModel(group.id, entry),
																		},
																		h("span", { className: "mm_optionLabel" }, entry.name ?? entry.id),
																		selected ? h("span", { className: "mm_optionMark" }, h(CheckMark)) : null,
																	);
																}),
															),
														),
											),
										),
							),
							document.body,
						)
					: null,
			);
		}

		/**
		 * Client plugin body: register the dictionaries, then take over the
		 * composer's model seat with the panel above.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "reasoning-dial: dictionaries");
			const t = ctx.locale.bind(NS);

			ctx.inject(["slots", "modelDirectories", "sessions"], (scope) => {
				const models = scope.modelDirectories;
				const sessions = scope.sessions;
				const isSubagent = (sessionId) => {
					const read = sessions?.subagentAddress;
					return typeof read === "function" ? read.call(sessions, sessionId) !== void 0 : false;
				};

				scope.slots.inject("conversation.input.model", () => {
					try {
						return scope.slots.register(
							{
								name: "conversation.input.model",
								// The shipped seat registers at priority 0; a lower priority
								// renders instead of it, which is what `shadows-shipped-ui`
								// means for this single slot.
								priority: -1,
								locale: NS,
								inject: (sessionId) => {
									const directory = models.directoryFor(sessionId);
									const available = !isSubagent(sessionId);
									return {
										available,
										directory: directory.store,
										load: () => {
											if (available) directory.load().catch(() => {});
										},
										select: (selection) =>
											available ? directory.select(selection) : Promise.resolve({ ok: true, value: void 0 }),
									};
								},
							},
							ModelReasoningSeat,
						);
					} catch (error) {
						// Two copies of this bundle can end up mounted at once — a dev
						// link beside the packaged install, say — and a single slot takes
						// one registration per priority. The copy that got there first
						// already owns the seat, so backing off is the right answer;
						// anything else is a real failure and keeps propagating.
						if (!/already has a registration/.test(String(error?.message ?? error))) throw error;
						return () => {};
					}
				});
			});
		}

		return { inject: ["slots", "locale"], apply };
	},
});
