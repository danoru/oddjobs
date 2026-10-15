import * as Sync from "./sync.js";

/**
 * The "Tear-Off board" window (GM only): every poster for the current table,
 * who tore it, and whether the matching actor has been handed over.
 *
 * ApplicationV2 without Handlebars: we override _renderHTML to build the
 * markup and _replaceHTML to put it in the window. ASSUMPTION: this is the
 * documented way to use ApplicationV2 on v12 and v13, and `actions` handlers
 * run with `this` bound to the app and (event, target) as arguments.
 *
 * It re-renders whenever the sync loop (scripts/sync.js, every 5 s while a table
 * code is set) gets a new answer, so it stays live while open.
 */

const { ApplicationV2 } = foundry.applications.api;

/** Poster icon keys -> Font Awesome 6 free solid classes (bundled with Foundry). */
const ICONS = {
  sword: "khanda",
  bow: "bullseye",
  dagger: "khanda",
  shield: "shield",
  flame: "fire",
  music: "music",
  book: "book",
  leaf: "leaf",
  moon: "moon",
  skull: "skull",
  fist: "hand-fist",
  eye: "eye",
  anchor: "anchor",
  crown: "crown",
  potion: "flask",
  paw: "paw",
  ghost: "ghost",
  star: "star",
};

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function statusText(row) {
  switch (row.status) {
    case "unclaimed":
      return "Up on the board";
    case "assigned":
      return `Assigned to ${row.user.name}`;
    case "pending":
      return "Claimed, not assigned yet";
    case "gm":
      return "Claimed by a GM user";
    case "no-user":
      return `No Foundry user called "${row.entry.claimedBy}"`;
    case "no-actor":
      return "No imported actor";
    default:
      return "";
  }
}

// Action handlers: Foundry calls these with `this` = the app.
function onRefresh() {
  Sync.refresh();
}

function onAssign(event, target) {
  Sync.assignOne(target.dataset.characterId);
}

function onOpenActor(event, target) {
  game.actors.get(target.dataset.actorId)?.sheet.render(true);
}

export class TearoffBoard extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "tearoff-board",
    classes: ["tearoff-board"],
    tag: "section",
    window: { title: "Tear-Off board", icon: "fa-solid fa-scroll", resizable: true },
    position: { width: 520, height: 560 },
    actions: { refresh: onRefresh, assign: onAssign, openActor: onOpenActor },
  };

  #unsubscribe = null;

  /** Start listening and fetch right away rather than waiting for the next tick. */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.#unsubscribe = Sync.subscribe(() => {
      if (this.rendered) this.render();
    });
    Sync.refresh();
  }

  _onClose(options) {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    super._onClose?.(options);
  }

  async _renderHTML() {
    const { table, rows, error, updatedAt } = Sync.state;
    const autoAssign = game.settings.get(Sync.MODULE_ID, "autoAssign");
    const code = game.settings.get(Sync.MODULE_ID, "tableCode");

    let body;
    if (!String(code ?? "").trim()) {
      body = `<p class="tearoff-empty">No table code yet. Open Game Settings, then Configure Settings, then Tear-Off Table Sync, and enter the five-character code from the GM page.</p>`;
    } else if (!table) {
      body = `<p class="tearoff-empty">${error ? "" : "Loading the board..."}</p>`;
    } else {
      body = `<ul class="tearoff-posters">${rows.map((r) => this.#row(r, autoAssign)).join("")}</ul>`;
    }

    const head = table
      ? `<h2>${esc(table.title)}</h2><p class="tearoff-meta">Table ${esc(table.code)} &middot; ${
          table.cast.filter((c) => c.claimedBy).length
        } of ${table.cast.length} torn${updatedAt ? ` &middot; updated ${updatedAt.toLocaleTimeString()}` : ""}</p>`
      : "";
    const err = error ? `<p class="tearoff-error"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(error)}</p>` : "";

    return `
      <div class="tearoff-toolbar">
        <div>${head}</div>
        <button type="button" data-action="refresh"><i class="fa-solid fa-rotate"></i> Refresh</button>
      </div>
      ${err}${body}`;
  }

  #row(row, autoAssign) {
    const { entry, actor } = row;
    const icon = ICONS[entry.icon] ?? "scroll";
    const claimed = entry.claimedBy
      ? `<span class="tearoff-claimer">${esc(entry.claimedBy)}</span>`
      : `<span class="tearoff-free">unclaimed</span>`;
    const buttons = [
      actor ? `<button type="button" data-action="openActor" data-actor-id="${esc(actor.id)}" title="Open the actor sheet"><i class="fa-solid fa-user"></i></button>` : "",
      row.status === "pending" && !autoAssign
        ? `<button type="button" data-action="assign" data-character-id="${esc(entry.id)}">Assign</button>`
        : "",
    ].join("");
    return `
      <li class="tearoff-poster tearoff-${esc(row.status)}" title="${esc(entry.hook)}">
        <i class="fa-solid fa-${icon} tearoff-icon"></i>
        <div class="tearoff-text">
          <span class="tearoff-header">${esc(entry.header)}</span>
          <strong>${esc(entry.name)}</strong>${entry.alias ? ` <small>(posted as ${esc(entry.alias)})</small>` : ""}
          <div class="tearoff-epithet">${esc(entry.epithet)}</div>
          <div class="tearoff-status">${claimed} &middot; ${esc(statusText(row))}</div>
        </div>
        <div class="tearoff-actions">${buttons}</div>
      </li>`;
  }

  _replaceHTML(result, content) {
    const top = content.scrollTop; // keep the scroll position across live updates
    content.innerHTML = result;
    content.scrollTop = top;
  }
}

let board = null;

/** Open the board, or bring it to the front if it's already open. GM only. */
export function openBoard() {
  if (!game.user.isGM) return;
  board ??= new TearoffBoard();
  board.render({ force: true });
}
