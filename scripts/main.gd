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
const BUTTON_ROLE_TEXT_ONLY := "text_only"
const BUTTON_ROLE_ICON_TEXT := "icon_text"
const BUTTON_ROLE_ICON_TEXT_CENTER_PAIR := "icon_text_center_pair"
const BUTTON_ROLE_ICON_ONLY := "icon_only"
const BUTTON_ICON_MAX_WIDTH := 22
const BUTTON_META_BASE_TEXT := "_btn_base_text"
const BUTTON_META_BASE_ICON := "_btn_base_icon"
const BUTTON_CENTER_PAIR_ROOT := "_btn_center_pair"
const BUTTON_CENTER_PAIR_ROW := "_btn_center_pair_row"
const BUTTON_CENTER_PAIR_ICON := "_btn_center_pair_icon"
const BUTTON_CENTER_PAIR_LABEL := "_btn_center_pair_label"
const QUALITY_AUTO := GameController.QUALITY_AUTO
const QUALITY_BATTERY := GameController.QUALITY_BATTERY
const QUALITY_BALANCED := GameController.QUALITY_BALANCED
const QUALITY_BEAUTIFUL := GameController.QUALITY_BEAUTIFUL
const TUTORIAL_STEP_BASIC := 0
const TUTORIAL_STEP_ROTATE := 1
const TUTORIAL_GRID_SIZE := 4
const TUTORIAL_BASIC_DEPTH := 1
const TUTORIAL_ROTATION_DEPTH := 4
const TUTORIAL_DIFFICULTY := GameController.DIFFICULTY_NORMAL
const HIDDEN_MENU_DEV_TAP_COUNT := 7
const HIDDEN_MENU_DEV_TAP_WINDOW := 3.0

@onready var menu: Control = $Menu
@onready var game: GameController = $Game
@onready var background: TextureRect	 = $Background
@onready var menu_vbox: VBoxContainer = $Menu/MenuPanel/MenuMargin/VBox
@onready var title_label: Label = $Menu/MenuPanel/MenuMargin/VBox/Title
@onready var subtitle_label: Label = $Menu/MenuPanel/MenuMargin/VBox/Subtitle
@onready var version_label: Label = $Menu/VersionLabel
@onready var control_hints: Label = $Game/HUD/Root/ControlHints

@onready var grid_size_option: OptionButton = $Menu/MenuPanel/MenuMargin/VBox/GridSizeRow/GridSizeOption
@onready var depth_option: OptionButton = $Menu/MenuPanel/MenuMargin/VBox/DepthRow/DepthOption
@onready var difficulty_option: OptionButton = $Menu/MenuPanel/MenuMargin/VBox/DifficultyRow/DifficultyOption
@onready var grid_size_row: HBoxContainer = $Menu/MenuPanel/MenuMargin/VBox/GridSizeRow
@onready var depth_row: HBoxContainer = $Menu/MenuPanel/MenuMargin/VBox/DepthRow
@onready var difficulty_row: HBoxContainer = $Menu/MenuPanel/MenuMargin/VBox/DifficultyRow
@onready var grid_size_label: Label = $Menu/MenuPanel/MenuMargin/VBox/GridSizeRow/GridSizeLabel
@onready var depth_label: Label = $Menu/MenuPanel/MenuMargin/VBox/DepthRow/DepthLabel
@onready var difficulty_label: Label = $Menu/MenuPanel/MenuMargin/VBox/DifficultyRow/DifficultyLabel
@onready var start_button: Button = $Menu/MenuPanel/MenuMargin/VBox/StartButton
@onready var howto_button: Button = $Menu/MenuPanel/MenuMargin/VBox/HowToButton
@onready var tutorial_overlay: Control = $TutorialOverlay
@onready var tutorial_dim: ColorRect = $TutorialOverlay/TutorialDim
@onready var tutorial_content: PanelContainer = $TutorialOverlay/TutorialPanel
@onready var tutorial_title: Label = $TutorialOverlay/TutorialPanel/TutorialVBox/TutorialTitle
@onready var tutorial_instruction: Label = $TutorialOverlay/TutorialPanel/TutorialVBox/TutorialInstruction
@onready var tutorial_step_indicator: Label = $TutorialOverlay/TutorialPanel/TutorialVBox/TutorialStepIndicator
@onready var tutorial_close: Button = $TutorialOverlay/TutorialPanel/TutorialVBox/TutorialClose

var tutorial_shown: bool = false
var tutorial_step: int = 0
var tutorial_complete: bool = false
const TUTORIAL_STEP_COUNT := 2
var tutorial_mode_active: bool = false
var tutorial_start_edge_count: int = 0
var tutorial_prev_rotating: bool = false
var tutorial_rotation_seen: bool = false
var current_theme_id: int = THEME_TERMINAL
var current_graphics_quality: int = QUALITY_AUTO
var theme_option: OptionButton = null
var graphics_option: OptionButton = null
var bg_shader_time: float = 0.0
var menu_post_fx_overlay: ColorRect = null
var grid_size_bar_strip: HBoxContainer = null
var difficulty_bar_strip: HBoxContainer = null
var grid_size_value_label: Label = null
var difficulty_value_label: Label = null
var grid_size_minus_button: Button = null
var grid_size_plus_button: Button = null
var difficulty_minus_button: Button = null
var difficulty_plus_button: Button = null
var depth_flat_button: Button = null
var depth_cube_button: Button = null
var grid_size_bar_cells: Array[Panel] = []
var difficulty_bar_cells: Array[Panel] = []
var hidden_menu_dev_tap_count: int = 0
var hidden_menu_dev_tap_window_start: float = 0.0

func _ready() -> void:
	set_process(true)
	if _is_icon_preview_enabled():
		_open_icon_preview_scene()
		return
	menu.visible = true
	game.visible = false
	game.set_hud_visible(false)
	_apply_title_monospace_font()
	_ensure_menu_post_fx_overlay()
	_setup_options()
	_load_settings()
	_init_mobile_menu_scale()
	_update_version_label()
	_update_control_hints()
	version_label.mouse_filter = Control.MOUSE_FILTER_STOP
	version_label.gui_input.connect(_on_version_label_gui_input)
	grid_size_option.item_selected.connect(_on_grid_size_option_selected)
	start_button.pressed.connect(_on_start_pressed)
	howto_button.pressed.connect(_on_howto_pressed)
	tutorial_close.pressed.connect(_on_tutorial_close)
	game.back_requested.connect(_on_game_back)
	game.visual_theme_changed.connect(_on_game_theme_changed)
	if tutorial_overlay.get_parent() == self:
		move_child(tutorial_overlay, get_child_count() - 1)
	if not tutorial_shown:
		_show_tutorial(false)

func _process(delta: float) -> void:
	if tutorial_mode_active:
		_update_tutorial_progress()
	if not (menu.visible or tutorial_overlay.visible):
		return
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

func _on_version_label_gui_input(event: InputEvent) -> void:
	if not menu.visible:
		return
	var tapped := false
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
			tapped = true
	elif event is InputEventScreenTouch:
		if event.pressed:
			tapped = true
	if not tapped:
		return
	_register_hidden_menu_dev_tap()

func _register_hidden_menu_dev_tap() -> void:
	var now := float(Time.get_ticks_msec()) / 1000.0
	if hidden_menu_dev_tap_window_start <= 0.0 or (now - hidden_menu_dev_tap_window_start) > HIDDEN_MENU_DEV_TAP_WINDOW:
		hidden_menu_dev_tap_window_start = now
		hidden_menu_dev_tap_count = 0
	hidden_menu_dev_tap_count += 1
	if hidden_menu_dev_tap_count < HIDDEN_MENU_DEV_TAP_COUNT:
		return
	hidden_menu_dev_tap_count = 0
	hidden_menu_dev_tap_window_start = now
	if game != null:
		game.set_developer_mode_enabled(true, "menu_hidden_tap")
	print("[DevMode] Hidden menu unlock sequence accepted")

func _setup_options() -> void:
	grid_size_option.clear()
	for size in range(3, 8):
		grid_size_option.add_item(str(size), size)
	_style_option_popup(grid_size_option)
	_select_option_by_id(grid_size_option, 5, 5)

	_rebuild_depth_options(DEPTH_MODE_CUBE)
	_style_option_popup(depth_option)

	difficulty_option.clear()
	difficulty_option.add_item("▮▯▯  Easy", 0)
	difficulty_option.add_item("▮▮▯  Normal", 1)
	difficulty_option.add_item("▮▮▮  Hard", 2)
	_style_option_popup(difficulty_option)
	_setup_graphics_option()
	_setup_theme_option()
	_setup_slider_controls()

func _setup_slider_controls() -> void:
	if grid_size_bar_strip == null:
		var grid_pair := _create_stepper_bar_block(grid_size_row, grid_size_option, "-", "+", 7)
		grid_size_bar_strip = grid_pair.get("bars", null) as HBoxContainer
		grid_size_value_label = grid_pair.get("value", null) as Label
		if grid_size_value_label != null:
			grid_size_value_label.visible = false
			grid_size_value_label.custom_minimum_size = Vector2.ZERO
		grid_size_minus_button = grid_pair.get("minus", null) as Button
		grid_size_plus_button = grid_pair.get("plus", null) as Button
		grid_size_bar_cells = grid_pair.get("cells", [])
		if grid_size_minus_button != null:
			grid_size_minus_button.pressed.connect(_on_grid_size_minus_pressed)
		if grid_size_plus_button != null:
			grid_size_plus_button.pressed.connect(_on_grid_size_plus_pressed)
	if depth_flat_button == null or depth_cube_button == null:
		var depth_pair := _create_depth_toggle_block(depth_row, depth_option)
		depth_flat_button = depth_pair.get("flat", null) as Button
		depth_cube_button = depth_pair.get("cube", null) as Button
		if depth_flat_button != null:
			depth_flat_button.pressed.connect(_on_depth_flat_pressed)
		if depth_cube_button != null:
			depth_cube_button.pressed.connect(_on_depth_cube_pressed)
	if difficulty_bar_strip == null:
		var diff_pair := _create_stepper_bar_block(difficulty_row, difficulty_option, "-", "+", 3)
		difficulty_bar_strip = diff_pair.get("bars", null) as HBoxContainer
		difficulty_value_label = diff_pair.get("value", null) as Label
		if difficulty_value_label != null:
			difficulty_value_label.visible = false
			difficulty_value_label.custom_minimum_size = Vector2.ZERO
		difficulty_minus_button = diff_pair.get("minus", null) as Button
		difficulty_plus_button = diff_pair.get("plus", null) as Button
		difficulty_bar_cells = diff_pair.get("cells", [])
		if difficulty_minus_button != null:
			difficulty_minus_button.pressed.connect(_on_difficulty_minus_pressed)
		if difficulty_plus_button != null:
			difficulty_plus_button.pressed.connect(_on_difficulty_plus_pressed)
	_sync_sliders_from_options()
	_apply_mobile_menu_scale()

func _init_mobile_menu_scale() -> void:
	var viewport := get_viewport()
	if viewport != null and not viewport.size_changed.is_connected(_apply_mobile_menu_scale):
		viewport.size_changed.connect(_apply_mobile_menu_scale)
	call_deferred("_apply_mobile_menu_scale")

func _is_touch_mobile_layout() -> bool:
	if not DisplayServer.is_touchscreen_available():
		return false
	return OS.has_feature("web") or OS.has_feature("mobile")

func _touch_short_side() -> float:
	var window_size := DisplayServer.window_get_size()
	var short_side := minf(float(window_size.x), float(window_size.y))
	var viewport_size := get_viewport_rect().size
	var viewport_short := minf(viewport_size.x, viewport_size.y)
	if viewport_short > 0.0:
		short_side = viewport_short if short_side <= 0.0 else minf(short_side, viewport_short)
	if OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
		var js_short := float(JavaScriptBridge.eval("Math.min(window.innerWidth || 0, window.innerHeight || 0)", true))
		if js_short > 0.0:
			short_side = js_short if short_side <= 0.0 else minf(short_side, js_short)
	return short_side

func _menu_touch_scale_factor() -> float:
	if not _is_touch_mobile_layout():
		return 1.0
	var short_side := _touch_short_side()
	if short_side <= 430.0:
		return 1.55
	if short_side <= 520.0:
		return 1.40
	if short_side <= 640.0:
		return 1.25
	return 1.10

func _apply_mobile_menu_scale() -> void:
	var scale := _menu_touch_scale_factor()
	var compact_font_scale := minf(scale, 1.35)
	_layout_tutorial_panel(scale)
	menu_vbox.add_theme_constant_override("separation", int(round(16.0 * minf(scale, 1.2))))
	var row_label_width := 180.0 * scale
	var row_label_font := int(round(22.0 * compact_font_scale))
	for label in [grid_size_label, depth_label, difficulty_label]:
		if label == null:
			continue
		label.custom_minimum_size = Vector2(row_label_width, 0.0)
		label.add_theme_font_size_override("font_size", row_label_font)
	if theme_option != null:
		theme_option.custom_minimum_size = Vector2(260.0 * scale, 60.0 * scale)
		theme_option.add_theme_font_size_override("font_size", int(round(22.0 * compact_font_scale)))
	if graphics_option != null:
		graphics_option.custom_minimum_size = Vector2(260.0 * scale, 60.0 * scale)
		graphics_option.add_theme_font_size_override("font_size", int(round(22.0 * compact_font_scale)))
	start_button.custom_minimum_size = Vector2(0.0, 78.0 * scale)
	start_button.add_theme_font_size_override("font_size", int(round(30.0 * compact_font_scale)))
	howto_button.custom_minimum_size = Vector2(0.0, 52.0 * scale)
	howto_button.add_theme_font_size_override("font_size", int(round(20.0 * compact_font_scale)))
	tutorial_title.add_theme_font_size_override("font_size", int(round(24.0 * compact_font_scale)))
	tutorial_instruction.add_theme_font_size_override("font_size", int(round(18.0 * compact_font_scale)))
	tutorial_step_indicator.add_theme_font_size_override("font_size", int(round(14.0 * compact_font_scale)))
	tutorial_close.custom_minimum_size = Vector2(260.0 * minf(scale, 1.12), 46.0 * scale)
	tutorial_close.add_theme_font_size_override("font_size", int(round(20.0 * compact_font_scale)))
	var option_font_size := int(round(22.0 * compact_font_scale))
	for option in [grid_size_option, depth_option, difficulty_option, graphics_option, theme_option]:
		if option == null:
			continue
		option.custom_minimum_size = Vector2(260.0 * scale, 60.0 * scale)
		option.add_theme_font_size_override("font_size", option_font_size)
	var compact_height := 56.0 * scale
	var compact_button_width := 52.0 * scale
	var compact_font_size := int(round(28.0 * compact_font_scale))
	for compact_button in [grid_size_minus_button, grid_size_plus_button, difficulty_minus_button, difficulty_plus_button]:
		if compact_button == null:
			continue
		compact_button.custom_minimum_size = Vector2(compact_button_width, compact_height)
		compact_button.add_theme_font_size_override("font_size", compact_font_size)
	for depth_button in [depth_flat_button, depth_cube_button]:
		if depth_button == null:
			continue
		depth_button.custom_minimum_size = Vector2(0.0, compact_height)
		depth_button.add_theme_font_size_override("font_size", int(round(20.0 * compact_font_scale)))
	var bar_cell_size := Vector2(26.0 * scale, 18.0 * scale)
	for cell in grid_size_bar_cells:
		if cell != null:
			cell.custom_minimum_size = bar_cell_size
	for cell in difficulty_bar_cells:
		if cell != null:
			cell.custom_minimum_size = bar_cell_size

func _layout_tutorial_panel(scale: float) -> void:
	if tutorial_content == null:
		return
	var viewport_size := get_viewport_rect().size
	var horizontal_padding := 16.0
	var bottom_padding := 18.0
	var max_width := 620.0
	var panel_height := 180.0 * minf(scale, 1.16)
	var available_width := maxf(300.0, viewport_size.x - horizontal_padding * 2.0)
	var panel_width := minf(max_width, available_width)
	var panel_bottom := maxf(8.0, bottom_padding)
	tutorial_content.anchor_left = 0.5
	tutorial_content.anchor_top = 1.0
	tutorial_content.anchor_right = 0.5
	tutorial_content.anchor_bottom = 1.0
	tutorial_content.offset_left = -panel_width * 0.5
	tutorial_content.offset_top = -(panel_height + panel_bottom)
	tutorial_content.offset_right = panel_width * 0.5
	tutorial_content.offset_bottom = -panel_bottom

func _create_stepper_bar_block(row: HBoxContainer, option: OptionButton, minus_text: String, plus_text: String, bar_count: int) -> Dictionary:
	option.visible = false
	option.focus_mode = Control.FOCUS_NONE
	option.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var block := HBoxContainer.new()
	block.name = "%sBarBlock" % option.name
	block.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	block.add_theme_constant_override("separation", 10)
	var minus_button := Button.new()
	minus_button.text = minus_text
	minus_button.custom_minimum_size = Vector2(52, 56)
	minus_button.focus_mode = Control.FOCUS_NONE
	minus_button.add_theme_font_size_override("font_size", 28)
	var bars := HBoxContainer.new()
	bars.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bars.alignment = BoxContainer.ALIGNMENT_CENTER
	bars.add_theme_constant_override("separation", 8)
	var cells: Array[Panel] = []
	for i in range(maxi(1, bar_count)):
		var cell := Panel.new()
		cell.custom_minimum_size = Vector2(26, 18)
		cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		bars.add_child(cell)
		cells.append(cell)
	var plus_button := Button.new()
	plus_button.text = plus_text
	plus_button.custom_minimum_size = Vector2(52, 56)
	plus_button.focus_mode = Control.FOCUS_NONE
	plus_button.add_theme_font_size_override("font_size", 28)
	var value := Label.new()
	value.custom_minimum_size = Vector2(92, 0)
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	value.add_theme_font_size_override("font_size", 20)
	block.add_child(minus_button)
	block.add_child(bars)
	block.add_child(plus_button)
	block.add_child(value)
	row.add_child(block)
	return {"minus": minus_button, "bars": bars, "plus": plus_button, "value": value, "cells": cells}

func _create_depth_toggle_block(row: HBoxContainer, option: OptionButton) -> Dictionary:
	option.visible = false
	option.focus_mode = Control.FOCUS_NONE
	option.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var block := HBoxContainer.new()
	block.name = "%sToggleBlock" % option.name
	block.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	block.add_theme_constant_override("separation", 10)
	var flat_button := Button.new()
	flat_button.text = "[] Flat"
	flat_button.toggle_mode = true
	flat_button.focus_mode = Control.FOCUS_NONE
	flat_button.custom_minimum_size = Vector2(0, 56)
	flat_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	flat_button.add_theme_font_size_override("font_size", 20)
	var cube_button := Button.new()
	cube_button.text = "[#] 3D"
	cube_button.toggle_mode = true
	cube_button.focus_mode = Control.FOCUS_NONE
	cube_button.custom_minimum_size = Vector2(0, 56)
	cube_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cube_button.add_theme_font_size_override("font_size", 20)
	block.add_child(flat_button)
	block.add_child(cube_button)
	row.add_child(block)
	return {"flat": flat_button, "cube": cube_button}

func _sync_sliders_from_options() -> void:
	if grid_size_bar_strip != null:
		var grid_size := _selected_grid_size_option()
		_update_bar_strip(grid_size_bar_cells, grid_size)
		if grid_size_value_label != null:
			grid_size_value_label.text = ""
	var depth_mode := _selected_depth_mode_option()
	if depth_flat_button != null:
		depth_flat_button.button_pressed = depth_mode == DEPTH_MODE_FLAT
	if depth_cube_button != null:
		depth_cube_button.button_pressed = depth_mode == DEPTH_MODE_CUBE
	if difficulty_bar_strip != null:
		var difficulty := _selected_difficulty_option()
		_update_bar_strip(difficulty_bar_cells, difficulty + 1)
		if difficulty_value_label != null:
			difficulty_value_label.text = ""
	_refresh_depth_toggle_theme()
	_refresh_bar_strip_theme()

func _on_grid_size_minus_pressed() -> void:
	var size := clampi(_selected_grid_size_option() - 1, 3, 7)
	_select_option_by_id(grid_size_option, size, 5)
	_on_grid_size_option_selected(0)

func _on_grid_size_plus_pressed() -> void:
	var size := clampi(_selected_grid_size_option() + 1, 3, 7)
	_select_option_by_id(grid_size_option, size, 5)
	_on_grid_size_option_selected(0)

func _on_difficulty_minus_pressed() -> void:
	var difficulty := clampi(_selected_difficulty_option() - 1, 0, 2)
	_select_option_by_id(difficulty_option, difficulty, 1)
	_sync_sliders_from_options()

func _on_difficulty_plus_pressed() -> void:
	var difficulty := clampi(_selected_difficulty_option() + 1, 0, 2)
	_select_option_by_id(difficulty_option, difficulty, 1)
	_sync_sliders_from_options()

func _on_depth_flat_pressed() -> void:
	_select_option_by_id(depth_option, DEPTH_MODE_FLAT, DEPTH_MODE_FLAT)
	_sync_sliders_from_options()

func _on_depth_cube_pressed() -> void:
	_select_option_by_id(depth_option, DEPTH_MODE_CUBE, DEPTH_MODE_CUBE)
	_sync_sliders_from_options()

func _difficulty_value_text(difficulty: int) -> String:
	match difficulty:
		0:
			return "▮▯▯  Easy"
		2:
			return "▮▮▮  Hard"
		_:
			return "▮▮▯  Normal"

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
	var row_index := 7 if graphics_option != null else 6
	menu_vbox.move_child(row, row_index)
	row.visible = false
	_style_option_popup(theme_option)

func _setup_graphics_option() -> void:
	if graphics_option != null:
		return
	var row := HBoxContainer.new()
	row.name = "GraphicsRow"
	row.add_theme_constant_override("separation", 16)
	var label := Label.new()
	label.name = "GraphicsLabel"
	label.custom_minimum_size = Vector2(180, 0)
	label.text = "Graphics"
	label.add_theme_font_size_override("font_size", 22)
	row.add_child(label)
	graphics_option = OptionButton.new()
	graphics_option.name = "GraphicsOption"
	graphics_option.custom_minimum_size = Vector2(260, 60)
	graphics_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	graphics_option.focus_mode = Control.FOCUS_NONE
	graphics_option.add_item("Auto", QUALITY_AUTO)
	graphics_option.add_item("Battery Saver", QUALITY_BATTERY)
	graphics_option.add_item("Balanced", QUALITY_BALANCED)
	graphics_option.add_item("Beautiful", QUALITY_BEAUTIFUL)
	graphics_option.item_selected.connect(_on_graphics_option_selected)
	row.add_child(graphics_option)
	menu_vbox.add_child(row)
	menu_vbox.move_child(row, 6)
	row.visible = true
	_style_option_popup(graphics_option)

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
	var theme := int(cfg.get_value("game", "theme", _default_theme_id()))
	var graphics_quality := int(cfg.get_value("game", "graphics_quality", _default_graphics_quality_id()))
	if OS.has_feature("web"):
		theme = THEME_TERMINAL
	tutorial_shown = bool(cfg.get_value("game", "tutorial_shown", false))

	_select_option_by_id(grid_size_option, size, 5)
	_rebuild_depth_options(depth_mode)
	_select_option_by_id(difficulty_option, difficulty, 1)
	_select_option_by_id(theme_option, theme, _default_theme_id())
	_select_option_by_id(graphics_option, graphics_quality, _default_graphics_quality_id())
	_sync_sliders_from_options()
	_apply_graphics_quality(graphics_quality, false)
	_apply_theme(theme)

func _save_settings(size: int, depth_mode: int, difficulty: int, theme_id: int = current_theme_id, graphics_quality: int = current_graphics_quality) -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("game", "grid_size", size)
	cfg.set_value("game", "depth_mode", depth_mode)
	cfg.set_value("game", "grid_depth", _effective_depth(size, depth_mode))
	cfg.set_value("game", "difficulty", difficulty)
	cfg.set_value("game", "theme", theme_id)
	cfg.set_value("game", "graphics_quality", graphics_quality)
	cfg.set_value("game", "tutorial_shown", tutorial_shown)
	cfg.save(SETTINGS_PATH)

func _apply_defaults() -> void:
	_select_option_by_id(grid_size_option, 5, 5)
	_rebuild_depth_options(DEPTH_MODE_CUBE)
	_select_option_by_id(difficulty_option, 1, 1)
	var default_theme := _default_theme_id()
	var default_graphics := _default_graphics_quality_id()
	_select_option_by_id(theme_option, default_theme, default_theme)
	_select_option_by_id(graphics_option, default_graphics, default_graphics)
	_sync_sliders_from_options()
	_apply_graphics_quality(default_graphics, false)
	_apply_theme(default_theme)

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
	tutorial_mode_active = false
	tutorial_overlay.visible = false
	var size := _selected_grid_size()
	var depth_mode := _selected_depth_mode()
	var depth := _effective_depth(size, depth_mode)
	var difficulty := _selected_difficulty()
	var theme := theme_option.get_item_id(theme_option.selected)
	var graphics_quality := graphics_option.get_item_id(graphics_option.selected)

	_apply_theme(theme)
	_apply_graphics_quality(graphics_quality, false)
	_save_settings(size, depth_mode, difficulty, theme, graphics_quality)
	game.play_ui_sound()
	game.set_visual_theme(theme)
	game.set_render_quality(graphics_quality)
	game.start_new_game(size, depth, difficulty)

	menu.visible = false
	game.visible = true
	game.set_hud_visible(true)
	tutorial_overlay.visible = false
	_update_menu_post_fx_visibility()

func _on_game_back() -> void:
	if tutorial_mode_active:
		_on_tutorial_close()
		return
	menu.visible = true
	game.visible = false
	game.set_hud_visible(false)
	_update_menu_post_fx_visibility()

func _show_tutorial(from_menu: bool) -> void:
	tutorial_mode_active = true
	tutorial_overlay.visible = true
	tutorial_complete = false
	tutorial_step = TUTORIAL_STEP_BASIC
	tutorial_rotation_seen = false
	tutorial_prev_rotating = false
	_set_button_display_text(tutorial_close, "Skip")
	menu.visible = false
	game.visible = true
	game.set_hud_visible(false)
	var theme := theme_option.get_item_id(theme_option.selected)
	var graphics_quality := graphics_option.get_item_id(graphics_option.selected)
	_apply_theme(theme)
	_apply_graphics_quality(graphics_quality, false)
	game.set_visual_theme(theme)
	game.set_render_quality(graphics_quality)
	game.start_new_game(TUTORIAL_GRID_SIZE, TUTORIAL_BASIC_DEPTH, TUTORIAL_DIFFICULTY)
	tutorial_start_edge_count = _tutorial_edge_count()
	tutorial_prev_rotating = _tutorial_is_rotating()
	_apply_tutorial_step()
	_update_menu_post_fx_visibility()
	if not tutorial_shown and not from_menu:
		tutorial_shown = true
		_save_settings(
			_selected_grid_size(),
			_selected_depth_mode(),
			_selected_difficulty()
		)

func _on_howto_pressed() -> void:
	_show_tutorial(true)

func _on_theme_option_selected(index: int) -> void:
	if theme_option == null:
		return
	var theme := theme_option.get_item_id(index)
	_apply_theme(theme)
	_save_settings(
		_selected_grid_size(),
		_selected_depth_mode(),
		_selected_difficulty(),
		theme
	)

func _on_graphics_option_selected(index: int) -> void:
	if graphics_option == null:
		return
	var quality := graphics_option.get_item_id(index)
	_apply_graphics_quality(quality, false)
	_save_settings(
		_selected_grid_size(),
		_selected_depth_mode(),
		_selected_difficulty(),
		current_theme_id,
		quality
	)

func _on_game_theme_changed(theme_id: int) -> void:
	current_theme_id = theme_id
	_select_option_by_id(theme_option, theme_id, _default_theme_id())
	_apply_menu_theme()
	_save_settings(
		_selected_grid_size(),
		_selected_depth_mode(),
		_selected_difficulty(),
		theme_id
	)

func _apply_title_monospace_font() -> void:
	if title_label == null:
		return
	var mono_font := get_theme_default_font()
	if mono_font == null:
		return
	title_label.add_theme_font_override("font", mono_font)

func _ensure_menu_post_fx_overlay() -> void:
	if is_instance_valid(menu_post_fx_overlay):
		return
	if game == null or not is_instance_valid(game):
		return
	if not is_instance_valid(game.post_fx_material):
		call_deferred("_ensure_menu_post_fx_overlay")
		return
	menu_post_fx_overlay = ColorRect.new()
	menu_post_fx_overlay.name = "MenuPostFxOverlay"
	menu_post_fx_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	menu_post_fx_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	menu_post_fx_overlay.focus_mode = Control.FOCUS_NONE
	menu_post_fx_overlay.color = Color.WHITE
	menu_post_fx_overlay.material = game.post_fx_material
	add_child(menu_post_fx_overlay)
	move_child(menu_post_fx_overlay, get_child_count() - 1)
	_update_menu_post_fx_visibility()

func _update_menu_post_fx_visibility() -> void:
	if is_instance_valid(background):
		background.visible = menu.visible
	if not is_instance_valid(menu_post_fx_overlay):
		return
	menu_post_fx_overlay.visible = menu.visible

func _apply_graphics_quality(quality_id: int, sync_option: bool = true) -> void:
	current_graphics_quality = clampi(quality_id, QUALITY_AUTO, QUALITY_BEAUTIFUL)
	if sync_option and graphics_option != null:
		_select_option_by_id(graphics_option, current_graphics_quality, _default_graphics_quality_id())
	if game != null:
		game.set_render_quality(current_graphics_quality)

func _default_graphics_quality_id() -> int:
	return QUALITY_AUTO

func _apply_theme(theme_id: int) -> void:
	current_theme_id = clampi(theme_id, THEME_CLASSIC, THEME_TERMINAL)
	if game != null:
		game.set_visual_theme(current_theme_id)
	_apply_menu_theme()

func _default_theme_id() -> int:
	if OS.has_feature("web"):
		return THEME_TERMINAL
	return THEME_CLASSIC

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
	tutorial_instruction.add_theme_color_override("font_color", p.label)
	tutorial_step_indicator.add_theme_color_override("font_color", p.dim)
	tutorial_dim.color = Color(p.tutorial_dim)
	_apply_button_theme(start_button, p, true, BUTTON_ROLE_ICON_TEXT_CENTER_PAIR)
	_apply_button_theme(howto_button, p, false, BUTTON_ROLE_ICON_TEXT_CENTER_PAIR)
	_apply_button_theme(tutorial_close, p, false, BUTTON_ROLE_ICON_TEXT_CENTER_PAIR)
	_apply_option_theme(grid_size_option, p)
	_apply_option_theme(depth_option, p)
	_apply_option_theme(difficulty_option, p)
	if grid_size_value_label != null:
		grid_size_value_label.add_theme_color_override("font_color", Color(p.accent))
	if difficulty_value_label != null:
		difficulty_value_label.add_theme_color_override("font_color", Color(p.accent))
	_apply_compact_button_theme(grid_size_minus_button, p)
	_apply_compact_button_theme(grid_size_plus_button, p)
	_apply_compact_button_theme(difficulty_minus_button, p)
	_apply_compact_button_theme(difficulty_plus_button, p)
	_refresh_depth_toggle_theme()
	_refresh_bar_strip_theme()
	if graphics_option != null:
		_apply_option_theme(graphics_option, p)
	if theme_option != null:
		_apply_option_theme(theme_option, p)
	_style_option_popup(grid_size_option)
	_style_option_popup(depth_option)
	_style_option_popup(difficulty_option)
	if graphics_option != null:
		_style_option_popup(graphics_option)
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

func _apply_slider_theme(slider: HSlider, value_label: Label, p: Dictionary) -> void:
	if slider == null:
		return
	slider.modulate = Color(1, 1, 1, 1)
	var rail := StyleBoxFlat.new()
	rail.bg_color = Color(p.accent).darkened(0.55)
	rail.bg_color.a = 0.62
	rail.border_width_left = 2
	rail.border_width_top = 2
	rail.border_width_right = 2
	rail.border_width_bottom = 2
	rail.border_color = Color(p.accent)
	rail.corner_radius_top_left = 5
	rail.corner_radius_top_right = 5
	rail.corner_radius_bottom_left = 5
	rail.corner_radius_bottom_right = 5
	rail.content_margin_top = 6
	rail.content_margin_bottom = 6
	var fill := rail.duplicate()
	fill.bg_color = Color(p.accent)
	fill.bg_color.a = 0.95
	slider.add_theme_stylebox_override("slider", rail)
	slider.add_theme_stylebox_override("grabber_area", fill)
	slider.add_theme_stylebox_override("grabber_area_highlight", fill)
	var grabber_icon := _make_slider_grabber_icon(Color(p.accent), Color(p.panel_border))
	slider.add_theme_icon_override("grabber", grabber_icon)
	slider.add_theme_icon_override("grabber_highlight", grabber_icon)
	slider.add_theme_icon_override("grabber_disabled", grabber_icon)
	if value_label != null:
		value_label.add_theme_color_override("font_color", Color(p.accent))

func _apply_compact_button_theme(button: Button, p: Dictionary, active: bool = false) -> void:
	if button == null:
		return
	button.add_theme_color_override("font_color", Color(p.accent))
	button.add_theme_color_override("font_pressed_color", Color(p.accent))
	button.add_theme_color_override("font_hover_color", Color(p.accent))
	var bg := Color(p.panel_bg)
	var border := Color(p.panel_border)
	var hover_bg := Color(p.hover_bg)
	if active:
		bg = Color(p.hover_bg).lightened(0.08)
		border = Color(p.accent)
		hover_bg = bg.lightened(0.05)
	_apply_compact_button_style(button, bg, border, hover_bg)

func _apply_compact_button_style(control: Control, bg: Color, border: Color, hover_bg: Color) -> void:
	var normal := StyleBoxFlat.new()
	normal.bg_color = bg
	normal.border_width_left = 2
	normal.border_width_top = 2
	normal.border_width_right = 2
	normal.border_width_bottom = 2
	normal.border_color = border
	normal.corner_radius_top_left = 14
	normal.corner_radius_top_right = 14
	normal.corner_radius_bottom_left = 14
	normal.corner_radius_bottom_right = 14
	normal.content_margin_left = 12
	normal.content_margin_top = 6
	normal.content_margin_right = 12
	normal.content_margin_bottom = 6
	var pressed := normal.duplicate()
	pressed.bg_color = hover_bg.darkened(0.08)
	var hover := normal.duplicate()
	hover.bg_color = hover_bg
	control.add_theme_stylebox_override("normal", normal)
	control.add_theme_stylebox_override("pressed", pressed)
	control.add_theme_stylebox_override("hover", hover)

func _refresh_depth_toggle_theme() -> void:
	var p := _theme_palette()
	var mode := _selected_depth_mode_option()
	_apply_compact_button_theme(depth_flat_button, p, mode == DEPTH_MODE_FLAT)
	_apply_compact_button_theme(depth_cube_button, p, mode == DEPTH_MODE_CUBE)

func _update_bar_strip(cells: Array[Panel], active_count: int) -> void:
	for i in range(cells.size()):
		var cell := cells[i]
		if cell == null:
			continue
		cell.set_meta("active", i < active_count)

func _refresh_bar_strip_theme() -> void:
	var p := _theme_palette()
	_apply_bar_cells_theme(grid_size_bar_cells, p)
	_apply_bar_cells_theme(difficulty_bar_cells, p)

func _apply_bar_cells_theme(cells: Array[Panel], p: Dictionary) -> void:
	for cell in cells:
		if cell == null:
			continue
		var active := bool(cell.get_meta("active", false))
		var style := StyleBoxFlat.new()
		style.corner_radius_top_left = 4
		style.corner_radius_top_right = 4
		style.corner_radius_bottom_left = 4
		style.corner_radius_bottom_right = 4
		style.border_width_left = 2
		style.border_width_top = 2
		style.border_width_right = 2
		style.border_width_bottom = 2
		if active:
			style.bg_color = Color(p.accent).lightened(0.1)
			style.border_color = Color(p.accent).lightened(0.18)
			cell.modulate = Color(1.0, 1.0, 1.0, 1.0)
		else:
			style.bg_color = Color(0.45, 0.48, 0.5, 0.65)
			style.border_color = Color(0.56, 0.58, 0.6, 0.75)
			cell.modulate = Color(0.92, 0.95, 0.98, 1.0)
		cell.add_theme_stylebox_override("panel", style)

func _make_slider_grabber_icon(fill: Color, border: Color) -> Texture2D:
	var size := 18
	var image := Image.create(size, size, false, Image.FORMAT_RGBA8)
	image.fill(Color(0, 0, 0, 0))
	for y in range(size):
		for x in range(size):
			var is_border := x <= 1 or y <= 1 or x >= size - 2 or y >= size - 2
			image.set_pixel(x, y, border if is_border else fill)
	return ImageTexture.create_from_image(image)

func _cache_button_base_content(button: Button, override_text: String = "") -> void:
	if not button.has_meta(BUTTON_META_BASE_ICON):
		button.set_meta(BUTTON_META_BASE_ICON, button.icon)
	if override_text != "":
		button.set_meta(BUTTON_META_BASE_TEXT, override_text)
	elif not button.has_meta(BUTTON_META_BASE_TEXT):
		button.set_meta(BUTTON_META_BASE_TEXT, button.text)

func _button_base_text(button: Button) -> String:
	return String(button.get_meta(BUTTON_META_BASE_TEXT, button.text))

func _button_base_icon(button: Button) -> Texture2D:
	var value: Variant = button.get_meta(BUTTON_META_BASE_ICON, button.icon)
	return value as Texture2D

func _ensure_button_center_pair(button: Button) -> void:
	if not is_instance_valid(button):
		return
	var root := button.get_node_or_null(BUTTON_CENTER_PAIR_ROOT) as CenterContainer
	if root != null:
		return
	root = CenterContainer.new()
	root.name = BUTTON_CENTER_PAIR_ROOT
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.focus_mode = Control.FOCUS_NONE
	var row := HBoxContainer.new()
	row.name = BUTTON_CENTER_PAIR_ROW
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.focus_mode = Control.FOCUS_NONE
	row.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	row.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 8)
	var icon_rect := TextureRect.new()
	icon_rect.name = BUTTON_CENTER_PAIR_ICON
	icon_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_rect.focus_mode = Control.FOCUS_NONE
	icon_rect.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	icon_rect.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	icon_rect.custom_minimum_size = Vector2(BUTTON_ICON_MAX_WIDTH, BUTTON_ICON_MAX_WIDTH)
	icon_rect.expand_mode = TextureRect.EXPAND_KEEP_SIZE
	icon_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	var text_label := Label.new()
	text_label.name = BUTTON_CENTER_PAIR_LABEL
	text_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	text_label.focus_mode = Control.FOCUS_NONE
	text_label.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	text_label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	text_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	text_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(icon_rect)
	row.add_child(text_label)
	root.add_child(row)
	button.add_child(root)

func _show_button_center_pair(button: Button, icon_tex: Texture2D, text_value: String, color: Color) -> void:
	_ensure_button_center_pair(button)
	var root := button.get_node_or_null(BUTTON_CENTER_PAIR_ROOT) as CenterContainer
	if root == null:
		return
	var row := root.get_node_or_null(BUTTON_CENTER_PAIR_ROW) as HBoxContainer
	var icon_rect := root.get_node_or_null("%s/%s" % [BUTTON_CENTER_PAIR_ROW, BUTTON_CENTER_PAIR_ICON]) as TextureRect
	var text_label := root.get_node_or_null("%s/%s" % [BUTTON_CENTER_PAIR_ROW, BUTTON_CENTER_PAIR_LABEL]) as Label
	if row == null or icon_rect == null or text_label == null:
		return
	row.add_theme_constant_override("separation", 8 if icon_tex != null and text_value != "" else 0)
	icon_rect.texture = icon_tex
	icon_rect.visible = icon_tex != null
	icon_rect.modulate = color
	text_label.text = text_value
	text_label.visible = text_value != ""
	text_label.add_theme_color_override("font_color", color)
	text_label.add_theme_font_size_override("font_size", button.get_theme_font_size("font_size"))
	root.visible = true

func _hide_button_center_pair(button: Button) -> void:
	var root := button.get_node_or_null(BUTTON_CENTER_PAIR_ROOT) as Control
	if root != null:
		root.visible = false

func _set_button_display_text(button: Button, text_value: String) -> void:
	if not is_instance_valid(button):
		return
	button.set_meta(BUTTON_META_BASE_TEXT, text_value)
	var text_label := button.get_node_or_null("%s/%s" % [BUTTON_CENTER_PAIR_ROOT, BUTTON_CENTER_PAIR_ROW + "/" + BUTTON_CENTER_PAIR_LABEL]) as Label
	if text_label != null:
		text_label.text = text_value
	var center_pair_root := button.get_node_or_null(BUTTON_CENTER_PAIR_ROOT) as Control
	button.text = "" if center_pair_root != null and center_pair_root.visible else text_value

func _apply_button_theme(button: Button, p: Dictionary, primary: bool, role: String = BUTTON_ROLE_TEXT_ONLY) -> void:
	var text_color: Color = Color(p.accent)
	if primary:
		text_color = Color(p.primary_text)
	button.add_theme_color_override("font_color", text_color)
	button.add_theme_color_override("font_pressed_color", text_color)
	button.add_theme_color_override("font_hover_color", text_color)
	_apply_button_icon_style(button, text_color, role)
	if primary:
		_apply_button_style(button, Color(p.primary_bg), Color(p.primary_border), Color(p.primary_hover), role)
	else:
		_apply_button_style(button, Color(p.panel_bg), Color(p.panel_border), Color(p.hover_bg), role)

func _apply_button_icon_style(button: Button, icon_color: Color, role: String) -> void:
	_cache_button_base_content(button)
	button.alignment = HORIZONTAL_ALIGNMENT_CENTER
	button.expand_icon = false
	button.vertical_icon_alignment = VERTICAL_ALIGNMENT_CENTER
	var base_icon := _button_base_icon(button)
	var base_text := _button_base_text(button)
	button.add_theme_color_override("icon_normal_color", icon_color)
	button.add_theme_color_override("icon_hover_color", icon_color)
	button.add_theme_color_override("icon_pressed_color", icon_color)
	button.add_theme_color_override("icon_focus_color", icon_color)
	button.add_theme_color_override("icon_disabled_color", icon_color.darkened(0.35))
	button.add_theme_constant_override("icon_max_width", BUTTON_ICON_MAX_WIDTH)
	match role:
		BUTTON_ROLE_ICON_ONLY:
			_hide_button_center_pair(button)
			button.icon = base_icon
			button.text = ""
			button.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
		BUTTON_ROLE_ICON_TEXT_CENTER_PAIR:
			button.icon = null
			button.text = ""
			button.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
			_show_button_center_pair(button, base_icon, base_text, icon_color)
		BUTTON_ROLE_ICON_TEXT:
			_hide_button_center_pair(button)
			button.icon = base_icon
			button.text = base_text
			button.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT
		_:
			_hide_button_center_pair(button)
			button.icon = base_icon
			button.text = base_text
			button.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT

func _apply_button_style(control: Control, bg: Color, border: Color, hover_bg: Color, role: String = BUTTON_ROLE_TEXT_ONLY) -> void:
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
	var content_margin_left := 18
	var content_margin_right := 24
	match role:
		BUTTON_ROLE_ICON_ONLY:
			content_margin_left = 12
			content_margin_right = 12
		BUTTON_ROLE_ICON_TEXT_CENTER_PAIR:
			content_margin_left = 12
			content_margin_right = 12
		BUTTON_ROLE_ICON_TEXT:
			content_margin_left = 14
			content_margin_right = 18
		_:
			pass
	normal.content_margin_left = content_margin_left
	normal.content_margin_top = 8
	normal.content_margin_right = content_margin_right
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
	tutorial_mode_active = false
	tutorial_rotation_seen = false
	tutorial_prev_rotating = false
	tutorial_shown = true
	_save_settings(
		_selected_grid_size(),
		_selected_depth_mode(),
		_selected_difficulty()
	)
	menu.visible = true
	game.visible = false
	game.set_hud_visible(false)
	tutorial_overlay.visible = false
	tutorial_complete = false
	_update_menu_post_fx_visibility()

func _selected_grid_size() -> int:
	return _selected_grid_size_option()

func _selected_grid_size_option() -> int:
	return grid_size_option.get_item_id(grid_size_option.selected)

func _selected_depth_mode() -> int:
	return _selected_depth_mode_option()

func _selected_depth_mode_option() -> int:
	return depth_option.get_item_id(depth_option.selected)

func _selected_difficulty() -> int:
	return _selected_difficulty_option()

func _selected_difficulty_option() -> int:
	return difficulty_option.get_item_id(difficulty_option.selected)

func _effective_depth(size: int, depth_mode: int) -> int:
	return 1 if depth_mode == DEPTH_MODE_FLAT else size

func _rebuild_depth_options(preferred_mode: int = DEPTH_MODE_CUBE) -> void:
	depth_option.clear()
	depth_option.add_item("[] Flat", DEPTH_MODE_FLAT)
	depth_option.add_item("[#] 3D", DEPTH_MODE_CUBE)
	_select_option_by_id(depth_option, preferred_mode, DEPTH_MODE_CUBE)

func _on_grid_size_option_selected(_index: int) -> void:
	var mode := _selected_depth_mode_option()
	if mode != DEPTH_MODE_FLAT and mode != DEPTH_MODE_CUBE:
		mode = DEPTH_MODE_CUBE
	_rebuild_depth_options(mode)
	_sync_sliders_from_options()

func _apply_tutorial_step() -> void:
	if tutorial_complete:
		tutorial_instruction.text = "Done. You are ready."
		tutorial_step_indicator.text = "2/2"
		_set_button_display_text(tutorial_close, "Got it")
		return
	if tutorial_step == TUTORIAL_STEP_BASIC:
		tutorial_instruction.text = "Connect one neighboring pair."
		tutorial_step_indicator.text = "1/2"
		_set_button_display_text(tutorial_close, "Skip")
	else:
		tutorial_instruction.text = "Rotate the 4x4x4 board (drag or WASD/arrows)."
		tutorial_step_indicator.text = "2/2"
		_set_button_display_text(tutorial_close, "Skip")

func _tutorial_edge_count() -> int:
	if game == null or game.model == null:
		return 0
	return game.model.placed_edges.size()

func _tutorial_is_rotating() -> bool:
	if game == null or game.grid_view == null:
		return false
	return game.grid_view.is_rotating()

func _start_tutorial_rotation_step() -> void:
	tutorial_step = TUTORIAL_STEP_ROTATE
	game.start_new_game(TUTORIAL_GRID_SIZE, TUTORIAL_ROTATION_DEPTH, TUTORIAL_DIFFICULTY)
	game.set_hud_visible(false)
	tutorial_prev_rotating = _tutorial_is_rotating()
	_apply_tutorial_step()

func _update_tutorial_progress() -> void:
	if not tutorial_mode_active or tutorial_complete:
		return
	if tutorial_step == TUTORIAL_STEP_BASIC:
		if _tutorial_edge_count() > tutorial_start_edge_count:
			_start_tutorial_rotation_step()
		return
	if tutorial_step == TUTORIAL_STEP_ROTATE:
		var rotating_now := _tutorial_is_rotating()
		if rotating_now and not tutorial_prev_rotating:
			tutorial_rotation_seen = true
			tutorial_complete = true
			_apply_tutorial_step()
			return
		tutorial_prev_rotating = rotating_now
