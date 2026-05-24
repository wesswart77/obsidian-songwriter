var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => SongwriterPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  songsFolder: "Songs",
  snippetsFolder: "Songs/Snippets"
};
var STATUS_ORDER = ["idea", "draft", "demo", "finished"];
function slugify(s) {
  return s.replace(/[/\\:*?"<>|#^[\]]/g, "-").trim();
}
async function ensureFolder(app, path) {
  if (!app.vault.getAbstractFileByPath(path)) {
    try {
      await app.vault.createFolder(path);
    } catch (_) {
    }
  }
}
async function createNote(app, folder, filename, content) {
  await ensureFolder(app, folder);
  const path = `${folder}/${slugify(filename)}.md`;
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof import_obsidian.TFile) {
    await app.vault.modify(existing, content);
    return existing;
  }
  return await app.vault.create(path, content);
}
function readFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match)
    return {};
  const result = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1)
      continue;
    result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
  }
  return result;
}
var VIEW_TYPE = "songwriter-sidebar";
var SongwriterView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.activeFilter = "all";
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Songwriter";
  }
  getIcon() {
    return "music";
  }
  async onOpen() {
    await this.render();
  }
  async onClose() {
  }
  async render() {
    var _a, _b;
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("sw-sidebar");
    const header = containerEl.createDiv("sw-header");
    header.createEl("h2", { text: "Songwriter" });
    const actions = containerEl.createDiv("sw-actions");
    const newSongBtn = actions.createEl("button", { text: "+ New Song", cls: "sw-btn-primary" });
    newSongBtn.onclick = () => new NewSongModal(this.app, this.plugin, () => this.render()).open();
    const snippetBtn = actions.createEl("button", { text: "+ Snippet", cls: "sw-btn-secondary" });
    snippetBtn.onclick = () => new LyricSnippetModal(this.app, this.plugin, () => this.render()).open();
    const rhymeBtn = actions.createEl("button", { text: "Rhyme?", cls: "sw-btn-secondary" });
    rhymeBtn.onclick = () => new FindRhymesModal(this.app).open();
    const filters = containerEl.createDiv("sw-filters");
    const allBtn = filters.createEl("button", { text: "All", cls: "sw-filter-btn" });
    if (this.activeFilter === "all")
      allBtn.addClass("active");
    allBtn.onclick = () => {
      this.activeFilter = "all";
      this.render();
    };
    STATUS_ORDER.forEach((status) => {
      const btn = filters.createEl("button", {
        text: status.charAt(0).toUpperCase() + status.slice(1),
        cls: "sw-filter-btn"
      });
      if (this.activeFilter === status)
        btn.addClass("active");
      btn.onclick = () => {
        this.activeFilter = status;
        this.render();
      };
    });
    const songs = this.app.vault.getMarkdownFiles().filter(
      (f) => f.path.startsWith(this.plugin.settings.songsFolder + "/") && !f.path.startsWith(this.plugin.settings.snippetsFolder + "/")
    );
    const filtered = songs.filter(async () => true);
    const songData = [];
    for (const file of songs) {
      const content = await this.app.vault.cachedRead(file);
      const fm = readFrontmatter(content);
      if (this.activeFilter === "all" || fm.status === this.activeFilter) {
        songData.push({ file, fm });
      }
    }
    containerEl.createDiv({ cls: "sw-count", text: `${songData.length} song${songData.length !== 1 ? "s" : ""}` });
    const list = containerEl.createDiv("sw-list");
    if (songData.length === 0) {
      list.createDiv({ cls: "sw-empty", text: "No songs yet. Hit + New Song to start." });
      return;
    }
    songData.sort((a, b) => {
      var _a2, _b2, _c, _d;
      const si = STATUS_ORDER.indexOf((_a2 = a.fm.status) != null ? _a2 : "idea");
      const sj = STATUS_ORDER.indexOf((_b2 = b.fm.status) != null ? _b2 : "idea");
      if (si !== sj)
        return si - sj;
      return ((_c = a.fm.title) != null ? _c : "").localeCompare((_d = b.fm.title) != null ? _d : "");
    });
    for (const { file, fm } of songData) {
      const card = list.createDiv("sw-card");
      const top = card.createDiv("sw-card-top");
      const titleEl = top.createDiv("sw-card-title");
      titleEl.setText((_a = fm.title) != null ? _a : file.basename);
      const status = (_b = fm.status) != null ? _b : "idea";
      const badge = top.createSpan({ cls: `sw-status sw-status-${status}` });
      badge.setText(status);
      const meta = [];
      if (fm.key)
        meta.push(`Key: ${fm.key}`);
      if (fm.tempo)
        meta.push(`${fm.tempo} BPM`);
      if (fm.genre)
        meta.push(fm.genre);
      if (meta.length)
        card.createDiv({ cls: "sw-card-meta", text: meta.join(" \xB7 ") });
      card.onclick = () => this.app.workspace.getLeaf().openFile(file);
    }
  }
};
var NewSongModal = class extends import_obsidian.Modal {
  constructor(app, plugin, onDone) {
    super(app);
    this.data = {
      title: "",
      status: "idea",
      key: "",
      tempo: "",
      timeSignature: "4/4",
      genre: "",
      themes: "",
      influences: ""
    };
    this.plugin = plugin;
    this.onDone = onDone;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("sw-modal");
    contentEl.createEl("h2", { text: "New Song" });
    new import_obsidian.Setting(contentEl).setName("Title").addText((t) => {
      t.setPlaceholder("Song title").onChange((v) => this.data.title = v);
    });
    new import_obsidian.Setting(contentEl).setName("Status").addDropdown((d) => {
      STATUS_ORDER.forEach((s) => d.addOption(s, s.charAt(0).toUpperCase() + s.slice(1)));
      d.onChange((v) => this.data.status = v);
    });
    new import_obsidian.Setting(contentEl).setName("Key").addText((t) => {
      t.setPlaceholder("e.g. C major, A minor").onChange((v) => this.data.key = v);
    });
    new import_obsidian.Setting(contentEl).setName("Tempo (BPM)").addText((t) => {
      t.setPlaceholder("e.g. 120").onChange((v) => this.data.tempo = v);
    });
    new import_obsidian.Setting(contentEl).setName("Time Signature").addText((t) => {
      t.setValue("4/4").onChange((v) => this.data.timeSignature = v);
    });
    new import_obsidian.Setting(contentEl).setName("Genre").addText((t) => {
      t.setPlaceholder("e.g. Folk, Rock").onChange((v) => this.data.genre = v);
    });
    new import_obsidian.Setting(contentEl).setName("Themes").addText((t) => {
      t.setPlaceholder("Comma-separated, e.g. love, loss").onChange((v) => this.data.themes = v);
    });
    new import_obsidian.Setting(contentEl).setName("Influences").addText((t) => {
      t.setPlaceholder("Comma-separated artists").onChange((v) => this.data.influences = v);
    });
    new import_obsidian.Setting(contentEl).addButton(
      (b) => b.setButtonText("Create Song").setCta().onClick(() => this.submit())
    );
  }
  async submit() {
    if (!this.data.title.trim()) {
      new import_obsidian.Notice("Title is required.");
      return;
    }
    const folder = this.plugin.settings.songsFolder;
    const themes = this.data.themes.split(",").filter(Boolean).map((t) => t.trim()).join(", ");
    const influences = this.data.influences.split(",").filter(Boolean).map((i) => i.trim()).join(", ");
    const content = [
      "---",
      `title: "${this.data.title}"`,
      `status: ${this.data.status}`,
      `key: "${this.data.key}"`,
      `tempo: "${this.data.tempo}"`,
      `time_signature: "${this.data.timeSignature}"`,
      `genre: "${this.data.genre}"`,
      `themes: "${themes}"`,
      `influences: "${influences}"`,
      "---",
      "",
      `# ${this.data.title}`,
      "",
      `**Key:** ${this.data.key || "_TBD_"}  `,
      `**Tempo:** ${this.data.tempo ? this.data.tempo + " BPM" : "_TBD_"}  `,
      `**Time:** ${this.data.timeSignature}  `,
      `**Genre:** ${this.data.genre || "_TBD_"}  `,
      ...themes ? [`**Themes:** ${themes}  `] : [],
      ...influences ? [`**Influences:** ${influences}  `] : [],
      "",
      "---",
      "",
      "## Lyrics",
      "",
      "### Verse 1",
      "",
      "_Write verse 1 here..._",
      "",
      "### Chorus",
      "",
      "_Write chorus here..._",
      "",
      "### Verse 2",
      "",
      "_Write verse 2 here..._",
      "",
      "### Bridge",
      "",
      "_Write bridge here..._",
      "",
      "### Outro",
      "",
      "_Write outro here..._",
      "",
      "---",
      "",
      "## Chords",
      "",
      "_Chord chart / progressions here..._",
      "",
      "---",
      "",
      "## Notes",
      "",
      "_Production notes, ideas, thoughts..._",
      "",
      "---",
      "",
      "## Recording Ideas",
      "",
      "_Instrumentation, arrangement, recording concepts..._"
    ].join("\n");
    const file = await createNote(this.app, folder, this.data.title, content);
    new import_obsidian.Notice(`Song "${this.data.title}" created.`);
    this.close();
    this.onDone();
    await this.app.workspace.getLeaf().openFile(file);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var LyricSnippetModal = class extends import_obsidian.Modal {
  constructor(app, plugin, onDone) {
    super(app);
    this.data = { snippet: "", tag: "hook" };
    this.plugin = plugin;
    this.onDone = onDone;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("sw-modal");
    contentEl.createEl("h2", { text: "New Lyric Snippet" });
    new import_obsidian.Setting(contentEl).setName("Snippet").addTextArea((t) => {
      t.inputEl.addClass("sw-textarea");
      t.inputEl.style.minHeight = "100px";
      t.setPlaceholder("Write the lyric snippet here...").onChange((v) => this.data.snippet = v);
    });
    new import_obsidian.Setting(contentEl).setName("Tag").addDropdown((d) => {
      ["hook", "verse", "chorus", "bridge", "unused"].forEach(
        (o) => d.addOption(o, o.charAt(0).toUpperCase() + o.slice(1))
      );
      d.onChange((v) => this.data.tag = v);
    });
    new import_obsidian.Setting(contentEl).addButton(
      (b) => b.setButtonText("Save Snippet").setCta().onClick(() => this.submit())
    );
  }
  async submit() {
    if (!this.data.snippet.trim()) {
      new import_obsidian.Notice("Snippet text is required.");
      return;
    }
    const folder = this.plugin.settings.snippetsFolder;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `Snippet ${timestamp}`;
    const content = [
      "---",
      `tag: ${this.data.tag}`,
      `created: ${new Date().toISOString().slice(0, 10)}`,
      "---",
      "",
      `# Lyric Snippet \u2014 ${this.data.tag}`,
      "",
      this.data.snippet
    ].join("\n");
    const file = await createNote(this.app, folder, filename, content);
    new import_obsidian.Notice(`Snippet saved (${this.data.tag}).`);
    this.close();
    this.onDone();
    await this.app.workspace.getLeaf().openFile(file);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var FindRhymesModal = class extends import_obsidian.Modal {
  constructor() {
    super(...arguments);
    this.word = "";
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("sw-modal");
    contentEl.createEl("h2", { text: "Find Rhymes" });
    contentEl.createEl("p", {
      text: "Enter a word to look up rhymes for. You can check RhymeZone, Rhymer.com, or B-Rhymes for suggestions.",
      cls: "setting-item-description"
    });
    new import_obsidian.Setting(contentEl).setName("Word").addText((t) => {
      t.setPlaceholder("e.g. fire").onChange((v) => this.word = v);
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter")
          this.lookup();
      });
    });
    new import_obsidian.Setting(contentEl).addButton(
      (b) => b.setButtonText("Look Up").setCta().onClick(() => this.lookup())
    );
  }
  lookup() {
    const w = this.word.trim();
    if (!w) {
      new import_obsidian.Notice("Enter a word first.");
      return;
    }
    new import_obsidian.Notice(`Rhymes for "${w}": try rhymezone.com/r/rhyme.cgi?Word=${encodeURIComponent(w)} or b-rhymes.com/r/${encodeURIComponent(w)}`);
    this.close();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var SongwriterSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Songwriter Settings" });
    new import_obsidian.Setting(containerEl).setName("Songs Folder").setDesc("Where song notes are stored.").addText(
      (t) => t.setPlaceholder("Songs").setValue(this.plugin.settings.songsFolder).onChange(async (v) => {
        this.plugin.settings.songsFolder = v || "Songs";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Snippets Folder").setDesc("Where lyric snippet notes are stored.").addText(
      (t) => t.setPlaceholder("Songs/Snippets").setValue(this.plugin.settings.snippetsFolder).onChange(async (v) => {
        this.plugin.settings.snippetsFolder = v || "Songs/Snippets";
        await this.plugin.saveSettings();
      })
    );
  }
};
var SongwriterPlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE, (leaf) => new SongwriterView(leaf, this));
    this.addRibbonIcon("music", "Songwriter", () => this.activateSidebar());
    this.addCommand({
      id: "open-sidebar",
      name: "Open Songwriter sidebar",
      callback: () => this.activateSidebar()
    });
    this.addCommand({
      id: "new-song",
      name: "New Song",
      callback: () => new NewSongModal(this.app, this, () => this.refreshSidebar()).open()
    });
    this.addCommand({
      id: "new-lyric-snippet",
      name: "New Lyric Snippet",
      callback: () => new LyricSnippetModal(this.app, this, () => this.refreshSidebar()).open()
    });
    this.addCommand({
      id: "find-rhymes",
      name: "Find Rhymes",
      callback: () => new FindRhymesModal(this.app).open()
    });
    this.addSettingTab(new SongwriterSettingTab(this.app, this));
  }
  async activateSidebar() {
    var _a;
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = (_a = workspace.getRightLeaf(false)) != null ? _a : workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }
  refreshSidebar() {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if ((leaf == null ? void 0 : leaf.view) instanceof SongwriterView) {
      leaf.view.render();
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
