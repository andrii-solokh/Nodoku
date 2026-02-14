extends Control

const SETTINGS_PATH := "user://settings.cfg"
const VERSION_PATH := "res://version.txt"
const GAME_VERSION := "0.1.0"
const ICON_PREVIEW_SCENE := preload("res://scenes/IconPreview.tscn")
const THEME_CLASSIC := GridView.THEME_CLASSIC
const THEME_WARM := GridView.THEME_WARM
const THEME_TERMINAL := GridView.THEME_TERMINAL
const DEPTH_MODE_FLAT := 1
const DEPTH_MODE_CUBE := 2

@onready var menu: Control = $Menu
@onready var game: GameController = $Game
@onready var background: TextureRect = $Background
@onready var menu_vbox: VBoxContainer = $Menu/MenuPanel/MenuMargin/VBox
@onready var title_label: Label = $Menu/MenuPanel/MenuMargin/VBox/Title
@onready var subtitle_label: Label = $Menu/MenuPanel/MenuMargin/VBox/Subtitle
@onready var version_label: Label = $Menu/VersionLabel
@onready var control_hints: Label = $Game/HUD/Root/ControlHints

@onready var grid_size_option: OptionButton = $Menu/MenuPanel/MenuMargin/VBox/GridSizeRow/GridSizeOption
@onready var depth_option: OptionButton = $Menu/MenuPanel/MenuMargin/VBox/DepthRow/DepthOption
@onready var difficulty_option: OptionButton = $Menu/MenuPanel/MenuMargin/VBox/DifficultyRow/DifficultyOption
@onready var grid_size_label: Label = $Menu/MenuPanel/MenuMargin/VBox/GridSizeRow/GridSizeLabel
@onready var depth_label: Label = $Menu/MenuPanel/MenuMargin/VBox/DepthRow/DepthLabel
@onready var difficulty_label: Label = $Menu/MenuPanel/MenuMargin/VBox/DifficultyRow/DifficultyLabel
@onready var start_button: Button = $Menu/MenuPanel/MenuMargin/VBox/StartButton
@onready var howto_button: Button = $Menu/MenuPanel/MenuMargin/VBox/HowToButton
@onready var tutorial_overlay: Control = $Menu/TutorialOverlay
@onready var tutorial_dim: ColorRect = $Menu/TutorialOverlay/TutorialDim
@onready var tutorial_title: Label = $Menu/TutorialOverlay/TutorialContent/TutorialVBox/TutorialTitle
@onready var tutorial_close: Button = $Menu/TutorialOverlay/TutorialContent/TutorialVBox/TutorialClose
@onready var tutorial_demo: Control = $Menu/TutorialOverlay/TutorialContent/TutorialVBox/TutorialDemo
@onready var tutorial_step1: Label = $Menu/TutorialOverlay/TutorialContent/TutorialVBox/TutorialStep1
@onready var tutorial_step2: Label = $Menu/TutorialOverlay/TutorialContent/TutorialVBox/TutorialStep2
@onready var tutorial_step3: Label = $Menu/TutorialOverlay/TutorialContent/TutorialVBox/TutorialStep3
@onready var tutorial_step4: Label = $Menu/TutorialOverlay/TutorialContent/TutorialVBox/TutorialStep4

var tutorial_shown: bool = false
var tutorial_step: int = 0
var tutorial_complete: bool = false
const TUTORIAL_STEP_COUNT := 4
var current_theme_id: int = THEME_CLASSIC
var theme_option: OptionButton = null
var bg_shader_time: float = 0.0

func _ready() -> void:
	set_process(true)
	if _is_icon_preview_enabled():
		_open_icon_preview_scene()
		return
	menu.visible = true
	game.visible = false
	game.set_hud_visible(false)
	_setup_options()
	_load_settings()
	_update_version_label()
	_update_control_hints()
	grid_size_option.item_selected.connect(_on_grid_size_option_selected)
	start_button.pressed.connect(_on_start_pressed)
	howto_button.pressed.connect(_on_howto_pressed)
	tutorial_close.pressed.connect(_on_tutorial_close)
	if tutorial_demo != null and tutorial_demo.has_signal("step_completed"):
		tutorial_demo.connect("step_completed", _on_tutorial_step_completed)
	game.back_requested.connect(_on_game_back)
	game.visual_theme_changed.connect(_on_game_theme_changed)
	if not tutorial_shown:
		_show_tutorial(false)

func _process(delta: float) -> void:
	bg_shader_time += delta
	if background == null:
		return
	var mat := background.material as ShaderMaterial
	if mat == null:
		return
	mat.set_shader_parameter("time_offset", bg_shader_time)

func _is_icon_preview_enabled() -> bool:
	if not OS.has_feature("web"):
		return false
	if not Engine.has_singleton("JavaScriptBridge"):
		return false
	var js := Engine.get_singleton("JavaScriptBridge")
	if js == null:
		return false
	var search := String(js.call("eval", "window.location.search", true))
	return search.find("icon_preview=1") != -1

func _open_icon_preview_scene() -> void:
	menu.visible = false
	game.visible = false
	game.set_hud_visible(false)
	tutorial_overlay.visible = false
	var preview := ICON_PREVIEW_SCENE.instantiate()
	add_child(preview)

func _update_control_hints() -> void:
	var is_touch := DisplayServer.is_touchscreen_available()
	control_hints.visible = true
	control_hints.text = "- Rule 1: every node must spend all dots\n- Rule 2: completed nodes must form one connected network\n- ASCII mode: node centers show + count / OK\n- W/A/S/D or arrows: rotate, drag: connect"
	var font_size := 18
	if is_touch:
		font_size = 20
	control_hints.add_theme_font_size_override("font_size", font_size)

func _update_version_label() -> void:
	var version := GAME_VERSION
	if FileAccess.file_exists(VERSION_PATH):
		var file := FileAccess.open(VERSION_PATH, FileAccess.READ)
		if file != null:
			var line := file.get_line().strip_edges()
			if line != "":
				version = line
	version_label.text = "v%s" % version

func _setup_options() -> void:
	grid_size_option.clear()
	for size in range(3, 8):
		grid_size_option.add_item("%dx%d" % [size, size], size)
	_style_option_popup(grid_size_option)
	_select_option_by_id(grid_size_option, 5, 5)

	_rebuild_depth_options(DEPTH_MODE_CUBE)
	_style_option_popup(depth_option)

	difficulty_option.clear()
	difficulty_option.add_item("Easy", 0)
	difficulty_option.add_item("Normal", 1)
	difficulty_option.add_item("Hard", 2)
	_style_option_popup(difficulty_option)
	_setup_theme_option()

func _setup_theme_option() -> void:
	if theme_option != null:
		return
	var row := HBoxContainer.new()
	row.name = "ThemeRow"
	row.add_theme_constant_override("separation", 16)
	var label := Label.new()
	label.name = "ThemeLabel"
	label.custom_minimum_size = Vector2(180, 0)
	label.text = "Theme"
	label.add_theme_font_size_override("font_size", 22)
	row.add_child(label)
	theme_option = OptionButton.new()
	theme_option.name = "ThemeOption"
	theme_option.custom_minimum_size = Vector2(260, 60)
	theme_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	theme_option.focus_mode = Control.FOCUS_NONE
	theme_option.add_item("Classic", THEME_CLASSIC)
	theme_option.add_item("Warm Neon", THEME_WARM)
	theme_option.add_item("Terminal ASCII", THEME_TERMINAL)
	theme_option.item_selected.connect(_on_theme_option_selected)
	row.add_child(theme_option)
	menu_vbox.add_child(row)
	menu_vbox.move_child(row, 6)
	_style_option_popup(theme_option)

func _style_option_popup(option: OptionButton) -> void:
	var popup := option.get_popup()
	if popup == null:
		return
	var text_color: Color = _theme_palette().accent
	popup.add_theme_color_override("font_color", text_color)
	popup.add_theme_color_override("font_hover_color", text_color)
	popup.add_theme_color_override("font_pressed_color", text_color)
	popup.add_theme_color_override("font_color_hover", text_color)
	popup.add_theme_color_override("font_color_pressed", text_color)
	popup.add_theme_color_override("font_disabled_color", _theme_palette().dim)
	popup.add_theme_constant_override("v_separation", 6)
	var panel := StyleBoxFlat.new()
	panel.bg_color = _theme_palette().panel_bg
	panel.border_width_left = 2
	panel.border_width_top = 2
	panel.border_width_right = 2
	panel.border_width_bottom = 2
	panel.border_color = _theme_palette().panel_border
	panel.corner_radius_top_left = 12
	panel.corner_radius_top_right = 12
	panel.corner_radius_bottom_left = 12
	panel.corner_radius_bottom_right = 12
	panel.content_margin_left = 8
	panel.content_margin_top = 6
	panel.content_margin_right = 8
	panel.content_margin_bottom = 6
	var hover := StyleBoxFlat.new()
	hover.bg_color = _theme_palette().hover_bg
	hover.corner_radius_top_left = 8
	hover.corner_radius_top_right = 8
	hover.corner_radius_bottom_left = 8
	hover.corner_radius_bottom_right = 8
	popup.add_theme_stylebox_override("panel", panel)
	popup.add_theme_stylebox_override("hover", hover)
	popup.add_theme_stylebox_override("pressed", hover)

func _load_settings() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SETTINGS_PATH) != OK:
		_apply_defaults()
		return

	var size := int(cfg.get_value("game", "grid_size", 5))
	var legacy_depth := int(cfg.get_value("game", "grid_depth", 2))
	var depth_mode := int(cfg.get_value("game", "depth_mode", DEPTH_MODE_CUBE if legacy_depth > 1 else DEPTH_MODE_FLAT))
	var difficulty := int(cfg.get_value("game", "difficulty", 1))
	var theme := int(cfg.get_value("game", "theme", THEME_CLASSIC))
	tutorial_shown = bool(cfg.get_value("game", "tutorial_shown", false))

	_select_option_by_id(grid_size_option, size, 5)
	_rebuild_depth_options(depth_mode)
	_select_option_by_id(difficulty_option, difficulty, 1)
	_select_option_by_id(theme_option, theme, THEME_CLASSIC)
	_apply_theme(theme)

func _save_settings(size: int, depth_mode: int, difficulty: int, theme_id: int = current_theme_id) -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("game", "grid_size", size)
	cfg.set_value("game", "depth_mode", depth_mode)
	cfg.set_value("game", "grid_depth", _effective_depth(size, depth_mode))
	cfg.set_value("game", "difficulty", difficulty)
	cfg.set_value("game", "theme", theme_id)
	cfg.set_value("game", "tutorial_shown", tutorial_shown)
	cfg.save(SETTINGS_PATH)

func _apply_defaults() -> void:
	_select_option_by_id(grid_size_option, 5, 5)
	_rebuild_depth_options(DEPTH_MODE_CUBE)
	_select_option_by_id(difficulty_option, 1, 1)
	_select_option_by_id(theme_option, THEME_CLASSIC, THEME_CLASSIC)
	_apply_theme(THEME_CLASSIC)

func _select_option_by_id(option: OptionButton, id_value: int, fallback: int) -> void:
	for i in range(option.item_count):
		if option.get_item_id(i) == id_value:
			option.select(i)
			return
	for i in range(option.item_count):
		if option.get_item_id(i) == fallback:
			option.select(i)
			return

func _on_start_pressed() -> void:
	var size := grid_size_option.get_item_id(grid_size_option.selected)
	var depth_mode := _selected_depth_mode()
	var depth := _effective_depth(size, depth_mode)
	var difficulty := difficulty_option.get_item_id(difficulty_option.selected)
	var theme := theme_option.get_item_id(theme_option.selected)

	_apply_theme(theme)
	_save_settings(size, depth_mode, difficulty, theme)
	game.play_ui_sound()
	game.set_visual_theme(theme)
	game.start_new_game(size, depth, difficulty)

	menu.visible = false
	game.visible = true
	game.set_hud_visible(true)
	tutorial_overlay.visible = false

func _on_game_back() -> void:
	menu.visible = true
	game.visible = false
	game.set_hud_visible(false)

func _show_tutorial(from_menu: bool) -> void:
	tutorial_overlay.visible = true
	tutorial_complete = false
	tutorial_step = 0
	tutorial_close.text = "Skip"
	if tutorial_demo != null:
		if tutorial_demo.has_method("reset_demo"):
			tutorial_demo.call("reset_demo")
		if tutorial_demo is Control:
			(tutorial_demo as Control).grab_focus()
	_apply_tutorial_step()
	if not tutorial_shown and not from_menu:
		tutorial_shown = true
		_save_settings(
			grid_size_option.get_item_id(grid_size_option.selected),
			_selected_depth_mode(),
			difficulty_option.get_item_id(difficulty_option.selected)
		)

func _on_howto_pressed() -> void:
	_show_tutorial(true)

func _on_theme_option_selected(index: int) -> void:
	if theme_option == null:
		return
	var theme := theme_option.get_item_id(index)
	_apply_theme(theme)
	_save_settings(
		grid_size_option.get_item_id(grid_size_option.selected),
		_selected_depth_mode(),
		difficulty_option.get_item_id(difficulty_option.selected),
		theme
	)

func _on_game_theme_changed(theme_id: int) -> void:
	current_theme_id = theme_id
	_select_option_by_id(theme_option, theme_id, THEME_CLASSIC)
	if tutorial_demo != null and tutorial_demo.has_method("apply_theme"):
		tutorial_demo.call("apply_theme", current_theme_id)
	_apply_menu_theme()
	_save_settings(
		grid_size_option.get_item_id(grid_size_option.selected),
		_selected_depth_mode(),
		difficulty_option.get_item_id(difficulty_option.selected),
		theme_id
	)

func _apply_theme(theme_id: int) -> void:
	current_theme_id = clampi(theme_id, THEME_CLASSIC, THEME_TERMINAL)
	if tutorial_demo != null and tutorial_demo.has_method("apply_theme"):
		tutorial_demo.call("apply_theme", current_theme_id)
	if game != null:
		game.set_visual_theme(current_theme_id)
	_apply_menu_theme()

func _apply_menu_theme() -> void:
	var p := _theme_palette()
	_apply_background_shader_theme()
	_apply_gradient(Color(p.bg_top), Color(p.bg_bottom))
	title_label.add_theme_color_override("font_color", p.title)
	subtitle_label.add_theme_color_override("font_color", p.dim)
	grid_size_label.add_theme_color_override("font_color", p.label)
	depth_label.add_theme_color_override("font_color", p.label)
	difficulty_label.add_theme_color_override("font_color", p.label)
	version_label.add_theme_color_override("font_color", p.dim)
	tutorial_title.add_theme_color_override("font_color", p.accent)
	tutorial_step1.add_theme_color_override("font_color", p.label)
	tutorial_step2.add_theme_color_override("font_color", p.label)
	tutorial_step3.add_theme_color_override("font_color", p.label)
	tutorial_step4.add_theme_color_override("font_color", p.label)
	tutorial_dim.color = Color(p.tutorial_dim)
	_apply_button_theme(start_button, p, true)
	_apply_button_theme(howto_button, p, false)
	_apply_button_theme(tutorial_close, p, false)
	_apply_option_theme(grid_size_option, p)
	_apply_option_theme(depth_option, p)
	_apply_option_theme(difficulty_option, p)
	if theme_option != null:
		_apply_option_theme(theme_option, p)
	_style_option_popup(grid_size_option)
	_style_option_popup(depth_option)
	_style_option_popup(difficulty_option)
	if theme_option != null:
		_style_option_popup(theme_option)

func _apply_background_shader_theme() -> void:
	if background == null:
		return
	var mat := background.material as ShaderMaterial
	if mat == null:
		return
	mat.set_shader_parameter("theme", current_theme_id)
	match current_theme_id:
		THEME_WARM:
			mat.set_shader_parameter("speed", 0.8)
			mat.set_shader_parameter("glow_strength", 1.0)
			mat.set_shader_parameter("scan_strength", 0.0)
			mat.set_shader_parameter("grid_strength", 0.0)
			mat.set_shader_parameter("grain_strength", 0.06)
		THEME_TERMINAL:
			mat.set_shader_parameter("speed", 0.72)
			mat.set_shader_parameter("glow_strength", 0.92)
			mat.set_shader_parameter("scan_strength", 0.11)
			mat.set_shader_parameter("grid_strength", 0.1)
			mat.set_shader_parameter("grain_strength", 0.0)
		_:
			mat.set_shader_parameter("speed", 0.58)
			mat.set_shader_parameter("glow_strength", 0.86)
			mat.set_shader_parameter("scan_strength", 0.0)
			mat.set_shader_parameter("grid_strength", 0.0)
			mat.set_shader_parameter("grain_strength", 0.08)

func _apply_gradient(top: Color, bottom: Color) -> void:
	if background == null:
		return
	if background.texture is GradientTexture2D:
		var tex := background.texture as GradientTexture2D
		if tex.gradient == null:
			tex.gradient = Gradient.new()
		tex.gradient.colors = PackedColorArray([top, bottom])

func _apply_option_theme(option: OptionButton, p: Dictionary) -> void:
	option.add_theme_color_override("font_color", Color(p.accent))
	option.add_theme_color_override("font_pressed_color", Color(p.accent))
	option.add_theme_color_override("font_hover_color", Color(p.accent))
	_apply_button_style(option, Color(p.panel_bg), Color(p.panel_border), Color(p.hover_bg))

func _apply_button_theme(button: Button, p: Dictionary, primary: bool) -> void:
	var text_color: Color = Color(p.accent)
	if primary:
		text_color = Color(p.primary_text)
	button.add_theme_color_override("font_color", text_color)
	button.add_theme_color_override("font_pressed_color", text_color)
	button.add_theme_color_override("font_hover_color", text_color)
	if primary:
		_apply_button_style(button, Color(p.primary_bg), Color(p.primary_border), Color(p.primary_hover))
	else:
		_apply_button_style(button, Color(p.panel_bg), Color(p.panel_border), Color(p.hover_bg))

func _apply_button_style(control: Control, bg: Color, border: Color, hover_bg: Color) -> void:
	var normal := StyleBoxFlat.new()
	normal.bg_color = bg
	normal.border_width_left = 2
	normal.border_width_top = 2
	normal.border_width_right = 2
	normal.border_width_bottom = 2
	normal.border_color = border
	normal.corner_radius_top_left = 16
	normal.corner_radius_top_right = 16
	normal.corner_radius_bottom_left = 16
	normal.corner_radius_bottom_right = 16
	normal.content_margin_left = 18
	normal.content_margin_top = 8
	normal.content_margin_right = 24
	normal.content_margin_bottom = 8
	var pressed := normal.duplicate()
	pressed.bg_color = hover_bg.darkened(0.08)
	var hover := normal.duplicate()
	hover.bg_color = hover_bg
	control.add_theme_stylebox_override("normal", normal)
	control.add_theme_stylebox_override("pressed", pressed)
	control.add_theme_stylebox_override("hover", hover)

func _theme_palette() -> Dictionary:
	match current_theme_id:
		THEME_WARM:
			return {
				"bg_top": Color("#060A12"),
				"bg_bottom": Color("#131F33"),
				"title": Color("#FFDAA7"),
				"accent": Color("#FFC77F"),
				"label": Color("#D5A978"),
				"dim": Color("#9E805F"),
				"panel_bg": Color("#111A28"),
				"hover_bg": Color("#1A2637"),
				"panel_border": Color("#D8904B"),
				"primary_bg": Color("#9A5928"),
				"primary_hover": Color("#B06931"),
				"primary_border": Color("#E6A85F"),
				"primary_text": Color("#FFF2DD"),
				"tutorial_dim": Color(0.05, 0.07, 0.11, 0.94)
			}
		THEME_TERMINAL:
			return {
				"bg_top": Color("#011006"),
				"bg_bottom": Color("#032011"),
				"title": Color("#C8FFD2"),
				"accent": Color("#8EFAAA"),
				"label": Color("#66B77A"),
				"dim": Color("#3F7450"),
				"panel_bg": Color("#07150C"),
				"hover_bg": Color("#0B2113"),
				"panel_border": Color("#49BC66"),
				"primary_bg": Color("#174228"),
				"primary_hover": Color("#1F5A34"),
				"primary_border": Color("#5BE27D"),
				"primary_text": Color("#D4FFDC"),
				"tutorial_dim": Color(0.02, 0.04, 0.03, 0.96)
			}
		_:
			return {
				"bg_top": Color("#EFECE5"),
				"bg_bottom": Color("#DEE6EF"),
				"title": Color("#2E3D43"),
				"accent": Color("#2D3F45"),
				"label": Color("#4C5D63"),
				"dim": Color("#6C767A"),
				"panel_bg": Color("#F2EEE7"),
				"hover_bg": Color("#E8E0D4"),
				"panel_border": Color("#9D8A6B"),
				"primary_bg": Color("#31484E"),
				"primary_hover": Color("#3D595F"),
				"primary_border": Color("#6B7E82"),
				"primary_text": Color("#F2ECE3"),
				"tutorial_dim": Color(0.97, 0.96, 0.94, 1)
			}

func _on_tutorial_close() -> void:
	tutorial_shown = true
	_save_settings(
		grid_size_option.get_item_id(grid_size_option.selected),
		_selected_depth_mode(),
		difficulty_option.get_item_id(difficulty_option.selected)
	)
	tutorial_overlay.visible = false
	tutorial_complete = false

func _selected_grid_size() -> int:
	return grid_size_option.get_item_id(grid_size_option.selected)

func _selected_depth_mode() -> int:
	return depth_option.get_item_id(depth_option.selected)

func _effective_depth(size: int, depth_mode: int) -> int:
	return 1 if depth_mode == DEPTH_MODE_FLAT else size

func _rebuild_depth_options(preferred_mode: int = DEPTH_MODE_CUBE) -> void:
	var size := _selected_grid_size()
	depth_option.clear()
	depth_option.add_item("Flat (1 layer)", DEPTH_MODE_FLAT)
	depth_option.add_item("Cube (%d layers)" % size, DEPTH_MODE_CUBE)
	_select_option_by_id(depth_option, preferred_mode, DEPTH_MODE_CUBE)

func _on_grid_size_option_selected(_index: int) -> void:
	var mode := _selected_depth_mode()
	if mode != DEPTH_MODE_FLAT and mode != DEPTH_MODE_CUBE:
		mode = DEPTH_MODE_CUBE
	_rebuild_depth_options(mode)

func _on_tutorial_step_completed(step: int) -> void:
	if tutorial_complete:
		return
	if step != tutorial_step:
		return
	tutorial_step += 1
	if tutorial_step >= TUTORIAL_STEP_COUNT:
		tutorial_complete = true
		tutorial_close.text = "Got it"
	_apply_tutorial_step()

func _apply_tutorial_step() -> void:
	if tutorial_demo == null:
		return
	if tutorial_demo.has_method("set_step"):
		tutorial_demo.call("set_step", min(tutorial_step, TUTORIAL_STEP_COUNT - 1))
	var c_active := Color("#A6FFB8")
	var c_dim := Color("#4D7A59")
	if tutorial_complete:
		tutorial_step1.modulate = c_active
		tutorial_step2.modulate = c_active
		tutorial_step3.modulate = c_active
		tutorial_step4.modulate = c_active
		tutorial_step1.visible = true
		tutorial_step2.visible = true
		tutorial_step3.visible = true
		tutorial_step4.visible = true
	else:
		tutorial_step1.modulate = c_active if tutorial_step == 0 else c_dim
		tutorial_step2.modulate = c_active if tutorial_step == 1 else c_dim
		tutorial_step3.modulate = c_active if tutorial_step == 2 else c_dim
		tutorial_step4.modulate = c_active if tutorial_step == 3 else c_dim
		tutorial_step1.visible = true
		tutorial_step2.visible = tutorial_step >= 1
		tutorial_step3.visible = tutorial_step >= 2
		tutorial_step4.visible = tutorial_step >= 3
