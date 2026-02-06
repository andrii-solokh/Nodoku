extends Control

const SETTINGS_PATH := "user://settings.cfg"
const VERSION_PATH := "res://version.txt"
const GAME_VERSION := "0.1.0"

@onready var menu: Control = $Menu
@onready var game: GameController = $Game
@onready var version_label: Label = $Menu/VersionLabel
@onready var control_hints: Label = $Game/HUD/Root/ControlHints

@onready var grid_size_option: OptionButton = $Menu/MenuPanel/MenuMargin/VBox/GridSizeRow/GridSizeOption
@onready var depth_option: OptionButton = $Menu/MenuPanel/MenuMargin/VBox/DepthRow/DepthOption
@onready var difficulty_option: OptionButton = $Menu/MenuPanel/MenuMargin/VBox/DifficultyRow/DifficultyOption
@onready var start_button: Button = $Menu/MenuPanel/MenuMargin/VBox/StartButton
@onready var howto_button: Button = $Menu/MenuPanel/MenuMargin/VBox/HowToButton
@onready var tutorial_overlay: Control = $Menu/TutorialOverlay
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

func _ready() -> void:
	menu.visible = true
	game.visible = false
	game.set_hud_visible(false)
	_setup_options()
	_load_settings()
	_update_version_label()
	_update_control_hints()
	start_button.pressed.connect(_on_start_pressed)
	howto_button.pressed.connect(_on_howto_pressed)
	tutorial_close.pressed.connect(_on_tutorial_close)
	if tutorial_demo != null and tutorial_demo.has_signal("step_completed"):
		tutorial_demo.connect("step_completed", _on_tutorial_step_completed)
	game.back_requested.connect(_on_game_back)
	if not tutorial_shown:
		_show_tutorial(false)

func _update_control_hints() -> void:
	var is_touch := DisplayServer.is_touchscreen_available()
	control_hints.visible = true
	control_hints.text = "- Double tap/click a node to connect/disconnect neighbors\n- W/A/S/D or arrow keys to rotate\n- Click or drag between two nodes to connect/disconnect"
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

	depth_option.clear()
	for depth in range(1, 8):
		depth_option.add_item("%d layer%s" % [depth, "" if depth == 1 else "s"], depth)
	_style_option_popup(depth_option)

	difficulty_option.clear()
	difficulty_option.add_item("Easy", 0)
	difficulty_option.add_item("Normal", 1)
	difficulty_option.add_item("Hard", 2)
	_style_option_popup(difficulty_option)

func _style_option_popup(option: OptionButton) -> void:
	var popup := option.get_popup()
	if popup == null:
		return
	var text_color := Color(0.19, 0.24, 0.26, 1)
	popup.add_theme_color_override("font_color", text_color)
	popup.add_theme_color_override("font_hover_color", text_color)
	popup.add_theme_color_override("font_pressed_color", text_color)
	popup.add_theme_color_override("font_color_hover", text_color)
	popup.add_theme_color_override("font_color_pressed", text_color)
	popup.add_theme_color_override("font_disabled_color", Color(0.19, 0.24, 0.26, 0.5))
	popup.add_theme_constant_override("v_separation", 6)
	var panel := StyleBoxFlat.new()
	panel.bg_color = Color(0.97, 0.96, 0.94, 1)
	panel.border_width_left = 2
	panel.border_width_top = 2
	panel.border_width_right = 2
	panel.border_width_bottom = 2
	panel.border_color = Color(0.78, 0.72, 0.64, 0.6)
	panel.corner_radius_top_left = 12
	panel.corner_radius_top_right = 12
	panel.corner_radius_bottom_left = 12
	panel.corner_radius_bottom_right = 12
	panel.content_margin_left = 8
	panel.content_margin_top = 6
	panel.content_margin_right = 8
	panel.content_margin_bottom = 6
	var hover := StyleBoxFlat.new()
	hover.bg_color = Color(0.93, 0.9, 0.86, 1)
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
	var depth := int(cfg.get_value("game", "grid_depth", 2))
	var difficulty := int(cfg.get_value("game", "difficulty", 1))
	tutorial_shown = bool(cfg.get_value("game", "tutorial_shown", false))

	_select_option_by_id(grid_size_option, size, 5)
	_select_option_by_id(depth_option, depth, 2)
	_select_option_by_id(difficulty_option, difficulty, 1)

func _save_settings(size: int, depth: int, difficulty: int) -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("game", "grid_size", size)
	cfg.set_value("game", "grid_depth", depth)
	cfg.set_value("game", "difficulty", difficulty)
	cfg.set_value("game", "tutorial_shown", tutorial_shown)
	cfg.save(SETTINGS_PATH)

func _apply_defaults() -> void:
	_select_option_by_id(grid_size_option, 5, 5)
	_select_option_by_id(depth_option, 2, 2)
	_select_option_by_id(difficulty_option, 1, 1)

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
	var depth := depth_option.get_item_id(depth_option.selected)
	var difficulty := difficulty_option.get_item_id(difficulty_option.selected)

	_save_settings(size, depth, difficulty)
	game.play_ui_sound()
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
			depth_option.get_item_id(depth_option.selected),
			difficulty_option.get_item_id(difficulty_option.selected)
		)

func _on_howto_pressed() -> void:
	_show_tutorial(true)

func _on_tutorial_close() -> void:
	tutorial_shown = true
	_save_settings(
		grid_size_option.get_item_id(grid_size_option.selected),
		depth_option.get_item_id(depth_option.selected),
		difficulty_option.get_item_id(difficulty_option.selected)
	)
	tutorial_overlay.visible = false
	tutorial_complete = false

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
	var c_active := Color(0.19, 0.24, 0.26, 1)
	var c_dim := Color(0.42, 0.47, 0.5, 1)
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
