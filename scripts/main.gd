extends Control

const SETTINGS_PATH := "user://settings.cfg"
const VERSION_PATH := "res://version.txt"
const GAME_VERSION := "0.1.0"

@onready var menu: Control = $Menu
@onready var game: GameController = $Game
@onready var version_label: Label = $Menu/VersionLabel

@onready var grid_size_option: OptionButton = $Menu/MenuMargin/VBox/GridSizeRow/GridSizeOption
@onready var depth_option: OptionButton = $Menu/MenuMargin/VBox/DepthRow/DepthOption
@onready var difficulty_option: OptionButton = $Menu/MenuMargin/VBox/DifficultyRow/DifficultyOption
@onready var start_button: Button = $Menu/MenuMargin/VBox/StartButton

func _ready() -> void:
	_setup_options()
	_load_settings()
	_update_version_label()
	start_button.pressed.connect(_on_start_pressed)
	game.back_requested.connect(_on_game_back)

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

	depth_option.clear()
	for depth in range(1, 5):
		depth_option.add_item("%d layer%s" % [depth, "" if depth == 1 else "s"], depth)

	difficulty_option.clear()
	difficulty_option.add_item("Easy", 0)
	difficulty_option.add_item("Normal", 1)
	difficulty_option.add_item("Hard", 2)

func _load_settings() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SETTINGS_PATH) != OK:
		_apply_defaults()
		return

	var size := int(cfg.get_value("game", "grid_size", 5))
	var depth := int(cfg.get_value("game", "grid_depth", 2))
	var difficulty := int(cfg.get_value("game", "difficulty", 1))

	_select_option_by_id(grid_size_option, size, 5)
	_select_option_by_id(depth_option, depth, 2)
	_select_option_by_id(difficulty_option, difficulty, 1)

func _save_settings(size: int, depth: int, difficulty: int) -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("game", "grid_size", size)
	cfg.set_value("game", "grid_depth", depth)
	cfg.set_value("game", "difficulty", difficulty)
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
	game.start_new_game(size, depth, difficulty)

	menu.visible = false
	game.visible = true

func _on_game_back() -> void:
	menu.visible = true
	game.visible = false
