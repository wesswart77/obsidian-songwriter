import {
	App,
	ItemView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	WorkspaceLeaf,
} from "obsidian";

// ─── Settings ────────────────────────────────────────────────────────────────

interface SongwriterSettings {
	songsFolder: string;
	snippetsFolder: string;
}
const DEFAULT_SETTINGS: SongwriterSettings = {
	songsFolder: "Songs",
	snippetsFolder: "Songs/Snippets",
};

// ─── Types ───────────────────────────────────────────────────────────────────

type SongStatus = "idea" | "draft" | "demo" | "finished";

const STATUS_ORDER: SongStatus[] = ["idea", "draft", "demo", "finished"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(s: string) {
	return s.replace(/[/\\:*?"<>|#^[\]]/g, "-").trim();
}

async function ensureFolder(app: App, path: string) {
	if (!app.vault.getAbstractFileByPath(path)) {
		try { await app.vault.createFolder(path); } catch (_) {}
	}
}

async function createNote(app: App, folder: string, filename: string, content: string): Promise<TFile> {
	await ensureFolder(app, folder);
	const path = `${folder}/${slugify(filename)}.md`;
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		await app.vault.modify(existing, content);
		return existing;
	}
	return await app.vault.create(path, content);
}

function readFrontmatter(content: string): Record<string, string> {
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return {};
	const result: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const idx = line.indexOf(":");
		if (idx === -1) continue;
		result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
	}
	return result;
}

// ─── Sidebar View ─────────────────────────────────────────────────────────────

const VIEW_TYPE = "songwriter-sidebar";

class SongwriterView extends ItemView {
	plugin: SongwriterPlugin;
	activeFilter: SongStatus | "all" = "all";

	constructor(leaf: WorkspaceLeaf, plugin: SongwriterPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() { return VIEW_TYPE; }
	getDisplayText() { return "Songwriter"; }
	getIcon() { return "music"; }

	async onOpen() { await this.render(); }
	async onClose() {}

	async render() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("sw-sidebar");

		const header = containerEl.createDiv("sw-header");
		header.createEl("h2", { text: "Songwriter" });

		// Action buttons
		const actions = containerEl.createDiv("sw-actions");
		const newSongBtn = actions.createEl("button", { text: "+ New Song", cls: "sw-btn-primary" });
		newSongBtn.onclick = () => new NewSongModal(this.app, this.plugin, () => this.render()).open();
		const snippetBtn = actions.createEl("button", { text: "+ Snippet", cls: "sw-btn-secondary" });
		snippetBtn.onclick = () => new LyricSnippetModal(this.app, this.plugin, () => this.render()).open();
		const rhymeBtn = actions.createEl("button", { text: "Rhyme?", cls: "sw-btn-secondary" });
		rhymeBtn.onclick = () => new FindRhymesModal(this.app).open();

		// Status filters
		const filters = containerEl.createDiv("sw-filters");
		const allBtn = filters.createEl("button", { text: "All", cls: "sw-filter-btn" });
		if (this.activeFilter === "all") allBtn.addClass("active");
		allBtn.onclick = () => { this.activeFilter = "all"; this.render(); };

		STATUS_ORDER.forEach((status) => {
			const btn = filters.createEl("button", {
				text: status.charAt(0).toUpperCase() + status.slice(1),
				cls: "sw-filter-btn",
			});
			if (this.activeFilter === status) btn.addClass("active");
			btn.onclick = () => { this.activeFilter = status; this.render(); };
		});

		// Songs list
		const songs = this.app.vault.getMarkdownFiles().filter((f) =>
			f.path.startsWith(this.plugin.settings.songsFolder + "/") &&
			!f.path.startsWith(this.plugin.settings.snippetsFolder + "/")
		);

		const filtered = songs.filter(async () => true); // we filter below with async
		const songData: { file: TFile; fm: Record<string, string> }[] = [];
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

		// Sort by status order then alphabetically
		songData.sort((a, b) => {
			const si = STATUS_ORDER.indexOf((a.fm.status as SongStatus) ?? "idea");
			const sj = STATUS_ORDER.indexOf((b.fm.status as SongStatus) ?? "idea");
			if (si !== sj) return si - sj;
			return (a.fm.title ?? "").localeCompare(b.fm.title ?? "");
		});

		for (const { file, fm } of songData) {
			const card = list.createDiv("sw-card");
			const top = card.createDiv("sw-card-top");
			const titleEl = top.createDiv("sw-card-title");
			titleEl.setText(fm.title ?? file.basename);

			const status = (fm.status ?? "idea") as SongStatus;
			const badge = top.createSpan({ cls: `sw-status sw-status-${status}` });
			badge.setText(status);

			const meta: string[] = [];
			if (fm.key) meta.push(`Key: ${fm.key}`);
			if (fm.tempo) meta.push(`${fm.tempo} BPM`);
			if (fm.genre) meta.push(fm.genre);
			if (meta.length) card.createDiv({ cls: "sw-card-meta", text: meta.join(" · ") });

			card.onclick = () => this.app.workspace.getLeaf().openFile(file);
		}
	}
}

// ─── Modals ──────────────────────────────────────────────────────────────────

class NewSongModal extends Modal {
	plugin: SongwriterPlugin;
	onDone: () => void;
	data = {
		title: "", status: "idea", key: "", tempo: "",
		timeSignature: "4/4", genre: "", themes: "", influences: ""
	};

	constructor(app: App, plugin: SongwriterPlugin, onDone: () => void) {
		super(app);
		this.plugin = plugin;
		this.onDone = onDone;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("sw-modal");
		contentEl.createEl("h2", { text: "New Song" });

		new Setting(contentEl).setName("Title").addText((t) => {
			t.setPlaceholder("Song title").onChange((v) => (this.data.title = v));
		});
		new Setting(contentEl).setName("Status").addDropdown((d) => {
			STATUS_ORDER.forEach((s) => d.addOption(s, s.charAt(0).toUpperCase() + s.slice(1)));
			d.onChange((v) => (this.data.status = v));
		});
		new Setting(contentEl).setName("Key").addText((t) => {
			t.setPlaceholder("e.g. C major, A minor").onChange((v) => (this.data.key = v));
		});
		new Setting(contentEl).setName("Tempo (BPM)").addText((t) => {
			t.setPlaceholder("e.g. 120").onChange((v) => (this.data.tempo = v));
		});
		new Setting(contentEl).setName("Time Signature").addText((t) => {
			t.setValue("4/4").onChange((v) => (this.data.timeSignature = v));
		});
		new Setting(contentEl).setName("Genre").addText((t) => {
			t.setPlaceholder("e.g. Folk, Rock").onChange((v) => (this.data.genre = v));
		});
		new Setting(contentEl).setName("Themes").addText((t) => {
			t.setPlaceholder("Comma-separated, e.g. love, loss").onChange((v) => (this.data.themes = v));
		});
		new Setting(contentEl).setName("Influences").addText((t) => {
			t.setPlaceholder("Comma-separated artists").onChange((v) => (this.data.influences = v));
		});

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Create Song").setCta().onClick(() => this.submit())
		);
	}

	async submit() {
		if (!this.data.title.trim()) { new Notice("Title is required."); return; }
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
			...(themes ? [`**Themes:** ${themes}  `] : []),
			...(influences ? [`**Influences:** ${influences}  `] : []),
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
			"_Instrumentation, arrangement, recording concepts..._",
		].join("\n");

		const file = await createNote(this.app, folder, this.data.title, content);
		new Notice(`Song "${this.data.title}" created.`);
		this.close();
		this.onDone();
		await this.app.workspace.getLeaf().openFile(file);
	}

	onClose() { this.contentEl.empty(); }
}

class LyricSnippetModal extends Modal {
	plugin: SongwriterPlugin;
	onDone: () => void;
	data = { snippet: "", tag: "hook" };

	constructor(app: App, plugin: SongwriterPlugin, onDone: () => void) {
		super(app);
		this.plugin = plugin;
		this.onDone = onDone;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("sw-modal");
		contentEl.createEl("h2", { text: "New Lyric Snippet" });

		new Setting(contentEl).setName("Snippet").addTextArea((t) => {
			t.inputEl.addClass("sw-textarea");
			t.inputEl.style.minHeight = "100px";
			t.setPlaceholder("Write the lyric snippet here...").onChange((v) => (this.data.snippet = v));
		});
		new Setting(contentEl).setName("Tag").addDropdown((d) => {
			["hook", "verse", "chorus", "bridge", "unused"].forEach((o) =>
				d.addOption(o, o.charAt(0).toUpperCase() + o.slice(1))
			);
			d.onChange((v) => (this.data.tag = v));
		});

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Save Snippet").setCta().onClick(() => this.submit())
		);
	}

	async submit() {
		if (!this.data.snippet.trim()) { new Notice("Snippet text is required."); return; }
		const folder = this.plugin.settings.snippetsFolder;
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
		const filename = `Snippet ${timestamp}`;
		const content = [
			"---",
			`tag: ${this.data.tag}`,
			`created: ${new Date().toISOString().slice(0, 10)}`,
			"---",
			"",
			`# Lyric Snippet — ${this.data.tag}`,
			"",
			this.data.snippet,
		].join("\n");
		const file = await createNote(this.app, folder, filename, content);
		new Notice(`Snippet saved (${this.data.tag}).`);
		this.close();
		this.onDone();
		await this.app.workspace.getLeaf().openFile(file);
	}

	onClose() { this.contentEl.empty(); }
}

class FindRhymesModal extends Modal {
	word = "";

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("sw-modal");
		contentEl.createEl("h2", { text: "Find Rhymes" });
		contentEl.createEl("p", {
			text: "Enter a word to look up rhymes for. You can check RhymeZone, Rhymer.com, or B-Rhymes for suggestions.",
			cls: "setting-item-description",
		});

		new Setting(contentEl).setName("Word").addText((t) => {
			t.setPlaceholder("e.g. fire").onChange((v) => (this.word = v));
			t.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") this.lookup();
			});
		});

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Look Up").setCta().onClick(() => this.lookup())
		);
	}

	lookup() {
		const w = this.word.trim();
		if (!w) { new Notice("Enter a word first."); return; }
		new Notice(`Rhymes for "${w}": try rhymezone.com/r/rhyme.cgi?Word=${encodeURIComponent(w)} or b-rhymes.com/r/${encodeURIComponent(w)}`);
		this.close();
	}

	onClose() { this.contentEl.empty(); }
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

class SongwriterSettingTab extends PluginSettingTab {
	plugin: SongwriterPlugin;
	constructor(app: App, plugin: SongwriterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}
	display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Songwriter Settings" });
		new Setting(containerEl)
			.setName("Songs Folder")
			.setDesc("Where song notes are stored.")
			.addText((t) =>
				t.setPlaceholder("Songs").setValue(this.plugin.settings.songsFolder).onChange(async (v) => {
					this.plugin.settings.songsFolder = v || "Songs";
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName("Snippets Folder")
			.setDesc("Where lyric snippet notes are stored.")
			.addText((t) =>
				t.setPlaceholder("Songs/Snippets").setValue(this.plugin.settings.snippetsFolder).onChange(async (v) => {
					this.plugin.settings.snippetsFolder = v || "Songs/Snippets";
					await this.plugin.saveSettings();
				})
			);
	}
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default class SongwriterPlugin extends Plugin {
	settings!: SongwriterSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(VIEW_TYPE, (leaf) => new SongwriterView(leaf, this));

		this.addRibbonIcon("music", "Songwriter", () => this.activateSidebar());

		this.addCommand({
			id: "open-sidebar",
			name: "Open Songwriter sidebar",
			callback: () => this.activateSidebar(),
		});
		this.addCommand({
			id: "new-song",
			name: "New Song",
			callback: () => new NewSongModal(this.app, this, () => this.refreshSidebar()).open(),
		});
		this.addCommand({
			id: "new-lyric-snippet",
			name: "New Lyric Snippet",
			callback: () => new LyricSnippetModal(this.app, this, () => this.refreshSidebar()).open(),
		});
		this.addCommand({
			id: "find-rhymes",
			name: "Find Rhymes",
			callback: () => new FindRhymesModal(this.app).open(),
		});

		this.addSettingTab(new SongwriterSettingTab(this.app, this));
	}

	async activateSidebar() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW_TYPE, active: true });
		}
		workspace.revealLeaf(leaf);
	}

	refreshSidebar() {
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (leaf?.view instanceof SongwriterView) {
			(leaf.view as SongwriterView).render();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
	async saveSettings() {
		await this.saveData(this.settings);
	}
}
